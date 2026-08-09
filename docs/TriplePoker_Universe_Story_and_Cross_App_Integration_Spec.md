# TriplePoker Universe — Story & Cross-App Integration Specification
## Rise → Beyond the Rules
### Narrative Bible with Dev-First Constraints

**Document purpose**

This document defines the canonical story connecting:

- **TriplePoker: Rise**
- **TriplePoker: Beyond the Rules**

It is written for Codex, Claude Code, and future developers so that game features, boss encounters, dialogue, lore, progression, and annual events remain consistent with the intended story.

The primary development rule is:

> **Make the story feel large through dialogue, timing, reuse, and configuration — not through large new systems.**

This is a narrative and implementation guide. It is not permission to create an open-world RPG, a full cinematic pipeline, or a separate gameplay engine.

---

# 1. Product Structure

The TriplePoker universe currently consists of two planned applications.

## 1.1 TriplePoker: Rise

The main application.

Primary functions:

- Introduce the TriplePoker rules.
- Let players progress from Tier C upward.
- Establish the world, bosses, and hidden history.
- Introduce Monarch, Soren Veyl, and CAELUM.
- Deliver rare lore encounters.
- Eventually add Tier S and Tier S+ inside the same app.
- End with the revelation that CAELUM is not the true final enemy.

## 1.2 TriplePoker: Beyond the Rules

The final-story application.

Primary functions:

- Continue the story after Rise.
- Expand the three paths/teams.
- Use multiple configurable TriplePoker rule presets.
- Introduce Bridge Joker and Clone Joker.
- Reveal the complete history of the three bosses.
- Reunite the three teams.
- Lead toward the annual battle against The Immortal.

## 1.3 Removed active plan

The standalone Arena application is no longer part of the active roadmap.

Selected Arena ideas may be integrated into Rise as Tier S and Tier S+ only after Rise proves sufficient player demand.

Do not create:

- A second account system.
- A separate Arena economy.
- A second multiplayer engine.
- A Unity dependency for Rise or Beyond the Rules.
- Duplicate boss logic.

---

# 2. Canonical Main Characters

## 2.1 Monarch — The Watcher

**Display name**

```text
MONARCH
THE WATCHER
```

### Public role

Monarch appears to be a rare and powerful boss who watches the progress of exceptional players.

### True role

Monarch was once the central leader among the three ancient allies who opposed The Immortal.

He chose order and public stability over immediate disclosure of the truth.

He believed that revealing everything about The Immortal would collapse the kingdom and cause more deaths than silence.

### Great mistake

Monarch helped suppress the truth.

That decision caused:

- Soren Veyl to be branded a traitor.
- CAELUM to remain alone at the final gate.
- The true history of The Immortal to disappear.
- The alliance of the three bosses to collapse.

Monarch is not evil.

His flaw is that he accepted responsibility for deciding what the world was allowed to know.

### Current motivation

Monarch watches the new generation to find players who can carry power without becoming controlled by it.

He is searching for:

- Leadership.
- Restraint.
- Team awareness.
- Willingness to sacrifice personal reward.
- Courage to accept uncomfortable truth.

### Gameplay identity

Monarch should play with:

- Balance.
- Controlled risk.
- Resource discipline.
- Strong adaptation.
- Team-oriented objectives.
- Few reckless moves.

### Narrative function in Rise

- Rare boss encounter.
- Bridge between Tier A+ and future Tier S.
- Tests players under pressure.
- Releases lore fragments.
- Sometimes appears in the same table as Soren.
- Recognizes Soren by his real name.
- Hints that CAELUM is not the true enemy.

### Endgame function

Monarch leads the team representing:

- Order.
- Leadership.
- Responsibility.
- Coordinated sacrifice.

His final role against The Immortal is:

## **Break the Throne**

Monarch's force destroys the outer structure, authority, and protective shell surrounding The Immortal.

---

## 2.2 Soren Veyl — The First Exile

**Display name**

```text
SOREN VEYL
THE FIRST EXILE
```

### Public role

