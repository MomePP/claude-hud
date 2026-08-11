import type { OrchestrationState } from './orchestration.js';
import type { TodoItem } from './types.js';
export interface SuperpowersStateInput {
    cwd?: string;
    latestSuperpowersSkill?: {
        name: string;
        at: Date;
    };
    todos: TodoItem[];
    agentsActive: number;
    now: number;
    freshnessMs: number;
}
/**
 * Assemble a superpowers OrchestrationState from transcript-derived signals
 * (latest superpowers skill, todos, running agents) enriched by the optional
 * SDD progress file. Returns null when there is neither a fresh phase nor an
 * in-progress execution file (nothing worth showing).
 */
export declare function readSuperpowersState(input: SuperpowersStateInput): OrchestrationState | null;
//# sourceMappingURL=superpowers-state.d.ts.map