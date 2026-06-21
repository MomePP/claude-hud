import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { getHudPluginDir } from './claude-config-dir.js';

const execFileAsync = promisify(execFile);

export interface LineDiff {
  added: number;
  deleted: number;
}

export interface TrackedFile {
  basename: string;
  fullPath: string;
  type: 'modified' | 'added' | 'deleted';
  lineDiff?: LineDiff;
}

export interface FileStats {
  modified: number;
  added: number;
  deleted: number;
  untracked: number;
  trackedFiles: TrackedFile[];
}

export interface GitStatus {
  branch: string;
  isDirty: boolean;
  ahead: number;
  behind: number;
  fileStats?: FileStats;
  lineDiff?: LineDiff;
  branchUrl?: string;
}

interface SentinelState { mtimeMs: number; size: number }

interface GitCacheKey {
  cwd: string;
  sentinels: Record<string, SentinelState | null>;
}

interface GitCacheFile {
  key: GitCacheKey;
  data: GitStatus | null;
  computedAt?: number;
}

// Max-age backstop for the sentinel cache. Unstaged working-tree edits/deletes of tracked
// files (e.g. an in-place editor write or `> file`) change isDirty/fileStats but touch no
// `.git/` sentinel, so the sentinel check alone would serve a stale clean/dirty state forever.
// Bounding cache age to a few seconds keeps isDirty correct within that window. At the ~300ms
// statusline cadence this is roughly a 6x reduction in git spawns vs. uncached, while still
// reflecting a freshly-edited file quickly.
const GIT_CACHE_MAX_AGE_MS = 2000;

export async function getGitBranch(cwd?: string): Promise<string | null> {
  if (!cwd) return null;

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd, timeout: 1000, encoding: 'utf8', windowsHide: true }
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

// Up to 5 git child processes per uncached call. Cache by mtime sentinels on
// the in-tree `.git/` files that change when relevant state changes (branch
// switches, stages, commits, fetches, remote edits). Cached `null` is not
// stored — non-git dirs short-circuit on the fs.existsSync check below.
export async function getGitStatus(cwd?: string): Promise<GitStatus | null> {
  if (!cwd) return null;

  const gitDir = path.join(cwd, '.git');
  const gitHeadPath = path.join(gitDir, 'HEAD');

  // Fast-path: not a regular git repo (no .git/HEAD). Could still be a worktree
  // (.git is a file) or non-git dir. Skip the sentinel cache and fall back to
  // the uncached path — the launcher hits this rarely.
  if (!fs.existsSync(gitHeadPath)) {
    return computeGitStatus(cwd);
  }

  const sentinelPaths = buildGitSentinelPaths(cwd, gitDir);
  const cached = readGitCache(cwd);
  const currentSentinels = statSentinels(sentinelPaths);

  if (
    cached
    && isWithinMaxAge(cached.computedAt)
    && sentinelsMatch(cached.key.sentinels, currentSentinels)
  ) {
    return cached.data;
  }

  const result = await computeGitStatus(cwd);
  writeGitCache({ cwd, sentinels: currentSentinels }, result);
  return result;
}

