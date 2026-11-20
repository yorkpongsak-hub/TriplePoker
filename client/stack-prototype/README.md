# TRIPLEPOKER: STACK

Isolated Grade-B Score Attack browser prototype for the seeded, layered Best-5-of-6 poker puzzle. It does not register an Expo route, add a dependency, or change Rise gameplay.

## Run

From `client/stack-prototype`:

```powershell
npm start
```

Open `http://localhost:4173/`. The small server deliberately serves from `client` so the prototype can reuse the existing classic card images under `client/assets/cards/classic` without copying them.

## Verify

```powershell
npm test
..\node_modules\.bin\tsc.cmd -p jsconfig.json --noEmit
```

Difficulty is measured after generation from legal choices, layer depth, solver nodes and backtracking. It is an estimate, not a requested generator input.

## Prototype decisions

- Gameplay geometry uses only the 56×78 playing-card face. The pseudo-3D tile remains 62×86 with its base offset 6px right/8px down (approximately 10%), but base, bevel and shadow are visual-only and never affect blocking.
- Geometry uses integer quarter-card units on both axes. Rows remain regular and share one exact `top` within each layer, while every upper layer accumulates a seeded vertical offset of 1/4, 1/2 or one full card height relative to the layer below. Horizontal positions use `xUnits`, Layer 0 uses grid multiples of four, and cards within one layer/row never overlap.
- Board cards are 25% larger than the initial prototype (70×97.5 face; 77.5×107.5 physical tile). The default spread uses six columns by four rows per layer (compact: five by four), keeping the enlarged Stack inside the six-slot frame.
- The safe 55-card generator deliberately forms a denser pyramid (24/16/10/5 cards from bottom to top) and biases upper layers toward the center with mostly quarter- or half-card vertical offsets. This produces substantially more visible cross-layer coverage without adding the deferred fifth layer or increasing Solver scale.
- Every seeded game uses exactly 55 cards and deterministically mixes 28 faces from Set A (`assets/cards-png`) with 27 from Set B (`assets/cards-png-b`). The A/B choice is attached to identity, follows that identity through Shuffle, and replays identically for the same seed. Presentation mapping remains ♣→forest, ♥→fire, ♦→sky and ♠→water (A)/ocean (B), plus `joker_1..3`; internal S/H/D/C ranks, Poker evaluation and accessibility rules are unchanged.
- Set B source crops vary from 106–107px wide and 157–167px high, with occasional neighboring-sheet pixels on the right edge. A fixed 70×97.5 face viewport slightly overscans Set B horizontally and clips only that right edge, preserving the top-left rank/suit and leaving physical gameplay bounds unchanged.
- The screen retains the original generated `assets/stack-forest-table-v2.png` background—emerald felt, teak framing, foliage and warm lantern light—with an unobtrusive center reserved for gameplay.
- Hovering any face-up board or committed-hand tile shows its original compact identity (for example `8♠`) through a native tooltip. A concealed Memory tile reports only `Face-down memory card`, so hover cannot leak hidden identity.
- Physical layer is the visual z-index. Only higher-layer face overlap creates a top blocker; same-layer, same-row neighbors block a side only when their face edges touch exactly.
- Renderer interaction, player taps, Hint and Solver all derive from `getCardBlockingState` / `isCardSelectable`. Hint animation never overrides physical layer order.
- The optional Geometry Debug overlay is off during normal play. When enabled it shows ID, layer, row, quarter-unit X/Y, top blockers, exact left/right blocker IDs and selectable state; blocked taps also report the exact reasons.
- Board cards have one neutral visual treatment regardless of accessibility. A blocked tap wiggles only that attempted tile. Hint remains the sole explicit board recommendation because it is an activated item.
- The Stack frame uses the same full content width as the six-slot Current Hand stage. The seeded card geometry is centered inside it, while its height and origin derive from the complete pseudo-3D tile extents—including removed-card positions—so the frame remains fixed for the entire run.
- Any positive higher-layer face overlap blocks; a card in another row only touches the edge vertically and does not overlap.
- The fifth committed card is checked first: an exact Mission resolves immediately using all five cards, while a non-match or High Card continues to slot 6. At six cards, the strongest five-card subset is evaluated; an exact Mission carries the unused sixth card into slot 1 of the next round, while a non-exact result or Best-5 High Card ends the run after the 1.25-second VFX.
- The status and six-slot Current Hand stage sit between the Score/Time HUD and the Stack. Completion text, burst particles and the points fly-up are contained inside this stage and never cover the board. Its `HOW TO PLAY / กติกา` link opens an in-game summary of selection, Memory, five/six-card resolution, Mission, scoring, items, end conditions and tie-break rules without mutating play state.
- Score is the configurable category value only; elapsed time is tracked independently as a future leaderboard tie-breaker. Every successful Undo deducts exactly two points and increments `undoCount`.
- Solver searches the same legal card-by-card accessibility transitions as the player, maximizes accumulated hand score, and reports its best path plus search effort. A `capped` result is the best score found within the node limit, not a proof of the global optimum.
- Solver paths do not assume item use. Shuffle and Magnet may change/recover the live position, but an item is not silently consumed to avoid failure.
- Magnet requires exactly five committed cards and may take a blocked sixth card only when its Best-5 result scores strictly higher than every normally accessible sixth card.
- Future leaderboard ordering is implemented as higher Score, then lower completion time, then lower Undo count. No backend or online leaderboard is included.
- Seeded Memory positions can be set to Easy 12%, Medium 25% or Hard 42% in Debug. An accessible hidden card reveals on its first tap and commits only on a second tap; touching another card closes the temporary reveal. Geometry and blocking ignore face state, and Shuffle preserves hidden positions while moving complete card identities.
- The Solver enumerates exact ranks it can currently reach and deterministically chooses one optional Current Mission for the seed/state. Cumulative scoring is `round((old score + hand score) × multiplier)`, using 1.10 for exact, 1.02 for higher, 0.95 for lower and 0.90 for a non-exact High Card; the rounded integer becomes the next round's base. Solver and Mission generation may inspect hidden identities, while normal board DOM uses opaque `slotId` values, the card-back asset and a generic accessible label.

## Known gameplay ambiguities

- Magnet treats “required card” as a blocked sixth card that strictly improves the immediate Best-5 score over all legal sixth-card choices. A different item economy may want a stricter structural definition later.
- Joker chooses the strongest rank category, without tie-break scoring between equivalent hands.
- A capped Solver score is a search lower bound. It is labeled “Solver Best Score” in this playtest UI because it is the best score found, but it may be improved by a larger search budget.
- Mission enumeration is also node-limited. Every offered Mission has a concrete path found by the search, but the candidate list may omit other achievable ranks when the search is capped.
- The enlarged six-column layout uses a 1,200-node default Mission-search budget (1,000 after Shuffle) to avoid pathological multi-second wildcard searches; every offered Mission still requires a concrete legal path.
- High Card is excluded from Mission candidates. If no non-High-Card candidate is found within the search budget, the HUD shows no Mission and completing six cards cannot continue the run.
