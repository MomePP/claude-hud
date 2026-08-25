# Changelog

All notable changes to Claude HUD will be documented in this file.

## [Unreleased]

## [0.13.0] - 2026-08-25 — MomePP fork (per-window weekly colour)

Minor: one new optional fork colour key, `colors.sevenDay`, unset by default so
nothing changes without opting in. The weekly and 5-hour windows shared a single
three-step colour ladder, which meant that below 75% they rendered in exactly the
same colour and were distinguishable only by their label — a real problem once
`sevenDayThreshold: 0` puts weekly on screen permanently.

### Added — fork

- **`colors.sevenDay`** (colour value, unset by default) — one colour for the
  weekly (7-day) window at every level. Setting it pins weekly to its own colour
  and **opts it out of the 75/90 ladder**, so it no longer escalates to
  `usageWarning` or `critical`. Follows the fork's optional-colour-key precedent
  (`colors.barFilled` / `barEmpty` / `barEmptyColor`): `HudColorValue | undefined`
  with no default, and an invalid value is dropped rather than defaulted.
  `src/config.ts`, `src/render/lines/usage.ts`.
- **`sevenDayColors()`** — exported helper that returns the caller's colours
  untouched when the override is unset, and otherwise pins `usage`,
  `usageWarning` and `critical` to the override. The bar and the value both read
  the ladder through `getQuotaColor`, so overriding its inputs covers them
  together and no shared colour helper needed a new parameter.
  `src/render/lines/usage.ts`.

### Changed — fork

- All six weekly render paths route their colours through the helper: the inline
  weekly part, the weekly-only session, the separate weekly line
  (`renderWeeklyUsageLine`), the compact `7d` part, and both weekly branches in
  the compact session line. The 5-hour window, the memory bar and model-scoped
  windows are deliberately **not** routed through it — model-scoped windows carry
  a `7d` duration label but are a different quota, so they keep the ladder.

### Default-behavior changes visible on update

None. `colors.sevenDay` is unset by default and the helper is a pass-through in
that case, so output is byte-identical to 0.12.0 until the key is set.

### Tests

1226 pass, 0 fail, 6 skipped (1232 total), up from 1216. New
`tests/seven-day-color.test.js` covers validation (hex, 256-colour and named
values accepted; invalid dropped to undefined rather than defaulted), the
unset ladder still walking 75/90, the override holding across all three bands,
the ladder colours no longer leaking onto the weekly segment, the 5-hour window
keeping its own colours, and all three of the separate-line, compact and
weekly-only paths. Six of the ten fail against the pre-fix renderer — including
the 5-hour isolation test, which caught an over-broad edit during implementation.

### Bumped

- `package.json` → `0.13.0`
- `.claude-plugin/plugin.json` → `0.13.0`
- `.claude-plugin/marketplace.json` (`metadata.version`) → `0.13.0`

## [0.12.0] - 2026-08-25 — MomePP fork (weekly usage on its own line)

Minor: one new fork option, `display.sevenDayLayout`, defaulting to the current
behavior. A merged Context/Usage row already runs long, and appending the weekly
window inline pushes it past a typical terminal in exactly the week you most want
to read it — 191 columns in a representative session with `promptCache` merged in.
Splitting the weekly window onto its own line keeps the primary row at a stable
width and only costs a line in the weeks usage is actually high.

### Added — fork

- **`display.sevenDayLayout`** (`inline` | `line`, default `inline`) — where the
  weekly (7-day) window renders once it crosses `display.sevenDayThreshold`.
  `inline` keeps today's `Usage … | Weekly …` join. `line` drops it from the usage
  line and emits it as its own line directly beneath whichever row carried the
  `usage` element. `src/config.ts`, `src/render/lines/usage.ts`,
  `src/render/index.ts`.
- **`renderWeeklyUsageLine`** — new exported renderer backing that layout, with
  the same visibility gates as the usage line it follows (`showUsage`,
  `shouldHideUsage`, `usageThreshold`, `sevenDayThreshold`, limit-reached).
  `src/render/lines/usage.ts`.

### Changed — fork

- `renderUsageLine` omits the inline weekly part under `sevenDayLayout: 'line'`.
  It still returns exactly one line in both layouts: merge groups join elements
  into a single row, so a multi-line return would land mid-row and break the join
  (`src/render/index.ts` joins `renderedGroupLines` with a separator). This is why
  the weekly line is emitted by the coordinator rather than embedded in the usage
  string.
- The weekly line is appended at all four row-emit sites (merged row, stacked
  fallback, single-element group, ungrouped element) so it follows `usage`
  wherever `elementOrder` and `mergeGroups` put it, rather than being appended at
  the end of the HUD.

### Fixed — fork

- **`projectStyle: 'natural'` never rendered the effort level.** `showEffortLevel`
  (and the new upstream `effortFormat`) were silently inert for anyone on the
  fork's natural project style: `renderNaturalProjectLine` composes its own model
  segment and never reached `formatEffortSuffix`, which only the pipes bracket
  called. Natural style is fork-only, so upstream never had this to lose. The
  suffix helper is now exported and shared, so both styles render identical
  effort text — including the ultracode carve-out, where the marker lives in the
  level text and so survives `effortFormat: 'symbol'`. Effort sits between the
  model and the provider label, matching the pipes bracket's order.
  `src/render/model-display.ts`, `src/render/lines/project.ts`.
- **`projectStyle: 'natural'` ignored `addedDirsLayout: 'inline'`.** The same
  parity gap as the effort level, found by auditing the two project renderers
  against each other: the inline `+dir +dir` segment was built inside
  `renderPipesProjectLine` and so existed only there, leaving the option a silent
  no-op under natural style. The block is now the shared `buildInlineAddedDirs`
  helper, called by both, and natural places it between the project and the
  branch to match the pipes order. `src/render/lines/project.ts`.
- **Model-scoped usage bars ignored `display.barStyle` in expanded layout.** The
  0.9.1 fix (`4fd4584`) threaded `barStyle` into `renderSessionLine` — the compact
  layout — and stopped there. `renderUsageLine`, which drives the expanded layout,
  was still the one `formatUsageWindowPart` call site not receiving it, so a
  model-scoped window rendered in default `█░` block glyphs directly beside `━─`
  thin 5h and weekly bars on the same line. Not a regression from the 0.11.0 sync;
  it has been latent since 0.9.1 and only shows for users on a non-default
  `barStyle` whose Claude Code sends `rate_limits.model_scoped`.
  `src/render/lines/usage.ts`.

### Fallbacks (deliberate)

- **`display.usageCompact`** — stays inline. Compact usage exists to be one terse
  row, and its `7d` part carries no label to anchor a separate line.
- **A session with no 5-hour window** — stays inline; there is nothing to split
  the weekly window away from.
- **Below `sevenDayThreshold`** — neither line shows it, exactly as before.

### Default-behavior changes visible on update

None. `sevenDayLayout` defaults to `inline`, which is byte-identical to 0.11.0
output. Opting in is a one-key change.

### Tests

1216 pass, 0 fail, 6 skipped (1222 total), up from 1190. New
`tests/seven-day-layout.test.js` covers config validation and defaulting, the
inline/line split, the threshold gate on both sides, single-line invariants for
both renderers (the merge-group constraint), and all three fallbacks.
`tests/scoped-usage.test.js` gains the expanded-layout twin of its 0.9.1
`barStyle` regression test — it fails against the pre-fix renderer. New
`tests/natural-parity.test.js` pins natural and pipes to the same output: effort
text across all three `effortFormat` modes plus the ultracode carve-out, inline
added dirs and their placement before the branch, and the no-effort / no-model /
`showAddedDirs: false` / `addedDirsLayout: 'line'` gates.

An audit of the remaining surface found no third gap of this class: every other
project-line feature (orchestration badge, thinking, pending permission,
last-request tokens, duration, session name, version, speed) is composed in the
shared `buildExtras`, which both styles call; all 18 bar-drawing call sites now
pass `barStyle`; and all 80 `display.*` options are read by some renderer — no
dead config.

### Bumped

- `package.json` → `0.12.0`
- `.claude-plugin/plugin.json` → `0.12.0`
- `.claude-plugin/marketplace.json` (`metadata.version`) → `0.12.0`

## [0.11.0] - 2026-08-25 — MomePP fork (upstream sync onto ef5f1c8, 0.8.0 + transparent-terminal theming)

Rebase-reconstruct of the fork onto the current upstream base, replacing the 0.7.0
(`6f065f2`) root with upstream `ef5f1c8` — 13 upstream commits spanning releases 0.7.1,
0.7.2 and 0.8.0. Carries the fork's transparent-terminal work from the same cycle.
**Minor, not patch**: upstream adds two new user-facing options (`display.effortFormat`,
per-config-directory overrides) and the fork adds three (`colors.dim`,
`colors.barEmptyColor`, `gitStatus.linkBranch`). It is **not major** because every new
option defaults to the current behavior — but see "Default-behavior changes visible on
update" for the one thing that does move on its own.

### Added — from upstream

