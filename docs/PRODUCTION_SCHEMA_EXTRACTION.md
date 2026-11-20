# Production schema extraction — preparation only

Nothing connected to production or staging. No export/restore/migration/deploy
performed. Only local script preparation, syntax checks, installed pg_dump18.4
help/version inspection and offline synthetic scanner fixtures were executed.
Do not replay001–087 or invoke Supabase link/db push/reset.

## 1. Identity guard

Expected production project: TriplePoker, ref aeinnlaxscikarzupprn.
Expected staging ref (explicitly refused): xuyttndedxahveewfwpj.
Production ref is a previously observed local metadata identifier, not an
independent live verification. Owner must first compare BOTH name and ref in
the production Dashboard. The script does not read or trust the local link.
If Dashboard differs, STOP; do not edit the guard to fit an unexplained mismatch.

The script requires the owner to type Dashboard name/ref, then validates the
Connect panel host/username BEFORE connecting:
- Direct preferred: db.aeinnlaxscikarzupprn.supabase.co / postgres /5432.
- IPv4 alternative: actual Dashboard aws-*.pooler.supabase.com session-pooler
  host / postgres.aeinnlaxscikarzupprn /5432.
- No6543 transaction pooler; no custom proxy/domain/URI accepted.

TLS verify-full validates hostname against the supplied trusted root CA.
Then psql -X -w runs BEGIN READ ONLY, reads current_database/current_user/
transaction_read_only, and ROLLBACK. Must be postgres|postgres|on before dumping.
postgres alone does not distinguish projects; host/ref routing plus independent
Dashboard confirmation is the identity evidence. No SQL project-name guess.

## 2. Exact manual extraction

1. Open the existing production TriplePoker Dashboard and confirm name/ref.
2. Connect panel: prefer Direct; use Session pooler only if direct IPv6 is not
   reachable. Copy only host and username for prompts; never paste the URI.
3. Download the trusted server root CA certificate from Supabase Database SSL
   settings to a local file. No need to change SSL settings. Configure the
   certificate matching that endpoint. If pooler certificate verification fails,
   STOP and verify its trust chain; do not downgrade to unverified TLS.
4. Choose a quiet schema-change window (no DDL migration running), not necessarily
   an idle-player window. pg_dump takes a consistent read snapshot and shared
   table locks; normal DML continues, DDL may contend. Script waits at most5s
   for a table lock, uses60s statement timeout and one ordinary dump connection.
5. Run manually from your existing PowerShell, only when ready to extract:

~~~powershell
Set-Location -LiteralPath 'C:\Dev\TriplePoker'
& .\database\baseline\Export-ProductionSchema.ps1
~~~

Script prompts for nonsecret Dashboard identity, HOST ONLY, USERNAME ONLY,
certificate path, then Read-Host -AsSecureString for the database password.
Enter raw password privately without placeholder brackets; no percent encoding
or URI parsing is needed. Prompted password is not typed into command history,
not printed, not an argument and not embedded in the dump.

It temporarily supplies PGPASSWORD to child processes, restores previous process
variables in finally and wipes the BSTR buffer. No global/user environment write,
password file or saved connection URI. Same-user/admin processes can inspect
environment/memory: run on the trusted local machine, do not use a shared shell
or attach logs/transcripts/screenshots containing credentials.

Native errors are suppressed on screen. pg_dump stderr is captured in the
private quarantine folder; any diagnostics, even warnings, stop acceptance.
Inspect that file locally only; do not paste raw diagnostics into chat.
Failure means partial snapshot unusable, not permission to retry a weaker guard.

The command executed internally is pg_dump18.4 with:

~~~text
--schema-only --schema=public --strict-names --format=plain --encoding=UTF8
--quote-all-identifiers --no-owner --no-comments --no-security-labels
--no-publications --no-subscriptions --no-large-objects --no-tablespaces
--lock-wait-timeout=5s --exclude-table=public.*_backup_pre_economy_reset
~~~

