import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RenderContext } from '../../types.js';
import { getModelName, formatModelName, getProviderLabel } from '../../stdin.js';
import { getOutputSpeed } from '../../speed-tracker.js';
import { git as gitColor, gitBranch as gitBranchColor, warning as warningColor, critical as criticalColor, label, model as modelColor, project as projectColor, red, green, yellow, dim, custom as customColor, thinking as thinkingColor, duration as durationColor } from '../colors.js';
import { t } from '../../i18n/index.js';
import { renderCostEstimate } from './cost.js';

function formatCompactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return `${n}`;
}

function formatLastRequestTokens(
  usage: NonNullable<import('../../types.js').TranscriptData['lastRequestTokenUsage']>
): string {
  const input = formatCompactCount(usage.inputTokens);
  const output = formatCompactCount(usage.outputTokens);
  const base = `last: ${input}→${output}`;
  if (usage.reasoningTokens && usage.reasoningTokens > 0) {
    return `${base} (+${formatCompactCount(usage.reasoningTokens)})`;
  }
  return base;
}

function hyperlink(uri: string, text: string): string {
  const esc = '\x1b';
  const st = '\\';
  return `${esc}]8;;${uri}${esc}${st}${text}${esc}]8;;${esc}${st}`;
}

function getProjectPath(cwd: string | undefined, pathLevels: number): string | null {
  if (!cwd) return null;
  const segments = cwd.split(/[/\\]/).filter(Boolean);
  return segments.length > 0 ? segments.slice(-pathLevels).join('/') : '/';
}

function buildExtras(ctx: RenderContext): string[] {
  const display = ctx.config?.display;
  const colors = ctx.config?.colors;
  const extras: string[] = [];

  if (display?.showSessionName && ctx.transcript.sessionName) {
    extras.push(label(ctx.transcript.sessionName, colors));
  }

  if (display?.showClaudeCodeVersion && ctx.claudeCodeVersion) {
    extras.push(label(`CC v${ctx.claudeCodeVersion}`, colors));
  }

  if (ctx.extraLabel) {
    extras.push(label(ctx.extraLabel, colors));
  }

  if (display?.showSpeed) {
    const speed = getOutputSpeed(ctx.stdin);
    if (speed !== null) {
      extras.push(label(`${t('format.out')}: ${speed.toFixed(1)} ${t('format.tokPerSec')}`, colors));
    }
  }

  if (display?.showDuration !== false && ctx.sessionDuration) {
    const durationGlyph = display?.durationGlyph ?? '';
    const durationText = durationGlyph ? `${durationGlyph} ${ctx.sessionDuration}` : ctx.sessionDuration;
    extras.push(durationColor(durationText, colors));
  }

  const costEstimate = renderCostEstimate(ctx);
  if (costEstimate) {
    extras.push(costEstimate);
  }

  if ((display?.showThinkingIndicator ?? true) && ctx.transcript.thinkingState?.active) {
    extras.push(thinkingColor('∿ thinking', colors));
  }

  if ((display?.showPendingPermission ?? true) && ctx.transcript.pendingPermission) {
    const { targetSummary, timestamp } = ctx.transcript.pendingPermission;
    const waitingSecs = Math.max(0, Math.round((Date.now() - timestamp.getTime()) / 1000));
    extras.push(yellow(`? ${targetSummary} ${dim(`(waiting ${waitingSecs}s)`)}`));
  }

  if ((display?.showLastRequestTokens ?? false) && ctx.transcript.lastRequestTokenUsage) {
    extras.push(dim(formatLastRequestTokens(ctx.transcript.lastRequestTokenUsage)));
  }

  if (display?.customLine) {
    extras.push(customColor(display.customLine, colors));
  }

  return extras;
}

