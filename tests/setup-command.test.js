import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Fork divergence from upstream #686: upstream asserts the `stty size` probe
// ordering inside the inline statusLine one-liners documented in
// commands/setup.md. This fork does not use inline one-liners — settings.json
// points at scripts/claude-hud.sh, so the probe lives there. The invariant is
// the same (a /dev/tty probe must not leak stderr when no tty is attached);
// only its location differs, so the test follows it to the launcher.
test('the POSIX launcher silences /dev/tty probe failures', async () => {
  const launcher = await readFile(new URL('../scripts/claude-hud.sh', import.meta.url), 'utf8');

  // Brace-grouped redirection silences stderr from a failing `</dev/tty`
  // redirection itself, not just from stty.
  assert.match(launcher, /\{ stty size <\/dev\/tty; \} 2>\/dev\/null/);
  assert.doesNotMatch(launcher, /stty size <\/dev\/tty(?!; \})/);
});
