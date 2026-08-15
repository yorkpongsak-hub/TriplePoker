// gameSfxService.ts
// One-shot gameplay SFX (มติลุงเยาะ 2026-08-15, ขยายรอบ 2 วันเดียวกัน) — reuse pattern เดียวกับ
// sfxLayerService.ts's playOneShot (createAudioPlayer(source).play() ใน try/catch, instance ใหม่
// ต่อครั้ง ไม่ remove() ตาม precedent bgmService.ts/BossVictoryVFX.tsx — SFX สั้น bounded ต่อรอบ
// ไม่ใช่ปัญหา memory) ใช้ expo-audio เท่านั้น (ไม่ใช้ expo-av)
//
// รอบ 2 (มติลุงเยาะ): ลุงเยาะส่งไฟล์จริงมาแทน placeholder synthesized บางส่วน — ดู comment ต่อตัว
// ใน SOUND_MANIFEST.ts ว่าตัวไหนเป็นไฟล์จริงแล้ว/ตัวไหนยังเป็น sine/noise placeholder รอไฟล์จริง
// playCardArrange เดิม (ไฟล์เดียว) แยกเป็น playCardArrange1/playCardArrange2 ตามที่สั่ง — เรียกแยก
// ตามลำดับแตะ (ใบแรก vs ใบที่สอง) ไม่ใช่แค่สลับใบเดียวกันซ้ำ
// The Sage Unicorn Studio Co., Ltd.

import { createAudioPlayer, AudioSource } from 'expo-audio'
import {
  SFX_S10_COUNTDOWN_WARNING,
  SFX_S11_CARD_ARRANGE_1,
  SFX_S11_CARD_ARRANGE_2,
  SFX_S12_AUCTION_BID_TICK,
  SFX_S13_JACKPOT_FANFARE,
  SFX_S13_BOSS_PILE_WIN_THUNDER,
  SFX_S14_CARD_SHUFFLE,
  SFX_S15_CARD_REVEAL,
  SFX_S16_POKER_CHIP,
  SFX_S17_ANTE,
  SFX_S18_AUTOSORT_BUTTON,
  SFX_S19_READY_BUTTON,
} from '../../assets/sounds/SOUND_MANIFEST'

function playOneShot(source: AudioSource | null): void {
  if (!source) return
  try { createAudioPlayer(source).play() } catch { /* no-op — เล่นพลาดไม่ทำแอปพัง */ }
}

// เตือนครั้งเดียวตอนเหลือเวลาจัดไพ่ 3 วิ (คนละตัวกับ S6 timer tick ต่อเนื่อง)
export function playCountdownWarning(): void { playOneShot(SFX_S10_COUNTDOWN_WARNING) }

// ตอนแตะไพ่ใบแรก (เลือกไพ่ที่จะสลับ) ระหว่างจัดมือ
export function playCardArrange1(): void { playOneShot(SFX_S11_CARD_ARRANGE_1) }

// ตอนแตะไพ่ใบที่สอง (สลับตำแหน่งสำเร็จ) ระหว่างจัดมือ
export function playCardArrange2(): void { playOneShot(SFX_S11_CARD_ARRANGE_2) }

// ตอนเคาะราคาประมูล (Blind Auction)
export function playAuctionBidTick(): void { playOneShot(SFX_S12_AUCTION_BID_TICK) }

// เกิด Triple Sweep Jackpot (ใครก็ได้ในโต๊ะ ไม่ใช่แค่ local player)
export function playJackpotFanfare(): void { playOneShot(SFX_S13_JACKPOT_FANFARE) }

// Boss/AI (ไม่ใช่ human) ชนะไพ่กองใดกองหนึ่ง
export function playBossPileWinThunder(): void { playOneShot(SFX_S13_BOSS_PILE_WIN_THUNDER) }

// เริ่ม deal animation ของรอบ (ครั้งเดียวต่อรอบ ไม่ใช่ต่อใบ)
export function playCardShuffle(): void { playOneShot(SFX_S14_CARD_SHUFFLE) }

// แต่ละกองถูกเปิดเผยผลลัพธ์ (pile 1/2/3 reveal) — เล่นทุกกอง ไม่สนว่าใครชนะ
export function playCardReveal(): void { playOneShot(SFX_S15_CARD_REVEAL) }

// ชิพ/เหรียญไหลไปหาผู้ชนะกอง (จุดเดียวกับ FlyingCoins VFX fire())
export function playPokerChip(): void { playOneShot(SFX_S16_POKER_CHIP) }

// หัก Ante ต้นรอบ
export function playAnte(): void { playOneShot(SFX_S17_ANTE) }

// กดปุ่ม AUTO SORT
export function playAutoSortButton(): void { playOneShot(SFX_S18_AUTOSORT_BUTTON) }

// กดปุ่ม READY / ยืนยันการจัดไพ่
export function playReadyButton(): void { playOneShot(SFX_S19_READY_BUTTON) }
