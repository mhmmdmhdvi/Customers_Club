<#
Native, isolated PostgreSQL harness. Never reads .env or connects to an existing
cluster. Start creates a new cluster; Load sets opt-in variables in this process;
Stop retains all cluster files for diagnostics. Environment JSON contains random
disposable credentials and is ignored by git. See internal/testdb/README.md.
#>
[CmdletBinding()]
param(
    [ValidateSet('Start', 'Load', 'Status', 'Stop')]
    [string]$Action = 'Start',
    [string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin'
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$ownedRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot '.superpowers/sdd/2026-10-14-go-migration/postgres'))
$envFile = Join-Path (Split-Path -Parent $ownedRoot) 'postgres-env.json'
$pgCtl = Join-Path $PostgresBin 'pg_ctl.exe'

function Random-Hex([int]$count) {
    $bytes = New-Object byte[] $count
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

function Protect-CredentialFile([string]$path) {
    $acl = Get-Acl -LiteralPath $path
    $acl.SetAccessRuleProtection($true, $false)
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'Allow')
    $acl.SetAccessRule($rule)
    Set-Acl -LiteralPath $path -AclObject $acl
}

function Owned-State {
    if (-not (Test-Path -LiteralPath $envFile)) { throw 'No owned cluster environment file exists.' }
    $state = Get-Content -LiteralPath $envFile -Raw | ConvertFrom-Json
    if ($state.ClusterId -cnotmatch '^[a-f0-9]{16}$') { throw 'Invalid owned cluster ID.' }
    $expectedDir = [IO.Path]::GetFullPath((Join-Path $ownedRoot ("cluster_" + $state.ClusterId)))
    $expectedData = [IO.Path]::GetFullPath((Join-Path $expectedDir 'data'))
    $actualData = [IO.Path]::GetFullPath($state.DataDirectory)
    if ($actualData -cne $expectedData -or -not $actualData.StartsWith($ownedRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Refusing cluster operation outside the owned test directory.'
    }
    $markerFile = Join-Path $expectedDir 'ownership.json'
    $marker = Get-Content -LiteralPath $markerFile -Raw | ConvertFrom-Json
    if ($marker.ClusterId -cne $state.ClusterId -or $marker.DataDirectory -cne $expectedData -or $marker.Kind -cne 'customers-club-migration') {
        throw 'Refusing cluster operation without matching ownership marker.'
    }
    return $state
}

function Start-OwnedCluster([string]$dataDirectory, [string]$logFile) {
    $arguments = @('-D', ('"' + $dataDirectory + '"'), '-l', ('"' + $logFile + '"'), '-w', '-t', '30', 'start')
    # Start-Process -Wait also waits for pg_ctl's long-lived postgres child.
    # Wait only for the startup controller itself, with a bounded wait.
    $startup = Start-Process -FilePath $pgCtl -ArgumentList $arguments -WindowStyle Hidden -PassThru
    if (-not $startup.WaitForExit(35000)) { throw 'Disposable PostgreSQL startup controller timed out.' }
    $startup.Refresh()
    if ($startup.ExitCode -ne 0) { throw 'Disposable PostgreSQL startup failed; inspect the retained cluster log.' }
}

if (-not (Test-Path -LiteralPath $pgCtl)) { throw 'PostgreSQL binaries unavailable at the selected path.' }
if ($Action -ne 'Start') {
    $state = Owned-State
    switch ($Action) {
        'Load' {
            $env:MIGRATION_TEST_DATABASE_URL = $state.MIGRATION_TEST_DATABASE_URL
            $env:ALLOW_MIGRATION_TEST_DATABASE = '1'
            Write-Host 'Disposable database opt-in loaded in this PowerShell process.'
        }
        'Status' {
            & $pgCtl -D $state.DataDirectory status
        }
        'Stop' {
            & $pgCtl -D $state.DataDirectory -m fast -w -t 30 stop
            if ($LASTEXITCODE -ne 0) { throw 'Owned PostgreSQL shutdown failed.' }
            Write-Host 'Owned cluster stopped; diagnostic files retained.'
        }
    }
    return
}
if (Test-Path -LiteralPath $envFile) { throw 'An owned environment file already exists. Use Load/Status/Stop; Start never replaces an existing cluster.' }

$clusterId = Random-Hex 8
$ownerRole = 'mig_owner_' + $clusterId
$bootstrapRole = 'mig_bootstrap_' + $clusterId
$parentDatabase = 'mig_parent_' + $clusterId
$ownerPassword = Random-Hex 32
$bootstrapPassword = Random-Hex 32
$clusterDirectory = Join-Path $ownedRoot ('cluster_' + $clusterId)
$dataDirectory = Join-Path $clusterDirectory 'data'
$logFile = Join-Path $clusterDirectory 'postgres.log'
$passwordFile = Join-Path $clusterDirectory 'bootstrap-password.txt'
$setupFile = Join-Path $clusterDirectory 'setup.sql'
New-Item -ItemType Directory -Path $clusterDirectory | Out-Null
@{ Kind = 'customers-club-migration'; ClusterId = $clusterId; DataDirectory = $dataDirectory } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $clusterDirectory 'ownership.json') -Encoding UTF8