async function computeGitStatus(cwd: string): Promise<GitStatus | null> {
  try {
    // Stage A — run 4 git commands in parallel. None of these depend on each
    // other's output, so concurrent spawn cuts wall time from ~5×8ms to ~max(8ms).
    const [branchResult, statusResult, revListResult, remoteResult] = await Promise.allSettled([
      execFileAsync(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd, timeout: 1000, encoding: 'utf8', windowsHide: true }
      ),
      execFileAsync(
        'git',
        ['-c', 'core.quotePath=false', '--no-optional-locks', 'status', '--porcelain'],
        { cwd, timeout: 1000, encoding: 'utf8', windowsHide: true }
      ),
      execFileAsync(
        'git',
        ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'],
        { cwd, timeout: 1000, encoding: 'utf8', windowsHide: true }
      ),
      execFileAsync(
        'git',
        ['remote', 'get-url', 'origin'],
        { cwd, timeout: 1000, encoding: 'utf8', windowsHide: true }
      ),
    ]);

    if (branchResult.status !== 'fulfilled') return null;
    const branch = branchResult.value.stdout.trim();
    if (!branch) return null;

    let isDirty = false;
    let fileStats: FileStats | undefined;
    if (statusResult.status === 'fulfilled') {
      const trimmed = statusResult.value.stdout.trim();
      isDirty = trimmed.length > 0;
      if (isDirty) fileStats = parseFileStats(trimmed);
    }

    // Stage B — numstat only when dirty. Must run after status because the
    // tracked-paths set comes from porcelain output.
    let lineDiff: LineDiff | undefined;
    if (isDirty) {
      try {
        const { stdout: numstatOut } = await execFileAsync(
          'git',
          ['-c', 'core.quotePath=false', 'diff', '--numstat', 'HEAD'],
          { cwd, timeout: 2000, encoding: 'utf8', windowsHide: true }
        );
        const trackedPaths = new Set(fileStats?.trackedFiles.map((file) => file.fullPath) ?? []);
        const { totalDiff, perFileDiff } = parseNumstat(numstatOut, trackedPaths);
        lineDiff = totalDiff;
        if (fileStats) {
          applyLineDiffsToFiles(fileStats.trackedFiles, perFileDiff);
        }
      } catch {
        // Ignore errors
      }
    }

    let ahead = 0;
    let behind = 0;
    if (revListResult.status === 'fulfilled') {
      const parts = revListResult.value.stdout.trim().split(/\s+/);
      if (parts.length === 2) {
        behind = parseInt(parts[0], 10) || 0;
        ahead = parseInt(parts[1], 10) || 0;
      }
    }

    let branchUrl: string | undefined;
    if (remoteResult.status === 'fulfilled') {
      const remote = remoteResult.value.stdout.trim();
      const httpsBase = remote
        .replace(/^git@github\.com:/, 'https://github.com/')
        .replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/')
        .replace(/\.git$/, '');
      if (httpsBase.startsWith('https://github.com/')) {
        branchUrl = `${httpsBase}/tree/${encodeURIComponent(branch)}`;
      }
    }

    return { branch, isDirty, ahead, behind, fileStats, lineDiff, branchUrl };
  } catch {
    return null;
  }
}

/**
 * Parse git status --porcelain output and count file stats (Starship-compatible format)
 * Status codes: M=modified, A=added, D=deleted, ??=untracked
 */
function parseFileStats(porcelainOutput: string): FileStats {
  const stats: FileStats = { modified: 0, added: 0, deleted: 0, untracked: 0, trackedFiles: [] };
  const lines = porcelainOutput.split('\n').filter(Boolean);

  for (const line of lines) {
    if (line.length < 2) continue;

    const index = line[0];    // staged status
    const worktree = line[1]; // unstaged status

    if (line.startsWith('??')) {
      stats.untracked++;
    } else if (index === 'A') {
      stats.added++;
      const fullPath = parsePorcelainPath(line.slice(2).trimStart());
      stats.trackedFiles.push({ basename: fullPath.split('/').pop() ?? fullPath, fullPath, type: 'added' });
    } else if (index === 'D' || worktree === 'D') {
      stats.deleted++;
      const fullPath = parsePorcelainPath(line.slice(2).trimStart());
      stats.trackedFiles.push({ basename: fullPath.split('/').pop() ?? fullPath, fullPath, type: 'deleted' });
    } else if (index === 'M' || worktree === 'M' || index === 'R' || index === 'C') {
      // M=modified, R=renamed (counts as modified), C=copied (counts as modified)
      stats.modified++;
      // For renames, git porcelain shows "old -> new"; take the destination path
      const fullPath = parsePorcelainPath(line.slice(2).trimStart().split(' -> ').pop() ?? line.slice(2).trimStart());
      stats.trackedFiles.push({ basename: fullPath.split('/').pop() ?? fullPath, fullPath, type: 'modified' });
    }
  }

  return stats;
}

function parsePorcelainPath(pathField: string): string {
  if (pathField.startsWith('"') && pathField.endsWith('"')) {
    try {
      return JSON.parse(pathField);
    } catch {
      return pathField.slice(1, -1);
    }
  }

  return pathField;
}

