# TriplePoker: Rise — Full Project QA Audit

Date: 2026-09-24
Scope: client, server, Solo/Multiplayer, AI, evaluators, items, economy, ads, VIP, persistence, navigation, assets, Expo/build configuration, and existing automated coverage.

## Executive summary

- No new P0 data-corruption or security defect was confirmed in this audit.
- Four production-impacting Rise defects found during the audit cycle were fixed: result payload compatibility, Duel score reset presentation, Buy/Swap transition crash, and Expo dynamic-config composition.
- Server TypeScript build, client TypeScript, i18n validation, Expo Doctor (21/21), and Expo web export pass.
- The complete Jest inventory contains 125 suites. A parallel full run exercised the repository broadly but did not terminate cleanly under the available Windows worker resources. It exposed three failures: two are now independently verified/fixed or passing; one High Noble AI expectation remains a Canon-sensitive review item.
- Physical Android device/emulator matrix testing was not available in this environment. Responsive-layout confidence is therefore based on static inspection, TypeScript, Expo Doctor, and successful web export, not pixel-perfect device certification.

## Findings

| ID | Severity | Area | Problem | Root cause | Fix/status | Files affected | Verification |
|---|---|---|---|---|---|---|---|
| QA-001 | P0 | Rise result UI | `TierDSoloResult` could crash on legacy/in-flight result data with `Cannot read property 'map' of undefined`. | Settlement UI assumed the new `duels` array was always present. | Fixed with optional settlement fields and a safe empty fallback; preserves old payload compatibility. | `client/src/components/game/TierDSoloResult.tsx` | Client TypeScript PASS; focused Rise tests PASS; old-shape path no longer dereferences `undefined`. |
| QA-002 | P1 | Rise Buy/Swap transition | Buy/Swap and Skip could leave the screen stuck after Duel 1/2. | State projection attempted to build a bot preview from an eliminated opponent whose arrangement had already been cleared. | Fixed at the projection boundary by emitting previews only for seats with an arrangement; transition errors are logged. | `server/src/game/tierDSoloRuntime.ts`, `server/tests/game/tierDRiseDuel.test.ts` | Regression covers Skip and Swap -> AI exchange -> next Duel reset; PASS. |
| QA-003 | P1 | Rise scoring | A new Duel could display cumulative score instead of starting at zero. | `emitState()` recombined current Duel scores with historical cumulative scores although the core Duel state had reset correctly. | Fixed projection to expose current-Duel scores only; settlement history remains separate. | `server/src/game/tierDSoloRuntime.ts`, `server/tests/game/tierDRiseDuel.test.ts` | Focused Rise Duel suite PASS. |
| QA-004 | P2 | Expo/build config | Expo Doctor reported that `app.json` properties were not synchronized with dynamic config. | `app.config.js` loaded `app.json` itself instead of composing Expo's supplied `config`. | Fixed dynamic config to spread `config`, merge plugins, and merge `extra`. | `client/app.config.js` | `npx expo-doctor --verbose`: 21/21 PASS; web export PASS. |
| QA-005 | P2 | i18n persistence tests | Language persistence suite referenced the legacy storage key and unsupported `ja`, producing a false regression. | Store migrated to `triplepoker.language.v2` and current locale registry only contains `en`, `th`, `zh-CN`; test was stale. | Test now starts from the legacy key, verifies migration/current key behavior, and uses supported `zh-CN`. | `server/tests/game/launchLanguageStore.test.ts` | Targeted suite PASS (1/1). |
| QA-006 | P1 | High Noble AI / Best 5 of 7 | Snapshot incorrectly expected winning Pile 2 to guarantee hidden Pile 3; its fixture also supplied only 3 private G3 cards although runtime requires 5. | The expectation conflicted with information-isolation Canon, while the estimator's previous high-rank heuristic did not cover all dangerous poker combinations. | Fixed. Estimator uses only own/public/revealed cards plus a bounded legal unseen-card search. Tie or any possible loss prevents “guaranteed”; an unexhausted search remains conservatively non-guaranteed. Opponent authoritative hidden G3 is never read. | `server/src/game/highNobleMultiEngine.ts`, `server/tests/game/hnSnapshot.test.ts` | High Noble affected suites PASS — 47/47. Tests cover Pile 2 non-guarantee, hidden-card mutation invariance, and fully visible guaranteed range. |
| QA-007 | P2 | Multiplayer AFK tests | `adeptAFK` timed out during the parallel full suite. | Heavy concurrent AI/integration workers exhausted CPU; the suite itself takes about 21s and one case exceeded Jest's per-test limit only under contention. | No production change. Treat as test-runner stability issue; CI should use bounded workers or isolate timer-heavy suites. | `server/tests/game/adeptAFK.test.ts`, Jest invocation | Targeted serial run PASS (6/6, 21.37s). |
| QA-008 | P2 | Localization coverage | Relaunch authorization lists 10 languages, but the active unified locale registry currently ships only English, Thai, and Simplified Chinese. | Remaining locale dictionaries have not been integrated into `client/src/i18n`. | Unresolved; generating production translations during a QA pass is unsafe. | `client/src/i18n/index.ts`, `client/src/i18n/locales/*` | `check:i18n` PASS for all 101 keys in the 3 registered locales; missing 7 authorized locales confirmed by registry inspection. |
| QA-009 | P3 | Test/log hygiene | Expected failure-path tests emit many `console.error`/economy logs, obscuring actionable warnings. | Runtime logging is not suppressed or asserted by test harnesses. | Reported only; changing balance/debug logs was outside safe QA cleanup. | Examples: `server/src/game/gameLoop.ts`, `server/src/game/tierUnlockService.ts` | Observed during full and targeted Jest runs. |
| QA-010 | P3 | Static tooling | No repository lint script/config is available for the client or server. | Project currently relies on TypeScript, tests, Expo Doctor, and export diagnostics. | Reported; introducing a lint policy would be a broader tooling decision. | `client/package.json`, `server/package.json` | Script inventory inspected. |
| QA-011 | P2 | Android layout verification | Small/large Android overlap and clipping cannot be conclusively certified without device/emulator screenshots and interaction runs. | Current environment provided build/static diagnostics but no configured Android device matrix. | Open release check. No speculative layout changes made. | Cross-cutting client UI | TypeScript/Expo export pass; physical matrix remains required. |

