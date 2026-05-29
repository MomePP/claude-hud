# Claude HUD — MomePP fork

A Claude Code plugin that shows what's happening — context usage, active tools, running agents, and todo progress. Always visible below your input.

**Personal fork** of [jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud), tuned primarily for [oh-my-claudecode](https://github.com/pangussion/oh-my-claudecode) (OMC) on Claude Code — including OMC orchestration awareness (active-mode indicator, `.omc` mission state) — with leftover compatibility for [OpenAgentsControl](https://github.com/openagentscontrol/oac) (OAC). If you're looking for the upstream, go there — this one is deliberately narrower in scope.

![Claude HUD in action](claude-hud-preview-5-2.png)

## Why this fork exists

| What upstream does | What this fork does |
|---|---|
| Displays `unknown` when an Agent tool call omits `subagent_type` | Falls back to the caller-supplied `name`, then `general-purpose` (the actual Claude Code default) |
| Renders namespaced agent types raw — `oac:code-execution`, `oh-my-claudecode:explore` | Strips the `namespace:` prefix and capitalizes — shows as `Code-execution`, `Explore`. Configurable via `display.agentNamespaceMode`: `strip` (default), `badge` (`[oac] Code-execution` — keeps orchestrator visible), or `raw` (pass-through). Same formatting also applies to the `Skill` tool target so `Skill: oac:context-discovery` becomes `Skill: Context-discovery` (or `Skill: [oac] Context-discovery` in badge mode) |
| Detects background agents only via the `input.run_in_background` flag, and completes them only when Claude Code emits a `queue-operation` enqueue event. Misses OAC's `<task-notification>` completion path entirely | **Hybrid background-agent tracking.** Detection: `input.run_in_background` is the primary signal (structural, robust to wording changes), with the legacy `"Async agent launched"` tool_result prefix kept as a fallback for old transcripts. Completion: accepts either `<task-notification status="completed">` blocks **or** `queue-operation` enqueue events — whichever arrives first wins, with the queue-op timestamp used for accurate finish time. The notification path keeps OAC's `oac:parallel-execution` flow working; the queue-op path matches upstream's accuracy gains |
| Doesn't understand OMC's `proxy_Edit` / `proxy_Task` shim | Strips `proxy_` and routes them identically to native tools (OMC-only; OAC uses native tools and `Skill`, no proxy layer) |
| Streams the whole transcript every ~300ms | Reads only the last 4MB for big sessions (long-OAC-orchestrator perf win) |
| Cross-platform (darwin / linux / win32 / powershell), CI-tested | Cross-platform too, via **per-platform launcher scripts** (`.sh` for macOS/Linux/Git-Bash, `.ps1` for PowerShell) — but **Windows is experimental**: the maintainer develops on macOS/Linux and runs no CI, so Windows is best-effort and untested |
| CI builds + auto-commits `dist/` after each merge | **No CI** — `dist/` is committed directly; run `npm run build` before committing |
| Setup writes a 240-character dynamic bash one-liner into `settings.json` | Ships launcher scripts (`scripts/claude-hud.sh`, `scripts/claude-hud.ps1`); `settings.json` just points at the one for your shell |
| — | Inline project-line indicators: thinking (`∿ thinking`), pending permission (`? target (waiting Ns)`), and last-request tokens (`last: 12k→678`, with `(+Xk)` when reasoning tokens are present) |
| Dropped `colors.thinking` and `colors.duration` overrides — the inline thinking glyph and session-duration token now share the generic label color | Keeps `colors.thinking` and `colors.duration` as independent overrides so the `∿ thinking` glyph and the `<glyph> 1h 30m` duration token can be themed separately from `Context` / `Usage` labels |
| `colors.barFilled` / `colors.barEmpty` are required strings — overriding either forces a custom character set even when `display.barStyle` is set, and dropping them from the config silently falls back to upstream defaults | `colors.barFilled?` / `colors.barEmpty?` are **optional** — when unset, `display.barStyle` controls bar characters end-to-end. Set either explicitly only for fine-grained per-character overrides without losing the style preset |
| Default colors `model: cyan`, `project: yellow`, `gitBranch: cyan` (starship-aligned) | Keeps the earlier fork defaults `model: green`, `project: cyan`, `gitBranch: brightMagenta` — change-on-merge would re-theme every existing fork user's HUD, so they stay pinned |

## Limitations

- **Windows is experimental.** As of 0.5.0 the fork ships a PowerShell launcher (`scripts/claude-hud.ps1`) and Windows setup instructions, and the runtime is cross-platform (path handling, `.cmd`/`.bat` version probing, etc.). But the maintainer develops on macOS/Linux and runs **no CI**, so Windows is untested and best-effort — report breakage via an issue. On Windows + Git Bash, use the `.sh` launcher.
- **No automated CI.** Tests and builds run locally. Dependency bumps won't be auto-gated; you're on your own to verify.
- **Remember to rebuild.** `dist/` is tracked — run `npm run build` before committing source changes so the shipped bundle stays in sync.
- **Upstream drift.** Not a live mirror. The fork is periodically **rebased onto the current upstream base** — upstream as the root, fork patches replayed cleanly on top, linear history — rather than merged (which would leave `main` carrying both lineages). Most recently synced to upstream [`be9902a`](https://github.com/jarrodwatts/claude-hud) (2026-05), adopting its session-token dedup, BCP-47 language tags (`zh`→`zh-Hans`), and OSC 8 truncation fix. See `CLAUDE.md` → "Merging from Upstream" for the procedure.

## Install

> **Latest release: [v0.5.1](https://github.com/MomePP/claude-hud/releases/tag/v0.5.1).** `/plugin install` always pulls the newest version from the marketplace — no version pinning needed.

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

Chinese HUD labels are available as an explicit opt-in. English stays the default unless you choose `中文` in `/claude-hud:configure` or set `language` in config. The short `zh` alias remains valid, and new guided config writes the canonical `zh-Hans` value.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `language` | `en` \| `zh` \| `zh-Hans` | `en` | HUD label language. English is the default; set `zh` or `zh-Hans` to enable Simplified Chinese labels. |
| `lineLayout` | string | `expanded` | Layout: `expanded` (multi-line) or `compact` (single line) |
| `pathLevels` | 1-3 | 1 | Directory levels to show in project path |
| `maxWidth` | number \| `null` | `null` | Hard fallback width used only when terminal-width detection fails completely (tmux edge cases, weird TTYs). Inherited from upstream 0.1.0. |
| `forceMaxWidth` | boolean | false | Always use `maxWidth` when it is set, even if terminal width detection returns a smaller value. Inherited from upstream. |
| `elementOrder` | string[] | `["project","context","usage","promptCache","memory","environment","tools","agents","todos","sessionTime"]` | Expanded-mode element order. Omit entries to hide them in expanded mode. `sessionTime` is opt-in via `showSessionStartDate` / `showLastResponseAt`. Existing configs keep their explicit order until updated. |
| `gitStatus.enabled` | boolean | true | Show git branch in HUD |
| `gitStatus.showDirty` | boolean | true | Show `*` for uncommitted changes |
| `gitStatus.showAheadBehind` | boolean | false | Show `↑N ↓N` for ahead/behind remote |
| `gitStatus.pushWarningThreshold` | number | 0 | Color the ahead count with the warning color at or above this unpushed-commit count (`0` disables it) |
| `gitStatus.pushCriticalThreshold` | number | 0 | Color the ahead count with the critical color at or above this unpushed-commit count (`0` disables it) |
| `gitStatus.showFileStats` | boolean | false | Show inline line-diff counter `+A -D` next to the branch on the project line. In compact (single-line) layout it instead emits the Starship-style `!M +A ✘D ?U` summary. |
| `gitStatus.showFileList` | boolean | false | Show the bottom multi-line list of changed files (`~src/foo.ts(+5 -3)  +src/new.ts  ?2`). Independent of `showFileStats` so you can keep the inline counter without the bottom list. When unset, falls back to `showFileStats` for upstream compat. |
| `gitStatus.branchOverflow` | `truncate` \| `wrap` | `truncate` | In **pipes** mode only, `wrap` lets a long branch name render on its own line (project + `git:(...)` become two parts joined by ` │ `). Inherited from upstream. |
| `display.showModel` | boolean | true | Show model name `[Opus]` |
| `display.showAddedDirs` | boolean | true | Show extra workspace directories from `/add-dir` (e.g. `+sparkle +lib-foo`); empty array renders nothing. In both layouts at most 5 dirs render (overflow shown as `+N more`) and basenames are truncated to 24 chars with `…` |
| `display.addedDirsLayout` | `inline` \| `line` | `inline` | `inline` puts dirs next to the project name with a `+name` prefix per dir; `line` renders them on a separate `Added dirs: name1, name2` line (no `+` prefix, comma-separated). **Note**: inline layout currently renders only in `display.projectStyle: 'pipes'`. Users on `natural` project style should set this to `'line'` to see `/add-dir` entries. |
| `display.showContextBar` | boolean | true | Show visual context bar `████░░░░░░` |
| `display.contextValue` | `percent` \| `tokens` \| `remaining` \| `both` | `percent` | Context display format (`45%`, `45k/200k`, `55%` remaining, or `45% (45k/200k)`) |
| `display.showConfigCounts` | boolean | false | Show CLAUDE.md, rules, MCPs, hooks counts |
| `display.showCost` | boolean | false | Show session cost using Claude Code's native `cost.total_cost_usd` when available, with a local estimate fallback for direct Anthropic sessions |
| `display.showOutputStyle` | boolean | false | Show the active Claude Code `outputStyle` from settings files as `style: <name>` |
| `display.showDuration` | boolean | false | Show session duration `⏱️ 5m` |
| `display.showSpeed` | boolean | false | Show output token speed `out: 42.1 tok/s` |
| `display.showUsage` | boolean | true | Show Claude subscriber usage limits when available |
| `display.usageValue` | `percent` \| `remaining` | `percent` | Usage display format (`25%` used, or `75%` remaining) |
| `display.usageBarEnabled` | boolean | true | Display usage as visual bar instead of text |
| `display.sevenDayThreshold` | 0-100 | 80 | Show 7-day usage when >= threshold (0 = always) |
| `display.contextWarningThreshold` | 0-100 | 70 | Context-bar percentage at which colours switch from `colors.context` to `colors.warning`. Inherited from upstream. |
| `display.contextCriticalThreshold` | 0-100 | 85 | Context-bar percentage at which colours switch to `colors.critical` and the token breakdown unlocks. Inherited from upstream. |
| `display.usageThreshold` | 0-100 | 0 | Hide the 5-hour usage bar/text until usage reaches this percentage (`0` = always show). Inherited from upstream. |
| `display.environmentThreshold` | 0-100 | 0 | Hide the environment counts line (`CLAUDE.md / rules / MCPs / hooks`) until at least this many entries exist (`0` = always show). Inherited from upstream. |
| `display.showTokenBreakdown` | boolean | true | Show token details once context reaches `display.contextCriticalThreshold` (default 85%) |
| `display.showTools` | boolean | false | Show tools activity line |
| `display.toolNameMaxLength` | number | `0` | Maximum displayed tool-name length. `0` keeps full names; MCP names may shorten to their final segment when truncating |
| `display.toolsMaxVisible` | number | `4` | Maximum completed tools shown on the tools line. `0` means unlimited |
| `display.showAgents` | boolean | false | Show agents activity line |
| `display.showTodos` | boolean | false | Show todos progress line |
| `display.showSessionName` | boolean | false | Show session slug or custom title from `/rename` |
| `display.showSessionStartDate` | boolean | false | Show the transcript session start timestamp |
| `display.showLastResponseAt` | boolean | false | Show how long ago the last assistant response was written |
| `display.showClaudeCodeVersion` | boolean | false | Show the installed Claude Code version, e.g. `CC v2.1.81` |
| `display.showMemoryUsage` | boolean | false | Show an approximate system RAM usage line in expanded layout |
| `display.showThinkingIndicator` | boolean | true | Inline `∿ thinking` glyph on the project line while extended thinking is active (30s decay window) |
| `display.showPendingPermission` | boolean | true | Inline `? <target> (waiting Ns)` hint on the project line while an Edit/Write/Bash permission prompt is pending. Counter ticks until the matching `tool_result` lands; capped at a 5-minute wall-clock window with a 30s interrupt-grace check |
| `display.showLastRequestTokens` | boolean | false | Inline `last: 12k→678` counter showing the most recent assistant turn's input and output tokens; appends `(+Xk)` when reasoning tokens are present |
| `display.showEffortLevel` | boolean | false | Append the active reasoning effort to the model bracket, e.g. `[Opus · high]`. Inherited from upstream. |
| `display.showPromptCache` | boolean | false | Show a dedicated prompt-cache countdown line (`promptCache` element). Inherited from upstream. |
| `display.promptCacheTtlSeconds` | number | 300 | Prompt-cache TTL used to compute the countdown on the prompt-cache line. Inherited from upstream. |
| `display.timeFormat` | `relative` \| `absolute` \| `both` \| `elapsed` \| `elapsedAndAbsolute` | `relative` | Reset-time format for usage windows: `relative` = `in 1h 30m`, `absolute` = `at 5:30 PM`, `both` = both, `elapsed` = how far through each window you are (`53% elapsed`), `elapsedAndAbsolute` = elapsed progress plus wall-clock reset. Inherited from upstream. |
| `display.showResetLabel` | boolean | true | Toggle the `resets in` / `resets at` prefix on reset-time suffixes. Inherited from upstream. |
| `display.usageCompact` | boolean | false | Shorter usage display — `5h: 25% (1h 30m)` instead of the full bar. Inherited from upstream. |
| `display.mergeGroups` | `HudElement[][]` | `[["context","usage"]]` | Expanded-layout element groups that merge onto a single line when adjacent in `elementOrder`. Set `[]` to disable. Inherited from upstream. |
| `display.projectStyle` | `pipes` \| `natural` | `pipes` | Project-line layout. `pipes` keeps the classic `[Opus] │ project git:(branch)` shape. `natural` switches to a starship-style `<glyph> Opus in project on branch` prose layout, drops `[]` brackets and `git:( )` wrappers, and uses `display.naturalSeparator` between segments. |
| `display.naturalSeparator` | string (≤8 chars) | ` · ` | Separator inserted between sections in `natural` project style (and between Context/Usage when they share a line in expanded layout). Examples: `" · "`, `" | "`, `" "`, `"  "`. |
| `display.modelGlyph` | string (≤8 chars) | `` (Nerd Font sparkle `nf-cod-sparkle`, U+EC10) | Glyph rendered immediately before the model name in `natural` project style. Set to `""` to disable. Pick a glyph that exists in your terminal font — older Nerd Font patches without the codicon block won't show U+EBxx/ECxx; FontAwesome range (U+F000–U+F2E0) is the safest fallback (try `` U+F0D0 wand or `` U+F2DC snowflake). |
| `display.projectGlyph` | string (≤8 chars) | `` (Nerd Font outlined folder `nf-fa-folder_o`, U+F114) | Glyph rendered between `in` and the project name in `natural` project style. Set to `""` to disable. Try `` U+F07B filled folder, `` U+F115 open-folder, or `` U+EB83 codicon-folder. |
| `display.branchGlyph` | string (≤8 chars) | `` (Nerd Font git-branch `nf-dev-git_branch`, U+E725) | Glyph rendered between `on` and the branch name in `natural` project style. Set to `""` to disable. Try `` U+F126 FontAwesome code-branch as a more widely-supported fallback. |
| `display.durationGlyph` | string (≤8 chars) | `` (Nerd Font clock `nf-fa-clock_o`, U+F017) | Glyph rendered before the session-duration value (replaces the legacy ⏱️ emoji). Applies to both `pipes` and `natural` modes. Set to `""` to drop the glyph entirely, or set to `⏱️ ` to keep the emoji. |
| `display.barStyle` | `block` \| `square` \| `thin` \| `vertical` \| `dots` \| `shade` \| `double` | `block` | Character set for context, usage, and memory bars. `block` = `█░` (default, dense), `square` = `▰▱` (starship-like), `thin` = `━─` (minimal), `vertical` = `▮▯` (recognizable progress bars), `dots` = `●○` (distinctive), `shade` = `▓░` (soft gradient), `double` = `═─` (double-line tracks). |
| `display.agentNamespaceMode` | `strip` \| `badge` \| `raw` | `strip` | How namespaced subagent types and `Skill` targets are rendered. `strip` drops the `<ns>:` prefix and capitalizes (`oh-my-claudecode:explore` → `Explore`); `badge` keeps the namespace as a leading tag, abbreviating `oh-my-claudecode` → `omc` (`oh-my-claudecode:explore` → `[omc] Explore`) — useful when running OMC and OAC in the same session; `raw` passes the slug through untouched. Applies to both the agents line and the `Skill` tool target on the tools line. |
| `display.showOmcMode` | boolean | `true` | Show an inline OMC orchestration indicator on the project line (`⚙ <mode> 2/5`) when an oh-my-claudecode mission is active in `<cwd>/.omc/state/`. Shows the active mode (ralph / ultrawork / autopilot / team / …) and task progress. Renders nothing when no `.omc` mission is active. |
| `display.showOmcState` | boolean | `false` | Opt-in extra line surfacing the current OMC mission: `◆ <mode>: <objective> (done/total) · N agents`, read from `<cwd>/.omc/state/`. Off by default. |
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
| `colors.thinking` | color value | `dim` | Color for the inline `∿ thinking` indicator (defaults to dim so it stays out of the way; override with any named color, 256-color number, or hex). |
| `colors.duration` | color value | `dim` | Color for the session-duration extra (the `<glyph> 1h 30m` token). Independent of `colors.label` so you can keep `Context`/`Usage` labels dim while bumping the duration. |
| `colors.barFilled` | string | _(unset — uses `display.barStyle`)_ | Character used for the filled portion of progress bars. When set, overrides `display.barStyle`'s filled character. When unset (default), bars use the `display.barStyle` character set. Inherited from upstream. |
| `colors.barEmpty` | string | _(unset — uses `display.barStyle`)_ | Character used for the empty portion of progress bars. When set, overrides `display.barStyle`'s empty character. When unset (default), bars use the `display.barStyle` character set. Inherited from upstream. |

`colors.barFilled` and `colors.barEmpty` accept a single visible grapheme. Control characters, invisible format characters (bidi controls, zero-width joiners, variation selectors), line/paragraph separators, and noncharacters are rejected. Wide characters (emoji, CJK) may affect bar alignment depending on the terminal.

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

Set `display.usageValue` to `remaining` to show quota left instead of quota used. Warning colors and 7-day threshold checks still use the underlying used percentage.

If you do opt into the local sidecar fallback by setting `display.externalUsagePath` (inherited from upstream), the snapshot must be fresh enough (`display.externalUsageFreshnessMs`) and include a valid `updated_at`, plus a `five_hour` window, `seven_day` window, or `balance_label`. `balance_label` is optional text for prepaid provider balances (e.g. `¥6.35`); it is trimmed, length-limited, and sanitized before display.

Set `display.externalUsageWritePath` if you want ClaudeHUD to write the official stdin `rate_limits` into a local snapshot for other tools. The path must be absolute, end in `.json`, and live in an existing directory. ClaudeHUD writes the file with private permissions and ignores invalid paths quietly.

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
  "elementOrder": ["project", "tools", "context", "usage", "memory", "environment", "agents", "todos", "sessionTime"],
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

### Orchestrator-compat tests

Parser-behavior tests for orchestrator compatibility — agent-type fallback (OAC + OMC), namespaced subagent rendering (`oac:code-execution`, `oh-my-claudecode:explore`), background-agent completion via `<task-notification>`, OMC's `proxy_` stripping, and tail-parsing — live in `tests/transcript-omc.test.js` (file kept under the legacy name to preserve git history). Run them on their own:

```bash
node --test tests/transcript-omc.test.js
```

---

## Credit

All of the HUD rendering, configuration flow, preset logic, and design choices come from
[jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud). This fork is a thin layer of orchestrator-compat fixes (primarily for OMC on Claude Code, secondarily for OAC) and perf tweaks on top.

## License

MIT — see [LICENSE](LICENSE)
