# TriplePoker: Rise — Ad System Refactor Specification

**Version:** 1.0  
**Date:** 2026-09-17  
**Purpose:** Replace the current ad/reward implementation with a configurable, centralized, non-deterministic ad system that supports Free, VIP Pro, and VIP Pro Plus players without hard-coding ad behavior across multiple screens.

---

## 1. Goals

This refactor must achieve all of the following:

1. Remove the current pattern where a reward is offered after every cleared Level.
2. Make interstitial ads frequent enough to monetize Free players, but non-deterministic enough that users cannot easily predict exactly when an ad will appear.
3. Centralize all ad frequency and reward cadence values in one config layer.
4. Prevent ad logic from being duplicated or hard-coded inside individual screens.
5. Introduce the new **Second Deal** mechanic for Win Streak recovery.
6. Rework the **Top 20** flow to become automatic after gameplay, with a reward flow and optional x2 rewarded ad.
7. Add configurable reward cadence for normal Levels and guaranteed milestone rewards every 10 Levels.
8. Allow future tuning without changing gameplay code.

---

# 2. Design Principles

## 2.1 Ads should be unpredictable, not constant

Do **not** show ads at every eligible transition.

Instead, each eligible ad opportunity must pass through a centralized probability gate.

Recommended initial probability pool:

```ts
chancePool = [0.25, 0.40]
```

At each eligible opportunity:

1. Randomly choose one probability from `chancePool`.
2. Generate a random number between `0` and `1`.
3. Show the interstitial only when:

```ts
roll < selectedChance
```

Example:

```ts
selectedChance = 0.40
roll = 0.31
// Show ad
```

Another opportunity:

```ts
selectedChance = 0.25
roll = 0.62
// Skip ad
```

This creates an intentionally irregular pattern.

---

## 2.2 Ads must be controlled by a global manager

Individual screens must NOT directly decide whether to show an interstitial.

Use one centralized API, conceptually:

```ts
AdManager.shouldShowInterstitial("level_complete")
AdManager.shouldShowInterstitial("restart")
AdManager.shouldShowInterstitial("top20_continue")
AdManager.shouldShowInterstitial("return_lobby")
```

`AdManager` is responsible for:

- membership eligibility
- ad point enabled/disabled state
- global cooldown
- rewarded-ad cooldown
- session ad limit
- back-to-back protection
- point multiplier
- probability pool selection
- random roll
- logging/debug information

---

# 3. Ad Configuration

Create a single config module/file, for example:

```ts
adConfig.ts
```

Recommended initial shape:

```ts
export const AD_CONFIG = {
  enabled: true,

  interstitial: {
    chancePool: [0.25, 0.40],

    globalCooldownSec: 60,
    rewardedCooldownSec: 45,

    maxPerSession: 8,
    allowBackToBack: false,

    eligiblePoints: {
      levelComplete: true,
      restart: true,
      top20Continue: true,
      returnLobby: true,
    },

    pointMultiplier: {
      levelComplete: 1.0,
      restart: 1.0,
      top20Continue: 1.0,
      returnLobby: 0.8,
    },
  },

  rewards: {
    randomRewardMaxPerTenLevels: 3,
    milestoneEveryLevels: 10,
    milestoneRareItemCount: 1,

    top20RewardMinItems: 1,
    top20RewardMaxItems: 2,
    top20X2Enabled: true,
  },

  debug: {
    enableTuningPanel: true,
    enableDecisionLogging: true,
  },
};
```

All values must be easy to change later.

Do not scatter magic numbers across the codebase.

---

# 4. Interstitial Ad Flow

## 4.1 Eligible ad opportunities

Initial eligible transition points:

- after Level completion
- when restarting / starting a new game
- after pressing Continue from Top 20 reward flow
- when returning to Lobby

These are only **opportunities**.

They do NOT guarantee an ad.

---

## 4.2 Interstitial decision order

Recommended sequence:

```text
Eligible Point
   ↓
Ads enabled?
   ↓
Membership allows interstitial?
   ↓
Point enabled?
   ↓
Session limit reached?
   ↓
Global cooldown active?
   ↓
Recently watched Rewarded Ad?
   ↓
Back-to-back protection?
   ↓
Pick probability from chancePool
   ↓
Apply point multiplier
   ↓
Random roll
   ↓
Show / Skip
```

Recommended probability calculation:

```ts
const baseChance = randomChoice(AD_CONFIG.interstitial.chancePool);
const multiplier = AD_CONFIG.interstitial.pointMultiplier[point] ?? 1;
const finalChance = clamp(baseChance * multiplier, 0, 1);
const show = Math.random() < finalChance;
```

---

## 4.3 Global cooldown

After an interstitial is displayed, start a global interstitial cooldown.

Recommended initial value:

```ts
globalCooldownSec = 60
```

During the cooldown, all normal interstitial opportunities are skipped.

---

## 4.4 Rewarded-ad cooldown

If the player voluntarily watches a Rewarded Ad, suppress forced interstitials for a short period.

Recommended initial value:

```ts
rewardedCooldownSec = 45
```

Reason:

Do not punish the user with an immediate forced ad after they just voluntarily watched one.

---

## 4.5 Back-to-back protection

Default:

```ts
allowBackToBack = false
```

Avoid situations such as:

```text
Rewarded Ad → Continue → Interstitial
```

or

```text
Interstitial → immediate next transition → another Interstitial
```

---

# 5. Membership Behavior

The code must route ad eligibility through membership rules rather than hard-coding membership checks inside screens.

Suggested abstraction:

```ts
AdPolicy.forMembership(user.membershipTier)
```

At minimum support:

- Free
- VIP Pro
- VIP Pro Plus

The exact number of ads skipped by VIP tiers must remain configurable.

Do not hard-code future business rules into screen components.

---

# 6. Level Reward System Refactor

## 6.1 Remove reward-after-every-Level behavior

The current behavior where every cleared Level offers an item reward must be removed.

This creates excessive item inflation and weakens the meaning of rewards.

---

## 6.2 Random rewards during Levels xx1–xx9

For every block of 10 Levels:

```text
1–9
11–19
21–29
31–39
...
```

Random Level rewards may occur, but no more than:

```ts
randomRewardMaxPerTenLevels = 3
```

Example for Levels 21–29:

```text
21  no reward
22  reward
23  no reward
24  no reward
25  reward
26  no reward
27  no reward
28  reward
29  no reward
```

The actual reward Levels must vary.

The player must not be able to predict the exact reward Level.

---

## 6.3 Guaranteed reward at Levels xx0

Every Level ending in `0` must give a guaranteed milestone reward.

Examples:

```text
10
20
30
40
...
500
```

Recommended initial milestone reward:

```text
1 rare normal item
```

This should be configurable.

---

## 6.4 Normal random item pool

Normal random rewards may use the existing item pool and rarity system.

Current rarity / strength direction:

```text
Undo > Shuffle > xX > Swap > Auto Sort > Freeze
```

**Second Deal must NOT be included in the normal random pool.**

---

# 7. Reward + Ad Flow

When a random reward is triggered after a Level:

```text
Level Complete
   ↓
Reward event selected
   ↓
Show reward/ad flow
   ↓
Player receives base reward
   ↓
Offer optional Rewarded Ad for x2
   ↓
Continue
```

The optional x2 ad must remain voluntary.

If the player does not want x2, they must be able to continue without watching it.

---

# 8. Second Deal System

## 8.1 Purpose

`Second Deal` is a special Win Streak recovery mechanic.

It is **not** a normal in-match item.

It is **not** part of the normal random reward pool.

---

## 8.2 Trigger

Trigger only when:

```text
Player currently has a Win Streak
AND
Player loses a Match
```

Then offer the Second Deal recovery flow.

---

## 8.3 Behavior

Using Second Deal grants exactly **one additional Match**.

Result:

```text
Lose original Match
   ↓
Use Second Deal
   ↓
Play one recovery Match
   ├─ Win  → preserve previous Win Streak
   └─ Lose → Win Streak breaks/resets
```

No chained Second Deal attempts.

After losing the recovery Match, the streak must end.

---

## 8.4 Free player behavior

Free players may access Second Deal recovery via Rewarded Ad when eligible.

Do not give Second Deal through normal Level rewards.

---

## 8.5 VIP reward

VIP members receive:

```text
1 × Second Deal
```

when completing the full 8-day Daily Streak cycle.

Store it separately from the six normal gameplay items.

---

## 8.6 Inventory/UI

Second Deal should have a distinct storage slot or counter associated with Win Streak UI.

Do not place it in the normal item toolbar with:

- Swap
- Shuffle
- Freeze
- xX
- Undo
- Auto Sort

---

# 9. Top 20 Flow Refactor

There are two Top 20 entry modes.

