# Rise staging baseline audit — 001–087 (local only, 2026-10-03)

Status: audit complete; baseline NOT ready to apply. No database connections,
migrations, local link changes, application edits or Railway actions. Confirmed
target for any future approval: TriplePoker-Staging / xuyttndedxahveewfwpj.
Production schema/history were NOT queried. "Latest in Git" is not proof of
"currently deployed": statements below distinguish code contracts from unknown
live configuration. This is a plan, not authorization to execute it.

## 1. Recommendation

Use a reviewed schema-only snapshot of the current application schema, plus a
small separately reviewed staging reference/bootstrap seed. Do NOT replay001–087,
and do NOT run001 then a guessed list of safe patches.

Confirmed blocker:002 lines5–8 explicitly says live users.user_id PK differs
from001 users.id because Dashboard DDL was never committed. No later committed
migration closes that gap.001 also uses subscription instead of vip_status,
streak_shield instead of streak_shields, and user_inventory.item_id instead of
the current user_id/item_key contract. The auth-store selects profile columns
that these migrations never create. Current auth registration UPDATEs an existing
profile; it does not INSERT it. The actual auth-to-public-profile trigger/function
and users RLS are missing from this migration history.

No current standalone baseline/schema dump was found in the inspected supabase/
docs tree. Cannot certify production-compatible types/defaults/FKs/triggers/ACL
from source usages alone. Obtain an EXISTING trusted schema artifact/backup from
the owner (no production connection/export command authorized here). If none
exists, a future owner-approved metadata acquisition is required before baseline
generation. Do not invent the missing DDL or call a hand-built approximation a
copy of current production.

Minimal safe method means minimal operational risk: one reviewed final-schema
artifact, not dozens of historical intermediate functions and data repairs.
Preserve shared compatibility columns even where advanced features are OFF.
Do not prune dependencies dynamically or enable frozen features. A complete
reviewed application schema is simpler than risky table-by-table pruning.

## 2. Classification legend

Multiple tags apply to mixed files; classify statements, not just filenames.

- S: schema creation/evolution, conditionally safe with verified prerequisites;
  not automatic approval to replay. Includes function definitions and ACL.
- Q: seed/reference/bootstrap data; distinguish static configuration from money.
- D: data migration/backfill or historical accounting mutation.
- Z: destructive DROP TABLE/TRUNCATE/reset.
- O: historical/obsolete operation; not needed to create clean current state.
- X: some definitions superseded by later migrations; retained columns/tables
  may still be required. Never skip an entire mixed file just because tagged X.
- R: requires a pre-existing table/function, Supabase auth schema or data state.
  R does not mean existing player rows are needed for every additive file.
- F: frozen/gated feature or shared compatibility; not a launch activation.
- U: unclear/risky historical assumptions or schema gap.

