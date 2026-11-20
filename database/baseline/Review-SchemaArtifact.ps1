# Offline inspection only; never executes SQL. Never prints matching contents.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$SchemaPath,
    [Parameter(Mandatory=$true)][string]$MetadataPath
)
$ErrorActionPreference = 'Stop'
$manifestPath = Join-Path $PSScriptRoot '..\..\docs\TELEMETRY_STAGING_SCHEMA_DEPENDENCIES.json'
$sql = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $SchemaPath).Path)
$metadataText = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $MetadataPath).Path)
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$metadata = $metadataText | ConvertFrom-Json
$secretPatterns = [ordered]@{
    jwt = '\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}'
    privateKey = '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'
    secretKey = '\b(?:sb_secret_|sk_live_|sk_test_|rk_live_|rk_test_)[A-Za-z0-9_-]{8,}'
    connectionPassword = '(?:postgres(?:ql)?|redis|rediss)://[^\s''"]+:[^\s''"]+@'
    assignedSecret = '(?i)(?:password|api_key|service_role_key|access_token|secret_key)\s*(?:=|:=|:)\s*[''"][^''"]{4,}[''"]'
}
$secretHits = 0
foreach ($entry in $secretPatterns.GetEnumerator()) {
    $count = [regex]::Matches($sql + [Environment]::NewLine + $metadataText,$entry.Value).Count
    Write-Output ("Secret scan category {0}: {1} candidate(s)" -f $entry.Key,$count)
    $secretHits += $count
}
# Heuristic, not a complete PostgreSQL parser: final manual review is mandatory.
# Routine bodies can contain legitimate INSERT/UPDATE/COPY; do not strip them
# from the actual artifact merely because a raw text search matches them.
$withoutBodies = [regex]::Replace($sql,'(?s)(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$).*?\1',' <ROUTINE_BODY> ')
$withoutBodies = [regex]::Replace($withoutBodies,"(?s)'(?:''|[^'])*'"," <STRING> ")
$withoutBodies = [regex]::Replace($withoutBodies,'(?s)/\*.*?\*/',' ')
$withoutBodies = [regex]::Replace($withoutBodies,'(?m)--[^\r\n]*',' ')
$dataPatterns = [ordered]@{
    dataOrReset = '(?i)\b(?:COPY|INSERT|UPDATE|DELETE|TRUNCATE)\b'
    sequenceValues = '(?i)\bsetval\s*\('
    databaseOrRoles = '(?i)\b(?:CREATE|ALTER|DROP)\s+(?:DATABASE|ROLE|USER)\b'
    foreignCredentials = '(?i)\b(?:CREATE|ALTER)\s+(?:SERVER|USER MAPPING)\b'
    platformSchema = '(?i)\bCREATE\s+(?:TABLE|FUNCTION|PROCEDURE|SCHEMA)\s+"?(?:auth|storage|vault|realtime)"?(?:\.|\s|;)'
    dataHeader = '(?im)^--.*Type: (?:TABLE DATA|SEQUENCE SET)'
}
$dataHits = 0
foreach ($entry in $dataPatterns.GetEnumerator()) {
    $text = if ($entry.Key -eq 'dataHeader') { $sql } else { $withoutBodies }
    $count = [regex]::Matches($text,$entry.Value).Count
    Write-Output ("Content scan category {0}: {1} candidate(s)" -f $entry.Key,$count)
    $dataHits += $count
}
$objectPattern = '(?i)\bCREATE\s+(?:OR\s+REPLACE\s+)?(TABLE|FUNCTION|PROCEDURE)\s+(?:public|"public")\.(?:"([^"]+)"|([a-z_][a-z0-9_$]*))'
$tables = @()
$rpcs = @()
foreach ($match in [regex]::Matches($withoutBodies,$objectPattern)) {
    $name = if ($match.Groups[2].Success) { $match.Groups[2].Value } else { $match.Groups[3].Value }
    if ($match.Groups[1].Value -ieq 'TABLE') { $tables += $name } else { $rpcs += $name }
}
foreach ($table in $manifest.tables) {
    if ($table.name -notin $tables) { Write-Output ("Manifest table absent (classify active/gated/dormant): " + $table.name) }
}
foreach ($rpc in $manifest.rpcs) {
    if ($rpc.name -notin $rpcs) { Write-Output ("Manifest RPC absent (classify active/gated/dormant): " + $rpc.name) }
}
Write-Output ("Auth-user trigger metadata entries: " + @($metadata.external_auth_triggers).Count)
Write-Output ("External dependency metadata entries: " + @($metadata.public_external_dependencies).Count)
Write-Output ("Foreign tables requiring separate review: " + @($metadata.public_foreign_tables).Count)
Get-FileHash -LiteralPath $SchemaPath,$MetadataPath -Algorithm SHA256 | Select-Object Path,Hash
if ($secretHits -gt 0 -or $dataHits -gt 0) {
    throw 'Review candidates found. Keep files private; do not share/promote/restore.'
}
Write-Output 'No automated candidates found. Manual secret/content/signature/ACL review still REQUIRED. STOP; no restore.'
