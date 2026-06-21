import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getHudPluginDir } from './claude-config-dir.js';
import { createDebug } from './debug.js';
const debug = createDebug('config');
export const DEFAULT_ELEMENT_ORDER = [
    'project',
    'addedDirs',
    'context',
    'usage',
    'promptCache',
    'memory',
    'environment',
    'tools',
    'skills',
    'mcp',
    'agents',
    'todos',
    'sessionTime',
];
export const DEFAULT_MERGE_GROUPS = [
    ['context', 'usage'],
];
const KNOWN_ELEMENTS = new Set(DEFAULT_ELEMENT_ORDER);
export const DEFAULT_CONFIG = {
    language: 'en',
    lineLayout: 'expanded',
    showSeparators: false,
    pathLevels: 1,
    maxWidth: null,
    forceMaxWidth: false,
    elementOrder: [...DEFAULT_ELEMENT_ORDER],
    gitStatus: {
        enabled: true,
        showDirty: true,
        showAheadBehind: false,
        showFileStats: false,
        showFileList: false,
        branchOverflow: 'truncate',
        pushWarningThreshold: 0,
        pushCriticalThreshold: 0,
    },
    display: {
        showModel: true,
        showProject: true,
        showAddedDirs: true,
        addedDirsLayout: 'inline',
        showContextBar: true,
        contextValue: 'percent',
        showConfigCounts: false,
        showCost: false,
        showDuration: false,
        showSpeed: false,
        showTokenBreakdown: true,
        showUsage: true,
        usageValue: 'percent',
        usageBarEnabled: true,
        showResetLabel: true,
        usageCompact: false,
        showTools: false,
        showSkills: false,
        showMcp: false,
        toolNameMaxLength: 0,
        toolsMaxVisible: 4,
        showAgents: false,
        showTodos: false,
        showSessionName: false,
        showClaudeCodeVersion: false,
        showEffortLevel: false,
        showMemoryUsage: false,
        showPromptCache: false,
        promptCacheTtlSeconds: 300,
        showSessionTokens: false,
        showOutputStyle: false,
        showThinkingIndicator: true,
        showPendingPermission: true,
        showLastRequestTokens: false,
        showSessionStartDate: false,
        showLastResponseAt: false,
        showCompactions: false,
        mergeGroups: DEFAULT_MERGE_GROUPS.map(group => [...group]),
        autocompactBuffer: 'enabled',
        contextWarningThreshold: 70,
        contextCriticalThreshold: 85,
        usageThreshold: 0,
        sevenDayThreshold: 80,
        environmentThreshold: 0,
        externalUsagePath: '',
        externalUsageWritePath: '',
        externalUsageFreshnessMs: 300000,
        modelFormat: 'full',
        modelOverride: '',
        showProvider: false,
        providerName: '',
        customLine: '',
        customLinePosition: 'last',
        timeFormat: 'relative',
        projectStyle: 'pipes',
        naturalSeparator: ' \u00B7 ',
        modelGlyph: '\uec10',
        projectGlyph: '\uf114',
        branchGlyph: '\ue725',
        durationGlyph: '\uf017',
        barStyle: 'block',
        agentNamespaceMode: 'strip',
        showOmcMode: true,
        showOmcState: false,
        showAdvisor: false,
        advisorOverride: '',
        autoCompactWindow: null,
    },
    colors: {
        context: 'green',
        usage: 'brightBlue',
        warning: 'yellow',
        usageWarning: 'brightMagenta',
        critical: 'red',
        model: 'green',
        project: 'cyan',
        git: 'magenta',
        gitBranch: 'brightMagenta',
        label: 'dim',
        custom: 208,
        thinking: 'dim',
        duration: 'dim',
    },
};
export function getConfigPath() {
    const homeDir = os.homedir();
    return path.join(getHudPluginDir(homeDir), 'config.json');
}
function validatePathLevels(value) {
    return value === 1 || value === 2 || value === 3;
}
function validateLineLayout(value) {
    return value === 'compact' || value === 'expanded';
}
function validateAutocompactBuffer(value) {
    return value === 'enabled' || value === 'disabled';
}
function validateGitBranchOverflow(value) {
    return value === 'truncate' || value === 'wrap';
}
function validateContextValue(value) {
    return value === 'percent' || value === 'tokens' || value === 'remaining' || value === 'both';
}
function validateUsageValue(value) {
    return value === 'percent' || value === 'remaining';
}
function validateLanguage(value) {
    return value === 'en' || value === 'zh' || value === 'zh-Hans';
}
function validateModelFormat(value) {
    return value === 'full' || value === 'compact' || value === 'short';
}
function validateTimeFormat(value) {
    return value === 'relative'
        || value === 'absolute'
        || value === 'both'
        || value === 'elapsed'
        || value === 'elapsedAndAbsolute';
}
function validateCustomLinePosition(value) {
    return value === 'first' || value === 'last';
}
function validateProjectStyle(value) {
    return value === 'pipes' || value === 'natural';
}
function validateAgentNamespaceMode(value) {
    return value === 'strip' || value === 'badge' || value === 'raw';
}
function validateBarStyle(value) {
    return value === 'block'
        || value === 'square'
        || value === 'thin'
        || value === 'vertical'
        || value === 'dots'
        || value === 'shade'
        || value === 'double';
}
function validateColorName(value) {
    return value === 'dim'
        || value === 'red'
        || value === 'green'
        || value === 'yellow'
        || value === 'magenta'
        || value === 'cyan'
        || value === 'brightBlue'
        || value === 'brightMagenta';
}
const UNSAFE_CODEPOINT = /[\p{Cc}\p{Cf}\p{Variation_Selector}\p{Zl}\p{Zp}\p{Cn}]/u;
// Lazy singleton — see src/render/index.ts. validateBarChar is called from
// loadConfig on every tick; eagerly constructing Intl.Segmenter at module
// load would waste the first-construction ICU init (~6ms) when no override is set.
let _barCharSegmenter;
function getBarCharSegmenter() {
    if (_barCharSegmenter !== undefined) {
        return _barCharSegmenter;
    }
    _barCharSegmenter = typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null;
    return _barCharSegmenter;
}
function validateBarChar(value) {
    if (typeof value !== 'string' || value.length === 0)
        return false;
    const segmenter = getBarCharSegmenter();
    if (segmenter) {
        if (Array.from(segmenter.segment(value)).length !== 1)
            return false;
    }
    else if (Array.from(value).length !== 1) {
        return false;
    }
    for (const ch of value) {
        if (UNSAFE_CODEPOINT.test(ch))
            return false;
    }
    return true;
}
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
function validateColorValue(value) {
    if (validateColorName(value))
        return true;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255)
        return true;
    if (typeof value === 'string' && HEX_COLOR_PATTERN.test(value))
        return true;
    return false;
}
function validateElementOrder(value) {
    if (!Array.isArray(value) || value.length === 0) {
        return [...DEFAULT_ELEMENT_ORDER];
    }
    const seen = new Set();
    const elementOrder = [];
    for (const item of value) {
        if (typeof item !== 'string' || !KNOWN_ELEMENTS.has(item)) {
            continue;
        }
        const element = item;
        if (seen.has(element)) {
            continue;
        }
        seen.add(element);
        elementOrder.push(element);
    }
    return elementOrder.length > 0 ? elementOrder : [...DEFAULT_ELEMENT_ORDER];
}
function validateMergeGroups(value) {
    if (!Array.isArray(value)) {
        return DEFAULT_MERGE_GROUPS.map(group => [...group]);
    }
    const groups = [];
    for (const rawGroup of value) {
        if (!Array.isArray(rawGroup))
            continue;
        const seen = new Set();
        const group = [];
        for (const item of rawGroup) {
            if (typeof item !== 'string' || !KNOWN_ELEMENTS.has(item))
                continue;
            const el = item;
            if (seen.has(el))
                continue;
            seen.add(el);
            group.push(el);
        }
        if (group.length >= 2)
            groups.push(group);
    }
    return groups;
}
function validateMaxWidth(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
        return null;
    return Math.floor(value);
}
function validatePromptCacheTtl(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return DEFAULT_CONFIG.display.promptCacheTtlSeconds;
    }
    return Math.floor(value);
}
function migrateConfig(userConfig) {
    const migrated = { ...userConfig };
    if ('layout' in userConfig && !('lineLayout' in userConfig)) {
        if (typeof userConfig.layout === 'string') {
            // Legacy string migration (v0.0.x → v0.1.x)
            if (userConfig.layout === 'separators') {
                migrated.lineLayout = 'compact';
                migrated.showSeparators = true;
            }
            else {
                migrated.lineLayout = 'compact';
                migrated.showSeparators = false;
            }
        }
        else if (typeof userConfig.layout === 'object' && userConfig.layout !== null) {
            // Object layout written by third-party tools — extract nested fields
            const obj = userConfig.layout;
            if (typeof obj.lineLayout === 'string')
                migrated.lineLayout = obj.lineLayout;
            if (typeof obj.showSeparators === 'boolean')
                migrated.showSeparators = obj.showSeparators;
            if (typeof obj.pathLevels === 'number')
                migrated.pathLevels = obj.pathLevels;
        }
        delete migrated.layout;
    }
    return migrated;
}
function validateThreshold(value, max = 100) {
    if (typeof value !== 'number')
        return 0;
    return Math.max(0, Math.min(max, value));
}
function validateContextThreshold(value, fallback) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return fallback;
    return Math.max(0, Math.min(100, value));
}
function validateCountThreshold(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.floor(value));
}
function validateDurationSeconds(value, fallback) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return fallback;
    }
    return Math.floor(value);
}
function validateNonNegativeInteger(value, fallback) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        return fallback;
    }
    return value;
}
function validateAutoCompactWindow(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
        return null;
    }
    return value;
}
function validateOptionalPath(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function validateFreshnessMs(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_CONFIG.display.externalUsageFreshnessMs;
    }
    return Math.max(0, Math.floor(value));
}
export function mergeConfig(userConfig) {
    const migrated = migrateConfig(userConfig);
    const language = validateLanguage(migrated.language)
        ? migrated.language
        : DEFAULT_CONFIG.language;
    const lineLayout = validateLineLayout(migrated.lineLayout)
        ? migrated.lineLayout
        : DEFAULT_CONFIG.lineLayout;
    const showSeparators = typeof migrated.showSeparators === 'boolean'
        ? migrated.showSeparators
        : DEFAULT_CONFIG.showSeparators;
    const pathLevels = validatePathLevels(migrated.pathLevels)
        ? migrated.pathLevels
        : DEFAULT_CONFIG.pathLevels;
    const maxWidth = validateMaxWidth(migrated.maxWidth);
    const elementOrder = validateElementOrder(migrated.elementOrder);
    const forceMaxWidth = typeof migrated.forceMaxWidth === 'boolean'
        ? migrated.forceMaxWidth
        : DEFAULT_CONFIG.forceMaxWidth;
    const gitStatus = {
        enabled: typeof migrated.gitStatus?.enabled === 'boolean'
            ? migrated.gitStatus.enabled
            : DEFAULT_CONFIG.gitStatus.enabled,
        showDirty: typeof migrated.gitStatus?.showDirty === 'boolean'
            ? migrated.gitStatus.showDirty
            : DEFAULT_CONFIG.gitStatus.showDirty,
        showAheadBehind: typeof migrated.gitStatus?.showAheadBehind === 'boolean'
            ? migrated.gitStatus.showAheadBehind
            : DEFAULT_CONFIG.gitStatus.showAheadBehind,
        showFileStats: typeof migrated.gitStatus?.showFileStats === 'boolean'
            ? migrated.gitStatus.showFileStats
            : DEFAULT_CONFIG.gitStatus.showFileStats,
        showFileList: typeof migrated.gitStatus?.showFileList === 'boolean'
            ? migrated.gitStatus.showFileList
            : DEFAULT_CONFIG.gitStatus.showFileList,
        branchOverflow: validateGitBranchOverflow(migrated.gitStatus?.branchOverflow)
            ? migrated.gitStatus.branchOverflow
            : DEFAULT_CONFIG.gitStatus.branchOverflow,
        pushWarningThreshold: validateCountThreshold(migrated.gitStatus?.pushWarningThreshold),
        pushCriticalThreshold: validateCountThreshold(migrated.gitStatus?.pushCriticalThreshold),
    };
    const display = {
        showModel: typeof migrated.display?.showModel === 'boolean'
            ? migrated.display.showModel
            : DEFAULT_CONFIG.display.showModel,
        showProject: typeof migrated.display?.showProject === 'boolean'
            ? migrated.display.showProject
            : DEFAULT_CONFIG.display.showProject,
        showAddedDirs: typeof migrated.display?.showAddedDirs === 'boolean'
            ? migrated.display.showAddedDirs
            : DEFAULT_CONFIG.display.showAddedDirs,
        addedDirsLayout: (migrated.display?.addedDirsLayout === 'inline' || migrated.display?.addedDirsLayout === 'line')
            ? migrated.display.addedDirsLayout
            : DEFAULT_CONFIG.display.addedDirsLayout,
        showContextBar: typeof migrated.display?.showContextBar === 'boolean'
            ? migrated.display.showContextBar
            : DEFAULT_CONFIG.display.showContextBar,
        contextValue: validateContextValue(migrated.display?.contextValue)
            ? migrated.display.contextValue
            : DEFAULT_CONFIG.display.contextValue,
        showConfigCounts: typeof migrated.display?.showConfigCounts === 'boolean'
            ? migrated.display.showConfigCounts
            : DEFAULT_CONFIG.display.showConfigCounts,
        showCost: typeof migrated.display?.showCost === 'boolean'
            ? migrated.display.showCost
            : DEFAULT_CONFIG.display.showCost,
        showDuration: typeof migrated.display?.showDuration === 'boolean'
            ? migrated.display.showDuration
            : DEFAULT_CONFIG.display.showDuration,
        showSpeed: typeof migrated.display?.showSpeed === 'boolean'
            ? migrated.display.showSpeed
            : DEFAULT_CONFIG.display.showSpeed,
        showTokenBreakdown: typeof migrated.display?.showTokenBreakdown === 'boolean'
            ? migrated.display.showTokenBreakdown
            : DEFAULT_CONFIG.display.showTokenBreakdown,
        showUsage: typeof migrated.display?.showUsage === 'boolean'
            ? migrated.display.showUsage
            : DEFAULT_CONFIG.display.showUsage,
        usageValue: validateUsageValue(migrated.display?.usageValue)
            ? migrated.display.usageValue
            : DEFAULT_CONFIG.display.usageValue,
        usageBarEnabled: typeof migrated.display?.usageBarEnabled === 'boolean'
            ? migrated.display.usageBarEnabled
            : DEFAULT_CONFIG.display.usageBarEnabled,
        showResetLabel: typeof migrated.display?.showResetLabel === 'boolean'
            ? migrated.display.showResetLabel
            : DEFAULT_CONFIG.display.showResetLabel,
        usageCompact: typeof migrated.display?.usageCompact === 'boolean'
            ? migrated.display.usageCompact
            : DEFAULT_CONFIG.display.usageCompact,
        showTools: typeof migrated.display?.showTools === 'boolean'
            ? migrated.display.showTools
            : DEFAULT_CONFIG.display.showTools,
        showSkills: typeof migrated.display?.showSkills === 'boolean'
            ? migrated.display.showSkills
            : DEFAULT_CONFIG.display.showSkills,
        showMcp: typeof migrated.display?.showMcp === 'boolean'
            ? migrated.display.showMcp
            : DEFAULT_CONFIG.display.showMcp,
        toolNameMaxLength: validateNonNegativeInteger(migrated.display?.toolNameMaxLength, DEFAULT_CONFIG.display.toolNameMaxLength),
        toolsMaxVisible: validateNonNegativeInteger(migrated.display?.toolsMaxVisible, DEFAULT_CONFIG.display.toolsMaxVisible),
        showAgents: typeof migrated.display?.showAgents === 'boolean'
            ? migrated.display.showAgents
            : DEFAULT_CONFIG.display.showAgents,
        showTodos: typeof migrated.display?.showTodos === 'boolean'
            ? migrated.display.showTodos
            : DEFAULT_CONFIG.display.showTodos,
        showSessionName: typeof migrated.display?.showSessionName === 'boolean'
            ? migrated.display.showSessionName
            : DEFAULT_CONFIG.display.showSessionName,
        showClaudeCodeVersion: typeof migrated.display?.showClaudeCodeVersion === 'boolean'
            ? migrated.display.showClaudeCodeVersion
            : DEFAULT_CONFIG.display.showClaudeCodeVersion,
        showEffortLevel: typeof migrated.display?.showEffortLevel === 'boolean'
            ? migrated.display.showEffortLevel
            : DEFAULT_CONFIG.display.showEffortLevel,
        showMemoryUsage: typeof migrated.display?.showMemoryUsage === 'boolean'
            ? migrated.display.showMemoryUsage
            : DEFAULT_CONFIG.display.showMemoryUsage,
        showPromptCache: typeof migrated.display?.showPromptCache === 'boolean'
            ? migrated.display.showPromptCache
            : DEFAULT_CONFIG.display.showPromptCache,
        promptCacheTtlSeconds: validatePromptCacheTtl(migrated.display?.promptCacheTtlSeconds),
        showSessionTokens: typeof migrated.display?.showSessionTokens === 'boolean'
            ? migrated.display.showSessionTokens
            : DEFAULT_CONFIG.display.showSessionTokens,
        showOutputStyle: typeof migrated.display?.showOutputStyle === 'boolean'
            ? migrated.display.showOutputStyle
            : DEFAULT_CONFIG.display.showOutputStyle,
        showThinkingIndicator: typeof migrated.display?.showThinkingIndicator === 'boolean'
            ? migrated.display.showThinkingIndicator
            : DEFAULT_CONFIG.display.showThinkingIndicator,
        showPendingPermission: typeof migrated.display?.showPendingPermission === 'boolean'
            ? migrated.display.showPendingPermission
            : DEFAULT_CONFIG.display.showPendingPermission,
        showLastRequestTokens: typeof migrated.display?.showLastRequestTokens === 'boolean'
            ? migrated.display.showLastRequestTokens
            : DEFAULT_CONFIG.display.showLastRequestTokens,
        showSessionStartDate: typeof migrated.display?.showSessionStartDate === 'boolean'
            ? migrated.display.showSessionStartDate
            : DEFAULT_CONFIG.display.showSessionStartDate,
        showLastResponseAt: typeof migrated.display?.showLastResponseAt === 'boolean'
            ? migrated.display.showLastResponseAt
            : DEFAULT_CONFIG.display.showLastResponseAt,
        showCompactions: typeof migrated.display?.showCompactions === 'boolean'
            ? migrated.display.showCompactions
            : DEFAULT_CONFIG.display.showCompactions,
        mergeGroups: validateMergeGroups(migrated.display?.mergeGroups),
        autocompactBuffer: validateAutocompactBuffer(migrated.display?.autocompactBuffer)
            ? migrated.display.autocompactBuffer
            : DEFAULT_CONFIG.display.autocompactBuffer,
        contextWarningThreshold: validateContextThreshold(migrated.display?.contextWarningThreshold, DEFAULT_CONFIG.display.contextWarningThreshold),
        contextCriticalThreshold: validateContextThreshold(migrated.display?.contextCriticalThreshold, DEFAULT_CONFIG.display.contextCriticalThreshold),
        usageThreshold: validateThreshold(migrated.display?.usageThreshold, 100),
        sevenDayThreshold: validateThreshold(migrated.display?.sevenDayThreshold, 100),
        environmentThreshold: validateThreshold(migrated.display?.environmentThreshold, 100),
        externalUsagePath: validateOptionalPath(migrated.display?.externalUsagePath),
        externalUsageWritePath: validateOptionalPath(migrated.display?.externalUsageWritePath),
        externalUsageFreshnessMs: validateFreshnessMs(migrated.display?.externalUsageFreshnessMs),
        modelFormat: validateModelFormat(migrated.display?.modelFormat)
            ? migrated.display.modelFormat
            : DEFAULT_CONFIG.display.modelFormat,
        modelOverride: typeof migrated.display?.modelOverride === 'string'
            ? migrated.display.modelOverride.slice(0, 80)
            : DEFAULT_CONFIG.display.modelOverride,
        showProvider: typeof migrated.display?.showProvider === 'boolean'
            ? migrated.display.showProvider
            : DEFAULT_CONFIG.display.showProvider,
        providerName: typeof migrated.display?.providerName === 'string'
            ? migrated.display.providerName.slice(0, 40)
            : DEFAULT_CONFIG.display.providerName,
        customLine: typeof migrated.display?.customLine === 'string'
            ? migrated.display.customLine.slice(0, 80)
            : DEFAULT_CONFIG.display.customLine,
        customLinePosition: validateCustomLinePosition(migrated.display?.customLinePosition)
            ? migrated.display.customLinePosition
            : DEFAULT_CONFIG.display.customLinePosition,
        timeFormat: validateTimeFormat(migrated.display?.timeFormat)
            ? migrated.display.timeFormat
            : DEFAULT_CONFIG.display.timeFormat,
        projectStyle: validateProjectStyle(migrated.display?.projectStyle)
            ? migrated.display.projectStyle
            : DEFAULT_CONFIG.display.projectStyle,
        naturalSeparator: typeof migrated.display?.naturalSeparator === 'string'
            ? migrated.display.naturalSeparator.slice(0, 8)
            : DEFAULT_CONFIG.display.naturalSeparator,
        modelGlyph: typeof migrated.display?.modelGlyph === 'string'
            ? migrated.display.modelGlyph.slice(0, 8)
            : DEFAULT_CONFIG.display.modelGlyph,
        projectGlyph: typeof migrated.display?.projectGlyph === 'string'
            ? migrated.display.projectGlyph.slice(0, 8)
            : DEFAULT_CONFIG.display.projectGlyph,
        branchGlyph: typeof migrated.display?.branchGlyph === 'string'
            ? migrated.display.branchGlyph.slice(0, 8)
            : DEFAULT_CONFIG.display.branchGlyph,
        durationGlyph: typeof migrated.display?.durationGlyph === 'string'
            ? migrated.display.durationGlyph.slice(0, 8)
            : DEFAULT_CONFIG.display.durationGlyph,
        barStyle: validateBarStyle(migrated.display?.barStyle)
            ? migrated.display.barStyle
            : DEFAULT_CONFIG.display.barStyle,
        agentNamespaceMode: validateAgentNamespaceMode(migrated.display?.agentNamespaceMode)
            ? migrated.display.agentNamespaceMode
            : DEFAULT_CONFIG.display.agentNamespaceMode,
        showOmcMode: typeof migrated.display?.showOmcMode === 'boolean'
            ? migrated.display.showOmcMode
            : DEFAULT_CONFIG.display.showOmcMode,
        showOmcState: typeof migrated.display?.showOmcState === 'boolean'
            ? migrated.display.showOmcState
            : DEFAULT_CONFIG.display.showOmcState,
        showAdvisor: typeof migrated.display?.showAdvisor === 'boolean'
            ? migrated.display.showAdvisor
            : DEFAULT_CONFIG.display.showAdvisor,
        advisorOverride: typeof migrated.display?.advisorOverride === 'string'
            ? migrated.display.advisorOverride.slice(0, 80)
            : DEFAULT_CONFIG.display.advisorOverride,
        autoCompactWindow: validateAutoCompactWindow(migrated.display?.autoCompactWindow),
    };
    const colors = {
        context: validateColorValue(migrated.colors?.context)
            ? migrated.colors.context
            : DEFAULT_CONFIG.colors.context,
        usage: validateColorValue(migrated.colors?.usage)
            ? migrated.colors.usage
            : DEFAULT_CONFIG.colors.usage,
        warning: validateColorValue(migrated.colors?.warning)
            ? migrated.colors.warning
            : DEFAULT_CONFIG.colors.warning,
        usageWarning: validateColorValue(migrated.colors?.usageWarning)
            ? migrated.colors.usageWarning
            : DEFAULT_CONFIG.colors.usageWarning,
        critical: validateColorValue(migrated.colors?.critical)
            ? migrated.colors.critical
            : DEFAULT_CONFIG.colors.critical,
        model: validateColorValue(migrated.colors?.model)
            ? migrated.colors.model
            : DEFAULT_CONFIG.colors.model,
        project: validateColorValue(migrated.colors?.project)
            ? migrated.colors.project
            : DEFAULT_CONFIG.colors.project,
        git: validateColorValue(migrated.colors?.git)
            ? migrated.colors.git
            : DEFAULT_CONFIG.colors.git,
        gitBranch: validateColorValue(migrated.colors?.gitBranch)
            ? migrated.colors.gitBranch
            : DEFAULT_CONFIG.colors.gitBranch,
        label: validateColorValue(migrated.colors?.label)
            ? migrated.colors.label
            : DEFAULT_CONFIG.colors.label,
        custom: validateColorValue(migrated.colors?.custom)
            ? migrated.colors.custom
            : DEFAULT_CONFIG.colors.custom,
        thinking: validateColorValue(migrated.colors?.thinking)
            ? migrated.colors.thinking
            : DEFAULT_CONFIG.colors.thinking,
        duration: validateColorValue(migrated.colors?.duration)
            ? migrated.colors.duration
            : DEFAULT_CONFIG.colors.duration,
        barFilled: validateBarChar(migrated.colors?.barFilled)
            ? migrated.colors.barFilled
            : undefined,
        barEmpty: validateBarChar(migrated.colors?.barEmpty)
            ? migrated.colors.barEmpty
            : undefined,
    };
    return { language, lineLayout, showSeparators, pathLevels, maxWidth, forceMaxWidth, elementOrder, gitStatus, display, colors };
}
export async function loadConfig() {
    const configPath = getConfigPath();
    try {
        if (!fs.existsSync(configPath)) {
            return mergeConfig({});
        }
        const content = fs.readFileSync(configPath, 'utf-8');
        const userConfig = JSON.parse(content);
        return mergeConfig(userConfig);
    }
    catch (err) {
        debug('Failed to load config from %s, using defaults:', configPath, err instanceof Error ? err.message : err);
        return mergeConfig({});
    }
}
//# sourceMappingURL=config.js.map