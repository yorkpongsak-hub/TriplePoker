# Rise telemetry checkpoint 2C — economy, items/rewards, ads and VIP

2026-10-03. Implemented locally; flags OFF, no deployment or applied migration.
No accounting model, dashboard, payment analytics, ads redesign, rebalance or
benefit changes. Existing ledger/receipts are the only financial source of truth.

## Files changed in this checkpoint

New:
- supabase/migrations/090_telemetry_economy_receipts.sql
- server/src/telemetry/authority.ts
- server/tests/telemetry/authority.test.ts
- server/tests/telemetry/authorityHooks.test.ts
- docs/TELEMETRY_2C.md

Modified:
- server/src/telemetry/schema.ts (five event names, membership snapshot, config typing)
- server/src/telemetry/gameplay.ts (reuse bounded server sink, verified membership context)
- server/src/routes/telemetry.ts (reject client financial events)
- server/src/economy/economyService.ts (observe successful canonical gateway result)
- server/src/game/badgeUnlockService.ts (observe SQL-nested ledger transaction)
- server/src/game/tierDItemPersistence.ts (observe accepted action receipt)
- server/src/game/tierDBombService.ts (observe successful legacy consumption receipt)
- server/src/game/tierDRewardService.ts (observe claims/grants; strip private SQL metadata)
- server/src/game/tierDItemOfferService.ts (observe successful offer claim)
- server/src/game/tierDMiniTournamentService.ts (observe persisted item award)
- server/src/routes/dailyStreak.ts (observe successful claim receipt)
- server/src/sockets/gameSocket.ts (refresh verified membership through existing context)
- client/src/telemetry/types.ts (VIP schema and strict stored-snapshot validation)
- client/src/telemetry/producers.ts (available-profile VIP lifecycle/change producer)
- client/src/telemetry/launch.ts (existing fail-safe bridge)
- client/src/telemetry/queue.ts (type-only AbortSignal compatibility; runtime unchanged)
- client/app/_layout.tsx (observe existing auth-store vip_status)
- server/tests/telemetry/clientProducers.test.ts (VIP producer tests)
- server/tests/routes/telemetry.test.ts (authority/privacy validation)
- docs/TELEMETRY_RAILWAY.md and docs/RELAUNCH_2026-09-05.md (current status/checks)

Other prior working-tree changes preserved. No changes to frozen Arena/Sovereign/
Monarch surfaces, pricing, economic rules, entitlement definitions or ad provider.

## Exact payloads

Common 2B envelope remains: event_id UUID, schema_version 1, occurred_at UTC ISO,
anonymous player_id/session_id UUIDs, app_version, platform, event_name, properties;
optional build_number is accepted but not produced. Database receipt time,
environment and source are server-controlled. New optional envelope membership
contains {plan, entitled, entitlements}. No raw cards, account/request IDs, room IDs,
receipt input keys, payment credentials, names, emails or provider tokens uploaded.

| Event | Exact properties |
| --- | --- |
| token_balance_change | {transaction_id: numeric string, ledger_id: numeric string, delta: signed integer, balance_before: integer, balance_after: integer, flow: source/sink, reason: allowlisted ledger reason, tier?: tier_d/initiate/adept/mastermind/highNoble} |
| item_use | {receipt_id: UUID, item_type, quantity: 1, tier: tier_d, game_id?: UUID, match_number?: positive integer} |
| item_reward | {receipt_id: UUID, item_type, quantity: positive integer, reward_source, tier: tier_d, level?: positive integer} |
| ad_reward | {claim_id: UUID, placement, reward_type: token or item_type, quantity: positive integer} |
| vip_status | {plan: FREE/PRO/PRO_PLUS, entitled: boolean, entitlements, trigger: session_start/change} |

Item allowlist: shuffle, swap, double_pile, freeze, auto_sort, undo,
single_card_swap, full_redraw, bomb_defuser, heart, rose, medal, trophy.
Reward sources: level_clear, runtime_ad, offer, daily_streak, league, tournament,
legacy_reward. Safe grouped placements: TOKEN_RESCUE, TIER_D_LEVEL_CLEAR,
TIER_D_ITEM_REFILL, TIER_D_ITEM_OFFER, DAILY_STREAK, TIER_D_LEGACY_REWARD.
Raw offer placement strings are deliberately not copied into telemetry.
Reason allowlist is the existing EconomyReason literals; arbitrary metadata is
not copied. Flow derives from committed ledger amount sign. Mode is absent when
not present in that authoritative record; no inferred modes or balances.