| Migration | Tags | Finding / disposition |
| --- | --- | --- |
| 001_initial_schema.sql | S,O,U | Historical starter schema uses users.id/subscription and inventory.item_id; incompatible with current user_id/VIP/item_key contract. Never use as current baseline. |
| 002_name_protection.sql | S,D,Q,R | Name snapshots/backfill + generated normalization + reserved names; explicitly documents missing Dashboard DDL and users.user_id. |
| 003_starting_token_3000.sql | S,O,X | Token default3000 only; superseded041 default0. Registration now mints welcome bonus through ledger. |
| 004_add_streak_count.sql | S,R,U | Adds streak_count only; comments assume last_played_date/streak_shields already exist elsewhere. |
| 005_nine_sentinels.sql | S,R | Adds conquered_sentinels JSONB; active Mastermind dependency. |
| 006_monarch_spawn_reward.sql | S,F,R | Frozen Monarch counters plus shared performance_score/ps_season; preserve columns needed by ordinary profiles/PS. |
| 007_tier_unlock_celebrated.sql | S,R | Adds tier_unlock_celebrated for profile flow. |
| 008_reserved_boss_names.sql | Q,R | Reserved NPC names; safe idempotent reference INSERT, not player data. |
| 009_match_wins.sql | S,R | Match-win history, user FK and indexes. |
| 010_ascendant_crown_vault.sql | S,R,F | Crown/ascendant columns and four wallet RPCs; mixed shared wallet compatibility and deferred progression. |
| 011_atomic_match_escrow.sql | S,R | Atomic match escrow, active-user uniqueness, settlement/refund RPCs and service-role ACL. |
| 012_monarch_relics.sql | S,F,R | Frozen Monarch relics column; no launch encounter activation. |
| 013_boss_stats.sql | S,D,R | Boss stats table/RLS/RPC; backfills Monarch aggregates from existing users, replaces read policy. |
| 014_vip_table_skins.sql | S,R,X | VIP skin table/RLS; initial skin CHECK widened021. |
| 015_arena_crest_ledger.sql | S,F,R | Frozen Arena ledger/RPC plus crown_crest_remainder used by shared economy. |
| 016_arena_settlement_and_match_log.sql | S,F,R,X | Frozen settlement/log tables; batch RPC replaced027, table definitions retained. |
| 017_sovereign_foundation.sql | S,Q,F,R | Frozen Sovereign/Last Boss foundation plus shared wallet columns and reserved-name seeds; DO adds FK. |
| 018_sovereign_wallet_and_standby_rpc.sql | S,F,R | Frozen wallet reservation/standby RPCs and source ledger. |
| 019_last_boss_atomic_succession.sql | S,F,R | Frozen succession/rename RPCs and reward entitlement table. |
| 020_unified_grandmaster_unlock.sql | S,D,F,R | Permanent-grandmaster trigger replacement and progression backfill; do not replay historical progression. |
| 021_allow_default_table_skin.sql | S,R | Drop/re-add skin CHECK, permits0–4; no row removal but ALTER lock/validation. |
| 022_beyond_path_choice.sql | S,F,R | Adds beyond_path and replaces CHECK; client profile selects this even with deferred surfaces. |
| 023_daily_play_streak_rewards.sql | S,D,R,X | Irreversible streak normalization into7-day cycle; constraint later replaced072 (8-day). |
| 024_vip_plus_match_results.sql | S,R | VIP Plus results/RLS referencing auth.users; currently feature-gated compatibility object. |
| 025_normalize_last_login_column.sql | S,R,U | Conditional last_login_at rename; depends on actual old/new column state, does not resolve both-column divergence. |
| 026_merch_orders.sql | S,R | Merch orders table/index/RLS; preserve registered route dependency, not telemetry-critical. |
| 027_fix_arena_crest_batch_ambiguous_user_id.sql | S,F,R | Replaces Arena batch RPC (016), frozen surface. |
| 028_arena_entry_fee_reason.sql | S,F,R | Replaces frozen Arena reason CHECK to add ENTRY_FEE. |
| 029_atomic_performance_score.sql | S,R | Atomic ordinary performance_score/ps_season RPC; requires missing historical profile columns. |
| 030_central_economy_schema.sql | S,Q,R,X | Ledger/pools/counters/reconciliation/RLS; zero-row reference seed; transaction RPC superseded040. |
| 031_economy_clean_reset.sql | Z,D,R,U | Drops eight backups, resets every wallet/counter and truncates escrow/old/new ledgers. NEVER replay baseline. |
| 032_economy_genesis.sql | Q,R | Historical Genesis100M TOKEN/240k CREST into reserve through RPC. Reuse policy in separately reviewed staging seed, not reset chain. |
| 033_test_account_funding.sql | D,O,R | Funds exactly3 historical auth-email test accounts; aborts otherwise and prints emails. Skip staging replay. |
| 034_npc_pool_initial_funding.sql | Q,R,F | Initial funding500k TOKEN/5k CREST per7 NPC pools; reuse active-pool policy separately, no historical diagnostic/frozen funding required. |
| 035_fix_economy_apply_transaction_counter_where.sql | S,R,X | Replaces ledger RPC counter WHERE fix; superseded036/040. |
| 036_fix_economy_apply_transaction_burn_override.sql | S,R,X | Adds burn override and drops7-arg old RPC; final040 supersedes and drops8-arg version. |
| 037_round3_mastermind_correction.sql | D,O,R | One-time historical counter-only BURN repair; wrong on a clean economy, skip. |
| 038_round4_highnoble_correction.sql | D,O,R | One-time historical counter-only MINT repair; wrong on a clean economy, skip. |
| 039_match_wins_rank_tracking.sql | S,R | Adds rank_before/rank_after and win leaderboard index. |
| 040_economy_apply_transaction_mint_override.sql | S,R | Final9-argument ledger RPC with burn/mint overrides, removes8-arg overload, service-role ACL. |
| 041_token_balance_default_zero.sql | S,R | Final token default0; mandatory with ledger-owned welcome bonus. |
| 042_users_email_nullable_for_guest.sql | S,R,U | Drops email NOT NULL but assumes email column; earlier033 says public.users has no email. Verify actual artifact, do not invent it. |
| 043_streak_claimed_milestone.sql | S,R | Legacy claimed streak milestone column still queried. |
| 044_badge_shop.sql | S,R | Badge ownership unique pair/index/RLS. |
| 045_badge_equip.sql | S,R | Equipped badge profile field. |
| 046_atomic_progression_purchases.sql | S,R,F | Atomic badge/pass purchases depend on ledger040 and ownership; no seed/backfill, shared badge active. |
| 047_solo_endless_level.sql | S,R | Endless level field/RPC. |
| 048_player_countries.sql | S,R | Country reference per-player state/RLS; no existing player rows required. |
| 049_tier_d_solo_progress.sql | S,D,R,X | TierD progression fields + sanitization UPDATE; settlement RPC superseded061/067. |
| 050_tier_d_league_leaderboard.sql | S,R | League progress/finalization, indexes/RPC. |
| 051_tier_d_awards_rewards.sql | S,R,X | Award and reward-grant receipts/RPC; fulfillment implementation replaced052. |
| 052_tier_d_bomb_inventory.sql | S,R | Inventory and bomb-use receipt/RPC; legacy item-key constraints later replaced057/068; fulfilled reward compatibility still used. |
| 053_tier_d_level_500_unlock.sql | S,R | Level500 unlock field and milestone history; no blanket reward backfill. |
| 054_tier_d_live_items_and_personal_best.sql | S,R,X | Inventory use/level receipts and record RPCs; grant function superseded through082; DELETE only inside consume RPC rollback compensation. |
| 055_tier_d_vip_and_ad_reward_double.sql | S,R,X | Reward quantity/ad fields; grant/ad RPCs superseded062/068/070; columns still needed. |
| 056_tier_d_level_clear_time.sql | S,R,X | Best level time field; 2-argument record RPC superseded by3-argument069 (old overload can remain). |
| 057_tier_d_canon_item_inventory.sql | S,D,R,X,U | Lossy legacy item-key remap; collision possible on unique keys, then CHECK replacement; functions/allowlist later superseded. |
| 058_tier_d_runtime_item_ad_claims.sql | S,R,X | Rewarded claim receipts/RPC; implementation superseded068/073; receipt table still required. |
| 059_tier_d_competition_cycles.sql | S,R,X | Competition tables/award RPC; point RPC replaced083 with changed return type. |
| 060_tier_d_match_win_streak.sql | S,R | Match win-streak column/CHECK. |
| 061_tier_d_required_table_progression.sql | S,R,X | Intermediate table-unlock settlement rules; superseded067. |
| 062_tier_d_league_level_reward_sets.sql | S,R,X | Reward slot fields and primary-key rebuild; removes2/3-argument grant overloads; grant/ad functions superseded070/082. |
| 063_player_language_flags.sql | S,R | Player language preferences/RLS. |
| 064_tier_d_reward_ledger_compatibility.sql | S,R | Reward compatibility fields/CHECK replacement; retained final structure, verify quantity constraint. |
| 065_tier_d_active_match_snapshots.sql | S,R | Active match snapshots/index/RLS required for reconnect and item atomicity. |
| 066_tier_d_best_match_score.sql | S,R | Best score profile field/RPC. |
| 067_tier_d_silver_streak_start.sql | S,R | Final TierD settlement/progression RPC. |
| 068_tier_d_auto_sort_inventory.sql | S,R,X | Final six-item CHECKs (adds auto_sort); grant/ad functions later replaced, tables/constraints retained. |
| 069_tier_d_records_boards.sql | S,R | Per-level best times/indexes; final3-argument time-record RPC. |
| 070_tier_d_every_level_claimed_rewards.sql | S,R,X | claimed_at and canonical claim RPC/ad wrapper; grant function later082; claim replaced090 only for telemetry metadata. |
| 071_tier_d_match_item_lifecycle.sql | S,D,R | Freeze-duration field/trigger, random-duration backfill, action receipt and atomic snapshot/item RPC; no quantity reset. |
| 072_unified_ads_daily_streak_social_items.sql | S,R | Final8-day CHECK; ad state/social inventory/daily claim receipts/RPC and membership allowlist. |
| 073_runtime_item_ad_idempotent_receipt.sql | S,R | Final runtime ad RPC enforces receipt replay; no migration-time claim. |
| 074_tier_d_configurable_ads_rewards_second_deal.sql | S,R,X | Ad session state, Second Deal inventory/grant RPC; level reward implementation superseded075/082. |
| 075_tier_d_swap_reward_scarcity.sql | S,Q,R,X | Weight config + six exact seed weights; level function replaced082, config still required. |
| 076_tier_d_item_offers.sql | S,R | Locked Free/Lucky offers, unique open offer, auth FK and successful claim RPC. |
| 077_tier_d_mini_tournaments.sql | S,R | Tournament/entry tables and ranking index; evolved081/085/086. |
| 078_tier_d_mini_tournament_points.sql | S,R | Atomic tournament point increment RPC; not a migration-time balance mutation. |
| 079_tier_d_mini_tournament_rewards.sql | S,R | Tournament award receipts/RLS; evolved086. |
| 080_tier_d_mini_tournament_award.sql | S,R | Tournament item award RPC with receipt dedup; legacy callable object retained. |
| 081_tier_d_personal_mini_tournaments.sql | S,R | Personal tournament owner/progress/unique-open index. |
| 082_tier_d_level_reward_pair.sql | S,R | Final weighted level reward pair reservation RPC; requires075 weight rows. |
| 083_tier_d_competition_score_idempotency.sql | S,R | Competition credit receipt + DROP/recreate point RPC to change return type; no receipt deletion. |
| 084_tier_d_lifetime_ranking_score.sql | S,D,R | Lifetime score tables/RPC + historical score backfill; skip historical aggregation for clean staging. |
| 085_personal_top20_tournaments.sql | S,D,R | Top20 tournament fields/roll receipts/indexes + open-entry baseline_score backfill. |
| 086_personal_top20_final_rules.sql | S,R | Final reward fields and authoritative personal award RPC; preserve receipt/token behavior. |
| 087_vip_private_crews.sql | S,R | Feature-gated VIP private crew schema/auth FKs/ACL/RPC; preserving structure does not enable feature. |

