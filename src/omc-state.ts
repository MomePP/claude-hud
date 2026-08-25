import * as fs from 'node:fs';
import * as path from 'node:path';
import type { OrchestrationState } from './orchestration.js';

/**
 * Reads oh-my-claudecode (OMC) orchestration state from
 * `<cwd>/.omc/state/mission-state.json` (+ `subagent-tracking.json`) and
 * normalizes it into the shared `OrchestrationState` shape.
 *
 * The reader is fully defensive: any missing field, parse failure, or absent
 * `.omc` directory yields `null` (or zeroed counts) rather than throwing. The
 * statusline runs every ~300ms in a fresh process, so this stays a cheap,
 * direct guarded read.
 */

const ACTIVE_STATUSES = new Set(['active', 'running', 'in_progress', 'in-progress']);

function coerceNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function coerceString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

interface SubagentCounts {
  total: number;
  completed: number;
  active: number;
  parentMode: string | null;
}

function readSubagentCounts(stateDir: string): SubagentCounts {
  const empty: SubagentCounts = { total: 0, completed: 0, active: 0, parentMode: null };
  try {
    const file = path.join(stateDir, 'subagent-tracking.json');
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const total = coerceNumber(parsed.total_spawned);
    const completed = coerceNumber(parsed.total_completed);
    const failed = coerceNumber(parsed.total_failed);
    const active = Math.max(0, total - completed - failed);

    let parentMode: string | null = null;
    if (Array.isArray(parsed.agents)) {
      for (const agent of parsed.agents) {
        const pm = coerceString((agent as Record<string, unknown>)?.parent_mode);
        if (pm && pm !== 'none') {
          parentMode = pm;
          break;
        }
      }
    }

    return { total, completed, active, parentMode };
  } catch {
    return empty;
  }
}

/**
 * Read and normalize OMC mission state for the given working directory.
 * Returns `null` when `cwd` is missing, the mission-state file is absent, or
 * anything fails to parse.
 */
export function readOmcState(cwd: string | undefined): OrchestrationState | null {
  if (!cwd) return null;

  try {
    const stateDir = path.join(cwd, '.omc', 'state');
    const missionFile = path.join(stateDir, 'mission-state.json');
    if (!fs.existsSync(missionFile)) return null;

    const raw = fs.readFileSync(missionFile, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const missions = Array.isArray(parsed.missions) ? parsed.missions : [];
    if (missions.length === 0) return null;

    // Most relevant mission = the most recent (last) entry.
    const mission = missions[missions.length - 1] as Record<string, unknown>;
    if (!mission || typeof mission !== 'object') return null;

    const subagents = readSubagentCounts(stateDir);

    const source = coerceString(mission.source);
    const name = coerceString(mission.name);
    let mode: string | null = null;
    if (source && source !== 'session') {
      mode = source;
    } else if (name && name !== 'none') {
      mode = name;
    }
    if (mode === null && subagents.parentMode) {
      mode = subagents.parentMode;
    }

    const status = coerceString(mission.status);
    const rawTaskCounts = (mission.taskCounts && typeof mission.taskCounts === 'object'
      ? mission.taskCounts
      : {}) as Record<string, unknown>;
    const taskCounts = {
      total: coerceNumber(rawTaskCounts.total),
      completed: coerceNumber(rawTaskCounts.completed),
      inProgress: coerceNumber(rawTaskCounts.inProgress),
    };

    const active = ACTIVE_STATUSES.has(status) || taskCounts.inProgress > 0;

    const updatedAtRaw = coerceString(parsed.updatedAt);
    let updatedAt: Date | null = null;
    if (updatedAtRaw) {
      const d = new Date(updatedAtRaw);
      if (!Number.isNaN(d.getTime())) {
        updatedAt = d;
      }
    }

    return {
      source: 'omc',
      mode,
      active,
      objective: coerceString(mission.objective),
      taskCounts,
      agentsActive: subagents.active,
      updatedAt,
    };
  } catch {
    return null;
  }
}
