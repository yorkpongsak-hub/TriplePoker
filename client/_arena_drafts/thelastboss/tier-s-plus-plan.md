# Tier S+ integration plan

## What the current frontend already does well

The provided `live.tsx` is a strong reference because it already implements a stateful socket-driven game table with:

- room join and `start_match`
- `round_start` hydration
- arrangement timers and `player_ready`
- showdown transitions
- auction/discard/finale UI phases
- socket event orchestration for a multi-phase tier

That means Tier S+ should be built as a **new compatible tier flow**, not as a completely separate architecture.

## Main compatibility issue

The current file is built around the existing `highNoble` / `grand_finale` style flow:

- round 1 arrangement
- showdown piles 1-2
- fog of war
- blind auction
- arrangement 2
- discard
- grand finale

Tier S+ has a different ruleset:

1. 53-card deck with Joker always present
2. 4 players x 11 cards = 44 cards
3. community piles:
   - pile1 = 2 open
   - pile2 = 2 open
   - pile3 = 1 open + 1 hidden later
4. auction round 1 = 1 open card
5. final hidden set = 2 normal leftovers + Joker, shuffled into:
   - auction round 2 card #1
   - auction round 2 card #2
   - pile3 hidden card
6. battle order:
   - arrange for pile1 first
   - resolve pile1
   - auction round 2 twice
   - reveal pile3 hidden card
   - final arrangement for pile2/pile3
   - betting battle on pile2
   - betting battle on pile3
   - full proof card reveal

So the frontend event model and backend state machine both need a new branch.

## Recommended approach

Create a **new pair of files** instead of trying to mutate the existing High Noble implementation in place:

- `live-tier-s-plus.tsx` for frontend
- `tierSPlusMatch.ts` (or similar) for backend game engine

This avoids breaking the existing tier while letting Tier S+ reuse visual patterns, timers, card rendering, sockets, and animation helpers.

## Frontend structure to reuse

From the reference frontend, reuse these ideas directly:

- `TimerDisplay`
- card image mapping
- player seat layout
- socket lifecycle
- card selection/swap interactions
- countdown animation
- modal/popup patterns
- token balance updates

## Frontend state model for Tier S+

The current `phase` union should become a new Tier S+ union such as:

```ts
 type TierSPlusPhase =
  | 'boss_intro'
  | 'dealing'
  | 'auction1'
  | 'arrangement_pile1'
  | 'pile1_reveal'
  | 'auction2_card1'
  | 'auction2_card2'
  | 'reveal_pile3_hidden'
  | 'final_arrangement'
  | 'battle_pile2_round1'
  | 'battle_pile2_round2'
  | 'battle_pile2_result'
  | 'battle_pile3_round1'
  | 'battle_pile3_round2'
  | 'battle_pile3_result'
  | 'proof_reveal'
  | 'round_result'
  | 'match_end'
```

You can still keep the same rendering patterns, but the phase machine must match Tier S+ flow exactly.

## Suggested frontend socket contract

A compatible clean contract for the new frontend/backend pair would be:

### Client emits

- `player_join_room`
- `start_match` with `tier: 'tierSPlus'`
- `auction1_bid`
- `submit_pile1_arrangement`
- `auction2_bid`
- `submit_final_arrangement`
- `pile2_action` with `call | fold`
- `pile3_action` with `call | fold | raise`
- `player_continue`

### Server emits

- `tier_s_plus_round_start`
- `auction1_start`
- `auction1_result`
- `pile1_arrangement_start`
- `pile1_result`
- `auction2_start`
- `auction2_result`
- `pile3_hidden_revealed`
- `final_arrangement_start`
- `pile2_betting_start`
- `pile2_turn`
- `pile2_action_result`
- `pile2_reveal_all`
- `pile2_result`
- `pile3_betting_start`
- `pile3_turn`
- `pile3_action_result`
- `pile3_reveal_all`
- `pile3_result`
- `proof_card_reveal`
- `round_result`
- `match_end`

