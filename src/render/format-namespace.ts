import type { AgentNamespaceMode } from '../config.js';

// Format a namespaced identifier (`oac:code-execution`,
// `oh-my-claudecode:explore`) for display, per the user's chosen mode.
//
//   strip — drop the `<ns>:` prefix and capitalize the first character
//           (`oac:debugger` → `Debugger`). Loses orchestrator origin.
//   badge — keep the namespace as a leading `[ns]` badge alongside the
//           capitalized local name (`oh-my-claudecode:explore` → `[omc] Explore`).
//           Useful when running multiple orchestrators (OMC + OAC) in
//           the same session and you want to see at a glance which one
//           launched a given subagent or skill.
//   raw   — pass through unchanged (`oac:debugger`). Restores the
//           pre-0.1.0 behavior for users who prefer the raw form.

// Short, HUD-friendly badges for verbose orchestrator namespaces, so badge mode
// reads `[omc] Explore` rather than the full `[oh-my-claudecode] Explore`.
const NAMESPACE_ABBR: Record<string, string> = {
  'oh-my-claudecode': 'omc',
};

export function formatNamespaced(raw: string, mode: AgentNamespaceMode): string {
  if (mode === 'raw') return raw;

  const colonAt = raw.lastIndexOf(':');
  const namespace = colonAt >= 0 ? raw.slice(0, colonAt) : '';
  const local = colonAt >= 0 ? raw.slice(colonAt + 1) : raw;
  const trimmed = local.trim();
  if (!trimmed) return raw;

  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);

  if (mode === 'badge' && namespace) {
    const badge = NAMESPACE_ABBR[namespace] ?? namespace;
    return `[${badge}] ${capitalized}`;
  }
  return capitalized;
}
