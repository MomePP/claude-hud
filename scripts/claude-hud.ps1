# claude-hud statusline launcher (PowerShell).
#
# Windows/PowerShell counterpart to scripts/claude-hud.sh. Resolves the highest
# installed claude-hud version in the Claude Code plugin cache, caches the
# resolved entry path so we skip the directory scan on every invocation, and
# hands off to node. Called every ~300ms by Claude Code.
#
# NOTE: Windows support is experimental and not tested by the maintainer (the
# fork is developed on macOS/Linux). On Windows + Git Bash/MSYS, use
# scripts/claude-hud.sh instead — bash can mangle PowerShell invocations there.
$ErrorActionPreference = 'SilentlyContinue'

$claudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
$pluginBase = Join-Path $claudeDir 'plugins\cache\claude-hud\claude-hud'
# Separate cache file from the bash launcher's .cached_hud_entry: a machine can
# have both Git Bash and PowerShell sessions, and the cached path formats differ.
$cacheFile = Join-Path $claudeDir '.cached_hud_entry_ps'

$entry = ''
# Trust the cache only when it's strictly newer than the plugin base dir.
# Unpacking a new version updates the mtime of $pluginBase, forcing a rescan.
if ((Test-Path $cacheFile) -and (Test-Path $pluginBase)) {
  $cf = Get-Item $cacheFile
  $pb = Get-Item $pluginBase
  if ($cf.LastWriteTimeUtc -gt $pb.LastWriteTimeUtc) {
    $cached = (Get-Content -Raw $cacheFile).Trim()
    if ($cached -and (Test-Path $cached)) { $entry = $cached }
  }
}

if (-not $entry) {
  $bestVer = $null
  Get-ChildItem -Directory $pluginBase | ForEach-Object {
    $idx = Join-Path $_.FullName 'dist\index.js'
    if (Test-Path $idx) {
      $v = $null
      # Plugin dirs are semver (e.g. 0.5.0); non-version dirs (temp_local_*) fail
      # the parse and are skipped. [version] sorts numerically, not lexically.
      if ([version]::TryParse($_.Name, [ref]$v)) {
        if (($null -eq $bestVer) -or ($v -gt $bestVer)) { $bestVer = $v; $entry = $idx }
      }
    }
  }
  if ($entry) { Set-Content -NoNewline -Path $cacheFile -Value $entry }
}

if (-not $entry) { exit 1 }

# The HUD sizes progress bars from $env:COLUMNS (see src/utils/terminal.ts).
# Claude Code captures our stdout, so process.stdout.columns is null inside node.
# Read the console width once per launch.
if (-not $env:COLUMNS) {
  $w = 0
  try { $w = [Console]::WindowWidth } catch { $w = 0 }
  if (-not $w -or $w -le 0) { try { $w = $Host.UI.RawUI.WindowSize.Width } catch { $w = 0 } }
  if (-not $w -or $w -le 0) { $w = 80 }
  $env:COLUMNS = "$w"
}

# If node isn't on PATH, exit quietly (code 1) rather than letting PowerShell
# emit a "command not found" error into the captured statusline output.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { exit 1 }

# PowerShell has no exec(); run node and propagate its exit code. stdin (the
# Claude Code JSON payload) and stdout pass through transparently. $entry is
# passed as a single argument even if the path contains spaces (PowerShell does
# not word-split variable values), so no extra quoting is needed.
& node $entry
exit $LASTEXITCODE