## 3. Destructive and risky statements

-031: drops eight *_backup_pre_economy_reset tables, zeroes all player currencies,
  truncates match escrow, Arena tables, Sovereign ledger/reservations/standby,
  token/shop transactions, new economy ledger/transactions, then zeroes pool and
  supply counters. No global transaction wrapper. Never required on clean staging;
  never replay. It also assumes frozen schemas exist.
-037/038: one-time historical reconciliation counter-only BURN/MINT records.
  Their idempotency keys do not make them correct for a new economy. Skip both.
-033: funds exactly three email-selected historical accounts with1.2M TOKEN and
 600 CREST each and emits emails/notices. Wrong fixtures/assumptions for staging.
-023: rewrites streak_count into a7-day cycle and preserves only aggregates;
  original history cannot be reconstructed.072 is current8-day constraint.
-057: maps full_redraw→shuffle, single_card_swap→swap, bomb_defuser→freeze.
  Lossy meaning change and potential PK collisions if old/new inventory keys
  coexist. Baseline should start with final six-item keys; no transformation.
-020/049/013/084/085: progression/stat/score backfills on existing state.
 071 assigns random freeze durations to old inventory via a trigger-driven UPDATE.
  Do not replay backfill statements for a clean baseline.
-025 conditional rename: if both last_login and last_login_at exist it does
  nothing; not proof of normalized schema.042 assumes email exists, while033
  explicitly says public.users has no email; compare artifact instead of guessing.
