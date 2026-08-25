import type { RenderContext } from "../../types.js";
import { isLimitReached } from "../../types.js";
import type { MessageKey } from "../../i18n/types.js";
import { shouldHideUsage } from "../../stdin.js";
import { critical, label, getQuotaColor, quotaBar, RESET } from "../colors.js";
import { getAdaptiveBarWidth } from "../../utils/terminal.js";
import { t } from "../../i18n/index.js";
import {
  progressLabel,
  type ProgressLabelInput,
} from "./label-align.js";
import type { TimeFormatMode, UsageValueMode } from "../../config.js";
import { formatResetTime, type WallClockOptions } from "../format-reset-time.js";

const FIVE_HOUR_WINDOW_MS = 5 * 60 * 60 * 1000;
const SEVEN_DAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function renderUsageLine(
  ctx: RenderContext,
  labelOptions: ProgressLabelInput = {},
): string | null {
  const display = ctx.config?.display;
  const colors = ctx.config?.colors;

  if (display?.showUsage === false) {
    return null;
  }

  if (!ctx.usageData) {
    return null;
  }

  if (shouldHideUsage(ctx.stdin)) {
    return null;
  }

  const usageLabel = progressLabel("label.usage", colors, labelOptions);
  const balanceLabel = ctx.usageData.balanceLabel ?? null;
  const scopedWindows = ctx.usageData.scopedWindows ?? [];
  const hasWindowData = ctx.usageData.fiveHour !== null
    || ctx.usageData.sevenDay !== null
    || scopedWindows.length > 0;

  if (balanceLabel && !hasWindowData) {
    return `${usageLabel} ${balanceLabel}`;
  }

  const timeFormat = normalizeTimeFormat(display?.timeFormat);
  const wallClockOpts: WallClockOptions = {
    hourCycle: display?.hourCycle ?? 'auto',
    showSeconds: display?.showClockSeconds ?? false,
  };
  const showResetLabel = display?.showResetLabel ?? true;
  const resetsKey = limitResetTimeFormat(timeFormat) === 'absolute' ? "format.resets" : "format.resetsIn";
  const usageCompact = display?.usageCompact ?? false;
  const usageValueMode = display?.usageValue ?? 'percent';
  const barWidthForScoped = getAdaptiveBarWidth();
  const scopedSuffix = scopedWindows.length
    ? ' | ' + scopedWindows
        .map((w) =>
          usageCompact
            ? formatCompactWindowPart(w.label, w.percent, w.resetAt, SEVEN_DAY_WINDOW_MS, timeFormat, colors, usageValueMode, wallClockOpts)
            : formatUsageWindowPart({
                label: w.label,
                percent: w.percent,
                resetAt: w.resetAt,
                windowMs: SEVEN_DAY_WINDOW_MS,
                colors,
                usageBarEnabled: display?.usageBarEnabled ?? true,
                barWidth: barWidthForScoped,
                barStyle: display?.barStyle,
                timeFormat,
                showResetLabel,
                forceLabel: true,
                labelOptions,
                usageValueMode,
                wallClockOpts,
              }),
        )
        .join(' | ')
    : '';

  if (isLimitReached(ctx.usageData)) {
    const limitTimeFormat = limitResetTimeFormat(timeFormat);
    const resetTime =
      ctx.usageData.fiveHour === 100
        ? formatResetTime(ctx.usageData.fiveHourResetAt, limitTimeFormat, wallClockOpts)
        : formatResetTime(ctx.usageData.sevenDayResetAt, limitTimeFormat, wallClockOpts);
    if (usageCompact) {
      return appendBalance(`${critical(`⚠ Limit${resetTime ? ` (${resetTime})` : ""}`, colors)}${scopedSuffix}`, balanceLabel);
    }
    const resetSuffix = resetTime
      ? showResetLabel
        ? ` (${t(resetsKey)} ${resetTime})`
        : ` (${resetTime})`
      : "";
    return appendBalance(`${usageLabel} ${critical(`⚠ ${t("status.limitReached")}${resetSuffix}`, colors)}${scopedSuffix}`, balanceLabel);
  }

  const threshold = display?.usageThreshold ?? 0;
  const fiveHour = ctx.usageData.fiveHour;
  const sevenDay = ctx.usageData.sevenDay;

  const effectiveUsage = Math.max(
    fiveHour ?? 0,
    sevenDay ?? 0,
    ...scopedWindows.map((window) => window.percent ?? 0),
  );
  if (effectiveUsage < threshold) {
    return balanceLabel ? `${usageLabel} ${balanceLabel}` : null;
  }

  const sevenDayThreshold = display?.sevenDayThreshold ?? 80;

  if (usageCompact) {
    const fiveHourPart = fiveHour !== null
      ? formatCompactWindowPart("5h", fiveHour, ctx.usageData.fiveHourResetAt, FIVE_HOUR_WINDOW_MS, timeFormat, colors, usageValueMode, wallClockOpts)
      : null;
    const sevenDayPart = (sevenDay !== null && (fiveHour === null || sevenDay >= sevenDayThreshold))
      ? formatCompactWindowPart("7d", sevenDay, ctx.usageData.sevenDayResetAt, SEVEN_DAY_WINDOW_MS, timeFormat, colors, usageValueMode, wallClockOpts)
      : null;

    if (fiveHourPart && sevenDayPart) {
      return appendBalance(`${fiveHourPart} | ${sevenDayPart}${scopedSuffix}`, balanceLabel);
    }
    const compactLine = fiveHourPart ?? sevenDayPart;
    if (compactLine) {
      return appendBalance(`${compactLine}${scopedSuffix}`, balanceLabel);
    }
    return scopedSuffix ? appendBalance(scopedSuffix.slice(3), balanceLabel) : null;
  }

  const usageBarEnabled = display?.usageBarEnabled ?? true;
  const barWidth = getAdaptiveBarWidth();
  const barStyle = display?.barStyle;

  if (fiveHour === null && sevenDay === null) {
    return scopedSuffix
      ? appendBalance(`${usageLabel} ${scopedSuffix.slice(3)}`, balanceLabel)
      : balanceLabel
        ? `${usageLabel} ${balanceLabel}`
        : null;
  }

  if (fiveHour === null && sevenDay !== null) {
    const weeklyOnlyPart = formatUsageWindowPart({
      label: t("label.weekly"),
      labelKey: "label.weekly",
      percent: sevenDay,
      resetAt: ctx.usageData.sevenDayResetAt,
      windowMs: SEVEN_DAY_WINDOW_MS,
      colors,
      usageBarEnabled,
      barWidth,
      barStyle,
      timeFormat,
      showResetLabel,
      forceLabel: true,
      labelOptions,
      usageValueMode,
      wallClockOpts,
    });
    return appendBalance(`${usageLabel} ${weeklyOnlyPart}${scopedSuffix}`, balanceLabel);
  }

  const fiveHourPart = formatUsageWindowPart({
    label: "5h",
    percent: fiveHour,
    resetAt: ctx.usageData.fiveHourResetAt,
    windowMs: FIVE_HOUR_WINDOW_MS,
    colors,
    usageBarEnabled,
    barWidth,
    barStyle,
    timeFormat,
    showResetLabel,
    usageValueMode,
    wallClockOpts,
  });

  // Under `sevenDayLayout: 'line'` the weekly window is rendered by
  // renderWeeklyUsageLine instead, so it is left off here. The usage line stays
  // a single line either way — merge groups join elements into one row, so a
  // multi-line return would land mid-row and break the join.
  if (sevenDay !== null && sevenDay >= sevenDayThreshold && !weeklyOnSeparateLine(display)) {
    const sevenDayPart = formatUsageWindowPart({
      label: t("label.weekly"),
      labelKey: "label.weekly",
      percent: sevenDay,
      resetAt: ctx.usageData.sevenDayResetAt,
      windowMs: SEVEN_DAY_WINDOW_MS,
      colors,
      usageBarEnabled,
      barWidth,
      barStyle,
      timeFormat,
      showResetLabel,
      forceLabel: true,
      labelOptions,
      usageValueMode,
      wallClockOpts,
    });
    return appendBalance(`${usageLabel} ${fiveHourPart} | ${sevenDayPart}${scopedSuffix}`, balanceLabel);
  }

  return appendBalance(`${usageLabel} ${fiveHourPart}${scopedSuffix}`, balanceLabel);
}

