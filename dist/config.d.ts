import type { Language } from './i18n/types.js';
export type LineLayoutType = 'compact' | 'expanded';
export type AutocompactBufferMode = 'enabled' | 'disabled';
export type ContextValueMode = 'percent' | 'tokens' | 'remaining' | 'both';
export type UsageValueMode = 'percent' | 'remaining';
export type GitBranchOverflowMode = 'truncate' | 'wrap';
/**
 * Controls how the model name is displayed in the HUD badge.
 *
 *   full:    Show the raw display name as-is (e.g. "Opus 4.6 (1M context)")
 *   compact: Strip redundant context-window suffix (e.g. "Opus 4.6")
 *   short:   Strip context suffix AND "Claude " prefix (e.g. "Opus 4.6")
 */
export type ModelFormatMode = 'full' | 'compact' | 'short';
/**
 * Controls how the reasoning effort renders in the model badge when
 * `display.showEffortLevel` is enabled.
 *
 *   full:   Symbol + level text (e.g. "◑ high"); default, matches the
 *           pre-option output byte-for-byte
 *   symbol: Symbol only (e.g. "◑"). Ultracode keeps the full form because its
 *           marker lives in the level text, and levels without a known symbol
 *           fall back to the level text
 *   text:   Level text only (e.g. "high")
 */
export type EffortFormatMode = 'full' | 'symbol' | 'text';
export type TimeFormatMode = 'relative' | 'absolute' | 'both' | 'elapsed' | 'elapsedAndAbsolute';
export type ProjectStyleMode = 'pipes' | 'natural';
export type BarStyleMode = 'block' | 'square' | 'thin' | 'vertical' | 'dots' | 'shade' | 'double';
export type AgentNamespaceMode = 'strip' | 'badge' | 'raw';
export type OrchestrationSourceMode = 'auto' | 'superpowers' | 'omc' | 'off';
export type CustomLinePosition = 'first' | 'last';
export type HourCycleMode = 'auto' | 'h11' | 'h12' | 'h23' | 'h24';
/**
 * Controls how many directory segments of cwd are shown in the project badge.
 *
 *   1 | 2 | 3: Show the last N segments (e.g. 2 -> "ai_workspace/knowledge-forge")
 *   'full':    Show the entire absolute path from root (e.g. "/Users/name/…")
 */
export type PathLevels = 1 | 2 | 3 | 'full';
export type HudElement = 'project' | 'addedDirs' | 'context' | 'usage' | 'promptCache' | 'memory' | 'environment' | 'tools' | 'skills' | 'mcp' | 'agents' | 'todos' | 'sessionTime';
/**
 * Coarse, orderable segments of the first HUD line (the identity/project
 * line). Shared by the expanded project line and the compact session line:
 *
 *   model:       provider + model badge + effort (compact mode also keeps the
 *                context bar attached to this segment)
 *   project:     project path + added dirs + git status (kept as one segment)
 *   advisor:     advisor model label
 *   sessionName: session title from /rename
 *   version:     Claude Code version
 *   extra:       extra-cmd custom label
 *   duration:    session duration
 *   cost:        session cost estimate
 *   speed:       output speed
 *   auth:        auth method / account
 */
export type FirstLineSegment = 'model' | 'project' | 'advisor' | 'sessionName' | 'version' | 'extra' | 'duration' | 'cost' | 'speed' | 'auth';
export type AddedDirsLayout = 'inline' | 'line';
/**
 * Where the weekly (7-day) usage window renders once it crosses
 * `display.sevenDayThreshold`. `inline` appends it to the usage line after the
 * 5-hour window; `line` gives it its own line below, which keeps a merged
 * Context/Usage row from growing past the terminal width in a heavy week.
 */
