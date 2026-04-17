import * as fs from 'fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'readline';
import { createHash } from 'node:crypto';
import { getHudPluginDir } from './claude-config-dir.js';
import type { TranscriptData, ToolEntry, AgentEntry, TodoItem, SessionTokenUsage } from './types.js';

interface TranscriptLine {
  timestamp?: string;
  type?: string;
  slug?: string;
  customTitle?: string;
  message?: {
    // Claude Code emits background-agent `<task-notification>` blocks as
    // user-role messages with plain-string content, so we accept both shapes.
    content?: ContentBlock[] | string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

interface ContentBlock {
  type: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  is_error?: boolean;
  content?: string | Array<{ type?: string; text?: string }>;
}

interface TranscriptFileState {
  mtimeMs: number;
  size: number;
}

interface SerializedToolEntry extends Omit<ToolEntry, 'startTime' | 'endTime'> {
  startTime: string;
  endTime?: string;
}

interface SerializedAgentEntry extends Omit<AgentEntry, 'startTime' | 'endTime'> {
  startTime: string;
  endTime?: string;
}

interface SerializedTranscriptData {
  tools: SerializedToolEntry[];
  agents: SerializedAgentEntry[];
  todos: TodoItem[];
  sessionStart?: string;
  sessionName?: string;
  sessionTokens?: SessionTokenUsage;
}

interface TranscriptCacheFile {
  transcriptPath: string;
  transcriptState: TranscriptFileState;
  data: SerializedTranscriptData;
}

let createReadStreamImpl: typeof fs.createReadStream = fs.createReadStream;

function normalizeTokenCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function normalizeSessionTokens(tokens: unknown): SessionTokenUsage | undefined {
  if (!tokens || typeof tokens !== 'object') {
    return undefined;
  }

  const raw = tokens as Record<string, unknown>;
  return {
    inputTokens: normalizeTokenCount(raw.inputTokens),
    outputTokens: normalizeTokenCount(raw.outputTokens),
    cacheCreationTokens: normalizeTokenCount(raw.cacheCreationTokens),
    cacheReadTokens: normalizeTokenCount(raw.cacheReadTokens),
  };
}

function getTranscriptCachePath(transcriptPath: string, homeDir: string): string {
  const hash = createHash('sha256').update(path.resolve(transcriptPath)).digest('hex');
  return path.join(getHudPluginDir(homeDir), 'transcript-cache', `${hash}.json`);
}

function readTranscriptFileState(transcriptPath: string): TranscriptFileState | null {
  try {
    const stat = fs.statSync(transcriptPath);
    if (!stat.isFile()) {
      return null;
    }
    return {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    };
  } catch {
    return null;
  }
}

function serializeTranscriptData(data: TranscriptData): SerializedTranscriptData {
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
    sessionTokens: data.sessionTokens,
  };
}

function deserializeTranscriptData(data: SerializedTranscriptData): TranscriptData {
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
    sessionTokens: normalizeSessionTokens(data.sessionTokens),
  };
}

function readTranscriptCache(transcriptPath: string, state: TranscriptFileState): TranscriptData | null {
  try {
    const cachePath = getTranscriptCachePath(transcriptPath, os.homedir());
    const raw = fs.readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(raw) as TranscriptCacheFile;
    if (
      parsed.transcriptPath !== path.resolve(transcriptPath)
      || parsed.transcriptState?.mtimeMs !== state.mtimeMs
      || parsed.transcriptState?.size !== state.size
    ) {
      return null;
    }

    return deserializeTranscriptData(parsed.data);
  } catch {
    return null;
  }
}

function writeTranscriptCache(transcriptPath: string, state: TranscriptFileState, data: TranscriptData): void {
  try {
    const cachePath = getTranscriptCachePath(transcriptPath, os.homedir());
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const payload: TranscriptCacheFile = {
      transcriptPath: path.resolve(transcriptPath),
      transcriptState: state,
      data: serializeTranscriptData(data),
    };
    fs.writeFileSync(cachePath, JSON.stringify(payload), 'utf8');
  } catch {
    // Cache failures are non-fatal; fall back to fresh parsing next time.
  }
}

export async function parseTranscript(transcriptPath: string): Promise<TranscriptData> {
  const result: TranscriptData = {
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
    return cached;
  }

  const toolMap = new Map<string, ToolEntry>();
  const agentMap = new Map<string, AgentEntry>();
  // Maps background-agent id (e.g. "a8de3dd") → tool_use_id, so a later
  // `<task-notification>` completion without a tool_use_id can still resolve.
  const backgroundAgentMap = new Map<string, string>();
  let latestTodos: TodoItem[] = [];
  const taskIdToIndex = new Map<string, number>();
  let latestSlug: string | undefined;
  let customTitle: string | undefined;
  const sessionTokens: SessionTokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
  };

  let parsedCleanly = false;

  try {
    const fileStream = createReadStreamImpl(transcriptPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line) as TranscriptLine;
        if (entry.type === 'custom-title' && typeof entry.customTitle === 'string') {
          customTitle = entry.customTitle;
        } else if (typeof entry.slug === 'string') {
          latestSlug = entry.slug;
        }
        // Accumulate token usage from assistant messages
        if (entry.type === 'assistant' && entry.message?.usage) {
          const usage = entry.message.usage;
          sessionTokens.inputTokens += normalizeTokenCount(usage.input_tokens);
          sessionTokens.outputTokens += normalizeTokenCount(usage.output_tokens);
          sessionTokens.cacheCreationTokens += normalizeTokenCount(usage.cache_creation_input_tokens);
          sessionTokens.cacheReadTokens += normalizeTokenCount(usage.cache_read_input_tokens);
        }
        processEntry(entry, toolMap, agentMap, taskIdToIndex, latestTodos, result, backgroundAgentMap);
      } catch {
        // Skip malformed lines
      }
    }

    parsedCleanly = true;
  } catch {
    // Return partial results on error
  }

  result.tools = Array.from(toolMap.values()).slice(-20);
  result.agents = Array.from(agentMap.values()).slice(-10);
  result.todos = latestTodos;
  result.sessionName = customTitle ?? latestSlug;
  result.sessionTokens = sessionTokens;
  if (parsedCleanly) {
    writeTranscriptCache(transcriptPath, transcriptState, result);
  }

  return result;
}

