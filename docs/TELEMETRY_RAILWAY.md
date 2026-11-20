# Rise telemetry foundation (2A), with 2B update

Current staging preparation and membership persistence fix: see
[STEP2D.1 checklist](TELEMETRY_2D_STAGING.md). Migration091 is required after090
to persist optional envelope membership. Earlier sections record checkpoint
history; no migration/deployment has been performed.

Status: implementation only. No live database migration, Railway account mutation,
deployment or production activation has been performed. 2B producers are now implemented.
Telemetry remains disabled by default on both client and server. See TELEMETRY_2B.md for current exact payloads, authority, session definitions, limits and files changed. Historical 2A details below are superseded by this 2B update.

## Architecture and limits

Reuse the existing Fastify API on Railway and existing Supabase PostgreSQL.
No additional database, Redis queue, dashboard or third-party analytics SDK.
`expo-crypto` supplies UUIDs; AsyncStorage persists the client queue.

Only these version-1 events are accepted in 2A: `app_open`, `session_start`,
`session_end`, `telemetry_upload_failure`. Gameplay, economy and funnel schemas
will be added only after 2B approval. No lifecycle events are automatically emitted
yet. Queue `start`, `stop`, `enqueue` and `flush` are explicit APIs for that stage.

`POST /telemetry/batch` accepts `{ "events": [...] }`, 1–20 events, maximum 64 KiB.
Each event requires event/player/session UUIDs, schema version, UTC occurred time,
app version, platform and strictly allowlisted properties. Optional build number
is supported by the contract; the current wrapper does not infer a native build
number from an OTA manifest. Environment and source are stamped by the server.
Client timestamps more than five minutes in the future are rejected.

Success is HTTP 200 with `{ "acknowledged": ["uuid"], "rejected": [
{ "index": 1, "reason": "INVALID_EVENT" } ] }`. Rejected events may also include
their UUID for a future timestamp. A mixed batch saves valid events and reports
invalid indices. An all-invalid batch returns no acknowledgments. An empty or
oversized envelope is HTTP 400; a body over the byte limit is HTTP 413.
There are no raw validation messages, submitted values or database errors in replies.

The primary key deduplicates repeated event IDs with `ON CONFLICT DO NOTHING` via
the service-role-only telemetry_ingest_events RPC from migration 089, which also deduplicates player/game events and first completion. Existing rows are never overwritten.
The API ACKs valid IDs, including already-stored IDs, only after database success.
Database failure/5-second timeout is HTTP 503 with `Retry-After: 5`; disabled or
invalid configuration is 503 with `Retry-After: 60`. The route additionally limits
requests to 30 batches/minute/IP using the existing limiter. Limits are per process;
the production global limiter also applies. A timed-out database operation may
commit later; replaying the same ID remains safe.

This endpoint allows pre-login ingestion. Installation UUIDs are client assertions,
not authenticated account identities. Rate limits limit ordinary abuse but do not
make analytics fraud-proof. There is no account mapping/HMAC secret in 2A. Do not
treat client-submitted events as authoritative economy or online-game outcomes.
Use existing ledger/receipts in later stages.

The table has RLS enabled, no anon/authenticated access, and only SELECT/INSERT
grants to service_role. Do not put credentials, account IDs, email, names, IPs,
advertising IDs, card layouts, arbitrary strings or raw errors in properties.
Existing Fastify/Railway request logs may contain request metadata such as IP;
this foundation does not refactor their logging. Review operational log retention
with the privacy policy before production activation.

## Client queue

Storage keys are `rise.telemetry.v1.development` and `rise.telemetry.v1.production`.
Each document stores a random installation/player UUID, events, version and drop
counter. IDs and timestamps survive app restart. Uninstall/reset loses this identity
and unsent data. Login linking and session lifecycle are deferred to instrumentation.

- Persist enqueue before upload. Serialize reads/writes; snapshot in-flight batches.
- At most one upload per queue instance. Callers may enqueue during upload.
- Up to 20 events/upload; polling every 30 seconds after explicit `start()`.
- 8-second network timeout, abort, exponential backoff with jitter capped at roughly
  75 seconds; honor Retry-After up to one hour. Retry state resets on process restart.
- Preserve events after every HTTP/network/protocol failure, including 4xx. Permanently
  invalid events are removed only when the server explicitly rejects their indices.
- Only remove acknowledged/rejected IDs after successful persisted queue update.
  A storage failure while saving the ACK leaves IDs replayable after restart.
- Keep at most 500 events and a conservative 256 KiB event-array budget (UTF-16
  length times two); expire after seven days, evict oldest first, count drops.
- Validate rehydrated data and strip invalid events. Corrupt storage starts a new
  identity/queue and increments a diagnostic; storage read/write failures are caught.
