# TriplePoker: Rise — VIP Plus Reduced Table Gate 1 Record v1.0

**Status:** Complete locally  
**Date:** 2026-08-03  
**Scope:** Lobby authorization only; Blank-seat gameplay is deferred to Gate 2.

## Delivered

- A VIP Plus waiting table still accepts up to five human players, but now exposes a three-player minimum.
- H1 is the only seat allowed to approve opening a table with three or four human players.
- Every occupied seat must accept the current entry terms before H1 can approve an early start.
- The server rechecks VIP Pro access and Buy-in balance before accepting H1 approval.
- Early-start approval is revoked whenever membership or eligibility changes.
- Public table state exposes only safe readiness flags; player IDs remain private.
- The waiting UI shows the minimum player count, confirmation requirement, and an H1-only confirmation dialog stating how many Blank seats will be created.
- Entry terms were advanced to `2026-08-03.v2` to cover reduced-table behavior.

## Gate Boundary

Gate 1 records H1 authorization but deliberately does not invoke the match engine. Gate 2 will create the one or two Blank seat placeholders, transition the table to gameplay, and ensure those seats never receive turns or settlement participation.

## Verification

- VIP Plus waiting-table tests: 13/13 passed.
- Server TypeScript check: passed.
- Client TypeScript check: passed.
