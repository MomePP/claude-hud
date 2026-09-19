import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseTranscript } from '../dist/transcript.js';

function writeFixture(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-sp-'));
  const file = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return file;
}

test('parseTranscript captures the latest superpowers skill (prefix stripped)', async () => {
  const file = writeFixture([
    { type: 'assistant', timestamp: '2026-06-21T09:00:00.000Z', message: { role: 'assistant', content: [
      { type: 'tool_use', id: 's1', name: 'Skill', input: { skill: 'superpowers:brainstorming' } },
    ] } },
    { type: 'assistant', timestamp: '2026-06-21T09:30:00.000Z', message: { role: 'assistant', content: [
      { type: 'tool_use', id: 's2', name: 'Skill', input: { skill: 'superpowers:executing-plans' } },
    ] } },
    { type: 'assistant', timestamp: '2026-06-21T09:31:00.000Z', message: { role: 'assistant', content: [
      { type: 'tool_use', id: 's3', name: 'Skill', input: { skill: 'context-mode:ctx-search' } },
    ] } },
  ]);
  const result = await parseTranscript(file);
  assert.ok(result.latestSuperpowersSkill, 'should capture a superpowers skill');
  assert.equal(result.latestSuperpowersSkill.name, 'executing-plans');
  assert.equal(result.latestSuperpowersSkill.at.toISOString(), '2026-06-21T09:30:00.000Z');
});

test('parseTranscript leaves latestSuperpowersSkill undefined when no superpowers skill ran', async () => {
  const file = writeFixture([
    { type: 'assistant', timestamp: '2026-06-21T09:00:00.000Z', message: { role: 'assistant', content: [
      { type: 'tool_use', id: 's1', name: 'Skill', input: { skill: 'context-mode:ctx-search' } },
    ] } },
  ]);
  const result = await parseTranscript(file);
  assert.equal(result.latestSuperpowersSkill, undefined);
});

import { readSuperpowersState } from '../dist/superpowers-state.js';

const NOW = new Date('2026-06-21T10:00:00.000Z').getTime();
const FRESH = 900000; // 15 min

function spInput(over = {}) {
  return {
    cwd: undefined,
    latestSuperpowersSkill: undefined,
    todos: [],
    agentsActive: 0,
    now: NOW,
    freshnessMs: FRESH,
    ...over,
  };
}

test('readSuperpowersState: fresh skill → active badge, phase from skill', () => {
  const s = readSuperpowersState(spInput({
    latestSuperpowersSkill: { name: 'executing-plans', at: new Date(NOW - 60000) },
  }));
  assert.ok(s);
  assert.equal(s.source, 'superpowers');
  assert.equal(s.mode, 'executing-plans');
  assert.equal(s.active, true);
});

test('readSuperpowersState: stale skill, no progress file → null', () => {
  const s = readSuperpowersState(spInput({
    latestSuperpowersSkill: { name: 'brainstorming', at: new Date(NOW - FRESH - 1000) },
  }));
  assert.equal(s, null);
});

test('readSuperpowersState: no signal at all → null', () => {
  assert.equal(readSuperpowersState(spInput()), null);
});

test('readSuperpowersState: todos fallback when no progress file', () => {
  const s = readSuperpowersState(spInput({
    latestSuperpowersSkill: { name: 'executing-plans', at: new Date(NOW) },
    todos: [
      { content: 'a', status: 'completed' },
      { content: 'b', status: 'in_progress' },
      { content: 'c', status: 'pending' },
    ],
  }));
  assert.deepEqual(s.taskCounts, { total: 3, completed: 1, inProgress: 1 });
});

// superpowers >=6.2 scopes each plan's SDD workspace to
// <repo-root>/.superpowers/sdd/<plan-basename>/progress.md.
function writeLedger(dir, slug, body, mtime) {
  const planDir = path.join(dir, '.superpowers', 'sdd', slug);
  fs.mkdirSync(planDir, { recursive: true });
  const file = path.join(planDir, 'progress.md');
  fs.writeFileSync(file, body);
  if (mtime) fs.utimesSync(file, mtime, mtime);
  return file;
}

const LEDGER = [
  '# SDD ledger — plan: docs/superpowers/plans/recovery-flow.md',
  '',
  'Task 1: complete (commits a1b2c3d..d4e5f6a, review clean)',
  'Task 2: fix round 1/5 (2 addressed, 0 open; commits d4e5f6a..b7c8d9e)',
  'Task 2: complete (commits d4e5f6a..b7c8d9e, review clean)',
  'Task 3: fix round 2/5 (1 addressed, 1 open; commits b7c8d9e..e1f2a3b)',
  '',
].join('\n');

