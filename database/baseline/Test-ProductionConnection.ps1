# Diagnostic only. Run manually. No dump, extraction, SQL writes or output files.
[CmdletBinding()]
param(
    [string]$HostName = 'db.aeinnlaxscikarzupprn.supabase.co',
    [string]$UserName = 'postgres',
    [string]$RootCA = 'C:\Users\psm_y\Downloads\prod-ca-2021.crt',
    [switch]$GuardOnly
)
$ErrorActionPreference = 'Stop'
$expectedRef = 'aeinnlaxscikarzupprn'
$expectedName = 'TriplePoker'
$stagingRef = 'xuyttndedxahveewfwpj'
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
# Owner already confirmed name/ref. Do not ask them to retype a technical ID.
# Normalize nonsecret endpoint parameters only; never normalize the password.
$HostName = $HostName.Trim().ToLowerInvariant()
$UserName = $UserName.Trim()
$direct = $HostName -eq "db.$expectedRef.supabase.co" -and $UserName -eq 'postgres'
$session = $HostName -match '^aws-[a-z0-9-]+\.pooler\.supabase\.com$' -and
    $UserName -eq "postgres.$expectedRef"
if ($HostName.Contains($stagingRef) -or $UserName.Contains($stagingRef) -or
    -not ($direct -or $session)) {
    Write-Output 'TARGET: MISMATCH; no DNS/database connection attempted.'
    return
}
Write-Output "TARGET: $expectedName ($expectedRef); production routing matched; staging refused."
if ($GuardOnly) {
    Write-Output 'LOCAL_GUARD_ONLY: stopped before certificate, DNS, TCP or database operations.'
    return
}
if (-not (Test-Path -LiteralPath $psql -PathType Leaf)) {
    Write-Output 'PSQL: MISSING; stopped.'
    return
}
if (-not (Test-Path -LiteralPath $RootCA -PathType Leaf)) {
    $RootCA = Read-Host 'ไม่พบไฟล์ certificate เดิม กรุณาวาง path ของ production Root CA (ไม่ใช่ password)'
    if (-not (Test-Path -LiteralPath $RootCA -PathType Leaf)) {
        Write-Output 'ROOT_CA: MISSING; stopped.'
        return
    }
}
try {
    $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
        (Resolve-Path -LiteralPath $RootCA).Path)
    $validNow = (Get-Date) -ge $cert.NotBefore -and (Get-Date) -le $cert.NotAfter
    if (-not $validNow) {
        Write-Output 'ROOT_CA: OUTSIDE_VALIDITY_WINDOW; stopped.'
        return
    }
    Write-Output 'ROOT_CA: readable X.509 certificate, within validity window. Chain validation pending.'
} catch {
    Write-Output 'ROOT_CA: UNREADABLE_OR_INVALID_CERTIFICATE; stopped.'
    return
} finally {
    if ($cert) { $cert.Dispose() }
}
try {
    $addresses = @([Net.Dns]::GetHostAddresses($HostName))
} catch {
    Write-Output 'DNS: FAILED; TLS/authentication/identity not tested.'
    return
}
$v4 = @($addresses | Where-Object AddressFamily -eq ([Net.Sockets.AddressFamily]::InterNetwork))
$v6 = @($addresses | Where-Object AddressFamily -eq ([Net.Sockets.AddressFamily]::InterNetworkV6))
Write-Output ("DNS: resolved; IPv4 addresses={0}; IPv6 addresses={1}" -f $v4.Count,$v6.Count)
$reachable = @()
foreach ($family in @('IPv4','IPv6')) {
    $candidates = if ($family -eq 'IPv4') { $v4 } else { $v6 }
    if ($candidates.Count -eq 0) {
        Write-Output ("TCP {0}: NO_DNS_ADDRESS" -f $family)
        continue
    }
    $success = $false
    $lastStatus = 'FAILED'
    foreach ($address in @($candidates | Select-Object -First 2)) {
        $client = New-Object Net.Sockets.TcpClient($address.AddressFamily)
        try {
            $task = $client.ConnectAsync($address,5432)
            if (-not $task.Wait(5000)) {
                $lastStatus = 'TIMEOUT'
            } elseif ($client.Connected) {
                $success = $true
                $reachable += $address
                break
            }
        } catch {
            # Fixed categories only; never print exception text or endpoint details.
            $exception = $_.Exception
            while ($exception.InnerException) { $exception = $exception.InnerException }
            $lastStatus = if ($exception -is [Net.Sockets.SocketException]) {
                switch ($exception.SocketErrorCode.ToString()) {
                    'NetworkUnreachable' { 'NETWORK_UNREACHABLE' }
                    'HostUnreachable' { 'HOST_UNREACHABLE' }
                    'ConnectionRefused' { 'CONNECTION_REFUSED' }
                    default { 'SOCKET_FAILED' }
                }
            } else { 'FAILED' }
        } finally { $client.Dispose() }
    }
    $status = if ($success) { 'CONNECTED' } else { $lastStatus }
    Write-Output ("TCP {0} port5432: {1}" -f $family,$status)
}
if ($reachable.Count -eq 0) {
    Write-Output 'CONNECTIVITY: no successful route. TLS/authentication/identity not tested.'
    Write-Output 'IPv6-only DNS plus failed IPv6 TCP is consistent with a routing/firewall/IPv6 problem; it does not prove which.'
    return
}
$secure = Read-Host 'กรอกรหัสผ่านฐานข้อมูล TriplePoker production (ซ่อนตัวอักษร ไม่ใส่วงเล็บ)' -AsSecureString
if ($secure.Length -eq 0) {
    $secure.Dispose()
    Write-Output 'AUTH: EMPTY_PASSWORD; stopped.'
    return
}
$pointer = [IntPtr]::Zero
$process = $null
$psi = $null
$started = $false
try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = $psql
    # Guarded host/user are whitespace-free; password never appears in arguments.
    $psi.Arguments = "-h $HostName -p 5432 -U $UserName -d postgres -X -w -A -t -q -v ON_ERROR_STOP=1 -f -"
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    foreach ($name in @('PGSERVICE','PGHOSTADDR','PGSSLCERT','PGSSLKEY','PGSSLPASSWORD')) {
        $psi.EnvironmentVariables.Remove($name)
    }
    $psi.EnvironmentVariables['PGPASSWORD'] = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $psi.EnvironmentVariables['PGSSLMODE'] = 'verify-full'
    $psi.EnvironmentVariables['PGSSLROOTCERT'] = (Resolve-Path -LiteralPath $RootCA).Path
    $psi.EnvironmentVariables['PGHOSTADDR'] = $reachable[0].ToString()
    $psi.EnvironmentVariables['PGCONNECT_TIMEOUT'] = '10'
    $psi.EnvironmentVariables['PGOPTIONS'] = '-c default_transaction_read_only=on -c statement_timeout=10000'
    $psi.EnvironmentVariables['PGAPPNAME'] = 'rise_readonly_connection_diagnostic'
    $psi.EnvironmentVariables['LC_ALL'] = 'C'
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $psi
    [void]$process.Start()
    $started = $true
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.WriteLine("BEGIN READ ONLY; SELECT current_database() || '|' || current_user || '|' || current_setting('transaction_read_only'); ROLLBACK;")
    $process.StandardInput.Close()
    if (-not $process.WaitForExit(30000)) {
        $process.Kill()
        $process.WaitForExit()
        Write-Output 'PSQL: TIMEOUT; no extraction performed.'
        return
    }
    $output = $stdoutTask.GetAwaiter().GetResult()
    $privateError = $stderrTask.GetAwaiter().GetResult()
    Write-Output ("PSQL_EXIT: {0}" -f $process.ExitCode)
    if ($process.ExitCode -eq 0) {
        Write-Output 'TLS: verify-full succeeded.'
        Write-Output 'AUTH: succeeded.'
        $lines = @($output -split '\r?\n' | ForEach-Object { $_.Trim() })
        if ($lines -contains 'postgres|postgres|on') {
            Write-Output 'IDENTITY: database=postgres; role=postgres; read_only=on; MATCH.'
        } else {
            Write-Output 'IDENTITY: MISMATCH_OR_UNEXPECTED_OUTPUT; raw output suppressed.'
            $identityLines = @($lines | Where-Object { $_ -match '^[^|]+\|[^|]+\|(on|off)$' })
            if ($identityLines.Count -eq 1) {
                $parts = $identityLines[0] -split '\|'
                Write-Output ("DATABASE_MATCH: {0}; USER_MATCH: {1}; READ_ONLY_ON: {2}" -f
                    ($parts[0] -eq 'postgres'),($parts[1] -eq 'postgres'),($parts[2] -eq 'on'))
            }
        }
    } elseif ($privateError -match '(?i)certificate verify failed|certificate verification|root certificate|does not match host name|SSL error|TLS error') {
        Write-Output 'TLS: ROOT_CA_CHAIN_HOSTNAME_OR_PROTOCOL_FAILURE.'
        Write-Output 'AUTH/IDENTITY: not established; no insecure retry attempted.'
    } elseif ($privateError -match '(?i)password authentication failed|authentication failed|no password supplied|SASL authentication failed') {
        Write-Output 'TLS: no certificate failure reported; verify-full was requested.'
        Write-Output 'AUTH: REJECTED; identity not established.'
    } elseif ($privateError -match '(?i)tenant or user not found|database .* does not exist|role .* does not exist') {
        Write-Output 'ROUTING: PROJECT_TENANT_DATABASE_OR_ROLE_REJECTED.'
    } elseif ($privateError -match '(?i)could not translate host name|name or service not known|nodename nor servname') {
        Write-Output 'DNS: PSQL_RESOLUTION_FAILED.'
    } elseif ($privateError -match '(?i)network is unreachable|no route to host|connection refused|connection timed out|timeout expired|could not connect') {
        Write-Output 'NETWORK: PSQL_CONNECTIVITY_FAILED_AFTER_TCP_PROBE.'
    } else {
        Write-Output 'PSQL: UNCLASSIFIED_CONNECTION_OR_QUERY_ERROR; raw diagnostics suppressed.'
    }
    Write-Output 'STOP. Diagnostic only; no dump/extraction/migration/restore.'
} catch {
    Write-Output 'DIAGNOSTIC: LOCAL_PROCESS_OR_IO_FAILURE; raw error suppressed.'
} finally {
    if ($process) {
        if ($started -and -not $process.HasExited) { $process.Kill() }
        $process.Dispose()
    }
    if ($psi) { $psi.EnvironmentVariables['PGPASSWORD'] = '' }
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $secure.Dispose()
}
