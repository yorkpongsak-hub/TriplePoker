// playerStore.ts
// Local-first player state สำหรับ Offline Pivot (Phase 2 / Step 1 — Foundation)
// Pattern เดียวกับ client/src/launch/store.ts: Zustand + persist ผ่าน AsyncStorage
//
// ยังไม่ต่อเข้ากับหน้าเกมใดๆ ในขั้นนี้ (ตาม Phase 2 Step 1 scope) — ไฟล์นี้เป็นแค่ foundation
//
// กฎสำคัญของ hydration (ตามที่ลุงเยาะสั่ง):
//   - 'new'   = ไม่เคยมีข้อมูลใน AsyncStorage เลย (เครื่องใหม่/ลงแอปครั้งแรกจริงๆ) → เริ่มค่า default แล้วเขียนลงทันที
//   - 'ok'    = อ่านข้อมูลเดิมสำเร็จ (หรือ migrate schemaVersion เก่าสำเร็จแล้ว)
//   - 'error' = อ่านไม่ได้ หรือ parse/shape ไม่ตรง → ห้าม fallback เป็นค่า default และห้ามเขียนทับของเดิมเด็ดขาด
//               (ผู้เล่นอาจมีข้อมูลจริงอยู่ข้างในที่ยังกู้ได้ด้วยมือ) — หน้าจอ error เป็นงานขั้นถัดไป ที่นี่แค่ expose status

import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import { getTierFromToken, type TierKey } from '../config/tierConfig'

export const CURRENT_SCHEMA_VERSION = 2
const STORAGE_KEY = 'triplepoker.player.v1'

export type HydrationStatus = 'new' | 'ok' | 'error'

export type StreakState = {
  streakCount: number
  bestStreakCount: number
  lastPlayedDate: string | null // YYYY-MM-DD เวลาเครื่อง (local) ไม่ใช่ Bangkok-anchor แบบ server เดิม
  claimedMilestone: number // milestone (วัน) ล่าสุดที่เคลมรางวัลไปแล้ว เช่น 3/5/7
}

export type DailyPs = {
  date: string // YYYY-MM-DD เวลาเครื่อง — วันที่ค่า value นี้นับอยู่
  value: number
}

export type AdState = {
  handsSinceInstall: number // รวมทั้งหมดตั้งแต่ลงแอป ใช้กับเงื่อนไข "3 hands แรกไม่มีโฆษณา"
  lastInterstitialAt: number | null // epoch ms (เวลาเครื่อง) ครั้งล่าสุดที่โชว์ interstitial
}

// ต้องตรงกับ ItemKey ใน client/app/game/tier-d/index.tsx เป๊ะ (ขั้นถัดไปจะเปลี่ยนมา import จากที่นี่แทน)
export type TierDItemKey = 'shuffle' | 'swap' | 'double_pile' | 'freeze' | 'auto_sort' | 'undo'

export type TierDSoloState = {
  level: number // level สูงสุดที่ไต่ถึง (ceiling model เดียวกับ tokens — ไม่มีทางลดลง)
  items: Record<TierDItemKey, number>
  bestMatchTimeMs: number | null
  currentWinStreak: number // จำนวน level ที่ชนะติดกันล่าสุด (คนละอย่างกับ StreakState ที่นับวันเล่นต่อเนื่อง)
  bestWinStreak: number
  bestMatchScore: number
  milestonesClaimed: number[] // level ที่เคยแจก token milestone ไปแล้ว (เช่น 250, 500) กันแจกซ้ำ
}

export type PlayerProfile = {
  schemaVersion: number
  displayName: string | null
  avatarId: string | null
  tokens: number
  careerPs: number
  dailyPs: DailyPs
  streak: StreakState
  handsPlayed: number
  ad: AdState
  tierDSolo: TierDSoloState
}

export const TIER_D_ITEM_KEYS: readonly TierDItemKey[] = ['shuffle', 'swap', 'double_pile', 'freeze', 'auto_sort', 'undo']