A mysterious traveler who appears in rare matches, sometimes replacing Monarch and sometimes appearing together with him.

### True role

Soren was the first person to discover how The Immortal survives.

The Immortal is not naturally eternal.

It continues by transferring its will, memory, and identity through successors or prepared vessels.

Soren attempted to reveal this truth.

Monarch believed the world was not ready.

Soren was erased from history and became known as:

## **The First Exile**

The title does not only mean that he was banished.

It also means that he was the first to walk away from a system that demanded obedience to a lie.

### Current motivation

Soren has spent years collecting:

- Forbidden maps.
- Deleted histories.
- Joker knowledge.
- Hidden routes.
- Evidence about The Immortal.
- Paths that do not appear in official records.

He does not trust rulers, institutions, or official history.

However, his flaw is that he once believed revealing truth was enough, without accepting responsibility for what followed.

### Personality

- Calm.
- Dry humor.
- Irreverent toward titles.
- Speaks in riddles only when useful.
- Appears detached but remembers everyone.
- Distrusts systems more than people.
- Laughs quietly in dangerous moments.
- Refuses to be treated as a heroic martyr.

### Gameplay identity

Soren should play with:

- Misdirection.
- Intentional sacrifice of one pile.
- Straight and Flush construction.
- Bridge Joker mastery.
- Unusual objectives.
- Rule variation.
- Hidden-path style decisions.

### Signature boss ability

## **Hidden Passage**

Once per match, before arrangement lock, Soren may swap one standard card between Pile 1 and Pile 2.

Constraints:

- Joker cannot be moved.
- Final pile sizes must remain valid.
- The ability is announced.
- The moved card remains hidden.
- The server performs and validates the swap.

This ability is optional and should be implemented only if it can reuse the current arrangement engine.

### Narrative function in Rise

- Rare encounter.
- Appears separately or together with Monarch.
- Releases lore through dialogue.
- Reveals that the official history is incomplete.
- Hints at CAELUM and the failing seal.
- Connects Joker knowledge to Beyond the Rules.

### Endgame function

Soren leads the team representing:

- Freedom.
- Discovery.
- Truth.
- Adaptation.
- Unwritten paths.

His final role against The Immortal is:

## **Open the Forgotten Road**

Soren reveals the route into the hidden core of The Immortal, a path that does not exist in the accepted world or official history.

---

## 2.3 CAELUM — The Last Boss

**Official name**

```text
CAELUM
THE LAST BOSS
```

The name **CAELUM** is canonical in both Rise and Beyond the Rules.

### Public role

CAELUM is presented as the final and most dangerous boss.

### True role

CAELUM is not the true final enemy.

He is the guardian of the last gate.

When the original alliance collapsed, CAELUM accepted the duty no one else wanted:

- Guard the seal.
- Stop all who approached it.
- Hide the truth behind fear.
- Become hated by the world.
- Remain alone until someone worthy arrived.

He deliberately became known as The Last Boss because fear was an effective barrier.

### Current motivation

CAELUM does not fight to dominate players.

He fights to determine:

- Whether they are strong enough to pass him.
- Whether they can remain disciplined under pressure.
- Whether they can hold power without losing control.
- Whether they are prepared for what exists beyond the gate.

### Tragic role

Monarch preserved the kingdom.

Soren preserved the truth.

CAELUM preserved the world itself.

But he paid the highest personal price because he had to become the enemy in every surviving version of history.

### Gameplay identity

CAELUM should play with:

- Severe discipline.
- Punishment of repeated mistakes.
- Defensive control.
- Pressure.
- Limited information.
- Precise timing.
- Strong late-round decisions.

### Narrative function in Rise

- Final boss identity.
- Highest progression milestone.
- Reveals that defeating him opens a gate rather than ending the story.
- Establishes the three paths/teams.
- Confirms the existence of The Immortal.
- Serves as the bridge from Rise toward Beyond the Rules.

### Endgame function

CAELUM leads the team representing:

- Discipline.
- Endurance.
- Protection.
- Duty.
- Controlled power.

His final role against The Immortal is:

## **Seal the Return**

CAELUM blocks The Immortal from transferring itself into another vessel or returning after apparent defeat.

---

## 2.4 The Immortal

### Public identity

The ultimate hidden enemy of the TriplePoker universe.

### True nature

The Immortal is not simply a powerful person who cannot die.

Its immortality comes from continuity:

- Transferred will.
- Preserved memory.
- Replacement vessels.
- Manipulation of successors.
- Control of historical narratives.
- Exploitation of humanity's desire for heroes and rulers.

### Narrative purpose

The Immortal represents:

- Power that refuses to end.
- History controlled by a single will.
- Systems that survive by replacing faces.
- The belief that order, truth, or sacrifice alone can solve everything.

### Why one team cannot win

- Monarch can break its power structure but cannot reach its hidden core.
- Soren can reach the core but cannot stop its return.
- CAELUM can stop its return but cannot destroy the structure and reach the core alone.

The Immortal can only be truly defeated when all three functions occur together.

### Gameplay identity

The Immortal should feel superior through:

- Stronger search and evaluation.
- Adaptation between rounds.
- Opponent modeling.
- Memory of repeated strategies.
- Phase-based rule modifiers.
- Attacks on team coordination.
- Declared advantages rather than hidden cheating.

The Immortal must not:

- See hidden cards without a declared rule.
- Change cards after dealing.
- Rewrite evaluated results.
- Generate impossible cards.
- Win by arbitrary random override.
- Use undisclosed powers.

### Signature ability

## **Eternal Adaptation**

After each round, The Immortal identifies one repeated team behavior and gains a configured response to it for the next round.

This must be implemented using a small library of predefined counters, not a new machine-learning system.

Examples:

- Frequent Raise → increased Raise cost or stronger counter behavior.
- Repeated Pile 3 focus → reduced information in Pile 3.
- Repeated defense of the same teammate → pressure shifts to another target.
- Repeated arrangement pattern → AI prioritizes a counter configuration.

---

# 3. The Original Alliance

Long before the events of Rise, Monarch, Soren, and CAELUM worked together against The Immortal.

They agreed on the threat but disagreed on the solution.

## Monarch's position

Protect the kingdom first.

Reveal only what the population can survive knowing.

## Soren's position

Reveal the entire truth.

No ruler has the right to decide what others are allowed to know.

## CAELUM's position

Contain the threat immediately.

Debate can continue only if the world survives.

## The collapse

Their disagreement caused the alliance to break.

The Immortal was contained, but not destroyed.

The consequences were:

- Monarch remained visible but burdened by guilt.
- Soren disappeared into exile.
- CAELUM remained at the gate.
- The world remembered the wrong enemy.
- The true threat waited.

This history should be revealed gradually, not in one large exposition scene.

---

# 4. Story Structure Across Both Applications

## 4.1 Phase One — Rise of the Player

Application:

```text
TriplePoker: Rise
```

The player begins as an unknown competitor.

Primary experience:

- Learn TriplePoker.
- Progress through tiers.
- Defeat standard bosses.
- Build profile and reputation.
- Encounter hints of a larger hidden history.

At this stage, the main story remains secondary to gameplay.

Do not block normal progression behind long narrative sequences.

### Dev implementation

Use:

- Short dialogue cards.
- Rare encounter overlays.
- Boss intro text.
- Result-screen lore fragments.
- Achievement descriptions.
- Server Activity posts.
- Static or lightly animated 2D art.

Do not create:

- Large cutscene systems.
- Branching voice dialogue.
- Fully animated character scenes.
- Open exploration.

---

## 4.2 Phase Two — Monarch's Warning

Monarch appears as a rare boss encounter.

Special match reference:

```text
Community cards: 2–2–0
Private arrangement: 3–3–5
One match determines the result
Arrange time: no more than 40 seconds
Auto Sort: disabled
```

Purpose:

- Create a rare high-pressure encounter.
- Introduce rule-breaking themes.
- Show that the known rules are not complete.
- Foreshadow Beyond the Rules.
- Begin Monarch's evaluation of the player.

