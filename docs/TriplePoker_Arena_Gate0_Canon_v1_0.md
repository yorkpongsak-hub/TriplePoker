# TriplePoker: Rise - Arena Gate 0 Canon v1.0

**Status:** Locked for Gate 0-2 development
**Date:** 2026-08-01
**Primary source:** `TriplePoker_Rise_Tier_S_SPlus_Development_Spec.md`

## 1. Canon precedence

For Tier S and Tier S+ development, the consolidated Rise specification is the
authoritative gameplay source. Older names such as `Last Boss` remain legacy
database/code vocabulary only until a later compatibility migration.

| Public tier | Internal key | Meaning |
|---|---|---|
| S - Grandmaster | `grandmaster` | Highest permanent tier and Arena table |
| S+ - Sovereign | `sovereign` | Monthly, expiring eligibility for a special match |

## 2. Tier S entry

- Tier S unlock is exclusive: `token_balance > 1_000_000`.
- There is no account-age, Sentinel, Monarch-victory, Ascendant, or Arena Pass
  requirement in the new Tier S room.
- Legacy Ascendant/Arena Pass code is retained for backward compatibility but
  must not be called by the new `server/src/arena` namespace.
- The new room is protected by a feature flag until Gate 9.

## 3. Currency canon and compatibility

- Earned Crown is the existing `users.crown_balance`; Crown Package remains a
  separate cosmetic-only balance and can never fund a match.
- `1 Crown = 12 Crest`; all Arena calculations use integer Crest.
- To avoid changing completed tiers and the existing Crown Vault, whole Crown
  remains in `crown_balance` and Arena adds `crown_crest_remainder` in `0..11`.
- Canonical Arena balance is:

  `availableCrest = crown_balance * 12 + crown_crest_remainder`

- Existing whole-Crown credits/debits remain compatible. Arena mutations must
  use the Arena ledger RPC so fractional amounts and audit records stay atomic.

## 4. Isolation rules

- New server work lives under `server/src/arena/`.
- The new client table lives under `client/app/game/grandmaster/`.
- No dynamic `[tier]` route is introduced.
- Tier C through A+ game files are not imported into or patched for Gate 0-2.
- Reuse is allowed only through stable shared utilities or explicit adapters.

## 5. UI direction recorded for later gates

- Tier A/A+ interaction flow is the UX reference.
- Tier S uses the Monarch boss table skin.
- Every seat renders its hand as a fan; opponents show card backs only.
- This direction is recorded now but implemented in Gate 8.

## 6. Pending S+ values

The monthly winner count, ranking tie-break, special-match format, rewards,
exact boss distribution, dialogue scripts, and numeric AI difficulty remain
configuration placeholders. They are not blockers for Gate 0-10.

## 7. Gate 0 exit decision

This document resolves naming, entry, currency precision, legacy compatibility,
folder isolation, and source precedence for implementation.

## 8. Gate 4 legal composition amendment (2026-08-01)

- Every Arena table must contain at least one server-controlled AI.
- A regular queue accepts at most three human players.
- Seat P3 is always a Boss or Four Gods AI.
- If the encounter roll misses, P3 uses Reaper, Crag, Cortex, or Cipher.
- With two queued humans, the remaining seat is filled by an Arena Minion; this
  composition also permits the rare Monarch + Soren dual encounter.
- A four-human Arena table is prohibited.
