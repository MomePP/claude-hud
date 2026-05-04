import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { parseTranscript } from '../dist/transcript.js';
import { renderAgentsLine } from '../dist/render/agents-line.js';
import { renderToolsLine } from '../dist/render/tools-line.js';
import { formatNamespaced } from '../dist/render/format-namespace.js';

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

test('pendingPermission persists past the old 3s window until tool_result lands', async () => {
  // A tool_use from 10s ago with no tool_result: under the old heuristic this
  // would have been dropped after 3s, but the honest behavior is to keep
  // showing it because Claude is still blocked waiting on a result.
  const oldTimestamp = new Date(Date.now() - 10_000).toISOString();
  const file = writeFixture([
    {
      timestamp: oldTimestamp,
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'perm-long',
            name: 'Bash',
            input: { command: 'npm install' },
          },
        ],
      },
    },
  ]);

  const first = await parseTranscript(file);
  assert.ok(first.pendingPermission, 'open tool_use should still surface as pending');
  assert.equal(first.pendingPermission.toolName, 'Bash');

  // Cache hit: same entry should come back (decay was not applied).
  const second = await parseTranscript(file);
  assert.ok(second.pendingPermission, 'cache-hit should preserve the pending entry');
  assert.equal(second.pendingPermission.targetSummary, first.pendingPermission.targetSummary);
});

test('pendingPermission clears when a newer entry lands after it (interrupt detection)', async () => {
  // Simulates the "user interrupted the chat" case: a tool_use fires, no
  // matching tool_result ever arrives, and the user sends a fresh message.
  // The pending indicator should drop since the tool_use was abandoned.
  const now = Date.now();
  const file = writeFixture([
    {
      timestamp: new Date(now - 90_000).toISOString(),
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 'perm-interrupted', name: 'Edit', input: { file_path: '/tmp/README.md' } },
        ],
      },
    },
    {
      // >= 30s later — well past PENDING_PERMISSION_INTERRUPT_GRACE_MS.
      timestamp: new Date(now - 30_000).toISOString(),
      type: 'user',
      message: { content: [{ type: 'text', text: 'nevermind, do something else' }] },
    },
  ]);
  const result = await parseTranscript(file);
  assert.equal(result.pendingPermission, undefined, 'interrupted tool_use should not surface as pending');
});

test('pendingPermission clears on cache-hit once it exceeds the wall-clock cap', async () => {
  // Simulates the "13-hour stuck indicator" bug: a pending tool_use from
  // way in the past is stored in the cache, and a cache-hit still drops it
  // because the finalize step applies PENDING_PERMISSION_MAX_AGE_MS.
  const file = writeFixture([
    {
      timestamp: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 'perm-ancient', name: 'Edit', input: { file_path: '/tmp/README.md' } },
        ],
      },
    },
  ]);
  // Fresh parse already drops it (interrupt rule fires since there's only
  // one entry, latestEntryTimestamp === tool_use.timestamp, so the
  // interruptCutoff is that minus 30s — not yet triggered. But the
  // wall-clock cap is 5 min; the entry is 6 min old, so it drops).
  const first = await parseTranscript(file);
  assert.equal(first.pendingPermission, undefined, '6-min-old entry exceeds wall-clock cap');

  // Cache hit: finalize must reapply the cap so a cached stuck entry clears.
  const second = await parseTranscript(file);
  assert.equal(second.pendingPermission, undefined, 'cache-hit should also drop aged entry');
});

test('pendingPermission picks the youngest still-open entry when multiple exist', async () => {
  const earlier = new Date(Date.now() - 20_000).toISOString();
  const later = new Date(Date.now() - 5_000).toISOString();
  const file = writeFixture([
    {
      timestamp: earlier,
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'perm-old',
            name: 'Bash',
            input: { command: 'sleep 60' },
          },
        ],
      },
    },
    {
      timestamp: later,
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'perm-new',
            name: 'Edit',
            input: { file_path: '/tmp/auth.ts' },
          },
        ],
      },
    },
  ]);

  const result = await parseTranscript(file);
  assert.ok(result.pendingPermission, 'expected a pending permission entry');
  assert.equal(result.pendingPermission.toolName, 'Edit', 'youngest entry should win');
  assert.equal(result.pendingPermission.targetSummary, 'auth.ts');
});

test('renderAgentsLine strips namespace and capitalizes for OAC subagents', () => {
  const ctx = {
    config: { colors: undefined },
    transcript: {
      tools: [],
      todos: [],
      agents: [
        {
          id: 'agent-oac',
          type: 'oac:code-execution',
          model: 'sonnet',
          description: 'Implementing JWT middleware',
          status: 'running',
          startTime: new Date(Date.now() - 5000),
        },
      ],
    },
  };

  const line = renderAgentsLine(ctx);
  assert.ok(line, 'should render a line for an active OAC agent');
  assert.ok(line.includes('Code-execution'), `expected capitalized type, got: ${line}`);
  assert.ok(!line.includes('oac:'), `expected the oac: prefix to be stripped, got: ${line}`);
});

