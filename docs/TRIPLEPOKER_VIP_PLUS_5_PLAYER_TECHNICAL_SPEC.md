# TriplePoker: Rise — VIP Plus 5-Player Table Technical Specification

**Status:** Ready for implementation  
**Version:** 1.0  
**Date:** 2026-08-03  
**Target:** React / React Native client with authoritative multiplayer server  

## 1. Objective

Implement a VIP Plus-only multiplayer table for exactly five human players. The mode uses one standard 52-card deck, three games per match, Token economy, existing betting rules, and no Bot or Boss AI.

The implementation should reuse the existing High Noble table flow, UI components, betting logic, Token Panel, showdown logic, and phase timings wherever possible. All timing values must be configuration-driven so they can be tuned after playtesting.

## 2. Non-goals

- Do not implement Bot or Boss AI for this mode.
- Do not add Crown or any new currency.
- Do not implement All-in.
- Do not replace disconnected or forfeiting players.
- Do not add a High Noble wager option.
- Do not hard-code phase durations inside UI components or game-state handlers.

## 3. Access and Table Composition

- The table entry is displayed in the main Lobby alongside existing tables, but only to eligible VIP Plus members.
- `VIP Plus` maps to the existing active VIP Pro membership (`vip_status === 'vip_pro'`); do not add a duplicate entitlement field.
- Access is restricted to active VIP Plus members and must be enforced server-side for listing, create/join, entry confirmation, and match start. Client visibility is not authorization.
- A match requires exactly five human seats: `H1`, `H2`, `H3`, `H4`, and `H5`.
- Seat identity remains fixed for the entire match.
- The first player entering/creating the table becomes `H1` and selects the wager option.
- The selected wager option is locked for the entire match.
- `H2–H5` must see the wager, required Buy-in, and disconnect/Auto-Fold terms before confirming entry.
- The match starts only after all five seats are occupied and all server-side eligibility and balance checks pass.
- Direct navigation or forged/stale client requests must not bypass VIP Plus eligibility.

### 3.1 Five-human composition exception

This mode is an explicit Founder-approved exception to the older project-wide rule requiring an AI at every table. It uses exactly five humans and no Bot/AI. Production activation must remain behind a disabled-by-default feature flag until legal review and explicit release approval are complete.

## 4. Wager and Buy-in Options

Provide exactly three options. Each option uses the betting values of one tier but the Buy-in requirement of the next tier.

| Option | Ante, Pot, Call/Fold values | Required Buy-in |
|---|---|---|
| 1 | Initiate values | Adept Buy-in |
| 2 | Adept values | Mastermind Buy-in |
| 3 | Mastermind values | High Noble Buy-in |

VIP Plus mode-specific Call values locked by Founder decision on 2026-08-03:

- Option 1 / Initiate wager: `50 Token` per Call.
- Option 2 / Adept wager: `100 Token` per Call.
- Option 3 / Mastermind wager: resolve the current authoritative Mastermind Call value from configuration.

The first two values are explicit mode-specific overrides because the existing Initiate and Adept modes do not have Call/Fold values.

Implementation requirements:

- Read all numeric values from the existing tier/economy configuration.
- Do not duplicate existing tier numbers in the VIP Plus mode configuration. The two locked Call overrides above are the only mode-specific economy values.
- Snapshot the resolved values when the table is created so later configuration changes cannot alter an active match.
- Server validates each joining player's available Token balance against the selected required Buy-in.
- Use Token for Ante, Call/Fold, payouts, and Game 3 auction bids.
- If a player later lacks enough Token for a required Call, apply Auto-Fold to that pile. There is no All-in.

## 5. Match Structure

One match contains exactly three games.

| Game | Player hand layout | Center-card layout | Auction |
|---|---|---|---|
| Game 1 | `2–2–5` | `3–3–1` | None |
| Game 2 | `2–2–5` | `3–3–1` | None |
| Game 3 | `2–2–5` | `3–3–0` | One blind auction card |

Deck accounting:

- Games 1–2: `5 players × 9 cards = 45` plus `7 center cards = 52`.
- Game 3: `45 player cards + 6 center cards + 1 auction card = 52`.
- No unused deck card and no initial burn card are required.
- A fresh, server-shuffled 52-card deck is used for every game.