Monarch should not explain everything.

He should create questions.

---

## 4.3 Phase Three — Soren Appears

Soren appears in selected rare encounters.

He may:

- Replace Monarch in a rare boss slot.
- Appear in special Tier S content.
- Appear at the same table as Monarch.

The first encounters should identify him only gradually.

Suggested reveal sequence:

```text
Unknown Wanderer
→ Soren
→ Soren Veyl
→ The First Exile
```

This reveal may be simplified if the UI cost is too high.

---

## 4.4 Phase Four — Dual Boss Lore Encounters

Some rare matches include both Monarch and Soren.

Recommended table composition:

```text
Human Player
Human Player or AI
Monarch
Soren Veyl
```

The purpose is not to create a special dual-boss engine.

The purpose is to deliver dialogue between rounds using the existing table.

Dialogue timing:

- Before match.
- After community reveal.
- After pile result.
- After match.

Do not show long dialogue while an active player timer is running.

### Canonical lore progression

#### Encounter 1 — Recognition

Monarch reveals that he knows Soren's real name.

#### Encounter 2 — The Exile

Their disagreement over truth and order is revealed.

#### Encounter 3 — The Gatekeeper

They refer indirectly to CAELUM and the gate.

#### Encounter 4 — The Immortal

They reveal that the seal is weakening.

#### Encounter 5 — Final Warning

They indicate that three paths will be needed again.

### Dev implementation

Use a config-driven dialogue state.

```ts
type DualBossLoreState =
  | "FIRST_REUNION"
  | "THE_EXILE"
  | "THE_GATEKEEPER"
  | "THE_IMMORTAL"
  | "FINAL_WARNING";
```

Each player stores only the highest unlocked lore state or a list of unlocked IDs.

Repeated encounters use short non-canonical banter instead of replaying the full scene.

---

## 4.5 Phase Five — CAELUM

CAELUM is encountered as The Last Boss.

The player initially believes this is the final goal.

After victory, the game reveals:

> Defeating The Last Boss does not end the journey.  
> It opens the gate he was protecting.

CAELUM explains that no single philosophy is sufficient to defeat what lies beyond.

This is the canonical bridge toward the three paths.

---

## 4.6 Phase Six — Tier S and Tier S+

Tier S and Tier S+ may later be added inside Rise.

They should reuse the existing React Native application and server.

Narrative functions:

- Allow Monarch to evaluate leadership candidates.
- Allow Soren to evaluate pathfinder candidates.
- Allow CAELUM's path to continue through the existing planned system.
- Reveal deeper lore.
- Prepare players for Beyond the Rules.

Tier S/S+ must not be implemented before Rise launch and market validation.

---

## 4.7 Phase Seven — Beyond the Rules

Application:

```text
TriplePoker: Beyond the Rules
```

The player enters a world where the standard assumptions of TriplePoker are no longer fixed.

The journey uses:

- A portrait campaign map.
- Short 2.5D travel preludes.
- Configurable rule presets.
- Team-specific dialogue.
- Lore discoveries.
- Reusable table, cards, evaluator, and animation systems.

The campaign should feel like a journey, but remain technically lightweight.

---

# 5. Beyond the Rules — Core Gameplay Presets

The endgame application uses one reusable core engine with multiple rule configurations.

## Preset A

```text
Community: 2–2–0
Arrange: 3–3–5
Initial cards per player: 11
Deck: 52
Reserve: 4
```

## Preset B

```text
Community: 2–1–0
Arrange: 3–4–5
Initial cards per player: 12
Deck: 52
Reserve/Fate Card: 1
```

## Preset C

```text
Community: 3–1–0
Arrange: 2–4–5
Initial cards per player: 11
Deck: 52
Archive cards: 4
```

## Preset D — Full Deck

```text
Community: 2–1–1
Initial cards per player: 13
Discard: 2
Arrange: 3–4–4
Deck: 52 standard cards + 4 Jokers
Total deck: 56
```

Each final pile resolves to five cards.

The endgame application does not require:

```text
Pile 1 < Pile 2 < Pile 3
```

Rules must be config-driven.

Do not create separate evaluators for each stage.

---

# 6. Joker Canon

## 6.1 Bridge Joker

Purpose:

- Fill one missing card for:
  - Straight.
  - Flush.
  - Straight Flush.
  - Royal Flush.

Restrictions:

- Cannot create Pair.
- Cannot create Three of a Kind.
- Cannot create Full House.
- Cannot create Four of a Kind.
- Cannot be discarded.

Narrative connection:

Bridge Joker represents Soren's philosophy: finding a path where one appears to be missing.

## 6.2 Clone Joker

Purpose:

- Copy the rank of one real standard card in the player's private hand.
- Complete:
  - Pair.
  - Three of a Kind.
  - Four of a Kind.

Restrictions:

- Source must be in a different private pile.
- Source cannot be in the same pile.
- Source cannot be discarded.
- Source cannot be a community card.
- Source cannot be another Joker.
- Clone copies rank only, not suit.
- Cannot be discarded.

Narrative connection:

Clone Joker reflects identity, succession, and the central danger of The Immortal.

It should gradually foreshadow that copying identity is not the same as continuing life.

---

# 7. The Three Teams

The original three-path/team plan remains canonical.

The team connected to defeating CAELUM remains as already designed.

Do not automatically require Monarch's or Soren's representatives to have defeated CAELUM unless a later design explicitly requires it.

The three teams represent different necessary strengths.

## 7.1 Monarch's team

Core values:

- Leadership.
- Order.
- Responsibility.
- Resource control.
- Team sacrifice.

Representative selection focuses on:

- Consistency.
- Strategic restraint.
- Team outcomes.
- Efficient Crown use.
- Leadership under pressure.

Suggested title:

```text
Monarch's Chosen
```

Alternative display title:

```text
Bearer of the Crown
```

## 7.2 Soren's team

Core values:

- Discovery.
- Adaptation.
- Truth.
- Unusual solutions.
- Lore exploration.

Representative selection focuses on:

- Special-rule Trials.
- Recovery from disadvantage.
- Hidden achievements.
- Lore discovery.
- Non-standard winning paths.

Suggested title:

```text
Veyl's Pathfinder
```

## 7.3 CAELUM's team

Core values:

- Discipline.
- Endurance.
- Protection.
- Duty.
- Controlled power.

The selected representative path already exists in the previous design and should remain unchanged unless explicitly revised later.

Suggested generic title:

```text
CAELUM's Chosen
```

The actual canonical title may use the previously locked team terminology.

---

# 8. Representative Selection

## 8.1 CAELUM path

The selected representative is already defined by the existing plan.

Do not redesign this path unless instructed separately.

## 8.2 Monarch path

The Monarch path does not require the candidate to have defeated CAELUM.

Recommended eligibility:

- Reach the required progression tier.
- Defeat Monarch at least once.
- Complete Monarch lore requirements.
- Meet minimum match count.
- Pass fair-play checks.

Recommended scoring themes:

- Competitive performance.
- Consistency.
- Controlled Crown use.
- Team-preserving decisions.
- Monarch-specific missions.

Final Trial should reuse the normal match engine.

Do not create a full tournament bracket in MVP.

## 8.3 Soren path

The Soren path does not require the candidate to have defeated CAELUM.

Recommended eligibility:

- Reach the required progression tier.
- Encounter or defeat Soren.
- Unlock required Soren lore.
- Complete special-rule Trials.

Recommended scoring themes:

- Performance under unusual rules.
- Recovery from disadvantage.
- Lore discovery.
- Variety of successful strategies.
- Hidden achievement flags.

Soren may nominate one hidden candidate through a predefined achievement flag.

Do not create an AI system that subjectively chooses players.

---

# 9. Annual Battle Against The Immortal

The Immortal event is annual, not monthly.

This is canonical.

Reasons:

- Preserves rarity.
- Gives the event narrative weight.
- Reduces development and live-operations burden.
- Allows a full-year qualification cycle.
- Prevents The Immortal from becoming ordinary.
- Gives the team time to test and prepare.

