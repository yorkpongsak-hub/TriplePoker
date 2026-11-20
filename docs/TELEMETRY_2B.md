# Rise telemetry 2B — gameplay and launch funnel

Implemented 2026-10-03; all flags remain OFF. No deployment or database mutation.

## Exact produced payloads

Common envelope: event_id UUID, schema_version 1, occurred_at UTC ISO timestamp,
player_id anonymous installation UUID, session_id UUID, app_version semver,
platform android|ios|web, event_name, properties. Server adds environment, source
client|server and database receipt time. Optional build_number is accepted but not
produced here. Unknown fields are rejected.

| Event | Properties |
| --- | --- |
| app_open | {} |
| session_start | {session_number, is_return} |
| session_end | {duration_ms, reason: background} |
| tutorial_start / tutorial_complete | {tutorial: three_piles\|strategy_check\|tier_d_guide} |
| tutorial_step | {tutorial, step} |
| launch_step | {step} |
| game_start | {game_id, mode, tier, human_count, bot_count, level?} |
| game_end | game_start fields plus {outcome, duration_ms, score, score_kind, opponent_score?, seal_wins?, triple_sweep?, open_challenge_passed?} |
| first_game_complete | {game_id, mode, tier} |

Modes: training, solo, multiplayer, tier_d_solo, tier_d_duel. Tiers: training,
tier_d, initiate, adept, mastermind, highNoble. Level is present only for Tier D.
Outcome: win/loss/draw. Classic uses the existing final winner including engine tie
resolution, score_kind pile_wins, pile-win count and boolean triple_sweep. Tier D
uses existing playerWon, cumulative points, highest AI score and
open_challenge_passed. Training compares points (including draw), with
opponent_score and seal_wins. No scores are token amounts.

Launch steps: launch, training, sign_in, how_to_play, tier_d_entry, tier_d_table,
lobby, classic_lobby, classic_table, mastermind_select. Explicit route allowlist
only; consecutive same route suppressed, revisits counted. Raw routes never stored.
Three Piles steps 1/2 = first match start/finish, 3/4 = second match start/finish;
completion = second completed match. Strategy Check starts on Take Check, steps
on correctly answered Next, completes on final correct answer. Tier D guide starts
on entry, steps on valid slides, completes on final-slide Finish; early Skip is not
completion. Tutorial milestones occur once per installation.

## Authority and duplicate prevention

Client owns lifecycle/funnel and local three-hand training. Persisted training
trace has UUID/start time only. Legacy active matches without trace are skipped.
Result-phase guard and atomic AsyncStorage event/receipt persistence suppress
normal duplicate game_end, including result-screen rehydration.

Server owns Initiate/Adept/Mastermind solo, Adept multiplayer, High Noble and Tier D.
Classic game = full three/five-match game; Tier D game = full level attempt, not
internal matches/duel stages. Hooks observe existing decisions without awaiting
uploads. Existing authenticated socket supplies strictly validated anonymous
telemetry_context. Auth IDs remain in memory lookup only. Initial human/bot/context
snapshot is retained; missing context skips reporting, late context can backfill
start with original timestamp. Stable server UUIDs derive from existing escrow IDs
or Tier D gameId. WeakMap ended guard prevents normal repeated ends; database
unique keys protect replay after restart. Multiplayer emits one row per human:
count DISTINCT game_id for tables, rows for player games.

Migration 089 extends event/source checks, limits client gameplay to training,
adds uniqueness on environment/player/event/game and environment/player for first
completion, and introduces service-role-only telemetry_ingest_events RPC.
ON CONFLICT DO NOTHING preserves original rows across all uniqueness rules.
Client online result submissions receive CLIENT_AUTHORITY_FORBIDDEN. First marker
means first persisted observed completion since telemetry enabled, not lifetime
first game; offline client/server race need not preserve earliest occurred_at.

## Delivery and interpretation limits

Session = foreground visit, with no 30-minute heuristic. Background then active
starts a new session; inactive is ignored. Return = persisted session_number > 1.
app_open = once per JS runtime, including update/runtime restart. Abrupt kill can
omit session_end. Duration is wall time and may include background time.

Client reuses 2A bounded durable queue/retry. Producer receipts are capped at 1000;
events can expire/evict, so delivery is best-effort. Server uses bounded RAM queue
500, batch20, storage timeout5s, exponential retry1–60s retaining event IDs.
Overflow drops new events; server restart loses pending rows. Counters stay local.
No durable worker/new service. Failures never throw into gameplay.

Apply 088 then 089 only in isolated staging when approved. Verify real PostgreSQL
RPC conflicts/RLS, Railway forwarded IP limits and Android native/storage/offline
QA before activation. No hands, seeds, emails, names, account IDs, room IDs or raw
errors stored. Economy/items/ads/VIP/error expansion/reporting/dashboard deferred.
Ledger/receipts unchanged. Prior HN instability, __DEV__ and dependency advisories
remain separate work; no unrelated fixes. See TELEMETRY_RAILWAY.md.

## Files changed in 2B

New: supabase/migrations/089_telemetry_gameplay_funnel.sql;
server/src/telemetry/{store,gameplay}.ts; client/src/telemetry/{producers,launch}.ts;
server/tests/telemetry/{clientProducers,serverProducers,trainingStore,serverSink}.test.ts;
docs/TELEMETRY_2B.md.

Modified: server/src/telemetry/schema.ts; server/src/routes/telemetry.ts;
server/tests/routes/telemetry.test.ts; server/src/game/{gameLoop,highNobleMultiEngine,
tierDSoloRuntime}.ts; server/src/sockets/gameSocket.ts;
client/src/telemetry/{types,queue,index}.ts; client/src/launch/store.ts;
client/app/{_layout,launch}.tsx; client/app/(auth)/onboarding.tsx;
docs/{TELEMETRY_RAILWAY,RELAUNCH_2026-09-05}.md.

Existing unrelated changes and frozen gates preserved. No commit/push/deployment.

Verification results: final focused telemetry run passes 6 suites / 50 tests with
--runInBand --detectOpenHandles, exit0 and no open-handle warning. Existing allowed
main regression ran 101 suites: 98 passed / 3 failed to compile, 866 executed tests
passed, exit1. All 96 pre-existing suites / 853 tests passed. The three failures
were new telemetry route/client-producer/queue suites compiling with Expo/RN
ambient globals pulled by the first training-store test revision. That test now
loads the actual store at runtime; corrected focused run passes all three plus all
other telemetry suites. No unchanged heavy gameplay suites rerun for this isolated
test-import fix. Server sink (added after main discovery) passes separately and in
final focused run. Server production build, client typecheck/i18n, migration
inventory89 and tracked diff whitespace check pass. HN grace passes15/15 this run;
prior intermittent failure retained separately, no game/test fix. No lint configured.
Final confirmation with --maxWorkers=2 --detectOpenHandles also passes all 6
telemetry suites / 50 tests, exit0, no open-handle warning.
