# TriplePoker: Rise — Arena Gate 10 Implementation Plan v1.0

**Status:** Gate 10 complete locally; production flags remain disabled

**Date:** 2026-08-01

**Scope:** Tier S+ monthly qualification, event lifecycle, Last Boss succession foundation

**Code/migration work:** Gate 10.0–10.6 complete; migrations 017–019 executed successfully on Supabase

## Gate 10.0 — Canon and Contract Freeze

**Implementation status:** Complete (2026-08-01)

- Treat `TriplePoker_Arena_TierSPlus_Canon_Addendum_v1_0.md` as the highest-precedence Tier S+ product source.
- Reconcile legacy consolidated placeholders without changing completed Tier C–S behavior.
- Add typed configuration for schedule, qualification, economy, reservation, spectator limits, and retention.
- Exit: no unresolved value is hard-coded implicitly and contract tests cover canonical defaults.

## Gate 10.1 — Schema Design and Migration Draft

**Implementation status:** Complete (2026-08-01); migration 017 executed and verified on Supabase

- Cycles, matches, seats, ranking snapshots, path assignments, reserve offers, audit logs.
- Monthly MSS match entries and immutable best-ten snapshots.
- Ascendant activation/expiry and one-time Rookie consumption.
- Earned/Purchased Crown reservation composition and purchase debt state.
- Last Boss active reign, append-only Graveyard, normalized reserved throne names, mandatory rename state.
- Public event records and retention metadata; no private card state in public tables.
- Exit: migration reviewed by Founder before manual Supabase execution; no SQL is executed by Codex.

## Gate 10.2 — Monthly Score and Deterministic Selection

**Implementation status:** Domain and idempotent job boundary complete locally (2026-08-01)

- MSS 10/6/3 scoring and best-ten projection.
- Main/Ascendant pool routing, ten-match minimum, expiry rules, fallback ranking.
- Veteran/Rising Star/Ascendant Rookie selection and deterministic tie-break.
- Calendar generation for the last-Friday event weekend in Asia/Bangkok.
- Idempotent cutoff, snapshot, selection, and publish jobs.
- Exit: concurrency, cutoff-boundary, cross-month, pass-expiry, duplicate-user, and rerun tests pass.

## Gate 10.3 — Confirmation, Reserve, Check-in, and Standby

**Implementation status:** Complete; Founder executed migration 018 on Supabase (2026-08-01)

- Confirmation deadline and six-hour pre-event reserve offers.
- 30 Crown mixed-source reservation, release, settlement, and purchase-debt handling.
- Server-time FCFS standby, presence grace, immediate atomic promotion, bot fallback.
- Exit: exactly one participant/settlement per seat under concurrent workers and retries.

## Gate 10.4 — Last Boss Match Projection and Succession

**Implementation status:** Complete; Founder executed migration 019 on Supabase (2026-08-01)

- CAELUM active reign and dark-silhouette public identity.
- Unique overall winner, Bot conquest restriction, Discard Showdown evaluator.
- Atomic mandatory rename, permanent throne-name reservation, reign close/open, badges/titles.
- ANNULLED/admin succession without destructive history edits.
- Exit: settlement retry cannot duplicate succession, names, rewards, or Graveyard entries.

## Gate 10.5 — Delayed Public Feed and Capacity

**Implementation status:** Complete (2026-08-01)

- Separate allowlisted public projection; secret-field contract tests.
- 30-second persisted delay for events and snapshots, replay-on-gap, reconnect safety.
- 100-viewer FCFS capacity independent from Event Lobby/standby.
- Internal 90-day public-feed retention and permanent result/Graveyard archive.
- Exit: no payload or snapshot is newer than 30 seconds and no hidden field reaches spectator transport.

## Gate 10.6 — Client and Operations

**Implementation status:** Complete foundation (2026-08-01); production activation remains a separate release approval

- Monthly leaderboard pools, qualification/confirmation UI, Event Lobby, standby, capacity states.
- Mandatory post-conquest rename and succession ceremony.
- Public Cycle Archive and Last Boss Graveyard.
- Admin preview/publish/disqualify/reschedule/annul flows with audit reasons.
- Metrics and alerts for early feed, wallet mismatch, double seat, stuck transitions, and publisher gaps.
- Exit: browser/mobile visual QA, accessibility pass, failure recovery, and operational runbook complete.

## Required Verification

- Existing Arena 58/58, legacy 380/380, client typecheck, and server build must not regress.
- Add focused unit, integration, transaction-concurrency, timezone-boundary, security-contract, and reconnect tests.
- Provide a staging script that compresses a monthly cycle into minutes without changing production configuration.
- Keep `ARENA_ENABLED` and the new Sovereign feature flag disabled by default until release approval.

## Approval Boundary

Founder approval of this plan authorizes implementation and migration-file creation only. Supabase SQL remains manual, production flags remain off, and no deployment, push, or merge is implied.

## Gate 10.0–10.1 Verification Record

- Added locked Sovereign configuration and typed domain contracts.
- Reconciled Ascendant eligibility: Token ≥600,000, High Noble required, Monarch Slayer not required, once per account.
- Added `017_sovereign_foundation.sql` for cycles, matches, MSS, ranking snapshots, seats, reserve offers, mixed-source Crown reservations, standby, Last Boss reigns/names/mandatory rename, delayed public events, and audit logs.
- Added Earned-first/Purchased-second Crest source accounting fields and applied them through migration 017.
- Tier S fee configuration now uses flat 1 Crown; S+ uses 3 Crown and a 30 Crown reservation; neither adds Rake.
- Server TypeScript build passed.
- Arena tests passed: 67/67 across 10 suites.
- Full server regression passed: 389/389 across 33 suites.
- Production feature flags remain disabled.
- Migration 017 was executed through Supabase SQL Editor on 2026-08-01.
- Post-run verification returned `true` for Cycle, MSS, wallet reservation, Last Boss reign, public event tables, Purchased Crest column, CAELUM reservation, and RLS on Cycle/Public Events.

