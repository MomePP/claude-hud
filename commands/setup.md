---
description: Configure claude-hud as your statusline
allowed-tools: Bash, Read, Edit, AskUserQuestion
---

Configure `claude-hud` as the Claude Code statusline.

The plugin ships per-platform launchers that resolve the highest-versioned
installed copy at every invocation, cache that path, and hand off to `node`.
Your `settings.json` just points at the right launcher for the active shell:

- **macOS / Linux / Windows + Git Bash (MSYS)** → `scripts/claude-hud.sh` (bash).
- **Windows + PowerShell / cmd** → `scripts/claude-hud.ps1` (PowerShell).

> **Windows is experimental** — the maintainer develops on macOS/Linux and does
> not test Windows. The runtime is cross-platform, but the Windows launcher and
> setup path are best-effort. On Windows + Git Bash, prefer the `.sh` launcher:
> bash mangles PowerShell variable syntax before PowerShell runs.

**Pick the launcher by environment context.** Check `Platform:` and `Shell:`. On
`win32` with `Shell: powershell`/`pwsh`/`cmd`, also run `echo $OSTYPE`: if it
returns `msys` or `cygwin`, the active command environment is Git Bash — use the
`.sh` launcher and the bash steps below, not PowerShell.

## Step 1: Locate the launcher

Find the newest installed version's launcher.

**macOS / Linux / Git Bash** (bash):

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

**Windows + PowerShell**:

```powershell
$claudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }
$base = Join-Path $claudeDir "plugins\cache\claude-hud\claude-hud"
$latest = Get-ChildItem -Directory $base -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -as [version] } |
  Sort-Object { [version]$_.Name } | Select-Object -Last 1
$launcher = if ($latest) { Join-Path $latest.FullName "scripts\claude-hud.ps1" } else { $null }
if ($launcher -and (Test-Path $launcher)) { $launcher } else { "NOT_INSTALLED" }
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

**macOS / Linux / Git Bash**:

```bash
echo '{"model":{"display_name":"Opus"},"context_window":{"current_usage":{"input_tokens":45000},"context_window_size":200000},"transcript_path":"/tmp/__hud_probe"}' \
  | bash "$LAUNCHER"
```

**Windows + PowerShell**:

```powershell
'{"model":{"display_name":"Opus"},"context_window":{"current_usage":{"input_tokens":45000},"context_window_size":200000},"transcript_path":"C:\\Temp\\__hud_probe"}' | powershell -NoProfile -ExecutionPolicy Bypass -File $launcher
```

It should print 1–2 HUD lines within a second. If it errors, debug before
writing the config.

## Step 4: Write `settings.json`

Merge this into `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json`, preserving
every other key the user has set.

**macOS / Linux / Git Bash** — point at the `.sh` launcher:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash \"<absolute .sh path from Step 1>\""
  }
}
```

**Windows + PowerShell** — point at the `.ps1` launcher (paths use `\\` in JSON):

```json
{
  "statusLine": {
    "type": "command",
    "command": "powershell -NoProfile -ExecutionPolicy Bypass -File \"<absolute .ps1 path from Step 1>\""
  }
}
```

> **Windows notes.** `-ExecutionPolicy Bypass` lets the launcher run without
> changing the machine's global execution policy. If `powershell` (Windows
> PowerShell 5.1) isn't present, substitute `pwsh` (PowerShell 7+) — the flags
> are identical. `node` must be on the PATH of the shell Claude Code spawns; if
> the HUD is blank, first confirm `node -v` works in that shell.

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
   On Windows + PowerShell the cache file is `.cached_hud_entry_ps` instead:
   ```powershell
   $d = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }
   Remove-Item (Join-Path $d ".cached_hud_entry_ps") -ErrorAction SilentlyContinue
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
6. **Windows: HUD blank or erroring.** Confirm `node -v` runs in the shell Claude
   Code uses — a missing `node` on PATH is the most common cause (the launcher
   exits quietly rather than erroring). If PowerShell refuses to run the launcher,
   the `statusLine` command must include `-ExecutionPolicy Bypass` (re-run
   `/claude-hud:setup` to rewrite it), or switch `powershell` → `pwsh`. On Git
   Bash sessions, use the `.sh` launcher instead of the PowerShell one.

Show the user the exact `command` written to `settings.json` plus the error
from Step 3 so they can open an issue if it's not in this list.