-036/040: DROP old RPC overloads (7→8→9 arguments);062 drops2/3-argument grant
  overloads and rebuilds receipt PK;083 drops/recreates point RPC to change return.
  These are schema replacements, not row wipes, but can break clients/dependencies
  or leave partial state if historical files fail midway.
-013 policy replacement;020/071 trigger replacement;021/022/023/028/057/062/064/
 068/072 constraint replacements: lock and revalidation risk, not DROP TABLE.
-003/041 token default change: final0 only. Creating raw3000 balances and then
  running welcome mint produces duplicate/unaccounted funding.
-054 DELETE is INSIDE consume_tier_d_runtime_item function to undo a failed
  inventory debit's use marker; not a migration-time purge. Ordinary UPDATE/
  INSERT in RPC bodies execute only when called, unlike top-level DO blocks.
- ON DELETE CASCADE in FK definitions is future behavior, not migration-time
  deletion. CREATE OR REPLACE FUNCTION is not a reset/backfill by itself.
- No additional top-level table truncate/drop reset found outside031 in001–087.
  No ALTER COLUMN TYPE/drop-column data rewrite found; review all actual artifact
  DDL nonetheless. Mixed files and old function overloads need signature review.

## 4. Current Rise dependencies

Machine-readable literal table/RPC inventory with caller filenames, creation
migration and definition chain:
[dependency manifest](TELEMETRY_STAGING_SCHEMA_DEPENDENCIES.json).
It records55 table references and40 RPC names including frozen/dormant callers.
It is not an exact dependency resolver: SQL-body tables and auth/storage must
also be reviewed; no claim all references are launch-reachable.