test('renderAgentsLine strips namespace and capitalizes for OMC subagents', () => {
  const ctx = {
    config: { colors: undefined },
    transcript: {
      tools: [],
      todos: [],
      agents: [
        {
          id: 'agent-omc',
          type: 'oh-my-claudecode:explore',
          status: 'completed',
          startTime: new Date(0),
          endTime: new Date(1000),
        },
      ],
    },
  };

  const line = renderAgentsLine(ctx);
  assert.ok(line, 'should render a line for a completed OMC agent');
  assert.ok(line.includes('Explore'), `expected capitalized type, got: ${line}`);
  assert.ok(!line.includes('oh-my-claudecode:'), `expected namespace stripped, got: ${line}`);
});

test('formatNamespaced badge mode keeps the orchestrator visible', () => {
  assert.equal(formatNamespaced('oac:code-execution', 'badge'), '[oac] Code-execution');
  assert.equal(formatNamespaced('oh-my-claudecode:explore', 'badge'), '[oh-my-claudecode] Explore');
  // No namespace → behaves like strip (still capitalize).
  assert.equal(formatNamespaced('explore', 'badge'), 'Explore');
});

test('formatNamespaced raw mode passes through unchanged', () => {
  assert.equal(formatNamespaced('oac:code-execution', 'raw'), 'oac:code-execution');
  assert.equal(formatNamespaced('explore', 'raw'), 'explore');
});

test('formatNamespaced strip mode drops namespace and capitalizes (default)', () => {
  assert.equal(formatNamespaced('oac:debugger', 'strip'), 'Debugger');
  assert.equal(formatNamespaced('oh-my-claudecode:explore', 'strip'), 'Explore');
  assert.equal(formatNamespaced('explore', 'strip'), 'Explore');
});

test('renderAgentsLine emits badge form when display.agentNamespaceMode is "badge"', () => {
  const ctx = {
    config: { colors: undefined, display: { agentNamespaceMode: 'badge' } },
    transcript: {
      tools: [],
      todos: [],
      agents: [
        {
          id: 'agent-badge',
          type: 'oac:parallel-execution',
          status: 'running',
          startTime: new Date(Date.now() - 1000),
        },
      ],
    },
  };
  const line = renderAgentsLine(ctx);
  assert.ok(line, 'should render the agent line');
  assert.ok(line.includes('[oac]'), `expected [oac] badge, got: ${line}`);
  assert.ok(line.includes('Parallel-execution'), `expected capitalized local name, got: ${line}`);
});

test('renderAgentsLine passes raw type through when mode is "raw"', () => {
  const ctx = {
    config: { colors: undefined, display: { agentNamespaceMode: 'raw' } },
    transcript: {
      tools: [],
      todos: [],
      agents: [
        {
          id: 'agent-raw',
          type: 'oac:debugger',
          status: 'running',
          startTime: new Date(Date.now() - 500),
        },
      ],
    },
  };
  const line = renderAgentsLine(ctx);
  assert.ok(line.includes('oac:debugger'), `expected raw type intact, got: ${line}`);
});

test('renderToolsLine formats Skill target via namespace strip (default)', () => {
  const ctx = {
    config: { colors: undefined },
    transcript: {
      tools: [
        {
          id: 'skill-1',
          name: 'Skill',
          target: 'oac:context-discovery',
          status: 'running',
          startTime: new Date(Date.now() - 1000),
        },
      ],
      todos: [],
      agents: [],
    },
  };
  const line = renderToolsLine(ctx);
  assert.ok(line, 'should render the tools line');
  assert.ok(line.includes('Skill'), `expected Skill tool name, got: ${line}`);
  assert.ok(line.includes('Context-discovery'), `expected capitalized skill name, got: ${line}`);
  assert.ok(!line.includes('oac:'), `expected oac: prefix stripped, got: ${line}`);
});

test('renderToolsLine emits Skill target in badge form when configured', () => {
  const ctx = {
    config: { colors: undefined, display: { agentNamespaceMode: 'badge' } },
    transcript: {
      tools: [
        {
          id: 'skill-2',
          name: 'Skill',
          target: 'caveman:cavecrew',
          status: 'running',
          startTime: new Date(Date.now() - 1000),
        },
      ],
      todos: [],
      agents: [],
    },
  };
  const line = renderToolsLine(ctx);
  assert.ok(line.includes('[caveman]'), `expected [caveman] badge, got: ${line}`);
  assert.ok(line.includes('Cavecrew'), `expected capitalized skill name, got: ${line}`);
});

test('renderToolsLine leaves non-Skill tool targets as paths (truncated)', () => {
  const ctx = {
    config: { colors: undefined },
    transcript: {
      tools: [
        {
          id: 'edit-1',
          name: 'Edit',
          target: '/tmp/sample.ts',
          status: 'running',
          startTime: new Date(Date.now() - 1000),
        },
      ],
      todos: [],
      agents: [],
    },
  };
  const line = renderToolsLine(ctx);
  assert.ok(line.includes('Edit'), `expected Edit tool name, got: ${line}`);
  assert.ok(line.includes('sample.ts'), `expected file path target, got: ${line}`);
});
