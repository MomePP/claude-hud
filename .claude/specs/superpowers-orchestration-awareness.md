# Superpowers orchestration awareness (unified OMC + superpowers)

## Context & problem

claude-hud has an **OMC (oh-my-claudecode) integration**: `readOmcState(cwd)`
reads `<cwd>/.omc/state/mission-state.json` + `subagent-tracking.json` and the
HUD renders an inline `⚙ <mode> c/t` badge (`showOmcMode`, default on) plus an
opt-in `◆` mission line (`showOmcState`, default off).

The user removed OMC and now uses the **superpowers** plugin. The OMC code is
currently *inert but harmless* — `readOmcState` returns `null` when `.omc/` is
absent, so nothing breaks; the feature is simply dead weight for a superpowers
user.

Superpowers is architecturally different from OMC: it keeps **no live
mission-state file**. Investigation (superpowers 6.0.3) found:

- **No `.omc`-style state JSON.** Workflow phase is only visible via the
  transcript's Skill invocations (`superpowers:<skill>`).
- **One readable file, SDD-only:** `<project>/.superpowers/sdd/progress.md` —
  markdown with `- [ ]` / `- [x]` task checkboxes + completion notes. Exists
  only during subagent-driven-development runs.
- **Plans** live in `.claude/plans/*.md` (this user's global override of the
  `docs/superpowers/plans/` default) with checkbox progress.
- Subagents (`Task`) and `TodoWrite` are ordinary transcript signals the HUD
  already parses.

### Usage context (this user)

The target user runs Claude Code in **auto mode** and a **compact 2-line dense
layout**. Modern Claude Code shows the **agents list and todos natively**, so
those HUD lines are redundant and disabled (`showAgents`/`showTodos`/`showTools`
off). The **pending-permission indicator is not wanted** (auto mode never blocks
on a prompt) — disabled via the existing `showPendingPermission: false` flag (the
feature is kept for other users, just turned off here).

Consequence for this design: the **inline phase badge on line 1 is the sole
orchestration surface** — it folds "current phase + task progress" onto the
project line, acting as the compact replacement for the now-disabled todos line.
The opt-in detail line stays off for this layout.

## Goals

1. Make the HUD surface superpowers workflow state with OMC-parity: an inline
   phase badge + task progress, and an opt-in detail line.
2. Support **both** ecosystems behind a **shared abstraction** and **unified
   config**, selectable one-at-a-time via a source selector.
3. Preserve backward compatibility for existing OMC users (config + behavior).
4. Fail safe and cheap: the resolver runs every ~300ms tick; any missing
   file / parse error yields `null`, never throws.
5. Deliver a **recommended 2-line dense config** (below) that pairs the inline
   badge with the native-CC-aware component set — config only, no extra code.

## Non-goals

- No persistent cross-session superpowers state (superpowers has none; we derive
  from the transcript + the optional progress file).
- No parsing of arbitrary plan files in `.claude/plans/` to guess "the active
  plan" — `progress.md` is the only execution-progress source; todos are the
  fallback. (Possible future enhancement, explicitly deferred — YAGNI.)
- No mid-workflow resume from disk — only the session transcript + progress file.

## Architecture — shared abstraction

A single source-agnostic state shape both readers produce:

```ts
// src/orchestration.ts (new)
export type OrchestrationSource = 'omc' | 'superpowers';

export interface OrchestrationState {
  source: OrchestrationSource;
  mode: string | null;          // OMC mission mode | sp phase (skill name)
  active: boolean;              // liveness — see below
  objective: string;            // OMC objective | sp plan/branch label (detail line)
  taskCounts: { total: number; completed: number; inProgress: number };
  agentsActive: number;
  updatedAt: Date | null;
}
```

Component map:

| Unit | Role | Depends on |
|---|---|---|
| `orchestration.ts` | `OrchestrationState` type + `OrchestrationSource` | — |
| `omc-state.ts` (adapt) | `readOmcState(cwd) → OrchestrationState \| null` | fs, cwd |
| `superpowers-state.ts` (new) | `readSuperpowersState(input) → OrchestrationState \| null` | fs, cwd, transcript-derived bits |
| `render/orchestration-line.ts` (new, replaces `omc-line.ts`) | one detail-line renderer; glyph by `source` | `ctx.orchestration` |
| `render/lines/project.ts` (adapt) | inline badge, source-agnostic | `ctx.orchestration` |
| `index.ts` (adapt) | resolve one `OrchestrationState` per `orchestrationSource` | both readers |

