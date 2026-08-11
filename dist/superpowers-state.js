import * as fs from 'node:fs';
import * as path from 'node:path';
const OBJECTIVE_MAX = 60;
// Parse `<cwd>/.superpowers/sdd/progress.md` checkboxes + first H1 heading.
// Returns null on any absence/parse failure (guarded — runs every ~300ms).
function readProgressFile(cwd) {
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
                if (box[1].toLowerCase() === 'x')
                    completed += 1;
            }
            if (!objective) {
                const heading = line.match(/^#\s+(.+?)\s*$/);
                if (heading)
                    objective = heading[1];
            }
        }
        return { total, completed, objective, mtime: stat.mtime };
    }
    catch {
        return null;
    }
}
/**
 * Assemble a superpowers OrchestrationState from transcript-derived signals
 * (latest superpowers skill, todos, running agents) enriched by the optional
 * SDD progress file. Returns null when there is neither a fresh phase nor an
 * in-progress execution file (nothing worth showing).
 */
export function readSuperpowersState(input) {
    const { cwd, latestSuperpowersSkill, todos, agentsActive, now, freshnessMs } = input;
    const progress = cwd ? readProgressFile(cwd) : null;
    const skillFresh = !!latestSuperpowersSkill
        && now - latestSuperpowersSkill.at.getTime() < freshnessMs;
    const progressActive = !!progress && progress.total > progress.completed;
    if (!skillFresh && !progressActive)
        return null;
    const mode = latestSuperpowersSkill?.name ?? (progressActive ? 'sdd' : null);
    let taskCounts;
    if (progress && progress.total > 0) {
        taskCounts = { total: progress.total, completed: progress.completed, inProgress: 0 };
    }
    else {
        taskCounts = {
            total: todos.length,
            completed: todos.filter((t) => t.status === 'completed').length,
            inProgress: todos.filter((t) => t.status === 'in_progress').length,
        };
    }
    let objective = progress?.objective ?? '';
    if (objective.length > OBJECTIVE_MAX)
        objective = `${objective.slice(0, OBJECTIVE_MAX - 1)}…`;
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
//# sourceMappingURL=superpowers-state.js.map