- Public operations resolve safely on telemetry failure. Diagnostics remain local
  counters; no recursive upload-failure events are emitted in 2A.

There is no exactly-once guarantee for delivery or app-kill flush. Database dedup
provides effectively-once storage for retries of the same ID. Offline queues are
bounded and may drop data. The caller should use `void telemetry.enqueue(...)` and
never wait for telemetry to authorize gameplay. Do not instantiate parallel writers
for the same storage key; the application wrapper provides one singleton.

## Staging deployment, after separate approval

1. Identify the existing Railway project/service and its current settings first.
   Keep production untouched. Disable production autodeploy while validating changes
   if its current configuration would otherwise deploy the branch automatically.
2. Use a staging Railway environment and a separate Supabase staging project or
   supported database branch with the existing required schema. Do not point staging
   credentials at production. This guide does not create paid services.
3. In the staging Supabase SQL Editor, apply only
   `supabase/migrations/088_telemetry_foundation.sql`. Confirm it is not already applied.
   Do not replay the migration directory: historical migration 031 resets economy.
   Verify columns/indexes and that anon/authenticated cannot SELECT or INSERT.
4. In Railway service Settings, set Root Directory `/server`; Build Command
   `npm ci --include=dev && npm run build`; Start Command `npm start`; Healthcheck Path
   `/health/ready`; Healthcheck Timeout 120 seconds; restart on failure, max 3 retries.
   Keep a single replica for the existing stateful gameplay server. Do not add a cron
   schedule or extra telemetry service. Leave the existing deployment source alone
   until reviewed. `server/railway.toml` records these settings for services supporting
   config-as-code; select `/server/railway.toml` as its config path explicitly.
   If the service uses Railway's newer configuration interface, use the same dashboard
   settings instead of migrating infrastructure solely for telemetry.
   `--include=dev` keeps the existing TypeScript compiler available even when the
   build environment sets `NODE_ENV=production`; runtime still starts compiled JS.
5. Set server variables through Railway Variables (real values never in Git):

   | Variable | Staging | Production, later |
   | --- | --- | --- |
   | `NODE_ENV` | `development` | `production` |
   | `RAILPACK_NODE_VERSION` | `22` | same validated version |
   | `SUPABASE_URL` | staging URL | existing production URL |
   | `SUPABASE_ANON_KEY` | staging publishable/anon key | production key |
   | `SUPABASE_SERVICE_ROLE_KEY` | staging server secret | production server secret |
   | `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN` | isolated staging credentials | existing production credentials |
   | `ALLOWED_ORIGINS` | exact staging browser origins | exact production origins |
   | `TELEMETRY_ENABLED` | `false` initially, `true` for approved smoke test | `false` until release approval |
   | `TELEMETRY_ENV` | `development` | `production` |
   | `SOVEREIGN_ENABLED`, `MONARCH_ENABLED` | `false` | `false` |
   | `VIP_PLUS_5P_ENABLED`, `VIP_PRIVATE_CREW_ENABLED` | `false` | `false` |

   Railway supplies `PORT`; the server already listens on it at `0.0.0.0`.
   Never set `EXPO_PUBLIC_*` to service-role keys or Redis secrets. Never weaken
   existing origin/authentication policies to test telemetry.
6. Deploy staging only when approved. Confirm `/health/ready` works, then send a
   manually generated test batch. Send the same UUID twice: exactly one row must
   exist, its properties unchanged. Verify partial rejection, schema mismatch,
   disabled flag, and simulated database/network failures. Health readiness checks
   the existing users table, so it does not prove migration 088 was applied: the
   explicit ingestion test is required. Apply 088 followed by 089 in isolated staging, without replaying old migrations. Verify RPC permissions/RLS and semantic game/first-game conflicts against real PostgreSQL.
   Also verify Railway's forwarded client-address behavior with the existing Fastify
   configuration: an IP limiter that sees only one shared proxy address can throttle
   unrelated players together. Do not blindly trust arbitrary forwarded headers or
   change unrelated network/auth code in 2A; resolve any confirmed deployment issue
   before activating ingestion for real players.
7. Configure a client development/preview build with
   `EXPO_PUBLIC_SERVER_URL=https://<staging-domain>`,
   `EXPO_PUBLIC_TELEMETRY_ENV=development` and telemetry enabled only for a deliberate
   test. The checked-in EAS profiles keep it disabled. Public Expo variables are baked
   into builds/updates; restart Metro after local changes. The new native `expo-crypto`
   dependency requires a rebuilt development client/Android binary before collecting
   telemetry on a device. The module is loaded lazily inside caught queue operations
   so an older binary missing it cannot crash at telemetry import. Physical Android
   QA has not been performed.
