# TriplePoker: Rise — VIP Plus 5-Player Gate 1 Access Record v1.0

**Status:** Complete locally  
**Date:** 2026-08-03  
**Production feature flag:** Disabled by default

## Delivered

- Added the dedicated `VIP_PLUS_5P_ENABLED` server feature flag. Only the exact string `true` enables access.
- Added a central fail-closed VIP Plus access policy using the existing authoritative `vip_status === 'vip_pro'` membership.
- Added reusable server guards for later create/join, confirmation, and match-start enforcement.
- Changed the Lobby subscription to verify the Supabase access token and require the authenticated user ID to match the requested user ID.
- Added a sanitized Lobby projection that exposes only `visible: true|false`, without membership details or denial reasons.
- Added a VIP Plus five-player Lobby entry that is rendered only when the server projection permits it.
- Kept the entry non-operational until the table creation/matchmaking gates are implemented.

## Security Contract

- Client profile state and client-supplied user IDs are not access authority.
- `none` and ordinary `vip` memberships cannot see the entry.
- Missing, invalid, mismatched, or expired sessions fail closed.
- A `vip_pro` membership still cannot see or enter the feature while the server flag is disabled.
- The central guard returns a not-found boundary for a disabled feature and a forbidden boundary for insufficient membership when used by later transports.

## Verification

- VIP Plus focused tests: 5/5 passed.
- Server TypeScript build: passed.
- Client TypeScript check: passed.
- `git diff --check`: passed.

## Gate Boundary

Gate 1 does not create five-seat rooms, perform Buy-in checks, start matches, or implement gameplay. The visible Lobby entry currently reports `Coming Soon`; Gate 3 will replace that action after authoritative table creation and matchmaking exist.

