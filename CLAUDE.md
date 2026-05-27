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

This is a personal fork of `jarrodwatts/claude-hud`. Upstream syncs land regularly — the fork is **rebased/reconstructed onto the current upstream base** (not merged), so `main` stays linear and upstream-rooted instead of carrying both lineages. Follow this process and the sync stays predictable.

### Fork direction (non-negotiable)

These constraints decide every conflict resolution. If an upstream change violates one of them, **reject the upstream side**:

- **macOS / Linux only.** Drop all Windows / PowerShell / OSTYPE=msys hunks. `commands/setup.md` is fork-only (launcher-based via `scripts/claude-hud.sh`); `--ours` it wholesale on conflict.
- **No CI workflows.** `.github/workflows/` does not exist on `main`. Never add files there from upstream.
- **Default colors stay pinned**: `model: green`, `project: cyan`, `gitBranch: brightMagenta`. Upstream periodically re-themes; refuse.
- **`colors.barFilled?` / `colors.barEmpty?` stay optional.** Upstream wants required strings; that breaks `display.barStyle`. Keep `string | undefined` shape with no default (commit `4287e07`).
- **`colors.thinking` and `colors.duration` stay** as independent overrides. Upstream periodically tries to consolidate them into `colors.label`; refuse.
- **Hybrid background-agent tracking stays whole.** See "Background-agent invariant" below.

### Fork features that must survive every sync

If `git diff` against the pre-rebase backup shows any of these as modified, the sync is preserving fork features incorrectly — re-check:

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

### The sync procedure (rebase-reconstruct)

The fork is **rebased/reconstructed onto the current upstream base** — upstream is the root, fork patches sit cleanly on top, history stays linear. Do **not** land a `git merge` commit on `main`: a merge fuses both lineages and forces the repo to carry upstream's history interleaved with the fork's. A plain `git rebase upstream/main` is also wrong here — the fork lead contains its own merge commits + release/`dist`/chore noise, so a literal rebase replays ~19 commits over throwaway history. Instead, **use a merge only to compute the correct combined tree, then flatten that verified tree onto `upstream/main` as one linear commit.** (This is the same method as the v0.2.0 `fec5cbe`/`108de54` re-baseline and the 2026-05 sync `d9206cb` onto upstream `be9902a`.)

1. **Pre-flight.** Clean working tree (stash in-progress work). `git fetch upstream`. Delete any contaminated `v0.1.*` tags (see hygiene below). **Create a backup branch**: `git branch backup/pre-rebase-YYYY-MM-DD main` — this is the rollback point and preserves the pre-rebase line (force-push will rewrite `main`).
2. **Compute the tree (mechanism only, throwaway branch).** `git checkout -B work/merge-compute main`, then `git merge upstream/main --no-commit --no-ff`. Git auto-merges the non-overlapping majority and surfaces only the real overlaps — that's the point. This merge commit is *never* shipped; it only gives a correct 3-way tree.
3. **Resolve conflicts** — easy first, hard last:
   1. `commands/setup.md` → `git checkout --ours` (fork's macOS-only launcher).
   2. `README.md` / `CHANGELOG.md` → keep fork branding; add new upstream option rows; document rejected upstream changes.
   3. `src/config.ts` → fork side for `colors.thinking` / `colors.duration` / optional bar chars / default color pins; upstream side for new modes/flags (e.g. `UsageValueMode`, language validators).
   4. `src/transcript.ts` → the hardest, because the fork restructured the parse loop into a `handleLine` closure. Don't reconcile interleaved markers by hand: **`git checkout --ours src/transcript.ts`, then graft upstream's new logic in surgically** (adapt to the closure, don't copy-paste the upstream diff). Verify all three background-completion signals stay wired and `compact_boundary` tracking survives. Bump `TRANSCRIPT_CACHE_VERSION` whenever parse semantics change.
   5. `dist/*` → don't hand-merge. After all source is resolved, `rm -rf dist && npm run build` (a clean rebuild prunes stale orphans, e.g. a renamed `src/i18n/zh.ts`→`zh-Hans.ts` leaves dead `dist/i18n/zh.*`), then `git add -A dist`.
4. **Reject fork-direction violations.** Confirm `.github/workflows/*` and `.github/dependabot.yml` are absent from the index; reconcile `package-lock.json` with `npm install` (a merge can leave the lockfile's `version` stale vs `package.json`).
5. **Verify (gates).** All must pass before flattening:
   - `npm run build` clean; committed `dist/` reproduces from a fresh build with no diff.
   - `npm test` clean. Upstream's new tests come along — if one codifies behavior the fork rejects, adapt the fork's code to satisfy a real correctness invariant, or delete the test with a comment explaining the divergence.
   - `git diff backup/pre-rebase-YYYY-MM-DD --stat -- src/` shows **only** the intended upstream-driven files; every fork-feature file from the "must survive" table is byte-identical (`git diff --quiet <backup> -- <file>`).
   - Runtime smoke test (`echo '{…}' | node dist/index.js`) + a review pass on any hand-authored resolution (don't self-approve in the same context — use `code-reviewer`/`verifier`).
6. **Flatten onto the upstream base.** Capture the verified tree and re-parent it on `upstream/main` as a single linear commit — byte-identical tree, one parent, no merge:
   ```bash
   git commit -F msg.txt                         # commit the throwaway merge to capture the tree
   TREE=$(git rev-parse HEAD^{tree})
   NEW=$(git commit-tree $TREE -p upstream/main -F msg.txt)
   git checkout main && git reset --hard $NEW     # main = upstream + one fork commit
   git branch -D work/merge-compute
   ```
   Verify `git rev-list --parents -n1 HEAD` shows exactly two SHAs (commit + the upstream parent) — a single-parent linear commit, not a merge.
7. **Release + push.** Run the release skill for the version bump / CHANGELOG / tag, then force-push (see hygiene — re-baselining `main` requires it).

### Upstream-tag hygiene

Three guards keep upstream tags out of the fork's release flow — verify all three after any clone or after `git fetch` behavior changes:

1. **`git config --get remote.upstream.tagOpt`** must return `--no-tags`. If it doesn't: `git config remote.upstream.tagOpt --no-tags`. Without this, `git fetch upstream` re-pulls every upstream tag.
2. **Force-push `main` with `--force-with-lease`, never `--follow-tags`.** Re-baselining rewrites `main`'s history, so the push *is* a force-push — use `--force-with-lease` so an unexpected remote update aborts the push instead of clobbering it. Push the new fork tag explicitly:
   ```bash
   git push --force-with-lease origin main
   git push origin v0.x.y
   ```
   Never `--follow-tags`: it ships every annotated tag reachable from the pushed commits — including upstream tags that came along on a previous `git fetch upstream`. Pushing an upstream tag re-triggers GitHub Actions on the tag's *target commit*, which still has `release.yml` in its tree even though `main` does not.
3. **Sweep after every merge**: `git tag --list 'v0.0.*' 'v0.1.*'` should return empty. The fork's first own-release tag was `v0.2.0`; anything below that is upstream contamination. Delete with `git tag -d <tag>`.

### See also

- `.claude/skills/release/SKILL.md` — release process (version bump → CHANGELOG section → tag → push → `gh release create`).
- `tests/transcript-omc.test.js` — fork-specific parser tests. If these break, the merge ate a fork feature.
- The "Why this fork exists" table in `README.md` — single source of truth for upstream/fork behavior differences; update it whenever a new divergence lands.
