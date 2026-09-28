# TriplePoker Android 1.0 RC1 migration inventory

Audit date: 2026-09-28

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
