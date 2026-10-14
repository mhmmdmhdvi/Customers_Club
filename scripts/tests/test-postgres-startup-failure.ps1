# Actual native startup-controller failure injection on separate owned clusters.
# No live shared cluster/environment is modified; diagnostics are retained.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$scratchRoot = Join-Path $repoRoot '.superpowers/sdd/2026-10-14-go-migration'
$realBin = 'C:/Program Files/PostgreSQL/18/bin'
$realCtl = Join-Path $realBin 'pg_ctl.exe'
$nonce = [Guid]::NewGuid().ToString('N')
$fixtureRoot = Join-Path $scratchRoot ('startup-fixture-' + $nonce)
$wrapperBin = Join-Path $fixtureRoot 'bin'
New-Item -ItemType Directory -Path $wrapperBin -Force | Out-Null
$source = Join-Path $repoRoot 'backend-go/internal/testdb/fixtures/postgres_controller.go'
$wrapper = Join-Path $wrapperBin 'controller.exe'
& go build -o $wrapper $source
if ($LASTEXITCODE -ne 0) { throw 'Failed to build controlled startup fixture.' }
foreach ($tool in @('initdb.exe','pg_ctl.exe','psql.exe')) {
    Copy-Item -LiteralPath $wrapper -Destination (Join-Path $wrapperBin $tool)
}
$previousMode = $env:MIGRATION_STARTUP_FIXTURE_MODE
$ownedCases = @()

function Owned-FixtureData([string]$ownedRoot) {
    $clusters = @(Get-ChildItem -LiteralPath $ownedRoot -Directory -Filter 'cluster_*')
    if ($clusters.Count -ne 1) { throw 'Controlled startup fixture did not initialize exactly one cluster.' }
    $cluster = $clusters[0]
    $clusterId = $cluster.Name.Substring(8)
    if ($clusterId -cnotmatch '^[a-f0-9]{16}$') { throw 'Unexpected fixture ownership ID.' }
    $data = [IO.Path]::GetFullPath((Join-Path $cluster.FullName 'data'))
    if (-not $data.StartsWith([IO.Path]::GetFullPath($ownedRoot) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Fixture escaped owned directory.' }
    $marker = Get-Content -LiteralPath (Join-Path $cluster.FullName 'ownership.json') -Raw | ConvertFrom-Json
    if ($marker.ClusterId -cne $clusterId -or $marker.DataDirectory -cne $data -or $marker.Kind -cne 'customers-club-migration') { throw 'Fixture ownership marker mismatch.' }
    return $data
}

function Native-Status([string]$data, [string]$log) {
    $savedPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $realCtl -D $data status *> $log
        return $LASTEXITCODE
    } finally { $ErrorActionPreference = $savedPreference }
}

try {
    foreach ($mode in @('nonzero','timeout')) {
        $instance = 'startup-failure-' + $mode + '-' + $nonce.Substring(0,8)
        $ownedRoot = Join-Path $scratchRoot $instance
        $ownedCases += $ownedRoot
        $envFile = Join-Path $scratchRoot ($instance + '-env.json')
        $env:MIGRATION_STARTUP_FIXTURE_MODE = $mode
        $savedPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'scripts/test-postgres.ps1') -InstanceName $instance -PostgresBin $wrapperBin -StartupControllerTimeoutSeconds 8 *> (Join-Path $fixtureRoot ($mode + '-runner.log'))
            $failureExit = $LASTEXITCODE
        } finally { $ErrorActionPreference = $savedPreference }
        if ($failureExit -eq 0) { throw 'Controlled failed startup unexpectedly succeeded.' }
        $data = Owned-FixtureData $ownedRoot
        $log = Join-Path (Split-Path -Parent $data) 'postgres.log'
        if (-not (Select-String -LiteralPath $log -SimpleMatch 'database system is ready to accept connections' -Quiet)) { throw 'Fixture failed to exercise an actually running PostgreSQL child.' }
        if (Test-Path -LiteralPath $envFile) { throw 'Failed startup published an environment file.' }
        if ((Native-Status $data (Join-Path $fixtureRoot ($mode + '-status.log'))) -eq 0) { throw "Failed $mode startup left its owned PostgreSQL child running." }
        if (Test-Path -LiteralPath (Join-Path $data 'postmaster.pid')) { throw 'Failed startup retained a live postmaster PID.' }
        Write-Host "Controlled $mode startup: child reached ready state, failure cleanup stopped it, no environment published."
    }
} finally {
    $env:MIGRATION_STARTUP_FIXTURE_MODE = $previousMode
    # This also safely repairs the RED orphan. Never enumerate and delete files;
    # stop only the exact fixture data path after revalidating its own marker.
    foreach ($ownedRoot in $ownedCases) {
        if (-not (Test-Path -LiteralPath $ownedRoot)) { continue }
        $data = Owned-FixtureData $ownedRoot
        if ((Native-Status $data (Join-Path $fixtureRoot 'final-status.log')) -eq 0) {
            & $realCtl -D $data -m fast -w -t 30 stop *> (Join-Path $fixtureRoot 'fixture-cleanup.log')
        }
    }
}
