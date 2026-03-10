param(
  [string]$InputFile,
  [string]$OutputFile
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path (Join-Path $scriptDir '..')).Path

if (-not $InputFile) {
  $InputFile = Join-Path $rootDir 'data\locations.yaml'
}

if (-not $OutputFile) {
  $OutputFile = Join-Path $rootDir 'data\locations.js'
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js was not found in PATH. Install Node.js >= 18 and try again.'
}

& node (Join-Path $rootDir 'scripts\generate-locations.js') --input $InputFile --output $OutputFile

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
