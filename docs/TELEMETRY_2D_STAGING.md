# STEP 2D.1: preparation only

No deployment or migration performed. Telemetry v1 remains frozen.
Migration091 fixes dropped envelope membership with nullable JSONB and the
existing RPC INSERT/SELECT/recordset mapping. Existing rows/envelopes without
membership remain valid (SQL NULL). Strict unchanged API allowlist:
FREE/PRO/PRO_PLUS, entitled boolean and seven known boolean entitlements.
Database CHECK also rejects missing/extra/invalid fields. No personal/payment
fields. No backfill. Event IDs, conflict handling, batch bounds, privileges,
RLS and gameplay keys remain unchanged; replay never overwrites first snapshot.
088–090 are untouched. Apply091 after090 after reviewing staging history.
DDL locks the table; function replacement needs review even in staging.
Local tests check SQL mapping/constraint contracts and mocked ingestion, not
real PostgreSQL persistence. Database execution/concurrency remain staging gates.

## Railway manual checklist

Do not Deploy/Apply staged changes or enable automatic deployment during
preparation. If environment/service creation immediately deploys in the current
UI, leave creation pending until deployment approval.

1. Sign in to owner account. Identify existing Rise project; record project name/
   ID, staging environment name/ID and Fastify service name/ID. No Railway database.
2. Select isolated staging environment/service. Review inherited/shared variables;
   replace production database/Redis references with staging values. Never edit
   shared production variables. Keep automatic deployment disabled/pending.
3. Root /server; config path /server/railway.toml. Build:
   npm ci --include=dev && npm run build. Start: npm start.
   Healthcheck /health/ready, timeout120s. Restart ON_FAILURE, max3.
   Single replica for stateful gameplay; disable sleeping during validation.
   No migration pre-deploy command.
4. Configure privately in staging service:

   | Variable | Value |
   | --- | --- |
   | NODE_ENV | development (current telemetry environment guard) |
   | RAILPACK_NODE_VERSION | 22 |
   | SUPABASE_URL | separate staging project URL |
   | SUPABASE_ANON_KEY | staging publishable/anon key |
   | SUPABASE_SERVICE_ROLE_KEY | staging server-only secret |
   | UPSTASH_REDIS_URL / UPSTASH_REDIS_TOKEN | isolated staging Redis |
   | ALLOWED_ORIGINS | exact staging browser origins, comma separated |
   | TELEMETRY_ENV | development |
   | TELEMETRY_ENABLED | false until separately approved staging test |
   | SOVEREIGN_ENABLED / MONARCH_ENABLED | false |
   | VIP_PLUS_5P_ENABLED / VIP_PRIVATE_CREW_ENABLED | false |

   Railway supplies PORT; existing server listens on0.0.0.0.
   Privately inspect production TELEMETRY_ENABLED remains false; do not change
   production. Checked-in server/client/EAS defaults remain OFF.
5. Public Networking: prepare HTTPS staging domain for this service and target
   port matching runtime PORT. Record domain. Never reuse production domain.
   Readiness checks users table; it does not verify telemetry schema.
6. Future Android preview: staging EXPO_PUBLIC_SERVER_URL, staging Supabase URL/
   anon key, EXPO_PUBLIC_TELEMETRY_ENV=development, telemetry false for now.
   No service-role, Redis or database connection secret in EXPO_PUBLIC.

## Supabase manual checklist

1. Select/create separate staging project; record name/ref. Existing linked
   TriplePoker (aeinnlaxscikarzupprn) is unverified; do not assume staging.
   Do not reset or copy production personal/player data into staging.
2. Verify baseline001–087 via history AND schema. Empty project is not ready.
   Never blindly replay historical files:031_economy_clean_reset.sql is destructive/
   manual-only. Missing baseline requires a separately reviewed preparation plan.
3. Configure staging SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
   privately on server; verify all belong to the staging project.
4. Staging Connect panel: direct PostgreSQL connection, or session pooler if
   direct IPv6 unavailable. Privately configure local process variable
   RISE_STAGING_DATABASE_URL with sslmode=require. Never paste URL/password/keys
   in chat, logs or Git. Never use this admin URL in client.
5. Privately compare connection host/username project ref to staging Connect
   panel. Confirm nonsecret Railway IDs, staging domain and Supabase project ref
   before any remote command.

## Migration-history verification and next command

ONLY AFTER owner confirms staging targets, run from C:\Dev\TriplePoker:

~~~powershell
$psqlExe = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
if (-not $env:RISE_STAGING_DATABASE_URL) { throw 'Staging connection is not configured' }
& $psqlExe $env:RISE_STAGING_DATABASE_URL -X -v ON_ERROR_STOP=1 -f server/scripts/telemetryStagingPreflight.sql
if ($LASTEXITCODE -ne 0) { throw 'Preflight failed; stop' }
~~~

This is BEGIN READ ONLY / ROLLBACK: review migration versions/names, actual
columns, constraints/indexes, RLS/privileges and RPC against088–091. CLI timestamp
versions may differ from local short filenames. SQL Editor/psql application may
not register CLI history: absent history does not prove files are unapplied.
Reconcile history and schema; do not repair history/rerun DDL blindly.
Local inventory/hash commands:

~~~powershell
node server/scripts/checkMigrationInventory.cjs
Get-FileHash supabase/migrations/08[89]_*.sql,supabase/migrations/09[01]_*.sql -Algorithm SHA256
~~~

Future migration commands require SEPARATE explicit migration approval after
preflight. Execute only verified unapplied files in order; STOP on each nonzero
exit. Files have their own transactions. If088–090 already verified applied,
only091 is needed. Never db push/reset an unverified linked project.

~~~powershell
& $psqlExe $env:RISE_STAGING_DATABASE_URL -X -v ON_ERROR_STOP=1 -f supabase/migrations/088_telemetry_foundation.sql
& $psqlExe $env:RISE_STAGING_DATABASE_URL -X -v ON_ERROR_STOP=1 -f supabase/migrations/089_telemetry_gameplay_funnel.sql
& $psqlExe $env:RISE_STAGING_DATABASE_URL -X -v ON_ERROR_STOP=1 -f supabase/migrations/090_telemetry_economy_receipts.sql
& $psqlExe $env:RISE_STAGING_DATABASE_URL -X -v ON_ERROR_STOP=1 -f supabase/migrations/091_telemetry_membership_persistence.sql
~~~

After future application: round-trip three plans and omitted membership; direct
RPC invalid/extra/missing fields must fail. Repeat/concurrently send same event
ID with changed snapshot: one original row retained. Verify gameplay keys,
anon/authenticated RLS denial and service-role RPC. Query membership alongside
properties; no personal/payment data.

Prepared real PostgreSQL round-trip assertions are in
server/tests/telemetry/membershipPersistence.sql (not run). They test FREE/PRO/
PRO_PLUS, omitted membership, invalid/sensitive snapshots and same-ID replay,
then ROLLBACK all fixtures. They require088–091 applied and separate test approval;
concurrent requests still require staging validation.

## Railway proxy/IP plan — trustProxy unchanged

After deployment approval, use controlled Wi-Fi and cellular networks with
disposable events. Existing request logs show Fastify remote address. Inspect
actual Railway ingress X-Forwarded-For, X-Forwarded-Proto, X-Forwarded-Host and
Forwarded if present using an approved temporary staging-only diagnostic/debugger.
No permanent/public diagnostic. Never log authorization, payload or secrets;
keep controlled test IP observations transient.

Compare socket remoteAddress, request.ip, request.ips and actual header chains.
Record edge replacement/appending, hop count and any direct-backend bypass.
Do not assume arbitrary forwarded headers trustworthy.
FromA send30 batch requests/min;31st should429/Retry-After60. B should still
succeed. Retry after reset. Spoof X-Forwarded-For fromA: must not bypassA quota.
Account for global180/min and sensitive30/min limits separately.
Shared proxy buckets or bypass must be demonstrated before proposing a narrow
trustProxy change. No change in2D.1.

References: [Railway monorepo](https://docs.railway.com/deployments/monorepo),
[Railway public networking](https://docs.railway.com/networking/public-networking),
[Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Local verification results

- Telemetry9 suites/82 tests pass (detectOpenHandles).
- Final scoped regression104 suites/933 tests pass; HN grace15/15 pass.
- First regression included Monarch-only releaseFeatures.test.ts because its
  filename escaped the initial filters; existing ProcessEnv/NODE_ENV type error
  caused1 suite compilation failure,104 suites/933 tests passed. No unrelated
  fix; final run explicitly excludes this frozen-scope test.
- Server production build, client typecheck and i18n104 en/th/zh-CN pass.
- Inventory001–091 and tracked/new-file whitespace checks pass. No lint script.
- PostgreSQL test fixture/preflight are prepared, NOT run. No remote operations.
