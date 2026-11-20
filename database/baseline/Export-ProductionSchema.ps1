# PREPARED ONLY. Run manually after confirming the production Dashboard identity.
# No connection URI/password argument, no Supabase CLI/link, no restore command.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$expectedProductionRef = 'aeinnlaxscikarzupprn'
$stagingRef = 'xuyttndedxahveewfwpj'
$bin = 'C:\Program Files\PostgreSQL\18\bin'
$psql = Join-Path $bin 'psql.exe'
$dump = Join-Path $bin 'pg_dump.exe'
$catalog = Join-Path $PSScriptRoot 'production_schema_dependencies.sql'
foreach ($file in @($psql,$dump,$catalog)) {
    if (-not (Test-Path -LiteralPath $file)) { throw 'Required local file missing; stopped.' }
}
$dashboardName = Read-Host 'Production Dashboard project NAME (not a password)'
$dashboardRef = Read-Host 'Production Dashboard project REF (not a password)'
if ($dashboardName -cne 'TriplePoker' -or
    $dashboardRef -cne $expectedProductionRef -or $dashboardRef -eq $stagingRef) {
    throw 'Production Dashboard identity mismatch; no connection attempted.'
}
$dbHost = (Read-Host 'Host from that production Connect panel (HOST ONLY)').Trim()
$dbLogin = (Read-Host 'Username from that production Connect panel (USERNAME ONLY)').Trim()
$direct = $dbHost -eq "db.$expectedProductionRef.supabase.co" -and $dbLogin -eq 'postgres'
$session = $dbHost -match '^aws-[a-z0-9-]+\.pooler\.supabase\.com$' -and
    $dbLogin -eq "postgres.$expectedProductionRef"
if (-not ($direct -or $session)) {
    throw 'Host/username do not match production ref; no connection attempted.'
}
$certPath = Read-Host 'Local Supabase server root CA certificate path'
if (-not (Test-Path -LiteralPath $certPath -PathType Leaf)) {
    throw 'Root CA certificate missing; no connection attempted.'
}
$certPath = (Resolve-Path -LiteralPath $certPath).Path
$privateDirectory = Join-Path $env:LOCALAPPDATA (
    'RiseSchemaAudit\' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N')
)
New-Item -ItemType Directory -Path $privateDirectory | Out-Null
$rawSchema = Join-Path $privateDirectory 'triplepoker_current_schema.UNREVIEWED.sql'
$metadata = Join-Path $privateDirectory 'triplepoker_external_dependencies.UNREVIEWED.json'
$dumpDiagnostics = Join-Path $privateDirectory 'pg_dump.UNREVIEWED.stderr.txt'
$names = @('PGPASSWORD','PGSSLMODE','PGSSLROOTCERT','PGOPTIONS','PGHOSTADDR',
    'PGCONNECT_TIMEOUT','PGSERVICE','PGAPPNAME')
$saved = @{}
foreach ($name in $names) {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name,'Process')
}
$securePassword = Read-Host 'Production database password (hidden; no placeholder brackets)' -AsSecureString
if ($securePassword.Length -eq 0) {
    $securePassword.Dispose()
    throw 'Password was empty; no connection attempted.'
}
$pointer = [IntPtr]::Zero
try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $env:PGSSLMODE = 'verify-full'
    $env:PGSSLROOTCERT = $certPath
    $env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=60000 -c lock_timeout=5000'
    $env:PGCONNECT_TIMEOUT = '10'
    $env:PGAPPNAME = 'rise_schema_only_audit'
    Remove-Item Env:PGSERVICE -ErrorAction SilentlyContinue
    Remove-Item Env:PGHOSTADDR -ErrorAction SilentlyContinue
    $connectionArgs = @('-h',$dbHost,'-p','5432','-U',$dbLogin,'-d','postgres','-w')
    $identityArgs = $connectionArgs + @('-X','-A','-t','-q','-v','ON_ERROR_STOP=1',
        '-c',"BEGIN READ ONLY; SELECT current_database() || '|' || current_user || '|' || current_setting('transaction_read_only'); ROLLBACK;")
    # stderr stays off screen: never print native errors containing credentials.
    $ErrorActionPreference = 'Continue'
    $identity = & $psql @identityArgs 2>$null
    $identityExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($identityExit -ne 0 -or @($identity) -notcontains 'postgres|postgres|on') {
        throw 'Read-only identity/TLS check failed; no extraction performed.'
    }
    Write-Output "Verified production routing: $expectedProductionRef; database postgres; role postgres; read-only on."
    $dumpArgs = $connectionArgs + @('--schema-only','--schema=public','--strict-names',
        '--format=plain','--encoding=UTF8','--quote-all-identifiers','--no-owner',
        '--no-comments','--no-security-labels','--no-publications','--no-subscriptions',
        '--no-large-objects','--no-tablespaces','--lock-wait-timeout=5s',
        '--exclude-table=public.*_backup_pre_economy_reset',"--file=$rawSchema")
    $ErrorActionPreference = 'Continue'
    & $dump @dumpArgs 2>$dumpDiagnostics
    $dumpExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($dumpExit -ne 0) {
        throw 'Schema export failed; any partial private file is not usable. Errors suppressed.'
    }
    if ((Get-Item -LiteralPath $dumpDiagnostics).Length -gt 0) {
        throw 'pg_dump emitted private diagnostics. Inspect locally; do not accept/promote this snapshot yet.'
    }
    $metadataArgs = $connectionArgs + @('-X','-A','-t','-q','-v','ON_ERROR_STOP=1',
        '-f',$catalog,'-o',$metadata)
    $ErrorActionPreference = 'Continue'
    & $psql @metadataArgs 2>$null
    $metadataExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($metadataExit -ne 0) {
        throw 'Dependency metadata export failed; snapshot is incomplete. Errors suppressed.'
    }
    # Detect an accidentally embedded copy of this password without printing it.
    foreach ($file in @($rawSchema,$metadata)) {
        $content = [IO.File]::ReadAllText($file)
        if ($content.Contains($env:PGPASSWORD)) {
            throw 'Credential-like content detected in private metadata. Do not share/promote files.'
        }
    }
    Write-Output 'Extraction finished; files remain PRIVATE and UNREVIEWED. STOP; do not restore.'
    Write-Output "Private schema: $rawSchema"
    Write-Output "Private dependencies: $metadata"
    Get-FileHash -LiteralPath $rawSchema,$metadata -Algorithm SHA256 | Select-Object Path,Hash
} finally {
    foreach ($name in $names) {
        [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')
    }
    if ($pointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
    $securePassword.Dispose()
}