export type SevenDayLayout = 'inline' | 'line';
export type OrchestrationDetailLayout = 'inline' | 'line';
export type HudColorName = 'dim' | 'red' | 'green' | 'yellow' | 'magenta' | 'cyan' | 'brightBlue' | 'brightMagenta';
/** A color value: named preset, 256-color index (0-255), or hex string (#rrggbb). */
export type HudColorValue = HudColorName | number | string;
export interface HudColorOverrides {
    context: HudColorValue;
    usage: HudColorValue;
    warning: HudColorValue;
    usageWarning: HudColorValue;
    critical: HudColorValue;
    model: HudColorValue;
    project: HudColorValue;
    git: HudColorValue;
    gitBranch: HudColorValue;
    label: HudColorValue;
    /**
     * Style for every `dim()` span — separators, counts, overflow markers and the
     * connectives in the git and project segments. Defaults to SGR 2, which
     * terminals render by blending against the background and therefore paint an
     * opaque cell background for; set a concrete colour on a transparent terminal.
     */
    dim: HudColorValue;
    custom: HudColorValue;
    thinking: HudColorValue;
    duration: HudColorValue;
    orchestration: HudColorValue;
    barFilled?: string;
    barEmpty?: string;
    /**
     * Colour of the bar's unfilled track. Defaults to SGR 2 (dim), which
     * terminals render by blending the foreground against the background — on a
     * transparent terminal that forces the cell background to be painted opaque,
     * so the track shows up as a solid box. Set an explicit colour to avoid it.
     */
    barEmptyColor?: HudColorValue;
    /**
     * One colour for the weekly (7-day) usage window, at every level.
     *
     * Left unset, the weekly window shares the three-step ladder with the 5-hour
     * window and the memory bar — `colors.usage` below 75%, `colors.usageWarning`
     * to 89%, `colors.critical` above — which makes the two usage windows
     * indistinguishable except by their label most of the time. Setting this
     * pins the weekly window to a colour of its own and **opts it out of the
     * ladder entirely**, so it no longer escalates at 75% or 90%.
     */
    sevenDay?: HudColorValue;
}
export declare const DEFAULT_ELEMENT_ORDER: HudElement[];
export declare const DEFAULT_MERGE_GROUPS: HudElement[][];
export declare const DEFAULT_PROJECT_LINE_ORDER: FirstLineSegment[];
export interface HudConfig {
    language: Language;
    lineLayout: LineLayoutType;
    showSeparators: boolean;
    pathLevels: PathLevels;
    maxWidth: number | null;
    forceMaxWidth: boolean;
    elementOrder: HudElement[];
    projectLineOrder: FirstLineSegment[];
    gitStatus: {
        enabled: boolean;
        showDirty: boolean;
        showAheadBehind: boolean;
        showFileStats: boolean;
        showFileList: boolean;
        /**
         * Wrap the branch name in an OSC 8 hyperlink to its forge page. Terminals
         * mark link cells with a decoration, and on a transparent terminal that
         * decoration is drawn against an opaque cell background, so the branch
         * shows up as a solid box. Turn this off to keep the branch plain text.
         */
        linkBranch: boolean;
        branchOverflow: GitBranchOverflowMode;
        pushWarningThreshold: number;
        pushCriticalThreshold: number;
    };
    jjStatus: {
        enabled: boolean;
        showDirty: boolean;
        showConflicts: boolean;
    };
    display: {
        showModel: boolean;
        showProject: boolean;
        showAddedDirs: boolean;
        addedDirsLayout: AddedDirsLayout;
        showContextBar: boolean;
        contextValue: ContextValueMode;
        showConfigCounts: boolean;
        showCost: boolean;
        showRoutedCost: boolean;
        showDuration: boolean;
        showSpeed: boolean;
        showTokenBreakdown: boolean;
        showUsage: boolean;
        usageValue: UsageValueMode;
        usageBarEnabled: boolean;
        showResetLabel: boolean;
        usageCompact: boolean;
        showTools: boolean;
        showSkills: boolean;
        showMcp: boolean;
        toolNameMaxLength: number;
        toolsMaxVisible: number;
        showAgents: boolean;
        showTodos: boolean;
        showSessionName: boolean;
        showAuth: boolean;
        showAuthUser: boolean;
        authUserLength: number;
        showClaudeCodeVersion: boolean;
        showEffortLevel: boolean;
        effortFormat: EffortFormatMode;
        showMemoryUsage: boolean;
        showPromptCache: boolean;
        promptCacheTtlSeconds: number;
        showSessionTokens: boolean;
        showOutputStyle: boolean;
        showThinkingIndicator: boolean;
        showPendingPermission: boolean;
        showLastRequestTokens: boolean;
        showSessionStartDate: boolean;
        showLastResponseAt: boolean;
        showCompactions: boolean;
        mergeGroups: HudElement[][];
        rightAlign: HudElement[];
        autocompactBuffer: AutocompactBufferMode;
        contextWarningThreshold: number;
        contextCriticalThreshold: number;
        usageThreshold: number;
        sevenDayThreshold: number;
        sevenDayLayout: SevenDayLayout;
        environmentThreshold: number;
        externalUsagePath: string;
        externalUsageWritePath: string;
        externalUsageFreshnessMs: number;
        modelFormat: ModelFormatMode;
        modelOverride: string;
        modelSource: 'auto' | 'stdin' | 'transcript';
        showProvider: boolean;
        providerName: string;
        customLine: string;
        customLinePosition: CustomLinePosition;
        timeFormat: TimeFormatMode;
        projectStyle: ProjectStyleMode;
        naturalSeparator: string;
        modelGlyph: string;
        projectGlyph: string;
        branchGlyph: string;
        durationGlyph: string;
        barStyle: BarStyleMode;
        agentNamespaceMode: AgentNamespaceMode;
        orchestrationSource: OrchestrationSourceMode;
        showOrchestration: boolean;
        showOrchestrationDetail: boolean;
        orchestrationDetailLayout: OrchestrationDetailLayout;
        orchestrationFreshnessMs: number;
        hourCycle: HourCycleMode;
        showClockSeconds: boolean;
        showAdvisor: boolean;
        advisorOverride: string;
        autoCompactWindow: number | null;
    };
    colors: HudColorOverrides;
}
export declare const DEFAULT_CONFIG: HudConfig;
export declare function getConfigPath(): string;
/**
 * Optional per-config-directory overrides, layered on top of the main config.
 *
 * Users who run several Claude config directories side by side (via
 * CLAUDE_CONFIG_DIR) commonly symlink `plugins/` to one shared location, which
 * makes `plugins/claude-hud/config.json` the very same physical file for every
 * directory. This file lives outside `plugins/`, so it stays per-directory and
 * can override any part of the shared config.
 */
export declare function getConfigOverridePath(): string;
export declare function mergeConfig(userConfig: Partial<HudConfig>): HudConfig;
export declare function loadConfig(): Promise<HudConfig>;
//# sourceMappingURL=config.d.ts.map