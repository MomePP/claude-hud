# Changelog

All notable changes to Claude HUD will be documented in this file.

## [Unreleased]

## [0.3.2] - 2026-05-04 — MomePP fork (configurable namespace mode + Skill formatting)

Adds `display.agentNamespaceMode` to give users control over how
namespaced subagent types and `Skill` targets render. Default
(`strip`) preserves 0.3.1 output; `badge` is the new affordance for
multi-orchestrator users (OAC + OMC at once); `raw` restores the
pre-0.1.0 pass-through. The `Skill` tool target now flows through
the same formatter as agent types — both surfaces stay in sync.

### Added — fork
- `display.agentNamespaceMode` (`strip` | `badge` | `raw`, default `strip`).
  - `strip` — `oac:code-execution` → `Code-execution`,
    `Skill: oac:context-discovery` → `Skill: Context-discovery`.
  - `badge` — `oac:code-execution` → `[oac] Code-execution`,
    `Skill: oac:context-discovery` → `Skill: [oac] Context-discovery`.
    Keeps orchestrator visible; useful when OAC and OMC are both active.
  - `raw` — pass-through (`oac:code-execution`).
- New shared helper `src/render/format-namespace.ts`. `formatNamespaced(raw, mode)`
  is the single source of truth for namespace handling on both the agents
  line and the `Skill` tool target. `src/render/agents-line.ts` and
  `src/render/tools-line.ts` both call it; the previously inline
  `formatAgentType` logic was hoisted into the helper.
- New `formatToolTarget(toolName, rawTarget, mode)` in `src/render/tools-line.ts`
  routes `Skill` targets through `formatNamespaced` while leaving
  every other tool's target on the existing `truncatePath` path
  (file-path tools are unaffected).

### Tests
8 new render-layer cases in `tests/transcript-omc.test.js`:
3 helper unit tests (one per mode), 2 agents-line tests covering
`badge` and `raw`, and 3 tools-line tests covering Skill (strip),
Skill (badge), and a non-Skill tool target as a regression guard.
Total: 568 / 567 pass / 1 skip / 0 fail.

## [0.3.1] - 2026-05-04 — MomePP fork (upstream sync + OAC-focus + drift fixes)

