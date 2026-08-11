# Unified Orchestration Awareness (OMC + superpowers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace claude-hud's OMC-only orchestration awareness with a unified, source-selectable feature that supports both OMC and the superpowers plugin behind one shared `OrchestrationState` abstraction and one unified config.

**Architecture:** A single `OrchestrationState` shape is produced by two readers — `readOmcState(cwd)` (reads `.omc/state/*.json`) and `readSuperpowersState(input)` (derives phase from the transcript's latest `superpowers:*` skill, enriches task counts from `.superpowers/sdd/progress.md`, falls back to todos). `index.ts` resolves exactly one state per `display.orchestrationSource` (`auto`/`superpowers`/`omc`/`off`). One inline badge on the project line (glyph by source) and one opt-in detail line render it.

**Tech Stack:** TypeScript (ES2022, NodeNext), Node's built-in `node:test` runner, esbuild bundling. Tests import from `dist/` — **always `npm run build` before running tests.**

## Global Constraints

- Node 18+; TypeScript strict. Build: `npm run build`. Full tests: `npm test`. Single file: `npm run build && node --test tests/<file>.js`.
- The statusline runs every ~300ms in a fresh process. Every reader MUST be fully guarded: any missing file / parse error yields `null` (or zeroed counts), NEVER throws.
- Preserve all fork features (thinking indicator, pending-permission, last-request tokens, 4MB tail read, hybrid background-agent tracking, proxy_ stripping, natural project style, pinned default colors green/cyan/brightMagenta, optional bar chars, `colors.thinking`/`colors.duration`).
- External-derived strings (mode, objective) MUST be passed through `sanitizeDisplayText` before rendering.
- `dist/` is tracked: rebuild and stage it with every source change.
- Spec: `.claude/specs/superpowers-orchestration-awareness.md` (source of truth).

---

### Task 1: Shared `OrchestrationState` type + transcript phase capture

**Files:**
- Create: `src/orchestration.ts`
- Modify: `src/types.ts` (add `TranscriptData.latestSuperpowersSkill`)
- Modify: `src/transcript.ts` (capture it; serialize/deserialize; bump cache version 10→11)
- Test: `tests/superpowers-state.test.js` (new — Task 1 covers the transcript-capture cases)

**Interfaces:**
- Produces: `OrchestrationState`, `OrchestrationSource` (in `src/orchestration.ts`); `TranscriptData.latestSuperpowersSkill?: { name: string; at: Date }`.

- [ ] **Step 1: Create the shared type file**

Create `src/orchestration.ts`:

```ts
export type OrchestrationSource = 'omc' | 'superpowers';

/**
 * Source-agnostic orchestration snapshot. Produced by readOmcState() and
 * readSuperpowersState(); consumed by the inline project-line badge and the
 * opt-in detail line. A missing/absent source yields `null`, never a throw.
 */
export interface OrchestrationState {
  source: OrchestrationSource;
  mode: string | null;
  active: boolean;
  objective: string;
  taskCounts: { total: number; completed: number; inProgress: number };
  agentsActive: number;
  updatedAt: Date | null;
}
```

- [ ] **Step 2: Add the transcript field to `TranscriptData`**

In `src/types.ts`, inside `interface TranscriptData` (after the `advisorModel?: string;` line, before the closing `}`):

```ts
  // Most-recent `superpowers:<skill>` invocation (prefix stripped) and its
  // timestamp, for the orchestration phase badge's freshness window.
  latestSuperpowersSkill?: { name: string; at: Date };
```

- [ ] **Step 3: Write the failing test**

Create `tests/superpowers-state.test.js` with this first test:

```js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseTranscript } from '../dist/transcript.js';

function writeFixture(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-sp-'));
  const file = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return file;
}

test('parseTranscript captures the latest superpowers skill (prefix stripped)', async () => {
  const file = writeFixture([
    { type: 'assistant', timestamp: '2026-06-21T09:00:00.000Z', message: { role: 'assistant', content: [
      { type: 'tool_use', id: 's1', name: 'Skill', input: { skill: 'superpowers:brainstorming' } },
    ] } },
    { type: 'assistant', timestamp: '2026-06-21T09:30:00.000Z', message: { role: 'assistant', content: [
      { type: 'tool_use', id: 's2', name: 'Skill', input: { skill: 'superpowers:executing-plans' } },
    ] } },
    { type: 'assistant', timestamp: '2026-06-21T09:31:00.000Z', message: { role: 'assistant', content: [
      { type: 'tool_use', id: 's3', name: 'Skill', input: { skill: 'context-mode:ctx-search' } },
    ] } },
  ]);
  const result = await parseTranscript(file);
  assert.ok(result.latestSuperpowersSkill, 'should capture a superpowers skill');
  assert.equal(result.latestSuperpowersSkill.name, 'executing-plans');
  assert.equal(result.latestSuperpowersSkill.at.toISOString(), '2026-06-21T09:30:00.000Z');
});

test('parseTranscript leaves latestSuperpowersSkill undefined when no superpowers skill ran', async () => {
  const file = writeFixture([
    { type: 'assistant', timestamp: '2026-06-21T09:00:00.000Z', message: { role: 'assistant', content: [
      { type: 'tool_use', id: 's1', name: 'Skill', input: { skill: 'context-mode:ctx-search' } },
    ] } },
  ]);
  const result = await parseTranscript(file);
  assert.equal(result.latestSuperpowersSkill, undefined);
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm run build && node --test tests/superpowers-state.test.js`
Expected: FAIL — `latestSuperpowersSkill` is `undefined` (capture not implemented).

- [ ] **Step 5: Capture the skill in `processEntry`**

In `src/transcript.ts`, find the existing skill-capture block in `processEntry`'s `tool_use` handling:

```ts
      const skillName = canonicalName === 'Skill'
        ? normalizeSkillName(block.input?.skill)
        : undefined;
      if (skillName) {
        skillSet.add(skillName);
      }
```

Replace it with (adds the superpowers latest-skill capture; `timestamp` is already computed at the top of `processEntry`, and `result` is the accumulator):

```ts
      const skillName = canonicalName === 'Skill'
        ? normalizeSkillName(block.input?.skill)
        : undefined;
      if (skillName) {
        skillSet.add(skillName);
        // Track the most-recent superpowers phase (prefix stripped) for the
        // orchestration badge's freshness window.
        const SP_PREFIX = 'superpowers:';
        if (skillName.startsWith(SP_PREFIX) && entry.timestamp) {
          const prev = result.latestSuperpowersSkill;
          if (!prev || timestamp.getTime() >= prev.at.getTime()) {
            result.latestSuperpowersSkill = {
              name: skillName.slice(SP_PREFIX.length),
              at: timestamp,
            };
          }
        }
      }
```

- [ ] **Step 6: Add serialize/deserialize round-trip + bump cache version**

In `src/transcript.ts`:

(a) Bump the cache version:
```ts
const TRANSCRIPT_CACHE_VERSION = 11;
```

(b) In `interface SerializedTranscriptData`, after `advisorModel?: string;`:
```ts
  latestSuperpowersSkill?: { name: string; at: string };
```

(c) In `serializeTranscriptData`'s returned object, after the `advisorModel: data.advisorModel,` line:
```ts
    latestSuperpowersSkill: data.latestSuperpowersSkill
      ? { name: data.latestSuperpowersSkill.name, at: data.latestSuperpowersSkill.at.toISOString() }
      : undefined,
```

(d) In `deserializeTranscriptData`'s returned object, after the `advisorModel: ...` line:
```ts
    latestSuperpowersSkill: data.latestSuperpowersSkill
      && typeof data.latestSuperpowersSkill.name === 'string'
      && typeof data.latestSuperpowersSkill.at === 'string'
      ? { name: data.latestSuperpowersSkill.name, at: new Date(data.latestSuperpowersSkill.at) }
      : undefined,
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run build && node --test tests/superpowers-state.test.js`
Expected: PASS (both tests).

- [ ] **Step 8: Commit**

```bash
git add src/orchestration.ts src/types.ts src/transcript.ts tests/superpowers-state.test.js dist
git commit -m "feat(orchestration): shared OrchestrationState type + transcript superpowers-phase capture"
```

---

### Task 2: `readSuperpowersState` reader

**Files:**
- Create: `src/superpowers-state.ts`
- Test: `tests/superpowers-state.test.js` (append)

**Interfaces:**
- Consumes: `OrchestrationState` (Task 1), `TodoItem` (`src/types.ts`).
- Produces:
  - `SuperpowersStateInput { cwd?: string; latestSuperpowersSkill?: { name: string; at: Date }; todos: TodoItem[]; agentsActive: number; now: number; freshnessMs: number }`
  - `readSuperpowersState(input: SuperpowersStateInput): OrchestrationState | null`

- [ ] **Step 1: Write the failing tests**

Append to `tests/superpowers-state.test.js`:

```js
import { readSuperpowersState } from '../dist/superpowers-state.js';

const NOW = new Date('2026-06-21T10:00:00.000Z').getTime();
const FRESH = 900000; // 15 min

function spInput(over = {}) {
  return {
    cwd: undefined,
    latestSuperpowersSkill: undefined,
    todos: [],
    agentsActive: 0,
    now: NOW,
    freshnessMs: FRESH,
    ...over,
  };
}

test('readSuperpowersState: fresh skill → active badge, phase from skill', () => {
  const s = readSuperpowersState(spInput({
    latestSuperpowersSkill: { name: 'executing-plans', at: new Date(NOW - 60000) },
  }));
  assert.ok(s);
  assert.equal(s.source, 'superpowers');
  assert.equal(s.mode, 'executing-plans');
  assert.equal(s.active, true);
});

test('readSuperpowersState: stale skill, no progress file → null', () => {
  const s = readSuperpowersState(spInput({
    latestSuperpowersSkill: { name: 'brainstorming', at: new Date(NOW - FRESH - 1000) },
  }));
  assert.equal(s, null);
});

test('readSuperpowersState: no signal at all → null', () => {
  assert.equal(readSuperpowersState(spInput()), null);
});

test('readSuperpowersState: todos fallback when no progress file', () => {
  const s = readSuperpowersState(spInput({
    latestSuperpowersSkill: { name: 'executing-plans', at: new Date(NOW) },
    todos: [
      { content: 'a', status: 'completed' },
      { content: 'b', status: 'in_progress' },
      { content: 'c', status: 'pending' },
    ],
  }));
  assert.deepEqual(s.taskCounts, { total: 3, completed: 1, inProgress: 1 });
});

test('readSuperpowersState: progress.md enriches task counts + objective', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-sppm-'));
  fs.mkdirSync(path.join(dir, '.superpowers', 'sdd'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.superpowers', 'sdd', 'progress.md'),
    '# Delivery Notes — progress ledger\n\n- [x] Task 1\n- [X] Task 2\n- [ ] Task 3\n- [ ] Task 4\n');
  const s = readSuperpowersState(spInput({
    cwd: dir,
    latestSuperpowersSkill: { name: 'subagent-driven-development', at: new Date(NOW) },
  }));
  assert.deepEqual(s.taskCounts, { total: 4, completed: 2, inProgress: 0 });
  assert.equal(s.objective, 'Delivery Notes — progress ledger');
});

test('readSuperpowersState: progress file with incomplete tasks keeps badge active even with stale skill', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-sppm2-'));
  fs.mkdirSync(path.join(dir, '.superpowers', 'sdd'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.superpowers', 'sdd', 'progress.md'), '- [x] one\n- [ ] two\n');
  const s = readSuperpowersState(spInput({
    cwd: dir,
    latestSuperpowersSkill: { name: 'subagent-driven-development', at: new Date(NOW - FRESH - 1) },
  }));
  assert.ok(s);
  assert.equal(s.active, true);
  assert.equal(s.mode, 'subagent-driven-development');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run build && node --test tests/superpowers-state.test.js`
Expected: FAIL — `Cannot find module '../dist/superpowers-state.js'`.

- [ ] **Step 3: Implement the reader**

Create `src/superpowers-state.ts`:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { OrchestrationState } from './orchestration.js';
import type { TodoItem } from './types.js';

export interface SuperpowersStateInput {
  cwd?: string;
  latestSuperpowersSkill?: { name: string; at: Date };
  todos: TodoItem[];
  agentsActive: number;
  now: number;
  freshnessMs: number;
}

const OBJECTIVE_MAX = 60;

interface ProgressInfo {
  total: number;
  completed: number;
  objective: string;
  mtime: Date | null;
}

// Parse `<cwd>/.superpowers/sdd/progress.md` checkboxes + first H1 heading.
// Returns null on any absence/parse failure (guarded — runs every ~300ms).
function readProgressFile(cwd: string): ProgressInfo | null {
  try {
    const file = path.join(cwd, '.superpowers', 'sdd', 'progress.md');
    const stat = fs.statSync(file);
    const raw = fs.readFileSync(file, 'utf-8');
    let total = 0;
    let completed = 0;
    let objective = '';
    for (const line of raw.split('\n')) {
      const box = line.match(/^\s*[-*]\s+\[([ xX])\]/);
      if (box) {
        total += 1;
        if (box[1].toLowerCase() === 'x') completed += 1;
      }
      if (!objective) {
        const heading = line.match(/^#\s+(.+?)\s*$/);
        if (heading) objective = heading[1];
      }
    }
    return { total, completed, objective, mtime: stat.mtime };
  } catch {
    return null;
  }
}

/**
 * Assemble a superpowers OrchestrationState from transcript-derived signals
 * (latest superpowers skill, todos, running agents) enriched by the optional
 * SDD progress file. Returns null when there is neither a fresh phase nor an
 * in-progress execution file (nothing worth showing).
 */
export function readSuperpowersState(input: SuperpowersStateInput): OrchestrationState | null {
  const { cwd, latestSuperpowersSkill, todos, agentsActive, now, freshnessMs } = input;

  const progress = cwd ? readProgressFile(cwd) : null;
  const skillFresh = !!latestSuperpowersSkill
    && now - latestSuperpowersSkill.at.getTime() < freshnessMs;
  const progressActive = !!progress && progress.total > progress.completed;

  if (!skillFresh && !progressActive) return null;

  const mode = latestSuperpowersSkill?.name ?? (progressActive ? 'sdd' : null);

  let taskCounts: OrchestrationState['taskCounts'];
  if (progress && progress.total > 0) {
    taskCounts = { total: progress.total, completed: progress.completed, inProgress: 0 };
  } else {
    taskCounts = {
      total: todos.length,
      completed: todos.filter((t) => t.status === 'completed').length,
      inProgress: todos.filter((t) => t.status === 'in_progress').length,
    };
  }

  let objective = progress?.objective ?? '';
  if (objective.length > OBJECTIVE_MAX) objective = `${objective.slice(0, OBJECTIVE_MAX - 1)}…`;

  return {
    source: 'superpowers',
    mode,
    active: skillFresh || progressActive,
    objective,
    taskCounts,
    agentsActive,
    updatedAt: progress?.mtime ?? latestSuperpowersSkill?.at ?? null,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run build && node --test tests/superpowers-state.test.js`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/superpowers-state.ts tests/superpowers-state.test.js dist
git commit -m "feat(orchestration): superpowers state reader (phase + progress.md + todos fallback)"
```

---

### Task 3: Unified config flags + legacy migration

**Files:**
- Modify: `src/config.ts` (type, interface, defaults, merge, validator)
- Test: `tests/config.test.js` (append)

**Interfaces:**
- Produces (on `HudConfig.display`):
  - `orchestrationSource: OrchestrationSourceMode` (`'auto' | 'superpowers' | 'omc' | 'off'`)
  - `showOrchestration: boolean`
  - `showOrchestrationDetail: boolean`
  - `orchestrationFreshnessMs: number`
- Removes: `showOmcMode`, `showOmcState` (read-only legacy fallback in `mergeConfig`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/config.test.js` (it already imports `mergeConfig` — verify the import line `import { mergeConfig } from '../dist/config.js';` exists; if not, add it):

```js
test('mergeConfig: orchestration defaults', () => {
  const c = mergeConfig({});
  assert.equal(c.display.orchestrationSource, 'auto');
  assert.equal(c.display.showOrchestration, true);
  assert.equal(c.display.showOrchestrationDetail, false);
  assert.equal(c.display.orchestrationFreshnessMs, 900000);
});

test('mergeConfig: migrates legacy showOmcMode/showOmcState when new keys absent', () => {
  const c = mergeConfig({ display: { showOmcMode: false, showOmcState: true } });
  assert.equal(c.display.showOrchestration, false);
  assert.equal(c.display.showOrchestrationDetail, true);
  assert.equal(c.display.orchestrationSource, 'auto');
});

test('mergeConfig: new keys win over legacy when both present', () => {
  const c = mergeConfig({ display: { showOmcMode: false, showOrchestration: true } });
  assert.equal(c.display.showOrchestration, true);
});

test('mergeConfig: orchestrationSource validates to auto on garbage', () => {
  assert.equal(mergeConfig({ display: { orchestrationSource: 'nope' } }).display.orchestrationSource, 'auto');
  assert.equal(mergeConfig({ display: { orchestrationSource: 'superpowers' } }).display.orchestrationSource, 'superpowers');
});

test('mergeConfig: orchestrationFreshnessMs rejects non-positive', () => {
  assert.equal(mergeConfig({ display: { orchestrationFreshnessMs: 0 } }).display.orchestrationFreshnessMs, 900000);
  assert.equal(mergeConfig({ display: { orchestrationFreshnessMs: 60000 } }).display.orchestrationFreshnessMs, 60000);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run build && node --test tests/config.test.js`
Expected: FAIL — `orchestrationSource` undefined.

- [ ] **Step 3: Add the source-mode type**

In `src/config.ts`, near the other mode unions (after `export type AgentNamespaceMode = ...`):

```ts
export type OrchestrationSourceMode = 'auto' | 'superpowers' | 'omc' | 'off';
```

- [ ] **Step 4: Replace the OMC interface fields**

In `src/config.ts`, in the `display` interface, replace:

```ts
    showOmcMode: boolean;
    showOmcState: boolean;
```

with:

```ts
    orchestrationSource: OrchestrationSourceMode;
    showOrchestration: boolean;
    showOrchestrationDetail: boolean;
    orchestrationFreshnessMs: number;
```

- [ ] **Step 5: Replace the OMC defaults**

In `DEFAULT_CONFIG.display`, replace:

```ts
    showOmcMode: true,
    showOmcState: false,
```

with:

```ts
    orchestrationSource: 'auto',
    showOrchestration: true,
    showOrchestrationDetail: false,
    orchestrationFreshnessMs: 900000,
```

- [ ] **Step 6: Add a validator + replace the merge block**

In `src/config.ts`, add a validator near `validateAutoCompactWindow`:

```ts
function validateOrchestrationSource(value: unknown): OrchestrationSourceMode | null {
  return value === 'auto' || value === 'superpowers' || value === 'omc' || value === 'off'
    ? value
    : null;
}

function validateOrchestrationFreshnessMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    return DEFAULT_CONFIG.display.orchestrationFreshnessMs;
  }
  return value;
}
```

Then in `mergeConfig`, replace the merge block:

```ts
    showOmcMode: typeof migrated.display?.showOmcMode === 'boolean'
      ? migrated.display.showOmcMode
      : DEFAULT_CONFIG.display.showOmcMode,
    showOmcState: typeof migrated.display?.showOmcState === 'boolean'
      ? migrated.display.showOmcState
      : DEFAULT_CONFIG.display.showOmcState,
```

with (new keys win; legacy `showOmcMode`/`showOmcState` are read only as fallback):

```ts
    orchestrationSource: validateOrchestrationSource(migrated.display?.orchestrationSource)
      ?? DEFAULT_CONFIG.display.orchestrationSource,
    showOrchestration: typeof migrated.display?.showOrchestration === 'boolean'
      ? migrated.display.showOrchestration
      : (typeof migrated.display?.showOmcMode === 'boolean'
          ? migrated.display.showOmcMode
          : DEFAULT_CONFIG.display.showOrchestration),
    showOrchestrationDetail: typeof migrated.display?.showOrchestrationDetail === 'boolean'
      ? migrated.display.showOrchestrationDetail
      : (typeof migrated.display?.showOmcState === 'boolean'
          ? migrated.display.showOmcState
          : DEFAULT_CONFIG.display.showOrchestrationDetail),
    orchestrationFreshnessMs: validateOrchestrationFreshnessMs(migrated.display?.orchestrationFreshnessMs),
```

> Note: `migrated.display?.showOmcMode` will type-error because the field no longer exists on the type. Read it via a loosely-typed view: at the top of `mergeConfig` there is already a `migrated` object typed as `Partial<HudConfig>`; cast the legacy reads as `(migrated.display as Record<string, unknown> | undefined)?.showOmcMode`. Apply that cast in both fallback reads above.

- [ ] **Step 7: Run to verify it passes**

Run: `npm run build && node --test tests/config.test.js`
Expected: PASS. (Build also confirms no other file references the removed fields yet — Task 4 fixes those; if the build fails here on `project.ts`/`omc-line.ts`, that is expected and resolved in Task 4. To keep this task green in isolation, proceed to Step 8 only if `tests/config.test.js` passes; the project-line references are migrated in Task 4. If the build blocks the test, do Task 4's Steps 3–6 edits in the same working session before building.)

> Practical note for the implementer: Tasks 3 and 4 are tightly coupled by the field rename. If your workflow requires a green build at every commit, treat Tasks 3+4 as one commit boundary: make all of Task 3 and Task 4's source edits, then build once. The steps remain separated for review clarity.

- [ ] **Step 8: Commit**

```bash
git add src/config.ts tests/config.test.js dist
git commit -m "feat(config): unified orchestration flags + legacy showOmc* migration"
```

---

### Task 4: Switch readers, wiring, and render to unified orchestration

**Files:**
- Modify: `src/omc-state.ts` (return `OrchestrationState`)
- Modify: `src/types.ts` (`RenderContext.omcState` → `orchestration`)
- Modify: `src/index.ts` (source-driven resolution; add `readSuperpowersState` dep)
- Modify: `src/render/lines/project.ts` (inline badge, source-agnostic)
- Create: `src/render/orchestration-line.ts` (detail line; replaces `omc-line.ts`)
- Delete: `src/render/omc-line.ts`
- Modify: `src/render/index.ts` (wire `renderOrchestrationLine`)
- Test: `tests/render.test.js` (append), `tests/transcript-omc.test.js` (adapt if it references `omcState`)

**Interfaces:**
- Consumes: `OrchestrationState` (Task 1), `readSuperpowersState` (Task 2), the config flags (Task 3).
- Produces: `RenderContext.orchestration?: OrchestrationState | null`; `renderOrchestrationLine(ctx): string | null`.

- [ ] **Step 1: Adapt `readOmcState` to return `OrchestrationState`**

In `src/omc-state.ts`: remove the local `OmcState` interface, import the shared type, and change the return type + final return object. At the top:

```ts
import type { OrchestrationState } from './orchestration.js';
```

Change the signature:

```ts
export function readOmcState(cwd: string | undefined): OrchestrationState | null {
```

Replace the final `return { ... }` (the success path) with:

```ts
    return {
      source: 'omc',
      mode,
      active,
      objective: coerceString(mission.objective),
      taskCounts,
      agentsActive: subagents.active,
      updatedAt,
    };
```

(Delete the now-unused `OmcState` interface and any fields it had that aren't in `OrchestrationState`: `status`, `agentsTotal`, `agentsCompleted`. Keep the internal `SubagentCounts`/helpers.)

- [ ] **Step 2: Rename the RenderContext field**

In `src/types.ts`: change the import and the field.

```ts
// replace:  import type { OmcState } from './omc-state.js';
import type { OrchestrationState } from './orchestration.js';
```

```ts
// replace:  omcState?: OmcState | null;
  orchestration?: OrchestrationState | null;
```

- [ ] **Step 3: Source-driven resolution in `index.ts`**

In `src/index.ts`:

(a) Add the import (next to `readOmcState`):
```ts
import { readSuperpowersState } from "./superpowers-state.js";
```

(b) Add it to the deps type (next to `readOmcState: typeof readOmcState;`):
```ts
  readSuperpowersState: typeof readSuperpowersState;
```

(c) Add it to the deps defaults object (next to `readOmcState,`):
```ts
    readSuperpowersState,
```

(d) Replace the resolution line:
```ts
    const omcState = deps.readOmcState(stdin.cwd);
```
with:
```ts
    const orchestration = resolveOrchestration(config, stdin, transcript, deps, deps.now());
```

(e) In the `ctx` object literal, replace `omcState,` with `orchestration,`.

(f) Add this helper near the bottom of `index.ts` (module scope):
```ts
function resolveOrchestration(
  config: HudConfig,
  stdin: StdinData,
  transcript: TranscriptData,
  deps: { readSuperpowersState: typeof readSuperpowersState; readOmcState: typeof readOmcState },
  now: number,
): OrchestrationState | null {
  const src = config.display.orchestrationSource;
  if (src === 'off') return null;
  const sp = (src === 'superpowers' || src === 'auto')
    ? deps.readSuperpowersState({
        cwd: stdin.cwd,
        latestSuperpowersSkill: transcript.latestSuperpowersSkill,
        todos: transcript.todos,
        agentsActive: transcript.agents.filter((a) => a.status === 'running').length,
        now,
        freshnessMs: config.display.orchestrationFreshnessMs,
      })
    : null;
  if (sp) return sp;
  return (src === 'omc' || src === 'auto') ? deps.readOmcState(stdin.cwd) : null;
}
```

(g) Add the imports needed by the helper at the top of `index.ts` (these types are already used elsewhere in the file or trivially importable):
```ts
import type { HudConfig } from "./config.js";
import type { StdinData, TranscriptData, RenderContext } from "./types.js";
import type { OrchestrationState } from "./orchestration.js";
```
(Some may already be imported — do not duplicate; add only the missing ones.)

- [ ] **Step 4: Source-agnostic inline badge in `project.ts`**

In `src/render/lines/project.ts`, replace the OMC inline block:

```ts
  if ((display?.showOmcMode ?? true) && ctx.omcState?.active && ctx.omcState.mode) {
    const { mode, taskCounts } = ctx.omcState;
    const progress = taskCounts.total > 0 ? ` ${taskCounts.completed}/${taskCounts.total}` : '';
    extras.push(dim(`⚙ ${sanitizeDisplayText(mode)}${progress}`));
  }
```

with:

```ts
  if ((display?.showOrchestration ?? true) && ctx.orchestration?.active && ctx.orchestration.mode) {
    const { source, mode, taskCounts } = ctx.orchestration;
    const glyph = source === 'superpowers' ? '✦' : '⚙';
    const progress = taskCounts.total > 0 ? ` ${taskCounts.completed}/${taskCounts.total}` : '';
    extras.push(dim(`${glyph} ${sanitizeDisplayText(mode)}${progress}`));
  }
```

- [ ] **Step 5: Create `orchestration-line.ts`; delete `omc-line.ts`**

Create `src/render/orchestration-line.ts`:

```ts
import type { RenderContext } from '../types.js';
import { cyan, label, dim } from './colors.js';
import { sanitize as sanitizeDisplayText } from './lines/added-dirs.js';

// Opt-in detail line (display.showOrchestrationDetail) surfacing the active
// orchestration source: mode/phase, objective, task progress, live agents.
// ✦ for superpowers, ◆ for OMC. Returns null when disabled or no state.
export function renderOrchestrationLine(ctx: RenderContext): string | null {
  if (!ctx.config?.display?.showOrchestrationDetail) return null;
  const o = ctx.orchestration;
  if (!o) return null;

  const colors = ctx.config?.colors;
  const glyph = o.source === 'superpowers' ? '✦' : '◆';
  const mode = sanitizeDisplayText(o.mode || o.source);

  let line = `${cyan(glyph)} ${cyan(mode)}`;
  if (o.objective) {
    const safe = sanitizeDisplayText(o.objective);
    const obj = safe.length > 50 ? `${safe.slice(0, 49)}…` : safe;
    line += label(`: ${obj}`, colors);
  }
  if (o.taskCounts.total > 0) {
    line += ` ${dim(`(${o.taskCounts.completed}/${o.taskCounts.total})`)}`;
  }
  if (o.agentsActive > 0) {
    line += ` ${dim(`· ${o.agentsActive} agents`)}`;
  }
  return line;
}
```

Delete the old file:
```bash
git rm src/render/omc-line.ts
```

- [ ] **Step 6: Wire the renamed line in `render/index.ts`**

In `src/render/index.ts`:

(a) Replace the import:
```ts
// replace:  import { renderOmcStateLine } from './omc-line.js';
import { renderOrchestrationLine } from './orchestration-line.js';
```

(b) Replace the call block:
```ts
  // Opt-in (default off); renderOmcStateLine self-gates on showOmcState + omcState.
  const omcStateLine = renderOmcStateLine(ctx);
  if (omcStateLine) {
    activityLines.push(omcStateLine);
  }
```
with:
```ts
  // Opt-in (default off); renderOrchestrationLine self-gates on
  // showOrchestrationDetail + orchestration.
  const orchestrationLine = renderOrchestrationLine(ctx);
  if (orchestrationLine) {
    activityLines.push(orchestrationLine);
  }
```

- [ ] **Step 7: Write the render tests**

Append to `tests/render.test.js` (it already imports `renderProjectLine` and has a `baseContext()` helper — reuse it; the helper builds a context with `config = mergeConfig(...)`; set `ctx.orchestration` directly):

```js
test('renderProjectLine shows ✦ superpowers badge with progress', () => {
  const ctx = baseContext();
  ctx.orchestration = {
    source: 'superpowers', mode: 'executing-plans', active: true, objective: '',
    taskCounts: { total: 7, completed: 3, inProgress: 0 }, agentsActive: 0, updatedAt: null,
  };
  const line = stripAnsi(renderProjectLine(ctx) ?? '');
  assert.ok(line.includes('✦ executing-plans 3/7'), `got: ${line}`);
});

test('renderProjectLine shows ⚙ omc badge', () => {
  const ctx = baseContext();
  ctx.orchestration = {
    source: 'omc', mode: 'pdca', active: true, objective: '',
    taskCounts: { total: 0, completed: 0, inProgress: 0 }, agentsActive: 0, updatedAt: null,
  };
  const line = stripAnsi(renderProjectLine(ctx) ?? '');
  assert.ok(line.includes('⚙ pdca'), `got: ${line}`);
});

test('renderProjectLine hides badge when showOrchestration is false', () => {
  const ctx = baseContext();
  ctx.config.display.showOrchestration = false;
  ctx.orchestration = {
    source: 'superpowers', mode: 'executing-plans', active: true, objective: '',
    taskCounts: { total: 7, completed: 3, inProgress: 0 }, agentsActive: 0, updatedAt: null,
  };
  const line = stripAnsi(renderProjectLine(ctx) ?? '');
  assert.ok(!line.includes('executing-plans'), `got: ${line}`);
});
```

> If `baseContext()` does not exist under that exact name, locate the helper render.test.js uses to build a `RenderContext` (search the file for `function ` returning an object with `stdin`/`config`) and reuse it. `stripAnsi` is already defined in render.test.js.

- [ ] **Step 8: Adapt the OMC transcript test if needed**

Run: `grep -n "omcState\|renderOmcStateLine\|showOmcMode\|showOmcState" tests/transcript-omc.test.js`
If there are hits, update them to the new names (`ctx.orchestration`, `renderOrchestrationLine`, `showOrchestration`/`showOrchestrationDetail`). If there are no hits (the file only tests agents/tools), no change is needed.

- [ ] **Step 9: Build and run the full suite**

Run: `npm run build && npm test`
Expected: PASS — all tests including the new render + config + superpowers-state tests; no `omcState`/`omc-line` references remain.

- [ ] **Step 10: Commit**

```bash
git add -A src dist tests
git commit -m "feat(orchestration): unify OMC+superpowers wiring, render, and source resolution"
```

---

### Task 5: Docs + recommended 2-line config

**Files:**
- Modify: `CLAUDE.md` (update the "must survive" orchestration row)
- Modify: `README.md` (option-table rows + superpowers note)
- Modify: `~/.claude/plugins/claude-hud/config.json` (apply recommended config)

**Interfaces:** none (docs + user config).

- [ ] **Step 1: Update CLAUDE.md fork-feature table**

In `CLAUDE.md`, find the OMC row in the "Fork features that must survive" table:

```
| OMC orchestration awareness | `src/omc-state.ts` (`readOmcState`), `src/render/omc-line.ts`, ... | Reads `<cwd>/.omc/state/`; `display.showOmcMode` (default true) → `⚙ <mode> c/t`; `display.showOmcState` (default false) → opt-in `◆` mission line. Reader must never throw (runs every tick). |
```

Replace with:

```
| Orchestration awareness (OMC + superpowers) | `src/orchestration.ts` (`OrchestrationState`), `src/omc-state.ts` (`readOmcState`), `src/superpowers-state.ts` (`readSuperpowersState`), `src/render/orchestration-line.ts`, `src/render/lines/project.ts` (inline badge), `src/types.ts` (`orchestration` on `RenderContext`; `latestSuperpowersSkill` on `TranscriptData`), `src/index.ts` (`resolveOrchestration`) | Unified, source-selectable. `display.orchestrationSource` (`auto`/`superpowers`/`omc`/`off`, default `auto`); `display.showOrchestration` (default true) → inline `✦`(sp)/`⚙`(omc) `<mode> c/t`; `display.showOrchestrationDetail` (default false) → opt-in detail line; `display.orchestrationFreshnessMs` (default 900000) → sp phase liveness. Legacy `showOmcMode`/`showOmcState` still migrate. Readers must never throw (run every tick). |
```

- [ ] **Step 2: Update README option table**

In `README.md`, find the OMC rows (search for `showOmcMode`). Replace them with:

```
| `display.orchestrationSource` | `auto` \| `superpowers` \| `omc` \| `off` | `auto` | Which orchestration ecosystem to surface. `auto` reads superpowers first, then OMC; pin to one, or `off` to disable. |
| `display.showOrchestration` | boolean | true | Inline phase badge on the project line: `✦ <phase> c/t` (superpowers) or `⚙ <mode> c/t` (OMC). |
| `display.showOrchestrationDetail` | boolean | false | Opt-in detail line: `✦/◆ <mode>: <objective> (c/t) · N agents`. |
| `display.orchestrationFreshnessMs` | number | 900000 | Superpowers phase liveness window (ms). The badge clears when the most-recent `superpowers:` skill is older than this. |
```

Add a short prose note near the orchestration docs: superpowers phase is derived from the transcript's latest `superpowers:<skill>`; task progress is enriched by `<cwd>/.superpowers/sdd/progress.md` when present (else from todos). Legacy `showOmcMode`/`showOmcState` keep working via migration.

- [ ] **Step 3: Apply the recommended 2-line config**

Read the user's current config, then merge in the orchestration + component changes. Run:

```bash
cat ~/.claude/plugins/claude-hud/config.json
```

Edit `~/.claude/plugins/claude-hud/config.json` so `elementOrder` is `["project", "context", "usage"]` and `display` includes:

```jsonc
    "showTools": false,
    "showAgents": false,
    "showTodos": false,
    "showPendingPermission": false,
    "orchestrationSource": "superpowers",
    "showOrchestration": true,
    "showOrchestrationDetail": false
```

(Preserve every other existing key — natural style, colors, contextValue, addedDirs, etc.)

- [ ] **Step 4: Runtime smoke test**

```bash
cd /Users/momeppkt/Developer/llm-stuff/claude-hud
NOW=$(node -e "console.log(new Date().toISOString())")
SBX=$(mktemp -d); mkdir -p "$SBX/plugins/claude-hud"
cp ~/.claude/plugins/claude-hud/config.json "$SBX/plugins/claude-hud/config.json"
TR="$SBX/t.jsonl"
printf '%s\n' "{\"type\":\"assistant\",\"timestamp\":\"$NOW\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"id\":\"s1\",\"name\":\"Skill\",\"input\":{\"skill\":\"superpowers:executing-plans\"}}]}}" > "$TR"
echo "{\"model\":{\"display_name\":\"Claude Opus 4.6\"},\"context_window\":{\"current_usage\":{\"input_tokens\":90000},\"context_window_size\":200000},\"transcript_path\":\"$TR\",\"cwd\":\"$(pwd)\"}" | CLAUDE_CONFIG_DIR="$SBX" node dist/index.js | sed -E 's/\x1b\[[0-9;]*m//g; s/\x1b\]8;;[^\x1b]*\x1b\\//g'
rm -rf "$SBX"
```

Expected: line 1 includes `✦ executing-plans` (todos fallback gives no `c/t` since the fixture has no todos/progress file — that is correct); line 2 shows context+usage. Exactly two lines.

- [ ] **Step 5: Commit**

```bash
cd /Users/momeppkt/Developer/llm-stuff/claude-hud
git add CLAUDE.md README.md
git commit -m "docs(orchestration): unified OMC+superpowers awareness; recommended 2-line config"
```

(The user's `~/.claude/plugins/claude-hud/config.json` is outside the repo — it is applied in Step 3 but not committed here.)

---

## Self-Review

**1. Spec coverage:**
- Shared `OrchestrationState` abstraction → Task 1 (`orchestration.ts`). ✓
- Superpowers reader (phase from transcript, progress.md enrich, todos fallback, freshness, objective, null cases) → Task 2. ✓
- `readOmcState` adapted to shared shape → Task 4 Step 1. ✓
- Precedence (`auto`/pinned/`off`) → Task 4 Step 3 (`resolveOrchestration`). ✓
- Unified config + `orchestrationFreshnessMs` validator + legacy migration → Task 3. ✓
- Inline badge (glyph by source, `showOrchestration`) → Task 4 Step 4. ✓
- Opt-in detail line (`showOrchestrationDetail`) → Task 4 Step 5–6. ✓
- `RenderContext.omcState` → `orchestration`; remove `omc-line.ts`; transcript `latestSuperpowersSkill` + cache 10→11 → Tasks 1, 4. ✓
- Testing (superpowers-state, config migration, render) → Tasks 1–4. ✓
- CLAUDE.md + README updates → Task 5. ✓
- Recommended 2-line config applied → Task 5 Step 3. ✓

**2. Placeholder scan:** No TBD/TODO; every code step contains complete code; commands have expected output. ✓

**3. Type consistency:** `OrchestrationState` fields (`source`/`mode`/`active`/`objective`/`taskCounts`/`agentsActive`/`updatedAt`) used identically in `orchestration.ts`, `omc-state.ts`, `superpowers-state.ts`, `orchestration-line.ts`, `project.ts`, and the render tests. `readSuperpowersState` input shape matches the call in `resolveOrchestration`. Config field names (`orchestrationSource`/`showOrchestration`/`showOrchestrationDetail`/`orchestrationFreshnessMs`) consistent across interface, defaults, merge, and consumers. ✓

**Known coupling:** Tasks 3 and 4 share the `showOmcMode/showOmcState` → `showOrchestration*` rename boundary; the build is only green again after Task 4's source edits land. Commit Tasks 3+4 together if a green build per commit is required (noted in Task 3 Step 7).
