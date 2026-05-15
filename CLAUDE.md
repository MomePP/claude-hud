# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

Claude HUD is a Claude Code plugin that displays a real-time multi-line statusline. It shows context health, tool activity, agent status, and todo progress.

## Build Commands

```bash
npm ci               # Install dependencies
npm run build        # Build TypeScript to dist/

# Test with sample stdin data
echo '{"model":{"display_name":"Opus"},"context_window":{"current_usage":{"input_tokens":45000},"context_window_size":200000}}' | node dist/index.js
```

## Architecture

### Data Flow

```
Claude Code → stdin JSON → parse → render lines → stdout → Claude Code displays
           ↘ transcript_path → parse JSONL → tools/agents/todos
```

**Key insight**: The statusline is invoked every ~300ms by Claude Code. Each invocation:
1. Receives JSON via stdin (model, context, tokens - native accurate data)
2. Parses the transcript JSONL file for tools, agents, and todos
3. Renders multi-line output to stdout
4. Claude Code displays all lines

### Data Sources

**Native from stdin JSON** (accurate, no estimation):
- `model.display_name` - Current model
- `context_window.current_usage` - Token counts
- `context_window.context_window_size` - Max context
- `transcript_path` - Path to session transcript

**From transcript JSONL parsing**:
- `tool_use` blocks → tool name, input, start time
- `tool_result` blocks → completion, duration
- Running tools = `tool_use` without matching `tool_result`
- `TodoWrite` calls → todo list
- `Task` calls → agent info

**From config files**:
- MCP count from `~/.claude/settings.json` (mcpServers)
- Hooks count from `~/.claude/settings.json` (hooks)
- Rules count from CLAUDE.md files

**From Claude Code stdin rate limits**:
- `rate_limits.five_hour.used_percentage` - 5-hour subscriber usage percentage
- `rate_limits.five_hour.resets_at` - 5-hour reset timestamp
- `rate_limits.seven_day.used_percentage` - 7-day subscriber usage percentage
- `rate_limits.seven_day.resets_at` - 7-day reset timestamp

### File Structure

```
src/
├── index.ts           # Entry point
├── stdin.ts           # Parse Claude's JSON input
├── transcript.ts      # Parse transcript JSONL
├── config-reader.ts   # Read MCP/rules configs
├── config.ts          # Load/validate user config
├── git.ts             # Git status (branch, dirty, ahead/behind)
├── types.ts           # TypeScript interfaces
└── render/
    ├── index.ts       # Main render coordinator
    ├── session-line.ts   # Compact mode: single line with all info
    ├── tools-line.ts     # Tool activity (opt-in)
    ├── agents-line.ts    # Agent status (opt-in)
    ├── todos-line.ts     # Todo progress (opt-in)
    ├── colors.ts         # ANSI color helpers
    └── lines/
        ├── index.ts      # Barrel export
        ├── project.ts    # Line 1: model bracket + project + git
        ├── identity.ts   # Line 2a: context bar
        ├── usage.ts      # Line 2b: usage bar (combined with identity)
        └── environment.ts # Config counts (opt-in)
```

### Output Format (default expanded layout)

```
[Opus] │ my-project git:(main*)
Context █████░░░░░ 45% │ Usage ██░░░░░░░░ 25% (1h 30m / 5h)
```

Lines 1-2 always shown. Additional lines are opt-in via config:
- Tools line (`showTools`): ◐ Edit: auth.ts | ✓ Read ×3
- Agents line (`showAgents`): ◐ explore [haiku]: Finding auth code
- Todos line (`showTodos`): ▸ Fix authentication bug (2/5)
- Environment line (`showConfigCounts`): 2 CLAUDE.md | 4 rules

Inline indicators on the project line (fork additions):
- Thinking (`showThinkingIndicator`, default true): `∿ thinking` while extended-thinking blocks land within a 30s window.
- Pending permission (`showPendingPermission`, default true): `? <target> (waiting Ns)` when an Edit/Write/Bash `tool_use` has no matching `tool_result` yet. Counter ticks until the result lands. Capped at a 5-minute wall-clock window (`PENDING_PERMISSION_MAX_AGE_MS`) with a 30s interrupt-grace check (`PENDING_PERMISSION_INTERRUPT_GRACE_MS`) — both in `src/transcript.ts`.
- Last-request tokens (`showLastRequestTokens`, default false): `last: 12k→678` from the most recent assistant usage, plus `(+Xk)` when reasoning tokens are present.