## Coverage observations

- Card/deck integrity is covered by standard deck, Arena deal, AI arrangement, VIP Plus deck guard, and duplicate-card tests. Existing tests explicitly assert 52-card uniqueness, deterministic seeded shuffle/deal, and no duplicate cards in Minion/Elite/Boss arrangements.
- Evaluator coverage includes standard hand evaluation, Best 5/7, Tier C Best Five, foul ordering, Arena comparison, Monarch, and Rise Super Combo suites.
- Item coverage includes phase eligibility, protocol/idempotency, inventory consumption, Undo, Swap, Shuffle, Double Pile, Freeze, Auto Sort, and ad navigation. The Rise transition regression additionally covers 1-for-1 ownership and duplicate prevention.
- Rewarded ads return `earned: false` for unavailable/load/show/early-close paths. The client contacts the reward endpoint only after `ad.earned`, while the server reward routes enforce authorization/cooldown/idempotent state. Forced-ad navigation occurs at natural breaks and is not part of score settlement.
- VIP gates use authenticated server profile authority for restricted tables; client flags are not accepted as authority in the inspected socket routes.
- Economy coverage includes escrow atomicity, centralized economy service, token flow, Rise Duel settlement, Arena settlement/idempotency, High Noble, Mastermind, Adept, Monarch, VIP Plus, streaks, and rewards.

## Checks executed

| Check | Result |
|---|---|
| Server TypeScript build (`npm run build`) | PASS |
| Client TypeScript (`tsc --noEmit`) | PASS |
| Client i18n validator (`npm run check:i18n`) | PASS — 101 keys, 3 registered locales |
| Expo Doctor (`npx expo-doctor --verbose`) | PASS — 21/21 |
| Expo web export (`npm run export:launch`) | PASS — bundle/routes/assets emitted to `launch-preview` |
| Focused Rise Duel + Super Combo regression | PASS — 43/43 |
| Language persistence regression | PASS — 1/1 |
| Adept AFK targeted serial regression | PASS — 6/6 |
| Full Jest run (125 suites) | INCOMPLETE — bounded 2-worker rerun reported PASS across all completed suites with no failure, including previously failing `hnSnapshot` and `adeptAFK`; two long-running Arena workers did not terminate in practical time and the run was stopped. `hnGracePeriod` was excluded from this pass and passed separately. |
| Lint | NOT AVAILABLE — no lint script/config |
| Physical Android size matrix | NOT RUN — device/emulator unavailable |

## Bugs fixed in this audit cycle

1. Rise legacy result-payload crash.
2. Rise Buy/Swap and Skip transition crash/freeze.
3. Rise next-Duel score presentation leaking cumulative score.
4. Expo dynamic config composition causing Doctor failure.
5. Stale language-store regression test after storage-key/locale migration.

## Unresolved and release checks

1. Add the seven approved but currently absent locales, with reviewed translations (QA-008).
2. Isolate or optimize the very long Arena simulation suites, then obtain one clean terminating 125-suite run.
3. Run Android device/emulator smoke tests at small phone, common 16:9/20:9 phone, and large/tablet widths; capture launch -> gameplay -> result -> reward -> next level/lobby for Free and VIP.
4. Review test logging policy so genuine warnings are visible without removing required economy balance diagnostics.

## Canon decisions required from owner

- None from this change. High Noble now follows the confirmed hidden-information Canon.
