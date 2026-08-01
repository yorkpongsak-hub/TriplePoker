# TriplePoker: Rise — Gate 10 Operations Runbook v1.0

**Status:** Local implementation complete; production flags disabled

## Release boundary

- Do not enable Arena or Sovereign production flags without a separate Founder release approval.
- Migrations 017–019 have been confirmed as executed on Supabase.
- Purchased Crown is spendable in Tier S/S+ economy but is never cash-redeemable.

## Pre-event checks

1. Preview the monthly cutoff, ranking snapshots, nine selected players, confirmation status, standby order, and three match timestamps.
2. Reconcile every 30 Crown reservation against its Earned/Purchased source ledger.
3. Confirm CAELUM/current Last Boss reign is unique and active.
4. Confirm public-event publisher delay is at least 30 seconds and capacity is 100 per match.
5. Run the compressed staging timeline from `createCompressedStagingTimeline` without changing production configuration.

## Alerts requiring intervention

- `PUBLIC_FEED_EARLY`: stop public publishing immediately; preserve private logs.
- `PUBLIC_SEQUENCE_GAP`: pause the affected feed and replay from the last acknowledged sequence.
- `WALLET_RESERVATION_MISMATCH`: block seat settlement/promotion until reconciled.
- `DOUBLE_ACTIVE_SEAT`: freeze the affected cycle and resolve under an audited admin command.
- `STUCK_TRANSITION`: inspect the cycle/match transition and retry idempotently.

## Admin safety

- Preview is read-only.
- Publish, disqualify, reschedule, and annul commands require an operator ID, reason, idempotency key, and audit record.
- Last Boss history is append-only. Corrections use `ANNULLED`; never delete a reign or Graveyard entry.
- Mandatory winner rename must complete before normal account play resumes.

## Recovery

- Spectator reconnect keeps capacity for 20 seconds; after expiry the seat is released.
- On spectator sequence gap, request replay after the last applied sequence.
- On standby promotion, discard all delayed public state before delivering the private player snapshot.
- Retry wallet and succession operations only with their original idempotency keys.

## Verification baseline

- Focused Gate 10.5–10.6: 8/8 tests.
- Arena: 113/113 tests across 23 suites.
- Full server: 435/435 tests across 46 suites.
- Server TypeScript build: passed.
- Client TypeScript check: passed.

## Post-Gate 10 runtime integration

- Authenticated player endpoints are registered under `/sovereign/*`.
- The Grandmaster lobby links to `/game/sovereign` for the live event hub.
- Confirmation, check-in, standby reservation, delayed feed, archive/Graveyard, and mandatory rename are connected to migrations 017–019.
- Failed check-in/standby mutations release the Crown reservation before returning an error.
- The lifecycle ticker starts only when `SOVEREIGN_ENABLED=true`; production remains fail-closed otherwise.
- Updated verification: 440/440 server tests across 48 suites; server build and client typecheck passed.
