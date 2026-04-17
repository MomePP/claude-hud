import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { parseTranscript } from '../dist/transcript.js';

function writeFixture(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-omc-'));
  const file = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return file;
}

test('Agent without subagent_type falls back to general-purpose', async () => {
  const file = writeFixture([
    {
      timestamp: '2026-04-17T00:00:00.000Z',
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'a1',
            name: 'Agent',
            input: { description: 'find bug', prompt: 'look' },
          },
        ],
      },
    },
  ]);
  const result = await parseTranscript(file);
  assert.equal(result.agents.length, 1);
  assert.equal(result.agents[0].type, 'general-purpose');
  assert.equal(result.agents[0].description, 'find bug');
});

test('Agent with input.name prefers name over generic fallback', async () => {
  const file = writeFixture([
    {
      timestamp: '2026-04-17T00:00:00.000Z',
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'a1',
            name: 'Agent',
            input: { name: 'bug-hunter', description: 'find bug' },
          },
        ],
      },
    },
  ]);
  const result = await parseTranscript(file);
  assert.equal(result.agents[0].type, 'bug-hunter');
});

test('Agent with subagent_type keeps raw type unchanged', async () => {
  const file = writeFixture([
    {
      timestamp: '2026-04-17T00:00:00.000Z',
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'a1',
            name: 'Agent',
            input: { subagent_type: 'oh-my-claudecode:explore', name: 'ignored' },
          },
        ],
      },
    },
  ]);
  const result = await parseTranscript(file);
  assert.equal(result.agents[0].type, 'oh-my-claudecode:explore');
});

test('proxy_Edit is stripped and routed as a normal tool', async () => {
  const file = writeFixture([
    {
      timestamp: '2026-04-17T00:00:00.000Z',
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 't1',
            name: 'proxy_Edit',
            input: { file_path: '/tmp/sample.ts' },
          },
        ],
      },
    },
    {
      timestamp: '2026-04-17T00:00:01.000Z',
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: false }] },
    },
  ]);
  const result = await parseTranscript(file);
  assert.equal(result.agents.length, 0, 'proxy_Edit must not be treated as an agent');
  assert.equal(result.tools.length, 1);
  assert.equal(result.tools[0].name, 'Edit');
  assert.equal(result.tools[0].status, 'completed');
  assert.equal(result.tools[0].target, '/tmp/sample.ts');
});

test('proxy_Task routes as an agent', async () => {
  const file = writeFixture([
    {
      timestamp: '2026-04-17T00:00:00.000Z',
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 't1',
            name: 'proxy_Task',
            input: { subagent_type: 'explore' },
          },
        ],
      },
    },
  ]);
  const result = await parseTranscript(file);
  assert.equal(result.agents.length, 1);
  assert.equal(result.agents[0].type, 'explore');
  assert.equal(result.tools.length, 0);
});

test('<task-notification> string content completes a background agent', async () => {
  const file = writeFixture([
    {
      timestamp: '2026-04-17T00:00:00.000Z',
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 't-bg',
            name: 'Agent',
            input: { description: 'async', run_in_background: true },
          },
        ],
      },
    },
    {
      timestamp: '2026-04-17T00:00:01.000Z',
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 't-bg',
            content: 'Async agent launched successfully. agentId: bgzzz',
          },
        ],
      },
    },
    {
      timestamp: '2026-04-17T00:00:02.000Z',
      type: 'user',
      message: {
        content:
          '<task-notification><task-id>bgzzz</task-id><tool-use-id>t-bg</tool-use-id><status>completed</status></task-notification>',
      },
    },
  ]);
  const result = await parseTranscript(file);
  assert.equal(result.agents.length, 1);
  assert.equal(result.agents[0].status, 'completed');
  assert.equal(result.agents[0].type, 'general-purpose');
});

test('tail-read activates for files larger than 4MB and still returns recent agents', async () => {
  // Build a ~5MB file: lots of padding entries, then a final Agent tool_use.
  const padding = {
    timestamp: '2026-04-17T00:00:00.000Z',
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'x'.repeat(512) },
      ],
    },
  };
  const tailAgent = {
    timestamp: '2026-04-17T01:00:00.000Z',
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          id: 'tail-agent',
          name: 'Agent',
          input: { subagent_type: 'explore' },
        },
      ],
    },
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-tail-'));
  const file = path.join(dir, 'big.jsonl');
  const fd = fs.openSync(file, 'w');
  try {
    // Write ~5000 padding entries (~2.5MB+ of body + overhead) so the file
    // crosses the 4MB threshold.
    const serializedPad = JSON.stringify(padding) + '\n';
    for (let i = 0; i < 9000; i++) {
      fs.writeSync(fd, serializedPad);
    }
    fs.writeSync(fd, JSON.stringify(tailAgent) + '\n');
  } finally {
    fs.closeSync(fd);
  }

  const { size } = fs.statSync(file);
  assert.ok(size > 4 * 1024 * 1024, `fixture should exceed 4MB (got ${size})`);

  const result = await parseTranscript(file);
  assert.equal(result.agents.length, 1, 'tail read should still capture the final agent');
  assert.equal(result.agents[0].type, 'explore');
  // Tail-read truncates aggregate totals.
  assert.equal(result.sessionTokens, undefined);
  assert.equal(result.sessionStart, undefined);
});

