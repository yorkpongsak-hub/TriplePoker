# TriplePoker VIP Plus 5-Player - Gate 8 Reconnect and Forfeit Record

**Status:** Complete  
**Version:** 1.0  
**Date:** 2026-08-03

## Scope delivered

- Added authoritative seat lifecycle states: `CONNECTED`, `DISCONNECTED`, and `FORFEITED`.
- Socket disconnect marks the fixed seat disconnected without pausing or replacing the player.
- Reconnect authenticates VIP Pro access again, restores the Socket.IO table/private rooms, and marks the seat connected.
- Client stores only the active table identifier and automatically requests a new sanitized snapshot after socket or app reconnection.
- Snapshot includes public center, seats/statuses, deadline, phase, public balances, pots, current betting state, and only the requesting player's hand/arrangement/bid/private auction card.
- Snapshot never includes another player's hand, sealed bid, private auction card, or discard identity.
- A disconnected acting player remains governed by the existing server deadline and is Auto-Folded when it expires.
- Initial arrangement now has a server timeout fallback so a disconnected/non-responsive player cannot stall the match.
- Intentional exit uses an irreversible Forfeit action, retains the H1-H5 seat, folds all remaining groups, and skips that player in current/future action traversal.
- Client shows `DISCONNECTED`, `FORFEITED`, and `AUTO-FOLD` badges and requires confirmation before Forfeit.

## Verification

- Client TypeScript: pass.
- Server production TypeScript config: pass.
- VIP Plus Gate 1-8 suites: 44 tests pass.
- Existing evaluator, foul, escrow, Token Flow, and High Noble snapshot regression: 128 tests pass.
- `git diff --check`: pass; reported line-ending warnings belong to pre-existing modified files.

## Deferred to Gate 9

- Final three-game match ranking from authoritative ledger metrics.
- Joint-winner result presentation and match-complete settlement/persistence.
- Controlled five-client end-to-end release QA and legal/feature-flag activation checklist.