## Annual representatives

The final table contains:

```text
Seat 1 — Monarch representative
Seat 2 — Soren representative
Seat 3 — CAELUM representative
Seat 4 — The Immortal
```

The three players control their own hands.

They do not share private cards.

They cooperate through shared objectives.

## Shared victory conditions

The event should require all three team objectives:

### Monarch objective

Break the Throne.

### Soren objective

Open the Forgotten Road.

### CAELUM objective

Seal the Return.

Winning only by normal score should not be enough for the true victory.

However, the MVP implementation may represent these objectives through simple counters and flags attached to normal pile results.

Do not create three new minigames.

---

# 10. The Immortal — AI Design

The Immortal must be the strongest boss, but fair.

## Required qualities

- Highest search depth allowed by performance budget.
- Strong pile allocation.
- Opponent behavior model.
- Adaptation between rounds.
- Team strategy disruption.
- Configured phase modifiers.
- Memory within the current annual match.

## Optional memory

The Immortal may remember high-level player patterns from the current match only.

Persistent cross-year memory is not required for MVP.

## Suggested phases

### Phase 1 — The Watcher

Observes and collects behavior signals.

### Phase 2 — The Usurper

Targets repeated patterns.

### Phase 3 — The Immortal

Activates the strongest declared modifiers.

Phase changes occur between rounds, never during active arrangement.

## Dev constraint

Implement The Immortal by extending the existing boss AI.

Do not build:

- A neural network.
- A new poker engine.
- Real-time self-training.
- Hidden rule manipulation.
- Server-heavy simulation without performance limits.

Use a predefined counter library.

---

# 11. Annual Event Prestige

Being selected to face The Immortal is itself a major reward.

Suggested permanent honors:

## Selected

Chosen as annual representative.

## Challenger

Completed the annual match.

## Immortal Slayer

Member of a team that achieved true victory.

Suggested rewards:

- Limited annual card.
- Avatar frame.
- Hall of Champions entry.
- Annual badge.
- Exclusive lore.
- Match Chronicle.
- Replay metadata if replay support already exists.

Do not build a replay system solely for this event if the game does not already support one.

---

# 12. Canonical Character Relationships

## 12.1 Monarch and Soren

Conflict:

- Order versus truth.
- Protection versus disclosure.
- Leadership versus freedom.

They respect each other but have not fully forgiven each other.

Monarch calls him:

```text
Soren
```

Soren does not treat Monarch's title as sacred.

## 12.2 Monarch and CAELUM

Conflict:

- Monarch carries guilt.
- CAELUM carries the duty Monarch left behind.
- CAELUM believes Monarch chose the kingdom over the gate.
- Monarch believes CAELUM accepted too much alone.

## 12.3 Soren and CAELUM

Conflict:

- Soren thinks CAELUM became a prisoner of duty.
- CAELUM thinks Soren understands truth but not its cost.
- Each knows the other is necessary.

## 12.4 Final reunion

The three do not reunite because they become friends again.

They reunite because their separate solutions have all failed.

The emotional climax is not forgiveness first.

It is cooperation before forgiveness.

---

# 13. Canonical Story Arc

## Act I — The Known Game

The player learns the rules and rises through the tiers.

## Act II — The Rules Are Incomplete

Monarch introduces 2–2–0 and rare lore.

## Act III — The Lost Name

Soren appears and challenges the official history.

## Act IV — The False Final Enemy

CAELUM is presented as the last enemy.

## Act V — The Gate Opens

Defeating CAELUM reveals The Immortal.

## Act VI — Three Paths

The player world divides into the three teams.

## Act VII — Beyond the Rules

The teams travel through altered rules, Joker lore, and hidden history.

## Act VIII — The Paths Converge

Each team discovers that its philosophy is insufficient alone.

## Act IX — Annual Trial

Three representatives face The Immortal.

## True Ending

- Monarch releases control.
- Soren accepts shared responsibility.
- CAELUM lays down the duty of The Last Boss.
- The Immortal's transfer cycle ends.