This is clearer than overloading the existing `blind_auction` and `grand_finale` events.

## Backend architecture

Build the backend as an explicit state machine.

### Core modules

- `tierSPlusMatch.ts`
  - match lifecycle
  - socket orchestration
  - timers
- `tierSPlusDealer.ts`
  - build 53-card deck
  - deal 44 player cards
  - place community/open cards
  - construct final hidden set of 3 cards
  - randomly assign Joker position once
- `tierSPlusAuction.ts`
  - fixed bid handling
  - tie-break by highest bid then earliest timestamp
  - round-1 winner lockout for round-2 auctions
- `tierSPlusBattle.ts`
  - pile1 resolution
  - pile2 call/fold loop
  - pile3 call/fold/raise loop
- `tierSPlusProof.ts`
  - end-of-match proof card payload
- `tierSPlusBossAI.ts`
  - observable-state-only decisions

## Critical backend state

```ts
interface TierSPlusState {
  roomId: string
  players: string[]
  bossId: string
  roundNumber: number
  phase: string

  deck52: string[]
  joker: 'joker'

  hands: Record<string, string[]>

  community: {
    pile1Open: [string, string]
    pile2Open: [string, string]
    pile3Open: [string]
    pile3Hidden?: string
  }

  auction1Card: string
  auction2Cards: [string, string]

  finalHiddenSet: [string, string, 'joker'] | [string, 'joker', string] | ['joker', string, string]
  jokerSlot: 'A' | 'B' | 'C'

  auction1Winner?: string
  auction2Winners: Array<{ cardIndex: 0 | 1; winnerId?: string; card?: string }>

  arrangements: {
    pile1: Record<string, string[]>
    pile2: Record<string, string[]>
    pile3: Record<string, string[]>
  }

  folded: {
    pile2: string[]
    pile3: string[]
  }

  revealedByStreet: {
    pile2: Record<string, string[]>
    pile3: Record<string, string[]>
  }

  pots: {
    pile1: number
    pile2: number
    pile3: number
  }

  tokenBalance: Record<string, number>
  proof: {
    jokerSlot: 'A' | 'B' | 'C'
    auction2Card1: string
    auction2Card2: string
    pile3Hidden: string
  }
}
```

## Exact flow mapping

### 1. Round start

Backend should emit all visible initial information only:

- player 11 cards
- open community cards
- open auction1 card
- pile3 first open card
- token balances
- seat identities
- arrangement timer

Do **not** send:

- actual Joker slot
- pile3 hidden card
- auction2 hidden cards
- other players' hands

### 2. Auction round 1

- card is face up
- bid levels fixed
- highest bid wins
- tie broken by earliest submit time
- winner gets card into hand immediately
- mark that player as ineligible for auction round 2

### 3. First arrangement phase

Each player submits exactly 3 cards for pile1.
The remaining cards stay in reserve for pile2/pile3.

### 4. First battle phase

Resolve pile1 against community pile1.
Then update balances and visible round state.

### 5. Auction round 2

Run two hidden auctions in sequence.
Each auction:

- hidden card index shown as facedown slot
- all eligible players may bid
- highest bid wins
- winner privately receives the card
- frontend only knows winner identity and bid unless game design wants winner to see card locally

Important: the card itself should be revealed only to the winner until proof stage, except that pile3 hidden reveal later may indirectly show whether Joker remained there.

### 6. Reveal pile3 hidden card

Server reveals the hidden community card.
At this point all players can infer whether Joker is:

- already in pile3 hidden card
- or in one of the two auction2 won cards

### 7. Final arrangement

Players arrange remaining cards freely into pile2 and pile3 with no ordering constraint.
This is the biggest difference from lower tiers.

### 8. Pile 2 betting battle

Per spec:

- ante = 2
- call = 1
- 2 action rounds
- on each call, player reveals 1 card
- folded players exit pile2 only
- after final round, remaining players reveal all cards and resolve winner

