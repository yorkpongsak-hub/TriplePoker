// playerStore.test.ts
// เทส hydration 4 เคส (new/ok/error/migrate) + pure helper functions ของ playerStore.ts
//
// ใช้ official jest mock ของ @react-native-async-storage/async-storage แล้ว resetModules()
// ก่อนทุกเคส เพื่อให้ store/AsyncStorage เป็นของใหม่สะอาดทุกครั้ง (persist hydrate() ทำงานตอน
// import module ครั้งแรกเท่านั้น — ต้อง import ใหม่ทุกเคสถึงจะได้ hydration cycle ใหม่)

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

import {
  createDefaultProfile,
  computeStreakOnPlay,
  rollDailyPs,
  migrateProfile,
  todayLocalDateString,
  CURRENT_SCHEMA_VERSION,
  type StreakState,
} from './playerStore'

const STORAGE_KEY = 'triplepoker.player.v1'

// ใช้ flag ภายใน _hydrating แทน zustand persist's hasHydrated()/onFinishHydration ตรงๆ เพราะตัวหลัง
// ไม่ถูกยิงเลยเมื่อ hydrate() พัง (ดูคอมเมนต์ onRehydrateStorage ใน playerStore.ts) — รอ error ไม่ได้ถ้าใช้ตัวนั้น
async function waitForHydration(store: typeof import('./playerStore').usePlayerStore) {
  if (!store.getState()._hydrating) return
  await new Promise<void>((resolve) => {
    const unsub = store.subscribe((s) => {
      if (!s._hydrating) {
        unsub()
        resolve()
      }
    })
  })
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

describe('todayLocalDateString', () => {
  test('format เป็น YYYY-MM-DD ตาม local time ของ Date ที่ส่งเข้ามา', () => {
    expect(todayLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05') // เดือน 0 = ม.ค.
    expect(todayLocalDateString(new Date(2026, 10, 23))).toBe('2026-11-23')
  })
})

describe('computeStreakOnPlay', () => {
  const base: StreakState = { streakCount: 3, bestStreakCount: 5, lastPlayedDate: '2026-11-20', claimedMilestone: 0 }

  test('เล่นวันเดิมซ้ำ ไม่นับเพิ่ม', () => {
    expect(computeStreakOnPlay(base, '2026-11-20')).toEqual(base)
  })

  test('เล่นต่อเนื่องวันถัดไป ต่อ streak', () => {
    const next = computeStreakOnPlay(base, '2026-11-21')
    expect(next.streakCount).toBe(4)
    expect(next.bestStreakCount).toBe(5)
    expect(next.lastPlayedDate).toBe('2026-11-21')
  })

  test('ขาดเล่นเกิน 1 วัน รีเซ็ต streak เหลือ 1', () => {
    const next = computeStreakOnPlay(base, '2026-11-25')
    expect(next.streakCount).toBe(1)
    expect(next.bestStreakCount).toBe(5) // best ไม่ลด
  })

  test('ไม่เคยเล่นมาก่อน (lastPlayedDate=null) เริ่มที่ 1', () => {
    const fresh: StreakState = { streakCount: 0, bestStreakCount: 0, lastPlayedDate: null, claimedMilestone: 0 }
    const next = computeStreakOnPlay(fresh, '2026-11-20')
    expect(next.streakCount).toBe(1)
    expect(next.bestStreakCount).toBe(1)
  })
})

describe('rollDailyPs', () => {
  test('วันเดิม บวกสะสม', () => {
    expect(rollDailyPs({ date: '2026-11-20', value: 10 }, 5, '2026-11-20')).toEqual({ date: '2026-11-20', value: 15 })
  })
  test('ข้ามวัน เริ่มนับใหม่', () => {
    expect(rollDailyPs({ date: '2026-11-20', value: 10 }, 5, '2026-11-21')).toEqual({ date: '2026-11-21', value: 5 })
  })
})

describe('migrateProfile', () => {
  test('migrate จาก version 0 (ไม่มี dailyPs/streak/ad/tierDSolo) เติม default ให้ครบ', () => {
    const old = { displayName: 'Old Name', tokens: 500, handsPlayed: 12 }
    const migrated = migrateProfile(old, 0)
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrated.displayName).toBe('Old Name')
    expect(migrated.tokens).toBe(500)
    expect(migrated.handsPlayed).toBe(12)
    expect(migrated.dailyPs.value).toBe(0)
    expect(migrated.streak.streakCount).toBe(0)
    expect(migrated.ad.handsSinceInstall).toBe(0)
    expect(migrated.tierDSolo).toEqual({
      level: 1,
      items: { shuffle: 0, swap: 0, double_pile: 0, freeze: 0, auto_sort: 0, undo: 0 },
      bestMatchTimeMs: null, currentWinStreak: 0, bestWinStreak: 0, bestMatchScore: 0, milestonesClaimed: [],
    })
  })

  test('migrate จาก shape ว่างเปล่าสนิท (undefined) ไม่ throw ได้ default ล้วน', () => {
    const migrated = migrateProfile(undefined, 0)
    expect(migrated).toEqual(createDefaultProfile(migrated.dailyPs.date))
  })

  test('migrate จาก version 1 (มี dailyPs/streak/ad จริงแล้ว แต่ไม่มี tierDSolo) ต้องรักษาของเดิมไว้ ไม่รีเซ็ต', () => {
    const v1Profile = {
      schemaVersion: 1, displayName: 'Real Player', avatarId: 'preset_3', tokens: 7_500, careerPs: 42,
      dailyPs: { date: '2026-11-22', value: 10 },
      streak: { streakCount: 9, bestStreakCount: 12, lastPlayedDate: '2026-11-22', claimedMilestone: 7 },
      handsPlayed: 300,
      ad: { handsSinceInstall: 300, lastInterstitialAt: 1234567890 },
    }
    const migrated = migrateProfile(v1Profile, 1)
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrated.displayName).toBe('Real Player')
    expect(migrated.tokens).toBe(7_500)
    expect(migrated.dailyPs).toEqual({ date: '2026-11-22', value: 10 }) // ต้องไม่ถูกรีเซ็ต
    expect(migrated.streak).toEqual(v1Profile.streak) // ต้องไม่ถูกรีเซ็ต
    expect(migrated.ad).toEqual(v1Profile.ad)
    expect(migrated.tierDSolo.level).toBe(1) // field ใหม่ล้วน ไม่เคยมีมาก่อนจริงๆ
  })

  test('fromVersion >= CURRENT_SCHEMA_VERSION (ดาวน์เกรด) ต้อง throw ไม่เดาข้อมูล', () => {
    expect(() => migrateProfile({}, CURRENT_SCHEMA_VERSION + 1)).toThrow()
  })
})