---

# 14. Campaign Structure for Beyond the Rules

Recommended MVP campaign:

```text
9 stages
3 chapters
```

## Chapter 1 — The Warning

1. Monarch's Warning
2. Missing Card
3. False Beginning

## Chapter 2 — The Three Paths

4. Monarch/Crown path
5. Soren/Unbound path
6. CAELUM path

## Chapter 3 — Convergence

7. Full Deck
8. Gatekeeper
9. The Immortal

The exact stage titles may change.

Map structure:

```text
Stages 1–3: linear
Stages 4–6: branch
Stages 7–9: converge
```

Do not create separate gameplay engines for each branch.

---

# 15. Travel and 2.5D Presentation

Beyond the Rules may use short travel preludes.

Recommended reusable flow:

```text
Arrival shot: 5–8 seconds
Explore moment: 15–25 seconds
Lore discovery: 5–8 seconds
Enter Card Trial
```

Use:

- One portrait scene.
- 3–5 parallax layers.
- Reusable hotspot UI.
- Ambient sound.
- Small camera pan/zoom.
- Skip after first viewing.

Do not create:

- Free walking.
- 3D navigation.
- Physics.
- Large maps.
- Real-time NPC simulation.

The story should feel like a journey without becoming an exploration engine.

---

# 16. Dialogue System

All lore dialogue should be configuration-driven.

Recommended data model:

```ts
type LoreDialogueLine = {
  speakerId: string;
  textKey: string;
  expressionId?: string;
  trigger:
    | "MATCH_START"
    | "COMMUNITY_REVEAL"
    | "PILE_RESULT"
    | "MATCH_RESULT"
    | "STAGE_ENTER"
    | "STAGE_CLEAR";
};

type LoreDialogueSet = {
  id: string;
  requiredLoreIds?: string[];
  lines: LoreDialogueLine[];
  unlockLoreId?: string;
  repeatSetId?: string;
};
```

Use localization keys rather than hard-coded display text where practical.

Avoid branching dialogue trees in MVP.

A dialogue set may have:

- One canonical sequence.
- One short repeat sequence.
- One skip option.

---

# 17. Lore Storage

Recommended player state:

```ts
type PlayerLoreProgress = {
  unlockedLoreIds: string[];
  lastDualBossLoreState?: string;
  viewedDialogueSetIds: string[];
};
```

Keep lore progression independent from the visual presentation.

This allows the same lore to be displayed as:

- Dialogue.
- Result card.
- Lore page.
- Achievement note.
- Server Activity post.

Do not duplicate lore state across multiple features.

---

# 18. Boss Configuration

Recommended shared boss model:

```ts
type BossConfig = {
  bossId: string;
  displayNameKey: string;
  titleKey: string;
  portraitAssetId: string;
  aiProfileId: string;
  privilegeIds: string[];
  dialogueSetIds: string[];
  loreUnlockIds: string[];
  rulePresetId?: string;
};
```

Canonical boss IDs:

```text
MONARCH
SOREN_VEYL
CAELUM
THE_IMMORTAL
```

Do not use display names as database IDs.

---

# 19. Shared Technical Principles

Both applications should share concepts, not necessarily UI code.

Recommended shared definitions:

- Card schema.
- Rank and suit schema.
- Poker evaluator rules.
- Boss IDs.
- Lore IDs.
- Achievement IDs.
- Rule preset IDs.
- Player identity.
- Server API contracts where practical.

If both applications use TypeScript, shared packages may be considered later.

Do not block development on creating a monorepo.

---

# 20. Feature Flags

All expensive or future features should be behind flags.

```ts
type StoryFeatureFlags = {
  monarchRareEncounter: boolean;
  sorenRareEncounter: boolean;
  dualBossLoreMatch: boolean;
  caelumFinalBoss: boolean;
  tierS: boolean;
  tierSPlus: boolean;
  beyondRulesBridge: boolean;
  annualImmortalEvent: boolean;
};
```

Default launch state for Rise should enable only completed and tested features.