| Area | Required current contract | Local definition/evidence |
| --- | --- | --- |
| Auth/profile | auth.users; public.users.user_id compatible with auth UUID; actual profile provisioning trigger/function; user_id uniqueness/FK; owner read RLS and service write access | Missing Dashboard-era foundation;002 and server/routes/auth.ts confirm gap |
| Profile fields | display_name, avatar_url/profile_image_url, tier, tier_unlocked_max, vip_status; token/crown/package/remainder/debt fields; xp/games_played/games_won/best_hands; last_login/last_played_date/streak_shields; iap_token_total | client/src/store/authStore.ts profileColumns and server matchStats/profile. Missing initial DDL for several fields |
| Progress/records | conquered_sentinels, performance_score/ps_season, celebration, badge, solo/TierD levels/streak/time/score, legacy beyond_path/monarch_victories selected by profile even OFF |005–007/012/020/022/029/039/043/045/047/049/053/056/060/066/072; shared columns preserved |
| Ledger | economy_pool_accounts/global_counters/transactions/ledger_entries; transaction_id FK for PostgREST join; idempotency key uniqueness; numeric balances; wallet columns; service ACL and RLS |030 structural DDL and reconciliation;040 final9-arg economy_apply_transaction;041 default0;046 atomic purchase |
| Escrow/game | match_escrow unique active user, begin/settle/refund; match_wins rank fields; boss stats/name validation tables; ordinary PS/endless RPCs |002/008–011/013/029/039/047 |
| Generic inventory/shop | user_inventory(user_id,item_key,quantity,is_locked,expires_at,updated_at), UNIQUE(user_id,item_key); badges and skins |001 inventory uses item_id and lacks later fields; current items/shopAPI.ts incompatible.044–046 and014/021 for badges/skins |
| TierD inventory/receipts | six-item inventory + freeze_durations/trigger, legacy bomb-use receipt, reward grants, action receipt, runtime-use/ad receipts, level reservations/claimed slots, offers |051/052/054/058/062/064/068/070/071/073/075/076/082 |
| Rewards/progression | league progress/finalization/awards, competition receipt/rewards/trophies, snapshots, time records, lifetime credits/totals, personal tournament state/roll/reward receipts |049–053/059/065–069/077–086, final definitions below |
| Ads/daily | user_ad_policy_state including session columns; social_item_inventory; daily_streak_reward_claims; rewarded receipt RPCs; Second Deal inventory/grant |072–076, successful claim only; no external ad-provider keys/credentials copied |
| VIP | users.vip_status none/vip/vip_pro; existing code maps FREE/PRO/PRO_PLUS. Daily receipt membership_at_claim; no parallel subscription ledger | Missing foundation enum/default verification;072 receipt allowlist.024/087 schema only if retaining full compatible snapshot, flags OFF |
| Countries/language | player_countries and player_language_preferences |048/063; no production player data seed |
| Storage | private avatars bucket/settings/policies; signing/upload paths | storage.from('avatars') is bucket, NOT public.avatars table. No committed setup migration found |
| Legacy/dormant | games.hand_count/duration, activity_log.meta, set_user_tokens RPC | Only endOfMatch.ts references; no imports found elsewhere in src.001 differs/missing RPC. Not proven active launch blocker; record separately, do not invent implementation |
| Frozen/gated | Arena/Sovereign/Monarch tables/functions and VIP extra surfaces | Structural compatibility only; no activation, seeds/player records or heavy feature tests |

