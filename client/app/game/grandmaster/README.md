# Grandmaster table

This directory is the isolated client home for Tier S. It must not patch or
share a route with completed Tier C-A+ tables.

- UX reference: Tier A/A+
- Table skin: Monarch boss table
- Hand layout: fan for all seats; opponents remain card backs
- Gate 8: interactive snapshot-driven table and boss presentation
- Gate 9: authenticated `/arena` transport, queue entry, action IDs and reconnect resume

Production keeps the Arena namespace closed unless `ARENA_ENABLED=true`.

The Tier S+ event hub lives at `/game/sovereign`. It is reachable from the
Grandmaster lobby and uses authenticated Sovereign HTTP runtime endpoints for
status, confirmation, check-in, standby, delayed public feed, archive, and the
mandatory post-conquest rename. Production remains closed unless
`SOVEREIGN_ENABLED=true`.
