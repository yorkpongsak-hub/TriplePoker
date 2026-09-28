# TriplePoker Android 1.0 RC1 migration inventory

Audit date: 2026-09-28

Staging verification update: 2026-09-29

- The linked Staging migration ledger records only `005` and `006`. This ledger cannot be used by itself to decide which repository migrations should run: read-only schema inspection confirms that most later objects were applied manually without corresponding migration-history rows.
- Never use a blind `supabase db push` against this project. It could attempt to replay historical files, including the prohibited manual-only `031` reset.
- Read-only table, index and PostgREST OpenAPI inspection confirms the tables, columns and callable RPC signatures expected by `071`-`074` and `076`-`086` are present, subject to the trigger-only exception below.
- `sync_tier_d_freeze_durations()` is intentionally absent from PostgREST RPC discovery because it returns `trigger`; the `tier_d_item_inventory.freeze_durations` column is present.
- One confirmed Staging schema defect remains: `public.tier_d_item_reward_weights` from migration `075` is absent (`PGRST205`), while `grant_tier_d_level_random_item` is present and references it. Apply only the reviewed additive `075` repair (or its exact missing table/seed subset), verify the six configured rows and exercise the Level reward RPC with a disposable QA account before clearing this blocker.

## Repository inventory

- The repository contains one continuous sequence of 87 SQL files, `001` through `087`, with no missing or duplicate numbers.
- `031_economy_clean_reset.sql` is a historical, manual-only destructive reset. It must never be replayed as part of a routine staging or production deployment.
- Arena/Sovereign migrations `015`-`020`, VIP Plus migration `024`, and VIP Private Crew migration `087` remain preserved. Their features are outside Android 1.0 and stay disabled; this is not authorization to remove their schema or data.

Run `npm run check:migrations` in `server` before every RC build. The command validates numbering, names, unexpected destructive SQL, and prints the latest file hash.

## Deployment evidence

| Range | Repository | Deployment evidence available locally | Android 1.0 action |
|---|---|---|---|
| `001`-`014` | Present | Earlier project/runbook history only; no live schema query was available for this audit | Compare against the staging migration ledger before release |
| `015`-`020` | Present | Owner-confirmed applied in Arena handoff records | Preserve; Arena and Sovereign remain disabled |
| `021`-`070` | Present | Mixed historical notes; no authoritative current database ledger available locally | Compare against staging; do not infer applied state from source files |
| `071` | Present | Owner-confirmed applied in relaunch record | Verify function/trigger signatures on staging |
| `072`-`073` | Present | Owner-confirmed applied on 2026-09-16 | Verify receipts and RPC signatures on staging |
| `074`-`086` | Present | No owner-confirmed apply evidence found locally | Required staging apply/verification sequence for Android 1.0 core Tier D features |
| `087` | Present | No apply evidence found locally | Deferred with VIP Private Crew; do not require for Android 1.0 |

## Release gate

Before production deployment, export or query the Supabase migration ledger and compare it with this repository. Apply only confirmed missing additive migrations in numerical order. Never execute `031` during this process, never reset production data, and stop on any schema mismatch rather than guessing.
