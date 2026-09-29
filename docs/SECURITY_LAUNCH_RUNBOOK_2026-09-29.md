# TriplePoker Android 1.0 — Security launch runbook

## Release posture

- The root Socket.IO namespace requires a valid Supabase access token during the handshake.
- Every legacy packet that carries `userId` or `playerId` must match the authenticated socket owner. Packets targeting an active match must belong to that match.
- HTTP requests are limited per IP and route. Authentication, reward, claim, purchase, and ad-completion paths use the tighter bucket. Socket connections and packets have separate limits.
- HTTP bodies are limited to 64 KiB and Socket.IO messages to 32 KiB. Server request and connection timeouts are bounded.
- Browser CORS is allow-list based in production. React Native clients without an Origin header remain supported.
- Sovereign, VIP Plus 5-player, and VIP Private Crew server surfaces are fail-closed unless their exact environment flag is `true`.
- `/health/live` reports process liveness. `/health/ready` verifies the configured Supabase Data API before reporting ready.

## Required production environment

1. Copy the variable names from `server/.env.example`; never copy local values into Git, screenshots, chat, or logs.
2. Obtain the current Supabase **publishable** key for `SUPABASE_ANON_KEY` and the current **secret** key for `SUPABASE_SERVICE_ROLE_KEY` from Project Settings → API Keys.
3. Configure `ALLOWED_ORIGINS` with exact HTTPS origins only. Do not use `*`.
4. Keep `SOVEREIGN_ENABLED`, `VIP_PLUS_5P_ENABLED`, and `VIP_PRIVATE_CREW_ENABLED` false for Android 1.0 unless their separate release gates pass.
5. Put the API behind the hosting provider's edge rate limit/WAF. The in-process limiter is a bounded first line of defense, not a shared multi-instance quota.

## Staging finding requiring owner action

On 2026-09-29 the Supabase Management API confirmed that the checked-in-project-ref matches Staging, but the legacy JWT `anon` and `service_role` keys currently stored in local ignored `.env` files are rejected by the Data API as `Invalid API key`. The current publishable key can access `users` and receives an empty array under anonymous RLS, which is the desired data result. The current secret key is masked after creation and cannot be recovered by CLI.

Before the next server/device QA session, replace local and hosting secrets from the dashboard:

- client: current publishable key;
- server `SUPABASE_ANON_KEY`: current publishable key;
- server `SUPABASE_SERVICE_ROLE_KEY`: current secret key.

Do not paste the secret key into source code or commit it. Rotate it immediately if it is ever exposed.

## Pre-RC verification

- Confirm an unauthenticated Socket.IO root connection is rejected.
- Confirm a valid player cannot submit another player's `userId`/`playerId` or act in another room.
- Confirm Free/Pro/Pro Plus ad and Analysis behavior remains unchanged.
- Confirm Tier D, Initiate, Adept, Mastermind, and High Noble can connect, resume, settle, and leave on two physical devices.
- Exercise HTTP and socket limits from Staging and confirm `429`/`RATE_LIMITED` without process instability.
- Check `/health/live` and `/health/ready` through the production load balancer.
- Run Supabase Security Advisor and Performance Advisor, then run the read-only `supabase/audits/security_readonly.sql`. Inspect every public table for RLS and every `SECURITY DEFINER` function for explicit `search_path`, revoked `PUBLIC`/`anon`/`authenticated`, and the minimum required grant.
- Verify logs contain request IDs and error codes but no access tokens, API keys, PINs, cards, or private player payloads.
- Back up Staging, practice restore, and define an incident owner plus key-rotation procedure before submission.
