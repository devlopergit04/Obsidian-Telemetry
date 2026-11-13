$ErrorActionPreference = 'Stop'

$PackageSpec = if ($env:OT_NPM_SPEC) { $env:OT_NPM_SPEC } else { 'obsidian-telemetry@latest' }
$InstallPrefix = $env:OT_INSTALL_PREFIX

Write-Host 'Obsidian Telemetry Windows Installer'
Write-Host ''

$Arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
Write-Host "Detected platform: Windows ($Arch)"

$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
  Write-Error 'Node.js 20 or newer is required, but node.exe was not found in PATH. Install Node.js LTS via "winget install OpenJS.NodeJS.LTS" or https://nodejs.org/ and re-run.'
  exit 1
}

$NpmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $NpmCmd) {
  $NpmCmd = Get-Command npm -ErrorAction SilentlyContinue
}
if (-not $NpmCmd) {
  Write-Error 'npm was not found in PATH. Reinstall Node.js LTS (>= 20) and re-run.'
  exit 1
}

$NodeVersionRaw = (& node -v).Trim()
$NodeMajor = [int]((& node -p "Number(process.versions.node.split('.')[0])").Trim())
if ($NodeMajor -lt 20) {
  Write-Error "Detected Node.js $NodeVersionRaw, but Node.js >= 20.0.0 is required."
  exit 1
}
Write-Host "Runtime check passed: Node.js $NodeVersionRaw"

$NpmArgs = @('install', '-g', '--no-fund', '--no-audit', $PackageSpec)
if ($InstallPrefix) {
  New-Item -ItemType Directory -Force -Path $InstallPrefix | Out-Null
  $NpmArgs += @('--prefix', $InstallPrefix)
}

Write-Host "Installing $PackageSpec..."
& $NpmCmd.Source @NpmArgs
if ($LASTEXITCODE -ne 0) {
  Write-Error "npm installation failed with exit code $LASTEXITCODE."
  exit $LASTEXITCODE
}

$GlobalBinDir = if ($InstallPrefix) { $InstallPrefix } else { (& $NpmCmd.Source prefix -g).Trim() }
$OtCmdPath = Join-Path $GlobalBinDir 'ot.cmd'
if (-not (Test-Path $OtCmdPath)) {
  Write-Error "Installation completed but '$OtCmdPath' was not found."
  exit 1
}

$VersionOut = & $OtCmdPath --version
Write-Host ''
Write-Host "Installed $VersionOut"
Write-Host "Executable: $OtCmdPath"

$PathEntries = ($env:PATH -split ';') | ForEach-Object { $_.TrimEnd('\').ToLowerInvariant() }
$NormalizedBin = $GlobalBinDir.TrimEnd('\').ToLowerInvariant()
if (-not ($PathEntries -contains $NormalizedBin)) {
  Write-Host ''
  Write-Host "Note: '$GlobalBinDir' is not in your current PATH."
  Write-Host 'Add it to your User PATH environment variable or open a new terminal, then run:'
  Write-Host '  ot'
} else {
  Write-Host ''
  Write-Host "Run 'ot' to start Obsidian Telemetry."
}
