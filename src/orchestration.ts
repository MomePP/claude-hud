export type OrchestrationSource = 'omc' | 'superpowers';

/**
 * Source-agnostic orchestration snapshot. Produced by readOmcState() and
 * readSuperpowersState(); consumed by the inline project-line badge and the
 * opt-in detail line. A missing/absent source yields `null`, never a throw.
 */
export interface OrchestrationState {
  source: OrchestrationSource;
  mode: string | null;
  active: boolean;
  objective: string;
  taskCounts: { total: number; completed: number; inProgress: number };
  agentsActive: number;
  updatedAt: Date | null;
}