/**
 * Extract the destination path from a numstat path field.
 *
 * For renames, `git diff --numstat` emits the path as `old => new`
 * (sometimes with a shared directory prefix like `pkg/{old.ts => new.ts}`).
 * `git status --porcelain` reports the renamed file under its destination
 * only, so we key `perFileDiff` by the destination to make lookups match.
 */
function extractNumstatDestination(filePath: string): string {
  const braceMatch = filePath.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
  if (braceMatch) {
    const [, prefix, , dest, suffix] = braceMatch;
    return `${prefix}${dest}${suffix}`.replace(/\/{2,}/g, '/');
  }

  const arrowIndex = filePath.indexOf(' => ');
  if (arrowIndex !== -1) {
    return filePath.slice(arrowIndex + 4);
  }

  return filePath;
}

function resolveNumstatPath(filePath: string, trackedPaths: Set<string>): string {
  if (trackedPaths.has(filePath)) {
    return filePath;
  }

  const destinationPath = extractNumstatDestination(filePath);
  if (destinationPath !== filePath && trackedPaths.has(destinationPath)) {
    return destinationPath;
  }

  return filePath;
}

/**
 * Parse `git diff --numstat HEAD` output.
 * Returns total line diff and a map of fullPath -> LineDiff.
 */
function parseNumstat(numstatOutput: string, trackedPaths: Set<string>): { totalDiff: LineDiff; perFileDiff: Map<string, LineDiff> } {
  const totalDiff: LineDiff = { added: 0, deleted: 0 };
  const perFileDiff = new Map<string, LineDiff>();

  for (const line of numstatOutput.trim().split('\n').filter(Boolean)) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const added = parseInt(parts[0], 10);
    const deleted = parseInt(parts[1], 10);
    const filePath = resolveNumstatPath(parts[2], trackedPaths);
    if (Number.isNaN(added) || Number.isNaN(deleted)) continue; // binary file
    totalDiff.added += added;
    totalDiff.deleted += deleted;
    perFileDiff.set(filePath, { added, deleted });
  }

  return { totalDiff, perFileDiff };
}

function applyLineDiffsToFiles(files: TrackedFile[], perFileDiff: Map<string, LineDiff>): void {
  for (const file of files) {
    const diff = perFileDiff.get(file.fullPath);
    if (diff) {
      file.lineDiff = diff;
    }
  }
}

// --- Cache ---

function buildGitSentinelPaths(cwd: string, gitDir: string): string[] {
  const paths = [
    path.join(gitDir, 'HEAD'),         // branch switches
    path.join(gitDir, 'index'),        // stage operations
    path.join(gitDir, 'FETCH_HEAD'),   // fetches (ahead/behind)
    path.join(gitDir, 'ORIG_HEAD'),    // merge/rebase in progress
    path.join(gitDir, 'MERGE_HEAD'),   // merge in progress
    path.join(gitDir, 'config'),       // remote URL changes
    path.join(gitDir, 'packed-refs'),  // pushes/repacks against packed refs (ahead/behind)
    cwd,                                // top-level untracked-file adds/removes
  ];

  // ahead/behind (`git rev-list @{upstream}...HEAD`) depends on two refs that the sentinels
  // above do not track when they move:
  //   - the LOCAL branch ref (refs/heads/<branch>) — `git commit` touches `index`, but
  //     `git update-ref`/`git branch -f`/another worktree move it with no index change.
  //   - the UPSTREAM remote-tracking ref (refs/remotes/<remote>/<branch>) — a `git push`
  //     advances it and touches NONE of the sentinels above (fetch updates FETCH_HEAD;
  //     push does not).
  // Watch both loose ref files; packed-refs above covers the case where either is packed.
  for (const refPath of resolveRefSentinelPaths(gitDir)) {
    paths.push(refPath);
  }

  return paths;
}

