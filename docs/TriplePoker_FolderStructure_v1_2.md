# TriplePoker — Folder Structure Reference
> The Sage Unicorn Studio Co., Ltd.
> Founder & Chief Architect: Assistant Professor Pongnathee Maneekul
> Updated: May 2026 (v1.2)
 
---
 
## 📁 โครงสร้างโปรเจกต์ทั้งหมด
 
```
TriplePoker/
│
├── server/                              ← Backend
│   ├── src/
│   │   ├── config/
│   │   │   ├── gameConfig.ts            ✅ Sprint 2
│   │   │   ├── redis.ts                 ✅ Sprint 2
│   │   │   ├── seasonConfig.ts          ✅ Sprint 2
│   │   │   └── supabase.ts              ✅ Sprint 1
│   │   │
│   │   ├── game/
│   │   │   ├── deck.ts                  ✅ Sprint 3
│   │   │   ├── cardEngine.ts            ✅ Sprint 3
│   │   │   ├── handEvaluator.ts         ✅ Sprint 3
│   │   │   ├── foulChecker.ts           ✅ Sprint 3
│   │   │   ├── gameRoom.ts              ✅ Sprint 3
│   │   │   ├── pileResolution.ts        ✅ Sprint 4
│   │   │   ├── blindAuction.ts          ✅ Sprint 4
│   │   │   ├── grandFinale.ts           ✅ Sprint 4
│   │   │   └── endOfMatch.ts            ✅ Sprint 4
│   │   │
│   │   ├── ai/                          ⬜ Sprint 5
│   │   │   ├── minionAI.ts
│   │   │   ├── eliteAI.ts
│   │   │   ├── bossAI.ts
│   │   │   ├── lastBossAI.ts
│   │   │   └── aiFillSystem.ts
│   │   │
│   │   ├── items/                       ⬜ Sprint 6
│   │   │   ├── itemPhaseController.ts
│   │   │   ├── allianceOfFate.ts
│   │   │   ├── shopAPI.ts
│   │   │   └── lootBox.ts
│   │   │
│   │   ├── retention/                   ⬜ Sprint 7
│   │   │   ├── streakSystem.ts
│   │   │   ├── dailyLogin.ts
│   │   │   └── milestoneReward.ts
│   │   │
│   │   ├── progression/                 ⬜ Sprint 8
│   │   │   ├── xpSystem.ts
│   │   │   ├── levelSystem.ts
│   │   │   └── lastBossSystem.ts
│   │   │
│   │   ├── social/                      ⬜ Sprint 9
│   │   │   ├── activityLog.ts
│   │   │   └── followSystem.ts
│   │   │
│   │   ├── models/
│   │   │   ├── user.ts                  ✅ Sprint 1
│   │   │   └── token.ts                 ✅ Sprint 2
│   │   │
│   │   ├── routes/
│   │   │   ├── auth.ts                  ✅ Sprint 1
│   │   │   ├── user.ts                  ✅ Sprint 4
│   │   │   └── shop.ts                  ⬜ Sprint 6
│   │   │
│   │   ├── sockets/
│   │   │   └── gameSocket.ts            ✅ Sprint 3+4
│   │   │
│   │   └── index.ts                     ✅ Sprint 3
│   │
│   ├── tests/
│   │   ├── game/
│   │   │   ├── handEvaluator.test.ts    ✅ Sprint 3
│   │   │   ├── foulChecker.test.ts      ✅ Sprint 3
│   │   │   └── pileResolution.test.ts   ✅ Sprint 4
│   │   └── auction/
│   │       └── blindAuction.test.ts     ✅ Sprint 4
│   │
│   ├── package.json                     ✅
│   ├── tsconfig.json                    ✅
│   └── .env                             ✅
│
├── client/                              ← Frontend
│   ├── src/
│   │   ├── screens/
│   │   │   └── GameTable.tsx            ✅ Sprint 3
│   │   │
│   │   ├── components/
│   │   │   ├── game/
│   │   │   │   ├── Card.tsx             ✅ Sprint 3
│   │   │   │   ├── ArrangementPhase.tsx ✅ Sprint 3
│   │   │   │   ├── PileReveal.tsx       ✅ Sprint 4
│   │   │   │   ├── FogOfWar.tsx         ✅ Sprint 4
│   │   │   │   ├── PreAuctionScore.tsx  ✅ Sprint 4
│   │   │   │   ├── AuctionOverlay.tsx   ✅ Sprint 4
│   │   │   │   ├── DiscardPhase.tsx     ✅ Sprint 4
│   │   │   │   ├── GrandFinale.tsx      ✅ Sprint 4
│   │   │   │   └── EndOfMatch.tsx       ✅ Sprint 4
│   │   │   │
│   │   │   ├── ai/                      ⬜ Sprint 5
│   │   │   │   ├── AIThinking.tsx
│   │   │   │   └── AIFeedback.tsx
│   │   │   │
│   │   │   ├── hud/                     ⬜ Sprint 6
│   │   │   │   ├── CompetitiveItems.tsx
│   │   │   │   └── FunItems.tsx
│   │   │   │
│   │   │   ├── shop/                    ⬜ Sprint 6
│   │   │   │   ├── ShopScreen.tsx
│   │   │   │   ├── LootBoxReveal.tsx
│   │   │   │   └── TokenPackage.tsx
│   │   │   │
│   │   │   ├── retention/               ⬜ Sprint 7
│   │   │   │   ├── StreakUI.tsx
│   │   │   │   ├── MilestonePopup.tsx
│   │   │   │   └── RewardedAd.tsx
│   │   │   │
│   │   │   ├── progression/             ⬜ Sprint 8
│   │   │   │   ├── XPBar.tsx
│   │   │   │   ├── AchievementPopup.tsx
│   │   │   │   ├── LastBossEncounter.tsx
│   │   │   │   └── HallOfBosses.tsx
│   │   │   │
│   │   │   └── social/                  ⬜ Sprint 9
│   │   │       ├── ActivityFeed.tsx
│   │   │       └── Onboarding.tsx
│   │   │
│   │   ├── navigation/
│   │   │   └── AppNavigator.tsx         ✅ Sprint 3
│   │   │
│   │   ├── store/                       ✅ Sprint 4
│   │   │   ├── gameStore.ts
│   │   │   ├── userStore.ts
│   │   │   └── socketStore.ts
│   │   │
│   │   ├── hooks/                       ✅ Sprint 4
│   │   │   ├── useSocket.ts
│   │   │   ├── useGameState.ts
│   │   │   └── useTimer.ts
│   │   │
│   │   ├── services/                    ✅ Sprint 4
│   │   │   ├── socketService.ts
│   │   │   ├── apiService.ts
│   │   │   └── supabaseService.ts
│   │   │
│   │   ├── constants/                   ✅ Sprint 4
│   │   │   └── gameConstants.ts
│   │   │
│   │   └── types/                       ✅ Sprint 4
│   │       ├── game.types.ts
│   │       ├── socket.types.ts
│   │       └── api.types.ts
│   │
│   ├── assets/
│   │   ├── cards/                       ⬜ Sprint 6
│   │   ├── sounds/                      ⬜ Sprint 6
│   │   └── animations/                  ⬜ Sprint 6
│   │
│   ├── app.json                         ✅
│   └── package.json                     ✅
│
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql       ✅ Sprint 1
```
 
