import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { readOmcState } from '../dist/omc-state.js';
import { formatNamespaced } from '../dist/render/format-namespace.js';

// Write a temp project dir with .omc/state/*.json and return its path.
function makeProject(mission, subagents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omc-test-'));
  const stateDir = path.join(dir, '.omc', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  if (mission !== undefined) {
    fs.writeFileSync(path.join(stateDir, 'mission-state.json'), JSON.stringify(mission));
  }
  if (subagents !== undefined) {
    fs.writeFileSync(path.join(stateDir, 'subagent-tracking.json'), JSON.stringify(subagents));
  }
  return dir;
}

test('readOmcState returns null when cwd is undefined', () => {
  assert.equal(readOmcState(undefined), null);
});

test('readOmcState returns null when .omc is absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omc-empty-'));
  assert.equal(readOmcState(dir), null);
});

test('readOmcState reads an active mission with mode, progress, and agents', () => {
  const dir = makeProject(
    {
      updatedAt: '2026-05-27T06:25:34.107Z',
      missions: [{
        id: 'm1',
        source: 'ralph',
        name: 'fix the bug',
        objective: 'Fix authentication regression',
        status: 'active',
        taskCounts: { total: 5, completed: 2, inProgress: 1, pending: 2, failed: 0 },
      }],
    },
    { agents: [{ parent_mode: 'ralph' }], total_spawned: 3, total_completed: 1, total_failed: 0 },
  );
  const s = readOmcState(dir);
  assert.ok(s);
  assert.equal(s.source, 'omc');
  assert.equal(s.mode, 'ralph');
  assert.equal(s.active, true);
  assert.equal(s.objective, 'Fix authentication regression');
  assert.deepEqual(s.taskCounts, { total: 5, completed: 2, inProgress: 1 });
  assert.equal(s.agentsActive, 2); // 3 spawned - 1 completed - 0 failed
});

test('readOmcState treats a done mission as inactive', () => {
  const dir = makeProject({
    updatedAt: '2026-05-27T06:25:34.107Z',
    missions: [{ source: 'ultragoal', name: 'x', objective: 'y', status: 'done', taskCounts: { total: 1, completed: 1, inProgress: 0 } }],
  });
  const s = readOmcState(dir);
  assert.ok(s);
  assert.equal(s.active, false);
});

test('readOmcState maps session/none mission to a null mode', () => {
  const dir = makeProject(
    { updatedAt: '2026-05-27T06:25:34.107Z', missions: [{ source: 'session', name: 'none', objective: 'Session mission', status: 'done', taskCounts: { total: 1, completed: 1, inProgress: 0 } }] },
    { agents: [{ parent_mode: 'none' }], total_spawned: 1, total_completed: 1, total_failed: 0 },
  );
  const s = readOmcState(dir);
  assert.ok(s);
  assert.equal(s.mode, null);
});

test('readOmcState inProgress tasks force active even when status is not active', () => {
  const dir = makeProject({
    updatedAt: '2026-05-27T06:25:34.107Z',
    missions: [{ source: 'team', name: 'x', objective: 'y', status: 'queued', taskCounts: { total: 4, completed: 0, inProgress: 2 } }],
  });
  const s = readOmcState(dir);
  assert.equal(s.active, true);
});

test('readOmcState returns null on malformed JSON (never throws)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omc-bad-'));
  fs.mkdirSync(path.join(dir, '.omc', 'state'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.omc', 'state', 'mission-state.json'), '{not valid json');
  assert.doesNotThrow(() => readOmcState(dir));
  assert.equal(readOmcState(dir), null);
});

test('formatNamespaced badge mode abbreviates oh-my-claudecode to omc', () => {
  assert.equal(formatNamespaced('oh-my-claudecode:explore', 'badge'), '[omc] Explore');
  assert.equal(formatNamespaced('oac:debugger', 'badge'), '[oac] Debugger'); // unknown ns unchanged
  assert.equal(formatNamespaced('oh-my-claudecode:explore', 'strip'), 'Explore'); // strip unaffected
  assert.equal(formatNamespaced('oh-my-claudecode:explore', 'raw'), 'oh-my-claudecode:explore');
});
