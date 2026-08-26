import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderUsageLine, renderWeeklyUsageLine } from '../dist/render/lines/usage.js';
import { mergeConfig } from '../dist/config.js';

function stripAnsi(str) {
  return String(str)
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

// sevenDay defaults above the 80 threshold so the weekly part is in play; each
// test overrides what it needs.
function baseContext(displayOverrides = {}, usageOverrides = {}) {
  return {
    stdin: {
      model: { display_name: 'Opus' },
      context_window: {
        context_window_size: 200000,
        current_usage: { input_tokens: 10000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      },
    },
    transcript: { tools: [], skills: [], mcpServers: [], agents: [], todos: [] },
    usageData: {
      fiveHour: 25,
      sevenDay: 86,
      fiveHourResetAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
      sevenDayResetAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      balanceLabel: null,
      ...usageOverrides,
    },
    config: {
      lineLayout: 'expanded',
      display: {
        showUsage: true,
        usageBarEnabled: true,
        usageValue: 'percent',
        showResetLabel: true,
        usageThreshold: 0,
        sevenDayThreshold: 80,
        sevenDayLayout: 'inline',
        ...displayOverrides,
      },
      colors: undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// config validation
// ---------------------------------------------------------------------------

test('mergeConfig defaults sevenDayLayout to "inline"', () => {
  assert.equal(mergeConfig({}).display.sevenDayLayout, 'inline');
});

test('mergeConfig accepts "line"', () => {
  assert.equal(mergeConfig({ display: { sevenDayLayout: 'line' } }).display.sevenDayLayout, 'line');
});

test('mergeConfig rejects an invalid sevenDayLayout and falls back to "inline"', () => {
  assert.equal(mergeConfig({ display: { sevenDayLayout: 'stacked' } }).display.sevenDayLayout, 'inline');
  assert.equal(mergeConfig({ display: { sevenDayLayout: 7 } }).display.sevenDayLayout, 'inline');
});

// ---------------------------------------------------------------------------
// inline (default) — unchanged behavior
// ---------------------------------------------------------------------------

test('inline keeps Weekly on the usage line and emits no separate line', () => {
  const ctx = baseContext();
  const line = stripAnsi(renderUsageLine(ctx));
  assert.match(line, /Weekly/);
  // Separated from the 5h window — by display.naturalSeparator / projectStyle,
  // not the hardcoded pipe this used to assert.
  assert.match(line, /25%.+Weekly/, `expected Weekly to follow the 5h window: ${line}`);
  assert.equal(renderWeeklyUsageLine(ctx), null);
});

// ---------------------------------------------------------------------------
// line — the split
// ---------------------------------------------------------------------------

test('line drops Weekly from the usage line and returns it separately', () => {
  const ctx = baseContext({ sevenDayLayout: 'line' });
  const usage = stripAnsi(renderUsageLine(ctx));
  assert.doesNotMatch(usage, /Weekly/, `Weekly should have left the usage line, got: ${usage}`);

  const weekly = stripAnsi(renderWeeklyUsageLine(ctx));
  assert.match(weekly, /Weekly/);
  assert.match(weekly, /86%/);
});

test('line keeps the threshold gate — below it nothing renders on either line', () => {
  const ctx = baseContext({ sevenDayLayout: 'line' }, { sevenDay: 12 });
  assert.doesNotMatch(stripAnsi(renderUsageLine(ctx)), /Weekly/);
  assert.equal(renderWeeklyUsageLine(ctx), null);
});

test('line emits no weekly line when there is no seven-day data', () => {
  const ctx = baseContext({ sevenDayLayout: 'line' }, { sevenDay: null, sevenDayResetAt: null });
  assert.equal(renderWeeklyUsageLine(ctx), null);
});

test('the weekly line is a single line', () => {
  const weekly = renderWeeklyUsageLine(baseContext({ sevenDayLayout: 'line' }));
  assert.ok(weekly && !weekly.includes('\n'), `expected one line, got: ${JSON.stringify(weekly)}`);
});

test('the usage line stays single-line under "line" so merge groups still join it', () => {
  const usage = renderUsageLine(baseContext({ sevenDayLayout: 'line' }));
  assert.ok(usage && !usage.includes('\n'), `expected one line, got: ${JSON.stringify(usage)}`);
});

// ---------------------------------------------------------------------------
// fallbacks
// ---------------------------------------------------------------------------

test('usageCompact falls back to inline — no separate weekly line', () => {
  const ctx = baseContext({ sevenDayLayout: 'line', usageCompact: true });
  assert.match(stripAnsi(renderUsageLine(ctx)), /7d/);
  assert.equal(renderWeeklyUsageLine(ctx), null);
});

test('a weekly-only session keeps Weekly on the usage line', () => {
  // With no five-hour window there is nothing to split away from.
  const ctx = baseContext({ sevenDayLayout: 'line' }, { fiveHour: null, fiveHourResetAt: null });
  assert.match(stripAnsi(renderUsageLine(ctx)), /Weekly/);
  assert.equal(renderWeeklyUsageLine(ctx), null);
});

test('showUsage false suppresses the weekly line too', () => {
  const ctx = baseContext({ sevenDayLayout: 'line', showUsage: false });
  assert.equal(renderUsageLine(ctx), null);
  assert.equal(renderWeeklyUsageLine(ctx), null);
});
