import { yellow, green, cyan, label } from './colors.js';
export function renderToolsLine(ctx) {
    const { tools } = ctx.transcript;
    const colors = ctx.config?.colors;
    if (tools.length === 0) {
        return null;
    }
    const parts = [];
    const runningTools = tools.filter((t) => t.status === 'running');
    const completedTools = tools.filter((t) => t.status === 'completed' || t.status === 'error');
    for (const tool of runningTools.slice(-2)) {
        const target = tool.target ? truncatePath(tool.target) : '';
        parts.push(`${yellow('◐')} ${cyan(formatToolName(tool.name))}${target ? label(`: ${target}`, colors) : ''}`);
    }
    const toolCounts = new Map();
    for (const tool of completedTools) {
        const displayName = formatToolName(tool.name);
        const count = toolCounts.get(displayName) ?? 0;
        toolCounts.set(displayName, count + 1);
    }
    const sortedTools = Array.from(toolCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);
    for (const [name, count] of sortedTools) {
        parts.push(`${green('✓')} ${name} ${label(`×${count}`, colors)}`);
    }
    if (parts.length === 0) {
        return null;
    }
    return parts.join(' | ');
}
// Claude Code MCP tool names arrive in two shapes:
//   mcp__<server>__<fn>                       — standard MCP server
//   mcp__plugin_<plugin>_<server>__<fn>       — plugin-provided MCP server
// Both balloon the tools line. Compress to `<scope>:<fn>` where <scope> is
// the plugin name when present (more recognizable to users — "claude-mem",
// "context-mode", "oh-my-claudecode") and the raw server name otherwise.
// Non-MCP tool names pass through unchanged.
export function formatToolName(raw) {
    if (!raw.startsWith('mcp__'))
        return raw;
    const rest = raw.slice('mcp__'.length);
    const splitAt = rest.indexOf('__');
    if (splitAt < 0)
        return raw;
    const header = rest.slice(0, splitAt);
    const fn = rest.slice(splitAt + 2);
    if (!fn)
        return raw;
    let scope;
    if (header.startsWith('plugin_')) {
        const segs = header.split('_').filter(Boolean);
        // plugin_<plugin>_<server> — prefer the plugin identifier (segs[1]).
        scope = segs[1] ?? header;
    }
    else {
        scope = header;
    }
    return `${scope}:${fn}`;
}
function truncatePath(path, maxLen = 20) {
    // Normalize Windows backslashes to forward slashes for consistent display
    const normalizedPath = path.replace(/\\/g, '/');
    if (normalizedPath.length <= maxLen)
        return normalizedPath;
    // Split by forward slash (already normalized)
    const parts = normalizedPath.split('/');
    const filename = parts.pop() || normalizedPath;
    if (filename.length >= maxLen) {
        return filename.slice(0, maxLen - 3) + '...';
    }
    return '.../' + filename;
}
//# sourceMappingURL=tools-line.js.map