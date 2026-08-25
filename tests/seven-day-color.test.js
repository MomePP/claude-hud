import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderUsageLine, renderWeeklyUsageLine } from '../dist/render/lines/usage.js';
import { renderSessionLine } from '../dist/render/session-line.js';
import { mergeConfig } from '../dist/config.js';

// Truecolor SGR for a hex value, e.g. #ff8800 -> "\x1b[38;2;255;136;0m".
function sgr(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
}

const SEVEN_DAY = '#ff8800';
const BRIGHT_BLUE = '\x1b[94m';    // colors.usage default, the <75% band
const BRIGHT_MAGENTA = '\x1b[95m'; // colors.usageWarning default, the 75-89% band
const RED = '\x1b[31m';            // colors.critical default, the >=90% band

function ctx(displayOverrides = {}, colorOverrides = {}, usageOverrides = {}) {
  return {
    stdin: {
      model: { display_name: 'Opus' },
      context_window: {
        context_window_size: 200000,
        current_usage: { input_tokens: 10000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      },
    },
    transcript: { tools: [], skills: [], mcpServers: [], agents: [], todos: [] },
    sessionDuration: '',
    gitStatus: null,
    memoryUsage: null,
    usageData: {
      fiveHour: 20,
      sevenDay: 40,
      fiveHourResetAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
      sevenDayResetAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      balanceLabel: null,
      ...usageOverrides,
    },
    config: mergeConfig({
      lineLayout: 'expanded',
      display: {
        showUsage: true,
        usageBarEnabled: true,
        usageThreshold: 0,
        sevenDayThreshold: 0,
        sevenDayLayout: 'inline',
        ...displayOverrides,
      },
      colors: { ...colorOverrides },
    }),
  };
}

// Everything after the "Weekly" label, so 5-hour colours can't be mistaken for it.
function weeklyPart(line) {
  const at = line.indexOf('Weekly');
  assert.notEqual(at, -1, `no Weekly segment in: ${JSON.stringify(line)}`);
  return line.slice(at);
}

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

test('mergeConfig leaves colors.sevenDay unset by default', () => {
  assert.equal(mergeConfig({}).colors.sevenDay, undefined);
});

test('mergeConfig accepts hex, 256-color and named values', () => {
  assert.equal(mergeConfig({ colors: { sevenDay: '#ff8800' } }).colors.sevenDay, '#ff8800');
  assert.equal(mergeConfig({ colors: { sevenDay: 205 } }).colors.sevenDay, 205);
  assert.equal(mergeConfig({ colors: { sevenDay: 'brightBlue' } }).colors.sevenDay, 'brightBlue');
});

test('mergeConfig drops an invalid sevenDay rather than defaulting it', () => {
  assert.equal(mergeConfig({ colors: { sevenDay: 'chartreuse' } }).colors.sevenDay, undefined);
  assert.equal(mergeConfig({ colors: { sevenDay: 999 } }).colors.sevenDay, undefined);
});

// ---------------------------------------------------------------------------
// unset — the existing ladder is untouched
// ---------------------------------------------------------------------------

test('unset: weekly still walks the 75/90 ladder', () => {
  assert.ok(weeklyPart(renderUsageLine(ctx({}, {}, { sevenDay: 40 }))).includes(BRIGHT_BLUE));
  assert.ok(weeklyPart(renderUsageLine(ctx({}, {}, { sevenDay: 80 }))).includes(BRIGHT_MAGENTA));
  assert.ok(weeklyPart(renderUsageLine(ctx({}, {}, { sevenDay: 95 }))).includes(RED));
});

// ---------------------------------------------------------------------------
// set — one colour at every level
// ---------------------------------------------------------------------------

test('set: weekly uses colors.sevenDay across all three bands', () => {
  for (const pct of [40, 80, 95]) {
    const part = weeklyPart(renderUsageLine(ctx({}, { sevenDay: SEVEN_DAY }, { sevenDay: pct })));
    assert.ok(part.includes(sgr(SEVEN_DAY)), `expected the override at ${pct}%, got: ${JSON.stringify(part)}`);
  }
});

test('set: the ladder colours no longer appear on the weekly segment', () => {
  const part = weeklyPart(renderUsageLine(ctx({}, { sevenDay: SEVEN_DAY }, { sevenDay: 95 })));
  assert.ok(!part.includes(RED), `critical red leaked past the override: ${JSON.stringify(part)}`);
  assert.ok(!part.includes(BRIGHT_MAGENTA));
});

test('set: the 5-hour window keeps its own colours', () => {
  // Five-hour at 80 would be magenta under the ladder; the weekly override
  // must not reach it.
  const line = renderUsageLine(ctx({}, { sevenDay: SEVEN_DAY }, { fiveHour: 80, sevenDay: 40 }));
  const fiveHourPart = line.slice(0, line.indexOf('Weekly'));
  assert.ok(fiveHourPart.includes(BRIGHT_MAGENTA), `5h lost its warning colour: ${JSON.stringify(fiveHourPart)}`);
  assert.ok(!fiveHourPart.includes(sgr(SEVEN_DAY)), '5h picked up the weekly override');
});

// ---------------------------------------------------------------------------
// every weekly render path honors it
// ---------------------------------------------------------------------------

test('set: the separate weekly line honors it', () => {
  const line = renderWeeklyUsageLine(ctx({ sevenDayLayout: 'line' }, { sevenDay: SEVEN_DAY }, { sevenDay: 95 }));
  assert.ok(line && line.includes(sgr(SEVEN_DAY)), `expected the override, got: ${JSON.stringify(line)}`);
});

test('set: compact layout honors it', () => {
  const line = renderSessionLine(ctx({ usageCompact: true }, { sevenDay: SEVEN_DAY }, { sevenDay: 95 }));
  assert.ok(line.includes(sgr(SEVEN_DAY)), `expected the override in compact, got: ${JSON.stringify(line)}`);
});

test('set: a weekly-only session honors it', () => {
  const line = renderUsageLine(ctx({}, { sevenDay: SEVEN_DAY }, { fiveHour: null, fiveHourResetAt: null, sevenDay: 95 }));
  assert.ok(weeklyPart(line).includes(sgr(SEVEN_DAY)), `expected the override, got: ${JSON.stringify(line)}`);
});
