import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { renderProjectLine } from '../dist/render/lines/project.js';
import { mergeConfig } from '../dist/config.js';

function stripAnsi(s) {
  return s
    .replace(/[][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

// `effortLevel` / `effortSymbol` reach the context already gated on
// display.showEffortLevel (src/index.ts), so a test that omits them is the
// showEffortLevel-off case.
function ctxWith(display, effort = { effortLevel: 'high', effortSymbol: '◑' }) {
  return {
    stdin: { model: { display_name: 'Opus' }, cwd: '/home/u/my-project' },
    transcript: { tools: [], agents: [], todos: [] },
    claudeMdCount: 0,
    rulesCount: 0,
    mcpCount: 0,
    hooksCount: 0,
    sessionDuration: '0s',
    gitStatus: null,
    usageData: null,
    memoryUsage: null,
    config: mergeConfig({ display: { showEffortLevel: true, showDuration: false, ...display } }),
    extraLabel: null,
    ...effort,
  };
}

const natural = { projectStyle: 'natural', modelGlyph: '' };

// ---------------------------------------------------------------------------
// the gap: natural style never rendered effort at all
// ---------------------------------------------------------------------------

test('natural style renders the effort level', () => {
  const line = stripAnsi(renderProjectLine(ctxWith(natural)));
  assert.match(line, /◑ high/, `expected effort in natural style, got: ${line}`);
});

test('natural and pipes agree on the effort text', () => {
  const naturalLine = stripAnsi(renderProjectLine(ctxWith(natural)));
  const pipesLine = stripAnsi(renderProjectLine(ctxWith({ projectStyle: 'pipes' })));
  assert.match(naturalLine, /◑ high/);
  assert.match(pipesLine, /◑ high/);
});

// ---------------------------------------------------------------------------
// effortFormat is honored, same as pipes
// ---------------------------------------------------------------------------

test('natural honors effortFormat: symbol', () => {
  const line = stripAnsi(renderProjectLine(ctxWith({ ...natural, effortFormat: 'symbol' })));
  assert.match(line, /◑/);
  assert.doesNotMatch(line, /high/, `symbol mode should drop the level text, got: ${line}`);
});

test('natural honors effortFormat: text', () => {
  const line = stripAnsi(renderProjectLine(ctxWith({ ...natural, effortFormat: 'text' })));
  assert.match(line, /high/);
  assert.doesNotMatch(line, /◑/, `text mode should drop the symbol, got: ${line}`);
});

test('natural keeps the full ultracode form under effortFormat: symbol', () => {
  // The ultracode marker lives in the level text, so the symbol alone cannot
  // represent it — same carve-out the pipes path makes.
  const line = stripAnsi(renderProjectLine(
    ctxWith({ ...natural, effortFormat: 'symbol' }, { effortLevel: 'ultracode(xhigh)', effortSymbol: '◕' }),
  ));
  assert.match(line, /ultracode\(xhigh\)/, `expected the full ultracode form, got: ${line}`);
});

// ---------------------------------------------------------------------------
// gates
// ---------------------------------------------------------------------------

test('natural renders no effort when the context carries none', () => {
  const line = stripAnsi(renderProjectLine(ctxWith(natural, { effortLevel: undefined, effortSymbol: undefined })));
  assert.doesNotMatch(line, /◑|high/, `expected no effort, got: ${line}`);
});

test('natural renders no effort when showModel is false', () => {
  // The effort suffix belongs to the model segment; with no model there is
  // nothing to suffix.
  const line = stripAnsi(renderProjectLine(ctxWith({ ...natural, showModel: false })));
  assert.doesNotMatch(line, /◑ high/, `expected no effort without a model, got: ${line}`);
});

// ---------------------------------------------------------------------------
// ordering vs the provider label
// ---------------------------------------------------------------------------

test('effort sits between the model and the provider, as in pipes', () => {
  const ctx = ctxWith(natural);
  ctx.stdin.model = { display_name: 'MiniMax-M2.7', id: 'MiniMax-M2.7' };
  ctx.stdin.env = { ANTHROPIC_BASE_URL: 'https://api.minimax.io/anthropic' };
  const line = stripAnsi(renderProjectLine(ctx));
  if (/MiniMax\)/.test(line)) {
    assert.match(line, /◑ high \(/, `effort should precede the provider paren, got: ${line}`);
  }
});

// ---------------------------------------------------------------------------
// added dirs — the second parity gap of the same class as effort
// ---------------------------------------------------------------------------

function withAddedDirs(ctx, dirs = ['/tmp/extra-one', '/tmp/extra-two']) {
  ctx.stdin.workspace = { added_dirs: dirs };
  return ctx;
}

test('natural renders inline added dirs', () => {
  const line = stripAnsi(renderProjectLine(withAddedDirs(
    ctxWith({ ...natural, showAddedDirs: true, addedDirsLayout: 'inline' }),
  )));
  assert.match(line, /\+extra-one/, `expected inline added dirs in natural style, got: ${line}`);
  assert.match(line, /\+extra-two/);
});

test('natural and pipes agree on inline added dirs', () => {
  const display = { showAddedDirs: true, addedDirsLayout: 'inline' };
  const naturalLine = stripAnsi(renderProjectLine(withAddedDirs(ctxWith({ ...natural, ...display }))));
  const pipesLine = stripAnsi(renderProjectLine(withAddedDirs(ctxWith({ projectStyle: 'pipes', ...display }))));
  for (const line of [naturalLine, pipesLine]) {
    assert.match(line, /\+extra-one/);
    assert.match(line, /\+extra-two/);
  }
});

test('natural keeps added dirs off the project line under addedDirsLayout: line', () => {
  // The addedDirs element renders them as their own line instead; showing both
  // would duplicate them.
  const line = stripAnsi(renderProjectLine(withAddedDirs(
    ctxWith({ ...natural, showAddedDirs: true, addedDirsLayout: 'line' }),
  )));
  assert.doesNotMatch(line, /\+extra-one/, `expected no inline added dirs, got: ${line}`);
});

test('natural honors showAddedDirs: false', () => {
  const line = stripAnsi(renderProjectLine(withAddedDirs(
    ctxWith({ ...natural, showAddedDirs: false, addedDirsLayout: 'inline' }),
  )));
  assert.doesNotMatch(line, /\+extra-one/, `expected added dirs suppressed, got: ${line}`);
});

test('natural places added dirs between the project and the branch, as in pipes', () => {
  const ctx = withAddedDirs(ctxWith({ ...natural, showAddedDirs: true, addedDirsLayout: 'inline' }));
  ctx.gitStatus = { isRepo: true, branch: 'main', dirty: false, ahead: 0, behind: 0 };
  const line = stripAnsi(renderProjectLine(ctx));
  const dirsAt = line.indexOf('+extra-one');
  const branchAt = line.indexOf('main');
  assert.ok(dirsAt > -1 && branchAt > -1, `expected both segments, got: ${line}`);
  assert.ok(dirsAt < branchAt, `added dirs should precede the branch, got: ${line}`);
});