function createDefaultTierDSoloState(): TierDSoloState {
  return {
    level: 1,
    items: { shuffle: 0, swap: 0, double_pile: 0, freeze: 0, auto_sort: 0, undo: 0 },
    bestMatchTimeMs: null,
    currentWinStreak: 0,
    bestWinStreak: 0,
    bestMatchScore: 0,
    milestonesClaimed: [],
  }
}

// ─── Pure helpers (เทสตรงๆ ได้โดยไม่ต้องยุ่งกับ Zustand/AsyncStorage) ──────────────────────

// ใช้ local date component (getFullYear/getMonth/getDate) ไม่ใช่ toISOString()/Date.parse()
// เพราะสองตัวนั้นตีความเป็น UTC ได้วันที่เพี้ยนไปจากที่ผู้เล่นเห็นบนเครื่องจริง
export function todayLocalDateString(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseLocalDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function diffDaysLocal(fromDate: string, toDate: string): number {
  const ms = parseLocalDateString(toDate).getTime() - parseLocalDateString(fromDate).getTime()
  return Math.round(ms / 86_400_000)
}

export function createDefaultProfile(today: string = todayLocalDateString()): PlayerProfile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    displayName: null,
    avatarId: null,
    tokens: 0,
    careerPs: 0,
    dailyPs: { date: today, value: 0 },
    streak: { streakCount: 0, bestStreakCount: 0, lastPlayedDate: null, claimedMilestone: 0 },
    handsPlayed: 0,
    ad: { handsSinceInstall: 0, lastInterstitialAt: null },
    tierDSolo: createDefaultTierDSoloState(),
  }
}

// อัปเดต streak ตอนเล่นจบมือ (เรียกวันละครั้งพอ ไม่ว่าจะเล่นกี่มือ) — เทียบ "เมื่อวาน" แบบ local date
export function computeStreakOnPlay(prev: StreakState, today: string = todayLocalDateString()): StreakState {
  if (prev.lastPlayedDate === today) return prev // เล่นไปแล้ววันนี้ ไม่นับซ้ำ
  const gap = prev.lastPlayedDate ? diffDaysLocal(prev.lastPlayedDate, today) : null
  const nextCount = gap === 1 ? prev.streakCount + 1 : 1 // ต่อเนื่องจากเมื่อวาน หรือเริ่มใหม่
  return {
    streakCount: nextCount,
    bestStreakCount: Math.max(prev.bestStreakCount, nextCount),
    lastPlayedDate: today,
    claimedMilestone: prev.claimedMilestone,
  }
}

// รวม PS วันนี้ — ถ้าข้ามวันแล้วให้เริ่มนับ dailyPs ใหม่ (ของเก่าควรถูกส่งขึ้น GPGS ไปแล้วก่อนข้ามวัน — งานขั้นถัดไป)
export function rollDailyPs(prev: DailyPs, amount: number, today: string = todayLocalDateString()): DailyPs {
  if (prev.date === today) return { date: today, value: prev.value + amount }
  return { date: today, value: amount }
}

type PersistedShape = { profile: PlayerProfile }

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

// เช็คแค่ "เปลือก" ของ StorageValue<T> ({state, version}) — ไม่เช็คลึกถึง field ข้างในของ profile
// ที่นี่ เพราะ schemaVersion เก่ากว่าปัจจุบันมี shape ต่างกันได้ตามธรรมชาติ ปล่อยให้ migrate() จัดการต่อ
function looksLikeStorageEnvelope(x: unknown): x is StorageValue<PersistedShape> {
  return isPlainObject(x) && 'state' in x && 'version' in x && typeof x.version === 'number'
}