## 6. Hand Rules

Each player receives nine cards and must arrange them as:

- `G1`: 2 cards
- `G2`: 2 cards
- `G3`: 5 cards

Validation:

- Preserve the existing ascending arrangement rule: `G1 < G2 < G3`.
- Use the project's existing canonical hand-ranking and foul-hand validation functions.
- For two-card groups, use the existing supported two-card ranking rules; do not introduce a separate VIP-only ranking system.
- The server is authoritative for all final hand validation.
- Locked Founder decision (2026-08-03): evaluate G1 and G2 by combining each arranged two-card group with its three center cards (`2 + 3 = 5`). Evaluate G3 by combining the arranged five-card group with its one center card in Games 1–2 and selecting the best five of six; Game 3 initially evaluates the five arranged cards because its G3 center row is empty. Never pass more than five cards directly to the canonical evaluator.

## 7. Center Cards and Initial Arrangement

- Deal all player cards first.
- Immediately reveal all center cards for the current game.
- Games 1–2 reveal all seven cards in `3–3–1` layout.
- Game 3 reveals all six cards in `3–3–0` layout.
- Players must see the revealed center cards before arranging their hands.
- Use the High Noble arrangement timer as the initial configured duration.

## 8. Betting Flow

Call/Fold is active from `G1` in every game.

| Group | Betting rounds |
|---|---:|
| G1 | 1 |
| G2 | 1 |
| G3 | 2 |

Every game therefore contains four Betting Rounds, and one match contains twelve Betting Rounds.

### 8.1 Alternating action order

The action-order pattern resets at the beginning of each game:

| Betting Round | Group | Start seat | Direction |
|---:|---|---|---|
| 1 | G1 Round 1 | H1 | Clockwise: H1 → H2 → H3 → H4 → H5 |
| 2 | G2 Round 1 | H5 | Counter-clockwise: H5 → H4 → H3 → H2 → H1 |
| 3 | G3 Round 1 | H1 | Clockwise: H1 → H2 → H3 → H4 → H5 |
| 4 | G3 Round 2 | H5 | Counter-clockwise: H5 → H4 → H3 → H2 → H1 |

Then Game 2 resets to Betting Round 1 beginning with H1, and Game 3 does the same.

### 8.2 Fold behavior

- Fold applies only to the current group/pile.
- A folded player may participate normally in the next group if connected and sufficiently funded.
- A player who cannot afford the Call is automatically folded for the current group.
- There is no All-in or partial Call.
- Use existing Ante, Call/Fold, Pot settlement, and payout rules unless this document explicitly overrides them.

## 9. Game 3 Blind Auction

The final undealt card is a face-down auction card. The auction occurs only in Game 3 and only after the first arrangement phase.

### 9.1 Auction sequence

1. Deal nine cards to each player.
2. Reveal the six center cards in `3–3–0` layout.
3. Run the normal initial arrangement phase.
4. Keep the 52nd card face-down and begin a sealed, single-submit auction.
5. Each active player may submit one of four fixed prices within seven seconds.
6. Do not reveal the card face or other players' bids during the auction.
7. Resolve the highest bid on the server.
8. If multiple bids have the same highest value, the earliest bid received by the authoritative server wins.
9. Deduct the winner's bid immediately and update every relevant Token Panel immediately.
10. Reveal the auction card privately to the winner only.
11. Open a 15-second rearrangement phase for all five players.
12. The winner may either use the auction card and discard one original hand card, or discard the auction card itself.
13. The winner must finish with exactly nine cards arranged as `2–2–5`.
14. Discarded card identity remains private.
15. Lock and validate all hands, then proceed to G1 betting.

### 9.2 Bid prices

The auction UI contains four fixed price buttons based on the selected wager option's Call value:

- `0.5 × Call`
- `1.0 × Call`
- `1.5 × Call`
- `2.0 × Call`

Requirements:

- Maximum bid is `2 × Call`.
- Resolve any fractional Token amount using the project's existing Token rounding convention. If none exists, reject startup configuration that produces non-integer bid values rather than rounding differently on client and server.
- A bid is valid only if the player has sufficient available Token when the server receives it.
- The server records a monotonic receipt sequence/timestamp for deterministic tie resolution.
- A submitted bid cannot be changed or withdrawn.
- Auction duration is seven seconds and must be configuration-driven.

### 9.3 No-bid case

If no valid bid is received before timeout:

- Burn the auction card without revealing it.
- Still run the 15-second rearrangement phase for all players to preserve a consistent game flow.

### 9.4 Auction Token accounting

- Deduct the winning bid immediately after auction resolution.
- Reflect the deduction immediately in the Token Panel.
- The auction payment does not enter any Pot or Jackpot.
- The payment is permanently removed from circulation (`Token Burn`).
- Include the payment as a Token loss in the winner's match-level Net Token calculation.

## 10. Timing Configuration

- Use current High Noble phase timings as initial defaults.
- Add VIP Plus timing keys to configuration, referencing/copying the High Noble defaults during initialization.
- Game 3 auction default: `7 seconds`.
- Game 3 post-auction rearrangement default: `15 seconds`.
- All timeouts, including reconnect-related missed actions, must be enforced by the server.
- Client countdowns are visual projections of server deadlines, not authoritative timers.
- Timing values will be tuned after playtesting; no gameplay code change should be required to adjust them.

## 11. Disconnect, Timeout, and Forfeit

### 11.1 Mandatory pre-entry notice

Before a player confirms entry, show and require acceptance of these conditions:

- The game does not pause for disconnects.
- Phase timers continue normally.
- Failure to act before a server deadline causes the applicable automatic action, including Auto-Fold.
- A player may resume from a later phase/group after reconnecting when eligible.
- Intentionally leaving the match is a Forfeit.

### 11.2 Temporary disconnect

- Never pause the match.
- Do not add a replacement Bot or AI.
- Keep the disconnected player's fixed seat.
- When an action deadline expires, Auto-Fold that player for the current group.
- If the player reconnects, send a complete sanitized match-state snapshot and permit participation from the current actionable phase onward.
- Do not undo folds, bids, deductions, deadlines, or completed settlements after reconnect.

### 11.3 Intentional exit / Forfeit

- Mark the player as `FORFEITED` for the remainder of the match.
- Keep the original H1–H5 seat mapping.
- Auto-Fold the forfeited seat for every remaining group.
- Do not replace the player.
- Remaining players continue through all three games.

### 11.4 Auction timeout behavior

- A disconnected, forfeited, insufficiently funded, or non-responsive player submits no bid.
- Do not auto-select an auction price.
- During the 15-second rearrangement phase, preserve the player's last valid arrangement if they take no action.

## 12. Match Result and Ranking

Rank all players after Game 3 using the following ordered criteria:

1. Highest `Net Token` across the full match.
2. If tied, highest total number of groups/piles won.
3. If still tied, highest number of `G3` wins.
4. If all three values remain equal, declare the tied players joint winners / draw.

Net Token requirements:

- Calculate from authoritative ledger entries for the match.
- Include all Token gains and losses attributable to match play.
- Include the Game 3 winning auction payment as a loss.
- Do not treat the burned auction payment as Pot contribution or Pot winnings.
- Persist the individual metric values used in tie-breaking so result screens and audit logs can explain the outcome.

## 13. Recommended Server State Machine

```text
WAITING_FOR_PLAYERS
→ ENTRY_CONFIRMATION
→ GAME_SETUP
→ DEAL
→ REVEAL_CENTER
→ INITIAL_ARRANGE
→ [GAME_3_ONLY: BLIND_AUCTION → AUCTION_RESOLVE → REARRANGE]
→ HAND_LOCK_AND_VALIDATE
→ G1_BETTING_R1
→ G1_SHOWDOWN_AND_SETTLEMENT
→ G2_BETTING_R1
→ G2_SHOWDOWN_AND_SETTLEMENT
→ G3_BETTING_R1
→ G3_BETTING_R2
→ G3_SHOWDOWN_AND_SETTLEMENT
→ GAME_RESULT
→ [NEXT_GAME or MATCH_RESULT]
→ MATCH_COMPLETE
```

