// gameSfxService.ts
// One-shot gameplay SFX (มติลุงเยาะ 2026-08-15) — reuse pattern เดียวกับ sfxLayerService.ts's
// playOneShot (createAudioPlayer(source).play() ใน try/catch, instance ใหม่ต่อครั้ง ไม่ remove()
// ตาม precedent bgmService.ts/BossVictoryVFX.tsx — SFX สั้น bounded ต่อรอบ ไม่ใช่ปัญหา memory)
// ใช้ expo-audio เท่านั้น (ไม่ใช้ expo-av)
//
// แหล่งเสียงทั้ง 5 ตัวตอนนี้เป็น placeholder สังเคราะห์จาก sine/noise (ดู SOUND_MANIFEST.ts's
// S10-S13 comment) ไม่ใช่ไฟล์จริงจาก Sound Designer — โครงสร้างไฟล์นี้ไม่ต้องแก้อะไรเลยตอนได้ไฟล์จริง
// มา (SOUND_MANIFEST.ts ยังเป็นจุดเดียวที่ต้อง swap require path)
// The Sage Unicorn Studio Co., Ltd.

import { createAudioPlayer, AudioSource } from 'expo-audio'
import {
  SFX_S10_COUNTDOWN_WARNING,
  SFX_S11_CARD_ARRANGE,
  SFX_S12_AUCTION_BID_TICK,
  SFX_S13_JACKPOT_FANFARE,
  SFX_S13_BOSS_PILE_WIN_THUNDER,
} from '../../assets/sounds/SOUND_MANIFEST'

function playOneShot(source: AudioSource | null): void {
  if (!source) return
  try { createAudioPlayer(source).play() } catch { /* no-op — เล่นพลาดไม่ทำแอปพัง */ }
}

// เตือนครั้งเดียวตอนเหลือเวลาจัดไพ่ 3 วิ (คนละตัวกับ S6 timer tick ต่อเนื่อง)
export function playCountdownWarning(): void { playOneShot(SFX_S10_COUNTDOWN_WARNING) }

// ตอนแตะ/สลับไพ่ระหว่างจัดมือ
export function playCardArrange(): void { playOneShot(SFX_S11_CARD_ARRANGE) }

// ตอนเคาะราคาประมูล (Blind Auction)
export function playAuctionBidTick(): void { playOneShot(SFX_S12_AUCTION_BID_TICK) }

// เกิด Triple Sweep Jackpot (ใครก็ได้ในโต๊ะ ไม่ใช่แค่ local player)
export function playJackpotFanfare(): void { playOneShot(SFX_S13_JACKPOT_FANFARE) }

// Boss/AI (ไม่ใช่ human) ชนะไพ่กองใดกองหนึ่ง
export function playBossPileWinThunder(): void { playOneShot(SFX_S13_BOSS_PILE_WIN_THUNDER) }