---

# 21. Dev-First Scope Rules

Every story feature must pass these tests.

## Test 1 — Can it reuse the existing game engine?

If no, defer it unless essential.

## Test 2 — Can it be represented by config?

If yes, prefer config.

## Test 3 — Does it require a new permanent system?

If yes, confirm the player value is high enough.

## Test 4 — Can dialogue or presentation create the same feeling?

If yes, avoid complex mechanics.

## Test 5 — Is it required for the current release?

If no, place it behind a feature flag or roadmap note.

---

# 22. Explicit Non-Goals

Do not interpret this story as a requirement to build:

- Open-world exploration.
- Full RPG combat.
- Unity scenes.
- Real-time 3D characters.
- Motion-captured cinematics.
- Voice acting pipeline.
- Large branching dialogue trees.
- Guild systems.
- Team chat.
- Spectator infrastructure at launch.
- Monthly live tournaments.
- Automated AI narrative generation.
- New gameplay engine per boss.
- New economy per application.
- New evaluator per rule preset.

---

# 23. Recommended Development Order

## Step 1 — Launch Rise

Focus on:

- Stable gameplay.
- Multiplayer reliability.
- Onboarding.
- Economy.
- Analytics.
- Tier progression.

## Step 2 — Add Monarch lore bridge

Use the rare 2–2–0 encounter.

## Step 3 — Add Soren

Use the existing boss slot and dialogue system.

## Step 4 — Add dual-boss lore matches

Only after the standard boss flow is stable.

## Step 5 — Add CAELUM reveal

Keep CAELUM as the climax of Rise.

## Step 6 — Add Tier S / S+ only after validation

Reuse Rise.

## Step 7 — Build Beyond the Rules

Use the shared evaluator and config-driven presets.

## Step 8 — Add annual Immortal event only when population supports it

The event should not be required for the first Beyond the Rules launch.

---

# 24. Minimum Narrative Implementation

The full story can be delivered with the following small system set:

1. Boss configuration.
2. Lore IDs.
3. Dialogue sets.
4. Rare encounter selection.
5. Rule preset configuration.
6. Achievement flags.
7. Result-screen lore cards.
8. Three team IDs.
9. Annual representative records.
10. One Immortal match configuration.

This is the preferred implementation target.

---

# 25. Canonical Summary for Developers

The story in one paragraph:

> Monarch, Soren Veyl, and CAELUM once opposed The Immortal together. Monarch chose order and concealed the truth, Soren chose truth and was erased from history, and CAELUM chose duty and remained alone to guard the final gate. In Rise, the player gradually discovers this history through rare encounters, dual-boss dialogue, and the apparent final battle against CAELUM. Defeating CAELUM reveals that he is not the true enemy and opens three paths. In Beyond the Rules, the three teams follow different philosophies and altered rule systems, but eventually discover that none can defeat The Immortal alone. Once per year, one representative from each team joins the other two at a four-seat table against The Immortal. Monarch breaks its throne, Soren opens the forgotten road, and CAELUM seals its return.

---

# 26. Canonical Theme

English:

> **One guarded the crown.  
> One carried the truth.  
> One sealed the gate.  
> None could end eternity alone.**

Thai meaning:

> **คนหนึ่งเฝ้ามงกุฎ  
> คนหนึ่งแบกความจริง  
> คนหนึ่งผนึกประตู  
> แต่ไม่มีใครยุติความเป็นนิรันดร์ได้เพียงลำพัง**

This is the central theme connecting both applications.

---

# 27. Final Instruction to AI Developers

When implementing any feature based on this document:

1. Preserve existing gameplay systems.
2. Prefer configuration over new engines.
3. Prefer short dialogue over complex cinematics.
4. Keep server authority for gameplay, progression, and rewards.
5. Keep story state separate from UI state.
6. Do not implement future roadmap features early.
7. Ask whether a simpler presentation can produce the same emotional effect.
8. Treat Rise launch stability as higher priority than universe expansion.
9. Keep The Immortal rare.
10. Keep the story large and the code small.