Connection uses separate -h/-p/-U/-d arguments, -w, PGSSLMODE=verify-full,
PGSSLROOTCERT and PGOPTIONS default_transaction_read_only=on.
No --clean, --create, --data-only, --inserts, --sequence-data, --large-objects,
no parallel workers, no ownership/password/global-role export. Grants are
retained: deliberately do NOT use --no-privileges.

Catalog-only production_schema_dependencies.sql is run afterward in a separate
READ ONLY / ROLLBACK transaction. It selects pg_* metadata, not auth/public/
storage rows, and writes extension identities, auth.users trigger definitions/
handler identities and owners, external dependencies and foreign-table names.
DDL happening between these snapshots invalidates the combined assumption;
review/re-extract if schema changed during capture.

After extraction STOP. Do not automatically restore or promote files.

## 3. Artifact scope and filenames

Raw outputs remain outside Git under:
%LOCALAPPDATA%\RiseSchemaAudit\<timestamp-guid>\
- triplepoker_current_schema.UNREVIEWED.sql
- triplepoker_external_dependencies.UNREVIEWED.json
- pg_dump.UNREVIEWED.stderr.txt (private diagnostics, not a baseline artifact)

The first two filenames and SHA256s are printed; SQL/passwords are not.
No final baseline SQL exists until offline review confirms secret-free content.
Proposed approved artifacts AFTER review:
- database/baseline/triplepoker_current_schema.sql
- database/baseline/triplepoker_external_dependencies.json
- database/baseline/triplepoker_current_schema.sha256
- separate reviewed application auth-profile trigger supplement if required.

Includes public table structure, columns/defaults/generated expressions, PK/FK/
unique/CHECK constraints, indexes, sequences/identity definitions (no current
sequence values), types/views as applicable, functions/RPC definitions, triggers
ON public tables, RLS enable/force settings/policies, object grants/default ACL.
No owner restoration: compare original ownership/security behavior before later
restore, particularly SECURITY DEFINER functions and platform-owned default ACL.
CREATE SCHEMA public may appear although staging already has public; resolve
that statement deliberately in a reviewed staging-specific baseline, not by
adding a blanket IF EXISTS/drop/reset or ignoring all errors.

Public legacy/frozen structures may be captured for compatibility; flags remain
OFF. Capture is not feature activation. Historical reset backup tables matching
*_backup_pre_economy_reset are excluded; unknown backup/obsolete structures are
review candidates, not automatically deleted/pruned from source.

## 4. Exclusions and external dependencies

No player/profile rows, auth users/identities/sessions, ledger/history, inventory
balances, reward receipts, storage objects, table data/statistics, sequence setval
or large objects. No auth/storage/vault/realtime/internal schema definitions.
No database/role creation or role passwords, publication/subscription replication
setup, comments/security labels/tablespace ownership.

Do NOT blindly copy:
- Supabase auth platform tables/functions/triggers/roles. Fresh staging already
  provides auth.users and auth.uid(). A custom app profile-provisioning trigger
  ON auth.users is OUTSIDE public and omitted by public-only pg_dump even if its
  handler is public. Metadata identifies it for explicit review; only the verified
  app-owned trigger is proposed as a supplement. If handler is outside public,
  definition is missing: STOP for a separately reviewed metadata acquisition,
  do not copy all auth functions. Preserve trigger enabled state.
- storage schema, buckets/object rows or files. avatars bucket settings/policies
  are a separate manual staging requirement, not copied objects/player images.
- Extension-owned functions/objects. Metadata lists extension/version/schema;
  compare supported staging versions and enable necessary extensions through the
  supported workflow later. pg_dump --schema does not guarantee outside-schema
  dependencies are included. Never duplicate extension internals.
- Platform owners/custom roles/default ACL and Supabase grants. Standard anon/
  authenticated/service_role roles exist in staging; unknown roles must be reviewed,
  not recreated from a production cluster/password dump.
- Foreign tables/FDWs/servers/user mappings, vault/pg_net/http calls, project URLs,
  cron hooks or embedded credentials. Function bodies/defaults/views/policies can
  contain secrets or personal constants even when no rows are exported. Review
  before sharing. Do not alter financial function logic just to silence a scanner.