## Gate 10.2 Verification Record

- Added an Asia/Bangkok cycle generator using the final Friday, including weekends that cross into the next month.
- Enforced scoring start at day 1 `00:00:01`, exclusive Sunday `18:00:00` cutoff, announcement, confirmation, check-in, and match timestamps as UTC instants.
- Added MSS 10/6/3 scoring, Best-10 ranking, all-match tie-break score, early-achievement tie-break, Bot count, and deterministic user fallback.
- Bot-through-completion counts toward the ten-match minimum but awards zero MSS.
- Ascendant matches count only while qualification access is active; expired-at-cutoff candidates cannot be selected.
- Added separate Main/Ascendant rankings and deterministic 3 Veteran + 3 Rising Star + 3 Ascendant Rookie selection.
- Primary path seats are protected before fallback ranking fills vacancies; one user cannot occupy two monthly seats.
- Added an idempotent cutoff/snapshot/selection job boundary that fails closed on early execution or missing authoritative profile data.
- Gate 10.2 focused tests passed: 17/17.
- Arena tests passed: 84/84 across 14 suites.
- Full server regression passed: 406/406 across 37 suites.
- Server TypeScript build passed and production feature flags remain disabled.

## Gate 10.3 Verification Record

- Added idempotent confirmation, deadline expiry, and six-hour pre-event reserve-offer windows capped at standby opening.
- Added server-time check-in boundaries: `20:04:59.999` accepted and `20:05:00.000` rejected/no-show.
- Added Earned-first/Purchased-second reservation allocation, purchase-debt blocking, actual-spend settlement, and source-correct refunds.
- Added standby join window, 20-second reconnect grace, FCFS ordering, invalid-entry skip, and immediate promotion model.
- Added migration 018 with service-role-only atomic reserve/settle/release RPCs, source ledger, row locks, advisory idempotency, and `SKIP LOCKED` standby promotion.
- Gate 10.3 focused tests passed: 12/12.
- Arena tests passed: 96/96 across 18 suites.
- Full server regression passed: 418/418 across 41 suites.
- Server TypeScript build passed; Founder confirmed migration 018 executed on Supabase and feature flags remain disabled.

## Gate 10.4 Verification Record

- Added the locked Pok Deng hierarchy for two/three discarded cards, Deng/rank/suit comparison, Boss exact-tie defense, and human seat-order fallback.
- Added unique overall winner resolution, Discard Showdown on top-score ties, and Bot-through-completion conquest rejection.
- Added stable dark-silhouette Last Boss identity with deterministic twelve-aura rotation.
- Added migration 019 for idempotent CAELUM activation, atomic active-reign rotation, permanent throne-name reservation, mandatory rename, and cosmetic-only entitlements.
- Mandatory rename validates the existing 3–9 character policy, rejects all reserved/historical throne names, and is retry-safe with a separate completion idempotency key.
- Gate 10.4 focused tests passed: 9/9.
- Arena tests passed: 105/105 across 21 suites.
- Full server regression passed: 427/427 across 44 suites.
- Server TypeScript build passed; Founder confirmed migration 019 executed on Supabase and feature flags remain disabled.

## Gate 10.5–10.6 Verification Record

- Added an explicit public-event allowlist and recursive secret-field rejection before spectator persistence or transport.
- Enforced the 30-second visibility boundary for incremental replay and delayed snapshots, with sequence-gap detection and idempotent event handling.
- Added exactly 100 FCFS spectator seats per match, independent of standby, with a 20-second reconnect reservation before capacity is released.
- Added client contracts for qualification/event-lobby, standby, delayed-feed, Cycle Archive, and Last Boss Graveyard states.
- Added a client event store that detects duplicates/gaps and clears delayed spectator state before a promoted player receives private state.
- Added validated admin-command contracts, audit-reason requirements, operational alert evaluation, and a compressed staging-cycle timeline.
- Focused Gate 10.5–10.6 tests passed: 8/8.
- Arena tests passed: 113/113 across 23 suites.
- Full server regression passed: 435/435 across 46 suites.
- Server build and client TypeScript checks passed; Sovereign and Arena production flags remain disabled.

## Gate 10.7 — Unified Tier Progression

**Implementation status:** Complete; Founder executed migration 020 and post-run verification passed (2026-08-01)

- Grandmaster/Tier S unlocks when real `token_balance` becomes greater than 1,000,000 (`1,000,001` minimum).
- The first qualifying crossing permanently records `tier_unlocked_max = grandmaster`; spending Token later never locks Tier S again.
- There is no account-age, Level, Monarch Slayer, or other skill requirement for the normal Tier S path.
- Legacy `arena_unlocked` grants no grandfather access and is no longer an authority for Lobby or Arena matchmaking.
- The obsolete 20-Crown Arena Pass sale is retired so players cannot pay for an entitlement the new progression model does not use.
- Ascendant remains a separate 30-day shortcut and Sovereign remains a monthly event entitlement, not a permanent tier.
- Migration 020 adds `grandmaster_unlocked_at`, an automatic Token-balance trigger, and a Token-qualified backfill only.
- Full server regression passed: 446/446 across 50 suites. Server build and client TypeScript checks passed.
- Post-run verification confirmed all three `@triplepoker.dev` test accounts have `tier_unlocked_max = grandmaster` and a non-null `grandmaster_unlocked_at`.
