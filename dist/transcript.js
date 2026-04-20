import * as fs from 'fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'readline';
import { createHash } from 'node:crypto';
import { getHudPluginDir } from './claude-config-dir.js';
const TRANSCRIPT_CACHE_VERSION = 2;
// 4MB tail window: enough to catch the most recent ~80–130 agent calls and
// tool results while bounding I/O. Ported from omc-hud. Files smaller than
// this threshold are still fully streamed.
const MAX_TAIL_BYTES = 4 * 1024 * 1024;
// Tools known to require permission approval in Claude Code.
const PERMISSION_TOOLS = new Set(['Edit', 'Write', 'Bash']);
// Pending permission is shown for every tool_use that hasn't received a
// matching tool_result yet — the HUD can't observe the approval prompt
// directly, so we simply mirror "tool call is open" until Claude lands a
// result (approval or denial both cause a tool_result to arrive). The
// render layer adds a `(waiting Ns)` suffix so the user can tell whether
// the open call is a fresh prompt or a long-running approved tool.
// Content block `type` values that indicate extended-thinking activity.
const THINKING_PART_TYPES = new Set(['thinking', 'reasoning']);
// How long after the last thinking block we still consider thinking "active".
const THINKING_RECENCY_MS = 30_000;
// Hard wall-clock cap for a pending-permission indicator. Real approval
// prompts resolve in seconds. Anything older than this is stuck — usually
// because the user interrupted the chat and the tool_use never got a
// matching tool_result.
const PENDING_PERMISSION_MAX_AGE_MS = 5 * 60 * 1000;
// In-transcript grace window: if the latest entry is this much newer than a
// pending tool_use (and no matching tool_result arrived in between), treat
// the tool_use as abandoned and drop the indicator.
const PENDING_PERMISSION_INTERRUPT_GRACE_MS = 30 * 1000;
let createReadStreamImpl = fs.createReadStream;
function normalizeTokenCount(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.trunc(value));
}
function normalizeSessionTokens(tokens) {
    if (!tokens || typeof tokens !== 'object') {
        return undefined;
    }
    const raw = tokens;
    return {
        inputTokens: normalizeTokenCount(raw.inputTokens),
        outputTokens: normalizeTokenCount(raw.outputTokens),
        cacheCreationTokens: normalizeTokenCount(raw.cacheCreationTokens),
        cacheReadTokens: normalizeTokenCount(raw.cacheReadTokens),
    };
}
function getTranscriptCachePath(transcriptPath, homeDir) {
    const hash = createHash('sha256').update(path.resolve(transcriptPath)).digest('hex');
    return path.join(getHudPluginDir(homeDir), 'transcript-cache', `${hash}.json`);
}
function readTranscriptFileState(transcriptPath) {
    try {
        const stat = fs.statSync(transcriptPath);
        if (!stat.isFile()) {
            return null;
        }
        return {
            mtimeMs: stat.mtimeMs,
            size: stat.size,
        };
    }
    catch {
        return null;
    }
}
// Read the last `maxBytes` of a file and split into lines. Discards the first
// line if we started mid-file (handles partial lines and UTF-8 boundary splits).
function readTailLines(filePath, fileSize, maxBytes) {
    const startOffset = Math.max(0, fileSize - maxBytes);
    const bytesToRead = fileSize - startOffset;
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(bytesToRead);
    try {
        fs.readSync(fd, buffer, 0, bytesToRead, startOffset);
    }
    finally {
        fs.closeSync(fd);
    }
    const lines = buffer.toString('utf8').split('\n');
    // Drop the first line when we started mid-file — it may be a partial JSONL
    // entry or a UTF-8 multibyte split.
    if (startOffset > 0 && lines.length > 0) {
        lines.shift();
    }
    return lines;
}
function serializeTranscriptData(data) {
    return {
        tools: data.tools.map((tool) => ({
            ...tool,
            startTime: tool.startTime.toISOString(),
            endTime: tool.endTime?.toISOString(),
        })),
        agents: data.agents.map((agent) => ({
            ...agent,
            startTime: agent.startTime.toISOString(),
            endTime: agent.endTime?.toISOString(),
        })),
        todos: data.todos.map((todo) => ({ ...todo })),
        sessionStart: data.sessionStart?.toISOString(),
        sessionName: data.sessionName,
        lastAssistantResponseAt: data.lastAssistantResponseAt?.toISOString(),
        sessionTokens: data.sessionTokens,
        thinkingState: data.thinkingState
            ? { active: data.thinkingState.active, lastSeen: data.thinkingState.lastSeen.toISOString() }
            : undefined,
        pendingPermission: data.pendingPermission
            ? {
                toolName: data.pendingPermission.toolName,
                targetSummary: data.pendingPermission.targetSummary,
                timestamp: data.pendingPermission.timestamp.toISOString(),
            }
            : undefined,
    };
}
function deserializeTranscriptData(data) {
    return {
        tools: data.tools.map((tool) => ({
            ...tool,
            startTime: new Date(tool.startTime),
            endTime: tool.endTime ? new Date(tool.endTime) : undefined,
        })),
        agents: data.agents.map((agent) => ({
            ...agent,
            startTime: new Date(agent.startTime),
            endTime: agent.endTime ? new Date(agent.endTime) : undefined,
        })),
        todos: data.todos.map((todo) => ({ ...todo })),
        sessionStart: data.sessionStart ? new Date(data.sessionStart) : undefined,
        sessionName: data.sessionName,
        lastAssistantResponseAt: data.lastAssistantResponseAt ? new Date(data.lastAssistantResponseAt) : undefined,
        sessionTokens: normalizeSessionTokens(data.sessionTokens),
        thinkingState: data.thinkingState
            ? { active: data.thinkingState.active, lastSeen: new Date(data.thinkingState.lastSeen) }
            : undefined,
        pendingPermission: data.pendingPermission
            ? {
                toolName: data.pendingPermission.toolName,
                targetSummary: data.pendingPermission.targetSummary,
                timestamp: new Date(data.pendingPermission.timestamp),
            }
            : undefined,
    };
}
function readTranscriptCache(transcriptPath, state) {
    try {
        const cachePath = getTranscriptCachePath(transcriptPath, os.homedir());
        const raw = fs.readFileSync(cachePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.version !== TRANSCRIPT_CACHE_VERSION
            || !parsed.data
            || !parsed.transcriptPath
            || parsed.transcriptPath !== path.resolve(transcriptPath)
            || parsed.transcriptState?.mtimeMs !== state.mtimeMs
            || parsed.transcriptState?.size !== state.size) {
            return null;
        }
        return deserializeTranscriptData(parsed.data);
    }
    catch {
        return null;
    }
}
function writeTranscriptCache(transcriptPath, state, data) {
    try {
        const cachePath = getTranscriptCachePath(transcriptPath, os.homedir());
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        const payload = {
            version: TRANSCRIPT_CACHE_VERSION,
            transcriptPath: path.resolve(transcriptPath),
            transcriptState: state,
            data: serializeTranscriptData(data),
        };
        fs.writeFileSync(cachePath, JSON.stringify(payload), 'utf8');
    }
    catch {
        // Cache failures are non-fatal; fall back to fresh parsing next time.
    }
}
/**
 * Recompute time-decay fields on every call so cache hits don't return stale
 * `active` / `pendingPermission` values. Called on both the cache-hit and the
 * fresh-parse return paths.
 */
