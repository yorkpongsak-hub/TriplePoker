# TriplePoker: Rise — VIP Plus 5-Player Gate 0 Canon v1.0

**Status:** Locked for implementation  
**Date:** 2026-08-03  
**Owner decision:** Five human players; `VIP Plus` maps to the existing VIP Pro membership

## 1. Authority and Scope

This document freezes the implementation contract for the VIP Plus five-player table. For this mode, it has precedence over older general table-composition rules when they conflict. The gameplay source remains `TRIPLEPOKER_VIP_PLUS_5_PLAYER_TECHNICAL_SPEC.md`.

The mode belongs to the main TriplePoker: Rise application and is reached from the same Lobby as the existing tables.

## 2. Locked Product Identity

- Product label shown to players: `VIP Plus`.
- Existing account entitlement used by code and persistence: `vip_status === 'vip_pro'`.
- Do not add a second VIP Plus membership field or infer access from cosmetic VIP state.
- The mode has a dedicated route, table type, server state, and feature flag.
- It is not an Arena, Sovereign, or ordinary VIP private table.

## 3. Lobby Discovery and Access

- The VIP Plus table entry appears in the main Lobby alongside other table entries.
- Only authenticated users with an active authoritative `vip_pro` membership may receive or see the entry.
- Client filtering is presentation only and is never sufficient authorization.
- The server must revalidate active `vip_pro` membership when listing eligible table types, creating or joining a table, confirming entry, and starting a match.
- Direct route navigation, forged socket events, stale Lobby state, and shared room identifiers must not bypass the server check.
- Non-eligible clients receive a sanitized denial and no private table or membership information.
- Expiry before match start blocks entry/start. Expiry after an authoritative match start does not terminate that active match.

## 4. Table Composition Exception

- A match contains exactly five human seats: `H1` through `H5`.
- No Bot, Boss, takeover AI, or replacement player is allowed.
- A sixth player cannot join.
- Seats remain fixed through all three games, including disconnect and Forfeit cases.
- The match starts only when all five seats are occupied, all five entry confirmations are valid, all five balances pass the selected Buy-in requirement, and all five memberships pass the final server check.

This is an explicit mode-specific exception to the older project-wide rule requiring an AI at every table. The exception is a Founder decision dated 2026-08-03.

## 5. Legal and Release Boundary

- The five-human exception requires legal review before production activation.
- A dedicated server-authoritative feature flag must default to disabled.
- Development, automated tests, and controlled staging are allowed while the flag is disabled in production.
- No deployment or production activation is authorized by this Canon.
- Existing legal text remains unchanged: `Crown and Token cannot be exchanged for real money.`
- The mode uses Token only and does not introduce Crown wagering or real-money redemption.

## 6. Frozen Gameplay Contract

- Exactly three games per match.
- Fresh server-shuffled 52-card deck per game.
- Each player receives nine cards arranged as `2–2–5`.
- Games 1–2 use seven center cards in `3–3–1`.
- Game 3 uses six center cards in `3–3–0` plus one face-down auction card.
- Center cards are revealed before initial arrangement.
- Betting rounds per game are G1 once, G2 once, and G3 twice.
- Action order is H1 clockwise, H5 counter-clockwise, H1 clockwise, H5 counter-clockwise; it resets each game.
- Fold is pile-scoped. Insufficient Token causes Auto-Fold. There is no All-in.
- Game 3 uses a sealed single-submit auction followed by rearrangement for all players.
- Auction payment is an immediate Token Burn outside Pot and Jackpot.
- Final ranking is Net Token, total pile wins, G3 wins, then joint winner.
- All gameplay deadlines are configuration-driven and server-authoritative.

## 7. Reuse and Isolation Contract

- Reuse existing tier economy values, hand ranking, foul validation, Token Panel, ledger pipeline, betting, showdown, settlement, and High Noble timing defaults where compatible.
- Snapshot resolved wager and Buy-in values when the table is created.
- Add five-seat traversal and layouts as explicit configuration or dedicated strategies.
- Keep the VIP Plus match state machine isolated enough that existing four-player modes remain behaviorally unchanged.
- Client sends intent only. Shuffle, deal, deadlines, validation, auction, economy, settlement, and ranking remain server-authoritative.

## 8. Terminology Contract

| Product term | Implementation meaning |
|---|---|
| VIP Plus | Existing active VIP Pro membership (`vip_status === 'vip_pro'`) |
| H1–H5 | Fixed authoritative human seat identifiers |
| Forfeit | Intentional exit; seat remains and Auto-Folds through match end |
| Temporary disconnect | Seat remains; deadlines continue; reconnect resumes only from the current eligible phase |
| Auction Burn | Winning bid deducted once and excluded from Pot and Jackpot |

UI strings remain English. Internal identifiers may use `vipPlus`, but entitlement checks must resolve through the existing authoritative `vip_pro` membership source.

## 9. Gate Plan

1. Gate 0 — Canon and Contract Freeze
2. Gate 1 — VIP Plus Lobby and Access Control
3. Gate 2 — Configuration and Five-Seat Foundation
4. Gate 3 — Table Creation and Matchmaking
5. Gate 4 — Deal, Arrangement, and Hand Validation
6. Gate 5 — Betting State Machine
7. Gate 6 — Game 3 Blind Auction
8. Gate 7 — Disconnect, Reconnect, and Forfeit
9. Gate 8 — Settlement, Ledger, and Final Ranking
10. Gate 9 — Client Integration, Security, and Release Verification

## 10. Gate 0 Exit Criteria

- `VIP Plus` is unambiguously mapped to existing VIP Pro membership (`vip_pro`).
- Same-Lobby discovery and server-side authorization boundaries are locked.
- Five-human/no-AI composition is recorded as an explicit exception.
- Production remains disabled pending legal review and release approval.
- No Ante, Call, Pot, Buy-in, or legacy timing number is invented or duplicated.
- No unresolved product decision remains before Gate 1.