- Publication membership, cron jobs, Edge Functions, Auth providers/redirect URLs,
  platform configuration and storage bucket data are NOT reproduced by this dump.
  Document only dependencies needed for the approved staging flows.

## 5. Offline secret and data checks

Native schema-only export omits row data, but is NOT a guarantee all function/
view/default literal text is secret-free. Raw files remain PRIVATE/UNREVIEWED.
Extraction checks for the entered password without printing it; any hit stops.
Offline scanner checks JWT/private-key/secret-key/credential-URI/assigned-secret
patterns in SQL and metadata, returning categories/counts only.
It also flags data/reset statements outside ordinary dollar-quoted function
bodies, sequence setval, database/roles, foreign credentials and platform DDL.
Scanner is deliberately a heuristic, NOT a full PostgreSQL parser or guarantee:
manual content/secret review is mandatory even with0 hits.

Use the exact paths printed by extraction:

~~~powershell
$schemaPath = Read-Host 'Private UNREVIEWED SQL file path'
$metadataPath = Read-Host 'Private UNREVIEWED metadata JSON file path'
& .\database\baseline\Review-SchemaArtifact.ps1 -SchemaPath $schemaPath -MetadataPath $metadataPath
Get-FileHash -LiteralPath $schemaPath,$metadataPath -Algorithm SHA256
~~~

Open files in a local editor (not an SQL execution tool). Check:
- No top-level COPY ... FROM stdin / INSERT VALUES / UPDATE / DELETE / TRUNCATE,
  SELECT setval, TABLE DATA or SEQUENCE SET sections, row payloads or COPY terminator.
- Legitimate INSERT/UPDATE inside stored RPC bodies are STRUCTURE and must remain;
  raw text grep alone must not reject/remove the working economy/claim algorithm.
- No password/API key/JWT/payment credential, person-specific email/identifier,
  credential-bearing connection URL, private key or production external-call
  secret in functions/views/defaults/policies/options.0 automated hits is not proof.
- Public object ACL/RLS/signatures and no accidental omitted grant/sequence usage.
- Catalog JSON contains metadata only. Trigger arguments can hold constants;
  treat it as unreviewed too. Do not send raw files or diagnostic logs to chat yet.

Only after review passes, separately promote to the proposed final paths. Retain
original raw hash and final sanitized/reconciled hash with source identity/date,
pg_dump version/options, and every change explained. No silent redaction of a
required credential/function dependency: mark the missing configuration explicitly.

Final artifact hash commands (after approval/promotion, not executed now):

~~~powershell
Get-FileHash -LiteralPath database/baseline/triplepoker_current_schema.sql -Algorithm SHA256
Get-FileHash -LiteralPath database/baseline/triplepoker_external_dependencies.json -Algorithm SHA256
~~~

## 6. Comparison against dependency manifest

Review-SchemaArtifact.ps1 compares public CREATE TABLE/FUNCTION names against
docs/TELEMETRY_STAGING_SCHEMA_DEPENDENCIES.json and lists ONLY known missing
manifest names. Manifest includes gated/dormant callers: absence is classified,
not automatically a launch bug. telemetry_ingest_events is expected absent until
088/089; dormant set_user_tokens remains a separate recorded compatibility gap.

Then manually inspect exact signatures/return types, profile columns/defaults/
PK/auth FK, user_inventory unique pair/fields, ledger FK join and final9-arg RPC,
receipt uniqueness, six-item CHECKs, claimed_at/reward_slot/granted_quantity,
freeze-duration trigger,070 claim/ad-wrapper contract before090, RLS/ACL and
identity sequence grants. Regex name coverage cannot establish semantic equality.
Missing app-owned auth profile provisioning is a hard baseline blocker.
No application or frozen feature code is modified by this review.

## 7. NEXT separately approved staging restore plan (not now)

1. Owner confirms reviewed SQL/metadata/hash and staging ref xuyttndedxahveewfwpj.
2. Reconcile public schema creation/ownership/default ACL with managed staging;
   separately approve extensions, app-owned auth trigger and needed bucket settings.
   Do not execute managed auth/storage definitions or raw dump wholesale.
