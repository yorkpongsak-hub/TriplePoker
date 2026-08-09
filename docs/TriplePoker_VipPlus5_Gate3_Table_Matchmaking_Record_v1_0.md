# TriplePoker: Rise — VIP Plus 5-Player Gate 3 Table and Matchmaking Record v1.0

**Status:** Complete locally  
**Date:** 2026-08-03  
**Production feature flag:** Disabled

## Delivered

- Added a dedicated five-seat waiting-table registry isolated from the existing four-seat room tuples.
- The creator receives H1 and locks one of the three resolved wager snapshots for the table lifetime.
- Join order assigns H2 through H5 deterministically; a sixth player is rejected.
- One account cannot occupy multiple VIP Plus waiting tables.
- Create, join, confirm, list, and leave transports authenticate the Supabase access token and recheck active VIP Pro access.
- Create, join, and confirmation each read the current authoritative Token balance and enforce the selected required Buy-in.
- Entry confirmation requires the exact versioned Auto-Fold/Forfeit terms contract.
- A table becomes `READY` only with five occupied and confirmed seats.
- Before `READY` is announced, all five memberships and balances are queried again; an invalid seat loses confirmation and the table returns to `WAITING`.
- Public waiting state excludes player IDs and accepted-terms records.
- A host leaving before readiness closes the table; another player leaving releases only that fixed waiting seat.

## Economy Boundary

Gate 3 validates available Token but does not deduct it. Atomic five-player escrow is deferred until gameplay startup is connected, preventing funds from remaining locked in an incomplete waiting table.

## Verification

- Gate 1–3 focused tests: 24/24 passed.
- Existing room, escrow, tier authority, and Token Flow regression tests: 85/85 passed.
- Server TypeScript build: passed.
- Client TypeScript check: passed.
- Production feature flag remains disabled.

## Next Boundary

Gate 4 will consume a `READY` table, create a fresh shuffled deck, atomically acquire all five Buy-ins with rollback on partial failure, deal `45+7` or `45+6+1`, reveal center cards, and validate submitted `2–2–5` arrangements.

