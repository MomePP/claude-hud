---
description: Configure claude-hud as your statusline
allowed-tools: Bash, Read, Edit, AskUserQuestion
---

Configure `claude-hud` as the Claude Code statusline. **macOS / Linux only** — this
fork intentionally dropped Windows support.

The plugin ships a launcher at `scripts/claude-hud.sh` that resolves the
highest-versioned installed copy at every invocation, caches that path, and
execs `node`. Your `settings.json` just points at that launcher.

## Step 1: Locate the launcher

Find the newest installed version's launcher:

```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
LATEST_DIR=$(
  ls -d "$CLAUDE_DIR"/plugins/cache/claude-hud/claude-hud/*/ 2>/dev/null \
    | awk -F/ '{print $(NF-1) "\t" $0}' \
    | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n \
    | tail -1 \
    | cut -f2-
)
LAUNCHER="${LATEST_DIR}scripts/claude-hud.sh"
[[ -f "$LAUNCHER" ]] && echo "$LAUNCHER" || echo "NOT_INSTALLED"
```

If the result is `NOT_INSTALLED`, run `/plugin install claude-hud` first, then
re-run this command.

## Step 2: Verify node is on PATH

```bash
command -v node
```

If empty, install Node.js (`brew install node` on macOS, or Node LTS from
https://nodejs.org/) and restart your shell before continuing.

## Step 3: Smoke-test the launcher

```bash
echo '{"model":{"display_name":"Opus"},"context_window":{"current_usage":{"input_tokens":45000},"context_window_size":200000},"transcript_path":"/tmp/__hud_probe"}' \
  | bash "$LAUNCHER"
```

It should print 1–2 HUD lines within a second. If it errors, debug before
writing the config.

## Step 4: Write `settings.json`

Merge this into `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json`, preserving
every other key the user has set:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash \"<absolute path from Step 1>\""
  }
}
```

- Use a real JSON serializer or editor API — never concatenate strings.
- If the file doesn't exist, create it with `{ "statusLine": ... }`.
- If it contains invalid JSON, report the error and stop — don't overwrite.
- If a write fails with `File has been unexpectedly modified`, re-read the
  file and retry the merge once.

After writing, tell the user:

> ✅ Config written. **Please restart Claude Code now** — quit and run `claude`
> again in your terminal. The HUD cannot appear in the session where setup ran.
>
> Want to customize the HUD? Run `/claude-hud:configure` after restart.

## Step 5: Verify

Ask with AskUserQuestion:
- Question: "After restarting Claude Code, is the HUD appearing below your
  input field?"
- Options: "Yes, it's working" / "No, something's wrong"

### If yes
Optionally offer to star the upstream repo:
```bash
command -v gh && gh repo star jarrodwatts/claude-hud
```
Only run if the user agrees.

### If no — debug

1. **Did you restart Claude Code?** The `statusLine` config only activates on a
   fresh session.
2. **Re-run the Step 3 smoke test manually** and capture output.
3. **Stale entry cache after upgrade**:
   ```bash
   rm "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.cached_hud_entry"
   ```
   The launcher rebuilds it on next invocation.
4. **Runtime moved** (common on macOS with mise/nvm/asdf after a version bump):
   ```bash
   command -v node
   ls -la "$(command -v node)"
   ```
   If `node` is a dead symlink, reinstall it and retry.
5. **Plugin pruned**: if the path in `settings.json` points at a version
   directory that no longer exists, re-run `/claude-hud:setup` to pick up the
   current version.

Show the user the exact `command` written to `settings.json` plus the error
from Step 3 so they can open an issue if it's not in this list.
