import type { RenderContext } from "../../types.js";
import { type ProgressLabelInput } from "./label-align.js";
export declare function renderUsageLine(ctx: RenderContext, labelOptions?: ProgressLabelInput): string | null;
/**
 * The weekly (7-day) window as a standalone line, for `sevenDayLayout: 'line'`.
 *
 * Returns null whenever the weekly window belongs on the usage line instead —
 * inline layout, compact usage, below `sevenDayThreshold`, no seven-day data, or
 * a session with no five-hour window at all (nothing to split away from).
 */
export declare function renderWeeklyUsageLine(ctx: RenderContext, labelOptions?: ProgressLabelInput): string | null;
//# sourceMappingURL=usage.d.ts.map