Pulls the latest upstream `jarrodwatts/claude-hud` (`b53c3f0`, 5 commits past
`0.3.0`'s sync point), reframes the fork around OpenAgentsControl on Claude
Code, restores a render-layer feature lost in an earlier rebase, and patches
three doc/code drifts found during a fork-claims audit.

### Added — from upstream
- CJK ambiguous-width glyph handling (a003624). New `src/render/width.ts`
  centralises wide-char tables and gates an ambiguous-width pass on
  `isCjkAmbiguousWide()` (only triggers when `language: zh`). Fixes wrap
  miscalculation when bars/separators (`█ ░ │ ─ ◐ ✓`) render as 2 cells in
  CJK terminals. `makeSeparator()` now halves dash count under CJK so the
  rendered separator no longer overflows and forces terminal-side wrap.
  Adds 3 width-aware render tests.

### Fixed
- **Restored `formatAgentType()` namespace strip + capitalize** in
  `src/render/agents-line.ts`. Added in 0.1.0 (commit `24edbe2`), silently
  lost in a later rebase. Without it, OAC subagents (`oac:code-execution`,
  `oac:debugger`, `oac:parallel-execution`) and OMC subagents
  (`oh-my-claudecode:explore`) rendered raw in the agents line. Now strips
  the `<namespace>:` prefix and capitalizes the first letter — `oac:debugger`
  → `Debugger`, matching the README claim that had been stale for two
  releases. Adds 2 render-layer tests in `tests/transcript-omc.test.js`
  covering both the OAC and OMC namespaces.
- **Doc drift: pending-permission window**. README and CLAUDE.md claimed
  `≤3s window` for the `? <target>` indicator. Actual code (since 0.1.7)
  uses a 5-minute wall-clock cap (`PENDING_PERMISSION_MAX_AGE_MS`) plus a
  30s interrupt-grace check (`PENDING_PERMISSION_INTERRUPT_GRACE_MS`). Docs
  now describe the real behavior and reference the constants in
  `src/transcript.ts`.
- **Doc drift: pending-permission format**. Docs claimed `? <target>`;
  actual render emits `? <target> (waiting Ns)` with a live counter. Format
  table updated.
- **Doc drift: missing config keys**. Added README option-table rows for
  `display.contextWarningThreshold` (default 70),
  `display.contextCriticalThreshold` (default 85),
  `display.usageThreshold` (default 0), and
  `display.environmentThreshold` (default 0) — all already accepted by
  `src/config.ts` and surfaced by `commands/configure.md`, but absent from
  the README option table. Also rewrote `display.showTokenBreakdown`
  description so it references the configurable critical threshold instead
  of the hardcoded `85%`. CLAUDE.md "Context Thresholds" table now notes
  configurability.
- Stale `dist/usage-api.*` bundle dropped. Source was removed upstream by
  `3aebe1b` ("Simplify usage display to stdin only"); the compiled output
  had been lingering.

### Changed
- README + plugin.json + marketplace.json reframed: **OpenAgentsControl on
  Claude Code is now the primary use case**, oh-my-claudecode (OMC) is
  documented as leftover compatibility. Fork-features matrix updated to
  use `oac:code-execution → Code-execution` as the namespace-strip
  example (was `oh-my-claudecode:explore → Explore`). `proxy_Edit`/`proxy_Task`
  row marked OMC-only since OAC uses native tools + `Skill`. Tests
  section renamed "Orchestrator-compat tests" (file kept as
  `tests/transcript-omc.test.js` to preserve git history).

### Skipped — from upstream
- `fix(setup)`: POSIX `[[:space:]]` grep pattern (517b6f4). Not
  applicable — the fork's `commands/setup.md` uses
  `scripts/claude-hud.sh` launcher, no `awk | grep` version-resolution
  pipeline. Fork keeps `--ours` for `setup.md`.

### Preserved — fork features (no regressions)
All 0.3.0 fork features still rendering correctly: Skill tool target,
last-request tokens, thinking indicator (now alongside the restored
namespace strip), pending permission, speed-tracker per-session cache,
post-compact context reset, configurable color thresholds, taskIds across
duplicate-content todos, Haiku 4.x pricing, launcher infra, MCP tool-name
compression, natural project style + glyphs + 7 bar styles. Tests:
559 pass / 1 skip / 0 fail (2 new render-strip tests added).

## [0.3.0] - 2026-04-27 — MomePP fork (upstream sync)

Pulls upstream `jarrodwatts/claude-hud` past `v0.1.0` into the fork.
All fork features verified intact post-merge: 554/554 tests pass,
every fork field still read in render, mergeConfig covers all 13
fork fields, OMC transcript layer + MCP compression + indicators
all preserved.

### Added — from upstream
- Show Skill tool targets in tool activity (#497).
- Configurable context color thresholds (#488).
- Vertex AI provider detection — disables cost estimation for Vertex
  the same way Bedrock is handled.
- External usage snapshot fallback (#478) — polls an external usage
  file when Claude Code's stdin `rate_limits` is missing.

### Fixed — from upstream
- Speed tracker now scopes its cache per session (no cross-session
  contamination, #496).
- Context handles post-compact resets cleanly.
- Effort field tolerates object schema from Claude Code 2.1.115+.
- Render handles real 40-col terminals and OSC 8 branch links.
- TodoWrite preserves taskIds across duplicate-content rewrites.
- Cost: added Claude Haiku 4.x pricing.
- Git numstat keeps diffs on quoted arrow filenames.

### Preserved — fork features (no regressions)
All 0.1.7 / 0.2.x fork additions audited and confirmed working:
OMC transcript compat (`proxy_`, task-notification, tail-read),
inline indicators (thinking/permission/last-tokens with interrupt
+ wall-clock cap), MCP tool-name compression, natural project
style + glyphs + 7 bar styles + `colors.thinking`/`colors.duration`,
`gitStatus.showFileList` split, fork launcher + macOS/Linux setup.

## [0.2.2] - 2026-04-20 — MomePP fork

Follow-up audit after the 0.2.0 rebase caught three more fork fields
that upstream's files silently stopped honoring. All fixed here:

### Fixed
- `display.naturalSeparator` is now honored between merged elements in
  expanded layout (Context + Usage). Upstream's `render/index.ts`
  hardcoded ` │ ` for merge-group joins, so users on
  `projectStyle: "natural"` saw prose separators on the project line
  but the pipes-style ` │ ` on the Context/Usage line.
- Compact (`lineLayout: "compact"`) duration now respects
  `display.projectStyle`, `display.durationGlyph`, and
  `colors.duration` the same way expanded mode does. Previously the
  compact renderer hardcoded `⏱️` and used `colors.label`.
- Compact mode now renders the fork inline indicators:
  `∿ thinking` (colored by `colors.thinking`),
  `? <target> (waiting Ns)`, and `last: 12k→678`. These were dropped
  when we took upstream's `session-line.ts` wholesale during the rebase.

## [0.2.1] - 2026-04-20 — MomePP fork

### Fixed
- Context, usage, and memory bars now honor `display.barStyle` again.
  The 0.2.0 rebase took upstream's `identity.ts`, `memory.ts`,
  `usage.ts`, and `session-line.ts` which call `coloredBar` / `quotaBar`
  without the optional 4th `style` argument, so every bar rendered as
  `block` regardless of config. All five call sites now thread
  `display?.barStyle` through to the bar helpers.

## [0.2.0] - 2026-04-20 — MomePP fork (upstream rebase)

This release **rebases the MomePP fork on top of upstream 0.1.0** so the
fork can continue to track upstream easily going forward. Everything from
0.1.x was reapplied as a thin patch layer on top of upstream's latest,
and upstream's new features land for free.

### Added — from upstream 0.1.0 (inherited)
- Prompt-cache countdown extra (`display.showPromptCache`,
  `display.promptCacheTtlSeconds`, element `promptCache`).
- Effort-level display in the model bracket (`display.showEffortLevel`).
- `display.maxWidth` fallback for terminal-width detection.
- `display.timeFormat` (`relative` / `absolute` / `both`) for reset-time
  formatting.
- `display.usageCompact` shorter-usage mode.
- `display.showResetLabel` toggle for the reset-time label prefix.
- `display.mergeGroups` — configurable expanded-layout line merges.
- `gitStatus.branchOverflow: 'truncate' | 'wrap'` for long-branch
  rendering (in pipes mode).
- Context-cache fallback for zero-usage frames, progress-bar label
  alignment, extracted `format-reset-time` helper, plus misc
  stdin/cost/Bedrock/version-cache fixes inherited from upstream.

### Changed
- Version jumps from `0.1.7` → `0.2.0` to signal the new base
  (upstream is at `0.1.0`, so staying on `0.1.x` would be misleading).
- `renderGitFilesLine` now gates on `gitStatus.showFileList ??
  gitStatus.showFileStats` so upstream configs that only set
  `showFileStats` still render the bottom file list, while our fork's
  explicit split behavior is preserved when `showFileList` is set.
- Duration extra keeps the upstream `⏱️` emoji in **pipes** style and
  uses `display.durationGlyph` only in **natural** style.
- Default subagent fallback: `Agent` → `general-purpose` (fork
  behavior), `Task` → `agent` (upstream behavior).

### Preserved — fork features from 0.1.x
- OMC transcript compat (`proxy_` stripping, `<task-notification>`
  background-agent completion, subagent_type fallback).
- Tail-read for transcripts larger than 4MB.
- Inline project-line indicators: `∿ thinking`,
  `? <target> (waiting Ns)` with interrupt + 5-min wall-clock cap,
  `last: <in>→<out>` last-request tokens.
- MCP tool-name compression (`mcp__plugin_X_Y__Z` → `X:Z`).
- Natural project style with `display.projectStyle = 'natural'`,
  model + project + branch glyphs, `display.naturalSeparator`,
  `display.barStyle` (`block` / `square` / `thin` / `vertical` /
  `dots` / `shade` / `double`), and `with +X -Y changes`
  file-diff wording.
- `gitStatus.showFileList` split from `gitStatus.showFileStats`.
- Starship-aligned default palette (`model=green`, `project=cyan`,
  `gitBranch=brightMagenta`) plus `colors.thinking` and
  `colors.duration` overrides.
- Pending-permission interrupt detection and wall-clock cap.
- Fork infra: `scripts/claude-hud.sh` launcher, simplified
  macOS/Linux `commands/setup.md`, no GitHub Actions, `dist/`
  committed directly, MomePP metadata.

### Upgrading
Existing fork configs keep working unchanged. Upstream's new fields
(`maxWidth`, `mergeGroups`, `timeFormat`, `usageCompact`,
`showEffortLevel`, `showPromptCache`, `promptCacheTtlSeconds`,
`showResetLabel`, `gitStatus.branchOverflow`) are all opt-in with
upstream's defaults.

## [0.1.7] - 2026-04-19 — MomePP fork

### Fixed
- Pending-permission indicator no longer gets stuck for hours after an
  interrupted chat. The previous refactor (0.1.1) dropped the 3-second
  timeout and relied entirely on a matching `tool_result` to clear the
  entry — but if the user interrupted the session (Ctrl+C / ESC) before
  responding to the approval prompt, no `tool_result` ever arrives and the
  indicator stuck around (reports of `(waiting 46872s)` after ~13 hours).
  Two new safeguards:
  - **Interrupt detection**: when the latest transcript entry is more than
    30 s newer than a still-open permission tool_use, treat the tool_use
    as abandoned and drop the indicator.
  - **Wall-clock cap**: permission entries older than 5 minutes are always
    dropped, including on pure cache-hit reads — so stale state clears
    even when no fresh user entry arrives.
  Active approval prompts (tool_use is the newest entry, no abandonment
  signal) still display the `(waiting Ns)` counter as before.

## [0.1.6] - 2026-04-19 — MomePP fork

### Added
- `colors.duration` (default `dim`) — overrides the color of the
  session-duration extra (`<clock> 1h 30m`). Independent of `colors.label`
  so you can keep `Context`/`Usage` labels dim while making the duration
  pop. Accepts named ANSI, 256-color number, or `#rrggbb`.

### Changed
- In the `natural` project style, the inline file-stats counter now reads
  `with +X -Y changes` instead of just `+X -Y`. The `with`/`changes`
  prose words are dim; the numbers keep their existing green/red colors.
  Pipes mode is unchanged (still renders `[+X -Y]`).

## [0.1.5] - 2026-04-19 — MomePP fork

### Added
- `colors.thinking` (default `dim`) — overrides the color of the inline
  `∿ thinking` indicator. Accepts the same value space as the other color
  fields (named ANSI, 256-color number, or `#rrggbb` hex).

### Fixed
- In the `natural` project style, `display.projectGlyph` and
  `display.branchGlyph` now render in their respective module colors
  (`colors.project` and `colors.gitBranch`) instead of the terminal's
  default foreground. This matches the `display.modelGlyph` behavior and
  keeps each section visually grouped.

## [0.1.4] - 2026-04-19 — MomePP fork

### Added
- Four additional values for `display.barStyle`:
  - `vertical` (`▮▯`, U+25AE/U+25AF) — recognizable progress-bar look.
  - `dots` (`●○`, U+25CF/U+25CB) — distinctive circle progress.
  - `shade` (`▓░`, U+2593/U+2591) — soft gradient, easier on the eyes.
  - `double` (`═─`, U+2550/U+2500) — double-line tracks.
  All seven values now share the same fallback path, so unknown values still
  render as `block`.

## [0.1.3] - 2026-04-19 — MomePP fork

### Added
- Three new glyph toggles for the `natural` project style and the duration
  extra:
  - `display.projectGlyph` (default `\uf114` `nf-fa-folder_o`, outlined
    folder) — renders between `in` and the project name.
  - `display.branchGlyph` (default `\ue725` `nf-dev-git_branch`) — renders
    between `on` and the branch name.
  - `display.durationGlyph` (default `\uf017` `nf-fa-clock_o`) — replaces the
    legacy `⏱️` emoji on the duration extra in both `pipes` and `natural`
    project styles.
  Each accepts any string; set to `""` to disable.
- `display.barStyle` (default `block`) controls the character set used for
  context, usage, and memory bars. `block` = `█░` (current), `square` = `▰▱`
  (modern, starship-like), `thin` = `━─` (minimal).

### Changed
- Default color palette aligned to starship's defaults so the model, project,
  and branch each get a distinct color out of the box:
  - `colors.model`: `cyan` → `green` (matches starship runtime/version
    modules).
  - `colors.project`: `yellow` → `cyan` (matches starship `directory`).
  - `colors.gitBranch`: `cyan` → `brightMagenta` (matches starship
    `git_branch` bold purple).
  Existing user `colors.*` overrides keep working unchanged.
- Duration extra now renders `\uf017 1h 30m` instead of `⏱️  1h 30m`. Set
  `display.durationGlyph` to `"⏱️ "` to restore the emoji.

## [0.1.2] - 2026-04-19 — MomePP fork

### Added
- New `display.projectStyle` toggle (`pipes` | `natural`, default `pipes`).
  `natural` renders the project line in a starship-style prose layout —
  `<glyph> Opus 4.7 (1M context) in claude-hud on main*` — dropping the
  `[]` brackets and `git:( )` wrappers in favor of `in`/`on` prepositions.
- `display.naturalSeparator` (default ` · `) controls the separator
  between segments in `natural` mode and between Context and Usage when
  they share a line in expanded layout.
- `display.modelGlyph` (default `\uec10` `nf-cod-sparkle`) renders before
  the model name in `natural` mode. Set to `""` to disable, or override
  with any glyph (`\uf0d0` wand, `\uf2dc` snowflake, etc.). FontAwesome
  range (U+F000–U+F2E0) is the safest fallback for older Nerd Fonts
  without the codicon block.
- `gitStatus.showFileList` (default `false`) splits out the bottom
  multi-line list of changed files so it's independent of
  `gitStatus.showFileStats`. You can now keep the inline `+5 -3`
  counter on the project line without the multi-line file list below.

### Changed
- `gitStatus.showFileStats` no longer enables the bottom multi-line file
  list — it now controls only the inline `+A -D` counter on the project
  line (and the Starship-style `!M +A ✘D ?U` summary in compact layout).
  Use the new `gitStatus.showFileList` to bring the bottom list back.

## [0.1.1] - 2026-04-17 — MomePP fork

### Changed
- MCP tool names in the tools line now compress to `<plugin>:<fn>` (e.g.
  `mcp__plugin_context-mode_context-mode__ctx_execute` →
  `context-mode:ctx_execute`). Standard non-plugin MCP names compress to
  `<server>:<fn>`. Non-MCP names pass through unchanged.
- Pending-permission indicator no longer times out after 3 seconds. It now
  persists for every open `tool_use` until the matching `tool_result`
  appends to the transcript, and renders a `(waiting Ns)` counter so long
  reads of the prompt no longer look like "Claude moved on." When multiple
  permissions are open, the youngest (most recent) one wins.

### Added
- Three new `display` toggles for the inline project-line indicators:
  `display.showThinkingIndicator` (default `true`),
  `display.showPendingPermission` (default `true`),
  `display.showLastRequestTokens` (default `false`).
  The first two preserve existing behavior from 0.1.0; the third surfaces the
  most recent assistant turn's token counts (`last: 12k→678`, with a
  `(+Xk)` reasoning suffix when present) and is opt-in because it changes
  every assistant turn.

### Fixed
- `thinkingState.active` and `pendingPermission` no longer get cached with
  their computed booleans — a `finalizeTranscriptResult` step recomputes
  both decay checks against `Date.now()` on every return, including cache
  hits. Previously a cache hit could keep `∿ thinking` on screen for
  minutes after thinking actually stopped.

### Test hygiene
- `tests/config.test.js` now isolates `loadConfig()` under a temporary
  `CLAUDE_CONFIG_DIR` so the developer's live config no longer leaks into
  the assertion.
- `tests/render.test.js` and `tests/render-width.test.js` assertions now
  match the capitalized agent-type display (`Planner`, `Plan-a`) introduced
  by `formatAgentType` in 0.1.0.

## [0.1.0] - 2026-04-17 — MomePP fork

First versioned release after forking. Scope narrowed to personal use on macOS/Linux
with oh-my-claudecode (OMC).

### Added
- OMC compatibility in the transcript parser: `proxy_Task`, `proxy_Agent`,
  `proxy_Edit`, `proxy_TodoWrite`, etc. have the `proxy_` prefix stripped and
  route identically to their native counterparts.
- Background-agent completion tracking via `<task-notification>` blocks
  (hyphen-cased tags, with underscore variants accepted). Agents launched with
  `run_in_background: true` now transition out of `running`.
- Tail-based transcript parsing for files larger than 4MB — previously the
  whole file was streamed every ~300ms. Session-token totals and `sessionStart`
  are suppressed in tail mode since they'd be partial.
- New indicators in `TranscriptData`: `lastRequestTokenUsage`, `thinkingState`,
  `pendingPermission`. Thinking state and pending permissions render inline on
  the project line (`∿ thinking`, `? <target>`).
- `scripts/claude-hud.sh` shipped launcher. Resolves the highest installed
  plugin version, caches the resolved entry path, and reads terminal width
  from the controlling tty (no tmux dependency).
- `tests/transcript-omc.test.js` covering all of the above.

### Changed
- Agent labels with missing `subagent_type` now fall back to the caller-supplied
  `input.name` first, then `general-purpose` (Claude Code's actual default) —
  previously rendered as the literal string `unknown`.
- Agent type display strips any `namespace:` prefix and capitalizes the first
  letter, so `oh-my-claudecode:explore` appears as `Explore`, matching the
  built-in style.
- `commands/setup.md` rewritten for macOS/Linux only. Windows + PowerShell
  branches, ghost-install detection, and runtime-specific bash variants all
  removed.
- `settings.json` generated by setup now points at
  `scripts/claude-hud.sh` rather than embedding a 240-character dynamic bash
  one-liner.

### Removed
- `.github/workflows/*` (ci, build-dist, claude, release). This fork has no CI.
- `.github/dependabot.yml`. No CI to gate dependency PRs.
- `dist/` is no longer gitignored — it's tracked so consumers and the plugin
  loader don't need a build step. Run `npm run build` before committing.

### Upstream provenance
Based on upstream `0.0.12` (jarrodwatts/claude-hud, 2026-04-04). All HUD
rendering, configuration flow, presets, and design decisions are unchanged
from upstream.

## [0.0.12] - 2026-04-04

### Added
- Chinese (`zh`) HUD labels as an explicit opt-in, while keeping English as the default.
- Guided language selection in `/claude-hud:configure` so users can choose English or Chinese without hand-editing JSON.
- Offline estimated session cost display via `display.showCost` for known Anthropic model families, derived from local transcript token usage only.
- Session token totals, output-style display, git push count threshold coloring, configurable model badge formatting, and a custom model override.
- Git file diff rendering with per-file and total line deltas, plus clickable OSC 8 file links where supported.

### Changed
- Usage display now relies only on Claude Code's official stdin `rate_limits` fields. Background OAuth usage polling, related cache/lock behavior, and credential-derived subscriber plan labels were removed.
- Setup and configure flows now better support simple onboarding: Windows setup prefers Node.js guidance, the GitHub star prompt includes `gh` compatibility guidance, and configure now exposes language as a first-class guided choice.
- Plugin detection, config caching, and transcript-derived activity/session metadata are more robust and better covered by tests.

### Fixed
- Stabilize Claude Code version cache behavior across resolved binary paths and mtimes, fixing Node 20 CI failures.
- Stop guessing auth mode from environment variables alone.
- Preserve task IDs across `TodoWrite`, detect transcript agents recorded as `Agent`, and improve narrow-terminal wrapping including OSC hyperlink width handling.
- Improve macOS memory reporting, config cache invalidation, and fallback rendering when terminal width is unavailable.
- Clarify official usage-data behavior and keep Bedrock/unknown pricing cases hidden rather than showing misleading estimates.

## [0.0.10] - 2026-03-23

### Added
- Configurable HUD color overrides, including named presets, 256-color indices, and hex values.
- `display.customLine` support for a short custom phrase in the HUD.
- New opt-in display toggles for session name, combined context mode (`display.contextValue: "both"`), Claude Code version, and approximate system RAM usage in expanded layout.

### Changed
- Setup and plugin detection now better handle `CLAUDE_CONFIG_DIR`, Windows shell quoting, and Bun `--env-file` installs without inheriting project environment files.
- Usage display now prefers Claude Code stdin `rate_limits` data when available, still falls back to the existing OAuth/cache path, and presents weekly-only/free-user usage more cleanly.
- Context percentages and token displays now follow Claude Code's reported context window size, including newer 1M-context sessions, with a lower fallback autocompact estimate that better matches `/context`.
- Usage text output now keeps the last successful values visible while syncing, shows the 7-day reset countdown when applicable, and clarifies that standard proxy environment variables are the supported way to route Anthropic traffic.
- Progress bars and expanded-layout output now adapt more cleanly to narrow terminal widths.

### Fixed
- Setup is more reliable in sessions that previously failed to surface the HUD until Claude Code restarted, and plugin command discovery no longer fails with unknown-skill errors after install.
- Usage handling is more resilient under OAuth token refreshes, proxy tunnels, explicit TLS overrides, zero-byte lock files, stale-cache recovery, and rate-limit edge cases that previously caused repeated `429` or syncing failures.
- Account-scoped credential lookup and plugin selection are more reliable for multi-account setups and multiple installed plugin versions.
- Expanded-layout rendering now preserves speed, duration, extra labels, and weekly-only usage output correctly.
- Tool execution no longer scrolls the terminal to the top, and transcript reparsing now avoids repeatedly caching partial parse results on large histories.

---

## [0.0.9] - 2026-03-05

### Changed
- Add Usage API timeout override via `CLAUDE_HUD_USAGE_TIMEOUT_MS` (default now 15s).

### Fixed
- Setup instructions now generate shell-safe Windows commands for `win32 + bash` environments (#121, #148).
- Bedrock startup model labels now normalize known model IDs when `model.display_name` is missing (#137).
- Usage API reliability improvements for proxy and OAuth token-refresh edge cases:
  - Respect `HTTPS_PROXY`/`ALL_PROXY`/`HTTP_PROXY` with `NO_PROXY` bypass.
  - Preserve usage and plan display when keychain tokens refresh without `subscriptionType` metadata.
  - Reduce false `timeout`/`403` usage warnings in proxied and high-latency environments (#146, #161, #162).
- Render output now preserves regular spaces instead of non-breaking spaces to avoid vertical statusline rendering issues on startup (#142).

---

## [0.0.8] - 2026-03-03

### Added
- Session name display in the statusline (#155).
- `display.contextValue: "remaining"` mode to show remaining context percent (#157).
- Regression tests for `CLAUDE_CONFIG_DIR` path handling, keychain service resolution fallback ordering, and config counter overlap edge cases.

### Changed
- Prefer subscription plan labels over API env-var detection for account type display (#158).
- Usage reset time formatting now switches to days when the reset window is 24h or more (#132).

### Fixed
- Respect `CLAUDE_CONFIG_DIR` for HUD config lookup, usage cache, speed cache, and legacy credentials file paths (#126).
- Improve macOS Keychain credential lookup for multi-profile setups by using profile-specific service names with compatibility fallbacks.
- Fix config counting overlap detection so project `.claude` files are still counted when `cwd` is home and user scope is redirected.
- Prevent HUD rows from disappearing in narrow terminals (#159).
- Handle object-based legacy layout values safely during config migration (#144).
- Prevent double-counting user vs project `CLAUDE.md` when `cwd` is home (#141).

### Dependencies
- Bump `@types/node` from `25.2.3` to `25.3.3` (#153).
- Bump `c8` from `10.1.3` to `11.0.0` (#154).

---

## [0.0.7] - 2026-02-06

### Changed
- **Redesigned default layout** — clean 2-line display replaces the previous multi-line default
  - Line 1: `[Opus | Max] │ my-project git:(main*)`
  - Line 2: `Context █████░░░░░ 45% │ Usage ██░░░░░░░░ 25% (1h 30m / 5h)`
- Model bracket moved to project line (line 1)
- Context and usage bars combined onto a single line with `│` separator
- Shortened labels: "Context Window" → "Context", "Usage Limits" → "Usage"
- Consistent `dim()` styling on both labels
- All optional features hidden by default: tools, agents, todos, duration, config counts
- Bedrock provider detection (#111)
- Output speed display (#110)
- Token context display option (#108)
- Seven-day usage threshold config (#107)

### Added
- Setup onboarding now offers optional features (tools, agents & todos, session info) before finishing
- `display.showSpeed` config option for output token speed

### Fixed
- Show API failure reason in usage display (#109)
- Support task todo updates in transcript parsing (#106)
- Keep HUD to one line in compact mode (#105)
- Use Platform context instead of uname for setup detection (#95)

---

## [0.0.6] - 2026-01-14

### Added
- **Expanded multi-line layout mode** - splits the overloaded session line into semantic lines (#76)
  - Identity line: model, plan, context bar, duration
  - Project line: path, git status
  - Environment line: config counts (CLAUDE.md, rules, MCPs, hooks)
  - Usage line: rate limits with reset times
- New config options:
  - `lineLayout`: `'compact'` | `'expanded'` (default: `'expanded'` for new users)
  - `showSeparators`: boolean (orthogonal to layout)
  - `display.usageThreshold`: show usage line only when >= N%
  - `display.environmentThreshold`: show env line only when counts >= N

### Changed
- Default layout is now `expanded` for new installations
- Threshold logic uses `max(5h, 7d)` to ensure high 7-day usage isn't hidden

### Fixed
- Ghost installation detection and cleanup in setup command (#75)

### Migration
- Existing configs with `layout: "default"` automatically migrate to `lineLayout: "compact"`
- Existing configs with `layout: "separators"` migrate to `lineLayout: "compact"` + `showSeparators: true`

---

## [0.0.5] - 2026-01-14

### Added
- Native context percentage support for Claude Code v2.1.6+
  - Uses `used_percentage` field from stdin when available (accurate, matches `/context`)
  - Automatic fallback to manual calculation for older versions
  - Handles edge cases: NaN, negative values, values >100
- `display.autocompactBuffer` config option (`'enabled'` | `'disabled'`, default: `'enabled'`)
  - `'enabled'`: Shows buffered % (matches `/context` when autocompact ON) - **default**
  - `'disabled'`: Shows raw % (matches `/context` when autocompact OFF)
- EXDEV cross-device error detection for Linux plugin installation (#53)

### Changed
- Context percentage now uses percentage-based buffer (22.5%) instead of hardcoded 45k tokens (#55)
  - Scales correctly for enterprise context windows (>200k)
- Remove automatic PR review workflow (#67)

### Fixed
- Git status: move `--no-optional-locks` to correct position as global git option (#65)
- Prevent stale `index.lock` files during git operations (#63)
- Exclude disabled MCP servers from count (#47)
- Reconvert Date objects when reading from usage API cache (#45)

### Credits
- Ideas from [#30](https://github.com/jarrodwatts/claude-hud/pull/30) ([@r-firpo](https://github.com/r-firpo)), [#43](https://github.com/jarrodwatts/claude-hud/pull/43) ([@yansircc](https://github.com/yansircc)), [#49](https://github.com/jarrodwatts/claude-hud/pull/49) ([@StephenJoshii](https://github.com/StephenJoshii)) informed the autocompact solution

### Dependencies
- Bump @types/node from 25.0.3 to 25.0.6 (#61)

---

## [0.0.4] - 2026-01-07

### Added
- Configuration system via `~/.claude/plugins/claude-hud/config.json`
- Interactive `/claude-hud:configure` skill for in-Claude configuration
- Usage API integration showing 5h/7d rate limits (Pro/Max/Team)
- Git status with dirty indicator and ahead/behind counts
- Configurable path levels (1-3 directory segments)
- Layout options: default and separators
- Display toggles for all HUD elements

### Fixed
- Git status spacing: `main*↑2↓1` → `main* ↑2 ↓1`
- Root path rendering: show `/` instead of empty
- Windows path normalization

### Credits
- Config system, layouts, path levels, git toggle by @Tsopic (#32)
- Usage API, configure skill, bug fixes by @melon-hub (#34)

---

## [0.0.3] - 2025-01-06

### Added
- Display git branch name in session line (#23)
- Display project folder name in session line (#18)
- Dynamic platform and runtime detection in setup command (#24)

### Changed
- Remove redundant COMPACT warning at high context usage (#27)

### Fixed
- Skip auto-review for fork PRs to prevent CI failures (#25)

### Dependencies
- Bump @types/node from 20.19.27 to 25.0.3 (#2)

---

## [0.0.2] - 2025-01-04

### Security
- Add CI workflow to build dist/ after merge - closes attack vector where malicious code could be injected via compiled output in PRs
- Remove dist/ from git tracking - PRs now contain source only, CI handles compilation

### Fixed
- Add 45k token autocompact buffer to context percentage calculation - now matches `/context` output accurately by accounting for Claude Code's reserved autocompact space
- Fix CI caching with package-lock.json
- Use Opus 4.5 for GitHub Actions code review

### Changed
- Setup command now auto-detects installed plugin version (no manual path updates needed)
- Setup prompts for optional GitHub star after successful configuration
- Remove husky pre-commit hook (CI now handles dist/ compilation)

### Dependencies
- Bump c8 from 9.1.0 to 10.1.3

---

## [0.0.1] - 2025-01-04

Initial release of Claude HUD as a Claude Code statusline plugin.

### Features
- Real-time context usage monitoring with color-coded progress bar
- Active tool tracking with completion counts
- Running agent status with elapsed time
- Todo progress display
- Native token data from Claude Code stdin
- Transcript parsing for tool/agent/todo activity
