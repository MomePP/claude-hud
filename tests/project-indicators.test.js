import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { renderProjectLine } from '../dist/render/lines/project.js';
import { DEFAULT_CONFIG, mergeConfig } from '../dist/config.js';

function stripAnsi(s) {
  return s
    .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

function baseCtx(overrides = {}) {
  return {
    stdin: { model: { display_name: 'Opus' }, cwd: '/home/u/my-project' },
    transcript: { tools: [], agents: [], todos: [], ...overrides.transcript },
    claudeMdCount: 0,
    rulesCount: 0,
    mcpCount: 0,
    hooksCount: 0,
    sessionDuration: '0s',
    gitStatus: null,
    usageData: null,
    memoryUsage: null,
    config: overrides.config ?? DEFAULT_CONFIG,
    extraLabel: null,
  };
}

test('thinking indicator defaults to on and renders when active', () => {
  const ctx = baseCtx({
    transcript: { thinkingState: { active: true, lastSeen: new Date() } },
  });
  assert.match(stripAnsi(renderProjectLine(ctx)), /∿ thinking/);
});

test('showThinkingIndicator=false hides the indicator even when active', () => {
  const ctx = baseCtx({
    transcript: { thinkingState: { active: true, lastSeen: new Date() } },
    config: mergeConfig({ display: { showThinkingIndicator: false } }),
  });
  assert.doesNotMatch(stripAnsi(renderProjectLine(ctx)), /thinking/);
});

test('pending permission indicator defaults to on', () => {
  const ctx = baseCtx({
    transcript: {
      pendingPermission: { toolName: 'Bash', targetSummary: 'rm -rf /tmp', timestamp: new Date() },
    },
  });
  assert.match(stripAnsi(renderProjectLine(ctx)), /\? rm -rf \/tmp/);
});

test('showPendingPermission=false hides the approve hint', () => {
  const ctx = baseCtx({
    transcript: {
      pendingPermission: { toolName: 'Bash', targetSummary: 'rm -rf /tmp', timestamp: new Date() },
    },
    config: mergeConfig({ display: { showPendingPermission: false } }),
  });
  assert.doesNotMatch(stripAnsi(renderProjectLine(ctx)), /rm -rf/);
});

test('last-request tokens defaults to off', () => {
  const ctx = baseCtx({
    transcript: { lastRequestTokenUsage: { inputTokens: 12345, outputTokens: 678 } },
  });
  assert.doesNotMatch(stripAnsi(renderProjectLine(ctx)), /last:/);
});

test('showLastRequestTokens=true renders compact k-form numbers', () => {
  const ctx = baseCtx({
    transcript: { lastRequestTokenUsage: { inputTokens: 12345, outputTokens: 678 } },
    config: mergeConfig({ display: { showLastRequestTokens: true } }),
  });
  assert.match(stripAnsi(renderProjectLine(ctx)), /last: 12k→678/);
});

test('showLastRequestTokens includes reasoning tokens when present', () => {
  const ctx = baseCtx({
    transcript: {
      lastRequestTokenUsage: { inputTokens: 1000, outputTokens: 500, reasoningTokens: 2000 },
    },
    config: mergeConfig({ display: { showLastRequestTokens: true } }),
  });
  assert.match(stripAnsi(renderProjectLine(ctx)), /last: 1k→500 \(\+2k\)/);
});

test('DEFAULT_CONFIG ships the three new flags with expected defaults', () => {
  assert.equal(DEFAULT_CONFIG.display.showThinkingIndicator, true);
  assert.equal(DEFAULT_CONFIG.display.showPendingPermission, true);
  assert.equal(DEFAULT_CONFIG.display.showLastRequestTokens, false);
});