---

## 9.1 Auto Top 20 after gameplay

When Top 20 is shown automatically after gameplay:

- do NOT show a Close button
- animate player's rank movement using the existing rank animation
- once the new rank settles, hold for approximately 3 seconds
- during that hold, show an animated rectangular dashed outline running around the perimeter of the player's row/name/rank area
- after approximately 3 seconds, automatically transition to the reward screen

Do not require the player to manually close the Top 20 screen.

Suggested mode:

```ts
entryMode: "autoReward"
```

---

## 9.2 Manual Top 20 view

When Top 20 is opened manually from the Top 20 link/menu:

- show rankings normally
- show a Close button
- do not auto-transition to reward

Suggested mode:

```ts
entryMode: "manualView"
```

---

## 9.3 Top 20 reward

When the player qualifies for Top 20 after gameplay:

```ts
rewardItems = randomInt(1, 2)
```

Base reward:

```text
1–2 normal items
```

Exclude Second Deal.

---

## 9.4 Top 20 x2 rewarded ad

After showing the Top 20 reward:

Offer:

```text
Claim / Continue
Watch Ad ×2
```

Examples:

```text
Base reward = 1 item
Watch Ad ×2 → total = 2 items
```

```text
Base reward = 2 items
Watch Ad ×2 → total = 4 items
```

The x2 ad is voluntary.

---

## 9.5 Top 20 Continue interstitial

After the reward flow, pressing Continue becomes another eligible interstitial point:

```ts
AdManager.shouldShowInterstitial("top20_continue")
```

It must still obey:

- global cooldown
- rewarded-ad cooldown
- probability gate
- session limit
- anti-back-to-back rules

If the user just watched the Top 20 x2 Rewarded Ad, the following Continue should normally skip a forced interstitial due to rewarded-ad cooldown.

---

# 10. Debug / Ad Tuning Panel

Add a Developer/Admin-only tuning panel.

It should allow runtime inspection and, if practical, temporary adjustment of:

- chance pool
- global cooldown
- rewarded cooldown
- session cap
- eligible points
- point multipliers
- reward max per 10 Levels
- milestone interval
- Top 20 reward min/max

Also show current session telemetry:

```text
Interstitial shown this session
Rewarded ads shown this session
Last interstitial timestamp
Last rewarded timestamp
Current cooldown remaining
Last eligible point
Last selected chance
Last random roll
Last decision: SHOW / SKIP
Skip reason
```

This panel is for development/debug only and must not appear to normal players.

---

# 11. Telemetry / Logging

Add structured logging for ad decisions.

Example:

```ts
{
  event: "ad_decision",
  point: "restart",
  membership: "free",
  selectedChance: 0.40,
  multiplier: 1.0,
  finalChance: 0.40,
  roll: 0.31,
  result: "show"
}
```

Skipped example:

```ts
{
  event: "ad_decision",
  point: "top20_continue",
  result: "skip",
  reason: "rewarded_cooldown"
}
```

Do not rely only on console logs if the project already has a telemetry/event system.

Use the existing telemetry architecture where possible.

---

# 12. Suggested Architecture

Suggested modules:

```text
ads/
  adConfig.ts
  AdManager.ts
  AdPolicy.ts
  AdSessionState.ts
  adTelemetry.ts

rewards/
  RewardManager.ts
  LevelRewardScheduler.ts
  rewardConfig.ts

streak/
  SecondDealManager.ts
```

Exact file placement should follow the existing project structure rather than forcing this layout blindly.

---

# 13. Migration Requirements

Codex must first inspect the existing implementation before editing.

Locate all existing ad entry points including at minimum:

- Level win reward
- Next Level transition
- Classic Lobby entry
- Victory Continue
- Token Rescue / help ad
- Tier celebration
- Streak claim
- Top 20
- any simulated Rewarded Ad implementation
- any current VIP bypass logic

Then classify each one as:

```text
KEEP
REPLACE
REMOVE
MIGRATE TO AdManager
MIGRATE TO RewardManager
```

Do not simply add the new system on top of the old one.

The goal is to remove duplicated / obsolete paths so two ad systems do not coexist accidentally.

---

# 14. Existing Behavior That Must Be Removed or Changed

At minimum:

## Remove

- guaranteed reward after every cleared Level
- direct ad calls embedded in Level screens when they can be routed through AdManager
- any duplicated random logic spread across screens
- any Top 20 auto-flow Close button