function renderPipesProjectLine(ctx: RenderContext): string | null {
  const display = ctx.config?.display;
  const colors = ctx.config?.colors;
  const parts: string[] = [];

  if (display?.showModel !== false) {
    const model = formatModelName(getModelName(ctx.stdin), display?.modelFormat, display?.modelOverride);
    const providerLabel = getProviderLabel(ctx.stdin);
    const modelDisplay = providerLabel ? `${model} | ${providerLabel}` : model;
    parts.push(modelColor(`[${modelDisplay}]`, colors));
  }

  let projectPart: string | null = null;
  if (display?.showProject !== false && ctx.stdin.cwd) {
    const projectPath = getProjectPath(ctx.stdin.cwd, ctx.config?.pathLevels ?? 1);
    if (projectPath) {
      projectPart = hyperlink(`file://${ctx.stdin.cwd}`, projectColor(projectPath, colors));
    }
  }

  let gitPart = '';
  const gitConfig = ctx.config?.gitStatus;
  const showGit = gitConfig?.enabled ?? true;

  if (showGit && ctx.gitStatus) {
    const branchText = ctx.gitStatus.branch + ((gitConfig?.showDirty ?? true) && ctx.gitStatus.isDirty ? '*' : '');
    const coloredBranch = gitBranchColor(branchText, colors);
    const linkedBranch = ctx.gitStatus.branchUrl ? hyperlink(ctx.gitStatus.branchUrl, coloredBranch) : coloredBranch;
    const gitInner: string[] = [linkedBranch];

    if (gitConfig?.showAheadBehind) {
      if (ctx.gitStatus.ahead > 0) gitInner.push(formatAheadCount(ctx.gitStatus.ahead, gitConfig, colors));
      if (ctx.gitStatus.behind > 0) gitInner.push(gitBranchColor(`↓${ctx.gitStatus.behind}`, colors));
    }

    if (gitConfig?.showFileStats && ctx.gitStatus.lineDiff) {
      const diffParts = formatLineDiffParts(ctx.gitStatus.lineDiff);
      if (diffParts.length > 0) gitInner.push(`[${diffParts.join(' ')}]`);
    }

    gitPart = `${gitColor('git:(', colors)}${gitInner.join(' ')}${gitColor(')', colors)}`;
  }

  if (projectPart && gitPart) parts.push(`${projectPart} ${gitPart}`);
  else if (projectPart) parts.push(projectPart);
  else if (gitPart) parts.push(gitPart);

  parts.push(...buildExtras(ctx));

  if (parts.length === 0) return null;
  return parts.join(' \u2502 ');
}

function renderNaturalProjectLine(ctx: RenderContext): string | null {
  const display = ctx.config?.display;
  const colors = ctx.config?.colors;
  const sep = display?.naturalSeparator || ' \u00B7 ';
  const coreSegments: string[] = [];

  if (display?.showModel !== false) {
    const model = formatModelName(getModelName(ctx.stdin), display?.modelFormat, display?.modelOverride);
    const providerLabel = getProviderLabel(ctx.stdin);
    const modelText = providerLabel ? `${model} (${providerLabel})` : model;
    const glyph = display?.modelGlyph ?? '';
    const modelPart = glyph ? `${glyph} ${modelText}` : modelText;
    coreSegments.push(modelColor(modelPart, colors));
  }

  if (display?.showProject !== false && ctx.stdin.cwd) {
    const projectPath = getProjectPath(ctx.stdin.cwd, ctx.config?.pathLevels ?? 1);
    if (projectPath) {
      const linked = hyperlink(`file://${ctx.stdin.cwd}`, projectColor(projectPath, colors));
      const projectGlyph = display?.projectGlyph ?? '';
      const projectGlyphPart = projectGlyph ? `${projectColor(projectGlyph, colors)} ` : '';
      coreSegments.push(`${dim('in')} ${projectGlyphPart}${linked}`);
    }
  }

  const gitConfig = ctx.config?.gitStatus;
  const showGit = gitConfig?.enabled ?? true;

  if (showGit && ctx.gitStatus) {
    const branchText = ctx.gitStatus.branch + ((gitConfig?.showDirty ?? true) && ctx.gitStatus.isDirty ? '*' : '');
    const coloredBranch = gitBranchColor(branchText, colors);
    const linkedBranch = ctx.gitStatus.branchUrl ? hyperlink(ctx.gitStatus.branchUrl, coloredBranch) : coloredBranch;
    const branchGlyph = display?.branchGlyph ?? '';
    const branchGlyphPart = branchGlyph ? `${gitBranchColor(branchGlyph, colors)} ` : '';
    const gitTokens: string[] = [`${dim('on')} ${branchGlyphPart}${linkedBranch}`];

    if (gitConfig?.showAheadBehind) {
      if (ctx.gitStatus.ahead > 0) gitTokens.push(formatAheadCount(ctx.gitStatus.ahead, gitConfig, colors));
      if (ctx.gitStatus.behind > 0) gitTokens.push(gitBranchColor(`↓${ctx.gitStatus.behind}`, colors));
    }

    if (gitConfig?.showFileStats && ctx.gitStatus.lineDiff) {
      const diffParts = formatLineDiffParts(ctx.gitStatus.lineDiff);
      if (diffParts.length > 0) gitTokens.push(`${dim('with')} ${diffParts.join(' ')} ${dim('changes')}`);
    }

    coreSegments.push(gitTokens.join(' '));
  }

  const core = coreSegments.join(' ');
  const extras = buildExtras(ctx);
  const allParts = core ? [core, ...extras] : extras;

  if (allParts.length === 0) return null;
  return allParts.join(sep);
}

