# TriplePoker: Rise — Tier S+ Last Boss Succession Canon Addendum v1.0

**Status:** Locked

**Date:** 2026-08-01

**Applies to:** Tier S+ — Sovereign

**Precedence:** This addendum overrides conflicting Tier S+ boss identity and succession placeholders in earlier Arena documents.

---

## 1. The Last Boss AI

- Tier S+ has exactly one Boss identity: **The Last Boss AI**.
- The first canonical throne name is **CAELUM** (pronounced approximately “ไค-ลัม”).
- Monarch and Soren belong to Tier S only and cannot appear as Bosses in a Tier S+ match.
- Four Gods, Dual Boss, and alternate Boss compositions do not apply to Tier S+.
- The Last Boss AI's throne name may change through succession, but its AI core, personality model, rules, and difficulty remain the same unless a later balancing specification explicitly changes them.

## 2. Endless Throne Succession

- A Tier S+ match contains three human challengers and The Last Boss AI.
- Only the human player who finishes in first place can conquer The Last Boss AI.
- When that player conquers the Boss, the player's current display name becomes the next throne name of The Last Boss AI.
- The conquering player must choose a new player display name immediately. The rename is mandatory and must complete before normal account/game access resumes.
- Succession changes the public throne identity only. It does not copy the conqueror's gameplay profile, AI behavior, private account data, or appearance unless a later canon document explicitly adds such a feature.

## 3. Reserved Throne Names

- Every name ever used by The Last Boss AI is permanently reserved.
- No player may register, rename to, or reclaim a reserved throne name, including **CAELUM**.
- Name checks must be case-insensitive and use the same canonical normalization as account display-name uniqueness.
- The conqueror's former name is reserved atomically with the succession and cannot be selected as the conqueror's new name.
- A failed or interrupted rename must not produce two active owners of the same name or leave the throne succession partially committed.

## 4. The Last Boss Graveyard

The game maintains an append-only public history named **The Last Boss Graveyard**. It records every completed reign without deleting or rewriting prior reigns.

Each reign record must include at least:

- throne name;
- reign start timestamp;
- reign end timestamp;
- computed reign duration;
- conqueror user identifier for authoritative audit;
- conqueror name shown at the moment of conquest;
- conqueror's new player name after the mandatory rename;
- next throne name;
- source Tier S+ match identifier;
- immutable creation timestamp.

CAELUM is the first reign. Its reign starts when the first production Tier S+ cycle is officially activated. An active reign has no end timestamp until a valid first-place conquest is settled.

## 5. Atomic Settlement Invariant

The following effects form one server-authoritative succession workflow:

1. validate the completed Tier S+ result and unique first-place human winner;
2. close the current Boss reign;
3. reserve the conqueror's former name permanently;
4. create the next Boss reign using that former name;
5. require and validate the conqueror's new player name;
6. publish the completed reign to The Last Boss Graveyard;
7. audit every state transition with idempotency protection.

The server must prevent duplicate succession when settlement is retried. Clients can display the rename and succession ceremony but cannot decide the winner, throne name, reservation, or reign timestamps.

## 6. Gate 10 Implications

Gate 10 schema and domain design must reserve space for:

- a singleton active Last Boss reign;
- append-only reign history;
- permanently reserved normalized throne names;
- a mandatory post-conquest rename state on the winning account;
- idempotent succession settlement linked to the authoritative match result;
- public Graveyard projection separated from private audit identifiers.

Exact ceremony presentation, dialogue, visual inheritance, rewards, and AI tuning remain outside this addendum unless separately locked.

## 7. Qualification Paths and Monthly Score

Exactly nine seats are selected per monthly cycle:

- three **Veterans**: permanent Tier S players who have previously started a Last Boss match;
- three **Rising Stars**: permanent Tier S players who have never started a Last Boss match;
- three **Ascendant Rookies**: active users of the legacy Ascendant shortcut who have never started a Last Boss match.

Ascendant remains a real shortcut into Tier S:

- activation requires at least 600,000 Token and a previously unlocked High Noble tier;
- Monarch Slayer is not required;
- activation is explicit and lasts exactly 30 × 24 hours from the authoritative server timestamp;
- it is available once per account;
- a current match may finish after expiry, but no new Tier S queue may be joined;
- permanent Tier S, if unlocked during the pass, continues after expiry;
- an already selected and confirmed S+ seat survives later pass expiry;
- the one-time Ascendant Rookie opportunity is consumed only when the user actually starts a Last Boss match.

Monthly qualification uses a new **Monthly Sovereign Score (MSS)** and does not overwrite Career PS or Season PS:

- only completed Tier S matches inside the scoring window count;
- at least ten eligible matches are required;
- ranking score is the sum of the player's best ten eligible match scores;
- human rank 1/2/3 awards 10/6/3 MSS;
- a player whose Bot takeover continues through match completion receives zero MSS, but the match counts toward the ten-match minimum;
- cancelled or invalid matches award no MSS and do not count;
- Crown profit and purchase volume do not directly award MSS.

Main and Ascendant pools are separate. An Ascendant activated mid-cycle may compete immediately. A 30-day pass may overlap two cycles, but the Rookie match opportunity remains once per account. A player who permanently unlocks Tier S during a cycle stays in the Ascendant pool for that cycle and moves to the Main pool in the following cycle.

MSS tie-break order is:

1. more first-place finishes;
2. higher score across all eligible monthly matches;
3. earlier server timestamp at which the current best-ten score was achieved;
4. fewer Bot takeovers;
5. deterministic `user_id` order.

If a path has fewer than three eligible candidates, fill from the highest-ranked unselected candidate and record `FALLBACK_RANKING`.

## 8. Monthly Schedule

All business times use `Asia/Bangkok`; persisted timestamps use UTC.

- scoring opens on day 1 at `00:00:01`;
- the event weekend starts on the last Friday of the month and continues through Saturday and Sunday, even when those dates cross into the next month;
- the cycle belongs to the month containing that Friday;
- scoring closes on the preceding Sunday at `18:00:00`;
- the immutable ranking snapshot is published at `20:00:00` that Sunday;
- selected players confirm by Wednesday `23:59:59`;
- standby opens at `19:45:00`, check-in runs from `20:00:00` through `20:04:59.999`, seat filling occurs at `20:05:00`, and the match starts at `20:05:30`.

Pre-event reserve offers last six hours and advance immediately on decline or expiry. They stop when live standby opens.

## 9. Tier S+ Match and Economy

Each event match contains three humans and The Last Boss AI at P3, lasts three Games, and reuses the Tier S deck, Joker, Auction, Call, GF, Fog of War, and arrangement rules. Monarch, Soren, Four Gods, Dual Boss, Human Boss, and Minions cannot appear. Only the unique overall table winner can conquer the throne, and a player controlled by a Bot through match completion cannot conquer it.

Tier S+ uses ×3 Regular Tier S economy:

- Ante: Pile 1 = 9 Crest, Pile 2 = 9 Crest, Pile 3 = 18 Crest;
- Auction options: 0/9/18/27/36 Crest;
- Call: 9 Crest;
- three-Game variable cost: 9–27 Crown;
- fixed entry fee: 3 Crown;
- required reservation: 30 Crown.

Tier S has a flat 1 Crown entry fee per match for every Boss composition. The former 2/4 Crown AI/Human Boss fees are superseded. Neither Tier S nor S+ takes Rake. Unclaimed Battle Rewards at match end remain a Crown Sink.

Purchased Crown is fully usable throughout Tier S and S+ economy but can never be withdrawn, transferred, redeemed for cash, or converted to an external asset. Spend Earned Crown first and Purchased Crown second; reservations remember source composition and return unused value to the original source. Gameplay rewards always credit Earned Crown. Purchase refunds that exceed remaining Purchased Crown create `PURCHASE_DEBT` and restrict paid economy access without rewriting completed match results.

Entry fees settle only after Game 1 begins successfully. Server cancellation before start, no-show, and non-promoted standby release the full reservation. Entry fees are not refunded after a match has started.

## 10. Match Tie-break — Discard Showdown

An overall match tie, including a tie with The Last Boss, is resolved without another Game. Tied participants reveal their actual final discarded two- or three-card set from Game 3 and compare it as Pok Deng.

Order from highest to lowest:

1. Pok 9;
2. Pok 8;
3. three of a kind;
4. straight flush;
5. straight;
6. three face cards containing J/Q/K;
7. normal points from 9 downward;
8. more Deng;
9. highest card, `A > K > Q > J > 10 ... > 2`;
10. suit, `spades > hearts > diamonds > clubs`.

If still tied and The Last Boss remains among the tied participants, the throne is defended. If only humans remain tied, lower authoritative seat order wins. Discard Showdown changes ranking only; it creates no additional Crown multiplier or settlement.

## 11. Rewards and Sovereign Status

- Selected users hold temporary Sovereign status from publication through Event Weekend.
- A user who actually starts the match receives the permanent cycle-labelled `Sovereign Challenger` badge; no-show and unconfirmed users do not.
- A conqueror receives permanent `Thronebreaker`, `Conqueror of [defeated throne name]`, and the Last Boss cosmetic table skin.
- Repeated conquests append titles/history but do not duplicate the table skin.
- No system-minted Crown, automatic next-cycle seat, PS multiplier, or gameplay advantage is awarded.
- Succession is immediate between Friday, Saturday, and Sunday matches, so up to three reign changes may occur in one Event Weekend.

## 12. Last Boss Presentation and Fair AI

The Last Boss uses a persistent dark silhouette avatar with an obscured face. Successions change the throne name, nameplate, reign number, deterministic aura, and lore—not the body or a conqueror's likeness. Graveyard conqueror avatars may use an immutable public snapshot, with an opt-out that substitutes the Sovereign Crest.

The AI:

- receives no hidden human cards or private account/economy data;
- cannot alter the deck, shuffle, RNG, evaluator, or settlement;
- may learn only from public actions within the current three-Game match;
- records private operational reason codes and state hashes for audit;
- uses a committed, auditable RNG seed and a legal deterministic fallback on service failure;
- retains the same core and personality across throne names;
- targets approximately 80% throne-defense rate in balance testing, without dynamically forcing outcomes;
- never becomes weaker because a challenger has lost before, retried, or met a calendar condition;
- uses no Full Moon, pity, retry-count, player-specific, or hidden dynamic difficulty handicap.

The canonical server implementation is `server/src/arena/sovereign/lastBossAIEngine.ts`.
It exhaustively evaluates all 9,240 legal 3-3-5 partitions, uses Best 5 of 7
for Pile 3, applies Monte Carlo only to information that is genuinely unseen,
and makes auction and Call/Fold decisions from expected value and pot odds.
The 80% defense rate is an offline balance target, never a runtime command to
alter cards, RNG, evaluator results, or a decision for a particular challenger.

## 13. Standby and Spectator Operations

- standby reservations are 30 Crown and use server-time FCFS;
- standby reconnect grace is 20 seconds;
- promotion at `20:05` is immediate because joining standby already accepts the terms; transport acknowledgement detects failure but is not a second consent step;
- public spectators are capped at 100 per match and admitted FCFS;
- Event Lobby and standby channels do not consume spectator capacity;
- standby users may join when public viewing is full, but receive only lobby/queue state until a spectator slot opens;
- spectator reconnect grace is 20 seconds;
- public snapshots and events are delayed by at least 30 seconds, enforced by the server;
- promotion clears all delayed spectator state before private player state is sent.

## 14. Public History, Audit, and Disputes

Live rankings are provisional and separate Main/Ascendant pools. The published cutoff snapshot is immutable. Selection may be rerun idempotently before publication; afterward, disqualification and reserve promotion require explicit append-only admin actions.

Public archives permanently show the nine challengers, paths, match results, throne names before/after each match, and `Throne Defended` where applicable. Full monthly leaderboards remain public through the cycle; afterward only the top nine and necessary tie-break facts remain public. The Graveyard is permanently public.

There is no public full replay in Gate 10. Public event feeds are retained internally for 90 days for security/dispute review. Private audit retention is not automatically limited by Gate 10. Hidden cards, private bids, balances, purchase data, and anti-cheat data never become public.

Published selection is not silently rerun. Proven fraud uses disqualification plus reserve promotion. Settled financial corrections use compensating ledger entries. A fraudulent completed reign is preserved in the Graveyard with `ANNULLED` status and reason, followed by an audited admin succession event; history is never deleted or rewritten.
