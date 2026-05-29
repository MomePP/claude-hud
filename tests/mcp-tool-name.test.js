import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { formatToolName } from '../dist/render/tools-line.js';

test('plugin-provided MCP names compress to <plugin>:<fn>', () => {
  assert.equal(
    formatToolName('mcp__plugin_context-mode_context-mode__ctx_execute'),
    'context-mode:ctx_execute',
  );
  assert.equal(
    formatToolName('mcp__plugin_claude-mem_mcp-search__get_observations'),
    'claude-mem:get_observations',
  );
  assert.equal(
    formatToolName('mcp__plugin_oh-my-claudecode_t__state_clear'),
    'oh-my-claudecode:state_clear',
  );
});

test('standard (non-plugin) MCP names compress to <server>:<fn>', () => {
  assert.equal(formatToolName('mcp__slack__send_message'), 'slack:send_message');
  assert.equal(formatToolName('mcp__postgres__query'), 'postgres:query');
});

test('non-MCP tool names pass through unchanged', () => {
  assert.equal(formatToolName('Edit'), 'Edit');
  assert.equal(formatToolName('Bash'), 'Bash');
  assert.equal(formatToolName('TodoWrite'), 'TodoWrite');
});

test('malformed MCP names fall through rather than mangling', () => {
  // Missing the `__fn` tail.
  assert.equal(formatToolName('mcp__slack'), 'mcp__slack');
  // Missing the fn after the split.
  assert.equal(formatToolName('mcp__slack__'), 'mcp__slack__');
});