### 9. Pile 3 betting battle

Per spec:

- ante = 4
- call = 1
- raise = +1
- 2 action rounds
- each call/relevant continue reveals 1 card
- after final round, remaining players reveal all cards and resolve winner

This should be implemented as a turn-driven loop, similar in spirit to the current `grand_finale_turn` pattern, but generalized for multiple surviving players and two streets.

### 10. Proof card reveal

At the end, reveal:

- auction2 card #1
- auction2 card #2
- pile3 hidden card
- Joker slot

This is the transparency layer and should be a dedicated event.

## Frontend rendering plan

In the new frontend file:

### Reuse directly

- card assets
- table background
- timer display
- seat widgets
- animation utilities

### Replace or rewrite

- phase union
- socket event names
- auction UI to support one open auction then two hidden auctions
- arrangement logic to split into:
  - pile1-only arrangement
  - later free arrangement for pile2/pile3
- grand finale UI should be replaced with two betting-table phases:
  - pile2 betting
  - pile3 betting
- proof card modal must be added

## Recommended file split

### Frontend

- `app/.../live-tier-s-plus.tsx`
- `components/tierSPlus/AuctionPanel.tsx`
- `components/tierSPlus/BettingPanel.tsx`
- `components/tierSPlus/ProofRevealModal.tsx`
- `components/tierSPlus/CommunityBoard.tsx`
- `components/tierSPlus/PlayerSeat.tsx`

### Backend

- `server/matches/tierSPlusMatch.ts`
- `server/matches/tierSPlusDealer.ts`
- `server/matches/tierSPlusBossAI.ts`
- `server/matches/tierSPlusTypes.ts`
- `server/matches/tierSPlusEvaluator.ts`

## Boss AI integration

For Tier S+, the backend should keep Boss AI decisions completely server-side.

Boss AI should receive an `ObservableState` only, not full hidden match state.

```ts
interface ObservableState {
  selfHand: string[]
  visibleCommunity: {
    pile1: string[]
    pile2: string[]
    pile3Open: string[]
    pile3HiddenRevealed?: string
  }
  auction1Card: string
  auction2History: Array<{ index: 0 | 1; winnerId?: string; winnerBid?: number }>
  visibleActions: any[]
  revealedCardsByPlayer: Record<string, string[]>
  tokenBalance: Record<string, number>
  currentPhase: string
  jokerBelief: {
    A: number
    B: number
    C: number
  }
}
```

## Important note about hand evaluation

Before implementation, one rule still must be locked clearly:

- exact hand ranking logic for each pile
- how Joker behaves as wildcard
- tie-break rules
- whether each pile is always exactly 3 cards for the player side
- how player hand is compared to community pile in each battle stage

Without this, the backend engine can be scaffolded but not finalized correctly.

## Minimal delivery path

The safest practical path is:

1. duplicate the current frontend into `live-tier-s-plus.tsx`
2. strip High Noble-specific phases
3. wire a new Tier S+ phase machine
4. build a backend state machine with stub evaluator
5. integrate auction1 -> pile1 -> auction2 -> reveal -> final arrangement -> pile2 -> pile3 -> proof
6. plug in real evaluator and Boss AI after socket flow is stable

## What should be built first

Build in this order:

1. shared `types.ts`
2. backend dealer/state machine
3. frontend phase shell with mocked socket payloads
4. live socket wiring
5. hand evaluator + Joker logic
6. Boss AI
7. proof card reveal and balance resolution

## Suggested next coding task

The fastest useful next artifact is a starter pair of files:

- `live-tier-s-plus.tsx` scaffold adapted from the current frontend
- `tierSPlusTypes.ts` + `tierSPlusMatch.ts` backend skeleton with socket events and phase transitions

That creates a clean base for incremental implementation instead of trying to patch the whole 2600-line file blindly.