test('thinking block marks thinkingState active', async () => {
  const now = new Date();
  const file = writeFixture([
    {
      timestamp: now.toISOString(),
      type: 'assistant',
      message: { content: [{ type: 'thinking' }] },
    },
  ]);
  const result = await parseTranscript(file);
  assert.ok(result.thinkingState, 'expected thinkingState to be populated');
  assert.equal(result.thinkingState.active, true);
});

test('lastRequestTokenUsage captures the most recent assistant usage', async () => {
  const file = writeFixture([
    {
      timestamp: '2026-04-17T00:00:00.000Z',
      type: 'assistant',
      message: { usage: { input_tokens: 100, output_tokens: 10 }, content: [] },
    },
    {
      timestamp: '2026-04-17T00:00:10.000Z',
      type: 'assistant',
      message: { usage: { input_tokens: 555, output_tokens: 44 }, content: [] },
    },
  ]);
  const result = await parseTranscript(file);
  assert.ok(result.lastRequestTokenUsage);
  assert.equal(result.lastRequestTokenUsage.inputTokens, 555);
  assert.equal(result.lastRequestTokenUsage.outputTokens, 44);
});

test('pendingPermission surfaces a recent Bash tool_use without a result', async () => {
  const now = Date.now();
  const file = writeFixture([
    {
      timestamp: new Date(now - 500).toISOString(),
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'pend-1',
            name: 'Bash',
            input: { command: 'rm -rf /tmp/test' },
          },
        ],
      },
    },
  ]);
  const result = await parseTranscript(file);
  assert.ok(result.pendingPermission, 'expected pending permission');
  assert.equal(result.pendingPermission.toolName, 'Bash');
  assert.match(result.pendingPermission.targetSummary, /^rm -rf/);
});

test('pendingPermission is cleared once tool_result arrives', async () => {
  const now = Date.now();
  const file = writeFixture([
    {
      timestamp: new Date(now - 500).toISOString(),
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'pend-1',
            name: 'Bash',
            input: { command: 'echo hi' },
          },
        ],
      },
    },
    {
      timestamp: new Date(now - 200).toISOString(),
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'pend-1' }] },
    },
  ]);
  const result = await parseTranscript(file);
  assert.equal(result.pendingPermission, undefined);
});

test('thinkingState.active decays to false on cache-hit after the recency window', async () => {
  // Use a timestamp ~1 minute in the past — well past THINKING_RECENCY_MS (30s).
  const oldTimestamp = new Date(Date.now() - 60_000).toISOString();
  const file = writeFixture([
    {
      timestamp: oldTimestamp,
      type: 'assistant',
      message: { content: [{ type: 'thinking' }] },
    },
  ]);

  // First call — seeds the cache.
  const first = await parseTranscript(file);
  // The thinking block is old so active should already be false on first call.
  assert.ok(first.thinkingState, 'thinkingState should be set');
  assert.equal(first.thinkingState.active, false, 'should be inactive on first call (old block)');

  // Second call — cache hit (file unchanged). Decay must still be computed.
  const second = await parseTranscript(file);
  assert.ok(second.thinkingState, 'thinkingState should be set on cache hit');
  assert.equal(second.thinkingState.active, false, 'should remain inactive on cache hit');
});

test('pendingPermission is dropped on cache-hit once past the prompt window', async () => {
  // Use a timestamp ~4s in the past — past PERMISSION_THRESHOLD_MS (3s).
  const oldTimestamp = new Date(Date.now() - 4000).toISOString();
  const file = writeFixture([
    {
      timestamp: oldTimestamp,
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'perm-stale',
            name: 'Bash',
            input: { command: 'rm -rf /old' },
          },
        ],
      },
    },
  ]);

  // First call — seeds the cache; the entry is already stale so pendingPermission
  // should be undefined immediately (finalizeTranscriptResult clears it).
  const first = await parseTranscript(file);
  assert.equal(first.pendingPermission, undefined, 'stale permission should be dropped on first call');

  // Second call — cache hit. Must still return undefined.
  const second = await parseTranscript(file);
  assert.equal(second.pendingPermission, undefined, 'stale permission should remain dropped on cache hit');
});
