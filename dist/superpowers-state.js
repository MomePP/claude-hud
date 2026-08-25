import * as fs from 'node:fs';
import * as path from 'node:path';
const OBJECTIVE_MAX = 60;
const MAX_WALK_UP = 12;
// `# SDD ledger — plan: <plan file path>` (superpowers ≥6.2 identity line).
const LEDGER_PLAN = /^#\s*SDD ledger\s*[—–-]\s*plan:\s*(.+?)\s*$/i;
// Appended bookkeeping lines: `Task <N>: complete (…)`, `Task <N>: fix round 2/5 (…)`,
// `Task <N>: parked — …`, `Task <N>: Ruling: …`. Only `complete` counts as done.
const LEDGER_TASK = /^\s*Task\s+(\d+)\s*:\s*(.*)$/i;
const CHECKBOX = /^\s*[-*]\s+\[([ xX])\]/;
const HEADING = /^#\s+(.+?)\s*$/;
/**
 * superpowers ≥6.2 scopes each plan's SDD workspace to
 * `<repo-root>/.superpowers/sdd/<plan-basename>/`. hud's cwd may be a subdir of
 * the repo, so walk up (stopping at the repo root) instead of shelling out to
 * `git rev-parse` on every tick.
 */
function findSddBase(cwd) {
    let dir = path.resolve(cwd);
    for (let i = 0; i < MAX_WALK_UP; i += 1) {
        const base = path.join(dir, '.superpowers', 'sdd');
        try {
            if (fs.statSync(base).isDirectory())
                return base;
        }
        catch {
            // keep walking
        }
        try {
            fs.statSync(path.join(dir, '.git'));
            return null; // repo root reached without a workspace
        }
        catch {
            // not the repo root
        }
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return null;
}
// Newest ledger wins when several plan workspaces coexist. The flat pre-6.2
// `.superpowers/sdd/progress.md` is deliberately skipped: superpowers leaves
// stale ledgers in place as another plan's progress, so reading one reports
// frozen counts forever.
function findLedgerFile(base) {
    let best = null;
    let entries;
    try {
        entries = fs.readdirSync(base, { withFileTypes: true });
    }
    catch {
        return null;
    }
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const file = path.join(base, entry.name, 'progress.md');
        try {
            const stat = fs.statSync(file);
            if (!best || stat.mtime > best.mtime)
                best = { file, slug: entry.name, mtime: stat.mtime };
        }
        catch {
            // plan dir without a ledger yet
        }
    }
    return best;
}
function parseLedger(raw, slug, mtime) {
    const seen = new Set();
    const done = new Set();
    let boxTotal = 0;
    let boxDone = 0;
    let objective = '';
    for (const line of raw.split('\n')) {
        const plan = line.match(LEDGER_PLAN);
        if (plan) {
            if (!objective)
                objective = path.basename(plan[1], '.md');
            continue;
        }
        const task = line.match(LEDGER_TASK);
        if (task) {
            seen.add(task[1]);
            if (/^complete\b/i.test(task[2]))
                done.add(task[1]);
            continue;
        }
        const box = line.match(CHECKBOX);
        if (box) {
            boxTotal += 1;
            if (box[1].toLowerCase() === 'x')
                boxDone += 1;
            continue;
        }
        if (!objective) {
            const heading = line.match(HEADING);
            if (heading)
                objective = heading[1];
        }
    }
    if (!objective)
        objective = slug;
    // Task lines win: a prose ledger may also carry checkbox lines (deferred
    // minors pasted as `- [ ] …`), and those are findings, not tasks.
    if (seen.size === 0 && boxTotal > 0) {
        return { total: boxTotal, completed: boxDone, inProgress: 0, objective, mtime };
    }
    return { total: null, completed: done.size, inProgress: seen.size - done.size, objective, mtime };
}
// Returns null on any absence/parse failure (guarded — runs every ~300ms).
function readLedger(cwd) {
    try {
        const base = findSddBase(cwd);
        if (!base)
            return null;
        const found = findLedgerFile(base);
        if (!found)
            return null;
        return parseLedger(fs.readFileSync(found.file, 'utf-8'), found.slug, found.mtime);
    }
    catch {
        return null;
    }
}
/**
 * Assemble a superpowers OrchestrationState from transcript-derived signals
 * (latest superpowers skill, todos, running agents) enriched by the optional
 * SDD progress ledger. Returns null when there is neither a fresh phase nor an
 * in-progress plan workspace (nothing worth showing).
 */
export function readSuperpowersState(input) {
    const { cwd, latestSuperpowersSkill, todos, agentsActive, now, freshnessMs } = input;
    const ledger = cwd ? readLedger(cwd) : null;
    const skillFresh = !!latestSuperpowersSkill
        && now - latestSuperpowersSkill.at.getTime() < freshnessMs;
    let taskCounts;
    if (ledger && ledger.total !== null) {
        taskCounts = { total: ledger.total, completed: ledger.completed, inProgress: ledger.inProgress };
    }
    else if (ledger) {
        // The prose ledger names no total; todos carry it (SDD creates one per task).
        taskCounts = {
            total: Math.max(todos.length, ledger.completed + ledger.inProgress),
            completed: ledger.completed,
            inProgress: ledger.inProgress,
        };
    }
    else {
        taskCounts = {
            total: todos.length,
            completed: todos.filter((t) => t.status === 'completed').length,
            inProgress: todos.filter((t) => t.status === 'in_progress').length,
        };
    }
    // superpowers deletes the plan workspace once the final review is clean, so a
    // ledger that still exists means a plan is in flight.
    const progressActive = !!ledger
        && (taskCounts.total === 0 || taskCounts.completed < taskCounts.total);
    if (!skillFresh && !progressActive)
        return null;
    const mode = latestSuperpowersSkill?.name ?? (progressActive ? 'sdd' : null);
    let objective = ledger?.objective ?? '';
    if (objective.length > OBJECTIVE_MAX)
        objective = `${objective.slice(0, OBJECTIVE_MAX - 1)}…`;
    return {
        source: 'superpowers',
        mode,
        active: skillFresh || progressActive,
        objective,
        taskCounts,
        agentsActive,
        updatedAt: ledger?.mtime ?? latestSuperpowersSkill?.at ?? null,
    };
}
//# sourceMappingURL=superpowers-state.js.map