Final code-relevant RPC implementations by name (verify actual signatures, not
only name; historical overloads may differ):
- economy_apply_transaction:040,9 args incl burn/mint override; reconciliation030.
- begin/settle/refund_match_escrow:011; wallet deduct/credit010; purchase_badge_atomic046.
- settle_tier_d_solo_level:067 (049/061 superseded); fulfill_tier_d_item_reward052.
- grant_tier_d_level_random_item:082,4 args; remove obsolete2/3-arg dispatch per062.
- claim_tier_d_level_reward:070 before telemetry090; claim_tier_d_level_ad_bonus070
  delegates to it; claim_tier_d_runtime_item_ad073.
- record_tier_d_level_clear_time:069,3 args; old0562-arg not used by current caller.
- commit_tier_d_item_action and freeze-duration trigger:071; daily claim072;
  grant_second_deal_for_daily_cycle074; offer claim076.
- add_tier_d_competition_points:083 final return JSONB; lifetime commit084;
  personal tournament award086; older award/points functions retained if in snapshot.
- ordinary record_boss_result013, increment_performance_score029,
  increment_solo_endless_level047, finalize_tier_d_league050, league awards051,
  best-match/time record054/066. No new financial implementation proposed.

## 5. Telemetry088–091 dependencies

-088 standalone telemetry_events + PK/RLS/service SELECT/INSERT; no users FK
  (anonymous UUIDs). Requires standard Supabase roles and gen_random_uuid.
-089 depends088, adds event/source checks, semantic game/first-game unique indexes,
  and service-role ingestion RPC. No existing game rows required.
-090 depends088/089 AND canonical claim tables/function contract from070:
  tier_d_level_item_rewards(user_id,level,reward_slot,item_key,granted_quantity,
  claimed_at); UNIQUE(user_id,level,reward_slot). Inventory(user_id,item_key,
  quantity), UNIQUE(user_id,item_key), six-item CHECK including auto_sort.
  Freeze-duration behavior must match071 so claim inventory inserts preserve it.
  The070 ad wrapper must keep delegating to claim_tier_d_level_reward so090's
  internal newly-claimed-slot metadata reaches the existing server.
-091 depends088–090; nullable membership/CHECK and replace same ingestion RPC.
  No VIP/profile FK or payment data. Existing snapshots are not backfilled.
- DDL installation alone is insufficient for2C producers: ledger FK join/read
  permissions, existing successful receipts, users.vip_status, isolated auth test
  profiles and authoritative claim RPCs must actually work.
- Supabase PostgREST schema cache must expose functions/relations; exact signatures,
  RLS and grants are part of baseline, not later incidental fixes.

## 6. Exact application/skipping plan

Immediate apply list: NONE. Schema acquisition/reconciliation is a blocker.
Under the recommended snapshot strategy skip executing EVERY historical file
001_initial_schema.sql through087_vip_private_crews.sql as migration scripts.
Their current structural effects come from the reviewed final schema, not replay.
In particular never execute031/033/037/038; do not run032/034 automatically.