Entitlements contains exactly these existing boolean flags:
hasNoForcedInterstitialAds, canUseRewardedAdsForExtras, canCreatePrivateTable,
canUsePrivateTablePin, canUseGolfGroupMode, canViewAnalysisWithoutAd,
canUseProPlusSocialBenefits. Existing mappings: none = FREE, vip = PRO,
vip_pro = PRO_PLUS. entitled means current resolved feature access (plan != FREE),
not a new payment/subscription verification system. No inferred billing state or
expiry data absent from the existing profile is added.

## Sources and producers

- token_balance_change reads PLAYER/TOKEN economy_ledger_entries joined to the
  transaction after successful economy_apply_transaction. Uses original ledger
  IDs, occurred time, amount and before/after; no UI or submitted-entry calculations.
  Also observes purchase_badge_atomic's nested ledger using its existing key.
  NPC/CREST entries and frozen-tier transactions are omitted. Unsafe numeric values
  or inconsistent balance triples are omitted rather than rounded/invented.
- item_use reads tier_d_item_action_receipts after commit_tier_d_item_action=true.
  Normal item use and Duel swap both pass through this commit point. Uses quantity1,
  receipt item, game UUID shared with 2B and match number; no hand/snapshot content.
  Legacy bomb consumption reads tier_d_bomb_defuser_uses only after true result.
- item_reward reads claimed tier_d_level_item_rewards (never reservation-only rows),
  tier_d_runtime_item_ad_claims, claimed tier_d_item_offers,
  daily_streak_reward_claims, tier_d_item_reward_grants, tier_d_league_awards and
  tier_d_mini_tournament_rewards after their existing successful operations.
  Quantities come from receipts, except receipt-proven single-use/single-grant1.
- ad_reward comes from successful AD_REWARD TOKEN ledger credit (token rescue),
  runtime refill/offer claims, newly claimed level slots, or stored ad_verified daily
  receipt. A daily claim emits one ad reward row per aggregated reward type, with a
  common claim_id; count DISTINCT claim_id for claim counts. Level slots/refills are
  separate receipt components. No event on ad start/end, provider failure, claim
  failure or reservation. Legacy ad mode emits only a new successful grant, never a
  replay of a non-ad grant. Existing production provider eligibility is unchanged.
- vip_status uses the existing fetched auth profile and entitlement resolver.
  Unknown/missing profile emits nothing; late profile emits session_start once;
  identical profile rerenders emit nothing; real plan changes emit change. Background
  does not create a session. Next foreground reports available membership once.
  Sign-out clears attached snapshot without fabricating a FREE transition.
- Client important events (including training/launch) attach known profile snapshot.
  Server 2C events read current verified DB membership; daily uses membership_at_claim.
  Existing socket context asynchronously refreshes verified membership for subsequent
  2B gameplay snapshots. Games retain their captured start context/snapshot when
  available. Missing/unavailable membership never prevents core events; it is optional.

## Dedup, isolation and migration

Receipt IDs are namespaced SHA256-derived UUIDs of existing private natural keys.
Event IDs derive from environment/account/event-name/receipt-component keys; raw
keys/account IDs never persist in telemetry. IDs remain stable across replay,
concurrent callbacks, process/session restart and anonymous installation changes.
Existing event UUID primary key and ON CONFLICT DO NOTHING prevent duplicates
without overwriting the first persisted row. Different ledger lines/items/slots
remain distinct. Existing transaction/receipt idempotency is not changed.
VIP uses serialized producer state/fingerprint; queue retry retains event IDs.

Read-only observers are detached, capped at16 concurrent observations, with abort
and 5-second query deadlines. Exceptions are swallowed; overflow/failures increment
local counters only. No economy/reward/gameplay path awaits telemetry. Membership
read failure omits snapshot. Writes reuse the 2B bounded batch/retry server queue,
not a second queue/backend or accounting table. Default-OFF performs no observer
reads/uploads or native telemetry queue initialization.

