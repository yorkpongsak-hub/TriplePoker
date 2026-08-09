# TriplePoker: Rise — VIP Plus 5-Player Mastermind UI Reuse Plan v1.0

**Status:** Locked for Gate 9 implementation  
**Date:** 2026-08-03  
**Primary UX reference:** Mastermind table

## Reuse Directly

- `GameTopBar` for table header, info entry, and server-projected timer slot.
- `Card` and `cardAssets` for card face/back rendering.
- `ActionButton` for Ready, Call, Fold, and confirmation actions.
- `TokenFlowPanel` visual language and server-owned number projection.
- `FlyingCoins` for Call, Pot, payout, and auction-burn movement.
- `ExitTableButton` with VIP Plus Forfeit behavior connected later.
- `MatchEndOverlay` presentation shell.
- `TierInfoModal` presentation pattern with VIP Plus-specific labels and rules.
- `AvatarFrame`, table skins, glass styles, haptic warning pattern, and reduce-motion policy.

## Reuse with a VIP Plus Adapter

- `PlayerHandView`: retain tap/swap/card rendering, but configure `2–2–5`, nine/ten-card rearrangement, and server lock states.
- Mastermind `TimerDisplay` pattern: extract/reuse visual projection, but calculate from authoritative `deadlineAt` rather than a client-owned countdown.
- `AuctionOverlay`: retain modal hierarchy, card-back focus, glow, countdown, and locked-bid feedback; replace the two-card/level contract with one hidden card and four fixed price buttons.
- `TokenFlowPanel`: extend labels/accounting for five human stacks and explicit Auction Burn outside Pot/Fee & Rake.
- `GFHandView`/Call-Fold presentation: retain action emphasis and countdown treatment, but drive four VIP Plus betting rounds and current H1–H5 acting seat.
- Deal, showdown, result, and coin animations: retain motion language while using five-seat targets and privacy-safe server events.

## Build New

- Five-human table geometry and client-relative H1–H5 seat projection.
- H1 wager-selection panel and H2–H5 entry-confirmation panel.
- Disconnected/Forfeited/Auto-Fold badges for fixed seats.
- Game 3 `3–3–0` center area with one face-down auction slot.
- Private auction-card affordance and discard-without-reveal state.
- Match ranking panel for Net Token, pile wins, G3 wins, and joint winners.

## Do Not Reuse

- Mastermind four-seat `SEAT_TARGETS` constants.
- Boss/Sentinel selection, story, Boss avatar, `BossHandRow`, AI status, or personality logic.
- Mastermind Fog of War sequence.
- Two-card auction server/client contract, random tie resolution, or AI bidding.
- Client-authoritative countdown completion or locally calculated Token values.

