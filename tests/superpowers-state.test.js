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

test('readSuperpowersState: progress.md enriches task counts + objective', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-sppm-'));
  fs.mkdirSync(path.join(dir, '.superpowers', 'sdd'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.superpowers', 'sdd', 'progress.md'),
    '# Delivery Notes — progress ledger\n\n- [x] Task 1\n- [X] Task 2\n- [ ] Task 3\n- [ ] Task 4\n');
  const s = readSuperpowersState(spInput({
    cwd: dir,
    latestSuperpowersSkill: { name: 'subagent-driven-development', at: new Date(NOW) },
  }));
  assert.deepEqual(s.taskCounts, { total: 4, completed: 2, inProgress: 0 });
  assert.equal(s.objective, 'Delivery Notes — progress ledger');
});

test('readSuperpowersState: progress file with incomplete tasks keeps badge active even with stale skill', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-sppm2-'));
  fs.mkdirSync(path.join(dir, '.superpowers', 'sdd'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.superpowers', 'sdd', 'progress.md'), '- [x] one\n- [ ] two\n');
  const s = readSuperpowersState(spInput({
    cwd: dir,
    latestSuperpowersSkill: { name: 'subagent-driven-development', at: new Date(NOW - FRESH - 1) },
  }));
  assert.ok(s);
  assert.equal(s.active, true);
  assert.equal(s.mode, 'subagent-driven-development');
});