export function _setCreateReadStreamForTests(impl: typeof fs.createReadStream | null): void {
  createReadStreamImpl = impl ?? fs.createReadStream;
}

function processEntry(
  entry: TranscriptLine,
  toolMap: Map<string, ToolEntry>,
  agentMap: Map<string, AgentEntry>,
  taskIdToIndex: Map<string, number>,
  latestTodos: TodoItem[],
  result: TranscriptData,
  backgroundAgentMap: Map<string, string>
): void {
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

  if (!content || !Array.isArray(content)) return;

  for (const block of content) {
    if (block.type === 'tool_use' && block.id && block.name) {
      // OMC routes tool calls through a proxy layer and emits names like
      // "proxy_Edit". Strip the prefix so downstream routing and the HUD
      // display treat them identically to the native tools.
      const canonicalName = block.name.replace(/^proxy_/, '');

      const toolEntry: ToolEntry = {
        id: block.id,
        name: canonicalName,
        target: extractTarget(canonicalName, block.input),
        status: 'running',
        startTime: timestamp,
      };

      if (canonicalName === 'Task' || canonicalName === 'Agent') {
        const input = block.input as Record<string, unknown>;
        const rawType = typeof input?.subagent_type === 'string' ? input.subagent_type.trim() : '';
        const rawName = typeof input?.name === 'string' ? input.name.trim() : '';
        // The Agent tool defaults to the general-purpose agent when
        // subagent_type is omitted; fall back to the caller-supplied name
        // first since it's usually more descriptive (e.g. "build-validator").
        const fallbackType = canonicalName === 'Agent' ? 'general-purpose' : 'unknown';
        const agentEntry: AgentEntry = {
          id: block.id,
          type: rawType || rawName || fallbackType,
          model: (input?.model as string) ?? undefined,
          description: (input?.description as string) ?? undefined,
          status: 'running',
          startTime: timestamp,
        };
        agentMap.set(block.id, agentEntry);
      } else if (canonicalName === 'TodoWrite') {
        const input = block.input as { todos?: TodoItem[] };
        if (input?.todos && Array.isArray(input.todos)) {
          // Build reverse map: content → taskIds from existing state
          const contentToTaskIds = new Map<string, string[]>();
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
      } else if (canonicalName === 'TaskCreate') {
        const input = block.input as Record<string, unknown>;
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
      } else if (canonicalName === 'TaskUpdate') {
        const input = block.input as Record<string, unknown>;
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
      } else {
        toolMap.set(block.id, toolEntry);
      }
    }

    if (block.type === 'tool_result' && block.tool_use_id) {
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
        } else {
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

function contentToText(content: string | Array<{ type?: string; text?: string }> | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content.find((c) => c.type === 'text')?.text ?? '';
}

const ASYNC_LAUNCH_PREFIX = 'Async agent launched';

function isAsyncLaunchResult(
  content: string | Array<{ type?: string; text?: string }> | undefined
): boolean {
  const text = contentToText(content).trimStart();
  return text.startsWith(ASYNC_LAUNCH_PREFIX);
}

function extractBackgroundAgentId(
  content: string | Array<{ type?: string; text?: string }> | undefined
): string | null {
  const text = contentToText(content);
  const match = text.match(/agentId:\s*([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function parseTaskNotification(
  content: string | Array<{ type?: string; text?: string }>
): { taskId: string; toolUseId: string | null; status: string } | null {
  const text = contentToText(content);
  // Claude Code emits hyphen-cased tags; accept underscore variant defensively.
  const taskIdMatch =
    text.match(/<task-id>([^<]+)<\/task-id>/) ||
    text.match(/<task_id>([^<]+)<\/task_id>/);
  const statusMatch = text.match(/<status>([^<]+)<\/status>/);
  const toolUseIdMatch =
    text.match(/<tool-use-id>([^<]+)<\/tool-use-id>/) ||
    text.match(/<tool_use_id>([^<]+)<\/tool_use_id>/);

  if (!taskIdMatch || !statusMatch) return null;

  return {
    taskId: taskIdMatch[1],
    toolUseId: toolUseIdMatch ? toolUseIdMatch[1] : null,
    status: statusMatch[1],
  };
}

function extractTarget(toolName: string, input?: Record<string, unknown>): string | undefined {
  if (!input) return undefined;

  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit':
      return (input.file_path as string) ?? (input.path as string);
    case 'Glob':
      return input.pattern as string;
    case 'Grep':
      return input.pattern as string;
    case 'Bash':
      const cmd = input.command as string;
      return cmd?.slice(0, 30) + (cmd?.length > 30 ? '...' : '');
  }
  return undefined;
}

function resolveTaskIndex(
  taskId: unknown,
  taskIdToIndex: Map<string, number>,
  latestTodos: TodoItem[]
): number | null {
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

function normalizeTaskStatus(status: unknown): TodoItem['status'] | null {
  if (typeof status !== 'string') return null;

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