- **`display.effortFormat`** (`full` | `symbol` | `text`, default `full`) — how the effort
  indicator renders when `display.showEffortLevel` is on: symbol and level text (`◑ high`),
  symbol only (`◑`), or level text only (`high`). Ultracode keeps the full
  `◕ ultracode(xhigh)` form under `symbol` so the marker is not lost, and levels without a
  known symbol fall back to the level text. `src/render/model-display.ts` (#691).
- **Per-config-directory overrides** — `$CLAUDE_CONFIG_DIR/claude-hud.json` layers on top of
  the shared `plugins/claude-hud/config.json` at load time, using the same shape and only
  needing the keys it changes. Matters when several config directories symlink `plugins/`
  to one location. `src/config.ts` (#714).
- **Config hardening** — config file size and nesting are bounded, symlinked and
  prototype-sensitive config input is rejected, and terminal-bound config labels are
  sanitized. `src/config.ts` (#714).
- **Prompt-cache expiry rework** — the prompt-cache element now shows *the wall-clock time
  the cache expires* (`Cache ⏱ at 14:30`) instead of a countdown, because the statusline
  only repaints while Claude Code is active and a countdown freezes mid-drain. The TTL is
  detected per request from `usage.cache_creation.ephemeral_5m_input_tokens` vs
  `ephemeral_1h_input_tokens`, the clock is anchored to the *request* rather than the
  response it produced, and subagent responses are ignored since a subagent runs against
  its own cache. `display.promptCacheTtlSeconds` survives as a fallback for transcripts
  that expose no tier. `src/render/lines/prompt-cache.ts`, `src/constants.ts` (#702).
- **Stale completed-agent expiry** — completed agents drop off the agents line on the next
  refresh after 60s, and completed history can no longer displace running agents from the
  three visible slots. Agent labels are sanitized and length-bounded before terminal
  output. `src/render/agents-line.ts` (#704).
- **`formatAbsoluteTime`** — `formatAbsolute` renamed and exported so the prompt-cache line
  can share the HUD's wall-clock formatting (`display.hourCycle`, `display.showClockSeconds`).
  `src/render/format-reset-time.ts`.
- **Dependencies** — dev-only `@types/node` 26.1.2 → 26.2.0 (#711).

### Changed — fork

- **`colors.dim`** — every `dim()` span is now overridable from one setting. `dim()` has
  ~16 call sites (git connectives, separators, overflow markers, agent counts, added-dirs)
  and most have no `colors` argument in scope, so each newly-noticed dim span used to mean
  another targeted patch. The style is resolved once per run, mirroring `setLanguage()`,
  which is set from the same config at the same two points. Defaults to SGR 2, so nothing
  changes unless it is set. `src/render/colors.ts`, `src/index.ts`.
- **`colors.barEmptyColor`** — the bar's unfilled track had `DIM` inlined in
  `quotaBar`/`coloredBar`, and the existing `barEmpty` override only replaces the
  character, not its colour. The `on` connective in the git segment likewise called the
  bare `dim()` helper; it is a label like any other and now follows `colors.label`.
  Both default to DIM. `src/render/colors.ts`.
- **`gitStatus.linkBranch`** (boolean, default `true`) — drops the OSC 8 hyperlink from the
  branch name. On a transparent terminal the branch rendered as a solid box while the
  surrounding text did not; recolouring it changed nothing, which ruled out the colour and
  left the link. Terminals mark link cells with a decoration, and drawing that decoration
  needs a concrete cell background, so those cells get painted opaque.
  `src/render/lines/project.ts`.

  All three exist because terminals implement dim by blending the foreground against the
  background, so on a transparent terminal a dim cell must have its background painted
  opaque to blend against — which is exactly where the effect is most visible.

### Conflict resolutions (kept fork features intact)

- **`src/transcript.ts`** — upstream's prompt-cache clock was grafted into the fork's
  `handleLine` closure rather than replaying the upstream diff: main-chain anchor,
  `requestId` grouping, per-tier TTL detection, and the two `result.*` assignments.
  `TRANSCRIPT_CACHE_VERSION` 16 → **17**, past both lineages' 16, so no cache written
  without the new fields is read back. All three background-agent completion signals
  (`<task-notification>`, `queue-operation`, `tool_result`) and `compact_boundary`
  tracking verified intact.
- **`src/render/agents-line.ts`** — upstream's retention window and `now` threading
  combined with the fork's `display.agentNamespaceMode`. The label pipeline is
  **sanitize → namespace-format → bound**: sanitizing first stops `formatNamespaced`
  splitting on a colon inside an OSC 8 escape (which would surface the hyperlink URL as
  the "local" name — caught by upstream's own hostile-input test), and bounding last stops
  truncation eating the local name of a long `<ns>:<name>` pair.
- **`tests/config.test.js`** — restored upstream's prompt-cache config coverage, which the
  0.9.0 sync (`aaf3c19`) dropped while the config keys stayed live.
- **`tests/render.test.js`** — upstream's agent-label assertions matched case-insensitively.
  The fork's default `strip` namespace mode capitalizes the agent type, and the invariants
  under test (slot budget, retention, sanitizing, bounding) are case-independent.
- **`tests/transcript-omc.test.js`** — the OMC namespace test's completed agent now uses a
  recent `endTime`; its epoch timestamps fell outside upstream's new retention window and
  expired before the namespace was ever rendered.
- **`tests/format-reset-time.test.js`** — the `h23` and `showSeconds` assertions anchored on
  a bare `HH:MM(:SS)`, so any run between 22:00 and 23:59 local — where `now+2h` crosses
  midnight and the formatter prepends the locale date — failed on `at Aug 26 01:03`. They
  now allow an optional leading date group, matching the idiom the midnight-boundary tests
  below them already use; the anchor still rejects a stray seconds component.
- **`README.md` / `CHANGELOG.md` / `package.json` / `.claude-plugin/*`** — fork branding and
  version kept; upstream's 0.8.0 prompt-cache semantics documented, `effortFormat` row and
  per-directory override prose carried over. `README.zh.md` and `commands/configure.md`
  took upstream's side wholesale (clean translation / configure updates, no fork content).

### Skipped (per fork direction)

- **`.github/workflows/` and `.github/dependabot.yml`** — the fork has no CI; upstream's
  release workflow would fire on any tag whose target commit carries the YAML.
- **Upstream's inline setup one-liner** — `commands/setup.md` and the launcher scripts
  (`scripts/claude-hud.sh`, `scripts/claude-hud.ps1`) are fork-only and untouched.
- **Default colour re-theme** — `model: green`, `project: cyan`, `gitBranch: brightMagenta`
  stay pinned.
- **Required `colors.barFilled` / `colors.barEmpty`** — they stay optional
  (`string | undefined`, no default) or `display.barStyle` breaks.
- **Consolidating `colors.thinking` / `colors.duration` / `colors.orchestration` into
  `colors.label`** — they stay independent overrides.

### Default-behavior changes visible on update

- **Prompt-cache element** (only if `display.showPromptCache` is on, which is off by
  default): now an expiry *time* rather than a countdown, and the TTL is detected from the
  transcript instead of read from `display.promptCacheTtlSeconds`. A 1-hour session that
  had been counting against the 300s default will now report the real hour.
- **Agents line**: completed agents disappear after 60s instead of lingering, and running
  agents always win the three visible slots.
- Everything else defaults to the previous behavior — the three new fork colour/link
  options are inert until set.

### Tests

1190 pass, 0 fail, 6 skipped (1196 total), up from 1144 pass pre-sync as upstream's suites
came along. `tests/transcript-omc.test.js` still covers the fork's namespace modes, OMC
proxy-tool stripping and background-agent completion; `tests/setup-command.test.js` still
follows the `/dev/tty` probe into `scripts/claude-hud.sh` rather than upstream's inline
one-liner. Committed `dist/` reproduces byte-identical from a fresh `npm run build`, and
every fork-feature source file is byte-identical to `backup/pre-rebase-2026-08-25`.

### Bumped

- `package.json` → `0.11.0`
- `.claude-plugin/plugin.json` → `0.11.0`
- `.claude-plugin/marketplace.json` (`metadata.version`) → `0.11.0`

## [0.10.1] - 2026-08-14 — MomePP fork (themeable orchestration badge)

Patch: the inline orchestration badge was built as one `dim()` string, so on a dark
background it was unreadably subtle with no config escape — the `line` layout coloured the
same content properly. This makes the two layouts differ in placement only, never in
whether colour applies, and adds `colors.orchestration` so the segment can be themed
without dragging the global `colors.label` (and with it the `Context` / `Usage` labels)
along. No upstream sync. Filed as patch rather than minor at the maintainer's call: the
substance is a rendering fix, and the new colour key is the fix's escape hatch rather than
a feature in its own right — note this diverges from 0.10.0, which took a minor for adding
a config key.

### Added — fork

- **`colors.orchestration`** (color value, default `'cyan'`) — colours the orchestration
  glyph + mode (`✦ sdd`, `⚙ pdca`) in **both** detail layouts. Scoped to that segment, so
  raising it to read the badge no longer repaints `Context` / `Usage`, which is what using
  `colors.label` for this forced. Accepts the same named / 256-index / hex values as every
  other colour key, and falls back to the default on an invalid value
  (`src/config.ts`, validator mirrors `colors.thinking`).
- `orchestration()` helper in `src/render/colors.ts`, `CYAN` fallback, shaped like the
  existing `thinking()` / `duration()` overrides.

### Changed — fork

- `src/render/lines/project.ts` — the inline badge is no longer a single `dim()` string.
  It now uses the same three-way colour split as the detail line: glyph + mode on
  `colors.orchestration`, objective on `colors.label`, task counts `dim`. Badge *format*
  is unchanged (no parens on the counts, no objective truncation) — that is placement, and
  placement is what the two layouts are allowed to differ on.
- `src/render/orchestration-line.ts` — the two hardcoded `cyan()` calls now route through
  `orchestration(…, colors)`. With the default `'cyan'`, this emits byte-identical output
  (`withOverride(text, 'cyan', CYAN)` resolves to the same `\x1b[36m`), so the detail line
  is unchanged unless the user sets the key.

### Conflict resolutions (kept fork features intact)

Not an upstream sync — no conflicts. Orchestration awareness, `colors.thinking`, and
`colors.duration` are untouched; the new key sits beside them rather than consolidating
them.

### Skipped (per fork direction)

- **Consolidating `colors.orchestration` into `colors.label`** — the exact failure this
  release fixes. `colors.thinking`, `colors.duration`, and now `colors.orchestration` stay
  independent overrides; upstream periodically tries to fold such keys into the generic
  label colour, and the fork refuses (recorded in `CLAUDE.md`'s fork-direction list).
- **"Fixing" the badge's count format to match the line's `(c/t)`** — out of scope. The
  ask was colour parity, not format parity.

### Default-behavior changes visible on update

- **The inline orchestration badge is now cyan instead of dim.** Only affects users running
  `display.orchestrationDetailLayout: 'inline'` with `showOrchestrationDetail` on — this is
  the reported bug, fixed. Set `colors.orchestration: 'dim'` to restore the 0.10.0 look.
- The `line` layout, and every default HUD, render exactly as they did in 0.10.0.

### Tests

1150 tests, **1144 passing, 0 failing, 6 skipped** (four added). New coverage in
`tests/render.test.js`: the inline badge emitting cyan on the glyph and mode rather than
dim, `colors.orchestration` repainting glyph + mode across both layouts (asserted on every
rendered line carrying the segment, so the `line` layout's badge *and* detail line are both
checked), and the objective staying on `colors.label` with the counts staying dim. In
`tests/config.test.js`: the `'cyan'` default plus validation of hex / 256-index / invalid
values. A `captureRenderLinesRaw` helper was added — the existing `captureRenderLines`
strips ANSI, which no colour assertion can survive.

### Bumped

- `package.json` → `0.10.1`
- `.claude-plugin/plugin.json` → `0.10.1`
- `.claude-plugin/marketplace.json` → `0.10.1`

## [0.10.0] - 2026-08-14 — MomePP fork (inline orchestration detail)

Minor: a new fork-only config key, `display.orchestrationDetailLayout`, lets the
orchestration detail ride on the project-line badge instead of taking its own line. No
upstream sync. Minor rather than patch because it adds a config key; no default changes,
so nobody sees a difference without opting in.

### Added — fork

- **`display.orchestrationDetailLayout`** (`'line'` | `'inline'`, default `'line'`) —
  chooses where the detail goes once `showOrchestrationDetail` is on. `line` keeps today's
  behavior: a short badge (`✦ <mode> c/t`) on the project line plus a separate detail line.
  `inline` folds the objective into the badge itself — `✦ <mode>: <objective> c/t` — and
  suppresses the separate line, so the detail renders in exactly one place. Shape and
  validator mirror the existing `display.addedDirsLayout` (`src/config.ts:85`), which
  already pairs a `show*` boolean with an `inline`/`line` placement.
- The agent count (`· N agents`) stays on the `line` form only. Inline, the harness's own
  status row below the statusline already reports running agents, so repeating it costs
  first-line width for nothing.

### Changed — fork

- `src/render/lines/project.ts` — the badge now appends `: <objective>` when the inline
  layout is active. Because the badge is built in `buildExtras()`, `projectStyle: 'natural'`
  picks it up with no separate wiring.
- `src/render/orchestration-line.ts` — self-gates to `null` when the badge is carrying the
  detail instead.

### Fallbacks (detail is never dropped, only relocated)

`inline` degrades to the separate line, rather than losing the detail, in three cases:

- **`lineLayout: 'compact'`** — the badge lives in `renderProjectLine`, and the compact
  path renders `renderSessionLine`, which has no orchestration badge at all. There is
  nothing inline to fold into. (That compact layout shows no badge is a pre-existing gap,
  untouched here.)
- **`showOrchestration: false`** — the badge is switched off, so the line is the only outlet.
- **No objective** — a skill-only phase with no SDD ledger has nothing to inline.

### Default-behavior changes visible on update

- None. `orchestrationDetailLayout` defaults to `'line'`, and `showOrchestrationDetail` is
  still `false` by default, so both the default HUD and existing detail-line users render
  exactly as they did in 0.9.3.

### Tests

1146 tests, **1140 passing, 0 failing, 6 skipped** (six added, two rewritten). New coverage
in `tests/render.test.js`: the objective folding into the expanded badge, the separate line
being suppressed with the objective rendered exactly once and no agent count, the compact
fallback, the badge-off fallback, the no-objective fallback, and `'line'` remaining the
default. The two-layout tests added in 0.9.3 were rewritten once the compact layout was
found to have no badge to fold into. Verified end-to-end against the maintainer's real
config: `✦ sdd: demo-webapp-redesign 1/2` on the project line, no detail line.

### Bumped

- `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` → `0.10.0`

## [0.9.3] - 2026-08-14 — MomePP fork (orchestration detail line in expanded layout)

Patch: `display.showOrchestrationDetail` was silently inert in the default `expanded`
layout — a fork-only bug dating to 0.8.0, found while verifying the 0.9.2 release against
a live config. Fork-only fix, no new config keys, no default flipped.

### Fixed — fork

- `src/render/index.ts` — the orchestration detail line only ever rendered in `compact`
  layout. `renderOrchestrationLine` was wired into `collectActivityLines` (`index.ts:446`),
  which `render` calls only on the compact branch (`index.ts:672`). The expanded branch
  builds its lines from `elementOrder` via `renderElementLine`, whose switch has no
  orchestration case — and the detail line is not a `HudElement`, so it had no slot to be
  ordered into. On `lineLayout: "expanded"` (the default) there was therefore no code path
  that could emit it: setting `showOrchestrationDetail: true` changed nothing.
  `renderExpanded` now appends the line before the git-files line, marked
  `isActivity: true` so the separator logic groups it with the other activity lines,
  mirroring what the compact path already did.
- Neither `README.md` nor `CLAUDE.md` documented a layout restriction — both describe the
  key as a plain opt-in line — so the contract was layout-independent and the expanded
  path was simply missing it.

### Default-behavior changes visible on update

- None for users on defaults: `showOrchestrationDetail` is still `false` by default. Users
  who had already set it to `true` on `expanded` will start seeing the line they asked for,
  e.g. `✦ sdd: herdr-backend (7/8)` — mode, objective from the ledger identity line, and
  task counts.

### Tests

1140 tests, **1134 passing, 0 failing, 6 skipped** (four added). `tests/render.test.js`
gains a two-layout loop asserting the detail line renders under both `compact` and
`expanded` when enabled, and stays absent under both when left at its default. The
expanded case was confirmed to fail against the unfixed build before the fix landed —
one failure, expanded only. Verified end-to-end against the maintainer's real
`expanded` config and a live 6.2 plan-scoped ledger.

### Bumped

- `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` → `0.9.3`

## [0.9.2] - 2026-08-14 — MomePP fork (superpowers 6.2 plan-scoped SDD ledger)

Patch: the superpowers orchestration reader tracked a state file that superpowers
abandoned in its 6.2.0 release (2026-07-23). Fork-only fix — no upstream sync, no new
config keys, no default flipped. Patch rather than minor because the orchestration badge
already rendered and still renders under the same `display.orchestration*` settings; only
the numbers behind it were coming from the wrong place.

### Fixed — fork

- `src/superpowers-state.ts` — superpowers 6.2.0 made the SDD workspace **plan-scoped**:
  the progress ledger moved from a flat `<cwd>/.superpowers/sdd/progress.md` to
  `<repo-root>/.superpowers/sdd/<plan-basename>/progress.md`, one directory per plan, and
  its contents changed from a markdown checkbox list to an append-only prose ledger whose
  first line is `# SDD ledger — plan: <plan file path>`. The reader still pointed at the
  old flat path with a checkbox parser, so the badge silently fell back to todo counts and
  never showed real ledger progress — losing exactly the compaction-proof signal the
  ledger was introduced to provide. Verified against three real pre-6.2 ledgers on the
  maintainer's machine: 0.9.1 renders no orchestration badge for any of them, 0.9.2
  renders `✦ sdd 7/8` once the same content sits at the 6.2 path.

  Note that the checkbox parser was already mismatched *before* 6.2: a real ledger written
  2026-07-03 (three weeks before 6.2.0) is already append-only prose. 6.2 moved the file;
  the format had drifted earlier. The reader has therefore never enriched from a real
  superpowers ledger, which is why the regression went unnoticed since 0.8.0.

  The pre-6.2 flat ledger does **not** pin the badge active with frozen counts, as this
  entry originally claimed — a prose ledger yields zero checkbox matches, so the old
  `total > completed` guard evaluated `0 > 0` and correctly returned null. That failure
  mode would require a checkbox-format flat file, which superpowers does not produce.
  The flat path is still deliberately ignored going forward: superpowers explicitly leaves
  an old flat ledger in place as another plan's progress (its `SKILL.md` names the path and
  says "leave it in place"), so reading one could only ever report stale progress.
- Discovery now walks up from `cwd` to find `.superpowers/sdd`, stopping at the repo root
  (a `.git` entry — file or directory, so linked worktrees resolve correctly) rather than
  shelling out to `git rev-parse --show-toplevel` on every ~300ms tick. The newest ledger
  by mtime wins when several plan workspaces coexist.
- The parser reads completions from distinct `Task <N>: complete` lines and in-progress
  tasks from those with ledger lines but no completion (a task mid fix-round). The prose
  ledger states no total, so the total comes from the todo list — SDD creates one todo per
  plan task — floored at the number of tasks the ledger mentions. The objective is the
  plan basename taken from the identity line, so the badge shows `recovery-flow` instead
  of the raw `# SDD ledger — plan: …` heading.
- Checkbox parsing is kept as a fallback, but only when a ledger holds **no** task lines.
  `SKILL.md:362` has controllers record deferred minors in the ledger, and a controller
  that formats those as `- [ ] …` would otherwise flip the parser into checkbox mode and
  report finding counts as task progress.
- The flat pre-6.2 path is now deliberately never read. Reading it can only report frozen
  progress, so absence of a plan workspace is the correct "nothing in flight" answer.

### Changed — fork

- `README.md` (both orchestration entries) and `CLAUDE.md` (the orchestration row of the
  "fork features that must survive every sync" table) now document the plan-scoped ledger
  path, the newest-wins rule, and the standing requirement that the flat pre-6.2 path stay
  ignored — so a future upstream sync cannot quietly reintroduce it.

### Verified unaffected

- **Skill-name detection.** All 14 superpowers skills kept their names across 6.0–6.3, so
  the transcript's `superpowers:<skill>` phase capture in `src/transcript.ts` needed no
  change.
- **superpowers 6.3.0** (2026-08-12) adds harness support, brainstorming ceremony scaling,
  and SDD conflict-ruling behavior — nothing structural for hud. Its task batching changes
  how work is dispatched, not the ledger format, which `SKILL.md:437` still documents as
  per-task `Task <N>: complete`.

### Known, not fixed

- superpowers deletes a plan workspace only once its final review comes back clean, so an
  abandoned plan leaves its ledger on disk and keeps the badge active. Gating on ledger
  mtime was considered and rejected: the ledger is appended per task and per fix round, so
  any freshness window short enough to expire an abandoned plan would also blink out a
  live one mid-task. Documented in `README.md` with the manual remedy (delete the stale
  `.superpowers/sdd/<plan>/` directory) instead.
- The task-line regex requires a plain integer (`Task <N>:`), matching what `SKILL.md`
  documents. A hypothetical batched `Task 3-5: complete` line would be undercounted; left
  strict rather than widened speculatively.

### Tests

1136 tests, **1130 passing, 0 failing, 6 skipped** (eight added, two rewritten). The two
existing tests in `tests/superpowers-state.test.js` codified the dead flat path and
checkbox format, so they were rewritten against the plan-scoped layout. New coverage:
prose-ledger counts and objective, total falling back to task lines when todos are empty,
the legacy flat file being ignored, newest-plan-workspace-wins, discovery from a
subdirectory of the repo, the walk stopping at the repo root, checkbox format surviving
inside a plan workspace, and checkbox lines in a prose ledger counting as findings rather
than tasks. Verified end-to-end against a synthetic 6.2-format ledger (`✦
subagent-driven-development 1/2`) and against a real 8-task ledger from another project
relocated to the 6.2 layout, where 0.9.1 renders no badge and 0.9.2 renders `✦ sdd 7/8`
with the objective read from the identity line.

### Bumped

- `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` → `0.9.2`

## [0.9.1] - 2026-08-11 — MomePP fork (barStyle on model-scoped usage bars)

Patch: one fork-only rendering bug found by a post-release review of the 0.9.0 sync.
No config changes, no default changes.

### Fixed — fork

- `src/render/session-line.ts:197` — the model-scoped weekly usage window
  (`rate_limits.model_scoped`, adopted from upstream #669/#690) did not receive
  `display.barStyle`, while the context, 5-hour and 7-day bars beside it all did. With a
  non-default `barStyle`, the scoped bar rendered in default block glyphs next to
  correctly-styled neighbours — e.g. `[Opus] ━───── 10% │ Usage ━━━─── 25% │ Fable ████░░ 38%`.
  `display.barStyle` is a fork-only setting and model-scoped windows arrived from upstream
  after it, so the new call site was never threaded through during the sync.

### Tests

1129 tests, **1123 passing, 0 failing, 6 skipped** (one added). New regression test in
`tests/scoped-usage.test.js` asserts a `barStyle: "thin"` compact line contains no leftover
block glyphs; verified to fail against the unfixed build before the fix was restored.

### Known, not fixed

- `src/render/first-line-order.ts:49` (upstream code, unmodified) — `orderFirstLineParts`
  writes permuted texts back into fixed keyed-slot indices, so a segment contributing two
  parts is only kept adjacent when its destination slots happen to be adjacent. Its own doc
  comment promises those parts "stay together". Reachable in the fork's compact layout with
  `gitStatus.branchOverflow: "wrap"` plus a non-default `projectLineOrder`, because the fork
  interleaves more unkeyed parts (config counts, usage bars, thinking / pending-permission
  indicators) between keyed ones than upstream does — the project path and the `git:(…)`
  badge can then be split by an unkeyed part. Left as-is deliberately: honoring "keep
  multi-part segments together" and "unkeyed parts keep their original slots" are in direct
  tension, so the fix belongs upstream rather than as a fork divergence in a file the fork
  otherwise does not touch.

### Bumped

- `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` → `0.9.1`

## [0.9.0] - 2026-08-11 — MomePP fork (upstream sync onto 6f065f2, post-0.7.0)

Rebase-reconstruct of the fork onto the current upstream base, replacing the 0.3.0
(`b83b445`) root with upstream `6f065f2` — 80 upstream commits spanning releases 0.4.0
through 0.7.0 plus six unreleased. **Minor, not patch**: the sync adds a substantial set
of new user-facing options (jj status, `projectLineOrder`, `pathLevels: "full"`,
`display.rightAlign`, auth display, `modelSource`, wall-clock hour-cycle controls). It is
**not** major because every new option defaults to off/neutral — no existing fork user's
HUD changes appearance on update.

### Added — from upstream

- **jj (Jujutsu) status** — `jjStatus.enabled` (default `false`), `jjStatus.showDirty`,
  `jjStatus.showConflicts`. New `src/jj.ts` and `src/render/vcs-status.ts`; when enabled
  and a real `.jj` directory is present, jj replaces git for that repo (never both), and
  the branch badge renders `jj:(…)` with an optional `!conflict` marker (#685).
- **`projectLineOrder`** (`string[]`, default `[]`) — reorders first-line segments
  (`model`, `project`, `advisor`, `sessionName`, `version`, `extra`, `duration`, `cost`,
  `speed`, `auth`). New `src/render/first-line-order.ts` (#680).
- **`pathLevels: "full"`** — show the entire absolute cwd instead of the last 3 segments.
  New `src/render/project-path.ts` handles POSIX/Windows/UNC forms with control- and
  bidi-character stripping (#678).
- **`display.rightAlign`** (`string[]`, default `[]`) — right-aligns an ordered suffix of
  merged expanded rows (#693).
- **Auth display** — `display.showAuth`, `display.showAuthUser`, `display.authUserLength`
  (all off by default). New `src/auth.ts`, with derived labels cached against the source
  profile's mtime + size (#652, #700).
- **`display.modelSource`** (`stdin` | `auto` | `transcript`, default `stdin`) — proxy
  users can source the model name from the transcript. New `src/model-source.ts` (#643).
- **Traditional Chinese** — `zh-Hant` / `zh-TW` locale (`src/i18n/zh-Hant.ts`) (#645).
- **`display.showRoutedCost`** (default `false`) — opt into cost display for Bedrock and
  Vertex sessions, with explicit native (`Cost`) vs estimated (`Est.`) labeling (#648).
- **Claude 5 and MiniMax pricing** — Opus 5, Sonnet 5 (incl. the time-limited
  introductory rate) and Fable 5 in local cost estimates; official MiniMax
  Anthropic-compatible endpoints get a `MiniMax` provider label and M2.7 token/cache
  pricing (M3's context-tier pricing is deliberately not guessed) (#694, #696).
- **MCP error reporting** — failing MCP servers surface on the environment line when MCP
  activity or config counts are enabled, clearing after a later successful result (#699).
- **`display.hourCycle`** (`auto`|`h11`|`h12`|`h23`|`h24`) and
  **`display.showClockSeconds`** — wall-clock reset-time formatting (#692).
- **Model-scoped weekly usage windows** — rendered from stdin in both layouts, and
  accepted from the external usage snapshot's `model_scoped` field (#669, #690).
- **`scripts/clean-dist.mjs`** — clears `dist/` before every build; `tests/build-output.test.js`
  enforces source↔artifact parity so removed modules can't linger in a release (#670).
- **Transcript captures** — ultracode effort state (`ultracode(xhigh)`), the last
  assistant model, and agent `toolUseResult.resolvedModel` (#640, #679).
- **Setup Step 4.5** — offers a `statusLine.refreshInterval` (5s recommended / 1s / none)
  so time-based HUD data stays current between interactions (#682, hand-ported).

### Changed — fork

- `src/git.ts` — every git invocation now routes through upstream's `createGitRunner`
  (`src/git-runner.ts` + `src/windows-git-worker.ts`), which prevents short-lived Windows
  statusline processes from orphaning their git process trees and adds bounded output,
  timeouts, and non-interactive read-only git behavior (#703). The fork's sentinel-based
  status cache and parallel Stage A (`Promise.allSettled` over 4 commands) are retained —
  the runner multiplexes by request id, so concurrency stays safe on Windows.
- `src/git.ts` — grafted `resolveGitRef` / `buildGitHubRefUrl`: detached HEAD now shows an
  exact tag when one exists, else `detached:<short sha>`, and slash-separated branch names
  survive into GitHub branch links (#664).
- `src/transcript.ts` — assistant token usage now dedups on `message.id` with a high-water
  mark per message, so Claude Code's dual-logged and zero-then-grow streaming placeholders
  each count exactly once; records without a usable ID keep the previous consecutive
  usage-fingerprint fallback (#646, #698). `TRANSCRIPT_CACHE_VERSION` 11 → **16** (past
  upstream's 15) so neither lineage's stale caches survive.
- `src/render/lines/project.ts` — both renderers moved onto `getVcsDisplayState`, so jj
  never inherits git-only ahead/behind or file-stat settings. `buildExtras` now returns
  keyed `FirstLinePart`s so `projectLineOrder` applies to pipes and compact layouts.
- **New divergence**: `projectLineOrder` does **not** apply to
  `display.projectStyle: "natural"`. Natural style composes prose (`… in X on Y`), so
  permuting its segments would break the grammar; it keeps its fixed order.

### Conflict resolutions (kept fork features intact)

- `commands/setup.md` — taken wholesale from the fork (launcher-based setup); upstream's
  inline-one-liner changes rejected, and only the orthogonal #682 refreshInterval step
  hand-ported as Step 4.5.
- `src/config.ts` — fork side for the pinned default colors, optional `colors.barFilled` /
  `colors.barEmpty`, and `colors.thinking` / `colors.duration`; upstream side for
  `jjStatus`, `projectLineOrder`, `hourCycle`, `showClockSeconds`, `modelSource`, auth and
  routed-cost flags. `validateMaxWidth` now clamps to `MAX_TERMINAL_WIDTH` (upstream's
  hostile-width cap) while keeping the fork's validator shape.
- `src/transcript.ts` — resolved as `--ours`, then upstream's logic grafted into the
  fork's `handleLine` closure. All three background-agent completion signals verified
  intact: `<task-notification status="completed">` (OAC), `queue-operation` enqueue
  (upstream), and `tool_result` timestamp (foreground fallback).
- `src/render/session-line.ts` — the fork's inline indicators (thinking, pending
  permission, last-request tokens, natural-style duration) re-expressed against upstream's
  new keyed `push(text, key)` API rather than dropped.
- `src/types.ts`, `src/index.ts` — additive on both sides; `latestSuperpowersSkill` and the
  orchestration wiring sit alongside upstream's `authInfo`, `mcpErrors`, `ultracodeActive`,
  `lastAssistantModel`, and `resolveVcsStatus`.
- `package.json` — the fork's esbuild bundle step retained, now prefixed with upstream's
  `node scripts/clean-dist.mjs`.

### Skipped (per fork direction)

- `.github/workflows/*` (4 files) and `.github/dependabot.yml` — the fork runs no CI.
  Note these merge in **silently** (upstream-modified `ci.yml` conflicts; the rest
  auto-apply), so they must be removed explicitly during a sync.
- Upstream's inline dynamic one-liner setup — the fork ships per-platform launcher
  scripts (`scripts/claude-hud.sh`, `scripts/claude-hud.ps1`) that `settings.json` points at.
- Upstream's re-theme of default colors — `model: green`, `project: cyan`,
  `gitBranch: brightMagenta` stay pinned.
- Required `colors.barFilled` / `colors.barEmpty` — they stay optional so
  `display.barStyle` controls bar characters end-to-end.
- Consolidating `colors.thinking` / `colors.duration` into `colors.label`.

### Default-behavior changes visible on update

None. Every option adopted this sync defaults to off or neutral (`jjStatus.enabled: false`,
`projectLineOrder: []`, `rightAlign: []`, `showAuth: false`, `modelSource: "stdin"`,
`pathLevels: 1`, `hourCycle: "auto"`, `showRoutedCost: false`). Fork pins verified after
the merge: `model: green` / `project: cyan` / `gitBranch: brightMagenta`, `barFilled` and
`barEmpty` both `undefined`, `colors.thinking` and `colors.duration` present, orchestration
defaults unchanged (`auto` / `true` / `false`).

Existing sessions will re-parse their transcript once, because
`TRANSCRIPT_CACHE_VERSION` moved to 16.

### Tests

1128 tests, **1122 passing, 0 failing, 6 skipped**. `npm run build` clean, `tsc --noEmit`
clean, and `dist/` reproduces byte-identically from a clean build.

Fork-specific suites still cover what they did before: `tests/transcript-omc.test.js`
(proxy_ stripping, background-agent signals), `tests/omc-state.test.js` and
`tests/superpowers-state.test.js` (orchestration readers), `tests/project-indicators.test.js`
(thinking / pending-permission / last-request-token indicators), `tests/mcp-tool-name.test.js`.

Two upstream tests were adapted rather than accepted verbatim:

- `tests/setup-command.test.js` — upstream asserts `/dev/tty` probe ordering inside the
  inline one-liners in `commands/setup.md`. The fork has no inline one-liners; its probe
  lives in `scripts/claude-hud.sh`, so the test follows it there. The launcher's
  brace-grouped `{ stty size </dev/tty; } 2>/dev/null` is stricter than upstream's form —
  it also silences stderr from a failing redirection itself.
- `tests/render.test.js` — the agent-model assertion expected lowercase `general-purpose`;
  relaxed to `General-purpose` for the fork's `display.agentNamespaceMode: "strip"`
  capitalization. The assertion's subject (the compacted `[sonnet-5]` model label) is
  unchanged.

### Bumped

- `package.json` → `0.9.0`
- `.claude-plugin/plugin.json` → `0.9.0`
- `.claude-plugin/marketplace.json` → `metadata.version: 0.9.0`

## [0.8.0] - 2026-06-21 — MomePP fork (unified orchestration awareness — OMC + superpowers)

Fork feature, no upstream sync. Reshapes the OMC-only orchestration awareness
into a **unified, source-selectable** feature that also supports the
[superpowers](https://github.com/obra/superpowers) plugin behind one shared
`OrchestrationState` abstraction. Bumped **minor** (not patch) because it adds a
new user-visible feature and a new config schema (the `orchestration*` keys),
even though defaults preserve OMC behavior and old keys migrate. Built spec-first
(`.claude/specs/`) and plan-first (`.claude/plans/`), TDD throughout.

### Added — fork

- **Unified orchestration config** (`src/config.ts`): `display.orchestrationSource`
  (`auto`/`superpowers`/`omc`/`off`, default `auto`), `display.showOrchestration`
  (default true), `display.showOrchestrationDetail` (default false),
  `display.orchestrationFreshnessMs` (default 900000).
- **Shared abstraction** `src/orchestration.ts` (`OrchestrationState`) produced by
  both `readOmcState` and the new `readSuperpowersState`.
- **Superpowers reader** `src/superpowers-state.ts`: phase = latest
  `superpowers:<skill>` in the transcript (freshness-windowed); task counts
  enriched by `<cwd>/.superpowers/sdd/progress.md`, else from todos; running-agent
  count from the transcript.
- **Transcript capture** (`src/transcript.ts`): `latestSuperpowersSkill { name, at }`
  on `TranscriptData`; serialized through the cache (version 10→11).
- **Source-driven resolution** `resolveOrchestration` in `src/index.ts` — `auto`
  prefers superpowers then OMC; pinning skips the other reader's fs read.
- **Inline badge** glyph by source: `✦` superpowers / `⚙` OMC, on the project line.
- **Detail line** `src/render/orchestration-line.ts` (replaces `omc-line.ts`):
  `✦`/`◆ <mode>: <objective> (c/t) · N agents`.
- New test suite `tests/superpowers-state.test.js`; config-migration + render tests.

### Changed — fork

- `RenderContext.omcState` → `RenderContext.orchestration` (`src/types.ts`).
- `readOmcState` now returns the shared `OrchestrationState` (`source: 'omc'`)
  instead of the old `OmcState` shape (`src/omc-state.ts`).
- Project-line badge is source-agnostic (`src/render/lines/project.ts`).
- `tests/omc-state.test.js` adapted to the `OrchestrationState` shape.

### Migration (existing config compatibility)

- Legacy `display.showOmcMode` → `showOrchestration`, `display.showOmcState` →
  `showOrchestrationDetail`, read as fallback in `mergeConfig` when the new keys
  are absent. New keys win when both are present. `orchestrationSource` defaults
  to `auto`, which still resolves OMC for an OMC user.

### Skipped (per fork direction)

- No upstream changes in this release (fork-only feature).
- OMC support is **not** removed — kept dormant and selectable (`orchestrationSource:
  "omc"` / `auto`), honoring the fork's "OMC must survive" doctrine while extending it.
- Default colors stay pinned; `colors.thinking`/`colors.duration` and optional bar
  chars unchanged.

### Default-behavior changes visible on update

- OMC users on defaults: no visible change (`auto` resolves OMC; `showOrchestration`
  defaults true; legacy keys migrate). The inline OMC badge still renders `⚙ <mode>`.
- superpowers users: with `orchestrationSource: "superpowers"` (or `auto`), the
  project line now shows a `✦ <phase> c/t` badge when a `superpowers:` skill is
  recently active.

### Tests

- 882 passed, 0 failed (`npm test`). New `tests/superpowers-state.test.js` covers
  transcript phase capture + the reader (freshness, progress.md parse, todos
  fallback, null cases). Fork OMC suites (`tests/omc-state.test.js`,
  `tests/transcript-omc.test.js`) still green against the unified shape.

### Bumped

- `package.json` → `0.8.0`
- `.claude-plugin/plugin.json` → `0.8.0`
- `.claude-plugin/marketplace.json` → `0.8.0`

## [0.7.0] - 2026-06-21 — MomePP fork (upstream 0.3.0 sync — advisor, skills/MCP, compactions, provider-before-model)

Upstream sync via rebase-reconstruct onto upstream `b83b445` (release 0.3.0). The
fork's previous base (`b293c9f`) predated *every* upstream tagged release, so this
single sync absorbs upstream 0.1.0 → 0.1.1 → 0.2.0 → 0.2.1 → 0.3.0 — ~27 feature/fix
commits. Bumped **minor** (not patch) because new elements (`skills`, `mcp`) join
`DEFAULT_ELEMENT_ORDER` and `addedDirs` is now ordered explicitly; although all new
display lines are opt-in (default `false`), the element-order default and the
provider-before-model option are user-visible schema changes. `TRANSCRIPT_CACHE_VERSION`
bumped 5 → 10 (past upstream's 9) to invalidate caches written under both older parse
semantics.

### Added — from upstream

- **Advisor model line** — `display.showAdvisor` + `display.advisorOverride` (capped 80).
  Renders `Advisor: Opus 4.7` inline on the project line. New `src/render/lines/advisor.ts`;
  transcript captures the `advisorModel` field stamped on assistant records.
- **Skills/MCP activity** — `display.showSkills` / `display.showMcp` + `skills` / `mcp`
  HUD elements. New `src/render/skills-mcp-line.ts`; transcript captures active Skill
  invocations and MCP server names (`normalizeSkillName` / `extractMcpServerName`).
- **Session compaction count** — `display.showCompactions`. New `src/render/lines/compactions.ts`;
  transcript counts `compact_boundary` markers.
- **Provider-before-model** — `display.showProvider` + `display.providerName` (capped 40),
  via new `src/render/model-display.ts` (`formatModelDisplay`).
- **autoCompactWindow** — `display.autoCompactWindow` (validated positive int) as the
  context-percentage / token-display denominator, matching `/context`.
- **`balance_label`** rendered alongside stdin `rate_limits`; external usage snapshot can
  also serve fallback windows when stdin is missing.
- **Fallback speed estimation** via transcript file growth (`src/speed-tracker.ts`).
- **`CLAUDE_HUD_DISABLE`** env kill-switch to disable the HUD.
- **Shared `src/utils/`** — `format.ts`, `hyperlinks.ts`, `sanitize.ts`, `truncate.ts`
  (upstream's dedup refactor).
- i18n: Simplified-Chinese "token" → 词元; new `label.advisor` key (en + zh-Hans).
- Debug logging in previously-silent catch blocks (`createDebug`).

### Changed — fork

- `src/render/lines/project.ts` — adopted `formatModelDisplay(model, ctx)` in the pipes
  renderer (a superset of the fork's trailing-provider + effort logic: identical output
  when `showProvider` is off). Advisor inlined in both pipes and natural renderers.
- `src/transcript.ts` — `extractTarget` `case 'Bash'` now collapses whitespace before
  truncating (multiline commands render as one line).
- Opus 4.5 pricing corrected (`src/cost.ts`); `--extra-cmd` now requires opt-in
  (`CLAUDE_HUD_ALLOW_EXTRA_CMD`); cache-file permission hardening — all from upstream,
  adopted as-is.

### Conflict resolutions (kept fork features intact)

- `src/transcript.ts` — `--ours` then **surgical graft** into the fork's `handleLine`
  closure: advisor capture inside the assistant block, `compactionCount += 1` in the
  fork's top-level `compact_boundary` block, skill/MCP capture in `processEntry` (signature
  +`skillSet, mcpServerSet`; capture keyed on the fork's proxy-stripped `canonicalName`),
  plus serialize/deserialize round-trip (`normalizeNameList`). All three background-agent
  completion signals, thinkingState, pendingPermission, 4MB tail read preserved.
- `src/config.ts` — unioned upstream's `showAdvisor` / `advisorOverride` / `autoCompactWindow`
  into the interface, `DEFAULT_CONFIG`, and `mergeConfig`; kept fork pins (default colors,
  `colors.thinking` / `colors.duration`, optional bar chars, `agentNamespaceMode`, OMC flags).
- `src/git.ts` — `--ours` (fork's sentinel-cache + parallel-spawn rewrite); upstream's
  catch-block debug logging didn't fit the `allSettled` structure and was dropped.
- `src/stdin.ts`, `src/render/agents-line.ts` — unions (cwd fallback + debug; `formatNamespaced`
  + shared `truncateString`).
- `commands/setup.md`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` — `--ours`
  (fork launcher + branding). `README.md` — kept fork annotations, added new option rows,
  added the upstream Security Notes section. `CHANGELOG.md` — `--ours` + this entry.

### Skipped (per fork direction)

- **No `.github/workflows/`** — upstream CI workflows rejected (fork has no CI).
- **Launcher-based setup kept fork-only** — `commands/setup.md` `--ours`; upstream's inline
  dynamic one-liner not adopted.
- **Default colors stay pinned** — `model: green`, `project: cyan`, `gitBranch: brightMagenta`.
- **`colors.barFilled?` / `colors.barEmpty?` stay optional** (`string | undefined`).
- **`colors.thinking` / `colors.duration` stay** as independent overrides.
- Upstream's git.ts catch-block debug logging (incompatible with the fork's `allSettled` rewrite).

### Default-behavior changes visible on update

- `DEFAULT_ELEMENT_ORDER` now includes `addedDirs`, `skills`, `mcp`. Existing configs with an
  explicit `elementOrder` are unaffected; users on defaults see `addedDirs` ordering formalized
  (skills/mcp render only when their opt-in flags are set).
- When `display.showProvider` is **off** (default), provider display is byte-identical to before
  (`[Opus 4.6 | Bedrock]`). No other visible change unless an opt-in flag is enabled.

### Tests

- 866 passed, 0 failed, 0 skipped (`npm test`). Upstream's new coverage suites
  (`*-coverage.test.js`, render/usage/version/identity/memory/session-tokens) came along.
  Two upstream provider tests and one multiline-Bash test drove fork code changes
  (`formatModelDisplay` adoption, Bash whitespace-collapse) rather than test deletion.
  Fork-specific `tests/transcript-omc.test.js` still green.

### Bumped

- `package.json` → `0.7.0`
- `.claude-plugin/plugin.json` → `0.7.0`
- `.claude-plugin/marketplace.json` → `0.7.0`

## [0.6.1] - 2026-06-02 — MomePP fork (git-status cache invalidation fixes)

Fork-only bugfix. No upstream sync. The mtime-sentinel git-status cache (the
performance optimization that avoids spawning ~5 git processes per ~300ms
statusline tick) served stale data in four cases the sentinel set never
covered — most visibly an already-pushed commit still counted as `ahead` on
the first statusline render of a new session.

Patch bump (0.6.0 → 0.6.1): pure correctness fix, no config keys added and no
visible default behavior changed beyond the statusline now reflecting reality
sooner.

### Added — from upstream

- None. This release contains no upstream changes.

### Changed — fork

- **Git-status cache now invalidates on push and ref moves.** Added the local
  branch ref (`refs/heads/<branch>`), the configured upstream ref
  (`refs/remotes/<remote>/<branch>`), and `packed-refs` to the sentinel set.
  `git push` advances the upstream ref while touching none of the prior
  sentinels (fetch updates `FETCH_HEAD`; push does not), and
  `git update-ref`/`branch -f`/worktree moves shift the local ref with no
  index change — both previously left `ahead`/`behind` stale.
  (`src/git.ts` — `resolveRefSentinelPaths`, `parseBranchUpstream`,
  `buildGitSentinelPaths`)
- **2s max-age TTL backstop** (`GIT_CACHE_MAX_AGE_MS`, `src/git.ts`) — in-place
  edits/deletes of tracked files change `isDirty`/`fileStats` but touch no
  `.git/` file, so the sentinel check alone served a stale clean/dirty state
  indefinitely. Bounding cache age to 2s keeps `isDirty` correct within that
  window while still cutting git spawns ~6× vs. uncached. Cache entries lacking
  `computedAt` (older format) or with backwards clock skew count as stale.

### Conflict resolutions (kept fork features intact)

- N/A — no merge; single fork commit on top of `0.6.0`.

### Skipped (per fork direction)

- Nothing rejected this cycle (no upstream changes to evaluate). The standing
  rejections (macOS/Linux launcher-only setup, optional `colors.barFilled`/
  `colors.barEmpty`, `colors.thinking`/`colors.duration` preservation, pinned
  default colors, no CI workflows) remain in force and untouched.

### Default-behavior changes visible on update

- The statusline now drops a stale `ahead`/`behind` count (e.g. an
  already-pushed commit shown as unpushed) on the next tick after a push or ref
  move, and reflects an unstaged tracked-file edit within ~2s. No config
  changes required.

### Tests

- `npm test` — 698 pass, 0 fail, 0 skipped. Added three regression tests in
  `tests/git.test.js`: `ahead` refresh after push, `ahead` refresh after a
  local ref move via `update-ref`, and TTL-driven `isDirty` detection for an
  in-place tracked-file edit. Fork-specific parser suites
  (`tests/transcript-omc.test.js`) remain green.

### Bumped

- `package.json` → `0.6.1`
- `.claude-plugin/plugin.json` → `0.6.1`
- `.claude-plugin/marketplace.json` → `0.6.1`

## [0.6.0] - 2026-05-29 — MomePP fork (upstream sync: tool-name truncation, elapsed usage, customLine position, win32 hardening)

Upstream sync of 21 commits (`be9902a..b293c9f`) via the rebase-reconstruct
procedure — the fork is re-baselined onto `upstream/main` as a single linear
commit, not merged. Adopts upstream's tool-name truncation, elapsed usage-window
modes, custom-line positioning, an external-usage write path, and a Windows
console-flash fix, while preserving every fork feature byte-for-byte.

Minor bump (0.5.1 → 0.6.0): adds several new fork-visible config keys and flips
one default users will notice — completed-tool overflow now renders a `+N more`
indicator (the prior fork hard-capped at 4 silently).

### Added — from upstream

- **`display.toolNameMaxLength`** (number, default `0`) — hard cap on displayed
  tool-name length; `0` keeps full names. Applied *after* the fork's MCP-name
  compression. (`src/render/tools-line.ts`, `src/config.ts`)
- **`display.toolsMaxVisible`** (number, default `4`) — max completed tools shown
  on the tools line; `0` = unlimited. Adds a `+N more` overflow indicator and
  narrow-terminal wrap. (`src/render/tools-line.ts`)
- **`display.timeFormat`** new modes `elapsed` and `elapsedAndAbsolute` — show how
  far through each usage window you are (`53% elapsed`), optionally plus the
  wall-clock reset time. (`src/config.ts`, `src/render/lines/usage.ts`)
- **`display.customLinePosition`** (`first` | `last`, default `last`) — place the
  custom line before the model badge or at the end. (`src/config.ts`,
  `src/render/lines/project.ts`, `src/render/session-line.ts`)
- **`display.externalUsageWritePath`** (string, default `""`) — write the official
  stdin `rate_limits` to a private local JSON snapshot for other tools; absolute
  `.json` path in an existing directory only. (`src/external-usage.ts`,
  `src/config.ts`)
- **Context fallback + todo rendering stabilization** (upstream #579) and
  **external usage snapshot writer hardening** (upstream #570), auto-merged.
- Dev-dep: `@types/node` bump came along in `package-lock.json`.

### Changed — fork

- **Tool-name rendering composes both mechanisms** (`src/render/tools-line.ts`) —
  the fork's `formatToolName` MCP compression (`mcp__plugin_x__fn` → `x:fn`) runs
  first, then upstream's `shortenToolName` length-caps. Applied identically in the
  running-tools and completed-tools loops, so MCP names stay readable then
  truncate consistently (e.g. `context-mode:ctx_batch_execute` at default,
  `plu…` at `toolNameMaxLength: 4`).
- **`windowsHide: true` on every git spawn** (`src/git.ts`) — adopted upstream's
  console-flash fix, grafted onto the fork's cached `Promise.allSettled` git path
  (all four parallel execs + the Stage-B numstat).
- **customLine positioning works in both project styles** (`src/render/lines/project.ts:100`,
  `:292`) — `buildExtras` emits customLine only at the default `last` position; a
  `first` front-push was added to **both** `renderPipesProjectLine` and the
  fork-only `renderNaturalProjectLine`, so customLine is never dropped (natural +
  `first`) or duplicated (pipes + `first`).

### Conflict resolutions (kept fork features intact)

- `src/config.ts` — merged `TimeFormatMode` to carry both the fork's existing
  modes and upstream's `elapsed`/`elapsedAndAbsolute`; kept fork-only
  `ProjectStyleMode`/`BarStyleMode`/`AgentNamespaceMode` alongside upstream's new
  `CustomLinePosition`. Default-color pins, optional `barFilled`/`barEmpty`, and
  independent `colors.thinking`/`colors.duration` all preserved.
- `src/render/tools-line.ts` — kept fork's `formatToolName`/`formatToolTarget`
  (MCP compression + `Skill` namespace formatting); added upstream's
  `shortenToolName`/`toolNameMaxLength`/`toolsMaxVisible` around it.
- `src/render/lines/project.ts` — kept the natural-style git block (`coreSegments`
  prose layout) where upstream had edited its single-function customLine handling.
- `src/git.ts` — `git checkout --ours` semantics on the parse structure (fork's
  cache + parallel execs), then grafted `windowsHide` surgically.
- `commands/setup.md` — `--ours` wholesale (fork launcher-based setup).
- `README.md` — added/updated upstream option rows in the fork's reorganized table.
- `tests/render.test.js` — adapted two upstream tool-name tests to the fork's
  `formatToolName` compression; added natural-mode customLine position regression
  tests.

### Skipped (per fork direction)

- **Upstream `setup.md` statusline backup/detect flow** — the fork uses
  per-platform launcher scripts (`scripts/claude-hud.sh`/`.ps1`) that
  `settings.json` points at, not upstream's inline one-liner. Kept fork setup via
  `--ours`.
- **No `.github/workflows/`** — the fork runs no CI; upstream workflow files are
  never imported.
- **Default-color pins** (`model: green`, `project: cyan`, `gitBranch: brightMagenta`),
  **optional `colors.barFilled`/`colors.barEmpty`**, and **independent
  `colors.thinking`/`colors.duration`** — all preserved against upstream
  re-theming / consolidation.

### Default-behavior changes visible on update

- Completed-tool overflow now shows a **`+N more`** indicator when more than
  `toolsMaxVisible` (default 4) distinct completed tools are present. The prior
  fork capped at 4 silently with no overflow hint. Tool-name truncation stays off
  by default (`toolNameMaxLength: 0`), so names are unchanged unless opted in.

### Tests

695 tests, all pass, 0 skipped (was 657 on 0.5.1; +38 from adopted upstream
suites and fork regression cases). Fork-specific suites (`tests/transcript-omc.test.js`,
the tools-line MCP-compression and natural-mode customLine cases in
`tests/render.test.js`) still cover the preserved fork features.

### Bumped

- `package.json` → `0.6.0`
- `.claude-plugin/plugin.json` → `0.6.0`
- `.claude-plugin/marketplace.json` (`metadata.version`) → `0.6.0`

## [0.5.1] - 2026-05-27 — MomePP fork (stdin cwd resilience hardening)

Patch: resilience-only hardening — **no user-visible change today** (current
Claude Code sends a top-level `cwd`). Guards against a future Claude Code that
might move cwd solely under `workspace`.

### Changed — fork

- **stdin cwd resilience** (`src/stdin.ts`) — the parser now falls back to
  `workspace.current_dir` when the payload has no top-level `cwd`. Claude Code
  currently sends top-level `cwd`, so behavior is unchanged today; this keeps
  project name / git / config counts / OMC state resolving if a future Claude
  Code version moves cwd solely under `workspace`. Normalized once at the parse
  chokepoint so every consumer benefits. Top-level `cwd` still wins when both
  are present.

### Tests

657 tests, all pass, 0 skipped. Added 2 `stdin` cases: `workspace.current_dir`
fallback when top-level `cwd` is absent, and top-level `cwd` precedence.

### Bumped

- `package.json` → `0.5.1`
- `.claude-plugin/plugin.json` → `0.5.1`
- `.claude-plugin/marketplace.json` (`metadata.version`) → `0.5.1`

## [0.5.0] - 2026-05-27 — MomePP fork (OMC re-focus + integration; re-add multi-platform/Windows)

Two themes. **(1) Re-focus OAC → OMC**: oh-my-claudecode is now the fork's primary
target (OAC kept as leftover compat), and the HUD gains OMC orchestration awareness.
**(2) Re-add multi-platform**, reversing the fork's long-standing "macOS / Linux only"
direction. No upstream merge — this is a fork-only platform release. The runtime
was already cross-platform (Windows `.cmd`/`.bat` version probing, `/[/\\]/` path
splitting, win32 path-case handling — all already tested); what the fork had
dropped was the **setup flow, the launcher, and the docs**, so that's what comes
back.

Minor bump (0.4.3 → 0.5.0): flips a documented fork direction (Windows) and adds
new config keys (`showOmcMode`, `showOmcState`) plus an OMC re-focus users notice.

**Windows is experimental and untested.** The maintainer develops on macOS/Linux
and the fork runs no CI (that invariant is intentionally kept), so the Windows
launcher and setup path are best-effort. macOS/Linux behavior is unchanged.

### Added — fork

- **OMC orchestration awareness** — new defensive reader `src/omc-state.ts` parses
  `<cwd>/.omc/state/mission-state.json` + `subagent-tracking.json` (never throws;
  runs every tick). Surfaces two features:
  - **Mode indicator** (`display.showOmcMode`, default **true**): inline
    `⚙ <mode> done/total` on the project line when an OMC mission is active
    (ralph / ultrawork / autopilot / team / …). Hidden when no named mode is active.
  - **`.omc` state line** (`display.showOmcState`, default **false**): opt-in
    `◆ <mode>: <objective> (done/total) · N agents`.
- **Namespace abbreviation** — badge mode renders `oh-my-claudecode` as `omc`
  (`[omc] Explore` rather than `[oh-my-claudecode] Explore`); `src/render/format-namespace.ts`.
- **PowerShell launcher** `scripts/claude-hud.ps1` — the Windows/PowerShell
  counterpart to `scripts/claude-hud.sh`. Resolves the highest installed version
  via `[version]` sort, caches the entry path in `.cached_hud_entry_ps` (separate
  from the bash launcher's cache so Git-Bash and PowerShell sessions don't clash),
  sets `$env:COLUMNS` from the console width, and hands off to `node`.
- **Windows setup instructions** in `commands/setup.md` — PowerShell and
  Windows-Git-Bash branches for locating the launcher, smoke-testing, and the
  `settings.json` `statusLine` command (`powershell -NoProfile -ExecutionPolicy
  Bypass -File ...`), plus `$OSTYPE` disambiguation (MSYS/Cygwin → use `.sh`).

### Changed — fork

- **Re-focused OAC → OMC** in `README.md`, `CLAUDE.md`, `.claude-plugin/plugin.json`,
  and `.claude-plugin/marketplace.json`: OMC is now the primary target, OAC is
  leftover compat. OAC code (the `<task-notification>` background-completion path,
  `oac:` rendering) is unchanged and kept — the 3-signal background-agent invariant
  still holds.
- **Reversed the "macOS / Linux only" non-negotiable** in `CLAUDE.md` → Fork
  direction: now multi-platform, with the launcher-based setup (not upstream's
  inline one-liner) as the fork divergence.
- **`README.md`** — "Why this fork exists" platform/launcher rows and the
  Limitations section updated to describe experimental, launcher-based,
  no-CI Windows support; added `display.showOmcMode` / `display.showOmcState`
  to the options table.
- **Windows hardening:** `src/memory.ts` now dispatches `win32` explicitly to the
  `os.totalmem()`/`os.freemem()` reader (accurate on Windows — wraps
  `GlobalMemoryStatusEx`, no win32-specific syscall needed). `scripts/claude-hud.ps1`
  guards against a missing `node` on PATH (exits quietly instead of erroring into
  the statusline). `commands/setup.md` gained ExecutionPolicy / `pwsh` / PATH
  notes and a Windows debug step.

### Skipped (scope boundaries for this release)

- **`.ps1` launcher not executed.** The maintainer has no Windows machine and the
  fork keeps no CI, so the PowerShell launcher and setup path are hardened by
  review only, not run. Windows-behavior *logic* (path/cwd rendering, memory,
  `.cmd`/`.bat` version probing) is unit-tested cross-platform on darwin.
- **No CI.** The fork's no-CI invariant is kept, so Windows remains untested in
  automation. (A `windows-latest` test job is the only way to gain real
  confidence; intentionally not added.)
- **Upstream's ghost-install cleanup flows and full `$OSTYPE`/MSYS matrix** were
  not imported wholesale — only the launcher-relevant Windows branches.

### Default-behavior changes visible on update

- **OMC users:** the `⚙ <mode> done/total` indicator appears on the project line
  when an OMC mission is active (`showOmcMode` defaults on). Non-OMC projects (no
  `.omc/`) see no change — the reader returns null. Badge-mode namespaces show
  `[omc]` instead of `[oh-my-claudecode]`.
- **Launcher/config users: none.** The `.sh` launcher and `settings.json` command
  are unchanged; existing configs keep working untouched.
- **Windows users** gain an (experimental) supported setup path for the first
  time since the fork began.

### Tests

655 tests, **655 pass, 0 fail, 0 skipped** on darwin (was 1 skipped). The
`renderSessionLine displays project name from Windows cwd` test no longer gates
on `win32` — the cwd split (`/[/\\]/`) is host-independent — and now runs
everywhere, joined by deep / mixed-separator Windows-path cases and a Windows
memory-path (`os.*`) computation test. OMC `tests/omc-state.test.js` (8 cases)
covers the reader and the badge abbreviation. The `.ps1` launcher and PowerShell
setup steps remain shell artifacts this darwin environment cannot execute.

### Bumped

- `package.json` → `0.5.0`
- `.claude-plugin/plugin.json` → `0.5.0`
- `.claude-plugin/marketplace.json` (`metadata.version`) → `0.5.0`

## [0.4.3] - 2026-05-26 — MomePP fork (upstream sync: session-usage dedup, canonical i18n, OSC 8 truncation)

Upstream sync adopting the 6 commits `a5b2d6e..be9902a`, applied as a
**rebase-reconstruct** rather than a merge: the fork was rebuilt on top of the
current `upstream/main` so `main` stays linear and upstream-rooted instead of
carrying both lineages (see `CLAUDE.md` → "Merging from Upstream"). The merge
engine was used only to compute the combined tree; the result was then flattened
onto `upstream/main` (`be9902a`) as a single linear commit.

Patch (not minor): no new fork config keys, render elements, or flipped
defaults. The one user-visible effect is more-accurate (lower) session-token
counts from the upstream dedup fix — a correctness bugfix, not a feature.

### Added — from upstream

- **Adjacent session-usage dedup** (`src/transcript.ts`) — Claude Code dual-logs
  each API response 2-3× consecutively, inflating session token totals ~2.3×.
  Consecutive entries with an identical usage signature now count once.
- **BCP-47 canonical language tags** (`src/i18n/index.ts`) — `getCanonicalLanguage()`
  / `isCjkLanguage()`; `zh` resolves to `zh-Hans`. `src/i18n/zh.ts` renamed to
  `src/i18n/zh-Hans.ts`. Validator now accepts `en` / `zh` / `zh-Hans` (`zh`
  kept as a back-compat alias). `src/render/width.ts` uses `isCjkLanguage()`
  instead of a hardcoded `=== 'zh'`.
- **Close OSC 8 hyperlink on truncation** (`src/render/index.ts`) — `closeOpenHyperlink()`
  emits the OSC 8 terminator when a truncation cuts inside an open hyperlink, so
  the link's underline stops at the ellipsis (most visible in `renderGitFilesLine`).
- **`@types/node` → `^25.8.0`** (dev dependency).
- **Docs** — Chinese README sync; `commands/configure.md` saves `zh-Hans`.

### Changed — fork

- **Reconstructed onto upstream base.** `main` is now `upstream/main` (`be9902a`)
  plus the fork delta as linear commits — no merge commit. This is the documented
  sync method going forward (replaces the prior merge doctrine in `CLAUDE.md`).
- **Dedup adapted into the fork's `handleLine` closure** (`src/transcript.ts`),
  not the vanilla loop upstream patched, so it covers both the streamed and the
  4MB tail-read paths. `lastUsageKey` resets on blank lines, non-assistant
  entries, assistant-without-usage, and parse errors; the `lastRequestTokenUsage`
  snapshot stays outside the dedup guard (idempotent under duplicates).
  `TRANSCRIPT_CACHE_VERSION` bumped 4 → 5 to invalidate stale inflated caches.
- **Corrected lazy-segmenter cost comments** (`src/render/index.ts`, `src/config.ts`).
  Benchmarked the first `Intl.Segmenter` construction in a fresh process at ~6ms
  (ICU grapheme-data init), not the "~2-4ms" previously documented — the lazy
  build + ASCII fast-path is worth more than the old comment implied.
- **`CLAUDE.md` / `README.md`** updated to document the rebase-reconstruct sync
  method, `--force-with-lease` push hygiene, and the fork's current sync point.

### Conflict resolutions (kept fork features intact)

- **`src/transcript.ts`** — the only real source conflict. Resolved by taking the
  fork side (`--ours`) and grafting upstream's dedup in surgically rather than
  reconciling interleaved markers. All three background-completion signals
  (`<task-notification>`, `queue-operation`, `tool_result`), `compact_boundary`
  tracking, and the tail-read path verified intact.
- **`src/config.ts`** — auto-merged; verified `validateLanguage` gained `zh-Hans`,
  default color pins (`model:green`/`project:cyan`/`gitBranch:brightMagenta`)
  and optional `barFilled?`/`barEmpty?` survived.
- **`src/i18n/index.ts`, `src/render/width.ts`, `src/render/index.ts`** —
  auto-merged cleanly; OSC 8 close and the fork's lazy ICU segmenter coexist.
- **`dist/*`** — clean rebuild (`rm -rf dist && npm run build`); pruned the stale
  `dist/i18n/zh.*` orphans left by the `zh.ts` → `zh-Hans.ts` rename.
- Verification: every one of the 13 fork-feature source files is **byte-identical**
  to the pre-rebase backup (`git diff` confirmed); source delta is exactly the 7
  upstream-driven files.

### Skipped (per fork direction)

- **`.github/workflows/*` and `.github/dependabot.yml`** — fork runs no CI.
- Recurring fork-direction rejections still upheld: macOS/Linux only (no
  Windows/PowerShell), `colors.barFilled?`/`colors.barEmpty?` stay optional,
  `colors.thinking`/`colors.duration` stay independent, default colors pinned.

### Default-behavior changes visible on update

- **Session token counts drop to accurate values** — the dedup removes the ~2.3×
  inflation, so the `Session` token figure will read lower than before (correct,
  not a regression). Stale `v4` transcript caches are auto-invalidated.
- `zh-Hans` is now the canonical Chinese tag; existing `language: "zh"` configs
  keep working unchanged (aliased).

### Tests

644 tests, **643 pass, 0 fail, 1 skipped** (the Windows-cwd test, skipped by
design on the macOS/Linux-only fork). Upstream's new assertions — adjacent-usage
dedup (`core.test.js`), canonical i18n resolution (`i18n.test.js`), OSC 8
truncation (`render-width.test.js`) — pass against the fork's adapted code. The
fork-specific suites (`transcript-omc`, `project-indicators`, `mcp-tool-name`)
remain green. Dedup adaptation passed a separate code-review gate.

### Bumped

- `package.json` → `0.4.3`
- `.claude-plugin/plugin.json` → `0.4.3`
- `.claude-plugin/marketplace.json` (`metadata.version`) → `0.4.3`

## [0.4.2] - 2026-05-15 — MomePP fork (perf: bundle dist + cache git status + lazy ICU segmenter)

Fork-only performance / battery release — no upstream merge. The statusline is
invoked every ~300ms by Claude Code as a fresh cold-start node process, so any
per-tick work multiplies into roughly 12,000 invocations/hour. This release
targets the three biggest steady-state CPU sinks identified by a focused audit
of the entire project; each fix is invisible to users and preserves every
fork-direction invariant.

Measured impact on an M-series Mac: steady-state wall time per tick drops from
**~60ms to ~30-40ms** (roughly half), measured with `/usr/bin/time -p` across
5 cold-start runs each, before and after.

Patch (not minor) because there are no new config keys, no new render
elements, no behavior changes — only internal restructuring.

### Changed — fork

- **Bundle `dist/index.js` with esbuild** (`package.json:14`). The build now
  runs `tsc` (still emitting all individual `dist/*.js` files so tests keep
  deep-importing them) followed by `esbuild dist/index.js --bundle --minify
  --keep-names --format=esm --target=node18` rewriting `dist/index.js` in
  place to a single ~94 KB self-contained module. Eliminates ~38 separate
  file open/parse/compile cycles per cold start, the single largest chunk of
  per-tick wall time. Tests still resolve individual modules from `dist/`;
  the launcher only loads `dist/index.js`. Source maps for `dist/index.js`
  are dropped post-bundle since they'd reference dead pre-bundle code.

- **Cache `getGitStatus` by `.git/` mtime sentinels** (`src/git.ts`). Previous
  builds spawned up to 5 `git` child processes on every tick (rev-parse,
  status, diff --numstat, rev-list, remote get-url) for ~15-40ms of fork /
  exec / pipe overhead on dirty repos. Now keyed by stat of `.git/HEAD`,
  `.git/index`, `.git/FETCH_HEAD`, `.git/ORIG_HEAD`, `.git/MERGE_HEAD`,
  `.git/config`, and the cwd directory itself — covering branch switches,
  stage operations, fetches, in-progress merges/rebases, remote URL edits,
  and top-level untracked-file adds. Cache lives at
  `<HudPluginDir>/git-cache/<sha256(cwd):16>.json`, mirroring the sentinel
  pattern in `src/config-reader.ts`. Cold-miss path additionally parallelizes
  the four independent git spawns via `Promise.allSettled` (was sequential
  `await`), cutting cold-miss wall from ~30ms to ~max-of-parallel. Worktrees
  (where `.git` is a file, not a dir) skip the cache and run uncached.

- **Lazy `Intl.Segmenter` with ASCII fast-path** (`src/render/index.ts:28-39`,
  `src/render/index.ts:73-91`, `src/config.ts:316-345`). Previous builds
  constructed `Intl.Segmenter` at module load even when no non-ASCII text
  would appear in the rendered line — ~2-4ms of ICU init per cold start.
  Now: lazy singleton getter that only constructs the segmenter when called,
  plus a `/^[\x00-\x7F]*$/` regex short-circuit in `segmentGraphemes` that
  skips the segmenter entirely for pure-ASCII text (the common case —
  model badges, percent labels, ASCII glyphs). CJK / emoji / combining-mark
  paths are unchanged. `validateBarChar` in `src/config.ts` shares the same
  lazy pattern via its own singleton.

- **Parallelize cold-miss git spawns** (`src/git.ts:96-117`). `rev-parse`,
  `status --porcelain`, `rev-list @{upstream}...HEAD`, and `remote get-url
  origin` now run concurrently via `Promise.allSettled` rather than serially
  via `await`. `diff --numstat HEAD` still runs sequentially after status
  because it conditionally fires only when status reports a dirty tree, and
  it needs the tracked-paths set from porcelain output.

### Build / dev dependencies

- **Added `esbuild ^0.28.0` as a devDependency.** Build-time only — runtime
  is still pure node, the launcher just does `exec node "$entry"` where
  `$entry` is the bundled `dist/index.js`. No runtime dependency change.

### Default-behavior changes visible on update

None. Every change is internal: same render output, same config schema, same
launcher path, same fork-direction invariants. Existing user configs work
unchanged. The git-status cache may surface a 1-tick (~300ms) lag for
untracked files created in deeply-nested subdirectories of cwd — top-level
untracked-file changes still tick the cwd sentinel and refresh immediately.

### Tests

632 passing / 1 skipped / 0 failing. The fork-specific `tests/transcript-omc.test.js`
still validates `<task-notification>` parsing, hybrid background-agent
completion (run_in_background flag + queue-operation + tool_result fallback),
and the 4MB tail-read path. `tests/git.test.js` (22 tests) validates the
rewritten `getGitStatus` — every test uses a fresh temp-dir cwd so the cache
is naturally cold-miss, exercising the recompute path. Bundled `dist/index.js`
is exercised by `tests/index.test.js` which imports `formatSessionDuration`
and `main` from the bundle and relies on `main`'s dependency-injection
overrides for module-boundary stubs — unaffected by bundling.

### Bumped

- `package.json` → `0.4.2`
- `.claude-plugin/plugin.json` → `0.4.2`
- `.claude-plugin/marketplace.json` → `metadata.version: 0.4.2`

## [0.4.1] - 2026-05-15 — MomePP fork (upstream sync — session-time, balance_label, usage remaining; hybrid background-agent tracking)

Pulls 30 upstream commits since 0.4.0's sync point. The headline change is a
**hybrid background-agent strategy**: structural detection via
`input.run_in_background`, plus first-wins completion from either fork's
`<task-notification>` parser (required by OAC's `oac:parallel-execution`
flow) or upstream's new `queue-operation` enqueue events (the source of
upstream's accuracy gains). Brittle string-prefix detection is now only a
fallback for older transcripts. Stayed on `0.4.1` (not `0.5.0`) because the
upstream additions are all opt-in or behind existing flags — no visible
default behavior change on update.

### Added — from upstream
- **`display.usageValue`** (`percent` | `remaining`, default `percent`).
  Show quota left instead of quota used (`75% remaining` vs `25%`).
  Warning colors and the 7-day threshold check still run on the
  underlying used percentage.
- **`balance_label` on `display.externalUsagePath` snapshots.**
  Prepaid third-party providers can surface their balance text
  (e.g. `¥6.35`) directly in the usage slot. Sanitized at parse
  time — strips ANSI / control / bidi-format sequences, capped at
  50 graphemes (`src/external-usage.ts`).
- **Session-time line.** New `display.showSessionStartDate` and
  `display.showLastResponseAt` flags, new `sessionTime` HudElement,
  new `src/render/lines/session-time.ts`. Shows transcript start
  timestamp and a relative `Last reply: 2m ago`.
- **i18n keys for the session-time line**: `label.sessionStarted`,
  `label.lastReply`, `format.ago`, `format.justNow` (en + zh).
- **`AgentEntry.background`** field — set from the Task tool's
  `input.run_in_background` field. Structural background-agent
  detection, no string sniffing.
- **`git status` unicode path fix.** Octal-escaped paths emitted by
  `git status -z` now decode correctly (`src/git.ts`); non-ASCII
  filenames no longer render as garbled bytes.
- **Stale transcript cache invalidation.** When the underlying
  transcript file is truncated / rewritten, the cached parse result
  is dropped instead of returning stale agent state.
- **Dep**: `@types/node` 25.6.0 → 25.6.2.

### Changed — fork
- **Hybrid background-agent tracking** (`src/transcript.ts`).
  Detection sets `agent.background = (input.run_in_background ===
  true)` at Task tool_use time, with the legacy `"Async agent
  launched"` tool_result prefix kept as an OR-fallback for older
  transcripts where the input field is missing. Completion accepts
  any of three signals — `<task-notification status="completed">`
  blocks (OAC compat), `queue-operation` enqueue events (upstream's
  accurate finish timestamp), or — for foreground agents — the
  tool_result timestamp. First-wins; once `status` flips to
  `completed`, subsequent signals are ignored. See line ~442
  (queue-op watcher) and ~760 (tool_result handler) in
  `src/transcript.ts`.

### Conflict resolutions (kept fork features intact)
- `src/config.ts` — kept `colors.thinking` / `colors.duration` and
  optional `colors.barFilled?` / `colors.barEmpty?` (per 0.4.0).
  Added upstream's `UsageValueMode`, `showSessionStartDate`,
  `showLastResponseAt`, and appended `sessionTime` to
  `DEFAULT_ELEMENT_ORDER`.
- `src/transcript.ts` — preserved fork's permission-prompt tracker,
  thinking state, last-request token tracker, `<task-notification>`
  parser, 4MB tail-read path, and `compact_boundary` tracking.
  Layered upstream's queue-operation watcher on top.
- `commands/setup.md` — kept fork's launcher-based setup wholesale
  (`--ours`). Discarded upstream's Windows PowerShell wrapper /
  OSTYPE=msys routing / BOM guidance.
- `README.md` / `CHANGELOG.md` — kept fork branding and "Why this
  fork exists" table; updated rows for hybrid background tracking,
  the three project-line indicators (thinking, pending permission,
  last-request tokens), preserved `colors.thinking` /
  `colors.duration`, and optional bar chars. Added new rows for the
  divergent default colors.

### Skipped (per fork direction)
- **Windows + PowerShell `/claude-hud:setup` wrapper, BOM guidance,
  and OSTYPE=msys routing.** Fork is macOS/Linux only.
- **Upstream's required-string `colors.barFilled` / `colors.barEmpty`
  shape.** Fork keeps them optional so `display.barStyle` keeps
  driving bar characters by default (commit `4287e07`).
- **Upstream's removal of `colors.thinking` / `colors.duration`.**
  Fork keeps them independent so the `∿ thinking` glyph and the
  session-duration token can be themed separately from labels.
- **Upstream's default-color changes** (`model: cyan`, `project:
  yellow`, `gitBranch: cyan`). Fork keeps prior defaults (`green` /
  `cyan` / `brightMagenta`) — change-on-merge would re-theme every
  existing fork user.

### Default-behavior changes visible on update
- `sessionTime` appended to `DEFAULT_ELEMENT_ORDER`. It's opt-in —
  only renders when `showSessionStartDate` or `showLastResponseAt`
  is set. Existing configs with explicit `elementOrder` are
  unaffected (they keep their order; add `"sessionTime"` to opt in).
- Background-agent completion is now more accurate for vanilla
  Claude Code background agents. Previous fork builds required a
  `<task-notification>` to mark them done; 0.4.1 also accepts the
  `queue-operation` event, so durations no longer hang at the
  launch timestamp when Claude Code emits the event.

### Tests
- 632 / 0 fail / 1 skipped on the merged tree.
- Fork-specific suites (`project-indicators.test.js`,
  `transcript-omc.test.js`, `mcp-tool-name.test.js`,
  `render-width.test.js`) still green.
- Restored 3 upstream tests in `tests/core.test.js` that codify
  queue-operation behavior — all pass under the hybrid (the fork
  had stubbed them out during the merge; reinstating them once the
  hybrid landed gives us both regression vectors covered).

### Bumped
- `package.json`, `.claude-plugin/plugin.json`,
  `.claude-plugin/marketplace.json` → 0.4.1.

## [0.4.0] - 2026-05-10 — MomePP fork (upstream sync — /add-dir, forceMaxWidth, bar char overrides)

Pulls 30 upstream commits since 0.3.2's sync point, bringing in workspace
`/add-dir` rendering, `forceMaxWidth`, Linux memory accuracy, bar-char
validation hardening, and a barFilled/barEmpty color override. Bumped to
0.4.0 (not 0.3.3) because the new `addedDirs` element is on by default in
`pipes` mode — pipes-style users will see new `+name` chips on the project
line whenever `/add-dir` is in use.

### Added — from upstream
- **Workspace `/add-dir` directories on the project line.** New
  `addedDirs` HudElement, `display.showAddedDirs` (default true),
  `display.addedDirsLayout` (`inline` | `line`, default `inline`).
  Inline renders `+name` chips next to the project; `line` renders a
  separate `Added dirs: name1, name2` line. Capped at 5 entries
  with `+N more` overflow; basenames truncated to 24 chars.
  Includes new `src/render/lines/added-dirs.ts` with the shared
  `sanitize` / `basenameOf` / `truncateBasename` / `normalizeAddedDirs`
  helpers (replaces the per-file `CONTROL_AND_BIDI_PATTERN` regex
  the fork carried).
- **`forceMaxWidth`** (default false). When set with `maxWidth`,
  always uses `maxWidth` even if terminal-width detection reports a
  smaller value. Useful for tmux edge cases.
- **`colors.barFilled` / `colors.barEmpty`** char overrides. When
  set, override the filled / empty character of progress bars
  (composes with fork's `display.barStyle` — see Fixed below).
- **Linux memory accuracy fix.** `showMemoryUsage` now reads
  `MemAvailable` from `/proc/meminfo` instead of `os.freemem()`,
  giving a more honest "used" number on Linux.
- **Context zero-usage guards.** Treats nonzero token totals with
  zero usage as suspicious (avoids the "0%" flicker some Claude
  Code builds emit) while still honouring live zero-percent usage
  data when totals are zero too.
- **Effort symbol spacing fix** in `pipes` mode. Restored from
  upstream — fork had silently dropped effort-level rendering in
  pipes mode during an earlier rebase. Now renders again when
  `display.showEffortLevel: true` (default false, so quiet by
  default).
- **Bar char validation hardening.** Invalid `barFilled` /
  `barEmpty` inputs are rejected: control chars, C1 controls,
  bidi/format chars, zero-width joiners, variation selectors,
  line/paragraph separators, noncharacters, and multi-grapheme
  strings. Falls back to the default when invalid.

### Fixed — fork
- **`display.barStyle` no longer silently disabled.** Mid-merge
  the new `colors.barFilled` (default `'█'`) and `colors.barEmpty`
  (default `'░'`) override would always win, defeating
  `barStyle: dots|square|thin|vertical|shade|double` for every
  existing user. `colors.barFilled` / `colors.barEmpty` are now
  optional (`string | undefined`) with no default — `barStyle`
  picks chars by default; per-char overrides take effect only when
  the user explicitly sets them.

### Conflict resolutions (kept fork features intact)
- `src/render/lines/project.ts` — preserved `formatCompactCount`,
  `getProjectPath`, `buildExtras` (with `∿ thinking`,
  `? <target>`, `last:` indicators) while adopting upstream's
  `added-dirs.ts` helpers; restored upstream effort-level rendering
  in pipes mode; merged upstream's inline addedDirs rendering with
  fork's `gitStatus.branchOverflow: 'wrap'` support.
- `src/render/colors.ts` — `quotaBar` / `coloredBar` now compose
  `display.barStyle` with `colors.barFilled` / `colors.barEmpty`
  (style picks defaults, override wins when set).
- `src/config.ts` — union of fork's `colors.thinking` /
  `colors.duration` plus upstream's `colors.barFilled` /
  `colors.barEmpty` (now optional) and `addedDirs` HudElement /
  `AddedDirsLayout`.
- `README.md` — kept fork's `colors.thinking` / `colors.duration`
  rows; added upstream's `forceMaxWidth`, `barFilled`, `barEmpty`
  rows.

### Known feature gap
- **`display.projectStyle: 'natural'` does not render inline
  `+addedDirs`.** `renderNaturalProjectLine` doesn't currently
  call `normalizeAddedDirs` — the inline `+name` chip is
  pipes-only. Natural-mode users who want to see `/add-dir`
  entries should set `display.addedDirsLayout: 'line'` to get the
  separate `Added dirs: …` line via the `addedDirs` element. Will
  address parity in a follow-up.

### Default-behavior changes visible on update
- `addedDirs` added to `DEFAULT_ELEMENT_ORDER` between `project`
  and `context`. If you have a custom `display.elementOrder` it
  still works but won't include `addedDirs` unless added.
- `display.showAddedDirs: true` and
  `display.addedDirsLayout: 'inline'` are the defaults — pipes
  users will see new `+name` chips beside the project name when
  `/add-dir` is in use. Set `display.showAddedDirs: false` to
  match pre-0.4.0 behavior.
- Effort-level re-enabled in pipes mode (only when
  `display.showEffortLevel: true`, default false).

### Tests
- 606 / 0 fail / 1 skipped on the merged tree.
- All fork-specific suites (`project-indicators.test.js`,
  `transcript-omc.test.js`, `mcp-tool-name.test.js`) still pass —
  total 68 fork-specific cases.

Bumped: `package.json`, `.claude-plugin/plugin.json`,
`.claude-plugin/marketplace.json` → 0.4.0.

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
