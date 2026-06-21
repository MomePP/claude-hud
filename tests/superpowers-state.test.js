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