// เช็ค shape ของ PlayerProfile แบบเข้มเฉพาะตอน schemaVersion ตรงกับปัจจุบันเป๊ะ (กันข้อมูล corrupt
// ที่ version เลขตรงแต่ field เพี้ยนจากบั๊ก/แก้ไฟล์มือ) — เวอร์ชันเก่ากว่าข้าม เพราะ migrateProfile จะคุมเอง
function isValidCurrentProfile(x: unknown): x is PlayerProfile {
  if (!isPlainObject(x)) return false
  if (x.schemaVersion !== CURRENT_SCHEMA_VERSION) return false
  if (typeof x.tokens !== 'number' || typeof x.careerPs !== 'number' || typeof x.handsPlayed !== 'number') return false
  if (!isPlainObject(x.dailyPs) || typeof x.dailyPs.date !== 'string' || typeof x.dailyPs.value !== 'number') return false
  if (!isPlainObject(x.streak)) return false
  if (!isPlainObject(x.ad)) return false
  if (!isPlainObject(x.tierDSolo) || typeof x.tierDSolo.level !== 'number' || !isPlainObject(x.tierDSolo.items) || !Array.isArray(x.tierDSolo.milestonesClaimed)) return false
  return true
}

export class PlayerDataCorruptError extends Error {
  constructor(reason: string) {
    super(`PLAYER_DATA_CORRUPT: ${reason}`)
    this.name = 'PlayerDataCorruptError'
  }
}

// migrate ข้อมูลเก่าแบบไล่ทีละขั้น (v0→v1→v2→...) แทนที่จะรวมเป็นฟังก์ชันเดียว — แต่ละขั้นรับผิดชอบ
// แค่ delta ของตัวเอง ใช้ typeof guard ทุก field ไม่ throw แม้ shape เก่าจะขาดบาง field ไป
// เพิ่มขั้นใหม่ทุกครั้งที่ขยับ CURRENT_SCHEMA_VERSION ในอนาคต ห้ามลบขั้นเก่าทิ้ง

// v0 (ไม่มี schemaVersion เลย) → v1: ยังไม่เคยมี dailyPs/streak จริงจึงรีเซ็ตเป็น default ได้ปลอดภัย
function migrateV0ToV1(persisted: unknown) {
  const old = isPlainObject(persisted) ? persisted : {}
  return {
    schemaVersion: 1,
    displayName: typeof old.displayName === 'string' ? old.displayName : null,
    avatarId: typeof old.avatarId === 'string' ? old.avatarId : null,
    tokens: typeof old.tokens === 'number' ? old.tokens : 0,
    careerPs: typeof old.careerPs === 'number' ? old.careerPs : 0,
    dailyPs: { date: todayLocalDateString(), value: 0 },
    streak: { streakCount: 0, bestStreakCount: 0, lastPlayedDate: null, claimedMilestone: 0 },
    handsPlayed: typeof old.handsPlayed === 'number' ? old.handsPlayed : 0,
    ad: { handsSinceInstall: 0, lastInterstitialAt: null },
  }
}