function finalizeTranscriptResult(result) {
    const now = Date.now();
    let thinkingState = result.thinkingState;
    if (thinkingState) {
        const age = now - thinkingState.lastSeen.getTime();
        thinkingState = { ...thinkingState, active: age <= THINKING_RECENCY_MS };
    }
    // pendingPermission normally clears when the matching tool_result appends
    // to the transcript. If the user interrupted mid-prompt, no tool_result
    // ever arrives — so apply a wall-clock cap here to clear stuck indicators
    // even on pure cache-hit reads where we don't see a fresh user entry.
    let pendingPermission = result.pendingPermission;
    if (pendingPermission) {
        const age = now - pendingPermission.timestamp.getTime();
        if (age > PENDING_PERMISSION_MAX_AGE_MS) {
            pendingPermission = undefined;
        }
    }
    return { ...result, thinkingState, pendingPermission };
}
export async function parseTranscript(transcriptPath) {
    const result = {
        tools: [],
        agents: [],
        todos: [],
    };
    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
        return result;
    }
    const transcriptState = readTranscriptFileState(transcriptPath);
    if (!transcriptState) {
        return result;
    }
    const cached = readTranscriptCache(transcriptPath, transcriptState);
    if (cached) {
        return finalizeTranscriptResult(cached);
    }
    const toolMap = new Map();
    const agentMap = new Map();
    // Maps background-agent id (e.g. "a8de3dd") → tool_use_id, so a later
    // `<task-notification>` completion without a tool_use_id can still resolve.
    const backgroundAgentMap = new Map();
    // tool_use_id → {toolName, target, timestamp} for permission-requiring tools
    // that haven't received a tool_result yet. Entries drop when the result
    // arrives; surfaced on the result when the youngest entry is <3s old.
    const pendingPermissionMap = new Map();
    let latestTodos = [];
    const taskIdToIndex = new Map();
    let latestSlug;
    let customTitle;
    const sessionTokens = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
    };
    let parsedCleanly = false;
    // Tail-read only covers the last 4MB, so token accumulation and session
    // start would be partial. Flag so we can skip writing those to the result.
    const usedTailRead = transcriptState.size > MAX_TAIL_BYTES;
    // Track the freshest entry timestamp seen so the pending-permission
    // picker can detect interruptions (entries after a pending tool_use).
    let latestEntryTimestamp;
    const handleLine = (line) => {
        if (!line.trim())
            return;
        try {
            const entry = JSON.parse(line);
            if (typeof entry.timestamp === 'string') {
                const ts = new Date(entry.timestamp);
                if (!Number.isNaN(ts.getTime())
                    && (!latestEntryTimestamp || ts.getTime() > latestEntryTimestamp.getTime())) {
                    latestEntryTimestamp = ts;
                }
            }
            if (entry.type === 'custom-title' && typeof entry.customTitle === 'string') {
                customTitle = entry.customTitle;
            }
            else if (typeof entry.slug === 'string') {
                latestSlug = entry.slug;
            }
            if (entry.type === 'assistant') {
                if (typeof entry.timestamp === 'string') {
                    const ts = new Date(entry.timestamp);
                    if (!Number.isNaN(ts.getTime())
                        && (!result.lastAssistantResponseAt || ts.getTime() > result.lastAssistantResponseAt.getTime())) {
                        result.lastAssistantResponseAt = ts;
                    }
                }
                if (entry.message?.usage) {
                    const usage = entry.message.usage;
                    sessionTokens.inputTokens += normalizeTokenCount(usage.input_tokens);
                    sessionTokens.outputTokens += normalizeTokenCount(usage.output_tokens);
                    sessionTokens.cacheCreationTokens += normalizeTokenCount(usage.cache_creation_input_tokens);
                    sessionTokens.cacheReadTokens += normalizeTokenCount(usage.cache_read_input_tokens);
                    const lastUsage = extractLastRequestTokenUsage(usage);
                    if (lastUsage) {
                        result.lastRequestTokenUsage = lastUsage;
                    }
                }
            }
            processEntry(entry, toolMap, agentMap, taskIdToIndex, latestTodos, result, backgroundAgentMap, pendingPermissionMap);
        }
        catch {
            // Skip malformed lines
        }
    };
    try {
        if (usedTailRead) {
            for (const line of readTailLines(transcriptPath, transcriptState.size, MAX_TAIL_BYTES)) {
                handleLine(line);
            }
        }
        else {
            const fileStream = createReadStreamImpl(transcriptPath);
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity,
            });
            for await (const line of rl) {
                handleLine(line);
            }
        }
        parsedCleanly = true;
    }
    catch {
        // Return partial results on error
    }
    result.tools = Array.from(toolMap.values()).slice(-20);
    result.agents = Array.from(agentMap.values()).slice(-10);
    result.todos = latestTodos;
    result.sessionName = customTitle ?? latestSlug;
    // Tail-read totals cover only the last 4MB so they'd be misleadingly low;
    // the same goes for sessionStart, which would be the first in-tail entry
    // rather than the true session origin.
    if (usedTailRead) {
        result.sessionStart = undefined;
        result.sessionTokens = undefined;
    }
    else {
        result.sessionTokens = sessionTokens;
    }
    // Surface the YOUNGEST still-open permission entry — that's the most
    // recent thing Claude is waiting on. Insertion order is chronological, so
    // the last entry in the map is the freshest. The entry carries its raw
    // timestamp; the render layer computes `(waiting Ns)` at display time.
    //
    // Interrupt detection: if the latest transcript entry is notably newer
    // than a pending tool_use and no matching tool_result arrived between
    // them, the user interrupted — drop the permission. Also apply a wall-
    // clock cap so stale sessions don't show hour-old "waiting" indicators.
    const nowMs = Date.now();
    const interruptCutoff = latestEntryTimestamp
        ? latestEntryTimestamp.getTime() - PENDING_PERMISSION_INTERRUPT_GRACE_MS
        : -Infinity;
    const wallClockCutoff = nowMs - PENDING_PERMISSION_MAX_AGE_MS;
    const cutoff = Math.max(interruptCutoff, wallClockCutoff);
    let youngest;
    for (const permission of pendingPermissionMap.values()) {
        if (permission.timestamp.getTime() < cutoff)
            continue;
        if (!youngest || permission.timestamp.getTime() > youngest.timestamp.getTime()) {
            youngest = permission;
        }
    }
    if (youngest) {
        result.pendingPermission = youngest;
    }
    // Write raw result (with lastSeen / timestamp intact) before finalization so
    // the cache stores the data needed for decay recomputation on every cache hit.
    if (parsedCleanly) {
        writeTranscriptCache(transcriptPath, transcriptState, result);
    }
    return finalizeTranscriptResult(result);
}
export function _setCreateReadStreamForTests(impl) {
    createReadStreamImpl = impl ?? fs.createReadStream;
}
function processEntry(entry, toolMap, agentMap, taskIdToIndex, latestTodos, result, backgroundAgentMap, pendingPermissionMap) {
    const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
    if (!result.sessionStart && entry.timestamp) {
        result.sessionStart = timestamp;
    }
    const content = entry.message?.content;
    // Claude Code emits background-agent completion as a user-role message with
    // string-shaped content: `<task-notification>...<tool-use-id>...</tool-use-id>
    // ...<status>completed</status>...</task-notification>`. Without this handling
    // background agents would stay "running" forever in the HUD.
    if (typeof content === 'string') {
        if (content.includes('<task-notification>') || content.includes('<task_id>') || content.includes('<task-id>')) {
            const notification = parseTaskNotification(content);
            if (notification && notification.status === 'completed') {
                const toolUseId = notification.toolUseId ?? backgroundAgentMap.get(notification.taskId);
                if (toolUseId) {
                    const agent = agentMap.get(toolUseId);
                    if (agent && agent.status === 'running') {
                        agent.status = 'completed';
                        agent.endTime = timestamp;
                    }
                }
            }
        }
        return;
    }
    if (!content || !Array.isArray(content))
        return;
    for (const block of content) {
        // Extended-thinking / reasoning blocks extend the active window.
        if (THINKING_PART_TYPES.has(block.type)) {
            result.thinkingState = { active: true, lastSeen: timestamp };
        }
        if (block.type === 'tool_use' && block.id && block.name) {
            // OMC routes tool calls through a proxy layer and emits names like
            // "proxy_Edit". Strip the prefix so downstream routing and the HUD
            // display treat them identically to the native tools.
            const canonicalName = block.name.replace(/^proxy_/, '');
            // Permission-requiring tools get tracked so the HUD can show an
            // "APPROVE?" hint while the user is looking at the prompt. Skip
            // when the entry has no real timestamp — we'd otherwise use Date.now()
            // and incorrectly treat every stale fixture entry as freshly pending.
            if (PERMISSION_TOOLS.has(canonicalName) && entry.timestamp) {
                pendingPermissionMap.set(block.id, {
                    toolName: canonicalName,
                    targetSummary: extractPermissionTarget(canonicalName, block.input) ?? '...',
                    timestamp,
                });
            }
            const toolEntry = {
                id: block.id,
                name: canonicalName,
                target: extractTarget(canonicalName, block.input),
                status: 'running',
                startTime: timestamp,
            };
            if (canonicalName === 'Task' || canonicalName === 'Agent') {
                const input = block.input;
                const rawType = typeof input?.subagent_type === 'string' ? input.subagent_type.trim() : '';
                const rawName = typeof input?.name === 'string' ? input.name.trim() : '';
                // The Agent tool defaults to the general-purpose agent when
                // subagent_type is omitted; fall back to the caller-supplied name
                // first since it's usually more descriptive (e.g. "build-validator").
                // Claude Code's newer `Agent` tool defaults to the general-purpose
                // subagent when subagent_type is omitted; upstream's older `Task` tool
                // falls back to the generic 'agent' label.
                const fallbackType = canonicalName === 'Agent'
                    ? 'general-purpose'
                    : canonicalName === 'Task'
                        ? 'agent'
                        : 'unknown';
                const agentEntry = {
                    id: block.id,
                    type: rawType || rawName || fallbackType,
                    model: input?.model ?? undefined,
                    description: input?.description ?? undefined,
                    status: 'running',
                    startTime: timestamp,
                };
                agentMap.set(block.id, agentEntry);
            }
            else if (canonicalName === 'TodoWrite') {
                const input = block.input;
                if (input?.todos && Array.isArray(input.todos)) {
                    // Build reverse map: content → taskIds from existing state
                    const contentToTaskIds = new Map();
                    for (const [taskId, idx] of taskIdToIndex) {
                        if (idx < latestTodos.length) {
                            const content = latestTodos[idx].content;
                            const ids = contentToTaskIds.get(content) ?? [];
                            ids.push(taskId);
                            contentToTaskIds.set(content, ids);
                        }
                    }
                    latestTodos.length = 0;
                    taskIdToIndex.clear();
                    latestTodos.push(...input.todos);
                    // Re-register taskId mappings for items whose content matches
                    for (let i = 0; i < latestTodos.length; i++) {
                        const ids = contentToTaskIds.get(latestTodos[i].content);
                        if (ids) {
                            for (const taskId of ids) {
                                taskIdToIndex.set(taskId, i);
                            }
                            contentToTaskIds.delete(latestTodos[i].content);
                        }
                    }
                }
            }
            else if (canonicalName === 'TaskCreate') {
                const input = block.input;
                const subject = typeof input?.subject === 'string' ? input.subject : '';
                const description = typeof input?.description === 'string' ? input.description : '';
                const content = subject || description || 'Untitled task';
                const status = normalizeTaskStatus(input?.status) ?? 'pending';
                latestTodos.push({ content, status });
                const rawTaskId = input?.taskId;
                const taskId = typeof rawTaskId === 'string' || typeof rawTaskId === 'number'
                    ? String(rawTaskId)
                    : block.id;
                if (taskId) {
                    taskIdToIndex.set(taskId, latestTodos.length - 1);
                }
            }
            else if (canonicalName === 'TaskUpdate') {
                const input = block.input;
                const index = resolveTaskIndex(input?.taskId, taskIdToIndex, latestTodos);
                if (index !== null) {
                    const status = normalizeTaskStatus(input?.status);
                    if (status) {
                        latestTodos[index].status = status;
                    }
                    const subject = typeof input?.subject === 'string' ? input.subject : '';
                    const description = typeof input?.description === 'string' ? input.description : '';
                    const content = subject || description;
                    if (content) {
                        latestTodos[index].content = content;
                    }
                }
            }
            else {
                toolMap.set(block.id, toolEntry);
            }
        }
        if (block.type === 'tool_result' && block.tool_use_id) {
            // Clear any pending permission entry — the approval was resolved.
            pendingPermissionMap.delete(block.tool_use_id);
            const tool = toolMap.get(block.tool_use_id);
            if (tool) {
                tool.status = block.is_error ? 'error' : 'completed';
                tool.endTime = timestamp;
            }
            const agent = agentMap.get(block.tool_use_id);
            if (agent) {
                // A run_in_background Agent completes asynchronously. Its initial
                // tool_result just says "Async agent launched successfully" — the
                // real completion arrives later as a `<task-notification>` block.
                // Require the text to START WITH the phrase so we don't misclassify
                // foreground results that happen to quote it.
                if (isAsyncLaunchResult(block.content)) {
                    const bgAgentId = extractBackgroundAgentId(block.content);
                    if (bgAgentId) {
                        backgroundAgentMap.set(bgAgentId, block.tool_use_id);
                    }
                    // Keep status as 'running' — real completion handled elsewhere.
                }
                else {
                    agent.status = 'completed';
                    agent.endTime = timestamp;
                }
            }
            // Foreground agent completion can also arrive as a TaskOutput tool_result
            // whose content contains a `<task-notification>` block.
            if (block.content) {
                const notification = parseTaskNotification(block.content);
                if (notification && notification.status === 'completed') {
                    const toolUseId = notification.toolUseId ?? backgroundAgentMap.get(notification.taskId);
                    if (toolUseId) {
                        const bg = agentMap.get(toolUseId);
                        if (bg && bg.status === 'running') {
                            bg.status = 'completed';
                            bg.endTime = timestamp;
                        }
                    }
                }
            }
        }
    }
}
function contentToText(content) {
    if (!content)
        return '';
    if (typeof content === 'string')
        return content;
    return content.find((c) => c.type === 'text')?.text ?? '';
}
const ASYNC_LAUNCH_PREFIX = 'Async agent launched';
function isAsyncLaunchResult(content) {
    const text = contentToText(content).trimStart();
    return text.startsWith(ASYNC_LAUNCH_PREFIX);
}
function extractBackgroundAgentId(content) {
    const text = contentToText(content);
    const match = text.match(/agentId:\s*([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}
function parseTaskNotification(content) {
    const text = contentToText(content);
    // Claude Code emits hyphen-cased tags; accept underscore variant defensively.
    const taskIdMatch = text.match(/<task-id>([^<]+)<\/task-id>/) ||
        text.match(/<task_id>([^<]+)<\/task_id>/);
    const statusMatch = text.match(/<status>([^<]+)<\/status>/);
    const toolUseIdMatch = text.match(/<tool-use-id>([^<]+)<\/tool-use-id>/) ||
        text.match(/<tool_use_id>([^<]+)<\/tool_use_id>/);
    if (!taskIdMatch || !statusMatch)
        return null;
    return {
        taskId: taskIdMatch[1],
        toolUseId: toolUseIdMatch ? toolUseIdMatch[1] : null,
        status: statusMatch[1],
    };
}
function extractLastRequestTokenUsage(usage) {
    const input = usage.input_tokens;
    const output = usage.output_tokens;
    if (typeof input !== 'number' && typeof output !== 'number')
        return null;
    const reasoning = usage.reasoning_tokens
        ?? usage.output_tokens_details?.reasoning_tokens
        ?? usage.output_tokens_details?.reasoningTokens
        ?? usage.completion_tokens_details?.reasoning_tokens
        ?? usage.completion_tokens_details?.reasoningTokens;
    const out = {
        inputTokens: normalizeTokenCount(input),
        outputTokens: normalizeTokenCount(output),
    };
    if (typeof reasoning === 'number' && reasoning > 0) {
        out.reasoningTokens = normalizeTokenCount(reasoning);
    }
    return out;
}
// Short, HUD-friendly label for permission prompts — "file.ts", "rm -rf ~", etc.
function extractPermissionTarget(toolName, input) {
    if (!input)
        return undefined;
    if (toolName === 'Edit' || toolName === 'Write') {
        const raw = input.file_path ?? input.path;
        if (!raw)
            return undefined;
        const segments = raw.replace(/\\/g, '/').split('/');
        return segments[segments.length - 1] || raw;
    }
    if (toolName === 'Bash') {
        const cmd = input.command;
        if (!cmd)
            return undefined;
        const trimmed = cmd.trim().slice(0, 20);
        return trimmed.length < cmd.trim().length ? `${trimmed}...` : trimmed;
    }
    return undefined;
}
function extractTarget(toolName, input) {
    if (!input)
        return undefined;
    switch (toolName) {
        case 'Read':
        case 'Write':
        case 'Edit':
            return input.file_path ?? input.path;
        case 'Glob':
            return input.pattern;
        case 'Grep':
            return input.pattern;
        case 'Bash':
            const cmd = input.command;
            return cmd?.slice(0, 30) + (cmd?.length > 30 ? '...' : '');
    }
    return undefined;
}
function resolveTaskIndex(taskId, taskIdToIndex, latestTodos) {
    if (typeof taskId === 'string' || typeof taskId === 'number') {
        const key = String(taskId);
        const mapped = taskIdToIndex.get(key);
        if (typeof mapped === 'number') {
            return mapped;
        }
        if (/^\d+$/.test(key)) {
            const numericIndex = Number.parseInt(key, 10) - 1;
            if (numericIndex >= 0 && numericIndex < latestTodos.length) {
                return numericIndex;
            }
        }
    }
    return null;
}
function normalizeTaskStatus(status) {
    if (typeof status !== 'string')
        return null;
    switch (status) {
        case 'pending':
        case 'not_started':
            return 'pending';
        case 'in_progress':
        case 'running':
            return 'in_progress';
        case 'completed':
        case 'complete':
        case 'done':
            return 'completed';
        default:
            return null;
    }
}
//# sourceMappingURL=transcript.js.map