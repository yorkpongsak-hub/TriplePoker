# TriplePoker relaunch authorization

The owner authorized the Three Piles relaunch on 2026-09-05 and asked the agent
to continue independently while they sleep. For this work, implement and test
routine design and code decisions without asking for confirmation. This explicit
authorization supersedes the older confirm-before-edit wording in CLAUDE.md.

Scope: back up the original work, make the three-hand points-and-seal solo game
the launch experience, preserve advanced tables for later learning, and verify
the implementation. Keep UI text in English and communicate with the owner in
Thai. The owner additionally approved localization of the learning experience into
Thai, English, Simplified Chinese, Japanese, Korean, Vietnamese, Indonesian,
Spanish, Portuguese and French on 2026-09-06. This overrides English-only UI for
the launch/practice/table-learning/results/quiz screens; advanced tables remain English.
Do not silently remove old economy data or source files. Keep backups out
of Git. Record decisions and remaining release checks in docs/RELAUNCH_2026-09-05.md.

## Launch schedule guard

The current target is an Android Version 1.0 launch in late October 2026. When
the owner requests any new feature or material scope expansion before launch,
first assess its impact on the release critical path (RC stability, automated
regression, Android device QA, migrations, privacy/ads compliance, store assets,
and submission lead time). If it could delay or materially increase risk to the
late-October launch, explicitly warn the owner in Thai before implementation,
state the likely schedule/risk impact, and recommend deferring it to a post-1.0
release or substituting a smaller launch-safe version. Do not treat this warning
rule as a blanket prohibition: proceed when the owner confirms the tradeoff or
when the request is necessary to fix a launch blocker, security issue, data-loss
risk, policy violation, or correctness defect.

This authorization does not bypass tool sandbox approvals or authorize purchases,
database resets, app-store publication, or messages to third parties. No subagents
are requested for this task.

## Expo development host

When hosting the Expo development client for a physical phone, run Metro from
Windows PowerShell in `C:\Dev\TriplePoker\client` with:

`npx expo start --dev-client --lan --clear`

Do not default to launching the Expo host from WSL. The Windows LAN host is the
owner-confirmed faster and more reliable workflow for this project.
