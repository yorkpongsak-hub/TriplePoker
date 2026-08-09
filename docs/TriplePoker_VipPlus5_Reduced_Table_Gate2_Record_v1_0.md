# TriplePoker: Rise — VIP Plus Reduced Table Gate 2 Record v1.0

**Status:** Complete locally  
**Date:** 2026-08-03  
**Scope:** Blank-seat creation and match-engine participation boundary.

## Delivered

- H1 early-start approval now atomically locks the 3–4 player table and starts the match.
- Empty fixed seats are materialized as server-owned `BLANK` placeholders until all H1–H5 positions are present.
- Every Blank receives nine cards from the same authoritative 52-card deal, preserving the existing deck accounting.
- Blank cards remain private and are never emitted as a private hand.
- Blank seats have no socket, escrow, Buy-in, ante, Call, Fold, auction bid, rearrangement, settlement, ranking, jackpot liability, or win eligibility.
- Arrangement completion, betting order, auction completion, and game progression now count human seats only.
- Pots and Triple Sweep liability scale from the actual human-player count.
- Client table state labels these positions `BLANK`, dims them, and displays card backs without exposing card faces.
- Reconnect snapshots preserve Blank seat identity and status.

## Verification

- VIP Plus registry and match-engine tests: 39/39 passed.
- Added a focused three-human/two-Blank match test covering escrow count, full dealing, private-hand isolation, pot sizing, arrangement completion, and betting order.
- Server TypeScript check: passed.
- Client TypeScript check: passed.
- Diff check: passed.