Use explicit server state plus `gameNumber`, `groupNumber`, `bettingRound`, `actionOrder`, and absolute `deadlineAt`. Reject client actions that do not match the current state, acting seat, or deadline.

## 14. Suggested Data Model Additions

Names may be adapted to the existing codebase.

```ts
type VipPlusWagerOption = {
  id: 'INITIATE_WAGER' | 'ADEPT_WAGER' | 'MASTERMIND_WAGER';
  bettingTier: 'INITIATE' | 'ADEPT' | 'MASTERMIND';
  buyInTier: 'ADEPT' | 'MASTERMIND' | 'HIGH_NOBLE';
};

type SeatStatus =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'FORFEITED';

type AuctionBid = {
  playerId: string;
  seat: 'H1' | 'H2' | 'H3' | 'H4' | 'H5';
  multiplier: 0.5 | 1 | 1.5 | 2;
  amount: number;
  serverReceivedAt: number;
  receiptSequence: number;
};

type MatchRankingMetric = {
  playerId: string;
  netToken: number;
  totalGroupWins: number;
  g3Wins: number;
};
```

Maintain an immutable Token ledger for Ante, Call, Pot payout, auction burn, and other existing wager events. Every deduction must be idempotent and tied to a unique match/game/action transaction ID.

## 15. Client UI Requirements

- VIP Plus badge/access gate.
- Five fixed player seats rendered client-relatively if the existing table uses local perspective, while retaining authoritative H1–H5 identifiers in state.
- Wager selection screen available only to H1.
- Joining screen showing wager values, Buy-in, and mandatory Auto-Fold/Forfeit notice.
- `3–3–1` center layout for Games 1–2.
- `3–3–0` center layout plus face-down auction-card slot for Game 3.
- Four fixed bid buttons and seven-second countdown.
- Submitted-bid locked state.
- Private auction-card display for the winner.
- Fifteen-second rearrangement countdown for all players.
- Immediate Token Panel animation/update after auction deduction.
- Clear Auto-Fold, disconnected, and forfeited seat indicators.
- Match result screen showing Net Token, total pile wins, G3 wins, and joint-winner status when applicable.

Never expose private cards, hidden auction-card identity, discarded-card identity, or sealed bids to unauthorized clients.

## 16. Server Security and Consistency

- Shuffle, deal, hand ownership, hand validation, auction resolution, Token deductions, betting, settlement, and ranking are server-authoritative.
- Client sends intent only; never accept client-calculated balances, winners, rankings, or deadlines.
- Prevent double bid, bid replay, double deduction, and duplicate settlement with idempotency keys.
- Validate VIP Plus entitlement again at match entry/start, not only when rendering the lobby.
- Use server receipt order for equal-bid tie resolution, never client device time.
- Send public sanitized events separately from private hand/auction-card updates.
- Reconnect snapshots must reveal only information the reconnecting player is authorized to know.

## 17. Reuse Strategy

Prefer composition and configuration over copying existing mode code:

- Reuse High Noble timers and phase UI as defaults.
- Reuse the existing Token Panel and ledger transaction pipeline.
- Reuse Ante, Call/Fold, Pot, showdown, payout, and hand-comparison services.
- Add a five-player seat-order strategy supporting clockwise and counter-clockwise traversal.
- Add `2–2–5`, `3–3–1`, and `3–3–0` layouts through declarative layout/rule configuration.
- Add Blind Auction as a mode-specific server phase.
- Ensure existing 4-player tiers remain behaviorally unchanged.

## 18. Acceptance Criteria

Implementation is complete only when all items below pass automated or controlled multiplayer tests.