### Context Thresholds

Defaults — both configurable via `display.contextWarningThreshold` and `display.contextCriticalThreshold` (0-100):

| Threshold | Color | Action |
|-----------|-------|--------|
| <70% (warning) | Green | Normal |
| 70-85% | Yellow | Warning |
| ≥85% (critical) | Red | Show token breakdown when `display.showTokenBreakdown` is true |

## Plugin Configuration

The plugin manifest is in `.claude-plugin/plugin.json` (metadata only - name, description, version, author).

**StatusLine configuration** must be added to the user's `~/.claude/settings.json` via `/claude-hud:setup`.

The setup command adds an auto-updating command that finds the latest installed version at runtime.

Note: `statusLine` is NOT a valid plugin.json field. It must be configured in settings.json after plugin installation. Updates are automatic - no need to re-run setup.

## Dependencies

- **Runtime**: Node.js 18+ or Bun
- **Build**: TypeScript 5, ES2022 target, NodeNext modules

## Merging from Upstream

This is a personal fork of `jarrodwatts/claude-hud`. Upstream syncs land regularly — follow this process and the merge stays predictable.

### Fork direction (non-negotiable)

These constraints decide every conflict resolution. If an upstream change violates one of them, **reject the upstream side**:

- **macOS / Linux only.** Drop all Windows / PowerShell / OSTYPE=msys hunks. `commands/setup.md` is fork-only (launcher-based via `scripts/claude-hud.sh`); `--ours` it wholesale on conflict.
- **No CI workflows.** `.github/workflows/` does not exist on `main`. Never add files there from upstream.
- **Default colors stay pinned**: `model: green`, `project: cyan`, `gitBranch: brightMagenta`. Upstream periodically re-themes; refuse.
- **`colors.barFilled?` / `colors.barEmpty?` stay optional.** Upstream wants required strings; that breaks `display.barStyle`. Keep `string | undefined` shape with no default (commit `4287e07`).
- **`colors.thinking` and `colors.duration` stay** as independent overrides. Upstream periodically tries to consolidate them into `colors.label`; refuse.
- **Hybrid background-agent tracking stays whole.** See "Background-agent invariant" below.

### Fork features that must survive every merge

If `git status` shows any of these as modified by upstream's hunks, the merge is preserving fork features incorrectly — re-check:

| Feature | Where it lives | Notes |
|---|---|---|
| Thinking-state indicator | `src/transcript.ts` (`thinkingState`), `src/types.ts` (`ThinkingState`) | Renders `∿ thinking` |
| Pending-permission indicator | `src/transcript.ts` (`pendingPermissionMap`, `PERMISSION_TOOLS`), `src/types.ts` (`PendingPermission`) | Renders `? <target> (waiting Ns)` |
| Last-request token counter | `src/types.ts` (`LastRequestTokenUsage`) | Renders `last: 12k→678` |
| 4MB tail-read path | `src/transcript.ts` (`MAX_TAIL_BYTES`, `readTailLines`, `handleLine` wrapper) | Perf for long OAC orchestrator sessions |
| OMC `proxy_*` stripping | `src/render/tools-line.ts` etc. | OMC compat |
| `display.agentNamespaceMode` | `src/config.ts`, `src/render/format-namespace.ts` | `strip` / `badge` / `raw` |
| `display.projectStyle: 'natural'` | `src/render/lines/project.ts` (`renderNaturalProjectLine`) | Starship-style prose layout |
| Hybrid background-agent tracking | `src/transcript.ts:442` (queue-op watcher), `src/transcript.ts:760` (tool_result handler) | See below |

### Background-agent invariant

The fork uses three independent completion signals — *all three must keep working*:

