import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getGitBranch, getGitStatus } from '../dist/git.js';

test('getGitBranch returns null when cwd is undefined', async () => {
  const result = await getGitBranch(undefined);
  assert.equal(result, null);
});

test('getGitBranch returns null for non-git directory', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-nogit-'));
  try {
    const result = await getGitBranch(dir);
    assert.equal(result, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getGitBranch returns branch name for git directory', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir, stdio: 'ignore' });

    const result = await getGitBranch(dir);
    assert.ok(result === 'main' || result === 'master', `Expected main or master, got ${result}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getGitBranch returns custom branch name', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['checkout', '-b', 'feature/test-branch'], { cwd: dir, stdio: 'ignore' });

    const result = await getGitBranch(dir);
    assert.equal(result, 'feature/test-branch');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// getGitStatus tests
test('getGitStatus returns null when cwd is undefined', async () => {
  const result = await getGitStatus(undefined);
  assert.equal(result, null);
});

test('getGitStatus returns null for non-git directory', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-nogit-'));
  try {
    const result = await getGitStatus(dir);
    assert.equal(result, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getGitStatus returns clean state for clean repo', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir, stdio: 'ignore' });

    const result = await getGitStatus(dir);
    assert.ok(result?.branch === 'main' || result?.branch === 'master');
    assert.equal(result?.isDirty, false);
    assert.equal(result?.ahead, 0);
    assert.equal(result?.behind, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getGitStatus detects dirty state', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir, stdio: 'ignore' });

    // Create uncommitted file
    await writeFile(path.join(dir, 'dirty.txt'), 'uncommitted change');

    const result = await getGitStatus(dir);
    assert.equal(result?.isDirty, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// fileStats tests
test('getGitStatus returns undefined fileStats for clean repo', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir, stdio: 'ignore' });

    const result = await getGitStatus(dir);
    assert.equal(result?.fileStats, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getGitStatus counts untracked files', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir, stdio: 'ignore' });

    // Create untracked files
    await writeFile(path.join(dir, 'untracked1.txt'), 'content');
    await writeFile(path.join(dir, 'untracked2.txt'), 'content');

    const result = await getGitStatus(dir);
    assert.equal(result?.fileStats?.untracked, 2);
    assert.equal(result?.fileStats?.modified, 0);
    assert.equal(result?.fileStats?.added, 0);
    assert.equal(result?.fileStats?.deleted, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getGitStatus counts modified files', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });

    // Create and commit a file
    await writeFile(path.join(dir, 'file.txt'), 'original');
    execFileSync('git', ['add', 'file.txt'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'add file'], { cwd: dir, stdio: 'ignore' });

    // Modify the file
    await writeFile(path.join(dir, 'file.txt'), 'modified');

    const result = await getGitStatus(dir);
    assert.equal(result?.fileStats?.modified, 1);
    assert.equal(result?.fileStats?.untracked, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getGitStatus returns UTF-8 filenames when core.quotePath is true', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'core.quotePath', 'true'], { cwd: dir, stdio: 'ignore' });

    const fileName = '日本語.txt';
    await writeFile(path.join(dir, fileName), 'original\n');
    execFileSync('git', ['add', fileName], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'add utf8 file'], { cwd: dir, stdio: 'ignore' });

    await writeFile(path.join(dir, fileName), 'modified\n');
    const quotedStatus = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
    assert.match(quotedStatus, /\\[0-7]{3}/, `expected git to octal-escape path, got ${quotedStatus}`);
    assert.equal(quotedStatus.includes(fileName), false);

    const result = await getGitStatus(dir);
    const tracked = result?.fileStats?.trackedFiles ?? [];

    assert.equal(result?.fileStats?.modified, 1);
    assert.deepEqual(
      tracked.map((file) => ({ basename: file.basename, fullPath: file.fullPath, lineDiff: file.lineDiff })),
      [{ basename: fileName, fullPath: fileName, lineDiff: { added: 1, deleted: 1 } }]
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getGitStatus counts staged added files', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir, stdio: 'ignore' });

    // Create and stage a new file
    await writeFile(path.join(dir, 'newfile.txt'), 'content');
    execFileSync('git', ['add', 'newfile.txt'], { cwd: dir, stdio: 'ignore' });

    const result = await getGitStatus(dir);
    assert.equal(result?.fileStats?.added, 1);
    assert.equal(result?.fileStats?.untracked, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getGitStatus counts deleted files', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });

    // Create, commit, then delete a file
    await writeFile(path.join(dir, 'todelete.txt'), 'content');
    execFileSync('git', ['add', 'todelete.txt'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'add file'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['rm', 'todelete.txt'], { cwd: dir, stdio: 'ignore' });

    const result = await getGitStatus(dir);
    assert.equal(result?.fileStats?.deleted, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getGitStatus includes total and per-file line diffs for modified files', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });

    await writeFile(path.join(dir, 'file.txt'), 'one\ntwo\nthree\n');
    execFileSync('git', ['add', 'file.txt'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'add file'], { cwd: dir, stdio: 'ignore' });

    await writeFile(path.join(dir, 'file.txt'), 'one\nthree\nfour\n');

    const result = await getGitStatus(dir);
    assert.deepEqual(result?.lineDiff, { added: 1, deleted: 1 });
    assert.deepEqual(result?.fileStats?.trackedFiles[0]?.lineDiff, { added: 1, deleted: 1 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getGitStatus attaches line diffs to renamed files', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, stdio: 'ignore' });

    await writeFile(path.join(dir, 'old_name.txt'), 'one\ntwo\nthree\n');
    execFileSync('git', ['add', 'old_name.txt'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'add old_name'], { cwd: dir, stdio: 'ignore' });

    execFileSync('git', ['mv', 'old_name.txt', 'new_name.txt'], { cwd: dir, stdio: 'ignore' });
    await writeFile(path.join(dir, 'new_name.txt'), 'one\ntwo\nthree\nfour\nfive\n');
    execFileSync('git', ['add', 'new_name.txt'], { cwd: dir, stdio: 'ignore' });

    const result = await getGitStatus(dir);
    const tracked = result?.fileStats?.trackedFiles ?? [];
    const renamed = tracked.find((f) => f.fullPath?.endsWith('new_name.txt'));

    assert.ok(renamed, `expected renamed file in trackedFiles, got ${JSON.stringify(tracked)}`);
    assert.ok(
      renamed?.lineDiff,
      `expected lineDiff on renamed file, got ${JSON.stringify(renamed)}`
    );
    assert.equal(renamed?.lineDiff?.added, 2);
    assert.equal(renamed?.lineDiff?.deleted, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getGitStatus attaches line diffs to renamed files with shared directory prefix', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, stdio: 'ignore' });
    // Some git configurations emit numstat in the brace form: `pkg/{old.ts => new.ts}`.
    // Enable numstat-specific rename detection so we exercise that path.
    execFileSync('git', ['config', 'diff.renames', 'true'], { cwd: dir, stdio: 'ignore' });

    const pkgDir = path.join(dir, 'pkg');
    await writeFile(path.join(dir, '.gitkeep'), '');
    execFileSync('git', ['add', '.gitkeep'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' });

    execFileSync('mkdir', ['-p', pkgDir]);
    await writeFile(path.join(pkgDir, 'old.ts'), 'export const a = 1;\n');
    execFileSync('git', ['add', 'pkg/old.ts'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'add old.ts'], { cwd: dir, stdio: 'ignore' });

    execFileSync('git', ['mv', 'pkg/old.ts', 'pkg/new.ts'], { cwd: dir, stdio: 'ignore' });
    await writeFile(path.join(pkgDir, 'new.ts'), 'export const a = 1;\nexport const b = 2;\n');
    execFileSync('git', ['add', 'pkg/new.ts'], { cwd: dir, stdio: 'ignore' });

    const result = await getGitStatus(dir);
    const tracked = result?.fileStats?.trackedFiles ?? [];
    const renamed = tracked.find((f) => f.fullPath?.endsWith('new.ts'));

    assert.ok(renamed, `expected renamed file in trackedFiles, got ${JSON.stringify(tracked)}`);
    assert.ok(
      renamed?.lineDiff,
      `expected lineDiff on renamed file, got ${JSON.stringify(renamed)}`
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getGitStatus keeps line diffs for literal filenames containing arrow text', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, stdio: 'ignore' });

    const fileName = 'foo => bar.txt';
    await writeFile(path.join(dir, fileName), 'one\ntwo\n');
    execFileSync('git', ['add', fileName], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'add literal arrow file'], { cwd: dir, stdio: 'ignore' });

    await writeFile(path.join(dir, fileName), 'one\ntwo\nthree\n');

    const result = await getGitStatus(dir);
    const tracked = result?.fileStats?.trackedFiles ?? [];
    const modified = tracked.find((f) => f.fullPath === fileName);

    assert.ok(modified, `expected literal arrow filename in trackedFiles, got ${JSON.stringify(tracked)}`);
    assert.deepEqual(
      modified?.lineDiff,
      { added: 1, deleted: 0 },
      `expected lineDiff on literal arrow filename, got ${JSON.stringify(modified)}`
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getGitStatus refreshes ahead count after a push (cache busts on upstream ref change)', async () => {
  const remoteDir = await mkdtemp(path.join(tmpdir(), 'claude-hud-remote-'));
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    // Bare remote to push into.
    execFileSync('git', ['init', '--bare'], { cwd: remoteDir, stdio: 'ignore' });

    execFileSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['remote', 'add', 'origin', remoteDir], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: dir, stdio: 'ignore' });

    // New local commit that is not yet pushed → ahead = 1.
    execFileSync('git', ['commit', '--allow-empty', '-m', 'local work'], { cwd: dir, stdio: 'ignore' });
    const ahead = await getGitStatus(dir);
    assert.equal(ahead?.ahead, 1, `expected ahead=1 before push, got ${ahead?.ahead}`);

    // Push it. This advances refs/remotes/origin/main but touches no other sentinel.
    execFileSync('git', ['push', 'origin', 'main'], { cwd: dir, stdio: 'ignore' });

    const after = await getGitStatus(dir);
    assert.equal(after?.ahead, 0, `expected ahead=0 after push (stale cache bug), got ${after?.ahead}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(remoteDir, { recursive: true, force: true });
  }
});

test('getGitStatus refreshes ahead count after the local branch ref moves (update-ref)', async () => {
  const remoteDir = await mkdtemp(path.join(tmpdir(), 'claude-hud-remote-'));
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init', '--bare'], { cwd: remoteDir, stdio: 'ignore' });
    execFileSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['remote', 'add', 'origin', remoteDir], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: dir, stdio: 'ignore' });

    execFileSync('git', ['commit', '--allow-empty', '-m', 'local work'], { cwd: dir, stdio: 'ignore' });
    const ahead = await getGitStatus(dir);
    assert.equal(ahead?.ahead, 1, `expected ahead=1, got ${ahead?.ahead}`);

    // Move the local branch ref back via update-ref: no index change, no ORIG_HEAD.
    execFileSync('git', ['update-ref', 'refs/heads/main', 'HEAD~1'], { cwd: dir, stdio: 'ignore' });
    const after = await getGitStatus(dir);
    assert.equal(after?.ahead, 0, `expected ahead=0 after local ref move, got ${after?.ahead}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(remoteDir, { recursive: true, force: true });
  }
});

test('getGitStatus reflects an in-place edit of a tracked file within the cache max-age', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });

    const nested = path.join(dir, 'src');
    execFileSync('mkdir', ['-p', nested]);
    await writeFile(path.join(nested, 'foo.txt'), 'one\ntwo\n');
    execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'add foo'], { cwd: dir, stdio: 'ignore' });

    // Cache the clean state.
    const clean = await getGitStatus(dir);
    assert.equal(clean?.isDirty, false);

    // Edit the tracked nested file in place — changes no .git/ sentinel.
    await writeFile(path.join(nested, 'foo.txt'), 'one\ntwo\nthree\n');

    // Within the max-age window the cache may still be clean; after it elapses the
    // status must reflect the edit. Poll past the 2s TTL.
    let dirty = false;
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const s = await getGitStatus(dir);
      if (s?.isDirty) { dirty = true; break; }
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.equal(dirty, true, 'expected isDirty to become true after the cache max-age elapsed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getGitStatus builds branchUrl from HTTPS origin remotes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['checkout', '-b', 'feature/test-branch'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/claude-hud.git'], { cwd: dir, stdio: 'ignore' });

    const result = await getGitStatus(dir);
    assert.equal(result?.branchUrl, 'https://github.com/example/claude-hud/tree/feature%2Ftest-branch');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getGitStatus builds branchUrl from SSH origin remotes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['checkout', '-b', 'feature/test-branch'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:example/claude-hud.git'], { cwd: dir, stdio: 'ignore' });

    const result = await getGitStatus(dir);
    assert.equal(result?.branchUrl, 'https://github.com/example/claude-hud/tree/feature%2Ftest-branch');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getGitStatus does not build branchUrl for non-GitHub HTTPS remotes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['checkout', '-b', 'feature/test-branch'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['remote', 'add', 'origin', 'https://gitlab.com/example/claude-hud.git'], { cwd: dir, stdio: 'ignore' });

    const result = await getGitStatus(dir);
    assert.equal(result?.branchUrl, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getGitStatus does not build branchUrl for non-GitHub SSH remotes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-hud-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['checkout', '-b', 'feature/test-branch'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['remote', 'add', 'origin', 'git@gitlab.com:example/claude-hud.git'], { cwd: dir, stdio: 'ignore' });

    const result = await getGitStatus(dir);
    assert.equal(result?.branchUrl, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
