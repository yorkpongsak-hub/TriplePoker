# LOCAL fixtures only. Every invocation stops at GuardOnly before networking.
$ErrorActionPreference = 'Stop'
$diagnostic = Join-Path $PSScriptRoot 'Test-ProductionConnection.ps1'
function Read-Host { throw 'Fixture must not prompt for credentials or project identity.' }
$cases = @(
    @{ Name='Confirmed defaults'; Args=@{}; Valid=$true },
    @{ Name='Whitespace/case in host'; Args=@{HostName=' DB.AEINNLAXSCIKARZUPPRN.SUPABASE.CO ';UserName=' postgres '}; Valid=$true },
    @{ Name='Production session pooler'; Args=@{HostName='aws-0-ap-southeast-1.pooler.supabase.com';UserName='postgres.aeinnlaxscikarzupprn'}; Valid=$true },
    @{ Name='Staging direct refused'; Args=@{HostName='db.xuyttndedxahveewfwpj.supabase.co'}; Valid=$false },
    @{ Name='Staging pooler refused'; Args=@{HostName='aws-0-ap-southeast-1.pooler.supabase.com';UserName='postgres.xuyttndedxahveewfwpj'}; Valid=$false },
    @{ Name='Other project refused'; Args=@{HostName='db.other-project.supabase.co'}; Valid=$false },
    @{ Name='Wrong role refused'; Args=@{UserName='authenticated'}; Valid=$false },
    @{ Name='Connection URI refused'; Args=@{HostName='postgresql://not-a-host'}; Valid=$false }
)
foreach ($case in $cases) {
    $arguments = $case.Args
    $output = @(& $diagnostic @arguments -GuardOnly)
    $valid = @($output | Where-Object { $_ -match '^TARGET: TriplePoker \(aeinnlaxscikarzupprn\)' }).Count -eq 1
    if ($valid -ne $case.Valid) { throw ('Fixture failed: ' + $case.Name) }
    if ($valid -and @($output | Where-Object { $_ -match '^LOCAL_GUARD_ONLY:' }).Count -ne 1) {
        throw 'Valid fixture did not stop before network code.'
    }
    Write-Output ('PASS: ' + $case.Name)
}
Write-Output '8 local guard fixtures passed. No certificate/DNS/TCP/database operations.'
