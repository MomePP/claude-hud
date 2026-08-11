import type { OrchestrationState } from './orchestration.js';
/**
 * Read and normalize OMC mission state for the given working directory.
 * Returns `null` when `cwd` is missing, the mission-state file is absent, or
 * anything fails to parse.
 */
export declare function readOmcState(cwd: string | undefined): OrchestrationState | null;
//# sourceMappingURL=omc-state.d.ts.map