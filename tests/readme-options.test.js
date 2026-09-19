import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function tableOptionKeys(markdown) {
  return [...markdown.matchAll(/^\| `([A-Za-z][\w.]+)` \|/gm)].map((match) => match[1]);
}

// Fork divergence: upstream asserts exact table parity between the two READMEs.
// The fork documents its own options (natural style, orchestration, glyphs, …)
// in English only, and covers `externalUsage*` in prose rather than the table,
// so parity cannot hold. The invariant kept here is that the zh table never
// documents an option the English README has dropped.
test('README.zh.md documents only options the English README documents', () => {
  const en = readFileSync(join(root, 'README.md'), 'utf8');
  const zh = tableOptionKeys(readFileSync(join(root, 'README.zh.md'), 'utf8'));
  const stale = [...new Set(zh)].filter((key) => !en.includes(`\`${key}\``));
  assert.deepEqual(stale, []);
});

test('README.zh.md states that externalUsagePath must be absolute', () => {
  const zh = readFileSync(join(root, 'README.zh.md'), 'utf8');
  const row = zh.split('\n').find((line) => line.includes('`display.externalUsagePath`'));
  assert.ok(row, 'expected an externalUsagePath row');
  assert.match(row, /绝对路径/);
});
