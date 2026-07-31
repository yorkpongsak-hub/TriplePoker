// sfxLayerService.ts
// Monarch Encounter — SFX Layer (Monarch v2.2 §13, Batch 4)
// ⚠️ ไม่ใช่ BGM — canon: ในโต๊ะเกมทุก Tier ไม่มี BGM เด็ดขาด (bgmService.ts:4) ไฟล์นี้แยกจาก
// bgmService.ts โดยเจตนา ห้ามยัดรวมกัน แค่ reuse pattern เดียวกัน (AudioSource | null placeholder
// + guard no-op + manual volume interpolation สำหรับ fade/duck)
// ใช้ expo-audio เท่านั้น (ไม่ใช้ expo-av — เลิกใช้ตั้งแต่ Expo SDK 52+ เหมือน bgmService.ts)
// The Sage Unicorn Studio Co., Ltd.

import { createAudioPlayer, AudioPlayer, AudioSource } from 'expo-audio'

// ── Placeholder assets (Batch 4) — null = รอ Sound Designer เติมไฟล์จริง ────────────────────────
// ระหว่างที่ยังเป็น null ทุกฟังก์ชันในไฟล์นี้ no-op เงียบๆ ไม่ throw (pattern เดียวกับ bgmService.ts/
// BossVictoryVFX.tsx เป๊ะ) — วาง path จริงที่ client/assets/sounds/ แล้วเปลี่ยนเป็น require(...)
// รายละเอียด/สเปคเสียงแต่ละตัว ดู checklist ท้ายไฟล์นี้
const AMBIENT_DRONE: AudioSource | null = null // require('../../assets/sounds/sfx_monarch_ambient_drone.mp3')
const HEARTBEAT_DRONE: AudioSource | null = null // require('../../assets/sounds/sfx_monarch_heartbeat.mp3')
const SFX_TICK: AudioSource | null = null // require('../../assets/sounds/sfx_monarch_tick.mp3')
const SFX_CROWN_STRIKE: AudioSource | null = null // require('../../assets/sounds/sfx_monarch_crown_strike.mp3')
const SFX_SEAL_STAMP: AudioSource | null = null // require('../../assets/sounds/sfx_monarch_seal_stamp.mp3')

const AMBIENT_VOLUME = 0.35
const DUCK_STEP_MS = 50

export type HeartbeatPhase = 'tension' | 'critical' | 'final' | 'off'

// rate/volume ต่อ phase — ใช้ asset heartbeat ตัวเดียวเร่ง playbackRate/volume แทนแยกไฟล์ต่อ phase
// (Batch 4 spec: "heartbeat loop เร่งตาม phase" ตีความเป็น 1 asset + tuning ต่อ phase)
const HEARTBEAT_TUNING: Record<Exclude<HeartbeatPhase, 'off'>, { rate: number; volume: number }> = {
  tension:  { rate: 1.0, volume: 0.30 },
  critical: { rate: 1.3, volume: 0.55 },
  final:    { rate: 1.6, volume: 0.80 },
}

let ambientPlayer: AudioPlayer | null = null
let heartbeatPlayer: AudioPlayer | null = null
let duckIntervalId: ReturnType<typeof setInterval> | null = null

function stopDuck(): void {
  if (duckIntervalId) {
    clearInterval(duckIntervalId)
    duckIntervalId = null
  }
}

function ensureAmbientPlayer(): AudioPlayer | null {
  if (!AMBIENT_DRONE) return null // asset ยังไม่มี
  if (!ambientPlayer) {
    ambientPlayer = createAudioPlayer(AMBIENT_DRONE)
    ambientPlayer.loop = true
  }
  return ambientPlayer
}

function ensureHeartbeatPlayer(): AudioPlayer | null {
  if (!HEARTBEAT_DRONE) return null // asset ยังไม่มี
  if (!heartbeatPlayer) {
    heartbeatPlayer = createAudioPlayer(HEARTBEAT_DRONE)
    heartbeatPlayer.loop = true
  }
  return heartbeatPlayer
}

// เรียกตอน cue 'phase_calm' (arrangement เริ่มจริง ไม่ใช่ตอน mount — กัน ambient ทับ silence_cut
// ของ Stumble fake-out ที่เล่นก่อนหน้านั้น) idempotent เหมือน ensureBgmPlaying — reassert volume
// ทุกครั้งที่เรียก (ไม่ใช่แค่ตอนสร้าง player ใหม่) ให้ทำหน้าที่ "restore" หลัง duckAll ไปในตัวด้วย
export function startAmbient(): void {
  try {
    const p = ensureAmbientPlayer()
    if (!p) return
    stopDuck() // กัน duck ค้างจากรอบก่อนมาลาก volume ผิดจังหวะ
    p.volume = AMBIENT_VOLUME
    if (!p.playing) p.play()
  } catch { /* no-op — เล่นพลาดไม่ทำแอปพัง */ }
}

export function stopAmbient(): void {
  try {
    if (ambientPlayer) ambientPlayer.pause()
  } catch { /* no-op */ }
}