## Change

- Top 20 auto entry to timed transition
- Top 20 reward to 1–2 normal items
- Top 20 x2 via voluntary Rewarded Ad
- Level reward schedule to max 3 random rewards in xx1–xx9
- Level xx0 to guaranteed milestone reward
- restart/new game to probabilistic interstitial opportunity

---

# 15. Failure Handling

## 15.1 Interstitial fails to load

Skip it immediately and continue gameplay.

Do not block progression.

---

## 15.2 Rewarded Ad unavailable / fails

For voluntary x2 rewards:

- do not grant x2
- allow the base reward to remain claimable
- never consume the base reward

For Daily Streak claim behavior, preserve the existing rule that a Free player's claim should not be forfeited merely because the Rewarded Ad is unavailable.

---

## 15.3 Second Deal rewarded ad fails

Do not break the streak merely because the ad service failed.

Keep the player on the recovery decision screen or provide a safe retry/exit behavior according to the existing UX conventions.

Do not grant the recovery Match without a successful rewarded-ad completion unless the player owns a stored Second Deal item.

---

# 16. Acceptance Criteria

The refactor is complete only when all of the following pass:

### Interstitial

- [ ] Restart/new game does not always show an ad.
- [ ] Level completion does not always show an ad.
- [ ] Top 20 Continue does not always show an ad.
- [ ] Ad probabilities come from config.
- [ ] Global cooldown works.
- [ ] Rewarded-ad cooldown works.
- [ ] Back-to-back forced ads are prevented by default.
- [ ] Session limit works.

### Level rewards

- [ ] Rewards no longer appear after every Level.
- [ ] Levels xx1–xx9 grant random rewards no more than 3 times per 10-Level block.
- [ ] Level xx0 always grants the milestone reward.
- [ ] Second Deal never appears in normal random rewards.

### Top 20

- [ ] Auto mode has no Close button.
- [ ] Existing rank movement animation remains.
- [ ] Player row gets animated dashed rectangular border for ~3 seconds.
- [ ] Auto flow proceeds to reward screen.
- [ ] Reward is 1–2 normal items.
- [ ] Optional Rewarded Ad doubles the reward.
- [ ] Manual Top 20 view still has Close.

### Second Deal

- [ ] Triggered only when a player with an active Win Streak loses.
- [ ] Grants exactly one recovery Match.
- [ ] Win preserves previous streak.
- [ ] Loss breaks streak.
- [ ] No Second Deal chaining.
- [ ] Not in normal item pool.
- [ ] VIP 8-day Daily Streak completion awards 1 stored Second Deal.

### Config / architecture

- [ ] Screens do not contain duplicated ad probability logic.
- [ ] All core tuning values live in config.
- [ ] AdManager handles interstitial decisions.
- [ ] Debug panel exists for development mode.
- [ ] Decision logging exists.

---

# 17. Testing Requirements

Add/update tests for:

1. Probability gate boundaries.
2. Cooldown blocking.
3. Rewarded-ad cooldown blocking.
4. Session cap.
5. Membership policy.
6. Per-point enable/disable.
7. Point multiplier.
8. Ten-Level reward window reset.
9. Maximum 3 random rewards in xx1–xx9.
10. Guaranteed xx0 milestone reward.
11. Top 20 reward min/max.
12. Top 20 x2 calculation.
13. Second Deal win path.
14. Second Deal loss path.
15. Second Deal no-chain rule.
16. Second Deal exclusion from normal reward pool.
17. Failed interstitial must not block gameplay.
18. Failed rewarded ad must not lose base reward.

Where randomness is involved, inject/mock RNG instead of writing flaky tests based on `Math.random()` directly.

---

# 18. Implementation Notes

- Preserve existing visual language unless explicitly changed in this spec.
- Reuse existing animation for Top 20 rank movement.
- Only add the animated dashed perimeter highlight around the player's row.
- Keep the implementation modular.
- Prefer pure functions for probability/reward decisions so they are easy to test.
- Do not replace working gameplay systems unnecessarily.
- Do not change poker rules as part of this refactor.
- Do not change item mechanics unrelated to reward/ad distribution.
- Do not introduce new SDK assumptions unless the current project already has a real ad SDK integration.
- If ads are currently simulated, preserve a clean adapter boundary so the simulator can later be swapped for the production SDK.

---

# 19. Codex Work Prompt

Copy/paste the following prompt into Codex, or give Codex this entire file and instruct it to follow the prompt below.