8. A future production build must use HTTPS, environment `production`, and separately
   approved enabled flags. The historical 2A-only state meant enabling flags alone
   collected no events. In 2B, enabling flags activates lifecycle/funnel/gameplay producers. Complete privacy/Data Safety and raw-data retention
   decisions before collecting production data. Do not enable automatic deletion
   without an approved retention policy.

Rollback: disable both telemetry flags. Server disabled replies preserve the bounded
client backlog. Keep the additive table and existing economy data; do not drop tables
or reset databases. Server flag changes on Railway require the platform's normal
review/deployment process. No migration runner or secret-bearing deploy script exists.

References: [Railway monorepos](https://docs.railway.com/deployments/monorepo),
[healthchecks](https://docs.railway.com/deployments/healthchecks),
[variables](https://docs.railway.com/variables),
[environments](https://docs.railway.com/environments),
[configuration reference](https://docs.railway.com/config-as-code/reference),
[Railpack Node version](https://railpack.com/languages/node/).

## Local verification

From `server`: focused Jest suites `tests/routes/telemetry.test.ts` and
`tests/telemetry/queue.test.ts`; build typecheck and full server/test typecheck;
`npm run check:migrations`. From `client`: TypeScript and `npm run check:i18n`.
For existing regression, use the established Jest runner with frozen Arena/Sovereign/
Monarch suites excluded, plus the separately run High Noble grace suite. Do not use
`npm test` unfiltered because its main script includes frozen suites.
No lint command/configuration is currently present in either package.
Installing the single Expo-compatible crypto module reported 32 advisory findings
in the overall client dependency tree (12 moderate, 20 high). This checkpoint did
not establish their baseline or perform a dependency security audit; no automatic
or forced dependency upgrades were made. Review that existing release check separately.
Mocked gateway tests verify API behavior; applying SQL/permissions and conflict
handling against staging PostgreSQL remains a required external check.

## Files changed in 2A

New files:

- `supabase/migrations/088_telemetry_foundation.sql`
- `server/src/telemetry/schema.ts`
- `server/src/routes/telemetry.ts`
- `server/tests/routes/telemetry.test.ts`
- `server/tests/telemetry/queue.test.ts`
- `server/railway.toml`
- `client/src/telemetry/types.ts`
- `client/src/telemetry/queue.ts`
- `client/src/telemetry/index.ts`
- `docs/TELEMETRY_RAILWAY.md`

Modified files:

- `server/src/index.ts` (route registration only)
- `server/.env.example` (disabled flags and existing Redis variable placeholders)
- `client/.env.example` (disabled flags)
- `client/eas.json` (disabled flags and environment separation)
- `client/package.json` and `client/package-lock.json` (one Expo-compatible crypto dependency)
- `docs/RELAUNCH_2026-09-05.md` (append decisions and verification results; preserve earlier changes)

All other pre-existing uncommitted files were left alone. No commit/push was made.


## Current 2B override (2026-10-03)

The sections describing four events, no producers and deferred lifecycle above
record 2A history. Current behavior is specified in TELEMETRY_2B.md: eleven
allowlisted names, lifecycle/tutorial/launch/local-training producers and
server-authoritative gameplay. Both flags are still OFF. Migration 089 is mandatory
before enabling either producer or ingestion: all writes now use its RPC, not
Supabase direct upsert. Apply 088 then 089 in isolated staging when approved.
Client online gameplay is rejected; DB semantic indexes deduplicate player/game
and first completion. First completion means first observed persisted event.
Client state now includes session counter and bounded receipts. Session means
foreground visit, not a 30-minute idle grouping; server pending uploads are bounded
RAM and can be lost on restart. No account identity is persisted. Focused tests
now include every producer plus actual training store and server sink/retry.

## Current 2C override (2026-10-03)

Gameplay/funnel 2B is approved. Economy/items/rewards/ads/VIP producers are now
implemented locally, still OFF. Exact payloads, source coverage, changed files,
idempotency/isolation and limitations: TELEMETRY_2C.md. Migration090 is required
before activation; apply088 then089 then090 in isolated staging when STEP2D is
approved. No Railway/Supabase deployment or live migration has been performed.
090 preserves canonical level-claim financial behavior and adds private newly
claimed slot metadata, stripped from public responses. Staging must prove original
response contract, first/replay/concurrent claim behavior, receipt quantities,
server-only financial events and existing UUID-conflict handling. No Railway
PostgreSQL or new service. Keep both flags OFF until explicit staging activation.
Direct token writes outside the existing ledger are not inferred or repaired;
covered ledger-flow totals are incomplete for full wallet reconciliation.