// heartbeat เข้ามาตั้งแต่ 'tension' เป็นต้นไป (ไม่มีตอน calm ตาม §13 — ambient เพียวๆ ก่อน) 'off'
// สั่ง pause เฉยๆ (ไม่ remove — อาจกลับมาเล่นต่อได้ถ้า phase ย้อนกลับ เช่น edge case reduce-motion)
export function setHeartbeatPhase(phase: HeartbeatPhase): void {
  try {
    if (phase === 'off') {
      if (heartbeatPlayer) heartbeatPlayer.pause()
      return
    }
    const p = ensureHeartbeatPlayer()
    if (!p) return
    const tuning = HEARTBEAT_TUNING[phase]
    p.volume = tuning.volume
    p.setPlaybackRate(tuning.rate)
    if (!p.playing) p.play()
  } catch { /* no-op */ }
}

// One-shot ล้วน — สร้าง instance ใหม่ต่อครั้ง ไม่ remove() หลังเล่นจบตาม precedent bgmService.ts:90/
// BossVictoryVFX.tsx (SFX สั้น เรียกไม่บ่อย/bounded ต่อแมตช์ — tick ≤10 ครั้ง, crown_strike ≤3 ครั้ง,
// seal_stamp ปกติครั้งเดียว — ถ้าพบ memory concern จริงตอนมี asset ค่อยเพิ่ม cleanup ทีหลัง)
function playOneShot(source: AudioSource | null): void {
  if (!source) return
  try { createAudioPlayer(source).play() } catch { /* no-op */ }
}

export function playTick(): void { playOneShot(SFX_TICK) }
export function playCrownStrike(): void { playOneShot(SFX_CROWN_STRIKE) }
export function playSealStamp(): void { playOneShot(SFX_SEAL_STAMP) }

// silence_cut — ตัดเงียบดราม่า (fake-out/Royal Silence/ก่อน G3) ลาก volume ของ ambient+heartbeat
// ที่กำลังเล่นอยู่ลงไปที่ targetVolume ภายใน ms (เทคนิคเดียวกับ fadeOutBgm ของ bgmService.ts:51-67
// — manual setInterval ทีละสเต็ป ไม่มี built-in fade API ใน expo-audio) ไม่แตะ one-shot layer
// (tick/crown_strike/seal_stamp) เลย — เสียงเหล่านั้นยังคมชัดทะลุความเงียบได้ตามที่ตั้งใจ
// ⚠️ ไม่มีฟังก์ชัน "restore" คู่กัน — ดูเหตุผลที่รายงานปิดท้าย Batch 4 (Task 2)
export function duckAll(targetVolume: number, ms: number): void {
  try {
    stopDuck()
    const players = [ambientPlayer, heartbeatPlayer].filter(
      (p): p is AudioPlayer => !!p && p.playing,
    )
    if (players.length === 0) return
    const startVolumes = players.map(p => p.volume)
    const steps = Math.max(1, Math.floor(ms / DUCK_STEP_MS))
    let step = 0
    duckIntervalId = setInterval(() => {
      step++
      const t = Math.min(1, step / steps)
      players.forEach((p, i) => {
        try { p.volume = startVolumes[i] + (targetVolume - startVolumes[i]) * t } catch { /* no-op */ }
      })
      if (step >= steps) stopDuck()
    }, DUCK_STEP_MS)
  } catch { /* no-op */ }
}

// เรียกตอน unmount โต๊ะ Monarch เสมอ (จบเกม/Leave/disconnect/back ทุกทาง) — หยุด+คืน native resource
// ของ loop player ทั้งสอง (ต่างจาก stopAmbient/setHeartbeatPhase('off') ที่แค่ pause เผื่อเล่นต่อได้
// กลางแมตช์ — ตรงนี้จบเกมจริงแล้ว ไม่มีทางเล่นต่อ ต้อง remove() กันเสียงค้าง/leak resource)
export function stopAll(): void {
  try {
    stopDuck()
    if (ambientPlayer) {
      ambientPlayer.pause()
      ambientPlayer.remove()
      ambientPlayer = null
    }
    if (heartbeatPlayer) {
      heartbeatPlayer.pause()
      heartbeatPlayer.remove()
      heartbeatPlayer = null
    }
  } catch { /* no-op */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECKLIST สำหรับ Sound Designer (Batch 4) — วางไฟล์ที่ client/assets/sounds/ ตามชื่อด้านบน
//   sfx_monarch_ambient_drone.mp3  (loop)     — โทนต่ำ/มืด สม่ำเสมอ ไม่มี beat ชัด เป็นพื้นบรรยากาศ
//                                                ตลอดช่วงเผชิญหน้า Monarch ต้อง seamless loop (ไม่มีรอยต่อ)
//   sfx_monarch_heartbeat.mp3      (loop)     — จังหวะหัวใจเต้น/กลองต่ำ ใช้ตัวเดียวกันทั้ง 3 phase
//                                                (tension/critical/final) ปรับความเร็ว+ความดังผ่านโค้ด
//                                                เอง (setPlaybackRate/volume) ต้อง seamless loop เช่นกัน
//   sfx_monarch_tick.mp3           (one-shot) — ติ๊กสั้นๆ คมชัด (~0.1-0.2s) ดังทุกวินาทีช่วง critical/final
//   sfx_monarch_crown_strike.mp3   (one-shot) — เสียงระฆัง/กระทบโลหะหนักแน่น (~0.3-0.5s) ดัง 3 ครั้งสุดท้าย
//                                                ก่อนหมดเวลาจัดไพ่ (remaining=3,2,1)
//   sfx_monarch_seal_stamp.mp3     (one-shot) — เสียงประทับตรา/กระแทก (~0.3-0.4s) ดังตอนกด SEAL THE HAND
// ─────────────────────────────────────────────────────────────────────────────