// Resolve the loose-ref paths whose movement affects ahead/behind: the current branch's
// local ref and its configured upstream ref, derived from HEAD + config. Returns [] for
// detached HEAD. A ref file may not exist (the ref is packed) — statSentinel records that
// as a `null` sentinel, and a later op that materializes the loose ref flips null→value,
// busting the cache.
function resolveRefSentinelPaths(gitDir: string): string[] {
  try {
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    const headMatch = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    if (!headMatch) return []; // detached HEAD — no symbolic branch
    const branch = headMatch[1];

    const result = [path.join(gitDir, 'refs', 'heads', ...branch.split('/'))];

    const config = fs.readFileSync(path.join(gitDir, 'config'), 'utf8');
    const upstream = parseBranchUpstream(config, branch);
    if (upstream) {
      const refSegments = upstream.merge.replace(/^refs\/heads\//, '').split('/');
      result.push(path.join(gitDir, 'refs', 'remotes', upstream.remote, ...refSegments));
    }

    return result;
  } catch {
    return [];
  }
}

// Extract `remote` and `merge` from the `[branch "<name>"]` section of a git config.
// Returns null when the branch has no upstream configured.
function parseBranchUpstream(config: string, branch: string): { remote: string; merge: string } | null {
  const lines = config.split('\n');
  let inSection = false;
  let remote: string | undefined;
  let merge: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      // Section header — `[branch "name"]`. Match the exact branch (quoted name).
      inSection = sectionMatch[1].trim() === `branch "${branch}"`;
      continue;
    }
    if (!inSection) continue;

    const remoteMatch = line.match(/^remote\s*=\s*(.+)$/);
    if (remoteMatch) remote = remoteMatch[1].trim();
    const mergeMatch = line.match(/^merge\s*=\s*(.+)$/);
    if (mergeMatch) merge = mergeMatch[1].trim();
  }

  if (!remote || !merge) return null;
  return { remote, merge };
}

function statSentinel(filePath: string): SentinelState | null {
  try {
    const stat = fs.statSync(filePath);
    return { mtimeMs: stat.mtimeMs, size: stat.size };
  } catch {
    return null;
  }
}

function statSentinels(paths: string[]): Record<string, SentinelState | null> {
  const result: Record<string, SentinelState | null> = {};
  for (const p of paths) {
    result[p] = statSentinel(p);
  }
  return result;
}

function sentinelsMatch(a: Record<string, SentinelState | null>, b: Record<string, SentinelState | null>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    const sa = a[key];
    const sb = b[key];
    if (sa === null && sb === null) continue;
    if (sa === null || sb === null) return false;
    if (sa.mtimeMs !== sb.mtimeMs || sa.size !== sb.size) return false;
  }
  return true;
}

function getGitCachePath(cwd: string): string {
  const homeDir = os.homedir();
  const hash = createHash('sha256').update(cwd).digest('hex').slice(0, 16);
  return path.join(getHudPluginDir(homeDir), 'git-cache', `${hash}.json`);
}

function isGitStatus(value: unknown): value is GitStatus {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<GitStatus>;
  return (
    typeof v.branch === 'string'
    && typeof v.isDirty === 'boolean'
    && typeof v.ahead === 'number'
    && typeof v.behind === 'number'
  );
}

function readGitCache(cwd: string): GitCacheFile | null {
  try {
    const raw = fs.readFileSync(getGitCachePath(cwd), 'utf8');
    const parsed = JSON.parse(raw) as GitCacheFile;
    if (parsed.key?.cwd !== cwd) return null;
    if (parsed.data !== null && !isGitStatus(parsed.data)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeGitCache(key: GitCacheKey, data: GitStatus | null): void {
  try {
    const cachePath = getGitCachePath(key.cwd);
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const entry: GitCacheFile = { key, data, computedAt: Date.now() };
    fs.writeFileSync(cachePath, JSON.stringify(entry), 'utf8');
  } catch {
    // Cache write failures are non-fatal.
  }
}

// A cache entry is fresh only within GIT_CACHE_MAX_AGE_MS of when it was computed. A missing
// `computedAt` (older cache format) or a clock that has gone backwards counts as stale, so we
// recompute rather than trust an unbounded-age entry.
function isWithinMaxAge(computedAt: number | undefined): boolean {
  if (typeof computedAt !== 'number') return false;
  const age = Date.now() - computedAt;
  return age >= 0 && age < GIT_CACHE_MAX_AGE_MS;
}
