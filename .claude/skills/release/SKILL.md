---
name: release
description: "Use when cutting a claude-hud release: bumping the version, writing CHANGELOG notes, tagging, pushing, and creating the GitHub Release. Examples: \"release 0.5.0\", \"cut a patch release\", \"bump the version and tag it\"."
---

# Claude HUD release process

This fork is a **personal fork** with no CI. Every step runs locally — including the version bump, the build, the tag, and the GitHub Release. Follow this order; skipping a step usually means the published bundle drifts from the source.

## Version locations

Three files must move in lockstep — they're the *single source of truth* for the plugin version:

| File | Field |
|---|---|
| `package.json` | `"version": "x.y.z"` |
| `.claude-plugin/plugin.json` | `"version": "x.y.z"` |
| `.claude-plugin/marketplace.json` | `metadata.version` and (if relevant) plugin descriptor |

If the three drift, the marketplace and `npm` see different versions and updates silently break.

## When to bump major/minor/patch

The fork is in the `0.x` series, so semver is loose:

- **Patch (`0.4.0 → 0.4.1`)** — upstream sync that doesn't change any default behavior the user can see, or a fork-only bugfix.
- **Minor (`0.4.x → 0.5.0`)** — upstream sync that flips a default the user will notice (e.g. a new element added to `DEFAULT_ELEMENT_ORDER` that renders by default), or a new fork-visible feature.
- **Major (`0.x → 1.0`)** — not used yet; reserve for breaking config schema changes.

## Step 1 — Update CHANGELOG.md

Add a new `## [x.y.z] - YYYY-MM-DD — MomePP fork (one-line subject)` section above the previous release. Match the depth and structure of the most recent release entry — `0.4.0` and `0.4.1` are the reference templates. Required sections:

- **Opening paragraph** — why this release exists in 2-4 sentences. Name the upstream commit count if it's a sync, and call out the bump rationale (why patch and not minor, or why minor and not patch).
- **`### Added — from upstream`** — every option, element, flag, or i18n key adopted. One bullet per addition with the config path / file location.
- **`### Changed — fork`** — every behavior that diverged from straight upstream. Cite file:line for non-trivial changes.
- **`### Conflict resolutions (kept fork features intact)`** — per-file notes on what was preserved (or hand-merged) during the upstream merge. Important for future readers who wonder why a hunk looks the way it does.
- **`### Skipped (per fork direction)`** — every upstream change rejected and *why*. macOS/Linux-only, optional-bar-chars, `colors.thinking`/`colors.duration` preservation, default-color pinning all live here as recurring entries.
- **`### Default-behavior changes visible on update`** — what existing fork users will see differently after pulling. Omit only if truly zero visible change.
- **`### Tests`** — pass count / fail count / skipped, plus a sentence on which fork-specific suites still cover what.
- **`### Bumped`** — list the three version files.

## Step 2 — Build and test

```bash
npm run build && npm test
```

Both must be clean. `dist/` is tracked, so the build commits along with the source. If `tsc` reports the wrong version in its output banner, you missed a version-bump location.

## Step 3 — Commit the release

Two commits, not one:

1. **Merge commit** — if syncing upstream, the `git merge upstream/main` commit lands first. Message format: `chore: merge upstream/main — sync fork with <one-line subject>`.
2. **Release commit** — version bump + CHANGELOG section + any small follow-ups. Message format: `chore: release x.y.z — <same subject as the merge>`.

Body of the release commit should briefly explain *why* the bump level was chosen (patch vs. minor) and link to anything noteworthy in the CHANGELOG.

## Step 4 — Annotated tag

```bash
git tag -a vx.y.z -m "vx.y.z — one-line subject

Highlights
- ...

Skipped (fork direction)
- ..."
```

Always `-a` (annotated), never lightweight. The annotation body is reused as the GitHub Release body fallback if you forget to set `--notes-file`.

## Step 5 — Push (carefully)

**Never use `--follow-tags`.** It pushes every annotated tag reachable from the commit, including any upstream tags that got pulled in via `git fetch upstream`. Pushing an upstream tag re-triggers any GitHub Actions workflow whose YAML exists at that tag's target commit — even if the fork's current main has no workflows.

Push the branch and the new tag explicitly:

```bash
git push origin main
git push origin vx.y.z
```

## Step 6 — Create the GitHub Release

```bash
gh release create vx.y.z \
  --repo MomePP/claude-hud \
  --title "vx.y.z — <one-line subject>" \
  --notes-file <(awk '/^## \[x\.y\.z\]/,/^## \[<prev>\]/' CHANGELOG.md | sed '1d;$d') \
  --latest
```

Notes:

- `--repo MomePP/claude-hud` is required. Without it, `gh` defaults to `jarrodwatts/claude-hud` (the upstream remote) and fails with "tag not pushed".
- `--latest` marks this release as the latest. For a backfill of an older version, use `--latest=false`.
- The `awk … | sed '1d;$d'` slice strips the H2 heading (gh uses the title separately) and the next release's H2 (stop marker). The Bash tool may complain about process substitution — fall back to `--notes-file /tmp/release-x.y.z.md` after extracting to a temp file.

## Step 7 — Verify

```bash
gh release view vx.y.z --repo MomePP/claude-hud
gh release list --repo MomePP/claude-hud | head
```

Confirm the release is `Latest`, the title matches the tag, and the body renders the CHANGELOG section correctly. If the body is empty, you passed the wrong notes file.

## Avoiding upstream-tag drag

Three guards keep upstream tags out of the fork's release flow:

1. **Remote config**: `git config remote.upstream.tagOpt --no-tags`. With this set, `git fetch upstream` no longer pulls tags. Verify with `git config --get remote.upstream.tagOpt` (expected: `--no-tags`).
2. **Push hygiene**: explicit `git push origin vx.y.z` per release; no `--follow-tags`.
3. **Local sweep**: after any upstream sync, run `git tag --list 'v0.0.*' 'v0.1.*'` (the upstream version space — fork's first own-release tag was `v0.2.0`). Delete anything that comes back with `git tag -d <tag>`.

If an upstream tag reaches origin by accident, the GitHub Actions "Release" workflow may run because the tag's target commit still has `release.yml` in its tree. Remediation:

```bash
git push origin --delete <tag>     # remove from origin
git tag -d <tag>                   # remove locally
```

Completed workflow runs cannot be cancelled retroactively; only future runs are prevented.

## Quick checklist

- [ ] Three version files bumped to the same value
- [ ] CHANGELOG section added with the eight required subsections
- [ ] `npm run build && npm test` both pass (clean tree, no test failures)
- [ ] Two commits: merge (if applicable) + release
- [ ] Annotated tag `vx.y.z` created
- [ ] `git push origin main` and `git push origin vx.y.z` — explicit, no `--follow-tags`
- [ ] `gh release create vx.y.z --repo MomePP/claude-hud --notes-file ... --latest`
- [ ] `gh release view vx.y.z --repo MomePP/claude-hud` shows the full body and `Latest` badge
