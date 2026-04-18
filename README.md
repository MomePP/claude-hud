# Claude HUD — MomePP fork

A Claude Code plugin that shows what's happening — context usage, active tools, running agents, and todo progress. Always visible below your input.

**Personal fork** of [jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud), tuned for [oh-my-claudecode](https://github.com/pangussion/oh-my-claudecode) (OMC) and my own workflow. If you're looking for the upstream, go there — this one is deliberately narrower in scope.

![Claude HUD in action](claude-hud-preview-5-2.png)

## Why this fork exists

| What upstream does | What this fork does |
|---|---|
| Displays `unknown` when an Agent tool call omits `subagent_type` | Falls back to the caller-supplied `name`, then `general-purpose` (the actual Claude Code default) |
| Doesn't understand OMC's `proxy_Edit` / `proxy_Task` / etc. | Strips `proxy_` and routes them identically to native tools |
| Leaves background (`run_in_background`) agents stuck as "running" forever | Parses `<task-notification>` blocks to mark them completed |
| Streams the whole transcript every ~300ms | Reads only the last 4MB for big sessions (long session perf win) |
| Cross-platform (darwin / linux / win32 / powershell) | **macOS/Linux only** — Windows branches removed from setup |
| CI builds + auto-commits `dist/` after each merge | **No CI** — `dist/` is committed directly; run `npm run build` before committing |
| Setup writes a 240-character dynamic bash one-liner into `settings.json` | Ships a launcher at `scripts/claude-hud.sh`; `settings.json` just points at it |
| Agent labels render as `oh-my-claudecode:explore` | Strips the `namespace:` prefix and capitalizes — shows as `Explore` |
| — | Thinking-state and pending-permission indicators on the project line |

## Limitations

- **macOS / Linux only.** No Windows support — setup.md and CI paths for `win32` / PowerShell were removed. The source still tolerates `process.platform === 'win32'` incidentally (for case-insensitive path compares), but nothing is tested there.
- **No automated CI.** Tests and builds run locally. Dependency bumps won't be auto-gated; you're on your own to verify.
- **Remember to rebuild.** `dist/` is tracked — run `npm run build` before committing source changes so the shipped bundle stays in sync.
- **Upstream drift.** I cherry-pick upstream changes occasionally; this is not a live mirror.

## Install

```
/plugin marketplace add MomePP/claude-hud
/plugin install claude-hud
/reload-plugins
/claude-hud:setup
```

Then quit Claude Code and relaunch so the new `statusLine` config takes effect.

Linux users: if the install fails with `EXDEV: cross-device link not permitted`, set `TMPDIR` to a path on the same filesystem as your home directory before installing:

```bash
mkdir -p ~/.cache/tmp && TMPDIR=~/.cache/tmp claude
```

This is a [Claude Code platform limitation](https://github.com/anthropics/claude-code/issues/14799).

---

## What is Claude HUD?

Claude HUD gives you better insights into what's happening in your Claude Code session.

| What You See | Why It Matters |
|--------------|----------------|
| **Project path** | Know which project you're in (configurable 1-3 directory levels) |
| **Context health** | Know exactly how full your context window is before it's too late |
| **Tool activity** | Watch Claude read, edit, and search files as it happens |
| **Agent tracking** | See which subagents are running and what they're doing |
| **Todo progress** | Track task completion in real-time |

## What You See

### Default (2 lines)
```
[Opus] │ my-project git:(main*)
Context █████░░░░░ 45% │ Usage ██░░░░░░░░ 25% (1h 30m / 5h)
```
- **Line 1** — Model, provider label when positively identified (for example `Bedrock`), project path, git branch
- **Line 2** — Context bar (green → yellow → red) and usage rate limits

### Optional lines (enable via `/claude-hud:configure`)
```
◐ Edit: auth.ts | ✓ Read ×3 | ✓ Grep ×2        ← Tools activity
◐ explore [haiku]: Finding auth code (2m 15s)    ← Agent status
▸ Fix authentication bug (2/5)                   ← Todo progress
```

---

## How It Works

Claude HUD uses Claude Code's native **statusline API** — no separate window, no tmux required, works in any terminal.

```
Claude Code → stdin JSON → claude-hud → stdout → displayed in your terminal
           ↘ transcript JSONL (tools, agents, todos)
```

**Key features:**
- Native token data from Claude Code (not estimated)
- Scales with Claude Code's reported context window size, including newer 1M-context sessions
- Parses the transcript for tool/agent activity
- Updates every ~300ms

---

## Configuration

Customize your HUD anytime:

```
/claude-hud:configure
```

The guided flow handles layout, language, and common display toggles. Advanced overrides such as
custom colors and thresholds are preserved there, but you set them by editing the config file directly:

- **First time setup**: Choose a preset (Full/Essential/Minimal), pick a label language, then fine-tune individual elements
- **Customize anytime**: Toggle items on/off, adjust git display style, switch layouts, or change label language
- **Preview before saving**: See exactly how your HUD will look before committing changes

### Presets

| Preset | What's Shown |
|--------|--------------|
| **Full** | Everything enabled — tools, agents, todos, git, usage, duration |
| **Essential** | Activity lines + git status, minimal info clutter |
| **Minimal** | Core only — just model name and context bar |

After choosing a preset, you can turn individual elements on or off.

### Manual Configuration

Edit `~/.claude/plugins/claude-hud/config.json` directly for advanced settings such as `colors.*`,
`pathLevels`, and threshold overrides. Running `/claude-hud:configure` preserves those manual settings while still letting you change `language`, layout, and the common guided toggles.

Chinese HUD labels are available as an explicit opt-in. English stays the default unless you choose `中文` in `/claude-hud:configure` or set `language` in config.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `language` | `en` \| `zh` | `en` | HUD label language. English is the default; set `zh` to enable Chinese labels. |
| `lineLayout` | string | `expanded` | Layout: `expanded` (multi-line) or `compact` (single line) |
| `pathLevels` | 1-3 | 1 | Directory levels to show in project path |
| `elementOrder` | string[] | `["project","context","usage","memory","environment","tools","agents","todos"]` | Expanded-mode element order. Omit entries to hide them in expanded mode. |
| `gitStatus.enabled` | boolean | true | Show git branch in HUD |
| `gitStatus.showDirty` | boolean | true | Show `*` for uncommitted changes |
| `gitStatus.showAheadBehind` | boolean | false | Show `↑N ↓N` for ahead/behind remote |
| `gitStatus.pushWarningThreshold` | number | 0 | Color the ahead count with the warning color at or above this unpushed-commit count (`0` disables it) |
| `gitStatus.pushCriticalThreshold` | number | 0 | Color the ahead count with the critical color at or above this unpushed-commit count (`0` disables it) |
| `gitStatus.showFileStats` | boolean | false | Show inline line-diff counter `+A -D` next to the branch on the project line. In compact (single-line) layout it instead emits the Starship-style `!M +A ✘D ?U` summary. |
| `gitStatus.showFileList` | boolean | false | Show the bottom multi-line list of changed files (`~src/foo.ts(+5 -3)  +src/new.ts  ?2`). Independent of `showFileStats` so you can keep the inline counter without the bottom list. |
| `display.showModel` | boolean | true | Show model name `[Opus]` |
| `display.showContextBar` | boolean | true | Show visual context bar `████░░░░░░` |
| `display.contextValue` | `percent` \| `tokens` \| `remaining` \| `both` | `percent` | Context display format (`45%`, `45k/200k`, `55%` remaining, or `45% (45k/200k)`) |
| `display.showConfigCounts` | boolean | false | Show CLAUDE.md, rules, MCPs, hooks counts |
| `display.showCost` | boolean | false | Show session cost using Claude Code's native `cost.total_cost_usd` when available, with a local estimate fallback for direct Anthropic sessions |
| `display.showOutputStyle` | boolean | false | Show the active Claude Code `outputStyle` from settings files as `style: <name>` |
| `display.showDuration` | boolean | false | Show session duration `⏱️ 5m` |
| `display.showSpeed` | boolean | false | Show output token speed `out: 42.1 tok/s` |
| `display.showUsage` | boolean | true | Show Claude subscriber usage limits when available |
| `display.usageBarEnabled` | boolean | true | Display usage as visual bar instead of text |
| `display.sevenDayThreshold` | 0-100 | 80 | Show 7-day usage when >= threshold (0 = always) |
| `display.showTokenBreakdown` | boolean | true | Show token details at high context (85%+) |
| `display.showTools` | boolean | false | Show tools activity line |
| `display.showAgents` | boolean | false | Show agents activity line |
| `display.showTodos` | boolean | false | Show todos progress line |
| `display.showSessionName` | boolean | false | Show session slug or custom title from `/rename` |
| `display.showClaudeCodeVersion` | boolean | false | Show the installed Claude Code version, e.g. `CC v2.1.81` |
| `display.showMemoryUsage` | boolean | false | Show an approximate system RAM usage line in expanded layout |
| `display.showThinkingIndicator` | boolean | true | Inline `∿ thinking` glyph on the project line while extended thinking is active (30s decay window) |
| `display.showPendingPermission` | boolean | true | Inline `? <target>` hint on the project line while an Edit/Write/Bash permission prompt is pending (≤3s window) |
| `display.showLastRequestTokens` | boolean | false | Inline `last: 12k→678` counter showing the most recent assistant turn's input and output tokens; appends `(+Xk)` when reasoning tokens are present |
| `display.projectStyle` | `pipes` \| `natural` | `pipes` | Project-line layout. `pipes` keeps the classic `[Opus] │ project git:(branch)` shape. `natural` switches to a starship-style `<glyph> Opus in project on branch` prose layout, drops `[]` brackets and `git:( )` wrappers, and uses `display.naturalSeparator` between segments. |
| `display.naturalSeparator` | string (≤8 chars) | ` · ` | Separator inserted between sections in `natural` project style (and between Context/Usage when they share a line in expanded layout). Examples: `" · "`, `" | "`, `" "`, `"  "`. |
| `display.modelGlyph` | string (≤8 chars) | `` (Nerd Font sparkle `nf-cod-sparkle`, U+EC10) | Glyph rendered immediately before the model name in `natural` project style. Set to `""` to disable. Pick a glyph that exists in your terminal font — older Nerd Font patches without the codicon block won't show U+EBxx/ECxx; FontAwesome range (U+F000–U+F2E0) is the safest fallback (try `` U+F0D0 wand or `` U+F2DC snowflake). |
| `display.projectGlyph` | string (≤8 chars) | `` (Nerd Font outlined folder `nf-fa-folder_o`, U+F114) | Glyph rendered between `in` and the project name in `natural` project style. Set to `""` to disable. Try `` U+F07B filled folder, `` U+F115 open-folder, or `` U+EB83 codicon-folder. |
| `display.branchGlyph` | string (≤8 chars) | `` (Nerd Font git-branch `nf-dev-git_branch`, U+E725) | Glyph rendered between `on` and the branch name in `natural` project style. Set to `""` to disable. Try `` U+F126 FontAwesome code-branch as a more widely-supported fallback. |
| `display.durationGlyph` | string (≤8 chars) | `` (Nerd Font clock `nf-fa-clock_o`, U+F017) | Glyph rendered before the session-duration value (replaces the legacy ⏱️ emoji). Applies to both `pipes` and `natural` modes. Set to `""` to drop the glyph entirely, or set to `⏱️ ` to keep the emoji. |
| `display.barStyle` | `block` \| `square` \| `thin` | `block` | Character set for context, usage, and memory bars. `block` = `█░` (default, dense), `square` = `▰▱` (modern, starship-like), `thin` = `━─` (minimal, single line). |
| `colors.context` | color value | `green` | Base color for the context bar and context percentage |
| `colors.usage` | color value | `brightBlue` | Base color for usage bars and percentages below warning thresholds |
| `colors.warning` | color value | `yellow` | Warning color for context thresholds and usage warning text |
| `colors.usageWarning` | color value | `brightMagenta` | Warning color for usage bars and percentages near their threshold |
| `colors.critical` | color value | `red` | Critical color for limit-reached states and critical thresholds |
| `colors.model` | color value | `green` | Color for the model badge such as `[Opus]`. Default mirrors starship runtime/version modules so model, project, and branch each get a distinct color. |
| `colors.project` | color value | `cyan` | Color for the project path. Default matches starship `directory`. |
| `colors.git` | color value | `magenta` | Color for git wrapper text such as `git:(` and `)` |
| `colors.gitBranch` | color value | `brightMagenta` | Color for the git branch and branch status text. Default matches starship `git_branch` (bold purple). |
| `colors.label` | color value | `dim` | Color for labels and secondary metadata such as `Context`, `Usage`, counts, and progress text |
| `colors.custom` | color value | `208` | Color for the optional custom line |

Supported color names: `dim`, `red`, `green`, `yellow`, `magenta`, `cyan`, `brightBlue`, `brightMagenta`. You can also use a 256-color number (`0-255`) or hex (`#rrggbb`).

`display.showMemoryUsage` is fully opt-in and only renders in `expanded` layout. It reports approximate system RAM usage from the local machine, not precise memory pressure inside Claude Code or a specific process. The number may overstate actual pressure because reclaimable OS cache and buffers can still be counted as used memory.

`display.projectStyle: "natural"` is a fork-only addition that swaps the dense bracketed/piped project line for a more readable starship-style line. Compare:

```
# pipes (default)
[Opus 4.7 (1M context)] │ claude-hud git:(main*)

# natural
 Opus 4.7 (1M context) in claude-hud on main*
```

Pair it with `gitStatus.showFileStats: true` and `gitStatus.showFileList: false` to keep just the inline `+5 -3` counter without the bottom file list. The default `naturalSeparator` (` · `) is used both between core/extras on the project line and between Context and Usage when they share a line in expanded layout.

`display.showThinkingIndicator`, `display.showPendingPermission`, and `display.showLastRequestTokens` are fork-only additions. Thinking and pending-permission default to on (they've shipped that way since 0.1.0 without being noisy in practice); the last-request token counter defaults to off because it renders on every assistant turn. All three share the project line, so they only appear when there's live state to show.

`display.showCost` is fully opt-in. ClaudeHUD prefers the native `cost.total_cost_usd` field that Claude Code provides on stdin when it is available. If that field is absent or invalid for a direct Anthropic session, ClaudeHUD falls back to the existing local transcript-based estimate so the cost line still works on older payloads. The native field is absent before the first API response in a session, so the cost display may stay hidden until then. ClaudeHUD also keeps the cost hidden for known routed providers such as Bedrock, because cloud-provider billed sessions may report `$0.00` or omit the field even though the session was not literally free.

### Usage Limits

Usage display is **enabled by default** when Claude Code provides subscriber `rate_limits` data on stdin. It shows your rate limit consumption on line 2 alongside the context bar.

ClaudeHUD intentionally trusts only the official statusline stdin payload for live usage. It does not read local OAuth credentials or poll undocumented usage endpoints in the background.

Free/weekly-only accounts render the weekly window by itself instead of showing a ghost `5h: --` placeholder.

The 7-day percentage appears when above the `display.sevenDayThreshold` (default 80%):

```
Context █████░░░░░ 45% │ Usage ██░░░░░░░░ 25% (1h 30m / 5h) | ██████████ 85% (2d / 7d)
```

To disable, set `display.showUsage` to `false`.

**Requirements:**
- Claude Code must include subscriber `rate_limits` data on stdin for the current session
- Not available for API-key-only users

**Troubleshooting:** If usage doesn't appear:
- Ensure you're logged in with a Claude subscriber account (not API key)
- Check `display.showUsage` is not set to `false` in config
- API users see no usage display (they have pay-per-token, not rate limits)
- AWS Bedrock models display `Bedrock` and hide usage limits (usage is managed in AWS)
- Claude Code may leave `rate_limits` empty until after the first model response in a session
- Some Claude Code builds and subscription tiers may still omit `rate_limits`, even after the first response
- When `rate_limits` is missing, ClaudeHUD will hide usage instead of falling back to credential scraping or undocumented API calls

### Example Configuration

```json
{
  "language": "zh",
  "lineLayout": "expanded",
  "pathLevels": 2,
  "elementOrder": ["project", "tools", "context", "usage", "memory", "environment", "agents", "todos"],
  "gitStatus": {
    "enabled": true,
    "showDirty": true,
    "showAheadBehind": true,
    "showFileStats": true
  },
  "display": {
    "showTools": true,
    "showAgents": true,
    "showTodos": true,
    "showConfigCounts": true,
    "showDuration": true,
    "showMemoryUsage": true
  },
  "colors": {
    "context": "cyan",
    "usage": "cyan",
    "warning": "yellow",
    "usageWarning": "magenta",
    "critical": "red",
    "model": "cyan",
    "project": "yellow",
    "git": "magenta",
    "gitBranch": "cyan",
    "label": "dim",
    "custom": "#FF6600"
  }
}
```

### Display Examples

**1 level (default):** `[Opus] │ my-project git:(main)`

**2 levels:** `[Opus] │ apps/my-project git:(main)`

**3 levels:** `[Opus] │ dev/apps/my-project git:(main)`

**With dirty indicator:** `[Opus] │ my-project git:(main*)`

**With ahead/behind:** `[Opus] │ my-project git:(main ↑2 ↓1)`

**With file stats:** `[Opus] │ my-project git:(main* !3 +1 ?2)`
- `!` = modified files, `+` = added/staged, `✘` = deleted, `?` = untracked
- Counts of 0 are omitted for cleaner display

### Troubleshooting

**Config not applying?**
- Check for JSON syntax errors: invalid JSON silently falls back to defaults
- Ensure valid values: `pathLevels` must be 1, 2, or 3; `lineLayout` must be `expanded` or `compact`
- Delete config and run `/claude-hud:configure` to regenerate

**Git status missing?**
- Verify you're in a git repository
- Check `gitStatus.enabled` is not `false` in config

**Tool/agent/todo lines missing?**
- These are hidden by default — enable with `showTools`, `showAgents`, `showTodos` in config
- They also only appear when there's activity to show

**HUD not appearing after setup?**
- Restart Claude Code so it picks up the new statusLine config
- On macOS, fully quit Claude Code and run `claude` again in your terminal

---

## Requirements

- Claude Code v1.0.80+
- Node.js 18+ (macOS/Linux)

---

## Development

```bash
git clone https://github.com/MomePP/claude-hud
cd claude-hud
npm ci && npm run build
npm test
```

After changing anything in `src/`, rebuild and commit `dist/` alongside the source — there's no CI that will do it for you.

### OMC-specific tests

The parser-behavior tests for OMC compatibility (proxy_ stripping, agent fallback, background-agent completion, tail-parsing) live in `tests/transcript-omc.test.js`. Run them on their own:

```bash
node --test tests/transcript-omc.test.js
```

---

## Credit

All of the HUD rendering, configuration flow, preset logic, and design choices come from
[jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud). This fork is a thin layer of OMC-specific fixes and perf tweaks on top.

## License

MIT — see [LICENSE](LICENSE)
