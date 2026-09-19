import type { RenderContext } from '../types.js';
import type { EffortFormatMode } from '../config.js';
/**
 * The ` ◑ high` suffix appended after the model name, per `display.effortFormat`.
 *
 * Exported because the fork's `projectStyle: 'natural'` composes its own model
 * segment instead of going through formatModelDisplay, and must render the
 * effort identically rather than reimplementing the ultracode carve-out.
 */
export declare function formatEffortSuffix(ctx: RenderContext, format: EffortFormatMode): string;
export declare function formatModelDisplay(model: string, ctx: RenderContext): string;
//# sourceMappingURL=model-display.d.ts.map