`RenderContext.omcState` → renamed **`RenderContext.orchestration`**.

### Precedence (index.ts)

Resolution runs **after** transcript parse (the superpowers reader needs
transcript signals). Driven by `display.orchestrationSource`:

```ts
let orchestration: OrchestrationState | null = null;
switch (source) {
  case 'off':          orchestration = null; break;
  case 'omc':          orchestration = readOmcState(cwd); break;
  case 'superpowers':  orchestration = readSuperpowersState(spInput); break;
  case 'auto':         // superpowers first (the active ecosystem), OMC fallback
  default:             orchestration = readSuperpowersState(spInput) ?? readOmcState(cwd); break;
}
```

Pinning to one source skips the other's fs read entirely.

## Superpowers reader — data sources

`readSuperpowersState` assembles `OrchestrationState` from signals the HUD
already has, plus one optional file:

- **`mode` (phase)** ← the most-recent `superpowers:<skill>` invocation, with the
  `superpowers:` prefix stripped (e.g. `executing-plans`). Captured in the
  transcript as `latestSuperpowersSkill { name, at }` (see Transcript change).
- **`active` (liveness)** ← `now - latestSuperpowersSkill.at < orchestrationFreshnessMs`
  (default 900000 ms = 15 min). Clears the badge when the user moves on.
  If there is no superpowers skill but `progress.md` exists with incomplete
  tasks, `active` is still true (execution in progress without a recent skill
  call).
- **`taskCounts`** ← parse `<cwd>/.superpowers/sdd/progress.md` checkboxes when
  present: `total` = count of `- [ ]` + `- [x]`/`- [X]`; `completed` = checked.
  `inProgress` = 0 from the file. **Fallback** when no `progress.md`: use
  `transcript.todos` (total/completed/inProgress the HUD already computes).
- **`objective`** ← first `# ` H1 heading line of `progress.md`, sanitized and
  length-capped; else empty.
- **`agentsActive`** ← `transcript.agents` running count.
- **`updatedAt`** ← `progress.md` mtime when present, else `latestSuperpowersSkill.at`.

Returns `null` when there is neither a fresh superpowers skill nor a
`progress.md` (nothing to show).

`readSuperpowersState` signature (testable — pure except one guarded file read):

```ts
readSuperpowersState(input: {
  cwd: string | undefined;
  latestSuperpowersSkill: { name: string; at: Date } | undefined;
  todos: TodoItem[];
  agentsActive: number;
  now: number;
  freshnessMs: number;
}): OrchestrationState | null
```

### Transcript change

In `processEntry`'s `tool_use` block, when a `Skill` call's `input.skill`
starts with `superpowers:`, record `latestSuperpowersSkill = { name, at: entryTimestamp }`
(latest wins). Add `latestSuperpowersSkill?: { name: string; at: Date }` to
`TranscriptData`; serialize/deserialize it (ISO string round-trip, like
`thinkingState.lastSeen`). Bump `TRANSCRIPT_CACHE_VERSION` 10 → 11 (parse
semantics changed).

## Rendering

- **Inline badge** (`project.ts` `buildExtras`, replaces the OMC block):
  gated on `showOrchestration && ctx.orchestration?.active && ctx.orchestration.mode`.
  Glyph by source: `✦` superpowers, `⚙` OMC (preserves OMC's look). Renders
  `dim("<glyph> <mode>")` + ` <completed>/<total>` when `taskCounts.total > 0`.
  `mode`/`objective` are external-derived → sanitized via the existing
  `sanitizeDisplayText`.
- **Detail line** (`render/orchestration-line.ts`, replaces `omc-line.ts`):
  gated on `showOrchestrationDetail`. `<glyph> <mode>: <objective> (c/t) · N agents`.
  Superpowers `✦`; OMC keeps `◆`.

## Config & migration

New `display` keys:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `orchestrationSource` | `auto`\|`superpowers`\|`omc`\|`off` | `auto` | which ecosystem to read |
| `showOrchestration` | boolean | `true` | inline badge |
| `showOrchestrationDetail` | boolean | `false` | opt-in detail line |
| `orchestrationFreshnessMs` | number\|null | `900000` | superpowers phase liveness window (validated positive int, like `autoCompactWindow`) |

**Backward-compat migration** in `mergeConfig`: when the new keys are absent but
the legacy `showOmcMode` / `showOmcState` are present, map
`showOmcMode → showOrchestration`, `showOmcState → showOrchestrationDetail`;
`orchestrationSource` defaults to `auto` (which still resolves OMC for an OMC
user). Legacy keys keep working and are documented as deprecated. When both new
and legacy keys are present, new wins.

## Recommended 2-line dense config (superpowers + auto mode)

A drop-in layered on the user's existing `config.json` (natural style, token
context, custom colors retained). Produces exactly two lines:

- **Line 1:** model · git · `✦ <phase> c/t` · duration · (added-dirs on their own
  line only if present).
- **Line 2:** context (tokens) + usage, merged.

```jsonc
{
  "lineLayout": "expanded",
  "elementOrder": ["project", "context", "usage"],   // drop tools/agents/todos
  "display": {
    "projectStyle": "natural",
    "showTools": false,
    "showAgents": false,      // Claude Code shows agents natively
    "showTodos": false,       // Claude Code shows todos natively
    "showPendingPermission": false,  // auto mode never blocks on a prompt
    "orchestrationSource": "superpowers",
    "showOrchestration": true,
    "showOrchestrationDetail": false,
    "showDuration": true,
    "showAddedDirs": true,
    "addedDirsLayout": "line"
  }
}
```

This is config only — no code beyond the orchestration feature. The plan will
include applying it to `~/.claude/plugins/claude-hud/config.json` as a final
step (the user already updated the launcher to 0.7.0).

> **Decision:** keep `showAddedDirs` with `addedDirsLayout: "line"`. A third line
> appears *only when* `/add-dir` directories exist — this conditional third line
> is accepted; the steady-state layout is two lines.

## Testing

- **`tests/superpowers-state.test.js`** (new): progress.md checkbox parse
  (mixed `[ ]`/`[x]`/`[X]`, blank, malformed); phase from `latestSuperpowersSkill`
  inside vs outside the freshness window; todos fallback when no progress.md;
  `null` when no superpowers signal; objective extraction + length cap;
  sanitization of mode/objective.
- **Precedence** (index-level): `auto` picks sp over omc when both present;
  `superpowers` ignores omc; `omc` ignores sp; `off` → `null`.
- **Config migration**: legacy `showOmcMode`/`showOmcState` → new keys; new keys
  take precedence; `orchestrationFreshnessMs` validation.
- **Render**: `✦` inline badge + detail line for superpowers; `⚙`/`◆` for OMC.
- **Adapt** `tests/transcript-omc.test.js` and existing OMC render tests to the
  `OrchestrationState` shape; keep OMC coverage green.

## File inventory

- **Add:** `src/orchestration.ts`, `src/superpowers-state.ts`,
  `src/render/orchestration-line.ts`, `tests/superpowers-state.test.js`.
- **Remove:** `src/render/omc-line.ts` (superseded by `orchestration-line.ts`).
- **Modify:** `src/omc-state.ts` (return `OrchestrationState`), `src/transcript.ts`
  (capture `latestSuperpowersSkill`; cache version 10→11), `src/types.ts`
  (`OrchestrationState` import; `RenderContext.orchestration`;
  `TranscriptData.latestSuperpowersSkill`), `src/index.ts` (source-driven
  resolution), `src/config.ts` (new flags + migration + `orchestrationFreshnessMs`
  validator), `src/render/lines/project.ts` (source-agnostic inline badge),
  `src/render/index.ts` (wire `orchestration-line`), `CLAUDE.md`
  (update the "must survive" orchestration row to the unified design + note
  legacy-key compat), `README.md` (option-table rows + superpowers note).

## Fork-direction note

This deliberately reshapes the OMC fork feature into a unified orchestration
feature — a sanctioned fork change. The CLAUDE.md "must survive" table is
updated accordingly (the *capability* survives and is extended; the OMC-specific
file/flag names become the unified set with legacy aliases). The hybrid
background-agent tracking and all other fork features are untouched.
