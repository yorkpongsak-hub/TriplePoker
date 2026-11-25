// tierDSoloLocalRuntime.test.ts
// เทส local runtime ของ Tier D Solo — ใช้ seeded PRNG (mulberry32) แทน Math.random ตรงๆ
// เพื่อให้ผลการเล่น (เด็ค/การตัดสินใจของ AI) reproducible ข้ามรอบรันเทส
//
// ทุกเคส resetModules() ก่อน แล้วเขียน AsyncStorage ก่อน require('./playerStore') ใหม่ (ตาม
// pattern เดียวกับ playerStore.test.ts) เพราะ hydrate() ของ zustand persist เริ่มทำงานทันทีตอน
// require module ครั้งแรก — ถ้า require ก่อนเขียนข้อมูล จะ hydrate จากของเก่า/ว่างเปล่าแทน
// ต้อง require('./tierDSoloLocalRuntime') ใหม่ในสโคปเดียวกันด้วยเสมอ ไม่งั้นมันจะถือ usePlayerStore
// instance เก่าจากรอบก่อนหน้าแทน (คนละ instance กับที่เพิ่งเขียนข้อมูลใหม่ลงไป)

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

// นำเข้า pure helper เฉยๆ ที่ top-level ได้ปลอดภัย (ไม่ผูกกับ usePlayerStore instance ไหน)
import { createDefaultProfile } from './playerStore'

const STORAGE_KEY = 'triplepoker.player.v1'

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** reset module registry, เขียนโปรไฟล์เริ่มต้นที่ level ที่กำหนดลง AsyncStorage ก่อน แล้วค่อย
 * require('./playerStore')/('./tierDSoloLocalRuntime')/('./engine/tierDSolo') ใหม่ในสโคปเดียวกัน
 * คืน { store, runtime, engine } ที่ผูกกับ instance เดียวกันทั้งหมด */
async function freshRuntimeAtLevel(level: number) {
  jest.resetModules()
  const AsyncStorage = require('@react-native-async-storage/async-storage')
  const profile = createDefaultProfile('2026-11-23')
  profile.tierDSolo.level = level
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { profile }, version: 2 }))
  const { usePlayerStore } = require('./playerStore')
  await new Promise<void>((resolve) => {
    if (!usePlayerStore.getState()._hydrating) return resolve()
    const unsub = usePlayerStore.subscribe((s: { _hydrating: boolean }) => {
      if (!s._hydrating) {
        unsub()
        resolve()
      }
    })
  })
  const runtime = require('./tierDSoloLocalRuntime')
  const engine = require('./engine/tierDSolo')
  return { store: usePlayerStore, runtime, engine }
}

/** เล่นจนจบ 1 Level เต็ม (วนหลาย Match จนกว่าจะได้ 'level_complete') ด้วยไพ่จัดแบบถูกกฎทุกครั้ง
 * (ใช้ automaticTierDArrangement ของ engine เอง — ไม่ optimize ฝั่งผู้เล่น ผลแพ้/ชนะจึงขึ้นกับ seed) */
function playOutLevel(runtime: any, engine: any, random: () => number) {
  let session = runtime.startTierDSoloLevel(random)
  for (;;) {
    const arrangement = engine.automaticTierDArrangement(session.state.dealtHands[runtime.TIER_D_SOLO_HUMAN_ID], session.state.communityPiles, random)
    runtime.submitArrangement(session, arrangement)
    runtime.revealCurrentGame(session)
    runtime.commitCurrentGame(session, random)
    runtime.revealCurrentGame(session)
    runtime.commitCurrentGame(session, random)
    runtime.revealCurrentGame(session)
    runtime.commitCurrentGame(session, random)
    const outcome = runtime.finishMatch(session, random)
    if (outcome.kind === 'next_match') {
      session = outcome.session
      continue
    }
    return outcome
  }
}

describe('startTierDSoloLevel', () => {
  test('deal เป็น legal state จริง (ไม่ throw จาก card-conservation ของ engine เอง)', async () => {
    const { runtime } = await freshRuntimeAtLevel(1)
    const session = runtime.startTierDSoloLevel(mulberry32(1))
    expect(session.state.level).toBe(1)
    expect(session.state.dealtHands[runtime.TIER_D_SOLO_HUMAN_ID]).toHaveLength(11)
    expect(session.matchNumber).toBe(1)
    expect(session.currentGame).toBe(1)
  })
})