# Ask Windows for a free loopback port; pg_ctl fails safely if it is claimed in
# the small interval after release. Never use the ordinary PostgreSQL port.
$listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
$listener.Start()
try { $port = $listener.LocalEndpoint.Port } finally { $listener.Stop() }
if ($port -eq 5432) { throw 'Refusing the ordinary PostgreSQL port.' }
$started = $false
$previousPassword = $env:PGPASSWORD
try {
    [IO.File]::WriteAllText($passwordFile, $bootstrapPassword, [Text.Encoding]::ASCII)
    Protect-CredentialFile $passwordFile
    & (Join-Path $PostgresBin 'initdb.exe') -D $dataDirectory -U $bootstrapRole --pwfile=$passwordFile --auth-local=scram-sha-256 --auth-host=scram-sha-256 --locale=C --encoding=UTF8 *> (Join-Path $clusterDirectory 'initdb.log')
    if ($LASTEXITCODE -ne 0) { throw 'Disposable initdb failed; inspect the retained initdb log.' }
    Add-Content -LiteralPath (Join-Path $dataDirectory 'postgresql.conf') -Encoding ASCII -Value @(
        "listen_addresses = '127.0.0.1'", "port = $port", "timezone = 'UTC'", "password_encryption = 'scram-sha-256'"
    )
    Start-OwnedCluster $dataDirectory $logFile
    $started = $true
    $marker = 'customers-club-migration:' + $clusterId
    # All interpolated SQL identifiers/credentials consist solely of generated
    # fixed prefixes and hex. The test role cannot become a superuser.
    $sql = @"
CREATE ROLE $ownerRole LOGIN CREATEDB NOSUPERUSER NOCREATEROLE NOREPLICATION PASSWORD '$ownerPassword';
COMMENT ON ROLE $ownerRole IS '$marker';
CREATE DATABASE $parentDatabase OWNER $ownerRole TEMPLATE template0;
COMMENT ON DATABASE $parentDatabase IS '$marker';
"@
    [IO.File]::WriteAllText($setupFile, $sql, [Text.Encoding]::ASCII)
    Protect-CredentialFile $setupFile
    $env:PGPASSWORD = $bootstrapPassword
    & (Join-Path $PostgresBin 'psql.exe') -h 127.0.0.1 -p $port -U $bootstrapRole -d postgres -X -q -v ON_ERROR_STOP=1 -f $setupFile *> (Join-Path $clusterDirectory 'setup.log')
    if ($LASTEXITCODE -ne 0) { throw 'Disposable parent database setup failed.' }
    $env:PGPASSWORD = $ownerPassword
    $actual = & (Join-Path $PostgresBin 'psql.exe') -h 127.0.0.1 -p $port -U $ownerRole -d $parentDatabase -X -At -v ON_ERROR_STOP=1 -c 'SELECT current_database(),current_user,inet_server_addr(),inet_server_port()'
    if ($LASTEXITCODE -ne 0 -or $actual -cne "$parentDatabase|$ownerRole|127.0.0.1|$port") { throw 'Disposable cluster identity or loopback check failed.' }
    $state = @{
        MIGRATION_TEST_DATABASE_URL = "postgresql://${ownerRole}:${ownerPassword}@127.0.0.1:$port/${parentDatabase}?sslmode=disable"
        ALLOW_MIGRATION_TEST_DATABASE = '1'
        ClusterId = $clusterId
        DataDirectory = $dataDirectory
        ParentDatabase = $parentDatabase
        OwnerRole = $ownerRole
        Port = $port
    }
    $state | ConvertTo-Json | Set-Content -LiteralPath $envFile -Encoding UTF8
    Protect-CredentialFile $envFile
    Write-Host "Owned loopback PostgreSQL cluster started on port $port."
    Write-Host "Ignored environment file: $envFile"
} catch {
    if ($started) { & $pgCtl -D $dataDirectory -m fast -w -t 30 stop *> (Join-Path $clusterDirectory 'shutdown.log') }
    throw
} finally {
    $env:PGPASSWORD = $previousPassword
    # No recursive deletion: retain the cluster, remove only generated password
    # material under its already-resolved exact directory.
    foreach ($credentialFile in @($passwordFile, $setupFile)) {
        if (Test-Path -LiteralPath $credentialFile) { Remove-Item -LiteralPath $credentialFile }
    }
}