---
 
## Sprint → File Mapping
 
| Sprint | สถานะ | Backend | Frontend |
|--------|--------|---------|----------|
| Phase 0 | ✅ | โครงสร้าง + WSL2 | — |
| Sprint 1 | ✅ | supabase.ts, auth.ts, user.ts (model), 001_initial_schema.sql | — |
| Sprint 2 | ✅ | gameConfig.ts, redis.ts, seasonConfig.ts, token.ts | — |
| Sprint 3 | ✅ | deck.ts, cardEngine.ts, handEvaluator.ts, foulChecker.ts, gameRoom.ts, gameSocket.ts, handEvaluator.test.ts, foulChecker.test.ts | AppNavigator.tsx, GameTable.tsx, Card.tsx, ArrangementPhase.tsx |
| Sprint 4 | ✅ | pileResolution.ts, blindAuction.ts, grandFinale.ts, endOfMatch.ts, user.ts (route), gameSocket.ts (update), pileResolution.test.ts, blindAuction.test.ts | PileReveal.tsx, FogOfWar.tsx, PreAuctionScore.tsx, AuctionOverlay.tsx, DiscardPhase.tsx, GrandFinale.tsx, EndOfMatch.tsx, store/, hooks/, services/, constants/, types/ |
| Sprint 5 | ⬜ | minionAI.ts, eliteAI.ts, bossAI.ts, lastBossAI.ts, aiFillSystem.ts | AIThinking.tsx, AIFeedback.tsx |
| Sprint 6 | ⬜ | itemPhaseController.ts, allianceOfFate.ts, shopAPI.ts, lootBox.ts, shop.ts (route) | CompetitiveItems.tsx, FunItems.tsx, ShopScreen.tsx, LootBoxReveal.tsx, TokenPackage.tsx |
| Sprint 7 | ⬜ | streakSystem.ts, dailyLogin.ts, milestoneReward.ts | StreakUI.tsx, MilestonePopup.tsx, RewardedAd.tsx |
| Sprint 8 | ⬜ | xpSystem.ts, levelSystem.ts, lastBossSystem.ts | XPBar.tsx, AchievementPopup.tsx, LastBossEncounter.tsx, HallOfBosses.tsx |
| Sprint 9 | ⬜ | activityLog.ts, followSystem.ts | ActivityFeed.tsx, Onboarding.tsx |
| Sprint 10 | ⬜ | — | Firebase Analytics + Crashlytics + Performance |
 
---
 
## คำสั่งรัน
 
```bash
# Backend (WSL Terminal 1)
cd /mnt/c/Users/psm_y/OneDrive/เอกสาร/TriplePoker/server
npm run dev
 
# Frontend (WSL Terminal 2)
cd /mnt/c/Users/psm_y/OneDrive/เอกสาร/TriplePoker/client
npx expo start
```
 
---
 
*TriplePoker Folder Structure Reference v1.2 — The Sage Unicorn Studio Co., Ltd.*
*อัพเดทไฟล์นี้ทุกครั้งที่เพิ่ม module ใหม่*