import { cyan, label, dim } from './colors.js';
import { sanitize as sanitizeDisplayText } from './lines/added-dirs.js';
// Opt-in detail line (display.showOrchestrationDetail) surfacing the active
// orchestration source: mode/phase, objective, task progress, live agents.
// ✦ for superpowers, ◆ for OMC. Returns null when disabled or no state.
export function renderOrchestrationLine(ctx) {
    if (!ctx.config?.display?.showOrchestrationDetail)
        return null;
    const o = ctx.orchestration;
    if (!o)
        return null;
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
//# sourceMappingURL=orchestration-line.js.map