```text
You are modifying the existing TriplePoker: Rise codebase.

Read this entire specification before making changes.

Your task is to refactor the current advertising and reward system into a centralized, configurable architecture.

IMPORTANT:
- Inspect the existing code first.
- Do not blindly add a second ad system on top of the existing one.
- Find every current ad/reward entry point and classify it before editing.
- Preserve working gameplay behavior that is unrelated to ads/rewards.
- Preserve the existing Top 20 rank movement animation.
- Do not change poker rules.

PRIMARY OBJECTIVES

1. Create a centralized AdManager and ad configuration layer.
2. Replace deterministic/hard-coded interstitial calls with probabilistic ad opportunities.
3. Initial chance pool should be configurable and start at [0.25, 0.40].
4. Add configurable global cooldown, rewarded-ad cooldown, session cap, eligible points, and point multipliers.
5. Remove the current reward-after-every-cleared-Level behavior.
6. For each 10-Level block:
   - Levels xx1–xx9 may randomly trigger normal rewards no more than 3 times total.
   - Level xx0 must always grant a milestone reward.
   - Start with 1 rare normal item as the milestone reward.
7. Second Deal must never appear in the normal random item pool.
8. Implement Second Deal as a Win Streak recovery system:
   - trigger after a Match loss while an active Win Streak exists
   - grant exactly one recovery Match
   - winning preserves the prior streak
   - losing breaks the streak
   - no chained Second Deal attempts
   - VIP gets 1 stored Second Deal after completing the 8-day Daily Streak cycle
9. Refactor Top 20:
   - auto post-game Top 20 has no Close button
   - preserve current rank movement animation
   - after rank settles, hold around 3 seconds
   - show an animated dashed rectangular outline running around the player's row during that hold
   - then automatically transition to the reward screen
   - reward 1–2 normal items
   - allow optional Rewarded Ad to double the reward
   - manual Top 20 entry still has Close
10. Top 20 Continue becomes an eligible probabilistic interstitial point.
11. Restart/new game also becomes an eligible probabilistic interstitial point.
12. Failed interstitial must never block progression.
13. Rewarded-ad failures must never destroy the base reward.
14. Add development-only tuning/debug UI and structured decision logging.
15. Inject/mock RNG in tests. Do not write flaky randomness tests.

BEFORE EDITING

Produce a short audit of the current code showing:
- all current ad entry points
- all current reward entry points
- all current VIP ad bypass paths
- all current Top 20 flows
- current Rewarded Ad simulator/SDK adapter
- files that must change
- obsolete paths that will be removed

Then implement the refactor.

ARCHITECTURE

Prefer one centralized call pattern such as:

AdManager.shouldShowInterstitial(point)

with point values similar to:
- level_complete
- restart
- top20_continue
- return_lobby

Screens must not implement their own probability logic.

Create config-driven behavior so ad frequency can later be changed by editing numeric values rather than rewriting screen logic.

INITIAL CONFIG TARGETS

chancePool: [0.25, 0.40]
globalCooldownSec: 60
rewardedCooldownSec: 45
maxInterstitialPerSession: 8
allowBackToBack: false
randomRewardMaxPerTenLevels: 3
milestoneEveryLevels: 10
milestoneRareItemCount: 1
top20RewardMinItems: 1
top20RewardMaxItems: 2
top20X2Enabled: true

Treat these as configuration defaults, not hard-coded business logic.

DELIVERABLES

After implementation, report:
1. files created
2. files changed
3. old paths removed
4. final ad entry points
5. final reward flow
6. Second Deal flow
7. Top 20 flow
8. config values and where to tune them
9. tests added/updated
10. any remaining TODO related to production ad SDK integration

Run the relevant test suite and fix regressions introduced by this refactor before stopping.
```

---

# 20. Final Product Intent

The intended player experience is:

- Free players see ads often enough to monetize the game.
- Ads do not appear in an obvious fixed pattern.
- Players cannot predict exactly which transition will trigger an ad.
- Rewards feel meaningful because they are no longer granted every Level.
- Every 10 Levels provides a clear guaranteed reward target.
- Top 20 feels like an achievement moment rather than a static leaderboard page.
- Second Deal gives Win Streaks emotional value and creates a strong rewarded-ad opportunity.
- VIP benefits remain meaningful without inflating the normal item economy.
- The developer can tune ad intensity from central numeric configuration without rewriting gameplay screens.

