import type { RenderContext } from '../types.js';
import { cyan, label, dim } from './colors.js';
import { sanitize as sanitizeDisplayText } from './lines/added-dirs.js';

// Opt-in line (display.showOmcState) surfacing oh-my-claudecode orchestration
// state: the active/last mission's mode, objective, task progress, and live
// subagent count. Reads from ctx.omcState (see src/omc-state.ts). Returns null
// when disabled or when there is no .omc mission to show.
export function renderOmcStateLine(ctx: RenderContext): string | null {
  if (!ctx.config?.display?.showOmcState) return null;
  const omc = ctx.omcState;
  if (!omc) return null;

  const colors = ctx.config?.colors;
  // mode + objective come from a .omc JSON file written by another process;
  // sanitize like every other external-derived string on the HUD line.
  const mode = sanitizeDisplayText(omc.mode || 'omc');

  let line = `${cyan('◆')} ${cyan(mode)}`;

  if (omc.objective) {
    const safeObjective = sanitizeDisplayText(omc.objective);
    const obj = safeObjective.length > 50 ? `${safeObjective.slice(0, 49)}…` : safeObjective;
    line += label(`: ${obj}`, colors);
  }
  if (omc.taskCounts.total > 0) {
    line += ` ${dim(`(${omc.taskCounts.completed}/${omc.taskCounts.total})`)}`;
  }
  if (omc.agentsActive > 0) {
    line += ` ${dim(`· ${omc.agentsActive} agents`)}`;
  }

  return line;
}
