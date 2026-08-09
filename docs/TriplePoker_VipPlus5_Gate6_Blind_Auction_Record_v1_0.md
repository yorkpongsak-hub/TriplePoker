# TriplePoker: Rise — VIP Plus 5-Player Gate 6 Blind Auction Record v1.0

**Status:** Complete locally  
**Date:** 2026-08-03

## Delivered

- Game 3 enters a seven-second sealed auction after all five initial arrangements are locked.
- Added exactly four fixed prices resolved from `0.5x`, `1x`, `1.5x`, and `2x` the selected Call value.
- Added single-submit bid locking and authoritative balance validation.
- Bid amount, receipt time, and monotonic receipt sequence remain server-only during the auction.
- Equal highest bids resolve to the first authoritative server receipt.
- Winning Token is deducted exactly once, recorded separately as Auction Burn, and excluded from Pot and Fee & Rake.
- Public resolution contains winner seat, winning amount, seat-projected balances, and rearrangement deadline only.
- The auction card is sent privately only to the winner.
- No-bid resolution burns the card without revealing identity and still opens rearrangement.
- All five players receive the 15-second rearrangement phase; no action preserves the last valid arrangement.
- The winner may submit any valid nine-card subset of the ten available cards, using or discarding the auction card.
- The resulting nine cards become the authoritative final hand; discarded identity is not emitted.
- After all submissions or timeout, Game 3 continues into the Gate 5 betting state machine.

## Verification

- Gate 1–6 focused tests: 41/41 passed.
- VIP Plus deal/betting/auction engine suite: 17/17 passed.
- Existing evaluator, foul, escrow, Token Flow, and High Noble snapshot regressions: 128/128 passed.
- Server TypeScript build: passed.
- Client TypeScript check: passed.
- Auction privacy tests confirm no card identity or receipt sequence in room-wide events.