1. Five humans can join; a sixth cannot join.
2. Non-VIP Plus users cannot enter.
3. H1 selects one of exactly three wager options and the choice remains locked.
4. Each option resolves betting values from the lower tier and Buy-in from the next tier.
5. Games 1–2 consume exactly 52 unique cards with `45 + 7` distribution.
6. Game 3 consumes exactly 52 unique cards with `45 + 6 + 1` distribution.
7. Center cards appear before initial arrangement begins.
8. All players finish each valid hand with `2–2–5`.
9. Each game executes G1 one round, G2 one round, and G3 two rounds.
10. Action order is H1 clockwise, H5 counter-clockwise, H1 clockwise, H5 counter-clockwise, then resets for the next game.
11. Fold affects only the current group.
12. Insufficient Token causes Auto-Fold and never All-in or negative balance.
13. Game 3 auction begins after initial arrangement and accepts one sealed bid per player for seven seconds.
14. Equal highest bids are won by the bid the server received first.
15. Winning bid is deducted exactly once and Token Panels update immediately.
16. Auction payment enters neither Pot nor Jackpot and is included as a Net Token loss.
17. Only the winner privately sees the auction card before deciding to use or discard it.
18. All players receive the 15-second rearrangement phase.
19. If nobody bids, the auction card is burned and rearrangement still occurs.
20. Disconnect never pauses the game; timed-out actions use Auto-Fold as specified.
21. Intentional exit preserves the seat and Auto-Folds it through match end without Bot replacement.
22. Reconnecting cannot reverse a completed action or reveal unauthorized private data.
23. Final ranking uses Net Token, then total pile wins, then G3 wins, then joint winners.
24. All phase durations can be changed through configuration.
25. Existing Initiate, Adept, Mastermind, and High Noble game flows pass regression tests unchanged.

## 19. Required Tests

- Unit tests for deck accounting and no duplicate cards.
- Unit tests for clockwise/counter-clockwise seat traversal and per-game reset.
- Unit tests for auction price resolution, invalid balance, timeout, and first-server-receipt tie-break.
- Unit tests for Net Token and all ranking tie-break levels.
- Unit tests for pile-scoped Fold and insufficient-balance Auto-Fold.
- Integration test for all three games from table creation to final settlement.
- Integration tests for disconnect/reconnect during arrangement, auction, each betting round, and showdown.
- Integration test for Forfeit in Games 1, 2, and 3.
- Concurrency/idempotency test for duplicate bid and duplicate Token-deduction requests.
- Privacy test proving sealed bids, private hands, auction card, and discarded card are not leaked.
- Regression tests for every existing four-player tier.

## 20. Implementation Notes for Codex

Before editing code:

1. Inspect the existing tier configuration, High Noble timing configuration, server match state machine, Token ledger, Call/Fold logic, seat-order helpers, showdown flow, and reconnect snapshot code.
2. Produce a short file-impact list and identify reusable components/services.
3. Implement the smallest configuration-driven extension possible.
4. Do not invent numeric Ante, Pot, Call, or Buy-in values; resolve them from current tier configuration.
5. Preserve existing unrelated behavior and user changes.
6. Run focused tests first, then the complete relevant regression suite.
7. Report changed files, test results, remaining risks, and any assumptions caused by gaps in the existing codebase.

## 21. Locked Decisions Summary

- VIP Plus only.
- Five human players; no Bot or AI.
- Three games per match.
- Games 1–2: `3–3–1` center cards.
- Game 3: `3–3–0` plus one blind auction card.
- Player arrangement: `2–2–5`.
- Center cards reveal immediately after dealing and before arrangement.
- Call/Fold starts at G1; rounds per game are `1 + 1 + 2`.
- Action-order loop is H1 clockwise, H5 counter-clockwise, then repeat; reset each game.
- Fold affects only the current pile.
- Auction follows the first Game 3 arrangement.
- Auction is sealed, single-submit, seven seconds, four prices up to `2 × Call`.
- Equal bid: earliest server receipt wins.
- Winning Token is deducted and displayed immediately, then burned outside Pot/Jackpot.
- Auction winner may use or discard the unseen card after receiving it.
- All players may rearrange for 15 seconds after auction.
- No bids: burn the card but retain rearrangement phase.
- Three wager choices use Initiate/Adept/Mastermind betting with Adept/Mastermind/High Noble Buy-ins respectively.
- High Noble phase times are initial defaults and remain configurable.
- Insufficient Token: Auto-Fold; no All-in.
- Disconnect: no pause; Auto-Fold on missed action.
- Intentional exit: Forfeit; fixed seat Auto-Folds to match end.
- Winner: Net Token → total pile wins → G3 wins → joint winners.