3. Verify staging is empty of application data and has no conflicting baseline.
   Restore only reviewed baseline DDL, fail on first error, transaction where
   supported. No --clean/DROP/database reset or ignored-error workaround.
4. Explicit reference seeds/economy bootstrap AFTER structural verification, using
   final authoritative RPCs. Schema dump supplies no reference rows or balances.
5. Test registration/profile/ACL/ledger/receipts; verify090 prerequisite contract.
   Then approve088→089→090→091 separately if unapplied.
6. No production restore/migration or Railway deployment in this procedure.

Future shape only (credentials supplied privately by a guarded staging wrapper;
not a command to execute yet):

~~~powershell
& $psqlExe @verifiedStagingArgs -X -w -v ON_ERROR_STOP=1 --single-transaction -f database/baseline/triplepoker_current_schema.sql
~~~

Do not set read-only off in production extraction script or repurpose it to restore.
After extraction/reporting, STOP for schema review and separate restore approval.

References:
[PostgreSQL pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html),
[Supabase connections and TLS](https://supabase.com/docs/guides/database/connecting-to-postgres),
[libpq environment variables](https://www.postgresql.org/docs/18/libpq-envars.html).

## Diagnostic-only follow-up after identity/TLS failure

Prepared database/baseline/Test-ProductionConnection.ps1; not executed by agent.
The original generic message occurs if psql exits nonzero OR captured stdout
lacks exact postgres|postgres|on. It does not establish a TLS-specific cause.
Host/ref and missing-CA guards fail earlier with different messages.

Manual command (no extraction):

~~~powershell
Set-Location -LiteralPath 'C:\Dev\TriplePoker'
& .\database\baseline\Test-ProductionConnection.ps1 -RootCA 'C:\Users\psm_y\Downloads\prod-ca-2021.crt'
~~~

Confirm production ref when prompted, then enter password hidden only if TCP
connectivity succeeds. Reports DNS IPv4/IPv6 counts and TCP statuses without IPs,
local CA readability/validity, then verify-full psql identity READ ONLY/ROLLBACK.
Raw stdout/stderr remain memory-only; errors classified into fixed sanitized
categories. No pg_dump, output files, SQL writes, staging/local link/deploy action.
Password is only in child environment, no argument/URI or parent/global setting.
Unknown errors remain UNCLASSIFIED rather than leaking text or weakening TLS.
No extraction retry authorized by a successful diagnostic. STOP after reporting.
PowerShell syntax/whitespace checks pass locally; no network/TLS/auth test run.

## Simplified diagnostic guard (latest instructions)

Production name/ref/known direct endpoint were already correct. The old guard
unnecessarily asked for confirmedRef again and compared it case-sensitively
without trimming: blank, whitespace-padded or project-name answers caused TARGET
MISMATCH even with valid default host/user. Actual input was not captured, so its
specific form is unknown. Removed redundant project-ref prompt; owner-confirmed
TriplePoker/ref is fixed. Host/user parameters are normalized and staging/other
projects remain fail-closed. Certificate path defaults to the confirmed file;
only missing-certificate path and hidden database password are prompted.

One manual diagnostic command, from any PowerShell working directory:

~~~powershell
& 'C:\Dev\TriplePoker\database\baseline\Test-ProductionConnection.ps1'
~~~

GuardOnly exists solely for local fixtures and returns before certificate/DNS/
TCP/database operations.8 fixtures pass for confirmed defaults, whitespace/case,
production session pooler, staging direct/pooler rejection, other project, wrong
role and URI rejection. Mock Read-Host rejects any unexpected fixture prompt.
No actual diagnostic/network/database operation was executed by the agent.
Verify-full TLS and READ ONLY/ROLLBACK remain unchanged. No extraction retry.

Windows PowerShell5.1 compatibility: Test-ProductionConnection.ps1 must retain
UTF-8 BOM because its prompts contain Thai. Fixed prior no-BOM encoding; verified
parser and8 GuardOnly fixtures with actual Windows PowerShell5.1, no networking.
Earlier PowerShell7 checks did not detect the legacy decoder problem.
