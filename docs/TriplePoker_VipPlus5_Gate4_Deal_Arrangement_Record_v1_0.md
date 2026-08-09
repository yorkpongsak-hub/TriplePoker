# TriplePoker: Rise — VIP Plus 5-Player Gate 4 Deal and Arrangement Record v1.0

**Status:** Complete locally  
**Date:** 2026-08-03

## Locked Evaluation Decision

- G1 combines the player's arranged two cards with the three G1 center cards and evaluates exactly five cards.
- G2 combines the player's arranged two cards with the three G2 center cards and evaluates exactly five cards.
- In Games 1–2, G3 combines the player's arranged five cards with the one G3 center card and selects the best five-card combination from six.
- In Game 3 initial arrangement, G3 evaluates the arranged five cards because the G3 center row is empty.
- The canonical evaluator never receives more than five cards.

## Delivered

- Added authoritative 52-card deals for all three game layouts with no duplicate or unused cards.
- Added five-player sequential escrow acquisition using the selected next-tier Buy-in and rollback of every earlier acquisition if any seat fails.
- Added Game 1 match initialization from a `READY` waiting table.
- Added absolute server arrangement deadline using the High Noble-derived configuration.
- Added separate public center-card and private per-player hand events.
- Added exact ownership, uniqueness, `2–2–5` size, and ascending hand-strength validation.
- Added single-submit arrangement locking and transition to `HANDS_LOCKED` only after all five valid submissions.
- Added authenticated arrangement transport; public lock events contain authoritative seat identifiers rather than private player IDs.
- Added injectable controlled-deal support for deterministic multiplayer tests without changing production shuffle behavior.

## Verification

- Gate 1–4 focused tests: 31/31 passed.
- Hand evaluator, foul checker, escrow, Token Flow, and High Noble snapshot regressions: 128/128 passed.
- Server TypeScript build: passed.
- Client TypeScript check: passed.
- `git diff --check`: passed.

## Gate Boundary

Gate 4 ends at validated hand lock. G1/G2/G3 betting order, pile settlement, per-game continuation, and match completion begin in Gate 5.