describe('finishMatch / completeLevel — win/loss contract', () => {
  test('ไม่ว่าผลจะแพ้หรือชนะ (ตาม seed) level ใน playerStore ต้องตรงกับ playerWon เสมอ: ชนะ = level+1, แพ้ = level เท่าเดิม', async () => {
    const { store, runtime, engine } = await freshRuntimeAtLevel(1)
    const outcome = playOutLevel(runtime, engine, mulberry32(42))
    expect(outcome.kind).toBe('level_complete')
    const newLevel = store.getState().profile!.tierDSolo.level
    expect(newLevel).toBe(outcome.playerWon ? 2 : 1)
    // level 1 อยู่ใน Bronze (level<51) — ตาม engine's applyTierDLevelOutcome() ชนะก็ไม่นับ streak เลย
    expect(store.getState().profile!.tierDSolo.currentWinStreak).toBe(0)
  })

  test('Bronze (level<51) ไม่นับ win streak แม้จะชนะ แต่ league อื่น (level>=51) นับปกติ', async () => {
    let bronzeWin: { store: any } | undefined
    for (let seed = 1; seed < 200 && !bronzeWin; seed++) {
      const { store, runtime, engine } = await freshRuntimeAtLevel(1)
      const outcome = playOutLevel(runtime, engine, mulberry32(seed))
      if (outcome.kind === 'level_complete' && outcome.playerWon) bronzeWin = { store }
    }
    expect(bronzeWin).toBeDefined()
    expect(bronzeWin!.store.getState().profile!.tierDSolo.currentWinStreak).toBe(0)

    let silverWin: { store: any } | undefined
    for (let seed = 1; seed < 200 && !silverWin; seed++) {
      const { store, runtime, engine } = await freshRuntimeAtLevel(51)
      const outcome = playOutLevel(runtime, engine, mulberry32(seed))
      if (outcome.kind === 'level_complete' && outcome.playerWon) silverWin = { store }
    }
    expect(silverWin).toBeDefined()
    expect(silverWin!.store.getState().profile!.tierDSolo.currentWinStreak).toBe(1)
    expect(silverWin!.store.getState().profile!.tierDSolo.bestWinStreak).toBe(1)
  })

  test('ชนะแล้วได้ reward ตรงกับ tierDLevelRewardPlan ของ level นั้น (ถ้า schedule จ่ายของ)', async () => {
    let found: { outcome: any; seed: number } | undefined
    for (let seed = 1; seed < 200 && !found; seed++) {
      const { runtime, engine } = await freshRuntimeAtLevel(1)
      const outcome = playOutLevel(runtime, engine, mulberry32(seed))
      if (outcome.kind === 'level_complete' && outcome.playerWon) found = { outcome, seed }
    }
    expect(found).toBeDefined()
    const { runtime } = await freshRuntimeAtLevel(1) // แค่เอา engine helper มาใช้เทียบ schedule ซ้ำ
    const rewards = require('./engine/tierDRewards')
    const schedule = rewards.levelRewardSchedule(1, mulberry32(found!.seed))
    if (schedule.kind === 'none') {
      expect(found!.outcome.rewardedItems).toHaveLength(0)
    } else {
      const plan = rewards.tierDLevelRewardPlan(1)
      expect(found!.outcome.rewardedItems.length).toBeGreaterThan(0)
      expect(found!.outcome.rewardedItems.length).toBeLessThanOrEqual(plan.baseItemTypes)
    }
    void runtime
  })
})

describe('Milestone token grant', () => {
  test('ชนะ level 250 แจก token 10,000 ครั้งเดียว', async () => {
    let result: { store: any; outcome: any } | undefined
    for (let seed = 1; seed < 200 && !result; seed++) {
      const { store, runtime, engine } = await freshRuntimeAtLevel(250)
      const outcome = playOutLevel(runtime, engine, mulberry32(seed))
      if (outcome.kind === 'level_complete' && outcome.playerWon) result = { store, outcome }
    }
    expect(result).toBeDefined()
    expect(result!.outcome.milestoneTokensGranted).toBe(10_000)
    expect(result!.store.getState().profile!.tokens).toBe(10_000)
    expect(result!.store.getState().profile!.tierDSolo.milestonesClaimed).toContain(250)
  })

  test('ชนะ level ที่ไม่ใช่ 250/500 ต้องไม่แจก milestone token เลย', async () => {
    let result: { store: any; outcome: any } | undefined
    for (let seed = 1; seed < 200 && !result; seed++) {
      const { store, runtime, engine } = await freshRuntimeAtLevel(1)
      const outcome = playOutLevel(runtime, engine, mulberry32(seed))
      if (outcome.kind === 'level_complete' && outcome.playerWon) result = { store, outcome }
    }
    expect(result).toBeDefined()
    expect(result!.outcome.milestoneTokensGranted).toBe(0)
    expect(result!.store.getState().profile!.tokens).toBe(0)
  })
})

describe('useTierDItemLocal', () => {
  test('ใช้ item โดยไม่มีของในสต็อก ต้อง reject', async () => {
    const { runtime } = await freshRuntimeAtLevel(1)
    const session = runtime.startTierDSoloLevel(mulberry32(1))
    const result = runtime.useTierDItemLocal(session, 'shuffle')
    expect(result.ok).toBe(false)
  })

  test('มีของในสต็อก ใช้ได้ และสต็อกลดลงจริง', async () => {
    const { store, runtime } = await freshRuntimeAtLevel(1)
    store.getState().grantTierDItem('shuffle', 1)
    const session = runtime.startTierDSoloLevel(mulberry32(1))
    const result = runtime.useTierDItemLocal(session, 'shuffle')
    expect(result.ok).toBe(true)
    expect(store.getState().profile!.tierDSolo.items.shuffle).toBe(0)
  })
})
