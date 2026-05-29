import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { getHudPluginDir } from './claude-config-dir.js';
const execFileAsync = promisify(execFile);
export async function getGitBranch(cwd) {
    if (!cwd)
        return null;
    try {
        const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, timeout: 1000, encoding: 'utf8', windowsHide: true });
        return stdout.trim() || null;
    }
    catch {
        return null;
    }
}
// Up to 5 git child processes per uncached call. Cache by mtime sentinels on
// the in-tree `.git/` files that change when relevant state changes (branch
// switches, stages, commits, fetches, remote edits). Cached `null` is not
// stored — non-git dirs short-circuit on the fs.existsSync check below.
export async function getGitStatus(cwd) {
    if (!cwd)
        return null;
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
    if (cached && sentinelsMatch(cached.key.sentinels, currentSentinels)) {
        return cached.data;
    }
    const result = await computeGitStatus(cwd);
    writeGitCache({ cwd, sentinels: currentSentinels }, result);
    return result;
}
async function computeGitStatus(cwd) {
    try {
        // Stage A — run 4 git commands in parallel. None of these depend on each
        // other's output, so concurrent spawn cuts wall time from ~5×8ms to ~max(8ms).
        const [branchResult, statusResult, revListResult, remoteResult] = await Promise.allSettled([
            execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, timeout: 1000, encoding: 'utf8', windowsHide: true }),
            execFileAsync('git', ['-c', 'core.quotePath=false', '--no-optional-locks', 'status', '--porcelain'], { cwd, timeout: 1000, encoding: 'utf8', windowsHide: true }),
            execFileAsync('git', ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], { cwd, timeout: 1000, encoding: 'utf8', windowsHide: true }),
            execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd, timeout: 1000, encoding: 'utf8', windowsHide: true }),
        ]);
        if (branchResult.status !== 'fulfilled')
            return null;
        const branch = branchResult.value.stdout.trim();
        if (!branch)
            return null;
        let isDirty = false;
        let fileStats;
        if (statusResult.status === 'fulfilled') {
            const trimmed = statusResult.value.stdout.trim();
            isDirty = trimmed.length > 0;
            if (isDirty)
                fileStats = parseFileStats(trimmed);
        }
        // Stage B — numstat only when dirty. Must run after status because the
        // tracked-paths set comes from porcelain output.
        let lineDiff;
        if (isDirty) {
            try {
                const { stdout: numstatOut } = await execFileAsync('git', ['-c', 'core.quotePath=false', 'diff', '--numstat', 'HEAD'], { cwd, timeout: 2000, encoding: 'utf8', windowsHide: true });
                const trackedPaths = new Set(fileStats?.trackedFiles.map((file) => file.fullPath) ?? []);
                const { totalDiff, perFileDiff } = parseNumstat(numstatOut, trackedPaths);
                lineDiff = totalDiff;
                if (fileStats) {
                    applyLineDiffsToFiles(fileStats.trackedFiles, perFileDiff);
                }
            }
            catch {
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
        let branchUrl;
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
    }
    catch {
        return null;
    }
}
/**
 * Parse git status --porcelain output and count file stats (Starship-compatible format)
 * Status codes: M=modified, A=added, D=deleted, ??=untracked
 */