1. **`<task-notification status="completed">` parsing** — required by OAC's `oac:parallel-execution` flow. Foreground agents and OAC orchestrator depend on this.
2. **`queue-operation` enqueue events** — upstream's accurate-finish-time signal for vanilla background agents.
3. **`tool_result` timestamp** — fallback for foreground agents.

Detection sets `agent.background = (input.run_in_background === true)`. The legacy `"Async agent launched"` tool_result prefix is kept ONLY as a fallback for old transcripts where the input field is missing.

Whichever completion signal arrives first wins (`status === 'running'` guard). If upstream changes either path, keep both intact.

### The merge procedure

1. **Stash dirty working tree** — only commit the merge resolution, not in-progress work.
2. **Create a sync branch**: `git checkout -b sync/upstream-YYYY-MM`.
3. **Merge with `--no-commit --no-ff`**: `git merge upstream/main --no-commit --no-ff`. The `--no-ff` makes the merge commit explicit even when fast-forward would work.
4. **Resolve conflicts in this order** — easy first, hard last:
   1. `commands/setup.md` → `git checkout --ours` (fork's macOS-only launcher).
   2. `README.md` / `CHANGELOG.md` → keep fork branding; add new upstream option rows; document any rejected upstream changes.
   3. `src/config.ts` → take fork side for `colors.thinking` / `colors.duration` / optional bar chars / default colors; take upstream side for new modes/flags (e.g. `UsageValueMode`, `showSessionStartDate`).
   4. `src/transcript.ts` → the hardest. Verify all three completion signals still wired; restore `compact_boundary` tracking, `handleLine` wrapper, fork's extended `processEntry` signature; **add** upstream's new watchers (e.g. `queue-operation`) rather than replacing fork paths.
   5. `dist/*` → `git checkout --theirs` then `npm run build` (regen authoritative output; never hand-merge generated maps).
5. **Verify auto-merged files** preserve fork features. `git diff` each one mentally against the "must survive" table.
6. **Run `npm run build && npm test`**. Both must be clean. If upstream tests assert behavior the fork explicitly rejects (e.g. queue-op-only background completion), either:
   - Adapt the fork's code to satisfy the test (when the test is exercising a real correctness invariant), or
   - Delete the test with a comment explaining the divergence (when it's codifying upstream's chosen implementation strategy that contradicts fork direction).
7. **Commit the merge** with body listing what was Added / Changed / Skipped. Then run the release skill for the version bump.

### Upstream-tag hygiene

Three guards keep upstream tags out of the fork's release flow — verify all three after any clone or after `git fetch` behavior changes:

1. **`git config --get remote.upstream.tagOpt`** must return `--no-tags`. If it doesn't: `git config remote.upstream.tagOpt --no-tags`. Without this, `git fetch upstream` re-pulls every upstream tag.
2. **Never push with `--follow-tags`.** Push the branch and the new fork tag explicitly:
   ```bash
   git push origin main
   git push origin v0.x.y
   ```
   `--follow-tags` ships every annotated tag reachable from the commits being pushed — including upstream tags that came along on a previous `git fetch upstream`. Pushing an upstream tag re-triggers GitHub Actions on the tag's *target commit*, which still has `release.yml` in its tree even though `main` does not.
3. **Sweep after every merge**: `git tag --list 'v0.0.*' 'v0.1.*'` should return empty. The fork's first own-release tag was `v0.2.0`; anything below that is upstream contamination. Delete with `git tag -d <tag>`.

### See also

- `.claude/skills/release/SKILL.md` — release process (version bump → CHANGELOG section → tag → push → `gh release create`).
- `tests/transcript-omc.test.js` — fork-specific parser tests. If these break, the merge ate a fork feature.
- The "Why this fork exists" table in `README.md` — single source of truth for upstream/fork behavior differences; update it whenever a new divergence lands.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **claude-hud** (1970 symbols, 2849 relationships, 89 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/claude-hud/context` | Codebase overview, check index freshness |
| `gitnexus://repo/claude-hud/clusters` | All functional areas |
| `gitnexus://repo/claude-hud/processes` | All execution flows |
| `gitnexus://repo/claude-hud/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
