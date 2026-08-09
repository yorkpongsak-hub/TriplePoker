# TriplePoker VIP Plus 5-Player - Gate 9 Ranking and Settlement Record

**Status:** Complete  
**Version:** 1.0  
**Date:** 2026-08-03

## Scope delivered

- Added authoritative match ranking after Game 3.
- Ranking order is locked to: Net Token, total group/pile wins, G3 wins, then joint winners.
- Net Token is calculated from the final authoritative escrow stack minus the snapshotted Buy-in. The Game 3 auction burn is already reflected in the final stack and therefore in Net Token.
- Ranking rows retain seat, player, final stack, Net Token, pile wins, G3 wins, rank, and winner status.
- Exact ties across all three metrics share the same rank and are emitted as joint winners.
- Finalization is idempotent. Repeated calls cannot settle escrow, persist metrics, or emit `match_complete` twice.
- All five escrows are settled with their authoritative final stacks through the existing atomic settlement path.
- Added `vip_plus_match_results` audit persistence with a `(room_id, player_id)` primary key and idempotent upsert.
- Persistence failure is logged but cannot suppress the already-calculated match result or prevent other players' settlement attempts.
- Added the final `MATCH_COMPLETE` phase and reconnect-safe result snapshot.
- Added a Mastermind-style Match End overlay showing final stack plus the VIP Plus tie-break columns: Net, Piles, and G3.
- The Client displays server-ranked rows only and performs no winner or metric calculation.
- The disabled-by-default VIP Plus feature flag remains unchanged. This gate does not activate production access.

## Database artifact

- `supabase/migrations/024_vip_plus_match_results.sql`

This migration must be applied through the normal Supabase deployment process before production activation.

## Verification

- Unit coverage includes every ranking level and full joint-winner equality.
- Unit coverage verifies settlement/persistence/event idempotency.
- VIP Plus Gate 1-9 suites: 49 tests pass.
- Existing evaluator, foul, escrow, Token Flow, and High Noble snapshot regression: 128 tests pass.
- Client TypeScript: pass.
- Server production TypeScript config: pass.
- `git diff --check`: pass; pre-existing line-ending warnings are unrelated to this feature.

## Release boundary

Implementation gates are complete. Production activation remains blocked on:

1. Applying migration 024.
2. Controlled five-client end-to-end/device QA.
3. Legal review of the approved five-human/no-AI exception.
4. Explicit release approval followed by enabling the default-off feature flag.
