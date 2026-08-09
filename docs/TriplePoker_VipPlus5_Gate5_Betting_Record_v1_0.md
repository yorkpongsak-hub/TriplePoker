# TriplePoker: Rise — VIP Plus 5-Player Gate 5 Betting Record v1.0

**Status:** Complete locally  
**Date:** 2026-08-03

## Delivered

- Added four server-authoritative betting rounds per game: G1 once, G2 once, and G3 twice.
- Added deterministic H1 clockwise, H5 counter-clockwise, H1 clockwise, H5 counter-clockwise traversal.
- Reset the same action-order definition at each new game.
- Added absolute server action deadlines and timeout Auto-Fold.
- Added authenticated Call/Fold transport with acting-seat validation.
- Added pile-scoped Fold; a G1/G2 Fold does not affect later groups, while a G3 Round 1 Fold remains folded for G3 Round 2.
- Added insufficient-balance Auto-Fold with no partial Call, All-in, or negative Call deduction.
- Added Call movement from player stack into only the current group's Pot.
- Added deterministic showdown using the locked combined-hand evaluator and H1–H5 seat order for exact ties, matching the existing first-in-order behavior.
- Added per-group payout and Rake settlement.
- Reused the existing Triple Sweep bonus and jackpot-rake formula.
- Added Game 2/Game 3 deal, Ante, arrangement reset, center reveal, and action-order reset while preserving the original escrow stacks.
- Game 3 pauses at `AWAITING_GAME3_AUCTION` after all initial arrangements, ready for Gate 6.

## Verification

- Gate 1–5 focused tests: 35/35 passed before the final Triple Sweep assertion; the expanded Gate 4–5 engine suite passes 12/12.
- Hand evaluator, foul checker, escrow, Token Flow, and High Noble snapshot regressions: 128/128 passed.
- Server TypeScript build: passed.
- Client TypeScript check: passed.
- Token conservation remains equal to five Buy-ins across settlement and next-game Ante collection.

## Gate Boundary

Gate 5 does not resolve the Game 3 auction. Game 3 betting starts only after Gate 6 completes auction resolution and rearrangement.