Migration090 adds event-name/financial-source checks. It also adds only private
_telemetry_claimed_slots to the canonical level-claim result, under its existing
row lock. This is necessary because its old idempotent field is true after both
first successful claim and replay. Original inventory writes, conditions, locks
and original response fields are unchanged (focused test compares stripped SQL
body with migration070). Service strips this field before returning to callers;
only slots newly credited by the verified ad claim emit ad_reward. No idempotent
bug fix or parallel claim/accounting storage. Migration must be reviewed/applied
in isolated staging after088/089, then verify first/replay/concurrent claims with
real PostgreSQL. Historical migrations and all original economy data retained.

## Coverage limits and remaining checks

This is launch telemetry, not reconciliation/accounting. Some existing token
mutations bypass ledger: escrow begin/refund/legacy settlement RPCs, unified daily
streak token credits, old shop debit functions and some direct unlock writes.
They do not receive token_balance_change because they have no authoritative ledger
before/after record. Daily ad telemetry still reports its successful receipt's
actual reward. Stored Second Deal increments and inventory changes lacking a
stable successful receipt are also omitted. Do not infer them from UI or add
accounting repairs in this checkpoint. Treat token-source/sink totals as covered
ledger flows only; ledger/receipts remain the authoritative audit sources.

Observer reads can fail/drop and are not a durable outbox. Most successful receipt
replays can recover missed events using original timestamps and stable IDs; newly
claimed level/legacy ad telemetry may be lost if its first observation fails.
Server restart loses pending RAM rows; client bounds/expiration still apply.
Missing anonymous socket context skips financial events; no persistent account
mapping/backfill job introduced. Ledger resolves session context at observation;
receipt observers capture it at hook time. Non-daily server membership is current
post-commit observation, not a historical billing snapshot. Daily claim lookup
uses current Bangkok day and may miss a claim crossing midnight. VIP changes are
observed on existing profile refresh, not a new subscription polling system.

Before activation: staging schema/RLS/conflict checks, first/replay/concurrent
claim contract, adapter relation-select permissions, Railway proxy/IP limit,
physical Android membership/offline/retry QA and privacy/Data Safety/retention.
No database or Railway production changes, new dependency, entitlement activation,
or third-party messages. HN historical intermittent failure, __DEV__ and dependency
advisories remain separate, unchanged release checks. Stop for review before2D.

## Final verification

- Focused telemetry:8 suites /76 tests pass with --runInBand --detectOpenHandles,
  then --maxWorkers=2 --detectOpenHandles; exit0, no open-handle warning.
- Final allowed main regression:104 suites /929 tests pass, exit0 (236s). Same
  exclusions as2B: Arena, Sovereign route, Monarch, Ascendant gate and separately
  run HN grace. Established main runner uses --forceExit; its teardown reminder is
  not evidence that the focused telemetry suites retain handles.
- Separate HN grace:15/15 pass, no gameplay/test fix. Prior intermittent2A failure
  stays recorded as historical release concern.
- Production server build passes. Client typecheck and i18n parity104 en/th/zh-CN
  pass. Migration inventory90 (001–090, no gaps/duplicates) passes; SHA256090:
  4f8766083310a0b7a50fb85ecd15d3e54ffb775bfa09c0368d05573884a68c7c.
- Tracked git diff --check and new telemetry/migration whitespace scan pass.
  No configured lint command; no lint tooling/dependency cleanup added.
- First main run:101 suites passed/3 failed,901 tests passed/1 failed. It loaded
  older observer code while its new context-failure test was added, and two client
  telemetry suites hit shared Node/RN AbortSignal ambient typing. Added capture
  failure isolation and a type-only platform AbortSignal cast/config type, then
  restarted the complete regression against final code:all104/929 pass. No __DEV__
  cleanup. New daily-route test's initial asynchronous readiness race was fixed with
  an explicit RPC-entered signal; final focused/full runs pass.
- Membership availability/snapshots, failed reads/timeouts/sinks, concurrent read
  bounds, receipt/transaction replay IDs, post-success hook ordering, private-data
  rejection, reservations, failed ad verification/claims and SQL body equivalence
  are covered. Real PostgreSQL permissions/claims/concurrency still need2D staging.

Account-to-anonymous context remains memory-only and keeps the latest context per
account; concurrent devices on one account can affect session attribution. No
persistent account map or new polling service introduced. Checkpoint stopped for
owner review before2D; all flags OFF and no deploy/live DB changes.
