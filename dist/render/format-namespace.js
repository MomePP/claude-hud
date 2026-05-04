// Format a namespaced identifier (`oac:code-execution`,
// `oh-my-claudecode:explore`) for display, per the user's chosen mode.
//
//   strip — drop the `<ns>:` prefix and capitalize the first character
//           (`oac:debugger` → `Debugger`). Loses orchestrator origin.
//   badge — keep the namespace as a leading `[ns]` badge alongside the
//           capitalized local name (`oac:debugger` → `[oac] Debugger`).
//           Useful when running multiple orchestrators (OAC + OMC) in
//           the same session and you want to see at a glance which one
//           launched a given subagent or skill.
//   raw   — pass through unchanged (`oac:debugger`). Restores the
//           pre-0.1.0 behavior for users who prefer the raw form.
export function formatNamespaced(raw, mode) {
    if (mode === 'raw')
        return raw;
    const colonAt = raw.lastIndexOf(':');
    const namespace = colonAt >= 0 ? raw.slice(0, colonAt) : '';
    const local = colonAt >= 0 ? raw.slice(colonAt + 1) : raw;
    const trimmed = local.trim();
    if (!trimmed)
        return raw;
    const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    if (mode === 'badge' && namespace) {
        return `[${namespace}] ${capitalized}`;
    }
    return capitalized;
}
//# sourceMappingURL=format-namespace.js.map