/**
 * True when the weekly window should be split onto its own line. Compact usage
 * is deliberately excluded: its whole point is one terse row, and its `7d` part
 * carries no label to anchor a separate line.
 */
function weeklyOnSeparateLine(display: RenderContext['config']['display']): boolean {
  return (display?.sevenDayLayout ?? 'inline') === 'line'
    && (display?.usageCompact ?? false) === false;
}

/**
 * The weekly (7-day) window as a standalone line, for `sevenDayLayout: 'line'`.
 *
 * Returns null whenever the weekly window belongs on the usage line instead —
 * inline layout, compact usage, below `sevenDayThreshold`, no seven-day data, or
 * a session with no five-hour window at all (nothing to split away from).
 */
export function renderWeeklyUsageLine(
  ctx: RenderContext,
  labelOptions: ProgressLabelInput = {},
): string | null {
  const display = ctx.config?.display;
  const colors = ctx.config?.colors;

  if (display?.showUsage === false || !ctx.usageData || shouldHideUsage(ctx.stdin)) {
    return null;
  }

  if (!weeklyOnSeparateLine(display) || isLimitReached(ctx.usageData)) {
    return null;
  }

  const sevenDay = ctx.usageData.sevenDay;
  const fiveHour = ctx.usageData.fiveHour;
  if (sevenDay === null || fiveHour === null) {
    return null;
  }

  if (sevenDay < (display?.sevenDayThreshold ?? 80)) {
    return null;
  }

  // The usage line's own visibility gate. Without this the weekly line could
  // outlive the row it belongs under.
  const effectiveUsage = Math.max(
    fiveHour,
    sevenDay,
    ...(ctx.usageData.scopedWindows ?? []).map((window) => window.percent ?? 0),
  );
  if (effectiveUsage < (display?.usageThreshold ?? 0)) {
    return null;
  }

  return formatUsageWindowPart({
    label: t("label.weekly"),
    labelKey: "label.weekly",
    percent: sevenDay,
    resetAt: ctx.usageData.sevenDayResetAt,
    windowMs: SEVEN_DAY_WINDOW_MS,
    colors,
    usageBarEnabled: display?.usageBarEnabled ?? true,
    barWidth: getAdaptiveBarWidth(),
    barStyle: display?.barStyle,
    timeFormat: normalizeTimeFormat(display?.timeFormat),
    showResetLabel: display?.showResetLabel ?? true,
    forceLabel: true,
    labelOptions,
    usageValueMode: display?.usageValue ?? 'percent',
    wallClockOpts: {
      hourCycle: display?.hourCycle ?? 'auto',
      showSeconds: display?.showClockSeconds ?? false,
    },
  });
}

