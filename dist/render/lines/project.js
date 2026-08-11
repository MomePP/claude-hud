import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatModelName, getProviderLabel, resolveModelName } from '../../stdin.js';
import { formatModelDisplay } from '../model-display.js';
import { getOutputSpeed } from '../../speed-tracker.js';
import { git as gitColor, gitBranch as gitBranchColor, warning as warningColor, critical as criticalColor, label, model as modelColor, project as projectColor, red, green, yellow, dim, custom as customColor, thinking as thinkingColor, duration as durationColor } from '../colors.js';
import { t } from '../../i18n/index.js';
import { renderCostEstimate } from './cost.js';
import { renderAdvisorLine } from './advisor.js';
import { normalizeAddedDirs, sanitize as sanitizeDisplayText, basenameOf, truncateBasename, MAX_RENDERED_ADDED_DIRS } from './added-dirs.js';
import { formatAuthSegment } from '../../auth.js';
import { formatProjectPath } from '../project-path.js';
import { DEFAULT_CONFIG, DEFAULT_PROJECT_LINE_ORDER } from '../../config.js';
import { orderFirstLineParts } from '../first-line-order.js';
import { getVcsDisplayState } from '../vcs-status.js';
function formatCompactCount(n) {
    if (n >= 1_000_000)
        return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)
        return `${Math.round(n / 1000)}k`;
    return `${n}`;
}
function formatLastRequestTokens(usage) {
    const input = formatCompactCount(usage.inputTokens);
    const output = formatCompactCount(usage.outputTokens);
    const base = `last: ${input}→${output}`;
    if (usage.reasoningTokens && usage.reasoningTokens > 0) {
        return `${base} (+${formatCompactCount(usage.reasoningTokens)})`;
    }
    return base;
}
function hyperlink(uri, text) {
    const esc = '\x1b';
    const st = '\\';
    return `${esc}]8;;${uri}${esc}${st}${text}${esc}]8;;${esc}${st}`;
}
function getProjectPath(cwd, pathLevels) {
    if (!cwd)
        return null;
    return formatProjectPath(cwd, pathLevels ?? 1) || null;
}
function buildExtras(ctx) {
    const display = ctx.config?.display;
    const colors = ctx.config?.colors;
    const extras = [];
    const push = (text, key = null) => extras.push({ key, text });
    if (display?.showSessionName && ctx.transcript.sessionName) {
        push(label(ctx.transcript.sessionName, colors), 'sessionName');
    }
    if (display?.showClaudeCodeVersion && ctx.claudeCodeVersion) {
        push(label(`CC v${ctx.claudeCodeVersion}`, colors), 'version');
    }
    if (ctx.extraLabel) {
        push(label(ctx.extraLabel, colors), 'extra');
    }
    if (display?.showSpeed) {
        const speed = getOutputSpeed(ctx.stdin);
        if (speed !== null) {
            push(label(`${t('format.out')}: ${speed.toFixed(1)} ${t('format.tokPerSec')}`, colors), 'speed');
        }
    }
    if (display?.showDuration === true && ctx.sessionDuration) {
        const isNatural = display?.projectStyle === 'natural';
        const durationGlyph = display?.durationGlyph ?? '';
        const durationText = isNatural
            ? (durationGlyph ? `${durationGlyph} ${ctx.sessionDuration}` : ctx.sessionDuration)
            : `\u23F1\uFE0F  ${ctx.sessionDuration}`;
        push(isNatural ? durationColor(durationText, colors) : label(durationText, colors), 'duration');
    }
    const costEstimate = renderCostEstimate(ctx);
    if (costEstimate) {
        push(costEstimate, 'cost');
    }
    const authSegment = formatAuthSegment(ctx.authInfo, display);
    if (authSegment) {
        push(label(authSegment, colors), 'auth');
    }
    if ((display?.showThinkingIndicator ?? true) && ctx.transcript.thinkingState?.active) {
        push(thinkingColor('∿ thinking', colors));
    }
    if ((display?.showOrchestration ?? true) && ctx.orchestration?.active && ctx.orchestration.mode) {
        const { source, mode, taskCounts } = ctx.orchestration;
        const glyph = source === 'superpowers' ? '✦' : '⚙';
        const progress = taskCounts.total > 0 ? ` ${taskCounts.completed}/${taskCounts.total}` : '';
        push(dim(`${glyph} ${sanitizeDisplayText(mode)}${progress}`));
    }
    if ((display?.showPendingPermission ?? true) && ctx.transcript.pendingPermission) {
        const { targetSummary, timestamp } = ctx.transcript.pendingPermission;
        const waitingSecs = Math.max(0, Math.round((Date.now() - timestamp.getTime()) / 1000));
        push(yellow(`? ${targetSummary} ${dim(`(waiting ${waitingSecs}s)`)}`));
    }
    if ((display?.showLastRequestTokens ?? false) && ctx.transcript.lastRequestTokenUsage) {
        push(dim(formatLastRequestTokens(ctx.transcript.lastRequestTokenUsage)));
    }
    // customLine renders here (trailing) only in the default 'last' position.
    // 'first' positioning is handled at the front of renderPipesProjectLine;
    // emitting here too would duplicate it.
    if (display?.customLine && (display?.customLinePosition ?? 'last') === 'last') {
        push(customColor(display.customLine, colors));
    }
    return extras;
}
function getFileHref(filePath) {
    try {
        return pathToFileURL(path.resolve(filePath)).toString();
    }
    catch {
        return null;
    }
}
function resolvePathWithinCwd(cwd, candidatePath) {
    const resolvedCwd = path.resolve(cwd);
    const resolvedPath = path.resolve(cwd, candidatePath);
    const relative = path.relative(resolvedCwd, resolvedPath);
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
        return resolvedPath;
    }
    return null;
}
function safeHyperlink(uri, text) {
    if (!uri) {
        return text;
    }
    const sanitizedUri = sanitizeDisplayText(uri);
    try {
        const parsed = new URL(sanitizedUri);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'file:') {
            return text;
        }
        return hyperlink(parsed.toString(), text);
    }
    catch {
        return text;
    }
}
function renderPipesProjectLine(ctx) {
    const display = ctx.config?.display;
    const colors = ctx.config?.colors;
    const parts = [];
    const push = (text, key = null) => parts.push({ key, text });
    const customLine = display?.customLine;
    const customLinePosition = display?.customLinePosition ?? 'last';
    if (customLine && customLinePosition === 'first') {
        push(customColor(customLine, colors));
    }
    if (display?.showModel !== false) {
        const model = formatModelName(resolveModelName(ctx.stdin, ctx.transcript, display?.modelSource), display?.modelFormat, display?.modelOverride);
        const modelDisplay = formatModelDisplay(model, ctx);
        push(modelColor(`[${modelDisplay}]`, colors), 'model');
    }
    // Advisor model sits inline with the model/project/git badge so the
    // configured /advisor is visible on the first line at a glance.
    if (display?.showAdvisor) {
        const advisorPart = renderAdvisorLine(ctx);
        if (advisorPart) {
            push(advisorPart, 'advisor');
        }
    }
    let projectPart = null;
    if (display?.showProject !== false && ctx.stdin.cwd) {
        const projectPath = sanitizeDisplayText(getProjectPath(ctx.stdin.cwd, ctx.config?.pathLevels ?? 1) ?? '');
        if (projectPath) {
            projectPart = safeHyperlink(getFileHref(ctx.stdin.cwd), projectColor(projectPath, colors));
        }
    }
    let addedDirsPart = null;
    const addedDirs = normalizeAddedDirs(ctx.stdin.workspace?.added_dirs);
    const addedDirsLayout = display?.addedDirsLayout ?? 'inline';
    if (display?.showAddedDirs !== false && addedDirsLayout === 'inline' && addedDirs.length > 0) {
        const visible = addedDirs.slice(0, MAX_RENDERED_ADDED_DIRS);
        const overflow = addedDirs.length - visible.length;
        const rendered = visible.map((dir) => {
            const name = truncateBasename(sanitizeDisplayText(basenameOf(dir)));
            const text = dim(`+${name}`);
            return safeHyperlink(getFileHref(dir), text);
        });
        if (overflow > 0) {
            rendered.push(dim(`+${overflow} more`));
        }
        addedDirsPart = rendered.join(' ');
    }
    let gitPart = '';
    const vcs = getVcsDisplayState(ctx.gitStatus, ctx.config);
    const gitConfig = ctx.config?.gitStatus ?? DEFAULT_CONFIG.gitStatus;
    if (vcs) {
        const branchText = vcs.branch + (vcs.dirty ? '*' : '');
        const coloredBranch = gitBranchColor(branchText, colors);
        const linkedBranch = safeHyperlink(vcs.branchUrl, coloredBranch);
        const gitInner = [linkedBranch];
        if (vcs.ahead > 0)
            gitInner.push(formatAheadCount(vcs.ahead, gitConfig, colors));
        if (vcs.behind > 0)
            gitInner.push(gitBranchColor(`↓${vcs.behind}`, colors));
        if (vcs.lineDiff) {
            const diffParts = formatLineDiffParts(vcs.lineDiff);
            if (diffParts.length > 0)
                gitInner.push(`[${diffParts.join(' ')}]`);
        }
        if (vcs.conflict)
            gitInner.push(criticalColor('!conflict', colors));
        const vcsLabel = vcs.kind === 'jj' ? 'jj:(' : 'git:(';
        gitPart = `${gitColor(vcsLabel, colors)}${gitInner.join(' ')}${gitColor(')', colors)}`;
    }
    const branchOverflow = vcs?.branchOverflow ?? gitConfig.branchOverflow;
    const projectWithDirs = projectPart && addedDirsPart
        ? `${projectPart} ${addedDirsPart}`
        : projectPart ?? addedDirsPart;
    if (projectWithDirs && gitPart) {
        if (branchOverflow === 'wrap') {
            push(projectWithDirs, 'project');
            push(gitPart, 'project');
        }
        else {
            push(`${projectWithDirs} ${gitPart}`, 'project');
        }
    }
    else if (projectWithDirs) {
        push(projectWithDirs, 'project');
    }
    else if (gitPart) {
        push(gitPart, 'project');
    }
    parts.push(...buildExtras(ctx));
    if (parts.length === 0)
        return null;
    const order = ctx.config?.projectLineOrder ?? DEFAULT_PROJECT_LINE_ORDER;
    return orderFirstLineParts(parts, order).join(' \u2502 ');
}
function renderNaturalProjectLine(ctx) {
    const display = ctx.config?.display;
    const colors = ctx.config?.colors;
    const sep = display?.naturalSeparator || ' \u00B7 ';
    const coreSegments = [];
    if (display?.showModel !== false) {
        const model = formatModelName(resolveModelName(ctx.stdin, ctx.transcript, display?.modelSource), display?.modelFormat, display?.modelOverride);
        const providerLabel = getProviderLabel(ctx.stdin);
        const modelText = providerLabel ? `${model} (${providerLabel})` : model;
        const glyph = display?.modelGlyph ?? '';
        const modelPart = glyph ? `${glyph} ${modelText}` : modelText;
        coreSegments.push(modelColor(modelPart, colors));
    }
    if (display?.showAdvisor) {
        const advisorPart = renderAdvisorLine(ctx);
        if (advisorPart) {
            coreSegments.push(advisorPart);
        }
    }
    if (display?.showProject !== false && ctx.stdin.cwd) {
        const projectPath = sanitizeDisplayText(getProjectPath(ctx.stdin.cwd, ctx.config?.pathLevels ?? 1) ?? '');
        if (projectPath) {
            const linked = safeHyperlink(getFileHref(ctx.stdin.cwd), projectColor(projectPath, colors));
            const projectGlyph = display?.projectGlyph ?? '';
            const projectGlyphPart = projectGlyph ? `${projectColor(projectGlyph, colors)} ` : '';
            coreSegments.push(`${dim('in')} ${projectGlyphPart}${linked}`);
        }
    }
    const vcs = getVcsDisplayState(ctx.gitStatus, ctx.config);
    const gitConfig = ctx.config?.gitStatus ?? DEFAULT_CONFIG.gitStatus;
    if (vcs) {
        const branchText = vcs.branch + (vcs.dirty ? '*' : '');
        const coloredBranch = gitBranchColor(branchText, colors);
        const linkedBranch = safeHyperlink(vcs.branchUrl, coloredBranch);
        const branchGlyph = display?.branchGlyph ?? '';
        const branchGlyphPart = branchGlyph ? `${gitBranchColor(branchGlyph, colors)} ` : '';
        const gitTokens = [`${dim('on')} ${branchGlyphPart}${linkedBranch}`];
        if (vcs.ahead > 0)
            gitTokens.push(formatAheadCount(vcs.ahead, gitConfig, colors));
        if (vcs.behind > 0)
            gitTokens.push(gitBranchColor(`↓${vcs.behind}`, colors));
        if (vcs.lineDiff) {
            const diffParts = formatLineDiffParts(vcs.lineDiff);
            if (diffParts.length > 0)
                gitTokens.push(`${dim('with')} ${diffParts.join(' ')} ${dim('changes')}`);
        }
        if (vcs.conflict)
            gitTokens.push(criticalColor('!conflict', colors));
        coreSegments.push(gitTokens.join(' '));
    }
    // buildExtras only emits customLine in the default 'last' position; mirror the
    // pipes-mode front-push here so 'first' still renders in natural style.
    const front = (display?.customLine && (display?.customLinePosition ?? 'last') === 'first')
        ? [customColor(display.customLine, colors)]
        : [];
    const core = coreSegments.join(' ');
    // Natural style composes prose ("in X on Y"), so projectLineOrder — which
    // permutes the pipes layout's badges — deliberately does not apply here.
    const extras = buildExtras(ctx).map((part) => part.text);
    const allParts = core ? [...front, core, ...extras] : [...front, ...extras];
    if (allParts.length === 0)
        return null;
    return allParts.join(sep);
}
export function renderProjectLine(ctx) {
    const projectStyle = ctx.config?.display?.projectStyle ?? 'pipes';
    return projectStyle === 'natural'
        ? renderNaturalProjectLine(ctx)
        : renderPipesProjectLine(ctx);
}
function formatAheadCount(ahead, gitConfig, colors) {
    const value = `↑${ahead}`;
    const criticalThreshold = gitConfig?.pushCriticalThreshold ?? 0;
    const warningThreshold = gitConfig?.pushWarningThreshold ?? 0;
    if (criticalThreshold > 0 && ahead >= criticalThreshold)
        return criticalColor(value, colors);
    if (warningThreshold > 0 && ahead >= warningThreshold)
        return warningColor(value, colors);
    return gitBranchColor(value, colors);
}
function formatLineDiffParts(lineDiff) {
    const parts = [];
    if (lineDiff.added > 0)
        parts.push(green(`+${lineDiff.added}`));
    if (lineDiff.deleted > 0)
        parts.push(red(`-${lineDiff.deleted}`));
    return parts;
}
export function renderGitFilesLine(ctx, terminalWidth = null) {
    const gitConfig = ctx.config?.gitStatus;
    // showFileList is our explicit toggle (fork 0.1.2+). Fall back to upstream's
    // showFileStats when showFileList is not set, so upstream tests/defaults
    // still render the bottom file list.
    const fileListEnabled = gitConfig?.showFileList ?? gitConfig?.showFileStats ?? false;
    if (!fileListEnabled)
        return null;
    if (!ctx.gitStatus?.fileStats)
        return null;
    const { trackedFiles, untracked } = ctx.gitStatus.fileStats;
    if (trackedFiles.length === 0 && untracked === 0)
        return null;
    if (terminalWidth !== null && terminalWidth < 60)
        return null;
    const cwd = ctx.stdin.cwd;
    const sorted = [...trackedFiles].sort((a, b) => {
        try {
            const aPath = cwd ? resolvePathWithinCwd(cwd, a.fullPath) : null;
            const bPath = cwd ? resolvePathWithinCwd(cwd, b.fullPath) : null;
            const aMtime = aPath ? fs.statSync(aPath).mtimeMs : 0;
            const bMtime = bPath ? fs.statSync(bPath).mtimeMs : 0;
            return bMtime - aMtime;
        }
        catch {
            return 0;
        }
    });
    const shown = sorted.slice(0, 6);
    const overflow = sorted.length - shown.length;
    const statParts = [];
    for (const trackedFile of shown) {
        const prefix = trackedFile.type === 'added' ? green('+') : trackedFile.type === 'deleted' ? red('-') : yellow('~');
        const safeBasename = sanitizeDisplayText(trackedFile.basename);
        const coloredName = trackedFile.type === 'added'
            ? green(safeBasename)
            : trackedFile.type === 'deleted'
                ? red(safeBasename)
                : yellow(safeBasename);
        const resolvedPath = cwd ? resolvePathWithinCwd(cwd, trackedFile.fullPath) : null;
        const linkedName = resolvedPath ? safeHyperlink(getFileHref(resolvedPath), coloredName) : coloredName;
        let entry = `${prefix}${linkedName}`;
        if (trackedFile.lineDiff) {
            const diffParts = [];
            if (trackedFile.lineDiff.added > 0)
                diffParts.push(green(`+${trackedFile.lineDiff.added}`));
            if (trackedFile.lineDiff.deleted > 0)
                diffParts.push(red(`-${trackedFile.lineDiff.deleted}`));
            if (diffParts.length > 0)
                entry += dim(`(${diffParts.join(' ')})`);
        }
        statParts.push(entry);
    }
    if (overflow > 0)
        statParts.push(dim(`+${overflow} more`));
    if (untracked > 0)
        statParts.push(dim(`?${untracked}`));
    return statParts.join('  ');
}
//# sourceMappingURL=project.js.map