export function renderProjectLine(ctx: RenderContext): string | null {
  const projectStyle = ctx.config?.display?.projectStyle ?? 'pipes';
  return projectStyle === 'natural'
    ? renderNaturalProjectLine(ctx)
    : renderPipesProjectLine(ctx);
}

function formatAheadCount(
  ahead: number,
  gitConfig: RenderContext['config']['gitStatus'] | undefined,
  colors: RenderContext['config']['colors'] | undefined,
): string {
  const value = `↑${ahead}`;
  const criticalThreshold = gitConfig?.pushCriticalThreshold ?? 0;
  const warningThreshold = gitConfig?.pushWarningThreshold ?? 0;

  if (criticalThreshold > 0 && ahead >= criticalThreshold) return criticalColor(value, colors);
  if (warningThreshold > 0 && ahead >= warningThreshold) return warningColor(value, colors);
  return gitBranchColor(value, colors);
}

function formatLineDiffParts(lineDiff: { added: number; deleted: number }): string[] {
  const parts: string[] = [];
  if (lineDiff.added > 0) parts.push(green(`+${lineDiff.added}`));
  if (lineDiff.deleted > 0) parts.push(red(`-${lineDiff.deleted}`));
  return parts;
}

export function renderGitFilesLine(ctx: RenderContext, terminalWidth: number | null = null): string | null {
  const gitConfig = ctx.config?.gitStatus;
  if (!(gitConfig?.showFileList ?? false)) return null;
  if (!ctx.gitStatus?.fileStats) return null;

  const { trackedFiles, untracked } = ctx.gitStatus.fileStats;
  if (trackedFiles.length === 0 && untracked === 0) return null;
  if (terminalWidth !== null && terminalWidth < 60) return null;

  const cwd = ctx.stdin.cwd;
  const sorted = [...trackedFiles].sort((a, b) => {
    try {
      const aMtime = cwd ? fs.statSync(path.join(cwd, a.fullPath)).mtimeMs : 0;
      const bMtime = cwd ? fs.statSync(path.join(cwd, b.fullPath)).mtimeMs : 0;
      return bMtime - aMtime;
    } catch {
      return 0;
    }
  });

  const shown = sorted.slice(0, 6);
  const overflow = sorted.length - shown.length;
  const statParts: string[] = [];

  for (const trackedFile of shown) {
    const prefix = trackedFile.type === 'added' ? green('+') : trackedFile.type === 'deleted' ? red('-') : yellow('~');
    const coloredName = trackedFile.type === 'added'
      ? green(trackedFile.basename)
      : trackedFile.type === 'deleted'
        ? red(trackedFile.basename)
        : yellow(trackedFile.basename);
    const linkedName = cwd ? hyperlink(`file://${path.join(cwd, trackedFile.fullPath)}`, coloredName) : coloredName;
    let entry = `${prefix}${linkedName}`;

    if (trackedFile.lineDiff) {
      const diffParts: string[] = [];
      if (trackedFile.lineDiff.added > 0) diffParts.push(green(`+${trackedFile.lineDiff.added}`));
      if (trackedFile.lineDiff.deleted > 0) diffParts.push(red(`-${trackedFile.lineDiff.deleted}`));
      if (diffParts.length > 0) entry += dim(`(${diffParts.join(' ')})`);
    }

    statParts.push(entry);
  }

  if (overflow > 0) statParts.push(dim(`+${overflow} more`));
  if (untracked > 0) statParts.push(dim(`?${untracked}`));

  return statParts.join('  ');
}