// v1 → v2: เพิ่ม tierDSolo เป็น field ใหม่ล้วนๆ ของเดิม (dailyPs/streak/ad ของจริงจาก v1) ต้องรักษาไว้ ไม่ใช่รีเซ็ต
function migrateV1ToV2(persisted: unknown): PlayerProfile {
  const old = isPlainObject(persisted) ? persisted : {}
  const dailyPsOld = isPlainObject(old.dailyPs) ? old.dailyPs : undefined
  const streakOld = isPlainObject(old.streak) ? old.streak : undefined
  const adOld = isPlainObject(old.ad) ? old.ad : undefined
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    displayName: typeof old.displayName === 'string' ? old.displayName : null,
    avatarId: typeof old.avatarId === 'string' ? old.avatarId : null,
    tokens: typeof old.tokens === 'number' ? old.tokens : 0,
    careerPs: typeof old.careerPs === 'number' ? old.careerPs : 0,
    dailyPs: dailyPsOld && typeof dailyPsOld.date === 'string' && typeof dailyPsOld.value === 'number'
      ? { date: dailyPsOld.date, value: dailyPsOld.value } : { date: todayLocalDateString(), value: 0 },
    streak: {
      streakCount: typeof streakOld?.streakCount === 'number' ? streakOld.streakCount : 0,
      bestStreakCount: typeof streakOld?.bestStreakCount === 'number' ? streakOld.bestStreakCount : 0,
      lastPlayedDate: typeof streakOld?.lastPlayedDate === 'string' ? streakOld.lastPlayedDate : null,
      claimedMilestone: typeof streakOld?.claimedMilestone === 'number' ? streakOld.claimedMilestone : 0,
    },
    handsPlayed: typeof old.handsPlayed === 'number' ? old.handsPlayed : 0,
    ad: {
      handsSinceInstall: typeof adOld?.handsSinceInstall === 'number' ? adOld.handsSinceInstall : 0,
      lastInterstitialAt: typeof adOld?.lastInterstitialAt === 'number' ? adOld.lastInterstitialAt : null,
    },
    tierDSolo: createDefaultTierDSoloState(), // v1 ไม่เคยมี field นี้มาก่อนแน่ๆ ไม่มีอะไรให้กู้
  }
}

export function migrateProfile(persisted: unknown, fromVersion: number): PlayerProfile {
  // fromVersion > ปัจจุบัน = ดาวน์เกรดแอป ไม่ควรเกิดขึ้นจริง — ปฏิเสธแทนการเดา
  if (fromVersion > CURRENT_SCHEMA_VERSION) throw new PlayerDataCorruptError(`unsupported schema version ${fromVersion}`)
  const afterV1 = fromVersion < 1 ? migrateV0ToV1(persisted) : persisted
  return migrateV1ToV2(afterV1)
}

// เขียนเรียงตามลำดับ ป้องกัน snapshot เก่าเขียนทับผลใหม่ (pattern เดียวกับ launch/store.ts)
let writeQueue = Promise.resolve()

// ปิด closure flag นี้ไว้บอกว่ารอบ getItem ล่าสุด "ไม่มีข้อมูลเลย" (null) หรือ "มีแต่อ่านไม่ได้" (throw)
// อ่านค่านี้ได้ปลอดภัยใน onRehydrateStorage เพราะ zustand persist เรียก getItem ครั้งเดียวตอน boot
// แล้วค่อยเรียก callback ต่อใน .then() เดียวกัน ไม่มี hydrate() ซ้อนกันในระหว่างนั้น
let lastReadWasAbsent = false

const playerStorage: PersistStorage<PersistedShape> = {
  getItem: async (name: string): Promise<StorageValue<PersistedShape> | null> => {
    let raw: string | null
    try {
      raw = await AsyncStorage.getItem(name)
    } catch {
      throw new PlayerDataCorruptError('ASYNC_STORAGE_READ_FAILED')
    }
    if (raw === null) {
      lastReadWasAbsent = true
      return null
    }
    lastReadWasAbsent = false
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new PlayerDataCorruptError('INVALID_JSON')
    }
    if (!looksLikeStorageEnvelope(parsed)) {
      throw new PlayerDataCorruptError('INVALID_ENVELOPE_SHAPE')
    }
    // version ตรงปัจจุบันเป๊ะ → เช็ค shape ของ profile ให้เข้มด้วย (กัน corrupt ที่ version เลขตรงแต่ field เพี้ยน)
    if (parsed.version === CURRENT_SCHEMA_VERSION) {
      const state = parsed.state as Partial<PersistedShape> | undefined
      if (!state || !isValidCurrentProfile(state.profile)) {
        throw new PlayerDataCorruptError('INVALID_PROFILE_SHAPE')
      }
    }
    return parsed
  },
  setItem: (name: string, value: StorageValue<PersistedShape>): Promise<void> => {
    writeQueue = writeQueue.catch(() => {}).then(() => AsyncStorage.setItem(name, JSON.stringify(value)))
    return writeQueue.catch(() => {
      if (usePlayerStore.getState().status !== 'error') {
        usePlayerStore.setState({ status: 'error' })
      }
    })
  },
  removeItem: (name: string) => AsyncStorage.removeItem(name),
}