function parseFileStats(porcelainOutput) {
    const stats = { modified: 0, added: 0, deleted: 0, untracked: 0, trackedFiles: [] };
    const lines = porcelainOutput.split('\n').filter(Boolean);
    for (const line of lines) {
        if (line.length < 2)
            continue;
        const index = line[0]; // staged status
        const worktree = line[1]; // unstaged status
        if (line.startsWith('??')) {
            stats.untracked++;
        }
        else if (index === 'A') {
            stats.added++;
            const fullPath = parsePorcelainPath(line.slice(2).trimStart());
            stats.trackedFiles.push({ basename: fullPath.split('/').pop() ?? fullPath, fullPath, type: 'added' });
        }
        else if (index === 'D' || worktree === 'D') {
            stats.deleted++;
            const fullPath = parsePorcelainPath(line.slice(2).trimStart());
            stats.trackedFiles.push({ basename: fullPath.split('/').pop() ?? fullPath, fullPath, type: 'deleted' });
        }
        else if (index === 'M' || worktree === 'M' || index === 'R' || index === 'C') {
            // M=modified, R=renamed (counts as modified), C=copied (counts as modified)
            stats.modified++;
            // For renames, git porcelain shows "old -> new"; take the destination path
            const fullPath = parsePorcelainPath(line.slice(2).trimStart().split(' -> ').pop() ?? line.slice(2).trimStart());
            stats.trackedFiles.push({ basename: fullPath.split('/').pop() ?? fullPath, fullPath, type: 'modified' });
        }
    }
    return stats;
}
function parsePorcelainPath(pathField) {
    if (pathField.startsWith('"') && pathField.endsWith('"')) {
        try {
            return JSON.parse(pathField);
        }
        catch {
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
function extractNumstatDestination(filePath) {
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
function resolveNumstatPath(filePath, trackedPaths) {
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
function parseNumstat(numstatOutput, trackedPaths) {
    const totalDiff = { added: 0, deleted: 0 };
    const perFileDiff = new Map();
    for (const line of numstatOutput.trim().split('\n').filter(Boolean)) {
        const parts = line.split('\t');
        if (parts.length < 3)
            continue;
        const added = parseInt(parts[0], 10);
        const deleted = parseInt(parts[1], 10);
        const filePath = resolveNumstatPath(parts[2], trackedPaths);
        if (Number.isNaN(added) || Number.isNaN(deleted))
            continue; // binary file
        totalDiff.added += added;
        totalDiff.deleted += deleted;
        perFileDiff.set(filePath, { added, deleted });
    }
    return { totalDiff, perFileDiff };
}
function applyLineDiffsToFiles(files, perFileDiff) {
    for (const file of files) {
        const diff = perFileDiff.get(file.fullPath);
        if (diff) {
            file.lineDiff = diff;
        }
    }
}
// --- Cache ---
function buildGitSentinelPaths(cwd, gitDir) {
    return [
        path.join(gitDir, 'HEAD'), // branch switches
        path.join(gitDir, 'index'), // stage operations
        path.join(gitDir, 'FETCH_HEAD'), // fetches (ahead/behind)
        path.join(gitDir, 'ORIG_HEAD'), // merge/rebase in progress
        path.join(gitDir, 'MERGE_HEAD'), // merge in progress
        path.join(gitDir, 'config'), // remote URL changes
        cwd, // top-level untracked-file adds/removes
    ];
}
function statSentinel(filePath) {
    try {
        const stat = fs.statSync(filePath);
        return { mtimeMs: stat.mtimeMs, size: stat.size };
    }
    catch {
        return null;
    }
}
function statSentinels(paths) {
    const result = {};
    for (const p of paths) {
        result[p] = statSentinel(p);
    }
    return result;
}
function sentinelsMatch(a, b) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length)
        return false;
    for (const key of keysA) {
        const sa = a[key];
        const sb = b[key];
        if (sa === null && sb === null)
            continue;
        if (sa === null || sb === null)
            return false;
        if (sa.mtimeMs !== sb.mtimeMs || sa.size !== sb.size)
            return false;
    }
    return true;
}
function getGitCachePath(cwd) {
    const homeDir = os.homedir();
    const hash = createHash('sha256').update(cwd).digest('hex').slice(0, 16);
    return path.join(getHudPluginDir(homeDir), 'git-cache', `${hash}.json`);
}
function isGitStatus(value) {
    if (value === null)
        return true;
    if (!value || typeof value !== 'object')
        return false;
    const v = value;
    return (typeof v.branch === 'string'
        && typeof v.isDirty === 'boolean'
        && typeof v.ahead === 'number'
        && typeof v.behind === 'number');
}
function readGitCache(cwd) {
    try {
        const raw = fs.readFileSync(getGitCachePath(cwd), 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.key?.cwd !== cwd)
            return null;
        if (parsed.data !== null && !isGitStatus(parsed.data))
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
function writeGitCache(key, data) {
    try {
        const cachePath = getGitCachePath(key.cwd);
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify({ key, data }), 'utf8');
    }
    catch {
        // Cache write failures are non-fatal.
    }
}
//# sourceMappingURL=git.js.map