function appendBalance(line: string, balanceLabel: string | null): string {
  return balanceLabel ? `${line} | ${balanceLabel}` : line;
}

function formatCompactWindowPart(
  windowLabel: string,
  percent: number | null,
  resetAt: Date | null,
  windowMs: number,
  timeFormat: TimeFormatMode,
  colors?: RenderContext["config"]["colors"],
  usageValueMode: UsageValueMode = 'percent',
  wallClockOpts?: WallClockOptions,
): string {
  const usageDisplay = formatUsagePercent(percent, colors, usageValueMode);
  const reset = formatWindowTime(resetAt, windowMs, timeFormat, wallClockOpts);
  const styledLabel = label(`${windowLabel}:`, colors);
  return reset
    ? `${styledLabel} ${usageDisplay} ${label(`(${reset})`, colors)}`
    : `${styledLabel} ${usageDisplay}`;
}

function formatUsagePercent(
  percent: number | null,
  colors?: RenderContext["config"]["colors"],
  mode: UsageValueMode = 'percent',
): string {
  if (percent === null) {
    return label("--", colors);
  }
  const color = getQuotaColor(percent, colors);
  const displayPercent = mode === 'remaining' ? Math.max(0, 100 - percent) : percent;
  return `${color}${displayPercent}%${RESET}`;
}