type PlayerStore = {
  status: HydrationStatus
  // ธงภายในเท่านั้น (ไม่ใช่ 1 ใน 3 สถานะที่ UI ใช้) — บอกว่า hydrate() จาก AsyncStorage เสร็จหรือยัง
  // จำเป็นเพราะ zustand persist ไม่ยิง hasHydrated()/onFinishHydration ให้ตอน error (ดู onRehydrateStorage)
  _hydrating: boolean
  profile: PlayerProfile | null
  setDisplayName: (name: string) => void
  setAvatar: (avatarId: string) => void
  addTokens: (amount: number) => void
  spendTokens: (amount: number) => boolean // false = เงินไม่พอ ไม่หักอะไรเลย (ห้ามติดลบ)
  recordHandPlayed: () => void
  markInterstitialShown: () => void
  addCareerPs: (amount: number) => void
  // เขียนทับ level/currentWinStreak/bestWinStreak ตรงๆ — ไม่มี business logic ที่นี่ (ผู้เรียกต้องคำนวณ
  // ค่าที่ถูกต้องมาเองผ่าน engine/tierDSolo.ts's applyTierDLevelOutcome() ก่อนเสมอ)
  setTierDSoloProgress: (progress: { level: number; currentWinStreak: number; bestWinStreak: number }) => void
  grantTierDItem: (item: TierDItemKey, amount: number) => void
  spendTierDItem: (item: TierDItemKey) => boolean // false = ไม่มีของเหลือให้ใช้
  recordTierDLevelResult: (result: { won: boolean; matchTimeMs?: number; matchScore?: number }) => void
  claimTierDMilestone: (level: number, tokenReward: number) => boolean // false = เคยเคลมไปแล้ว ไม่แจกซ้ำ
}

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      status: 'new',
      _hydrating: true,
      profile: null,
      setDisplayName: (name) => {
        const { profile, status } = get()
        if (status === 'error' || !profile) return
        set({ profile: { ...profile, displayName: name } })
      },
      setAvatar: (avatarId) => {
        const { profile, status } = get()
        if (status === 'error' || !profile) return
        set({ profile: { ...profile, avatarId } })
      },
      addTokens: (amount) => {
        const { profile, status } = get()
        if (status === 'error' || !profile || amount <= 0) return
        set({ profile: { ...profile, tokens: profile.tokens + amount } })
      },
      spendTokens: (amount) => {
        const { profile, status } = get()
        if (status === 'error' || !profile || amount <= 0) return false
        if (profile.tokens < amount) return false
        set({ profile: { ...profile, tokens: profile.tokens - amount } })
        return true
      },
      recordHandPlayed: () => {
        const { profile, status } = get()
        if (status === 'error' || !profile) return
        const today = todayLocalDateString()
        set({
          profile: {
            ...profile,
            handsPlayed: profile.handsPlayed + 1,
            streak: computeStreakOnPlay(profile.streak, today),
            ad: { ...profile.ad, handsSinceInstall: profile.ad.handsSinceInstall + 1 },
          },
        })
      },
      markInterstitialShown: () => {
        const { profile, status } = get()
        if (status === 'error' || !profile) return
        set({ profile: { ...profile, ad: { ...profile.ad, lastInterstitialAt: Date.now() } } })
      },
      addCareerPs: (amount) => {
        const { profile, status } = get()
        if (status === 'error' || !profile || amount <= 0) return
        set({ profile: { ...profile, careerPs: profile.careerPs + amount, dailyPs: rollDailyPs(profile.dailyPs, amount) } })
      },
      setTierDSoloProgress: (progress) => {
        const { profile, status } = get()
        if (status === 'error' || !profile) return
        set({ profile: { ...profile, tierDSolo: { ...profile.tierDSolo, ...progress } } })
      },
      grantTierDItem: (item, amount) => {
        const { profile, status } = get()
        if (status === 'error' || !profile || amount <= 0) return
        set({ profile: { ...profile, tierDSolo: { ...profile.tierDSolo, items: { ...profile.tierDSolo.items, [item]: profile.tierDSolo.items[item] + amount } } } })
      },
      spendTierDItem: (item) => {
        const { profile, status } = get()
        if (status === 'error' || !profile || profile.tierDSolo.items[item] <= 0) return false
        set({ profile: { ...profile, tierDSolo: { ...profile.tierDSolo, items: { ...profile.tierDSolo.items, [item]: profile.tierDSolo.items[item] - 1 } } } })
        return true
      },
      // level/currentWinStreak/bestWinStreak ไม่ได้คำนวณที่นี่แล้ว — ของจริง (รวมข้อยกเว้น Bronze
      // ที่ level<51 ห้ามนับ streak) อยู่ใน engine/tierDSolo.ts's applyTierDLevelOutcome() ตัวเดียว
      // ฟังก์ชันนี้เหลือหน้าที่แค่ bestMatchTimeMs/bestMatchScore ที่ engine ไม่ได้คุม (ดู setTierDSoloProgress)
      recordTierDLevelResult: ({ won, matchTimeMs, matchScore }) => {
        const { profile, status } = get()
        if (status === 'error' || !profile) return
        const prev = profile.tierDSolo
        const bestMatchTimeMs = won && typeof matchTimeMs === 'number'
          ? (prev.bestMatchTimeMs === null ? matchTimeMs : Math.min(prev.bestMatchTimeMs, matchTimeMs))
          : prev.bestMatchTimeMs
        const bestMatchScore = won && typeof matchScore === 'number' ? Math.max(prev.bestMatchScore, matchScore) : prev.bestMatchScore
        set({ profile: { ...profile, tierDSolo: { ...prev, bestMatchTimeMs, bestMatchScore } } })
      },
      claimTierDMilestone: (level, tokenReward) => {
        const { profile, status } = get()
        if (status === 'error' || !profile || profile.tierDSolo.milestonesClaimed.includes(level)) return false
        set({
          profile: {
            ...profile,
            tokens: profile.tokens + tokenReward,
            tierDSolo: { ...profile.tierDSolo, milestonesClaimed: [...profile.tierDSolo.milestonesClaimed, level] },
          },
        })
        return true
      },
    }),
    {
      name: STORAGE_KEY,
      version: CURRENT_SCHEMA_VERSION,
      storage: playerStorage,
      partialize: (s) => ({ profile: s.profile as PlayerProfile }),
      migrate: (persistedState, fromVersion) => {
        const state = persistedState as Partial<PersistedShape> | undefined
        return { profile: migrateProfile(state?.profile, fromVersion) }
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          usePlayerStore.setState({ status: 'error', profile: null, _hydrating: false })
          return
        }
        if (lastReadWasAbsent) {
          // เครื่องใหม่จริง ไม่เคยมีข้อมูลเลย — เริ่ม default แล้วปล่อยให้ persist เขียนลง storage เอง
          usePlayerStore.setState({ status: 'new', profile: createDefaultProfile(), _hydrating: false })
        } else {
          usePlayerStore.setState({ status: 'ok', _hydrating: false })
        }
      },
    }
  )
)

// Tier ที่เล่นได้คำนวณจาก tokens สดทุกครั้ง (ceiling model) — ไม่เก็บเป็น field แยกใน store
// เพื่อกันเลข drift ระหว่าง tokens กับ tier ที่แคช (อ้างอิง getTierFromToken เดียวกับทั้งแอป)
export function useAvailableTier(): TierKey {
  return usePlayerStore((s) => getTierFromToken(s.profile?.tokens ?? 0))
}
