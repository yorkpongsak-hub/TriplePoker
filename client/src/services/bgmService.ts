// bgmService.ts
// BGM Singleton — TriplePoker_LobbyMatchmaking_Spec_v1_0 §2
// เพลงเดียว loop ต่อเนื่องข้าม 4 หน้า (Profile/Shop/Lobby/Hall of Fame) ไม่ restart ตอนเปลี่ยนหน้า
// fade out ~1 วิ ตอนออกจาก 4 หน้านี้ (เข้าโต๊ะ/เข้าเกม) — ในโต๊ะเกมทุก Tier ไม่มี BGM เด็ดขาด (SFX เท่านั้น)
// ใช้ expo-audio (ไม่ใช้ expo-av — ถูกเลิกใช้ตั้งแต่ Expo SDK 52+, expo-audio คือตัวแทนอย่างเป็นทางการ)
// The Sage Unicorn Studio Co., Ltd.

import { useEffect } from 'react'
import { createAudioPlayer, AudioPlayer, AudioSource } from 'expo-audio'

// TODO: asset จริงยังไม่มี (Section 8 #1 ของสเปค) — วางไฟล์ที่ client/assets/sounds/bgm_main_menu.mp3
// แล้วเปลี่ยนบรรทัดล่างเป็น: require('../../assets/sounds/bgm_main_menu.mp3')
// ระหว่างที่ยังเป็น null ฟังก์ชันทั้งหมดในไฟล์นี้จะ no-op เงียบๆ ไม่ throw (เหมือน pattern SoundSource ใน SOUND_MANIFEST.ts)
const BGM_MAIN_MENU: AudioSource | null = null

const DEFAULT_VOLUME = 0.5 // Default 50% ตาม spec — TODO: ผูกกับ Settings screen เมื่อมีจริง (ยังไม่มีหน้า Settings ในโปรเจกต์ตอนนี้)
const FADE_OUT_MS = 1000
const FADE_STEP_MS = 50

let player: AudioPlayer | null = null
let currentVolume = DEFAULT_VOLUME
let fadeIntervalId: ReturnType<typeof setInterval> | null = null

function stopFade(): void {
  if (fadeIntervalId) {
    clearInterval(fadeIntervalId)
    fadeIntervalId = null
  }
}

function ensurePlayer(): AudioPlayer | null {
  if (!BGM_MAIN_MENU) return null // asset ยังไม่มี
  if (!player) {
    player = createAudioPlayer(BGM_MAIN_MENU)
    player.loop = true
    player.volume = currentVolume
  }
  return player
}

// เรียกตอน mount ของ Profile/Shop/Lobby/Hall of Fame — idempotent (ไม่ restart ถ้าเล่นอยู่แล้ว)
export function ensureBgmPlaying(): void {
  const p = ensurePlayer()
  if (!p) return
  stopFade()
  p.volume = currentVolume
  if (!p.playing) p.play()
}

// เรียกตอนออกจาก 4 หน้า BGM (ก่อน navigate เข้าโต๊ะเกมทุก Tier) — fade out ~1 วิ แล้ว pause
export function fadeOutBgm(): void {
  const p = player
  if (!p || !p.playing) return
  stopFade()
  const steps = Math.max(1, Math.floor(FADE_OUT_MS / FADE_STEP_MS))
  const decrement = currentVolume / steps
  let step = 0
  fadeIntervalId = setInterval(() => {
    step++
    p.volume = Math.max(0, currentVolume - decrement * step)
    if (step >= steps) {
      stopFade()
      p.pause()
      p.volume = currentVolume
    }
  }, FADE_STEP_MS)
}

// เผื่อผูก Settings screen ในอนาคต (ยังไม่มีหน้าจริงตอนนี้) — volume0to1: 0.0-1.0
export function setBgmVolume(volume0to1: number): void {
  currentVolume = Math.max(0, Math.min(1, volume0to1))
  if (player && !fadeIntervalId) player.volume = currentVolume
}

// ใช้ใน Profile/Shop/Lobby/Hall of Fame — เรียกครั้งเดียวตอน mount ของแต่ละหน้า
// (screen ที่เหลืออยู่ใต้ stack navigator ไม่ถูก unmount ตอน push หน้าใหม่ ฟังก์ชัน ensureBgmPlaying
// จึง idempotent — เรียกซ้ำได้จากหลายหน้าพร้อมกันโดยไม่ restart เพลง)
export function useBgm(): void {
  useEffect(() => {
    ensureBgmPlaying()
  }, [])
}

// ─── Tier Unlock Celebration SFX (Section 1.3 / 8 #2) ───────────────────────
// TODO: asset จริงยังไม่มี — วางไฟล์ที่ client/assets/sounds/sfx_applause.mp3
// แล้วเปลี่ยนบรรทัดล่างเป็น: require('../../assets/sounds/sfx_applause.mp3')
const SFX_APPLAUSE: AudioSource | null = null

// เล่นครั้งเดียว (one-shot ไม่ loop) ตอนแสดง Tier Unlock Celebration — no-op ถ้ายังไม่มี asset
// หมายเหตุ: ไม่ remove() player หลังเล่นจบ (SFX สั้น เรียกไม่บ่อย — ถ้าพบ memory concern จริงตอนมี asset ค่อยเพิ่ม cleanup ผ่าน useAudioPlayerStatus)
export function playApplauseSfx(): void {
  if (!SFX_APPLAUSE) return
  const sfxPlayer = createAudioPlayer(SFX_APPLAUSE)
  sfxPlayer.play()
}
