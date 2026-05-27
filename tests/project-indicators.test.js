import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { renderProjectLine, renderGitFilesLine } from '../dist/render/lines/project.js';
import { coloredBar, quotaBar } from '../dist/render/colors.js';
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

test('thinking indicator uses dim color by default', () => {
  const ctx = baseCtx({
    transcript: { thinkingState: { active: true, lastSeen: new Date() } },
  });
  const out = renderProjectLine(ctx);
  assert.match(out, /\x1b\[2m∿ thinking\x1b\[0m/, 'expected dim ANSI wrap');
});

test('colors.thinking override applies to the indicator (256-color number)', () => {
  const ctx = baseCtx({
    transcript: { thinkingState: { active: true, lastSeen: new Date() } },
    config: mergeConfig({ colors: { thinking: 217 } }),
  });
  const out = renderProjectLine(ctx);
  assert.match(out, /\x1b\[38;5;217m∿ thinking\x1b\[0m/, 'expected 256-color 217 ANSI wrap');
});

test('colors.thinking override accepts hex values', () => {
  const ctx = baseCtx({
    transcript: { thinkingState: { active: true, lastSeen: new Date() } },
    config: mergeConfig({ colors: { thinking: '#ff8800' } }),
  });
  const out = renderProjectLine(ctx);
  assert.match(out, /\x1b\[38;2;255;136;0m∿ thinking\x1b\[0m/, 'expected truecolor ANSI from hex');
});

test('natural mode colors the project glyph with the project color', () => {
  const ctx = baseCtx({
    config: mergeConfig({
      display: { projectStyle: 'natural', projectGlyph: '\uf114' },
      colors: { project: 'cyan' },
    }),
  });
  const out = renderProjectLine(ctx);
  assert.match(out, /\x1b\[36m\uf114\x1b\[0m/, 'project glyph should be wrapped in projectColor');
});

test('natural mode colors the branch glyph with the gitBranch color', () => {
  const ctx = baseCtx({
    config: mergeConfig({
      display: { projectStyle: 'natural', branchGlyph: '\ue725' },
      colors: { gitBranch: 'brightMagenta' },
    }),
  });
  ctx.gitStatus = { branch: 'main', isDirty: false, ahead: 0, behind: 0 };
  const out = renderProjectLine(ctx);
  assert.match(out, /\x1b\[95m\ue725\x1b\[0m/, 'branch glyph should be wrapped in gitBranchColor');
});

test('showThinkingIndicator=false hides the indicator even when active', () => {
  const ctx = baseCtx({
    transcript: { thinkingState: { active: true, lastSeen: new Date() } },
    config: mergeConfig({ display: { showThinkingIndicator: false } }),
  });
  assert.doesNotMatch(stripAnsi(renderProjectLine(ctx)), /thinking/);
});

test('pending permission indicator defaults to on with waiting counter', () => {
  const ctx = baseCtx({
    transcript: {
      pendingPermission: {
        toolName: 'Bash',
        targetSummary: 'rm -rf /tmp',
        timestamp: new Date(Date.now() - 7_000),
      },
    },
  });
  const out = stripAnsi(renderProjectLine(ctx));
  assert.match(out, /\? rm -rf \/tmp/);
  assert.match(out, /\(waiting [67]s\)/, 'should include waiting counter rounded to whole seconds');
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

test('DEFAULT_CONFIG ships natural-mode toggles and file-list split with expected defaults', () => {
  assert.equal(DEFAULT_CONFIG.display.projectStyle, 'pipes');
  assert.equal(DEFAULT_CONFIG.display.naturalSeparator, ' \u00B7 ');
  assert.equal(DEFAULT_CONFIG.display.modelGlyph, '\uec10');
  assert.equal(DEFAULT_CONFIG.gitStatus.showFileList, false);
});

test('DEFAULT_CONFIG ships project/branch/duration glyphs and barStyle with expected defaults', () => {
  assert.equal(DEFAULT_CONFIG.display.projectGlyph, '\uf114');
  assert.equal(DEFAULT_CONFIG.display.branchGlyph, '\ue725');
  assert.equal(DEFAULT_CONFIG.display.durationGlyph, '\uf017');
  assert.equal(DEFAULT_CONFIG.display.barStyle, 'block');
});

test('natural mode renders default project and branch glyphs alongside in/on prepositions', () => {
  const ctx = baseCtx({
    config: mergeConfig({ display: { projectStyle: 'natural' } }),
  });
  ctx.gitStatus = { branch: 'main', isDirty: false, ahead: 0, behind: 0 };
  const out = stripAnsi(renderProjectLine(ctx));
  assert.match(out, /in \uf114 my-project/, 'project glyph should sit between "in" and project name');
  assert.match(out, /on \ue725 main/, 'branch glyph should sit between "on" and branch name');
});

test('natural mode honors custom projectGlyph and branchGlyph values', () => {
  const ctx = baseCtx({
    config: mergeConfig({
      display: { projectStyle: 'natural', projectGlyph: '\uf115', branchGlyph: '\uf126' },
    }),
  });
  ctx.gitStatus = { branch: 'main', isDirty: false, ahead: 0, behind: 0 };
  const out = stripAnsi(renderProjectLine(ctx));
  assert.match(out, /in \uf115 my-project/);
  assert.match(out, /on \uf126 main/);
});

test('natural mode omits glyphs when project/branch glyph is empty string', () => {
  const ctx = baseCtx({
    config: mergeConfig({
      display: { projectStyle: 'natural', projectGlyph: '', branchGlyph: '' },
    }),
  });
  ctx.gitStatus = { branch: 'main', isDirty: false, ahead: 0, behind: 0 };
  const out = stripAnsi(renderProjectLine(ctx));
  assert.match(out, /in my-project/);
  assert.match(out, /on main/);
  assert.doesNotMatch(out, /\uf114/);
  assert.doesNotMatch(out, /\ue725/);
});

test('duration glyph defaults to NF clock and replaces the legacy stopwatch emoji', () => {
  const ctx = baseCtx({
    config: mergeConfig({ display: { showDuration: true, projectStyle: 'natural' } }),
  });
  ctx.sessionDuration = '1h 30m';
  const out = stripAnsi(renderProjectLine(ctx));
  assert.match(out, /\uf017 1h 30m/, 'expected NF clock glyph before duration');
  assert.doesNotMatch(out, /\u23F1/, 'should not include the stopwatch emoji');
});

test('barStyle defaults to "block" and uses U+2588 / U+2591 characters', () => {
  const out = stripAnsi(coloredBar(50, 6));
  assert.match(out, /\u2588{3}\u2591{3}/, 'block style should fill 3/6 with U+2588 and 3/6 with U+2591');
});

test('barStyle "square" swaps to U+25B0 / U+25B1', () => {
  const out = stripAnsi(coloredBar(50, 6, undefined, 'square'));
  assert.match(out, /\u25B0{3}\u25B1{3}/);
});

test('barStyle "thin" swaps to U+2501 / U+2500', () => {
  const out = stripAnsi(quotaBar(50, 6, undefined, 'thin'));
  assert.match(out, /\u2501{3}\u2500{3}/);
});

test('barStyle "vertical" swaps to U+25AE / U+25AF', () => {
  const out = stripAnsi(coloredBar(50, 6, undefined, 'vertical'));
  assert.match(out, /\u25AE{3}\u25AF{3}/);
});

test('barStyle "dots" swaps to U+25CF / U+25CB', () => {
  const out = stripAnsi(coloredBar(50, 6, undefined, 'dots'));
  assert.match(out, /\u25CF{3}\u25CB{3}/);
});

test('barStyle "shade" swaps to U+2593 / U+2591', () => {
  const out = stripAnsi(coloredBar(50, 6, undefined, 'shade'));
  assert.match(out, /\u2593{3}\u2591{3}/);
});

test('barStyle "double" swaps to U+2550 / U+2500', () => {
  const out = stripAnsi(coloredBar(50, 6, undefined, 'double'));
  assert.match(out, /\u2550{3}\u2500{3}/);
});

test('unknown barStyle falls back to block', () => {
  const out = stripAnsi(coloredBar(50, 6, undefined, 'mystery'));
  assert.match(out, /\u2588{3}\u2591{3}/);
});

test('durationGlyph is configurable and can be disabled with empty string', () => {
  const ctxEmoji = baseCtx({
    config: mergeConfig({ display: { showDuration: true, durationGlyph: '\u23F1\uFE0F ' } }),
  });
  ctxEmoji.sessionDuration = '5m';
  assert.match(stripAnsi(renderProjectLine(ctxEmoji)), /\u23F1\uFE0F  5m/);

  const ctxNone = baseCtx({
    config: mergeConfig({ display: { showDuration: true, durationGlyph: '' } }),
  });
  ctxNone.sessionDuration = '5m';
  const out = stripAnsi(renderProjectLine(ctxNone));
  assert.match(out, /5m/);
  assert.doesNotMatch(out, /\uf017/);
});

test('pipes mode (default) keeps the [model] brackets and \u2502 separator', () => {
  const ctx = baseCtx({
    config: mergeConfig({}),
  });
  ctx.gitStatus = { branch: 'main', isDirty: false, ahead: 0, behind: 0 };
  const out = stripAnsi(renderProjectLine(ctx));
  assert.match(out, /\[Opus\]/);
  assert.match(out, /git:\(main\)/);
  assert.match(out, /\u2502/);
});

test('natural mode drops [] brackets and uses in/on prepositions', () => {
  const ctx = baseCtx({
    config: mergeConfig({ display: { projectStyle: 'natural', projectGlyph: '', branchGlyph: '' } }),
  });
  ctx.gitStatus = { branch: 'main', isDirty: true, ahead: 0, behind: 0 };
  const out = stripAnsi(renderProjectLine(ctx));
  assert.doesNotMatch(out, /\[Opus\]/);
  assert.doesNotMatch(out, /git:\(/);
  assert.match(out, /Opus/);
  assert.match(out, /in my-project/);
  assert.match(out, /on main\*/);
});

test('natural mode shows the configured model glyph before the model name', () => {
  const ctx = baseCtx({
    config: mergeConfig({ display: { projectStyle: 'natural' } }),
  });
  const out = stripAnsi(renderProjectLine(ctx));
  assert.match(out, /\uec10 Opus/, 'expected default sparkle glyph before model');
});

test('natural mode model glyph is configurable (e.g. snowflake)', () => {
  const ctx = baseCtx({
    config: mergeConfig({ display: { projectStyle: 'natural', modelGlyph: '\uF2DC' } }),
  });
  const out = stripAnsi(renderProjectLine(ctx));
  assert.match(out, /\uF2DC Opus/);
});

test('natural mode model glyph can be disabled with empty string', () => {
  const ctx = baseCtx({
    config: mergeConfig({ display: { projectStyle: 'natural', modelGlyph: '' } }),
  });
  const out = stripAnsi(renderProjectLine(ctx));
  assert.doesNotMatch(out, /\uec10/, 'sparkle glyph should be absent when disabled');
  assert.match(out, /^(?:\x1b\[[0-9;]*m)*Opus/, 'model name should sit at the start with no glyph prefix');
});

test('natural mode separator is configurable', () => {
  const ctx = baseCtx({
    transcript: { thinkingState: { active: true, lastSeen: new Date() } },
    config: mergeConfig({ display: { projectStyle: 'natural', naturalSeparator: ' | ' } }),
  });
  const out = stripAnsi(renderProjectLine(ctx));
  assert.match(out, / \| /, 'configured separator should appear between core and indicators');
  assert.doesNotMatch(out, /\u00B7/);
});

test('showFileStats inline counter renders in pipes mode without bottom file list', () => {
  const ctx = baseCtx({
    config: mergeConfig({ gitStatus: { showFileStats: true, showFileList: false } }),
  });
  ctx.gitStatus = {
    branch: 'main',
    isDirty: true,
    ahead: 0,
    behind: 0,
    lineDiff: { added: 5, deleted: 3 },
    fileStats: {
      modified: 1,
      added: 0,
      deleted: 0,
      untracked: 0,
      trackedFiles: [{ basename: 'a.ts', fullPath: 'src/a.ts', type: 'modified', lineDiff: { added: 5, deleted: 3 } }],
    },
  };
  assert.match(stripAnsi(renderProjectLine(ctx)), /\+5 -3/);
  assert.equal(renderGitFilesLine(ctx, 120), null, 'file list should be suppressed when showFileList=false');
});

test('showFileStats inline counter renders in natural mode without bottom file list', () => {
  const ctx = baseCtx({
    config: mergeConfig({
      display: { projectStyle: 'natural', branchGlyph: '' },
      gitStatus: { showFileStats: true, showFileList: false },
    }),
  });
  ctx.gitStatus = {
    branch: 'main',
    isDirty: false,
    ahead: 0,
    behind: 0,
    lineDiff: { added: 5, deleted: 3 },
    fileStats: { modified: 1, added: 0, deleted: 0, untracked: 0, trackedFiles: [] },
  };
  const out = stripAnsi(renderProjectLine(ctx));
  assert.match(out, /on main with \+5 -3 changes/, 'natural mode wraps line-diff in "with ... changes"');
  assert.equal(renderGitFilesLine(ctx, 120), null);
});

test('natural mode dims the "with" and "changes" labels around the colored counters', () => {
  const ctx = baseCtx({
    config: mergeConfig({
      display: { projectStyle: 'natural', branchGlyph: '' },
      gitStatus: { showFileStats: true, showFileList: false },
    }),
  });
  ctx.gitStatus = {
    branch: 'main',
    isDirty: false,
    ahead: 0,
    behind: 0,
    lineDiff: { added: 5, deleted: 3 },
    fileStats: { modified: 1, added: 0, deleted: 0, untracked: 0, trackedFiles: [] },
  };
  const out = renderProjectLine(ctx);
  assert.match(out, /\x1b\[2mwith\x1b\[0m/, '"with" should be wrapped in dim ANSI');
  assert.match(out, /\x1b\[2mchanges\x1b\[0m/, '"changes" should be wrapped in dim ANSI');
  assert.match(out, /\x1b\[32m\+5\x1b\[0m/, 'added count keeps green color');
  assert.match(out, /\x1b\[31m-3\x1b\[0m/, 'deleted count keeps red color');
});

test('showFileList=true brings back the bottom file list (independent of showFileStats)', () => {
  const ctx = baseCtx({
    config: mergeConfig({ gitStatus: { showFileStats: false, showFileList: true } }),
  });
  ctx.gitStatus = {
    branch: 'main',
    isDirty: true,
    ahead: 0,
    behind: 0,
    lineDiff: { added: 5, deleted: 3 },
    fileStats: {
      modified: 1,
      added: 0,
      deleted: 0,
      untracked: 0,
      trackedFiles: [{ basename: 'a.ts', fullPath: 'src/a.ts', type: 'modified', lineDiff: { added: 5, deleted: 3 } }],
    },
  };
  assert.doesNotMatch(stripAnsi(renderProjectLine(ctx)), /\+5 -3/, 'inline counter stays off when showFileStats=false');
  const fileLine = renderGitFilesLine(ctx, 120);
  assert.ok(fileLine, 'file list should render when showFileList=true');
  assert.match(stripAnsi(fileLine), /a\.ts/);
});
