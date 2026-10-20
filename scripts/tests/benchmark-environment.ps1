<# Run wrapper checks without a workload; only go is intercepted. #>
$ErrorActionPreference = 'Stop'
$benchmarkScript = Join-Path (Split-Path -Parent $PSScriptRoot) 'benchmark.ps1'
$outputFile = Join-Path $PSScriptRoot '../../.superpowers/benchmark-environment-check.json'
$benchmarkState = @{ Calls = 0 }
function go {
    if ($env:ALLOW_MIGRATION_PERFORMANCE -cne '1' -or [IO.Path]::GetFullPath($env:MIGRATION_PERFORMANCE_OUTPUT) -cne [IO.Path]::GetFullPath($outputFile)) {
        throw 'Benchmark wrapper failed to install explicit opt-in/output.'
    }
    $benchmarkState.Calls++
    $global:LASTEXITCODE = 0
}
$refused = $false
try { & $benchmarkScript -Output $outputFile } catch { $refused = $true }
if (-not $refused -or $benchmarkState.Calls -ne 0) { throw 'Missing explicit opt-in was accepted.' }
& $benchmarkScript -Output $outputFile -AllowPerformance
if ($benchmarkState.Calls -ne 1) { throw 'Wrapper did not run the selected Go workload.' }
if ((Test-Path Env:ALLOW_MIGRATION_PERFORMANCE) -or (Test-Path Env:MIGRATION_PERFORMANCE_OUTPUT)) { throw 'Benchmark environment leaked.' }
if (Test-Path -LiteralPath $outputFile) { throw 'Test accidentally generated performance evidence.' }
Write-Host 'Benchmark opt-in/environment lifecycle passed; no workload ran.'