test('readSuperpowersState: plan-scoped ledger counts completions + names the plan', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-sppm-'));
  writeLedger(dir, 'recovery-flow', LEDGER);
  const s = readSuperpowersState(spInput({
    cwd: dir,
    latestSuperpowersSkill: { name: 'subagent-driven-development', at: new Date(NOW) },
    todos: [
      { content: 'a', status: 'completed' },
      { content: 'b', status: 'completed' },
      { content: 'c', status: 'in_progress' },
      { content: 'd', status: 'pending' },
    ],
  }));
  // Task 1 + Task 2 complete; Task 3 seen but not complete; total from todos.
  assert.deepEqual(s.taskCounts, { total: 4, completed: 2, inProgress: 1 });
  assert.equal(s.objective, 'recovery-flow');
});

test('readSuperpowersState: ledger total falls back to task lines when todos are empty', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-sppm-notodos-'));
  writeLedger(dir, 'recovery-flow', LEDGER);
  const s = readSuperpowersState(spInput({
    cwd: dir,
    latestSuperpowersSkill: { name: 'subagent-driven-development', at: new Date(NOW) },
  }));
  assert.deepEqual(s.taskCounts, { total: 3, completed: 2, inProgress: 1 });
});

test('readSuperpowersState: legacy flat progress.md is ignored (foreign ledger)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-spflat-'));
  fs.mkdirSync(path.join(dir, '.superpowers', 'sdd'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.superpowers', 'sdd', 'progress.md'),
    '# Stale pre-6.2 ledger\n\n- [x] one\n- [ ] two\n');
  const s = readSuperpowersState(spInput({
    cwd: dir,
    latestSuperpowersSkill: { name: 'subagent-driven-development', at: new Date(NOW - FRESH - 1) },
  }));
  assert.equal(s, null);
});

test('readSuperpowersState: newest plan workspace wins when several coexist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-spmulti-'));
  writeLedger(dir, 'old-plan',
    '# SDD ledger — plan: plans/old-plan.md\nTask 1: complete (commits aaa1111..bbb2222, review clean)\n',
    new Date('2026-06-01T00:00:00Z'));
  writeLedger(dir, 'current-plan',
    '# SDD ledger — plan: plans/current-plan.md\n', new Date('2026-06-21T09:00:00Z'));
  const s = readSuperpowersState(spInput({
    cwd: dir,
    latestSuperpowersSkill: { name: 'subagent-driven-development', at: new Date(NOW) },
  }));
  assert.equal(s.objective, 'current-plan');
  assert.equal(s.taskCounts.completed, 0);
});

test('readSuperpowersState: ledger is found when cwd is a subdirectory of the repo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-spsub-'));
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  writeLedger(dir, 'recovery-flow', LEDGER);
  const sub = path.join(dir, 'packages', 'core');
  fs.mkdirSync(sub, { recursive: true });
  const s = readSuperpowersState(spInput({
    cwd: sub,
    latestSuperpowersSkill: { name: 'subagent-driven-development', at: new Date(NOW) },
  }));
  assert.ok(s);
  assert.equal(s.objective, 'recovery-flow');
});

test('readSuperpowersState: the walk up stops at the repo root', () => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-spouter-'));
  writeLedger(outer, 'other-repo-plan', LEDGER);
  const repo = path.join(outer, 'inner-repo');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  const s = readSuperpowersState(spInput({
    cwd: repo,
    latestSuperpowersSkill: { name: 'subagent-driven-development', at: new Date(NOW - FRESH - 1) },
  }));
  assert.equal(s, null);
});

test('readSuperpowersState: checkbox ledger still parses inside a plan workspace', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-spbox-'));
  writeLedger(dir, 'delivery-notes',
    '# Delivery Notes — progress ledger\n\n- [x] Task 1\n- [X] Task 2\n- [ ] Task 3\n- [ ] Task 4\n');
  const s = readSuperpowersState(spInput({
    cwd: dir,
    latestSuperpowersSkill: { name: 'subagent-driven-development', at: new Date(NOW) },
  }));
  assert.deepEqual(s.taskCounts, { total: 4, completed: 2, inProgress: 0 });
  assert.equal(s.objective, 'Delivery Notes — progress ledger');
});

test('readSuperpowersState: checkbox lines in a prose ledger are findings, not tasks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-spmixed-'));
  writeLedger(dir, 'recovery-flow', `${LEDGER}- [ ] deferred minor: extract a constant\n- [ ] deferred minor: rename the helper\n`);
  const s = readSuperpowersState(spInput({
    cwd: dir,
    latestSuperpowersSkill: { name: 'subagent-driven-development', at: new Date(NOW) },
  }));
  assert.deepEqual(s.taskCounts, { total: 3, completed: 2, inProgress: 1 });
});

test('readSuperpowersState: a live plan workspace keeps the badge active with a stale skill', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-sppm2-'));
  writeLedger(dir, 'recovery-flow', LEDGER);
  const s = readSuperpowersState(spInput({
    cwd: dir,
    latestSuperpowersSkill: { name: 'subagent-driven-development', at: new Date(NOW - FRESH - 1) },
  }));
  assert.ok(s);
  assert.equal(s.active, true);
  assert.equal(s.mode, 'subagent-driven-development');
});
