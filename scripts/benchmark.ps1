<# Separate opt-in performance command. The native cluster must already exist;
   Load validates its marker and installs only disposable credentials. #>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Output,
  [switch]$AllowPerformance,
  [switch]$TrigramCandidate,
  [switch]$OverviewCandidate
)
$ErrorActionPreference = 'Stop'
if (-not $AllowPerformance) { throw 'Explicit -AllowPerformance required.' }
if ($TrigramCandidate -and $OverviewCandidate) { throw 'Choose one candidate experiment.' }
$repo = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$destination = [IO.Path]::GetFullPath($Output)
if (-not (Test-Path -LiteralPath (Split-Path -Parent $destination))) { throw 'Output directory must already exist.' }
. (Join-Path $PSScriptRoot 'test-postgres.ps1') -Action Load
$env:ALLOW_MIGRATION_PERFORMANCE = '1'
$env:MIGRATION_PERFORMANCE_OUTPUT = $destination
if ($TrigramCandidate) { $env:MIGRATION_PERFORMANCE_CANDIDATE = 'trigram' }
elseif ($OverviewCandidate) { $env:MIGRATION_PERFORMANCE_CANDIDATE = 'overview' }
Push-Location (Join-Path $repo 'backend-go')
try {
  go test ./internal/perftest -run '^TestHTTPDatabasePerformance$' -count=1 -timeout=15m -v
  if ($LASTEXITCODE -ne 0) { throw 'Owned HTTP benchmark failed.' }
} finally {
  Pop-Location
  Remove-Item Env:ALLOW_MIGRATION_PERFORMANCE, Env:MIGRATION_PERFORMANCE_OUTPUT, Env:MIGRATION_PERFORMANCE_CANDIDATE -ErrorAction SilentlyContinue
}