Proposed new files (NOT created and NOT executable yet):
1. supabase/baselines/rise_current_schema.sql — reviewed schema-only DDL, current
   public objects/extensions/ACL/default privileges plus explicitly reviewed
   application auth-profile trigger; no auth platform internals/users/credentials,
   no DROP/reset/backfills or historical backup tables.
2. supabase/baselines/rise_staging_reference_seed.sql — exact static reference/
   configuration rows extracted/reviewed separately, no real player data.
3. supabase/baselines/rise_staging_economy_bootstrap.sql — staging-only fresh ledger
   Genesis and active pool funding via existing final RPC; preserves existing
   amounts, no historical counter corrections or direct wallet UPDATE.
4. supabase/baselines/rise_staging_verify.sql — read-only catalog/dependency checks.
   A separate rolled-back fixture test validates runtime operations later.

Then, after baseline approval/application/verification, proposed telemetry order:
088_telemetry_foundation.sql →089_telemetry_gameplay_funnel.sql →
090_telemetry_economy_receipts.sql →091_telemetry_membership_persistence.sql.
Only genuinely unapplied files, owner approval required. No db push/reset or
migration repair. Do not fake history entries001–087 for files never executed:
record snapshot source/version/hash and seed receipts in a baseline manifest.
No final apply command exists until actual artifacts are reviewed.

If trusted snapshot omits a code-required later object, add only its reviewed
final DDL/ACL/seed into the clean baseline, using local migrations as evidence.
Do not layer whole historical files with UPDATE/backfill blocks onto it.
If source includes telemetry already, reconcile and skip applied telemetry DDL;
do not use timestamps/names as sole proof.

## 7. Required staging seed/reference data

| Data | Exact source/policy | Action |
| --- | --- | --- |
| Reserved names |002 founder variants +008 complete NPC list;017 CAELUM only if retaining that name reservation contract | Reference-only rows, reviewed list; no boss/graveyard human records |
| Economy reference rows |030 eight pool keys and singleton counters(id=true), zero balances/counters before bootstrap | Schema-only dump omits INSERT rows, so seed explicitly |
| Reward weights |075 level_random: undo8, shuffle14, double_pile16, swap0, auto_sort26, freeze32 | Required by082; keep swap0; no rebalance |
| Economy Genesis |032 policy100,000,000 TOKEN and240,000 CREST to SYSTEM_RESERVE, through final040 RPC | Separate bootstrap, require pristine ledger/pools and idempotency; no031 prerequisite on clean state |
| Active NPC pools |034 amounts500,000 TOKEN +5,000 CREST each: BOT_POOL, MINION_POOL, NINE_SENTINELS_POOL, FOUR_GODS_POOL | Transfers from reserve through RPC; frozen3 pool reference rows may stay zero, no frozen test/activation |
| Test identities | New isolated staging auth users, profile provisioned through actual trigger/registration | No production auth/users dump; never033 email-based bulk funding |
| Test balances/entitlements | Existing welcome bonus3000 via registration mint; explicit additional QA ledger transfer only if needed/approved | Stable staging-only keys; VIP fixtures use existing states, never payment credentials |
| Inventory/rewards/tournaments | No baseline player items, claims, game history, progress, scores or awards | Generate through authoritative staging test flows; do not fabricate successful claim history |
| Shop configuration/storage | Verify actual current shop/reference usage and private avatars bucket policies from artifact |001 shop_items seed is absent; current shop prices largely in code, do not invent catalog or copy images |

Minimum bootstrap NPC funding would leave aggregate differences zero and both
counters and balances consistent. It is test-environment initialization, not an
economy rebalance. Existing daily/escrow mutations bypassing ledger remain known
coverage limits; do not fix accounting as part of baseline. Exact seed SQL will
be reviewable only once real baseline DDL is available.

## 8. Verification checklist before approval/application

- [ ] Artifact provenance: owner, source version/time and SHA256; no live-prod
      connection performed for this audit. Compare code contract to artifact.
