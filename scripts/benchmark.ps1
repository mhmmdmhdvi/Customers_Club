<# Separate opt-in performance command. The native cluster must already exist;
   Load validates its marker and installs only disposable credentials. #>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Output,
  [switch]$AllowPerformance,
  [switch]$TrigramCandidate,
  [switch]$OverviewCandidate,
  [switch]$FlushGinPending,
  [switch]$FastupdateCandidate
)
$ErrorActionPreference = 'Stop'
if (-not $AllowPerformance) { throw 'Explicit -AllowPerformance required.' }
if (([int]$TrigramCandidate.IsPresent + [int]$OverviewCandidate.IsPresent + [int]$FastupdateCandidate.IsPresent) -gt 1) { throw 'Choose one candidate experiment.' }
$repo = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$destination = [IO.Path]::GetFullPath($Output)
if (-not (Test-Path -LiteralPath (Split-Path -Parent $destination))) { throw 'Output directory must already exist.' }
. (Join-Path $PSScriptRoot 'test-postgres.ps1') -Action Load
Remove-Item Env:MIGRATION_PERFORMANCE_CANDIDATE, Env:MIGRATION_PERFORMANCE_FLUSH_GIN -ErrorAction SilentlyContinue
$env:ALLOW_MIGRATION_PERFORMANCE = '1'
$env:MIGRATION_PERFORMANCE_OUTPUT = $destination
if ($TrigramCandidate) { $env:MIGRATION_PERFORMANCE_CANDIDATE = 'trigram' }
elseif ($OverviewCandidate) { $env:MIGRATION_PERFORMANCE_CANDIDATE = 'overview' }
elseif ($FastupdateCandidate) { $env:MIGRATION_PERFORMANCE_CANDIDATE = 'fastupdate' }
if ($FlushGinPending) { $env:MIGRATION_PERFORMANCE_FLUSH_GIN = '1' }
Push-Location (Join-Path $repo 'backend-go')
try {
  go test ./internal/perftest -run '^TestHTTPDatabasePerformance$' -count=1 -timeout=15m -v
  if ($LASTEXITCODE -ne 0) { throw 'Owned HTTP benchmark failed.' }
} finally {
  Pop-Location
  Remove-Item Env:ALLOW_MIGRATION_PERFORMANCE, Env:MIGRATION_PERFORMANCE_OUTPUT, Env:MIGRATION_PERFORMANCE_CANDIDATE, Env:MIGRATION_PERFORMANCE_FLUSH_GIN -ErrorAction SilentlyContinue
}
