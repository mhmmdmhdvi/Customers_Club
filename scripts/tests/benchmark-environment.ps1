<# Exercises the real wrapper's environment switches, without a benchmark or DB
   workload: only the command invocation is intercepted. Load keeps its owner guard. #>
$ErrorActionPreference = 'Stop'
$benchmarkScript = Join-Path (Split-Path -Parent $PSScriptRoot) 'benchmark.ps1'
$outputFile = Join-Path $PSScriptRoot '../../.superpowers/sdd/2026-10-14-go-migration/unused-environment-check.json'
$benchmarkEnvironmentExpectation = @{ Candidate = ''; Flush = ''; Calls = 0 }
function go {
    if ([string]$env:MIGRATION_PERFORMANCE_CANDIDATE -cne $benchmarkEnvironmentExpectation.Candidate -or [string]$env:MIGRATION_PERFORMANCE_FLUSH_GIN -cne $benchmarkEnvironmentExpectation.Flush) {
        throw 'Benchmark wrapper inherited or misselected an experiment.'
    }
    $benchmarkEnvironmentExpectation.Calls++
    $global:LASTEXITCODE = 0
}
foreach ($selected in @('', 'trigram')) {
    $env:MIGRATION_PERFORMANCE_CANDIDATE = 'fastupdate'
    $env:MIGRATION_PERFORMANCE_FLUSH_GIN = '1'
    $benchmarkEnvironmentExpectation.Candidate = $selected
    if ($selected -eq '') {
        & $benchmarkScript -Output $outputFile -AllowPerformance
    } else {
        $benchmarkEnvironmentExpectation.Flush = '1'
        & $benchmarkScript -Output $outputFile -AllowPerformance -TrigramCandidate -FlushGinPending
    }
    if (Test-Path Env:MIGRATION_PERFORMANCE_CANDIDATE) { throw 'Candidate environment leaked after wrapper.' }
    if (Test-Path Env:MIGRATION_PERFORMANCE_FLUSH_GIN) { throw 'Flush environment leaked after wrapper.' }
}
if ($benchmarkEnvironmentExpectation.Calls -ne 2) { throw 'Wrapper did not invoke the intercepted command.' }
Write-Host 'Benchmark environment isolation passed; no performance workload ran.'
