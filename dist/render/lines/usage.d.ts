import type { RenderContext } from "../../types.js";
import { type ProgressLabelInput } from "./label-align.js";
export declare function renderUsageLine(ctx: RenderContext, labelOptions?: ProgressLabelInput): string | null;
/**
 * The colour set the weekly window renders with.
 *
 * `colors.sevenDay` pins all three ladder keys to one value, which is what
 * takes the weekly window out of the 75/90 escalation. The bar and the value
 * both read the ladder through getQuotaColor, so overriding its inputs covers
 * them together and no shared colour helper needs a new parameter. Returns the
 * caller's colours untouched when the override is unset.
 */
export declare function sevenDayColors(colors: RenderContext["config"]["colors"]): RenderContext["config"]["colors"];
/**
 * The weekly (7-day) window as a standalone line, for `sevenDayLayout: 'line'`.
 *
 * Returns null whenever the weekly window belongs on the usage line instead —
 * inline layout, compact usage, below `sevenDayThreshold`, no seven-day data, or
 * a session with no five-hour window at all (nothing to split away from).
 */
export declare function renderWeeklyUsageLine(ctx: RenderContext, labelOptions?: ProgressLabelInput): string | null;
//# sourceMappingURL=usage.d.ts.map