// ─── Hydration ของ store จริง ผ่าน AsyncStorage mock ────────────────────────

describe('usePlayerStore hydration', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  test('new: ไม่มีข้อมูลใน AsyncStorage เลย → status=new, profile เป็น default', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage')
    await AsyncStorage.clear()
    const { usePlayerStore } = require('./playerStore')
    await waitForHydration(usePlayerStore)
    const state = usePlayerStore.getState()
    expect(state.status).toBe('new')
    expect(state.profile).not.toBeNull()
    expect(state.profile?.tokens).toBe(0)
    expect(state.profile?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  test('ok: มีข้อมูล schema ปัจจุบันที่ถูกต้องอยู่แล้ว → status=ok, โหลดค่าเดิมมาตรงๆ', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage')
    const profile = createDefaultProfile('2026-11-20')
    profile.tokens = 4_200
    profile.displayName = 'Yoke'
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { profile }, version: CURRENT_SCHEMA_VERSION }))
    const { usePlayerStore } = require('./playerStore')
    await waitForHydration(usePlayerStore)
    const state = usePlayerStore.getState()
    expect(state.status).toBe('ok')
    expect(state.profile?.tokens).toBe(4_200)
    expect(state.profile?.displayName).toBe('Yoke')
  })

  test('error: ข้อมูลเป็น JSON เพี้ยน → status=error, profile=null, ห้ามเขียนทับของเดิม', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage')
    const corruptRaw = '{not valid json'
    await AsyncStorage.setItem(STORAGE_KEY, corruptRaw)
    const { usePlayerStore } = require('./playerStore')
    await waitForHydration(usePlayerStore)
    const state = usePlayerStore.getState()
    expect(state.status).toBe('error')
    expect(state.profile).toBeNull()
    // ต้องไม่ถูกเขียนทับด้วยค่า default ใดๆ ทั้งสิ้น
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(corruptRaw)
  })

  test('error: shape ไม่ตรง (version ตรงปัจจุบันแต่ profile ขาด field) → status=error', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage')
    const raw = JSON.stringify({ state: { profile: { tokens: 10 } }, version: CURRENT_SCHEMA_VERSION })
    await AsyncStorage.setItem(STORAGE_KEY, raw)
    const { usePlayerStore } = require('./playerStore')
    await waitForHydration(usePlayerStore)
    expect(usePlayerStore.getState().status).toBe('error')
    expect(usePlayerStore.getState().profile).toBeNull()
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(raw)
  })

  test('migrate: schemaVersion เก่า (0) ถูก migrate อัตโนมัติตอน hydrate → status=ok, schemaVersion ใหม่', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage')
    const oldProfile = { displayName: 'Legacy Player', tokens: 999 }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { profile: oldProfile }, version: 0 }))
    const { usePlayerStore } = require('./playerStore')
    await waitForHydration(usePlayerStore)
    const state = usePlayerStore.getState()
    expect(state.status).toBe('ok')
    expect(state.profile?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(state.profile?.displayName).toBe('Legacy Player')
    expect(state.profile?.tokens).toBe(999)
    expect(state.profile?.dailyPs).toBeDefined()
  })

  test('actions ไม่ทำงานเมื่อ status=error (กันเขียนทับข้อมูลที่ยังกู้ไม่ได้)', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage')
    await AsyncStorage.setItem(STORAGE_KEY, '{broken')
    const { usePlayerStore } = require('./playerStore')
    await waitForHydration(usePlayerStore)
    usePlayerStore.getState().addTokens(100)
    usePlayerStore.getState().setDisplayName('Should Not Apply')
    expect(usePlayerStore.getState().profile).toBeNull()
  })

  test('spendTokens ปฏิเสธเมื่อเงินไม่พอ ไม่ทำให้ tokens ติดลบ', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage')
    await AsyncStorage.clear()
    const { usePlayerStore } = require('./playerStore')
    await waitForHydration(usePlayerStore)
    usePlayerStore.getState().addTokens(50)
    const ok = usePlayerStore.getState().spendTokens(100)
    expect(ok).toBe(false)
    expect(usePlayerStore.getState().profile?.tokens).toBe(50)
  })

  test('setTierDSoloProgress เขียนทับ level/streak ตรงๆ (ไม่มี business logic — ผู้เรียกต้องคำนวณมาเอง)', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage')
    await AsyncStorage.clear()
    const { usePlayerStore } = require('./playerStore')
    await waitForHydration(usePlayerStore)
    usePlayerStore.getState().setTierDSoloProgress({ level: 5, currentWinStreak: 2, bestWinStreak: 2 })
    expect(usePlayerStore.getState().profile?.tierDSolo).toMatchObject({ level: 5, currentWinStreak: 2, bestWinStreak: 2 })
    // เขียนทับได้ตรงๆ แม้จะดูเหมือน "ย้อนกลับ" เพราะ engine's applyTierDLevelOutcome() เป็นคนคุมว่าเลขถูกต้องแล้วก่อนเรียก
    usePlayerStore.getState().setTierDSoloProgress({ level: 3, currentWinStreak: 0, bestWinStreak: 2 })
    expect(usePlayerStore.getState().profile?.tierDSolo).toMatchObject({ level: 3, currentWinStreak: 0, bestWinStreak: 2 })
  })

  test('grantTierDItem/spendTierDItem คุมสต็อกถูกต้อง ใช้ไม่เกินของที่มี', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage')
    await AsyncStorage.clear()
    const { usePlayerStore } = require('./playerStore')
    await waitForHydration(usePlayerStore)
    expect(usePlayerStore.getState().spendTierDItem('shuffle')).toBe(false) // ยังไม่มีของเลย
    usePlayerStore.getState().grantTierDItem('shuffle', 2)
    expect(usePlayerStore.getState().profile?.tierDSolo.items.shuffle).toBe(2)
    expect(usePlayerStore.getState().spendTierDItem('shuffle')).toBe(true)
    expect(usePlayerStore.getState().profile?.tierDSolo.items.shuffle).toBe(1)
  })

  test('recordTierDLevelResult: เก็บ best เฉพาะตอนชนะ และ best ไม่มีวันแย่ลง (level/streak ไม่ใช่หน้าที่ฟังก์ชันนี้แล้ว)', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage')
    await AsyncStorage.clear()
    const { usePlayerStore } = require('./playerStore')
    await waitForHydration(usePlayerStore)
    usePlayerStore.getState().recordTierDLevelResult({ won: true, matchTimeMs: 90_000, matchScore: 10 })
    usePlayerStore.getState().recordTierDLevelResult({ won: true, matchTimeMs: 60_000, matchScore: 20 })
    let solo = usePlayerStore.getState().profile!.tierDSolo
    expect(solo.bestMatchTimeMs).toBe(60_000) // เร็วกว่า เก็บค่าที่ดีกว่า
    expect(solo.bestMatchScore).toBe(20)
    usePlayerStore.getState().recordTierDLevelResult({ won: false, matchTimeMs: 10_000, matchScore: 999 })
    solo = usePlayerStore.getState().profile!.tierDSolo
    expect(solo.bestMatchTimeMs).toBe(60_000) // แพ้ไม่นับแม้ตัวเลขจะดีกว่าเดิม
    expect(solo.bestMatchScore).toBe(20)
  })

  test('claimTierDMilestone แจก token ครั้งเดียวต่อ level เท่านั้น', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage')
    await AsyncStorage.clear()
    const { usePlayerStore } = require('./playerStore')
    await waitForHydration(usePlayerStore)
    expect(usePlayerStore.getState().claimTierDMilestone(250, 10_000)).toBe(true)
    expect(usePlayerStore.getState().profile?.tokens).toBe(10_000)
    expect(usePlayerStore.getState().claimTierDMilestone(250, 10_000)).toBe(false) // เคลมซ้ำ level เดิมไม่ได้
    expect(usePlayerStore.getState().profile?.tokens).toBe(10_000) // ไม่แจกซ้ำ
    expect(usePlayerStore.getState().claimTierDMilestone(500, 10_000)).toBe(true) // level ใหม่เคลมได้
    expect(usePlayerStore.getState().profile?.tokens).toBe(20_000)
  })
})