function formatUsageWindowPart({
  label: windowLabel,
  labelKey,
  percent,
  resetAt,
  windowMs,
  colors,
  usageBarEnabled,
  barWidth,
  barStyle,
  timeFormat = 'relative',
  showResetLabel,
  forceLabel = false,
  labelOptions = {},
  usageValueMode = 'percent',
  wallClockOpts,
}: {
  label: string;
  labelKey?: MessageKey;
  percent: number | null;
  resetAt: Date | null;
  windowMs: number;
  colors?: RenderContext["config"]["colors"];
  usageBarEnabled: boolean;
  barWidth: number;
  barStyle?: 'block' | 'square' | 'thin' | 'vertical' | 'dots' | 'shade' | 'double';
  timeFormat?: TimeFormatMode;
  showResetLabel: boolean;
  forceLabel?: boolean;
  labelOptions?: ProgressLabelInput;
  usageValueMode?: UsageValueMode;
  wallClockOpts?: WallClockOptions;
}): string {
  const usageDisplay = formatUsagePercent(percent, colors, usageValueMode);
  const reset = formatWindowTime(resetAt, windowMs, timeFormat, wallClockOpts);
  const styledLabel = labelKey
    ? progressLabel(labelKey, colors, labelOptions)
    : label(windowLabel, colors);
  const showResetWording = timeFormat !== 'elapsed' && timeFormat !== 'elapsedAndAbsolute';
  const resetsKey = timeFormat === 'absolute' ? "format.resets" : "format.resetsIn";

  const resetSuffix = reset
    ? showResetLabel && showResetWording
      ? `(${t(resetsKey)} ${reset})`
      : `(${reset})`
    : "";

  if (usageBarEnabled) {
    const body = resetSuffix
      ? `${quotaBar(percent ?? 0, barWidth, colors, barStyle)} ${usageDisplay} ${resetSuffix}`
      : `${quotaBar(percent ?? 0, barWidth, colors, barStyle)} ${usageDisplay}`;
    return forceLabel ? `${styledLabel} ${body}` : body;
  }

  return resetSuffix
    ? `${styledLabel} ${usageDisplay} ${resetSuffix}`
    : `${styledLabel} ${usageDisplay}`;
}

function normalizeTimeFormat(value: unknown): TimeFormatMode {
  if (
    value === 'absolute'
    || value === 'both'
    || value === 'elapsed'
    || value === 'elapsedAndAbsolute'
  ) {
    return value;
  }

  return 'relative';
}

function limitResetTimeFormat(timeFormat: TimeFormatMode): 'relative' | 'absolute' | 'both' {
  if (timeFormat === 'elapsedAndAbsolute') {
    return 'absolute';
  }

  if (timeFormat === 'elapsed') {
    return 'relative';
  }

  return timeFormat;
}

function formatWindowTime(
  resetAt: Date | null,
  windowMs: number,
  timeFormat: TimeFormatMode,
  wallClockOpts?: WallClockOptions,
): string {
  if (timeFormat === 'elapsed') {
    return formatElapsedWindow(resetAt, windowMs);
  }

  if (timeFormat === 'elapsedAndAbsolute') {
    const elapsed = formatElapsedWindow(resetAt, windowMs);
    const absolute = formatResetTime(resetAt, 'absolute', wallClockOpts);
    if (elapsed && absolute) {
      return `${elapsed}, ${absolute}`;
    }
    return elapsed || absolute;
  }

  return formatResetTime(resetAt, timeFormat, wallClockOpts);
}

function formatElapsedWindow(resetAt: Date | null, windowMs: number): string {
  if (!resetAt) {
    return '';
  }

  const windowStart = resetAt.getTime() - windowMs;
  const rawElapsed = ((Date.now() - windowStart) / windowMs) * 100;
  const elapsed = Math.max(0, Math.min(100, Math.round(rawElapsed)));
  return `${elapsed}% elapsed`;
}
