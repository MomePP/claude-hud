#!/usr/bin/env bash
# claude-hud statusline launcher.
#
# Resolves the highest installed claude-hud version in the Claude Code
# plugin cache, caches the resolved entry path so we skip the directory
# scan on every invocation, and hands off to node. Called every ~300ms by
# Claude Code — cache-hit path does zero subprocess work beyond `node`.

set -u

claude_dir=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
plugin_base=$claude_dir/plugins/cache/claude-hud/claude-hud
cache_file=$claude_dir/.cached_hud_entry

entry=""
# Trust the cache only when it's strictly newer than the plugin base dir.
# Unpacking a new version updates the mtime of $plugin_base, forcing a rescan.
if [[ -f $cache_file && -d $plugin_base && $cache_file -nt $plugin_base ]]; then
  entry=$(<"$cache_file")
  [[ -f $entry ]] || entry=""
fi

if [[ -z $entry ]]; then
  best_key=""
  best_dir=""
  for d in "$plugin_base"/*/; do
    [[ -f ${d}dist/index.js ]] || continue
    ver=${d%/}
    ver=${ver##*/}
    IFS=. read -r a b c e <<<"$ver"
    # Zero-pad each component so lexicographic compare ≡ numeric compare.
    key=$(printf '%05d%05d%05d%05d' "${a:-0}" "${b:-0}" "${c:-0}" "${e:-0}" 2>/dev/null) || continue
    if [[ $key > $best_key ]]; then
      best_key=$key
      best_dir=$d
    fi
  done
  [[ -n $best_dir ]] && entry="${best_dir}dist/index.js"
  [[ -n $entry ]] && printf '%s' "$entry" >"$cache_file" 2>/dev/null
fi

[[ -z $entry ]] && exit 1

# The HUD sizes progress bars from $COLUMNS (see src/utils/terminal.ts).
# Claude Code captures our stdout, so process.stdout.columns is null inside
# node. Read the width from the controlling tty once per launch.
if [[ -z ${COLUMNS:-} ]]; then
  # Wrap in a brace group so bash's own "no controlling tty" messages are
  # silenced along with stty's stderr.
  size=$({ stty size </dev/tty; } 2>/dev/null) || size=""
  if [[ -n $size ]]; then
    COLUMNS=${size#* }
  else
    COLUMNS=80
  fi
  export COLUMNS
fi

exec node "$entry"
