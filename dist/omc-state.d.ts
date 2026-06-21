/**
 * Normalized snapshot of oh-my-claudecode (OMC) orchestration state, read from
 * `<cwd>/.omc/state/mission-state.json` (+ `subagent-tracking.json`).
 *
 * The reader is fully defensive: any missing field, parse failure, or absent
 * `.omc` directory yields `null` (or zeroed counts) rather than throwing. The
 * statusline runs every ~300ms in a fresh process, so this stays a cheap,
 * direct guarded read.
 */
export interface OmcState {
    mode: string | null;
    status: string;
    active: boolean;
    objective: string;
    taskCounts: {
        total: number;
        completed: number;
        inProgress: number;
    };
    agentsTotal: number;
    agentsActive: number;
    agentsCompleted: number;
    updatedAt: Date | null;
}
/**
 * Read and normalize OMC mission state for the given working directory.
 * Returns `null` when `cwd` is missing, the mission-state file is absent, or
 * anything fails to parse.
 */
export declare function readOmcState(cwd: string | undefined): OmcState | null;
//# sourceMappingURL=omc-state.d.ts.map