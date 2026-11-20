# Android Google Test Ads checklist

Build the native development client (Expo Go cannot load this SDK):

`cd client && npx eas build --platform android --profile development`

For a staging server that should accept Google test callbacks, set only there:
`AD_PROVIDER_MODE=google_test`. This is not production verification. Production
remains fail-closed until AdMob SSV is deployed and explicitly enabled.

- Free Daily Streak: complete a Google test Rewarded ad; claim once; reopen and reconnect cannot add again.
- Close/load-fail Rewarded: Daily Streak remains claimable, no item/token is added.
- Tier D random item: complete test Rewarded ad; verify one server-random inventory change and idempotent receipt.
- Token Rescue: verify eligibility/cooldown before showing the ad, then one authoritative token grant.
- Forced Interstitial: Free only, after five-minute policy interval, at Level-complete or Lose-to-Retry only; no ready ad means immediate continue.
- Rewarded grace: after a successful Rewarded callback, no forced ad for three minutes.
- VIP Pro and Pro Plus: no forced Interstitial; Pro Plus remains excluded from Rewarded routes.
- Lifecycle: background/return while an ad is visible, reconnect, app restart and activity recreation must not duplicate a callback or navigate twice.

Do not use production Ad Unit IDs or click live ads during this phase.