- [ ] All prerequisites: extension schemas, gen_random_uuid, auth.users FK and
      authenticated/anon/service_role roles; never recreate Supabase platform.
- [ ] Correct users PK/auth link, profile creation trigger/defaults, nullable/
      required fields. Confirm real email presence rather than replay042.
- [ ] Final token default0, welcome bonus exactly once via authoritative ledger.
- [ ] Final generic inventory unique key/fields; distinguish storage bucket.
- [ ] All launch table/RPC/SQL-body dependencies, exact argument/return signatures,
      FK joins/indexes and schema-cache availability. Remove obsolete overloads
      only where final contract requires it; no unrelated cleanup.
- [ ] Owner-only client profile permissions; server service grants; ledger/items/
      receipts server-only; sequence USAGE for identity inserts; SECURITY DEFINER
      search_path and PUBLIC execute privileges. RLS enable flag alone is not ACL.
- [ ] No player/history data, auth credentials, payments, backup copies, frozen
      activation or historical reset/backfill SQL in baseline.
- [ ] Auth provisioning metadata is app-owned on auth.users; schema-only public
      export alone will omit that trigger. Storage bucket/settings are data, also
      omitted by schema-only public snapshot; configure separately if needed.
- [ ] Genesis/reference row preconditions, configured weights and active-pool
      supply; reconciliation0 before test games; seed retry idempotency.
- [ ] Fresh staging registration, profile fetch, normal allowed-tier settlement,
      item debit/replay, reward claim/replay/concurrent request, ad successful
      receipt and FREE/PRO/PRO_PLUS fixtures using existing interfaces.
- [ ]070 claim body/response agrees with090 replacement; transaction/receipt
      idempotency, freeze trigger and delegated ad wrapper preserved.
- [ ] Baseline catalog verified before telemetry; then nullable membership
      round-trip, RPC denial for public roles, UUID/semantic dedup/concurrency.
- [ ] Staging targets reconfirmed by ref before any later connection/write;
      production flags remainOFF; no production deployment or migration.

## 9. Proposed NEXT commands — LOCAL ONLY, not executed by this audit

First obtain an already-existing owner-reviewed schema-only artifact.
No production pg_dump/connection command is proposed under current permission.
Copy the sanitized artifact locally to supabase/baselines/rise_current_schema.sql
only after a separate baseline-preparation approval. That file does not exist yet.

From C:\Dev\TriplePoker, next approved review commands:
~~~powershell
$schemaArtifact = 'C:\Dev\TriplePoker\supabase\baselines\rise_current_schema.sql'
if (-not (Test-Path -LiteralPath $schemaArtifact)) {
    throw 'Reviewed schema artifact missing; STOP. Do not replay migrations.'
}
Get-FileHash -LiteralPath $schemaArtifact -Algorithm SHA256
node server/scripts/checkMigrationInventory.cjs
rg -n 'CREATE TABLE|CREATE.*FUNCTION|CREATE.*TRIGGER|CREATE POLICY|GRANT|REVOKE|ENABLE ROW LEVEL SECURITY' $schemaArtifact
rg -n 'DROP|TRUNCATE|DELETE|INSERT|UPDATE|COPY|ALTER.*(TYPE|RENAME)' $schemaArtifact
~~~

Review artifact locally for secrets before sharing output. Text hits inside
function bodies are runtime behavior, not permission to remove financial logic.
No baseline application/migration/deploy command is proposed for the NEXT step:
the required source DDL and seed files are not yet verified/generated.
Once reviewed, a later separate approval can specify stage-only psql -X -w
-v ON_ERROR_STOP=1 per-file execution with known target and failures stopping,
using the secure session credentials workflow already established. Do not use
current local Supabase link (production ref).

Audit deliverables only: this report, dependency manifest and relaunch decision
entry. Stop here for owner approval. No tests/build necessary for documentation
changes; local inventory and whitespace checks recorded below.


Local verification: migration inventory001–091 passes; all87 migration SHA256s
match audit manifest;87 classification rows present;55 table references and40
RPC names. Tracked/new-document whitespace checks pass. No database/runtime test
run for this documentation-only audit.
