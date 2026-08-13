/**
 * index.tsx — Boss Monarch 1v1 (1 Human + 2 Minion + Monarch)
 * Table layout: pull model (monarch_join) ตาม known bug #2 — ต่อ socket ใหม่แล้วขอ state เอง ไม่รอ
 * push จาก matchmaking socket เดิม (disconnect ไปแล้วตอน navigate มาหน้านี้)
 * Arrangement (Sprint 6 -> Batch 1 Task 6): reuse PlayerHandView ไฟล์กลางเดียวกับทุก Tier — tap
 * เลือกใบ + tap อีกใบเพื่อสลับตำแหน่ง แล้วกด Confirm Arrangement เท่านั้น (ไม่มีปุ่มช่วยจัดไพ่ใดๆ
 * ในโต๊ะนี้ตาม canon — เอาปุ่ม Auto Arrange ออกแล้ว) ส่ง arrangement เองเสมอ — ถ้า foul server จะ
 * ยอมรับ submit ปกติแล้วปล่อยให้แพ้ตามกติกา Foul (ไม่ตีกลับให้แก้ใหม่แบบเดิมอีกต่อไป) หมดเวลา 60s
 * แล้วยังไม่ submit server จะ auto-seal ให้ตามลำดับไพ่ที่แจกจริง (ยังไม่มี UI countdown ในบัตช์นี้)
 * G1/G2 เป็น reveal ธรรมดา, G3 มี Grand Finale Call/Fold จริง (Minion auto-fold ทันที เหลือ
 * Human↔Boss เท่านั้นที่ตัดสินใจ) จบแมตช์ทันทีหลัง G3 (Monarch เป็นแมตช์รอบเดียว)
 * Sprint 11 — production polish: รูปไพ่จริง (CARD_IMG), avatar Boss/Minion จริง, GameTopBar +
 * leftSlot มาตรฐาน (เทียบ Initiate ต้นแบบ), deal animation (เทียบ mastermind startDealAnimation),
 * BossVictoryVFX tier="monarch" ตอน Human ชนะ G3
 * roomId/userId มาจาก route param (redirect จาก lobby.tsx ตอน roll เจอ Monarch ที่โต๊ะ A+)
 * The Sage Unicorn Studio Co., Ltd.
 */

import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator, Animated, Image, ImageBackground, Modal, Platform, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { io, Socket } from 'socket.io-client'
import { router, useLocalSearchParams } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
// Batch 2 (Monarch v2.2 Pressure & Seal) — Reanimated v4 (ตามที่ติดตั้งจริงใน package.json, ไม่ใช่ v3)
// ใช้ชื่อ Reanimated แทน Animated กัน collision กับ Animated เดิมจาก react-native ที่ไฟล์นี้ใช้อยู่แล้ว
// ทั่วทั้งไฟล์ (deal animation/boss intro glow/toast) — ของเดิมทั้งหมดไม่แตะ ยังใช้ classic Animated API เดิม
import Reanimated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated'
import PlayerHandView, { HandCardData } from '../../../src/components/game/PlayerHandView'
import { CARD_IMG, CARD_BACK_IMG } from '../../../src/components/game/cardAssets'
import { MINION_AVATAR } from '../../../src/constants/minionAvatars'
import GameTopBar from '../../../src/components/game/GameTopBar'
import { AvatarDisplay, PRESET_AVATARS } from '../../../src/components/profile/AvatarPicker'
import { useAuthStore } from '../../../src/store/authStore'
import BossVictoryVFX from '../../../src/components/vfx/BossVictoryVFX'
import { getReduceMotion } from '../../../src/utils/reduceMotion'
// Batch 4 — SFX layer เท่านั้น ห้าม import bgmService (ไม่มี BGM ในโต๊ะเกมทุก Tier ตาม canon)
import * as sfxLayerService from '../../../src/services/sfxLayerService'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'

const bossAvatarImg = require('../../../assets/bosses/boss_Monarch_avatar.png')
const MONARCH_TABLE_SKIN = require('../../../assets/tables/boss_monarch_skin_table.png')

// Monarch เป็น 1v1 (Human คนเดียวเสมอ ไม่มี human คนอื่น) — อ่าน vip_status ของ session ตรงๆ ในนี้ได้เลย
// ไม่ต้องส่งผ่าน prop จาก caller ทั้ง 4 จุด (ต่างจาก Adept/High Noble/VIP Plus ที่มีหลาย seat จริง)
function MonarchPlayerAvatar({ value, size }: { value?: string; size: number }) {
  const isVip = useAuthStore(s => (s.profile?.vip_status ?? 'none') !== 'none')
  const preset = value ? PRESET_AVATARS.find(item => item.key === value) : undefined
  if (preset) {
    return <AvatarDisplay config={{ type: 'preset', presetKey: preset.key, frameKey: isVip ? 'gold' : 'default' }} size={size} showFrame={isVip} />
  }
  const borderColor = isVip ? '#FFD76A' : '#2A4A34'
  if (value && /^(https?:|data:)/i.test(value)) {
    return <Image source={{ uri: value }} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor }} resizeMode="cover" />
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor, backgroundColor: '#132019', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: Math.round(size * 0.52) }}>{value || '🧑'}</Text>
    </View>
  )
}

// Boss Intro Popup — เนื้อหาเดียวกับ BOSS_INTRO['Monarch'] เดิมใน highNoble/index.tsx:85-90
// (รูปมาสเตอร์ + quote เดียวกันเป๊ะ) แต่ Monarch มีบอสแค่ตัวเดียวเสมอ ไม่ต้องทำ lookup map ตามชื่อ
const MONARCH_INTRO = {
  image: require('../../../assets/bosses/boss_Monarch.png'),
  title: 'MONARCH',
  subtitle: 'THE WATCHER',
  quote: 'Power is easy to claim. Restraint is harder to prove.',
}

// ── Batch 3B Task 1 — Fake Four Gods Intro (ก่อนสะดุด) ─────────────────────
// Copy ข้อมูลจาก BOSS_INTRO ใน highNoble/index.tsx ตรงๆ (รูป + quote แรกของแต่ละตน) — ไม่ import
// ข้ามไฟล์ route กัน (Expo Router ไม่รองรับ/ไม่ควร import ข้าม screen file) reuse เจตนา duplicate
// เทียบ pattern เดียวกับ cardKey()/delay() ที่ duplicate ข้าม engine file อยู่แล้วในโปรเจคนี้
const FAKE_FOUR_GODS = [
  { name: 'Reaper', image: require('../../../assets/bosses/boss_reaper.png'), quote: "You've climbed far, mortal. But every soul that sits across from me... eventually folds." },
  { name: 'The Crag', image: require('../../../assets/bosses/boss_crag.png'), quote: 'A thousand storms have broken against me. Not one has moved me an inch.' },
  { name: 'Cortex', image: require('../../../assets/bosses/boss_cortex.png'), quote: 'Emotion is noise. I do not fold to fear, and I do not call out of pride. Only the numbers decide.' },
  { name: 'Cipher', image: require('../../../assets/bosses/boss_cipher.png'), quote: 'Reaper is wrath. The Crag is stone. Cortex is cold arithmetic. And I... am none of them. I am all of them. I am whichever I feel like being tonight.' },
]

// ── Batch 3B Task 3 — Crown Assembly: reuse asset เดิมจาก BossVictoryVFX.tsx (มีอยู่แล้วในโปรเจค
// ไม่ต้องสร้าง asset ใหม่) crossfade lv1->lv2->lv3 เดียวกับที่ tier='monarch' victory VFX ใช้อยู่แล้ว
const CROWN_LV1 = require('../../../assets/vfx/crowns/crown_tier4_lv1.png')
const CROWN_LV2 = require('../../../assets/vfx/crowns/crown_tier4_lv2.png')
const CROWN_LV3 = require('../../../assets/vfx/crowns/crown_tier4_lv3.png')

// ── Batch 3B Task 4 — Monarch Reveal text (ไล่บรรทัด, แทนที่ MONARCH_INTRO.quote เดิมที่โชว์ทีเดียว) ──
const MONARCH_REVEAL_LINES = [
  'A shadow falls over the table...',
  'THE MONARCH HAS ARRIVED',
  'One round. One chance.',
  'Defeat the Monarch to claim a Royal Relic.',
]

// ── Batch 3B Task 5 — Dialogue เปิดโต๊ะครั้งแรก (คงที่เสมอ ไม่มี Fake Memory — ตัดจาก MVP ตามมติ) ──
const MONARCH_FIRST_MEETING_QUOTE = 'I have waited years for one stronger than me. What I fear... is the day that one truly arrives.'

// Rise lore bridge: keep the first Monarch victory mysterious. The full truth belongs
// to the later Soren/CAELUM encounters and must not be exposed in this early hook.
const MONARCH_VICTORY_LORE = 'The known rules are only the first gate. Someone still guards the last.'
const MONARCH_VICTORY_TOAST = 'You have proven strength. Now prove you can carry what waits beyond the rules.'

const COLOR = {
  bg: '#0F2418',
  bgPanel: '#163A25',
  gold: '#FFD76A',
  green: '#8DFFB5',
  red: '#FF6B6B',
  text: '#F5F2E8',
  textSecondary: '#C8C4B0',
  border: '#2A4A34',
}

// Sprint 6-7 UI/UX Addendum (Canon Bridge v1.2 §8) — สีเฉพาะของ Monarch เพิ่มจาก theme หลัก
// ใช้แยกจาก COLOR.gold ปกติ ให้ที่นั่ง Monarch เด่นกว่าที่นั่งอื่นชัดเจนตาม §8.2
const MONARCH_ACCENT = {
  gold: '#E8C865',
  overlay: 'rgba(0, 18, 10, 0.28)',
  dashedBorder: '#D6B95F',
}

// ตำแหน่งปลายทางของ deal animation สัมพัทธ์กับจุดกึ่งกลาง tableArea (Boss=บน, Minion2=ขวา,
// Human=ล่าง, Minion1=ซ้าย) — เทียบ SEAT_TARGETS ของ mastermind/index.tsx แต่ระยะย่อลงให้เข้ากับ
// เลย์เอาต์ที่เล็กกว่า (ไม่มีพื้นหลังโต๊ะเต็มจอ)
const DEAL_TARGETS = [
  { x: 0,    y: -150 }, // Boss (บน)
  { x: 130,  y: -30  }, // Minion 2 (ขวา)
  { x: 0,    y: 160  }, // Human (ล่าง)
  { x: -130, y: -30  }, // Minion 1 (ซ้าย)
]
const DEAL_COUNT = 44 // 11 ใบ x 4 ที่นั่ง

type Seat = { id: string; role: 'human' | 'minion1' | 'minion2' | 'boss'; isHuman: boolean; name: string; emoji: string; avatarUrl?: string }

type RoundSnapshot = {
  roomId: string
  phase: string
  seats: Seat[]
  yourCards: string[]
  yourArrangement?: { g1: string[]; g2: string[]; g3: string[] } | null
  commA: string[]
  commB: string[]
  tokenBalance: Record<string, number>
  buyInAmount: number
  // Batch 2 (approved delta): เพิ่ม field นี้เข้า type — ค่าจริงถูกส่งมาจาก server ตั้งแต่ Batch 1 แล้ว
  // (monarchEngine.ts's buildMonarchRoundSnapshot) แค่ยังไม่เคยถูกประกาศ/ใช้ฝั่ง client เท่านั้น
  arrangementDeadlineAt?: number | null
  // Batch 3E Task 3/6 — Full Reconnect: null ถ้ายังไม่ถึงจุดนั้น shape เดียวกับ event สดที่เคย emit
  // ผ่าน monarch_g1_result/monarch_g2_result/monarch_grand_finale_start เป๊ะ (ดู hydrateFromReconnect)
  g1Result?: G1Result | null
  g2Result?: G2Result | null
  grandFinale?: GrandFinaleStart | null
}

// ── Batch 2 (Monarch v2.2 §7) — Arrangement Pressure ────────────────────────
// รวม 60 ต้องตรงกับ gameConfig.monarchConfig.arrangementDeadlineMs ฝั่ง server — เป็นค่า
// canon ล็อกแล้ว (v2.2 §1 ข้อ 6) ไม่ใช่ config ที่ client ต้องรู้แบบไดนามิก จึง hardcode คู่กันได้ตรงนี้
const ARRANGEMENT_TOTAL_SEC = 60

type PressurePhase = 'calm' | 'tension' | 'critical' | 'final'

// ช่วงตาม Task 2 เป๊ะ: calm 40-21 / tension 20-11 / critical 10-4 / final 3-0 (exclusive bands
// สำหรับ state machine เดียว — ต่างจากตาราง narrative ใน v2.2 §7 ที่โชว์ critical เป็น 10-0 กว้างๆ
// เพราะเอกสารนั้นพูดถึง final เป็น "3 วินาทีสุดท้ายของ critical" ไม่ใช่ state แยกกันจริง)
function phaseForRemaining(remainingSec: number): PressurePhase {
  if (remainingSec <= 3) return 'final'
  if (remainingSec <= 10) return 'critical'
  if (remainingSec <= 20) return 'tension'
  return 'calm'
}

// ── Batch 2 Task 9 → Batch 4 — Audio hook เสียบ sfxLayerService จริงแล้ว ────────────────────────
// (ต้นแบบโครงสร้างจาก bgmService.ts แต่แยกไฟล์ใหม่ ห้ามยัดเข้า BGM manager เดิม — ดู
// bgmService.ts's comment "ในโต๊ะเกมทุก Tier ไม่มี BGM เด็ดขาด") ห้าม import bgmService ในไฟล์นี้
// เด็ดขาดตามมติ — ทุกฟังก์ชันใน sfxLayerService เป็น no-op เงียบๆ เองอยู่แล้วถ้ายังไม่มี asset จริง
// (null-placeholder pattern) จึงเรียกตรงๆ ได้เลยไม่ต้อง guard ซ้ำที่นี่
type MonarchAudioCue =
  | 'phase_calm' | 'phase_tension' | 'phase_critical' | 'phase_final'
  | 'tick' | 'crown_strike' | 'seal_stamp' | 'silence_cut'
function onMonarchCue(cue: MonarchAudioCue): void {
  switch (cue) {
    // phase_calm ทำหน้าที่ "start ambient" จริง (ไม่ใช่ตอน mount) กัน ambient ทับ silence_cut ของ
    // Stumble fake-out ที่เล่นไปก่อนหน้านั้นแล้ว (ดู Batch 4 audit ข้อ 8) idempotent เรียกซ้ำได้ปลอดภัย
    case 'phase_calm': sfxLayerService.startAmbient(); break
    case 'phase_tension': sfxLayerService.setHeartbeatPhase('tension'); break
    case 'phase_critical': sfxLayerService.setHeartbeatPhase('critical'); break
    case 'phase_final': sfxLayerService.setHeartbeatPhase('final'); break
    case 'tick': sfxLayerService.playTick(); break
    case 'crown_strike': sfxLayerService.playCrownStrike(); break
    case 'seal_stamp': sfxLayerService.playSealStamp(); break
    // silence_cut — ตัดเงียบดราม่า (fake-out/Royal Silence/ก่อน G3) ไม่มี "restore" คู่กันโดยตั้งใจ:
    // fake-out ถูก restore เองตอน phase_calm เรียก startAmbient() ในไม่ช้า (reassert volume ทุกครั้ง),
    // Royal Silence ปล่อยให้เงียบค้างจนกว่า phase ถัดไปจะเปลี่ยน (นี่คือ "psychological attack" ตาม
    // canon Batch 2 ตั้งใจให้เงียบ ไม่ใช่บั๊ก), ก่อน G3 ก็ใกล้จบแมตช์แล้ว stopAll() จะเคลียร์ให้เองไม่ช้า
    case 'silence_cut': sfxLayerService.duckAll(0, 200); break
  }
}

// ── Batch 2 Task 6 — Royal Silence (สุ่ม client ได้ เป็น psychological effect ไม่ใช่ข้อมูลเกม) ──
const ROYAL_SILENCE_LINES = [
  'Do not rush.',
  'Your weakest pile will betray you.',
  'You have seen only part of the game.',
  'Choose carefully. This moment will not return.',
]

type G1Result = {
  g1Winner: string | null
  foulMap: Record<string, boolean>
  reveals: Array<{ id: string; g1Cards: string[] }>
  tokenBalance: Record<string, number>
}

type G2Result = {
  g2Winner: string | null
  foulMap: Record<string, boolean>
  reveals: Array<{ id: string; g2Cards: string[] }>
  tokenBalance: Record<string, number>
}

type GrandFinaleStart = {
  foldedPlayers: string[]
  pot: number
  callAmount: number
  turn: 'human' | 'boss'
  round: 1 | 2
  revealedCount: 0 | 3 | 4
  reveals?: Array<{ id: string; g3Cards: string[] }>
}

type GrandFinaleActionUpdate = {
  playerId: string
  action: 'call' | 'fold'
  pot: number
  tokenBalance: Record<string, number>
  round: 1 | 2
}

type GrandFinaleRoundComplete = {
  round: 1 | 2
  revealedCount: 3 | 4
  reveals: Array<{ id: string; g3Cards: string[] }>
  pot: number
  tokenBalance: Record<string, number>
}

type G3Result = {
  g3Winner: string
  foldedPlayers: string[]
  reveals: Array<{ id: string; g3Cards: string[] }>
  tokenBalance: Record<string, number>
}

// Batch 3D-2 Task 1 — mirror ของ MonarchRelicResult ฝั่ง server (monarchSpawn.ts) ตรงๆ field ต่อ field
// undefined/ค่าไม่ครบได้เสมอ (แพ้ไม่มี relicResult เลย, roll พลาดฝั่ง server ก็ null -> undefined ที่นี่)
type MonarchRelicResult = {
  relicId?: string
  label?: string
  lore?: string
  isNew: boolean
  collectionComplete?: boolean
  tokenBonus?: number
}

type MatchEnd = {
  finalStack: number
  tokenBalance: number | null
  isVictory?: boolean
  // Batch 3C-2 Task 1 — field อ่านอย่างเดียว (server เพิ่มเข้า payload เดิม ไม่กระทบ settlement)
  foulReasons?: Record<string, string>
  // Batch 3D-1 Task 5 — field อ่านอย่างเดียวเช่นกัน (server ไม่แตะ settlement เลย)
  relicResult?: MonarchRelicResult
}

// แถวรูปไพ่จริง (ใช้แสดง Community + G1/G2/G3 reveal — PlayerHandView เองก็ใช้ CARD_IMG อยู่แล้ว
// สำหรับกองที่จัดเอง จุดนี้เสริมส่วนที่เหลือซึ่งเดิมเป็นตัวอักษรล้วน)
// Batch 3C-2 Task 3 — เพิ่ม revealCount (optional, undefined = โชว์ครบเหมือนเดิมทุกจุดที่ใช้อยู่แล้ว)
// ให้บังคับปิดไพ่บางใบเป็น card-back ได้จากชั้น UI ล้วนๆ โดยไม่ต้องเปลี่ยน keys ที่รับมาจาก server เลย
function CardImageRow({
  keys,
  size = 34,
  height,
  revealCount,
  cardStep,
}: {
  keys: string[]
  size?: number
  height?: number
  revealCount?: number
  cardStep?: number
}) {
  const h = height ?? Math.round(size * 1.4)
  const overlapMargin = cardStep === undefined
    ? -Math.round(size * 0.35)
    : -(size - Math.min(cardStep, 10))
  return (
    <View style={{ flexDirection: 'row' }}>
      {keys.map((k, i) => (
        <Image
          key={`${k}-${i}`}
          source={revealCount !== undefined && i >= revealCount ? CARD_BACK_IMG : (CARD_IMG[k] ?? CARD_BACK_IMG)}
          style={{ width: size, height: h, borderRadius: 3, marginLeft: i === 0 ? 0 : overlapMargin }}
          resizeMode="cover"
        />
      ))}
    </View>
  )
}

// Grand Finale keeps a stable five-card row. Called/revealed cards separate vertically instead
// of disappearing from the hand: Boss moves down, Human moves up (Mastermind presentation).
function MonarchGFHandRow({
  cards,
  movedCount,
  direction,
  showAllFaces = false,
  selectedKeys = [],
  onToggleSelect,
  movedKeys,
}: {
  cards: string[]
  movedCount: number
  direction: 'up' | 'down'
  showAllFaces?: boolean
  selectedKeys?: string[]
  onToggleSelect?: (key: string) => void
  movedKeys?: string[]
}) {
  const width = direction === 'up' ? 54 : 48
  const height = direction === 'up' ? 78 : 69
  const slots = Array.from({ length: 5 }, (_, i) => cards[i])
  return (
    <View style={{ flexDirection: 'row', height: height + 44, alignItems: direction === 'up' ? 'flex-end' : 'flex-start' }}>
      {slots.map((code, i) => {
        const movedIndex = movedKeys && code ? movedKeys.indexOf(code) : i
        const moved = movedKeys ? movedIndex >= 0 : i < movedCount
        const isSelected = !!code && selectedKeys.includes(code)
        const faceUp = showAllFaces || (moved && !!code)
        const isFirstCallFan = moved && movedIndex < 3
        const fanAngles = [-12, 0, 12]
        const fanX = [-6, 0, 6]
        const fanArc = [5, 0, 5]
        const baseY = moved ? (direction === 'down' ? 40 : -40) : 0
        return (
          <TouchableOpacity
            key={`gf-${direction}-${i}-${code ?? 'sealed'}`}
            style={{
              width,
              height,
              marginLeft: i === 0 ? 0 : -Math.round(width * 0.42),
              borderRadius: 4,
              overflow: 'hidden',
              borderWidth: isSelected ? 3 : 1.5,
              borderColor: isSelected ? '#62E58A' : moved ? '#FFD76A' : 'rgba(201,168,76,0.55)',
              transform: [
                { translateX: isFirstCallFan ? fanX[movedIndex] : 0 },
                { translateY: baseY + (isFirstCallFan ? (direction === 'down' ? fanArc[movedIndex] : -fanArc[movedIndex]) : 0) },
                { rotate: isFirstCallFan ? `${fanAngles[movedIndex]}deg` : '0deg' },
              ],
              zIndex: moved ? 10 + i : i,
            }}
            disabled={!code || moved || !onToggleSelect}
            onPress={() => code && onToggleSelect?.(code)}
          >
            <Image
              source={faceUp && code && CARD_IMG[code] ? CARD_IMG[code] : CARD_BACK_IMG}
              style={{ width, height }}
              resizeMode="cover"
            />
            {isSelected && (
              <View style={{ position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: '#2DBE64', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#08150D', fontWeight: '900', fontSize: 15 }}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ── Batch 2 Task 2 — MonarchTimer ───────────────────────────────────────────
// Timer rule (CLAUDE.md known bug class): ค่าที่เปลี่ยนทุกวินาที (remaining) ต้องอยู่ใน component ลูก
// ที่ตั้ง useState/setInterval "ของตัวเอง" ห้ามยกขึ้นไปเป็น useState ที่ parent (MonarchScreen ครอบ
// PlayerHandView ซึ่งหนักด้วยรูปไพ่) — parent ได้รับรู้แค่ "phase เปลี่ยน" ผ่าน onPhaseChange
// (เรียกแค่ ~3 ครั้งตลอด 60s ตอน phase transition จริง ไม่ใช่ทุกวินาที) ส่วน onTick ยิงทุกวินาทีแต่
// เป็นแค่ callback เปล่าที่ parent ใช้ทำ side-effect แบบ ref เท่านั้น (ไม่ setState ทุก tick)
// source of truth = arrangementDeadlineAt (epoch ms จาก server) คำนวณ remaining จาก Date.now() สด
// ทุก tick ห้ามนับถอยหลังสะสมเอง (กัน drift + กัน background/foreground)
function MonarchTimer({
  deadlineAt, stopped, onPhaseChange, onTick,
}: {
  deadlineAt: number | null | undefined
  stopped: boolean
  onPhaseChange?: (phase: PressurePhase) => void
  onTick?: (remainingSec: number) => void
}) {
  const computeRemaining = () => {
    if (!deadlineAt) return ARRANGEMENT_TOTAL_SEC
    return Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000))
  }
  const [remaining, setRemaining] = useState(computeRemaining)
  const lastPhaseRef = useRef<PressurePhase>(phaseForRemaining(computeRemaining()))

  useEffect(() => {
    if (stopped || !deadlineAt) return
    setRemaining(computeRemaining()) // sync ทันทีตอน deadline มาถึง/เปลี่ยน (กัน mount ช้ากว่า deadline)
    const interval = setInterval(() => {
      const next = computeRemaining()
      setRemaining(next)
      onTick?.(next)
      const phase = phaseForRemaining(next)
      if (phase !== lastPhaseRef.current) {
        lastPhaseRef.current = phase
        onPhaseChange?.(phase)
      }
      if (next <= 0) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineAt, stopped])

  const phase = phaseForRemaining(remaining)
  const baseScale = useSharedValue(1)
  const pulse = useSharedValue(1)

  useEffect(() => {
    baseScale.value = withTiming(phase === 'calm' ? 1 : 1.1, { duration: 250 })
  }, [phase])

  useEffect(() => {
    if (phase === 'critical' || phase === 'final') {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 400, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.0, { duration: 400, easing: Easing.inOut(Easing.sin) }),
        ),
        -1, true,
      )
    } else {
      pulse.value = withTiming(1, { duration: 200 })
    }
  }, [phase])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: baseScale.value * pulse.value }],
  }))

  if (stopped) return null // Batch 2 Task 7 — หลัง seal timer หยุดแสดงทั้งหมด

  const color = phase === 'final' ? MONARCH_TIMER_COLOR.final : MONARCH_TIMER_COLOR.normal
  const fontFamily = phase === 'critical' || phase === 'final' ? 'JetBrainsMono_600SemiBold' : 'JetBrainsMono_400Regular'

  return (
    <Reanimated.View style={[monarchTimerStyles.wrap, animatedStyle]} pointerEvents="none">
      <Text style={[monarchTimerStyles.text, { color, fontFamily }]}>{remaining}</Text>
    </Reanimated.View>
  )
}

const MONARCH_TIMER_COLOR = { normal: '#FFD76A', final: '#FF6B6B' }

const monarchTimerStyles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 4 },
  text: { fontSize: 28, letterSpacing: 1 },
})

// ── Batch 2 Task 3 (แก้ตามคำสั่งใหม่) — Vignette เป็นแถบขอบบน/ล่างเท่านั้น ไม่ทับกลางจอ (พื้นที่
// PlayerHandView) เดิมเคย darken เต็มจอทำให้ไพ่กลางจอมืดตามไปด้วย ขัด §7 "ห้ามรบกวนการจัดไพ่" —
// ใช้ expo-linear-gradient 2 ชั้น (บน: เข้ม->ใส, ล่าง: ใส->เข้ม) แถบละ ~25% ของความสูงจอ เหลือแถบกลาง
// ~50% โปร่งเสมอ ไม่ใช่ radial (lib รองรับแค่ linear) สีเข้ม = #0F2418 (BG canon) ไม่ใช่ดำล้วน —
// opacity ปลายขอบยังขับด้วย phase เดิมทุกประการ (calm 0 / tension 0.35 / critical-final 0.55) ผ่าน
// Reanimated withTiming เหมือนเดิม แค่ย้ายจากทับทั้งจอมาเป็น wrapper ครอบแค่ 2 แถบขอบแทน
function MonarchVignette({ phase }: { phase: PressurePhase }) {
  const opacity = useSharedValue(0)
  useEffect(() => {
    const target = phase === 'calm' ? 0 : phase === 'tension' ? 0.35 : 0.55 // critical/final เท่ากันตาม §7
    opacity.value = withTiming(target, { duration: 900 })
  }, [phase])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <>
      <Reanimated.View pointerEvents="none" style={[monarchVignetteStyles.top, style]}>
        <LinearGradient
          colors={['rgba(15,36,24,1)', 'rgba(15,36,24,0)']}
          style={StyleSheet.absoluteFill}
        />
      </Reanimated.View>
      <Reanimated.View pointerEvents="none" style={[monarchVignetteStyles.bottom, style]}>
        <LinearGradient
          colors={['rgba(15,36,24,0)', 'rgba(15,36,24,1)']}
          style={StyleSheet.absoluteFill}
        />
      </Reanimated.View>
    </>
  )
}

const monarchVignetteStyles = StyleSheet.create({
  // แถบละ 25% (อยู่ในช่วง 22-28% ที่ขอ) เหลือ 50% ตรงกลางโปร่งเสมอ — โซนนี้คือที่ตั้งของ
  // community/PlayerHandView จริง (ดู tableArea/humanPanel ด้านล่าง)
  top: { position: 'absolute', top: 0, left: 0, right: 0, height: '25%', zIndex: 5 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '25%', zIndex: 5 },
})

// ── Batch 2 Task 5/6 — Dialogue line ใกล้ Portrait (ใช้ร่วมกันทั้ง Sealed Signal และ Royal Silence
// เพราะช่วงเวลาที่ทั้งสองอย่างโผล่ไม่มีทางชนกัน — Sealed Signal อยู่ remaining 28-32s (calm),
// Royal Silence อยู่ remaining 6-10s (critical) คนละช่วงกันเป๊ะ) แยกจาก toastBox เดิม (Sprint 6-7)
// เพราะ font/สี/จังหวะต่างกัน (Cinzel/#C8C4B0/400-2500-600ms vs Inter/#F5F2E8/300-3900-300ms)
function MonarchDialogueLine({ text, animValue }: { text: string | null; animValue: Animated.Value }) {
  if (!text) return null
  return (
    <Animated.View style={[monarchDialogueStyles.wrap, { opacity: animValue }]} pointerEvents="none">
      <Text style={monarchDialogueStyles.text}>{text}</Text>
    </Animated.View>
  )
}

const monarchDialogueStyles = StyleSheet.create({
  wrap: {
    position: 'absolute', top: 70, left: 24, right: 24, zIndex: 400,
    alignItems: 'center',
  },
  text: {
    color: '#C8C4B0', fontFamily: 'Cinzel_400Regular', fontSize: 14, textAlign: 'center', lineHeight: 20,
  },
})

// ── Batch 2 Task 3 — wrapper เรืองแสงรอบมือผู้เล่น (border/shadow แบบ static ตรงนี้ ส่วน opacity
// ไดนามิกมาจาก handGlowStyle ที่คำนวณใน MonarchScreen เอง) borderWidth ต้องตั้งไว้ล่วงหน้าเสมอ
// ไม่งั้น borderColor แบบ animated จะไม่มีอะไรให้ render ทับ
const monarchHandGlowStyles = StyleSheet.create({
  wrap: { borderWidth: 2, borderColor: 'transparent', borderRadius: 16, padding: 6 },
})

// ── Batch 3C-1 Task 5 — Crown Ledger HUD ─────────────────────────────────────
// ⚠️ Crown เป็นแค่ visual weight (ใครชนะกองไหน) ไม่ใช่กติกาตัดสินผลแมตช์จริง — net token (Task 1)
// ตัดสินแพ้/ชนะจริงเสมอ อาจไม่ตรงกัน (Crown 2-1 ให้ You แต่ net ติดลบ) โดยตั้งใจ ไม่ใช่บั๊ก
const CROWN_SLOT_PX: Record<'small' | 'medium' | 'large', number> = { small: 20, medium: 30, large: 46 }

function CrownSlot({ won, size }: { won: boolean; size: 'small' | 'medium' | 'large' }) {
  const opacity = useSharedValue(0)
  const scale = useSharedValue(0.5)
  useEffect(() => {
    opacity.value = withTiming(won ? 1 : 0, { duration: 300 })
    scale.value = withTiming(won ? 1 : 0.5, { duration: 300 })
  }, [won])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }))
  const px = CROWN_SLOT_PX[size]
  const h = Math.round(px * 220 / 240) // สัดส่วนเดียวกับ crownImg เดิม (240x220) ของ Batch 3B
  const imgSrc = size === 'small' ? CROWN_LV1 : size === 'medium' ? CROWN_LV2 : CROWN_LV3
  return (
    <View style={[crownLedgerStyles.slot, { width: px, height: h }]}>
      {/* G3 = ใหญ่+รัศมี (glow เบาๆ รอบมงกุฎ เฉพาะกองตัดสิน) */}
      {size === 'large' && <Reanimated.View pointerEvents="none" style={[crownLedgerStyles.g3Glow, style]} />}
      <Reanimated.View style={style}>
        <Image source={imgSrc} style={{ width: px, height: h }} resizeMode="contain" />
      </Reanimated.View>
    </View>
  )
}

function CrownLedger({
  youCrown1, youCrown2, youCrown3, bossCrown1, bossCrown2, bossCrown3,
}: {
  youCrown1: boolean; youCrown2: boolean; youCrown3: boolean
  bossCrown1: boolean; bossCrown2: boolean; bossCrown3: boolean
}) {
  return (
    <View style={crownLedgerStyles.wrap} pointerEvents="none">
      <View style={crownLedgerStyles.row}>
        <Text style={crownLedgerStyles.label}>You</Text>
        <CrownSlot won={youCrown1} size="small" />
        <CrownSlot won={youCrown2} size="medium" />
        <CrownSlot won={youCrown3} size="large" />
      </View>
      <View style={crownLedgerStyles.row}>
        <Text style={crownLedgerStyles.label}>Monarch</Text>
        <CrownSlot won={bossCrown1} size="small" />
        <CrownSlot won={bossCrown2} size="medium" />
        <CrownSlot won={bossCrown3} size="large" />
      </View>
    </View>
  )
}

const crownLedgerStyles = StyleSheet.create({
  wrap: {
    position: 'absolute', top: 64, alignSelf: 'center', zIndex: 50,
    backgroundColor: 'rgba(15,36,24,0.85)', borderColor: '#2A4A34', borderWidth: 1,
    borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 2 },
  label: { color: '#C8C4B0', fontSize: 10, fontWeight: '700', width: 46 },
  slot: { alignItems: 'center', justifyContent: 'center' },
  g3Glow: {
    position: 'absolute', width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,215,106,0.25)',
  },
})

// ── Batch 3D-2 — Royal Relic Reveal popup (inline, pattern เดียวกับ TierUnlockOverlay.tsx: scrim fade
// -> card scale+spring -> gold particle burst -> label/lore fade -> ปุ่ม CONTINUE ปิดทางเดียว) ──────
// relicId -> type mapping ก็อปมาจาก MONARCH_RELICS ฝั่ง server (monarchSpawn.ts) ตรงๆ เพราะ payload
// relicResult (Batch 3D-1 Task 5) ตั้งใจไม่ส่ง field "type" มาด้วย (ไม่ใช่ bug) เป็นแค่ metadata
// แสดงผลเล็กๆ ไม่ใช่ gameplay data จึง duplicate ฝั่ง client ได้ปลอดภัย เทียบ pattern เดียวกับ
// FAKE_FOUR_GODS ที่ duplicate ข้าม client/server ในไฟล์นี้อยู่แล้ว — ห้ามแตะ server เพิ่ม field ตามกฎ batch นี้
const RELIC_TYPE_LABEL: Record<string, string> = {
  blank_crest: 'AVATAR CREST',
  refused_crown: 'CARD FRAME',
  zero_mark: 'CARD FRAME',
  monarchs_witness: 'TITLE',
  the_unbowed: 'TITLE',
  faceless_joker: 'AVATAR CREST',
}

const RELIC_PARTICLE_COUNT = 10
const RELIC_PARTICLE_RADIUS = 100
const RELIC_CARD_SIZE = 110

// Particle เดี่ยว พุ่งออกจากจุดศูนย์กลางการ์ดแล้วจางหาย (เทียบ pattern เดียวกับ TierUnlockOverlay.tsx)
function RelicParticle({ angle, delay }: { angle: number; delay: number }) {
  const progress = useSharedValue(0)
  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }))
    // เริ่มครั้งเดียวตอน mount เท่านั้น
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const style = useAnimatedStyle(() => {
    const dist = progress.value * RELIC_PARTICLE_RADIUS
    return {
      opacity: 1 - progress.value,
      transform: [
        { translateX: Math.cos(angle) * dist },
        { translateY: Math.sin(angle) * dist },
        { scale: 1 - progress.value * 0.5 },
      ] as any,
    }
  })
  return <Reanimated.View style={[relicRevealStyles.particle, style]} />
}

function RoyalRelicReveal({ result, onClose }: { result: MonarchRelicResult; onClose: () => void }) {
  const scrimOpacity = useSharedValue(0)
  const cardScale = useSharedValue(0.6)
  const titleOpacity = useSharedValue(0)
  const bodyOpacity = useSharedValue(0)
  const buttonOpacity = useSharedValue(0)

  useEffect(() => {
    scrimOpacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) })
    cardScale.value = withDelay(250, withSpring(1, { damping: 9, stiffness: 120 }))
    titleOpacity.value = withDelay(700, withTiming(1, { duration: 400 }))
    bodyOpacity.value = withDelay(950, withTiming(1, { duration: 400 }))
    buttonOpacity.value = withDelay(1300, withTiming(1, { duration: 300 }))
    // Sequence เริ่มครั้งเดียวตอน mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimOpacity.value }))
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }] as any }))
  const titleStyle = useAnimatedStyle(() => ({ opacity: titleOpacity.value }))
  const bodyStyle = useAnimatedStyle(() => ({ opacity: bodyOpacity.value }))
  const buttonStyle = useAnimatedStyle(() => ({ opacity: buttonOpacity.value }))

  const particles = Array.from({ length: RELIC_PARTICLE_COUNT }, (_, i) => i)

  // Batch 3D-2 Task 2 — 2 โหมด: relic ใหม่จริง (isNew) กับเก็บครบแล้ว (collectionComplete, ไม่มี relic ใหม่ให้)
  const isComplete = !!result.collectionComplete
  const relicType = result.relicId ? RELIC_TYPE_LABEL[result.relicId] : undefined
  // Batch 3D-2 Task 3 — ชนะครั้งแรกในชีวิต (blank_crest) เน้นพิเศษกว่าปกติเล็กน้อย ถือเป็น milestone
  const isFirstVictory = result.relicId === 'blank_crest'

  return (
    <Reanimated.View style={[relicRevealStyles.scrim, scrimStyle]} pointerEvents="auto">
      <View style={relicRevealStyles.center}>
        <View style={relicRevealStyles.cardWrap}>
          <View style={relicRevealStyles.particleField}>
            {particles.map(i => (
              <RelicParticle key={i} angle={(i / RELIC_PARTICLE_COUNT) * Math.PI * 2} delay={450 + i * 25} />
            ))}
          </View>
          <Reanimated.View style={[relicRevealStyles.card, cardStyle]}>
            <Text style={relicRevealStyles.cardIcon}>{'\u{1F451}'}</Text>
          </Reanimated.View>
        </View>

        <Reanimated.View style={titleStyle}>
          <Text style={relicRevealStyles.title}>
            {isComplete ? 'THE COLLECTION IS COMPLETE' : 'ROYAL RELIC CLAIMED'}
          </Text>
        </Reanimated.View>

        <Reanimated.View style={bodyStyle}>
          {isComplete ? (
            <Text style={relicRevealStyles.bonusText}>+{result.tokenBonus ?? 0} tokens</Text>
          ) : (
            <>
              <Text style={relicRevealStyles.label}>{result.label}</Text>
              {!!relicType && <Text style={relicRevealStyles.typeBadge}>{relicType}</Text>}
              {!!result.lore && <Text style={relicRevealStyles.lore}>{result.lore}</Text>}
              {isFirstVictory && (
                <Text style={relicRevealStyles.firstVictory}>Your first victory over the Monarch.</Text>
              )}
            </>
          )}
        </Reanimated.View>

        <Reanimated.View style={buttonStyle}>
          <TouchableOpacity style={relicRevealStyles.button} onPress={onClose} activeOpacity={0.85}>
            <Text style={relicRevealStyles.buttonText}>CONTINUE</Text>
          </TouchableOpacity>
        </Reanimated.View>
      </View>
    </Reanimated.View>
  )
}

const relicRevealStyles = StyleSheet.create({
  scrim: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', zIndex: 1200,
  },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  cardWrap: { width: RELIC_CARD_SIZE, height: RELIC_CARD_SIZE, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  particleField: { position: 'absolute', width: RELIC_CARD_SIZE, height: RELIC_CARD_SIZE },
  particle: {
    position: 'absolute', left: RELIC_CARD_SIZE / 2 - 4, top: RELIC_CARD_SIZE / 2 - 4,
    width: 8, height: 8, borderRadius: 4, backgroundColor: COLOR.gold,
  },
  card: {
    width: RELIC_CARD_SIZE, height: RELIC_CARD_SIZE, borderRadius: 16, backgroundColor: COLOR.bgPanel,
    borderWidth: 3, borderColor: COLOR.gold, alignItems: 'center', justifyContent: 'center',
  },
  cardIcon: { fontSize: 48 },
  title: {
    fontFamily: 'Cinzel_700Bold', color: COLOR.gold, fontSize: 18, fontWeight: '900',
    letterSpacing: 2, marginBottom: 14, textAlign: 'center',
  },
  label: {
    fontFamily: 'Cinzel_700Bold', color: COLOR.text, fontSize: 26, fontWeight: '900',
    letterSpacing: 1, marginBottom: 6, textAlign: 'center',
  },
  typeBadge: {
    color: COLOR.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 2,
    textAlign: 'center', marginBottom: 14,
  },
  lore: {
    color: COLOR.textSecondary, fontSize: 14, fontStyle: 'italic', textAlign: 'center',
    marginBottom: 6, paddingHorizontal: 8,
  },
  firstVictory: { color: COLOR.gold, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 10 },
  bonusText: {
    fontFamily: 'Cinzel_700Bold', color: COLOR.gold, fontSize: 24, fontWeight: '900',
    textAlign: 'center', marginBottom: 4,
  },
  button: {
    backgroundColor: COLOR.gold, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 48,
    borderWidth: 1.5, borderColor: MONARCH_ACCENT.gold, marginTop: 28,
  },
  buttonText: { color: COLOR.bg, fontSize: 15, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center' },
})

// ── Batch 3E Task 6 — Reconnecting HUD ──────────────────────────────────────
// Timer rule เดียวกับ MonarchTimer (Batch 2): ค่าที่เปลี่ยนทุกวินาทีต้องมี useState/setInterval
// ของตัวเอง ห้ามยกขึ้น MonarchScreen (parent หนักด้วย PlayerHandView) deadlineAt เป็น epoch ms
// เดา client-side เอง (ไม่ใช่ authority จริง — grace 20s ตัวจริงตัดสินที่ server เท่านั้น)
function ReconnectingBanner({ deadlineAt, insetsTop }: { deadlineAt: number; insetsTop: number }) {
  const computeRemaining = () => Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000))
  const [remaining, setRemaining] = useState(computeRemaining)

  useEffect(() => {
    setRemaining(computeRemaining())
    const interval = setInterval(() => setRemaining(computeRemaining()), 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineAt])

  return (
    <View style={[reconnectingStyles.wrap, { top: insetsTop + 8 }]} pointerEvents="none">
      <Text style={reconnectingStyles.text}>Royal Challenge Locked - Reconnecting ({remaining}s)</Text>
    </View>
  )
}

const reconnectingStyles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 12, right: 12, zIndex: 1300,
    backgroundColor: 'rgba(255,107,107,0.16)', borderColor: COLOR.red, borderWidth: 1,
    borderRadius: 10, paddingVertical: 8, alignItems: 'center',
  },
  text: { color: COLOR.red, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
})

export default function MonarchScreen() {
  const params = useLocalSearchParams<{ roomId?: string; userId?: string }>()
  const roomId = params.roomId ?? ''
  const userId = params.userId ?? ''
  const socketRef = useRef<Socket | null>(null)
  const insets = useSafeAreaInsets()
  const isWeb = Platform.OS === 'web'

  const [connStatus, setConnStatus] = useState<'connecting' | 'connected'>('connecting')
  const [round, setRound] = useState<RoundSnapshot | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [piles, setPiles] = useState<[HandCardData[], HandCardData[], HandCardData[]]>([[], [], []])
  const [selected, setSelected] = useState<{ pi: number; ci: number } | null>(null)
  const [arrangePending, setArrangePending] = useState(false)
  const [arrangeError, setArrangeError] = useState<string | null>(null)
  const [g1Result, setG1Result] = useState<G1Result | null>(null)
  const [g2Result, setG2Result] = useState<G2Result | null>(null)
  const [gf, setGf] = useState<GrandFinaleStart | null>(null)
  const [gfLog, setGfLog] = useState<GrandFinaleActionUpdate[]>([])
  const [gfPartialReveals, setGfPartialReveals] = useState<Record<string, string[]>>({})
  const [gfSubmitted, setGfSubmitted] = useState(false)
  const [gfSelectedRevealKeys, setGfSelectedRevealKeys] = useState<string[]>([])
  const [showPreGfShowdown, setShowPreGfShowdown] = useState(false)
  const [preGfShowdownTab, setPreGfShowdownTab] = useState<1 | 2>(1)
  const [g3Result, setG3Result] = useState<G3Result | null>(null)
  const [matchEnd, setMatchEnd] = useState<MatchEnd | null>(null)
  const [endPresentation, setEndPresentation] = useState<'none' | 'outcome' | 'summary' | 'lore'>('none')
  const [showdownCountdown, setShowdownCountdown] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ── Batch 3C-1 Task 4 — Weighted Crown reveal gate: ควบคุมว่า "อนุญาตให้โชว์" ผลกองไหนแล้ว
  // แยกจาก g1Result/g2Result/g3Result เดิม (data มาถึงแล้วไม่ได้แปลว่าโชว์ทันที) — ข้อมูลจะมาถึงก่อน
  // gate เปิดเสมอในทางปฏิบัติ (server มี delay ธรรมชาติ 4s ระหว่าง G1/G2 อยู่แล้ว ไกลเกิน pause
  // 1.0-1.5s ที่นี่) แต่ render condition เช็คทั้งคู่เผื่อ edge case ไม่ให้ค้าง/crash
  type RevealGate = 'none' | 'g1' | 'g2' | 'g3_dark' | 'g3'
  const GATE_ORDER: Record<RevealGate, number> = { none: 0, g1: 1, g2: 2, g3_dark: 3, g3: 4 }
  const [revealGate, setRevealGate] = useState<RevealGate>('none')
  const gateAtLeast = (g: RevealGate) => GATE_ORDER[revealGate] >= GATE_ORDER[g]
  // timer ทั้งหมดของ Judgment reveal (pause ระหว่างกอง) เก็บรวมไว้ที่นี่ เทียบ pattern
  // arrivalTimersRef ของ Batch 3B เป๊ะ เพื่อ clear รวดเดียวตอน unmount/disconnect
  const judgmentTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const scheduleJudgment = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms)
    judgmentTimersRef.current.push(t)
    return t
  }
  const clearJudgmentTimers = () => { judgmentTimersRef.current.forEach(clearTimeout); judgmentTimersRef.current = [] }
  useEffect(() => () => clearJudgmentTimers(), [])

  // ── Batch 3E Task 6 — Royal Challenge Lock: reconnect banner + skip-intro hydration ────────────
  // hasSeenArrivalRef: เคยเล่น Arrival cinematic (Fake Four Gods -> Monarch reveal) ในเซสชันนี้แล้ว
  // หรือยัง — join ครั้งแรกจริงเท่านั้นที่เล่นเต็ม ครั้งถัดไป (reconnect) ข้ามไปเข้าโต๊ะตรงๆ
  const hasSeenArrivalRef = useRef(false)
  const [reconnecting, setReconnecting] = useState(false)
  // client เดาระยะเวลาแสดงผลเฉยๆ (ไม่ใช่ authority จริง — grace 20s ตัวจริงตัดสินที่ server เท่านั้น
  // ดู monarchEngine.ts settleAndEndMonarchMatch) ใช้แค่ทำ countdown ให้ผู้เล่นเห็นความคืบหน้า
  const reconnectDeadlineRef = useRef<number>(0)

  // ── Sprint 11: production polish state ──
  const [showTierInfo, setShowTierInfo] = useState(false)
  // Batch 3E Task 5 — Leave confirm modal (ออกกลางเกม = แพ้ตามกลไก disconnect เดิม server ตัดสินเอง
  // ตาม phase จริง ณ ตอนนั้น — ไม่มี logic พิเศษฝั่ง client เลย นอกจาก disconnect socket ตัวเอง)
  const [uiPhase, setUiPhase] = useState<'dealing' | 'table'>('dealing')
  const [showVictoryVFX, setShowVictoryVFX] = useState(false)
  // Batch 3D-2 Task 2 — เก็บ relicResult ไว้โชว์ popup ต่อจากแสงทอง (mount แล้ว component เองเล่น
  // animation ของตัวเองทันทีตาม pattern TierUnlockOverlay.tsx) null = ไม่โชว์/ปิดไปแล้ว
  const [relicReveal, setRelicReveal] = useState<MonarchRelicResult | null>(null)
  const reduceMotionRef = useRef(false)
  useEffect(() => { getReduceMotion().then(v => { reduceMotionRef.current = v }) }, [])

  // ── Sprint 12: Boss Intro Popup — เทียบ pattern highNoble/index.tsx:400-428,771-783,2627-2655
  // เก็บ round_start ที่ได้มาไว้รอ (pendingRoundDataRef) จน human กด "ENTER THE DUEL" ปิด popup
  // ก่อน ค่อย process จริง (setRound/startDealAnimation ฯลฯ) — Monarch มีบอสแค่ตัวเดียวเสมอ (ไม่ต้อง
  // เช็ค roundNumber===1 หรือ lookup ชื่อบอสแบบ High Noble เพราะไม่มี Round 2 ให้สับสน)
  const [showBossIntro, setShowBossIntro] = useState(false)
  const [showRuleModal, setShowRuleModal] = useState(false) // Sprint 6-7 §8.4 — Monarch's Rule modal ระหว่าง Boss Intro ปิดกับก่อนเข้า arrangement
  const [typedText, setTypedText] = useState('')
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingRoundDataRef = useRef<RoundSnapshot | null>(null)
  const buyInAmountRef = useRef(0)

  // ── Batch 3B — Arrival sequence (fake Four Gods -> สะดุด -> จอมืด -> crown -> Monarch reveal) ──
  // typeText ใช้ร่วมกันทั้ง fake intro (quote เดียว) และ Monarch reveal (4 บรรทัดไล่ทีละบรรทัด) เพราะ
  // สองช่วงนี้ไม่มีทางเกิดพร้อมกันเลยตามลำดับ state (fake intro จบก่อน showBossIntro จะเป็น true เสมอ)
  const typeText = (text: string, onDone?: () => void, totalMs: number = 1400) => {
    if (typewriterRef.current) clearInterval(typewriterRef.current)
    const words = text.split(' ')
    let i = 0
    setTypedText('')
    const intervalMs = Math.max(30, Math.floor(totalMs / words.length))
    typewriterRef.current = setInterval(() => {
      i++
      setTypedText(words.slice(0, i).join(' '))
      if (i >= words.length) {
        if (typewriterRef.current) clearInterval(typewriterRef.current)
        typewriterRef.current = null
        onDone?.()
      }
    }, intervalMs)
  }
  useEffect(() => () => { if (typewriterRef.current) clearInterval(typewriterRef.current) }, [])

  type ArrivalPhase = 'idle' | 'fake_intro' | 'stumble' | 'blackout' | 'crown' | 'reveal'
  const [arrivalPhase, setArrivalPhase] = useState<ArrivalPhase>('idle')
  const [fakeGod, setFakeGod] = useState(FAKE_FOUR_GODS[0])
  const [revealLineIndex, setRevealLineIndex] = useState(-1)
  // Batch 3B Task 6 — timer ทั้งหมดของ Arrival เก็บรวมไว้ที่นี่ เพื่อ clear รวดเดียวตอน unmount (cancel/
  // back ระหว่าง Arrival) กัน setTimeout ค้างยิง setState/router หลังออกจากหน้านี้ไปแล้ว
  const arrivalTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const scheduleArrival = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms)
    arrivalTimersRef.current.push(t)
    return t
  }
  const clearArrivalTimers = () => { arrivalTimersRef.current.forEach(clearTimeout); arrivalTimersRef.current = [] }
  useEffect(() => () => clearArrivalTimers(), [])

  // ส่วนใหม่ทั้งหมด (stumble flicker/blackout/crown) ใช้ Reanimated v4 ตามกฎ batch — glow เดิม
  // (introGlowAnim ด้านล่าง) ยังเป็น classic Animated ต่อไป ไม่แตะ/ไม่แปลง
  const stumbleFlicker = useSharedValue(1)
  const blackoutOpacity = useSharedValue(0)
  const goldWashOpacity = useSharedValue(0)
  const crownLv1Opacity = useSharedValue(0)
  const crownLv2Opacity = useSharedValue(0)
  const crownLv3Opacity = useSharedValue(0)
  const crownScale = useSharedValue(0.7)
  const stumbleFlickerStyle = useAnimatedStyle(() => ({ opacity: stumbleFlicker.value }))
  const blackoutStyle = useAnimatedStyle(() => ({ opacity: blackoutOpacity.value }))
  const goldWashStyle = useAnimatedStyle(() => ({ opacity: goldWashOpacity.value }))
  const crownLv1Style = useAnimatedStyle(() => ({ opacity: crownLv1Opacity.value, transform: [{ scale: crownScale.value }] }))
  const crownLv2Style = useAnimatedStyle(() => ({ opacity: crownLv2Opacity.value, transform: [{ scale: crownScale.value }] }))
  const crownLv3Style = useAnimatedStyle(() => ({ opacity: crownLv3Opacity.value, transform: [{ scale: crownScale.value }] }))

  // Task 1-4 — ลำดับเวลารวม (offset สะสมจากจุดเริ่ม Arrival ถึงตอน Monarch reveal เริ่มโชว์):
  // fake_intro 1800ms -> stumble +500ms -> blackout +500ms -> crown +1600ms (3 stage ละ ~500ms
  // ครอบคลุม) = reveal เริ่มที่ ~4400ms จากนั้น reveal เองมี text ไล่บรรทัด 4 บรรทัดต่ออีก (ไม่นับในนี้
  // เพราะ user-paced บางส่วน) รวมทั้งหมดจนกด CTA ได้จริงอยู่ในช่วง ~6-8s ตามที่ต้องการ
  const startArrival = (data: RoundSnapshot) => {
    pendingRoundDataRef.current = data
    clearArrivalTimers()
    const god = FAKE_FOUR_GODS[Math.floor(Math.random() * FAKE_FOUR_GODS.length)]
    setFakeGod(god)
    stumbleFlicker.value = 1
    blackoutOpacity.value = 0
    goldWashOpacity.value = 0
    crownLv1Opacity.value = 0
    crownLv2Opacity.value = 0
    crownLv3Opacity.value = 0
    crownScale.value = 0.7
    setRevealLineIndex(-1)
    setArrivalPhase('fake_intro')
    typeText(god.quote)

    const T_STUMBLE = 1800
    const T_BLACKOUT = T_STUMBLE + 500
    const T_CROWN = T_BLACKOUT + 500
    const T_REVEAL = T_CROWN + 1600

    // Task 2 — The Stumble: fake intro ค้าง + ตัดเงียบ + flicker เบา
    scheduleArrival(() => {
      setArrivalPhase('stumble')
      onMonarchCue('silence_cut') // ambient ตัดเงียบ (hook Batch 2)
      stumbleFlicker.value = withSequence(
        withTiming(0.3, { duration: 70 }), withTiming(1, { duration: 70 }),
        withTiming(0.4, { duration: 70 }), withTiming(1, { duration: 70 }),
      )
    }, T_STUMBLE)

    // จอมืดวูบ + haptic รัวเบา 3 ครั้งห่างกันสั้นๆ
    scheduleArrival(() => {
      setArrivalPhase('blackout')
      blackoutOpacity.value = withTiming(1, { duration: 200 })
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    }, T_BLACKOUT)
    scheduleArrival(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), T_BLACKOUT + 140)
    scheduleArrival(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), T_BLACKOUT + 280)

    // Task 3 — Crown Assembly: wash ทอง + crossfade lv1->lv2->lv3 + scale spring-in
    scheduleArrival(() => {
      setArrivalPhase('crown')
      goldWashOpacity.value = withTiming(0.12, { duration: 400 })
      crownLv1Opacity.value = withTiming(1, { duration: 500 })
      crownScale.value = withTiming(1, { duration: 500 })
    }, T_CROWN)
    scheduleArrival(() => { crownLv2Opacity.value = withTiming(1, { duration: 500 }) }, T_CROWN + 500)
    scheduleArrival(() => { crownLv3Opacity.value = withTiming(1, { duration: 500 }) }, T_CROWN + 1000)

    // Task 4 — Monarch Reveal: reuse popup เดิม (glow/badge/typewriter ของเดิมทำงานเองผ่าน showBossIntro)
    scheduleArrival(() => {
      setArrivalPhase('reveal')
      setShowBossIntro(true)
    }, T_REVEAL)
  }

  // Task 4 — text ไล่บรรทัด 4 บรรทัด (แทนที่ MONARCH_INTRO.quote เดิมที่โชว์ทีเดียวจบ) haptic หนัก
  // ตอนบรรทัด "THE MONARCH HAS ARRIVED" (index 1) เริ่มขึ้นพอดี — ใช้ duration สั้นกว่า default ของ
  // typeText (550ms/บรรทัด + pause 300ms) เพราะมี 4 บรรทัดสั้นๆ ต้องไล่ต่อกัน ถ้าใช้ default 1400ms/
  // บรรทัดจะยาวเกิน ~11s รวม (เป้าหมายทั้ง Arrival ควรอยู่ที่ ~6-8s ตามที่ขอ)
  useEffect(() => {
    if (!showBossIntro) return
    setRevealLineIndex(0)
    const playLine = (idx: number) => {
      if (idx >= MONARCH_REVEAL_LINES.length) return
      if (idx === 1) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {})
      typeText(MONARCH_REVEAL_LINES[idx], () => {
        scheduleArrival(() => { setRevealLineIndex(idx + 1); playLine(idx + 1) }, 300)
      }, 550)
    }
    playLine(0)
  }, [showBossIntro])

  // กรอบทองเรืองแสง (pulse glow) รอบรูป Monarch ระหว่างเปิด popup — เน้นความรู้สึก "หายาก"
  const introGlowAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!showBossIntro) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(introGlowAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(introGlowAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [showBossIntro])

  // Sprint 6-7 §8.1 — badge "RARE ENCOUNTER MONARCH / SPECIAL RULE: 2-2-0" fade-in 400ms ตอนเปิด popup เท่านั้น
  const badgeFadeAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!showBossIntro) return
    badgeFadeAnim.setValue(0)
    Animated.timing(badgeFadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
  }, [showBossIntro])

  // Sprint 6-7 §8.5 — Local dialogue toast (2 ครั้งต่อแมตช์: ก่อนจัดไพ่ + หลังจบเกม) เขียนใหม่ในไฟล์นี้
  // เอง ไม่ reuse AiFillNotifyBanner.tsx (audit เจอว่าเป็น dead code + subtext/icon hardcode ไม่เข้ากับ
  // โทน Monarch — ดู Phase 1 audit ข้อ 3)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastAnim = useRef(new Animated.Value(0)).current
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = (message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToastMsg(message)
    toastAnim.setValue(0)
    Animated.timing(toastAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start()
    toastTimerRef.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setToastMsg(null)
      })
    }, 4500)
  }
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }, [])

  // ── Batch 2 (Monarch v2.2 Pressure & Seal) ──────────────────────────────
  // pressurePhase เปลี่ยนแค่ ~3 ครั้งตลอด 40 วินาที (transition จริงเท่านั้น ไม่ใช่ทุกวินาที) —
  // ตัวเลขวินาทีจริงอยู่ใน MonarchTimer เอง ไม่ยกมาไว้ที่ parent (ดู known bug class ใน CLAUDE.md)
  const [pressurePhase, setPressurePhase] = useState<PressurePhase>('calm')
  const [sealUrgent, setSealUrgent] = useState(false)
  // pressurePhaseRef กัน stale closure ใน handleTimerTick (ฟังก์ชันถูก capture ครั้งเดียวตอน
  // MonarchTimer's useEffect mount ไม่ได้ re-subscribe ทุก render ของ parent)
  const pressurePhaseRef = useRef<PressurePhase>('calm')

  // Task 5 — Sealed Signal: สุ่ม remaining target ครั้งเดียวต่อแมตช์ (elapsed 8-12s -> remaining 28-32s)
  const sealedSignalTargetRef = useRef<number | null>(null)
  const sealedSignalShownRef = useRef(false)
  // Task 6 — Royal Silence: สุ่ม remaining target ครั้งเดียวต่อแมตช์ (6-10s, อยู่ใน critical band พอดี)
  // + สุ่มเลือกประโยค 1 จาก 4 ครั้งเดียว ห้ามซ้ำ/ห้ามแสดงเกิน 1 ครั้งต่อแมตช์
  const silenceTargetRef = useRef<number | null>(null)
  const silenceLineRef = useRef<string | null>(null)
  const silenceShownRef = useRef(false)
  // Task 3 — final haptic 3 ครั้ง (remaining=3,2,1) กันยิงซ้ำถ้า tick คลาดเคลื่อน
  const finalHapticFiredRef = useRef<Set<number>>(new Set())

  const [dialogueLine, setDialogueLine] = useState<string | null>(null)
  const dialogueAnim = useRef(new Animated.Value(0)).current
  const dialogueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Task 5/6 — fade in 400ms, ค้าง 2.5s, fade out 600ms (ต่างจาก toastBox เดิมโดยเจตนา — ดู
  // comment ที่ MonarchDialogueLine)
  const showDialogueLine = (text: string) => {
    if (dialogueTimerRef.current) clearTimeout(dialogueTimerRef.current)
    setDialogueLine(text)
    dialogueAnim.setValue(0)
    Animated.timing(dialogueAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
    dialogueTimerRef.current = setTimeout(() => {
      Animated.timing(dialogueAnim, { toValue: 0, duration: 600, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setDialogueLine(null)
      })
    }, 2500)
  }
  useEffect(() => () => { if (dialogueTimerRef.current) clearTimeout(dialogueTimerRef.current) }, [])

  // Task 7 — SEAL THE HAND stamp: เพิ่มค่าทุกครั้งที่กด seal เพื่อ retrigger animation (0 = ยังไม่เคย seal)

  const handlePhaseChange = (phase: PressurePhase) => {
    pressurePhaseRef.current = phase
    setPressurePhase(phase)
    onMonarchCue(`phase_${phase}` as MonarchAudioCue)
  }

  // Batch 2 Task 3 — เรืองแสงรอบพื้นที่มือผู้เล่นตอน critical ขึ้นไป (ตีความ "ไพ่ที่ยังไม่ถูกวางลง
  // pile" เป็น "พื้นที่มือผู้เล่นทั้งหมด" เพราะโต๊ะ Monarch ไม่มีแนวคิด hand tray แยกจาก pile จริง —
  // ไพ่ทุกใบถูกจัดเข้า pile1/2/3 ทันทีตั้งแต่แจก ผู้เล่นแค่ tap-swap ตำแหน่งกัน — ไม่แตะ PlayerHandView
  // เลย ใช้ wrapper ห่อข้างนอกแทน) ผูกกับ pressurePhase (เปลี่ยนน้อยครั้ง) ไม่ใช่ tick ทุกวินาที
  const handGlow = useSharedValue(0)
  useEffect(() => {
    if ((pressurePhase === 'critical' || pressurePhase === 'final') && round?.phase === 'arrangement' && !submitted) {
      handGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        ),
        -1, true,
      )
    } else {
      handGlow.value = withTiming(0, { duration: 300 }) // Task 3: cleanup ทันทีเมื่อ seal แล้ว/พ้น phase
    }
  }, [pressurePhase, submitted, round?.phase])
  const handGlowStyle = useAnimatedStyle(() => ({
    shadowColor: '#FFD76A',
    shadowOpacity: handGlow.value * 0.9,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    borderColor: `rgba(255,215,106,${handGlow.value})`,
  }))

  const sealPulse = useSharedValue(1)
  useEffect(() => {
    if (sealUrgent && !submitted && !arrangePending && round?.phase === 'arrangement') {
      sealPulse.value = withRepeat(
        withSequence(
          withTiming(0.42, { duration: 280, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 280, easing: Easing.inOut(Easing.sin) }),
        ),
        -1, true,
      )
    } else {
      sealPulse.value = withTiming(1, { duration: 120 })
    }
  }, [sealUrgent, submitted, arrangePending, round?.phase])
  const sealPulseStyle = useAnimatedStyle(() => ({
    opacity: sealPulse.value,
    transform: [{ scale: 1 + (1 - sealPulse.value) * 0.04 }],
  }))

  // เรียกทุกวินาทีจาก MonarchTimer (ไม่ setState ทุก tick ยกเว้น 2 จุดที่เป็น one-time trigger ด้านล่าง)
  const handleTimerTick = (remainingSec: number) => {
    if (remainingSec <= 5) setSealUrgent(true)
    if (pressurePhaseRef.current === 'critical' || pressurePhaseRef.current === 'final') {
      onMonarchCue('tick') // tick sound ควรดังเฉพาะ critical ขึ้นไปตาม v2.2 §13 audio table
    }

    // Task 5 — Sealed Signal (ครั้งเดียว, ช่วง calm)
    if (
      sealedSignalTargetRef.current != null && !sealedSignalShownRef.current &&
      remainingSec <= sealedSignalTargetRef.current
    ) {
      sealedSignalShownRef.current = true
      showDialogueLine('The Monarch has sealed his hand.')
    }

    // Task 6 — Royal Silence (ครั้งเดียว, ช่วง critical เท่านั้น — ⚠️ psychological attack ล้วน
    // ไม่ผูกกับมือจริงของ Monarch เด็ดขาดตาม canon)
    if (
      silenceTargetRef.current != null && !silenceShownRef.current &&
      pressurePhaseRef.current === 'critical' && remainingSec <= silenceTargetRef.current
    ) {
      silenceShownRef.current = true
      onMonarchCue('silence_cut')
      showDialogueLine(silenceLineRef.current ?? ROYAL_SILENCE_LINES[0])
    }

    // Task 3 — final: haptic เบา 1 ครั้ง/วินาที (3 ครั้ง, remaining=3,2,1) ห้ามสั่นจอ/screen shake —
    // Haptics.impactAsync ไม่ใช่ screen shake (สั่นเฉพาะตัวเครื่อง ไม่กระทบ layout/transform ของจอ)
    if (remainingSec >= 1 && remainingSec <= 3 && !finalHapticFiredRef.current.has(remainingSec)) {
      finalHapticFiredRef.current.add(remainingSec)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
      onMonarchCue('crown_strike')
    }
  }

  const fadeTable = useRef(new Animated.Value(0)).current
  const dealAnims = useRef(
    Array.from({ length: DEAL_COUNT }, () => ({
      x: new Animated.Value(0), y: new Animated.Value(0),
      opacity: new Animated.Value(0), scale: new Animated.Value(0.5),
    }))
  ).current
  const dealCompositeRef = useRef<Animated.CompositeAnimation | null>(null)

  const startDealAnimation = () => {
    if (dealCompositeRef.current) dealCompositeRef.current.stop()
    setUiPhase('dealing')
    fadeTable.setValue(0)
    dealAnims.forEach(a => { a.x.setValue(0); a.y.setValue(0); a.opacity.setValue(0); a.scale.setValue(0.5) })

    const dealDurationMs = reduceMotionRef.current ? 700 : 2200
    const delayPerCard = (dealDurationMs - 500) / DEAL_COUNT
    const anims: Animated.CompositeAnimation[] = []

    dealAnims.forEach((a, i) => {
      const target = DEAL_TARGETS[i % 4]
      anims.push(Animated.sequence([
        Animated.delay(i * delayPerCard),
        Animated.parallel([
          Animated.timing(a.opacity, { toValue: 1, duration: 90, useNativeDriver: true }),
          Animated.timing(a.scale, { toValue: 1, duration: 120, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(a.x, { toValue: target.x, duration: 160, useNativeDriver: true }),
          Animated.timing(a.y, { toValue: target.y, duration: 160, useNativeDriver: true }),
        ]),
        Animated.timing(a.opacity, { toValue: 0, duration: 70, useNativeDriver: true }),
      ]))
    })

    const composite = Animated.parallel(anims)
    dealCompositeRef.current = composite
    composite.start(({ finished }) => {
      dealCompositeRef.current = null
      if (!finished) return
      setUiPhase('table')
      Animated.timing(fadeTable, { toValue: 1, duration: 300, useNativeDriver: true }).start()
    })
  }

  // แยกออกมาจาก socket handler เพราะตอนนี้ round_start ต้องรอปิด Boss Intro Popup ก่อนถึงจะ process จริง
  const processRoundStart = (data: RoundSnapshot) => {
    buyInAmountRef.current = data.buyInAmount
    setRound(data)
    setSubmitted(data.phase !== 'arrangement')
    // เริ่มต้น 3-3-5 ตามลำดับที่แจกมา — ผู้เล่นสลับเองผ่าน tap-swap ก่อนกด Confirm
    setPiles([
      data.yourCards.slice(0, 3).map((k, i) => ({ id: `g1-${i}-${k}`, key: k })),
      data.yourCards.slice(3, 6).map((k, i) => ({ id: `g2-${i}-${k}`, key: k })),
      data.yourCards.slice(6, 11).map((k, i) => ({ id: `g3-${i}-${k}`, key: k })),
    ])
    setSelected(null)
    setArrangePending(false)
    setArrangeError(null)
    setG1Result(null)
    setG2Result(null)
    setGf(null)
    setGfLog([])
    setGfSubmitted(false)
    setG3Result(null)
    setMatchEnd(null)
    setShowVictoryVFX(false)
    setSealUrgent(false)

    // Batch 2 — reset pressure state ต่อรอบใหม่ (Monarch เป็นแมตช์รอบเดียว แต่ reset ไว้กันกรณี
    // reconnect ได้ round_start ซ้ำ) สุ่ม target ใหม่ทุกครั้งที่รอบเริ่มจริง
    pressurePhaseRef.current = 'calm'
    setPressurePhase('calm')
    sealedSignalShownRef.current = false
    silenceShownRef.current = false
    finalHapticFiredRef.current = new Set()
    // Task 5: elapsed สุ่ม 8-12s -> remaining = total - elapsed = 28-32s
    sealedSignalTargetRef.current = ARRANGEMENT_TOTAL_SEC - (8 + Math.floor(Math.random() * 5))
    // Task 6: remaining สุ่มตรงๆ 6-10s (อยู่ใน critical band 10-4 พอดี)
    silenceTargetRef.current = 6 + Math.floor(Math.random() * 5)
    silenceLineRef.current = ROYAL_SILENCE_LINES[Math.floor(Math.random() * ROYAL_SILENCE_LINES.length)]

    startDealAnimation()
  }

  // Batch 3E Task 6 — reconnect ระหว่างเกม (ไม่ใช่ join ครั้งแรก): ข้าม Arrival/Boss Intro Popup/deal
  // animation ทั้งหมด (เคยเห็นไปแล้วรอบแรกในเซสชันนี้) hydrate ตรงเข้า phase จริงทันทีจาก snapshot เต็ม
  // (Task 3) แทนที่จะ reset ทุกอย่างเหมือน processRoundStart ซึ่งออกแบบไว้สำหรับ "เริ่มรอบใหม่" เท่านั้น
  const hydrateFromReconnect = (data: RoundSnapshot) => {
    buyInAmountRef.current = data.buyInAmount
    setRound(data)
    setSubmitted(data.phase !== 'arrangement')
    const arrangement = data.yourArrangement ?? {
      g1: data.yourCards.slice(0, 3), g2: data.yourCards.slice(3, 6), g3: data.yourCards.slice(6, 11),
    }
    setPiles([
      arrangement.g1.map((k, i) => ({ id: `g1-${i}-${k}`, key: k })),
      arrangement.g2.map((k, i) => ({ id: `g2-${i}-${k}`, key: k })),
      arrangement.g3.map((k, i) => ({ id: `g3-${i}-${k}`, key: k })),
    ])
    setSelected(null)
    setArrangePending(false)
    setArrangeError(null)
    setUiPhase('table') // ข้าม arrival/boss intro popup ตรงเข้าโต๊ะเลย (เคยเห็น intro ไปแล้ว)

    if (data.g1Result) setG1Result(data.g1Result)
    if (data.g2Result) setG2Result(data.g2Result)
    if (data.grandFinale) {
      setGf(data.grandFinale)
      setGfLog([])
      setGfPartialReveals(Object.fromEntries((data.grandFinale.reveals ?? []).map(r => [r.id, r.g3Cards])))
      // turn !== 'human' แปลว่า commit ไปแล้ว (กด Call ก่อนหลุด) — disable ปุ่มไม่ให้กดซ้ำ
      setGfSubmitted(data.grandFinale.turn !== 'human')
    }

    // reveal gate: ข้าม pause/suspense ทั้งหมด (ไม่ใช่การเปิดกองสดๆ) โชว์ truth ปัจจุบันทันที
    const gate: RevealGate =
      data.phase === 'g1_reveal' ? 'g1' :
      (data.phase === 'g2_reveal' || data.phase === 'grand_finale') ? 'g2' :
      'none'
    setRevealGate(gate)

    setReconnecting(false)
  }

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnStatus('connected')
      // Batch 3E Task 4/6 — event นี้ยิงทั้งตอน join ครั้งแรกและตอน socket.io auto-reconnect สำเร็จ
      // (reconnection:true default ไม่เคยปิด) emit monarch_join ซ้ำได้เลยทั้งสองเคส ฝั่ง server
      // (gameSocket.ts) เรียก clearMonarchDisconnectState ให้เองทุกครั้งอยู่แล้ว ปลอดภัยเรียกซ้ำ
      socket.emit('monarch_join', { roomId, userId })
    })

    // Batch 3E Task 6 — banner ฝั่ง client ล้วน ไม่รอ server บอก (socket.io-client event มาตรฐาน)
    socket.on('disconnect', () => {
      reconnectDeadlineRef.current = Date.now() + 20_000
      setReconnecting(true)
    })

    socket.on('monarch_round_start', (data: RoundSnapshot) => {
      if (!hasSeenArrivalRef.current) {
        hasSeenArrivalRef.current = true
        // Batch 3B: ก่อนเคยเปิด Boss Intro Popup (Monarch จริง) ทันที — ตอนนี้เข้า Arrival sequence
        // (fake Four Gods -> สะดุด -> จอมืด -> crown -> reveal) ก่อนเสมอ startArrival เก็บ
        // pendingRoundDataRef เองแล้ว (ไม่ต้องตั้งซ้ำตรงนี้) process จริงยังเกิดตอนกด Accept บน Rule
        // Modal เหมือนเดิมทุกประการ (ดู flow เดิมด้านล่าง ไม่ถูกแตะเลย)
        startArrival(data)
      } else {
        // Batch 3E Task 6 — reconnect ระหว่างเกม: เคยเห็น Arrival ไปแล้ว ข้ามทั้งหมด hydrate ตรง
        hydrateFromReconnect(data)
      }
    })

    socket.on('monarch_arrangement_ok', () => {
      setSubmitted(true)
      setArrangePending(false)
      setArrangeError(null)
      setShowdownCountdown(3)
      scheduleJudgment(() => setShowdownCountdown(2), 1000)
      scheduleJudgment(() => setShowdownCountdown(1), 2000)
      scheduleJudgment(() => setShowdownCountdown(null), 3000)
    })

    socket.on('monarch_g1_result', (data: G1Result) => {
      setG1Result(data)
      setRevealGate('g1') // เผยทันที (กองแรก ไม่มีอะไรให้ pause รอ)
      // Seal -> Showdown Result immediately. G2 will populate the second tab when ready.
      setPreGfShowdownTab(1)
      setShowPreGfShowdown(true)
    })

    socket.on('monarch_g2_result', (data: G2Result) => {
      setG2Result(data)
      // Batch 3C-1 Task 4 — pause 1.0s หลัง G1 ก่อนเปิดทางให้ G2 โชว์จริง (ข้อมูลมาถึงแล้วก็จริง แต่
      // ยังไม่เปิด gate ทันที ให้ผู้เล่นอ่าน G1 จบก่อน)
      scheduleJudgment(() => setRevealGate('g2'), 1000)
    })

    socket.on('monarch_grand_finale_start', (data: GrandFinaleStart) => {
      setGf(data)
      setGfLog([])
      setGfPartialReveals({})
      setGfSubmitted(false)
      setGfSelectedRevealKeys([])
    })
    socket.on('monarch_grand_finale_action', (data: GrandFinaleActionUpdate) => {
      setGfLog(prev => [...prev, data])
    })

    socket.on('monarch_grand_finale_round_complete', (data: GrandFinaleRoundComplete) => {
      setGfPartialReveals(Object.fromEntries(data.reveals.map(r => [r.id, r.g3Cards])))
      setGf(prev => prev ? { ...prev, pot: data.pot, revealedCount: data.revealedCount } : prev)
    })

    socket.on('monarch_grand_finale_round_start', (data: {
      round: 2; revealedCount: 3; pot: number; callAmount: number; turn: 'human'
    }) => {
      setGf(prev => prev ? { ...prev, ...data } : prev)
      setGfSubmitted(false)
      setGfSelectedRevealKeys([])
    })

    socket.on('monarch_g3_result', (data: G3Result) => {
      setG3Result(data)
      // Batch 3C-1 Task 4 — pause 1.5s (อ่าน G2 จบ) แล้วจอมืด+เงียบ 0.8s ("THE DECIDING PILE") ก่อน
      // เปิด G3 จริง — reuse onMonarchCue('silence_cut') hook เดิมจาก Batch 2 ตอนจอมืด
      scheduleJudgment(() => {
        setRevealGate('g3_dark')
        onMonarchCue('silence_cut')
      }, 1500)
      scheduleJudgment(() => setRevealGate('g3'), 1500 + 800)
      // ⚠️ Batch 3C-1 Task 1: เดิมตัดสินชนะ/แพ้จาก data.g3Winner===userId ตรงนี้ — บั๊กจริง (server ใช้
      // netDelta>0 มาตั้งแต่ Batch 1 Task 5) ย้าย logic ทั้งหมดไปที่ monarch_match_end แทน เพราะเป็น
      // จุดเดียวที่รู้ผลแพ้ชนะจริงตามเกณฑ์เดียวกับ server (ดู handler ด้านล่าง) — ตรงนี้ไม่ตัดสินอะไรอีก
    })

    socket.on('monarch_match_end', (data: MatchEnd) => {
      setMatchEnd(data)
      // Mastermind-style result cadence: reveal table -> outcome -> summary -> Monarch lore/relic.
      scheduleJudgment(() => setEndPresentation('outcome'), 2500)
      scheduleJudgment(() => setEndPresentation('summary'), 6500)
      scheduleJudgment(() => setEndPresentation('lore'), 11000)
      // Batch 3C-1 Task 1 — เกณฑ์ชนะเดียวกับ server เป๊ะ (settleMonarchMatch: netDelta > 0):
      // finalStack = buyInAmount + payout, payout > 0 ก็ต่อเมื่อ netDelta > 0 เท่านั้น (ถ้า netDelta<=0
      // payout=netDelta เดิม ทำให้ finalStack <= buyInAmount เสมอ) จึง finalStack > buyInAmount
      // เทียบเท่า netDelta > 0 ทุกกรณีทางคณิตศาสตร์ — ไม่ต้องพึ่ง g3Winner อีกต่อไป (ไม่แตะ server เลย)
      // Socket handlers close over the initial render, so `round` here can still be null.
      // Prefer the authoritative server result; retain the live ref only for old-server fallback.
      const isVictory = data.isVictory ?? data.finalStack > buyInAmountRef.current
      if (isVictory) {
        // Batch 3C-2 Task 4 — ชนะ: หน่วงฉลองแทนที่จะยิง VFX ทันที (breakdown/lore ด้านล่างยังโชว์ทันที
        // ปกติ เพราะ matchEnd ถูก set ไปแล้วข้างบน — หน่วงเฉพาะ "โมเมนต์ฉลอง" เท่านั้น)
        // เงียบ 1.5s (Monarch มองไพ่ ไม่มี VFX) -> dialogue "So... you are the one." (โชว์เต็ม ~3.5s
        // ผ่าน showDialogueLine เดิมของ Batch 2 ซึ่งมี fade+cleanup timer ของตัวเองอยู่แล้ว) -> แสงทอง
        scheduleJudgment(() => {
          showDialogueLine('So... you are the one.')
        }, 11000)
        scheduleJudgment(() => {
          setShowVictoryVFX(true)
          showToast(MONARCH_VICTORY_TOAST)
        }, 14500)
      } else {
        showToast('When you no longer depend on what the table gives you — return to me.')
      }
    })

    socket.on('room_error', (data: { message: string }) => {
      setError(data.message)
      // Batch 3E Task 6 — กัน banner ค้างถ้า reconnect แล้วเจอ "Match not found" (เช่น เกมจบไปแล้ว
      // ระหว่างหลุด) ไม่งั้นไม่มีจุดไหนมาปิด reconnecting ให้อีกเลย
      setReconnecting(false)
      // ถ้ากำลังรอผล submit arrangement อยู่ (เช่น FOUL) ให้ปลดล็อกกลับมาแก้ไขต่อได้ — ไม่ค้าง pending
      setArrangePending(false)
      setArrangeError(data.message)
      setGfSubmitted(false)
      // Batch 3A Task 2 — SEAL stamp เป็น optimistic (Batch 2: เล่น animation ทันทีตอนกด ไม่รอ server
      // ack) ถ้า server reject จริง (เช่น ROOM_NOT_FOUND/FOUL) ต้องถอนตราที่ประทับไปแล้วผิดๆ ทิ้ง —
    })

    return () => {
      if (dealCompositeRef.current) dealCompositeRef.current.stop()
      // Batch 4 Task 3 — กันเสียง ambient/heartbeat loop ค้างเล่นหลังออกจากโต๊ะทุกทาง (จบเกม/Leave
      // ของ Batch 3E/disconnect/กด back) unmount ของ useEffect นี้ครอบทุก exit path อยู่แล้วเป็นทุนเดิม
      sfxLayerService.stopAll()
      socket.disconnect()
    }
  }, [roomId, userId])

  // tap-swap เดียวกับ Initiate/Mastermind/HighNoble (initiate/index.tsx:812-821) — เลือกใบแรก
  // แล้ว tap ใบที่สองเพื่อสลับตำแหน่งข้ามกอง
  const handleCardPress = (pi: number, ci: number) => {
    if (submitted || arrangePending || round?.phase !== 'arrangement') return
    if (!selected) { setSelected({ pi, ci }); return }
    if (selected.pi === pi && selected.ci === ci) { setSelected(null); return }
    const next = piles.map(p => [...p]) as [HandCardData[], HandCardData[], HandCardData[]]
    const tmp = next[selected.pi][selected.ci]
    next[selected.pi][selected.ci] = next[pi][ci]
    next[pi][ci] = tmp
    setPiles(next)
    socketRef.current?.emit('update_monarch_arrangement_draft', {
      roomId, userId,
      arrangement: {
        g1: next[0].map(card => card.key),
        g2: next[1].map(card => card.key),
        g3: next[2].map(card => card.key),
      },
    })
    setSelected(null)
  }

  const handleConfirmArrangement = () => {
    if (!socketRef.current || submitted || arrangePending) return
    setArrangePending(true)
    setSealUrgent(false)
    setArrangeError(null)
    socketRef.current.emit('submit_monarch_arrangement', {
      roomId, userId,
      arrangement: {
        g1: piles[0].map(c => c.key),
        g2: piles[1].map(c => c.key),
        g3: piles[2].map(c => c.key),
      },
    })
    // Keep sound + haptic as immediate feedback; the persistent SEALED overlay was removed.
    onMonarchCue('seal_stamp')
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {})
  }

  const handleGrandFinaleAction = (action: 'call' | 'fold') => {
    if (!socketRef.current || gfSubmitted) return
    if (action === 'call' && gf?.round === 1 && gfSelectedRevealKeys.length !== 3) return
    setGfSubmitted(true)
    socketRef.current.emit('submit_monarch_grand_finale_action', {
      roomId, userId, action,
      revealedCardKeys: action === 'call' && gf?.round === 1 ? gfSelectedRevealKeys : undefined,
    })
  }

  const toggleGFRevealCard = (key: string) => {
    if (gfSubmitted || gf?.round !== 1) return
    setGfSelectedRevealKeys(prev => prev.includes(key)
      ? prev.filter(selectedKey => selectedKey !== key)
      : prev.length < 3 ? [...prev, key] : prev)
  }

  const seatByRole = (role: Seat['role']) => round?.seats.find(s => s.role === role)
  const boss = seatByRole('boss')
  const minion1 = seatByRole('minion1')
  const minion2 = seatByRole('minion2')

  return (
    <ImageBackground source={MONARCH_TABLE_SKIN} resizeMode="cover" style={styles.root}>
      {/* Sprint 6-7 §8.2 — Background overlay ทับพื้นหลังเดิมทั้งจอ ไม่ต้องสร้าง asset ใหม่ */}
      <View style={styles.bgOverlay} pointerEvents="none" />

      {/* Batch 3E Task 6 — Reconnecting HUD: อยู่นอก phase/arrival ใดๆ ทั้งหมด แสดงได้ทุกจุดที่หลุด
          (arrangement/reveal/grand_finale) หายเองตอน hydrateFromReconnect เรียก setReconnecting(false) */}
      {reconnecting && (
        <ReconnectingBanner deadlineAt={reconnectDeadlineRef.current} insetsTop={insets.top} />
      )}

      {/* Batch 3B Task 1/2 — Fake Four Gods Intro + Stumble (ก่อนสะดุด) — โครงเดียวกับ Four Gods intro
          จริงใน highNoble/index.tsx:2507-2537 (เรียบ ไม่มี glow ไม่มี badge) ให้ผู้เล่นเชื่อว่าเจอปกติ
          ก่อนสะดุดค้าง (flicker เบา) แล้วหายไปเข้าสู่จอมืด */}
      {(arrivalPhase === 'fake_intro' || arrivalPhase === 'stumble') && (
        <Reanimated.View style={[styles.introOverlay, stumbleFlickerStyle]}>
          <View style={styles.introBox}>
            <View style={styles.introImageWrap}>
              <Image source={fakeGod.image} style={styles.introImage} resizeMode="cover" />
            </View>
            <Text style={styles.introTitle}>{fakeGod.name.toUpperCase()}</Text>
            <Text style={styles.fakeIntroQuote}>{typedText}</Text>
          </View>
        </Reanimated.View>
      )}

      {/* Batch 3B Task 2/3 — จอมืดวูบ + Crown Assembly (wash ทอง #FFC857 12% + crossfade lv1->lv2->lv3
          + scale spring-in) reuse asset เดิมจาก BossVictoryVFX.tsx ไม่มี asset ใหม่เลย */}
      {(arrivalPhase === 'blackout' || arrivalPhase === 'crown') && (
        <Reanimated.View pointerEvents="none" style={[styles.arrivalBlackout, blackoutStyle]}>
          {arrivalPhase === 'crown' && (
            <>
              <Reanimated.View pointerEvents="none" style={[styles.goldWash, goldWashStyle]} />
              <View style={styles.crownWrap} pointerEvents="none">
                <Reanimated.View style={[styles.crownImgWrap, crownLv1Style]}>
                  <Image source={CROWN_LV1} style={styles.crownImg} resizeMode="contain" />
                </Reanimated.View>
                <Reanimated.View style={[styles.crownImgWrap, styles.crownImgAbsolute, crownLv2Style]}>
                  <Image source={CROWN_LV2} style={styles.crownImg} resizeMode="contain" />
                </Reanimated.View>
                <Reanimated.View style={[styles.crownImgWrap, styles.crownImgAbsolute, crownLv3Style]}>
                  <Image source={CROWN_LV3} style={styles.crownImg} resizeMode="contain" />
                </Reanimated.View>
              </View>
            </>
          )}
        </Reanimated.View>
      )}

      {/* Boss Intro Popup — ต้องอยู่เหนือทุกอย่าง (zIndex สูงสุด) กัน human เล่นต่อก่อนกดปิด */}
      {showBossIntro && (
        <View style={styles.introOverlay}>
          <View style={styles.introBox}>
            <View style={styles.introImageWrap}>
              <Animated.View
                style={[
                  styles.introGlow,
                  {
                    opacity: introGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] }),
                    transform: [{ scale: introGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }],
                  },
                ]}
              />
              <Image source={MONARCH_INTRO.image} style={styles.introImage} resizeMode="cover" />
            </View>
            <Animated.View style={[styles.rareBadge, { opacity: badgeFadeAnim }]}>
              <Text style={styles.rareBadgeText}>★ RARE ENCOUNTER ★</Text>
              <Text style={styles.specialRuleText}>SPECIAL RULE: 2-2-0</Text>
            </Animated.View>
            <Text style={styles.introTitle}>{MONARCH_INTRO.title}</Text>
            <Text style={styles.introSubtitle}>{MONARCH_INTRO.subtitle}</Text>
            {/* Batch 3B Task 4 — text ไล่บรรทัด 4 บรรทัด (แทนที่ quote เดียวเดิม) บรรทัดที่ typed
                เสร็จแล้วโชว์เต็ม บรรทัดปัจจุบันโชว์ตาม typedText บรรทัดถัดไปยังไม่ขึ้นเลย */}
            <View style={styles.introRevealContainer}>
              {MONARCH_REVEAL_LINES.map((line, idx) => {
                if (idx > revealLineIndex) return null
                const isCurrentLine = idx === revealLineIndex
                const text = isCurrentLine ? typedText : line
                return (
                  <Text key={idx} style={idx === 1 ? styles.introRevealTitleLine : styles.introRevealLine}>
                    {text}
                  </Text>
                )
              })}
            </View>
            <TouchableOpacity
              style={styles.introEnterBtn}
              onPress={() => {
                setShowBossIntro(false)
                // Batch 3B Task 5 — dialogue เปิดโต๊ะครั้งแรก (คงที่เสมอ ไม่มี Fake Memory ตาม MVP)
                // reuse MonarchDialogueLine เดิมจาก Batch 2 ตรงๆ (คนละช่วงเวลากับ Sealed Signal/Royal
                // Silence จึงไม่ชน slot เดียวกันเลย) แสดงจบแล้วค่อยเปิด Rule Modal ต่อ (Task 6 — ไม่แตะ
                // flow เดิมของ Rule Modal/processRoundStart เลย แค่แทรก dialogue ก่อนเปิด)
                showDialogueLine(MONARCH_FIRST_MEETING_QUOTE)
                scheduleArrival(() => setShowRuleModal(true), 400 + 2500 + 600)
              }}
            >
              <Text style={styles.introEnterBtnText}>Face the Monarch</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Sprint 6-7 §8.4 — Monarch's Rule modal (reuse <Modal> pattern เดิมของไฟล์นี้ที่ styles.modalOverlay/
          modalBox ใช้อยู่แล้วกับ Tier Info ด้านล่าง) ปุ่มเดียว กด Accept แล้วค่อย process round_start จริง */}
      <Modal visible={showRuleModal} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Monarch's Rule</Text>
            <Text style={styles.modalText}>
              G1 receives 2 community cards. G2 receives 2 community cards. G3 receives no
              community card. Build G3 entirely from your hand.
            </Text>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => {
                setShowRuleModal(false)
                if (pendingRoundDataRef.current) {
                  const pending = pendingRoundDataRef.current
                  pendingRoundDataRef.current = null
                  let processed = false
                  const processOnce = (deadlineAt: number) => {
                    if (processed) return
                    processed = true
                    processRoundStart({ ...pending, arrangementDeadlineAt: deadlineAt })
                  }
                  const ackFallback = setTimeout(
                    () => processOnce(Date.now() + ARRANGEMENT_TOTAL_SEC * 1000),
                    1500,
                  )
                  socketRef.current?.emit(
                    'monarch_arrangement_ready',
                    { roomId, userId },
                    (result: { ok: boolean; deadlineAt?: number }) => {
                      if (result.ok && result.deadlineAt) {
                        clearTimeout(ackFallback)
                        processOnce(result.deadlineAt)
                      }
                    },
                  )
                }
                showToast('The final pile will receive nothing from the table.')
              }}
            >
              <Text style={styles.modalCloseBtnText}>Accept the Rule</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sprint 6-7 §8.5 — local dialogue toast, ไม่มี icon, fade in/out 300ms, ค้าง 4.5s */}
      {!!toastMsg && (
        <Animated.View style={[styles.toastBox, { opacity: toastAnim }]} pointerEvents="none">
          <Text style={styles.toastText}>{toastMsg}</Text>
        </Animated.View>
      )}

      {/* Batch 2 — Pressure vignette เฉพาะช่วงจัดไพ่ (opacity ขับด้วย phase เอง ไม่ต้องเช็คก่อน mount
          ก็ได้แต่ gate ไว้ที่ phase arrangement กันเหลือค้างจอมืดหลัง G1/G2/Grand Finale) */}
      {round?.phase === 'arrangement' && <MonarchVignette phase={pressurePhase} />}

      {/* Batch 2 Task 5/6 — Sealed Signal / Royal Silence ใกล้ Portrait */}
      <MonarchDialogueLine text={dialogueLine} animValue={dialogueAnim} />

      {/* Keep navigation above table/result overlays; arrival/intro overlays (zIndex 998+) still block it. */}
      <View style={{ zIndex: 100 }} pointerEvents="box-none">
        <GameTopBar
          tierName="MONARCH"
          tierStars={5}
          round={1}
          totalRounds={1}
          hideRound
          isWeb={isWeb}
          insetsTop={insets.top}
          opacity={1}
          leftSlot={
            <TouchableOpacity
              onPress={() => setShowTierInfo(true)}
              style={styles.infoBtn}
            >
              <Text style={styles.infoBtnText}>i</Text>
            </TouchableOpacity>
          }
        />
      </View>

      {/* Batch 3C-1 Task 5 — Crown Ledger HUD: absolute overlay ใต้ GameTopBar แยกจาก slot system
          เดิมทั้งหมด (ไม่ชนกับ leftSlot/MonarchTimer) sync กับ revealGate เดียวกับ Task 4 */}
      {!!round && (
        <CrownLedger
          youCrown1={gateAtLeast('g1') && g1Result?.g1Winner === userId}
          youCrown2={gateAtLeast('g2') && g2Result?.g2Winner === userId}
          youCrown3={gateAtLeast('g3') && g3Result?.g3Winner === userId}
          bossCrown1={gateAtLeast('g1') && g1Result?.g1Winner === boss?.id}
          bossCrown2={gateAtLeast('g2') && g2Result?.g2Winner === boss?.id}
          bossCrown3={gateAtLeast('g3') && g3Result?.g3Winner === boss?.id}
        />
      )}

      <Modal visible={showTierInfo} transparent animationType="fade" onRequestClose={() => setShowTierInfo(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>👑 Boss Monarch — 2-2-0</Text>
            <Text style={styles.modalText}>
              G1, G2, and G3 are each a full 5-card poker hand (no community mixing like other
              tiers). G1 must be weaker than or equal to G2, which must be weaker than or equal
              to G3. Minions play G1 normally, then auto-fold from G2 onward. Only you and the
              Monarch decide the Grand Finale Call/Fold on G3.
            </Text>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowTierInfo(false)}>
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Batch 3E Task 5 — Leave confirm modal (reuse styles.modalOverlay/modalBox/modalTitle/modalText
          จาก Tier Info modal ด้านบนตรงๆ แค่เพิ่มปุ่มที่ 2 แทนปุ่ม Close เดียว) */}

      {/* After the 2-2-0 acknowledgement the game uses one fixed, full-screen table shell.
          Keeping this as a View (not an opaque ScrollView) lets the Monarch skin remain visible
          and matches the non-scrolling Mastermind table presentation. */}
      <View style={styles.container}>

        {connStatus === 'connecting' && <ActivityIndicator color={COLOR.gold} style={{ marginTop: 24 }} />}
        {!!error && <Text style={styles.error}>{error}</Text>}

        {round && (
          <>
            <View style={styles.tableArea}>
              {/* ── Deal animation overlay — การ์ดปิดบินจากกึ่งกลางไปแต่ละที่นั่ง ── */}
              {uiPhase === 'dealing' && (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  {dealAnims.map((a, i) => (
                    <Animated.View
                      key={i}
                      style={[
                        styles.dealCard,
                        {
                          opacity: a.opacity,
                          transform: [{ translateX: a.x }, { translateY: a.y }, { scale: a.scale }],
                        },
                      ]}
                    >
                      <Image source={CARD_BACK_IMG} style={styles.dealCardImg} resizeMode="cover" />
                    </Animated.View>
                  ))}
                </View>
              )}

              <Animated.View style={{
                opacity: fadeTable,
                width: '100%',
                alignItems: 'center',
                display: g1Result ? 'none' : 'flex',
              }}>
                {/* Batch 2 Task 2 — MonarchTimer: แสดงเฉพาะช่วงจัดไพ่ ซ่อนทันทีหลัง seal (Task 7) */}
                {round.phase === 'arrangement' && (
                  <MonarchTimer
                    deadlineAt={round.arrangementDeadlineAt}
                    stopped={submitted}
                    onPhaseChange={handlePhaseChange}
                    onTick={handleTimerTick}
                  />
                )}
                <SeatCard
                  label={boss ? boss.name : 'Boss'}
                  sub="Boss"
                  avatarSource={bossAvatarImg}
                  avatarBorderColor={MONARCH_ACCENT.gold}
                  stillness
                />
                <View style={styles.midRow}>
                  <SeatCard
                    label={minion1 ? minion1.name : 'Minion 1'}
                    sub="Minion"
                    small
                    avatarSource={minion1 ? MINION_AVATAR[minion1.name] : undefined}
                  />
                  <View style={styles.community}>
                    <Text style={styles.communityLabel}>G1 Community</Text>
                    <CardImageRow keys={round.commA} size={50} height={72} />
                    <Text style={styles.communityLabel}>G2 Community</Text>
                    <CardImageRow keys={round.commB} size={50} height={72} />
                    {/* Sprint 6-7 §8.3 — G3 ไม่มี community card ตาม canon 2-2-0 จริง (ไม่ใช่บั๊ก) กล่อง
                        เส้นประนี้ตั้งใจให้เห็นชัดว่าเป็นกติกา ไม่ใช่ข้อมูลหาย */}
                    <Text style={styles.communityLabel}>G3 Community</Text>
                    <View style={styles.g3EmptyBox}>
                      <Text style={styles.g3EmptyText}>No Community Card</Text>
                    </View>
                  </View>
                  <SeatCard
                    label={minion2 ? minion2.name : 'Minion 2'}
                    sub="Minion"
                    small
                    avatarSource={minion2 ? MINION_AVATAR[minion2.name] : undefined}
                  />
                </View>
              </Animated.View>
            </View>

            <Animated.View style={{ opacity: fadeTable, width: '100%', alignItems: 'center', display: g1Result ? 'none' : 'flex' }}>
              <View style={styles.humanPanel}>
                <View style={styles.humanIdentityRow}>
                  <MonarchPlayerAvatar value={round.seats.find(seat => seat.role === 'human')?.avatarUrl} size={38} />
                  <View>
                    <Text style={styles.humanIdentityName}>{round.seats.find(seat => seat.role === 'human')?.name ?? 'Player'}</Text>
                    <Text style={styles.humanIdentitySub}>YOU</Text>
                  </View>
                </View>
                <Text style={styles.communityLabel}>G1 / G2 / G3</Text>
                {/* Batch 2 Task 3 — wrapper เรืองแสงรอบมือผู้เล่น (ไม่แตะ PlayerHandView เลย) */}
                <Reanimated.View style={[monarchHandGlowStyles.wrap, handGlowStyle]}>
                  <PlayerHandView
                    piles={piles}
                    selected={selected}
                    onCardPress={handleCardPress}
                    isVip
                  />
                </Reanimated.View>
                {/* Batch 3C-1 Task 2 — ซ่อน Balance ระหว่างเกม (spec §3: "ซ่อน net token จนจบแมตช์")
                    ลบทิ้งจริง (ไม่ใช่ opacity:0) กัน layout เพี้ยนจากช่องว่างที่เหลือ */}

                {!!arrangeError && <Text style={styles.error}>{arrangeError}</Text>}

                {round.phase === 'arrangement' && !g1Result && (
                  <View style={styles.gfBtnRow}>
                    <Reanimated.View style={sealPulseStyle}>
                    <TouchableOpacity
                      style={[styles.sealBtn, styles.gfBtn, (submitted || arrangePending) && styles.submitBtnDisabled]}
                      disabled={submitted || arrangePending}
                      onPress={handleConfirmArrangement}
                    >
                      <Text style={styles.sealBtnText}>{submitted ? 'Waiting for table…' : 'SEAL THE HAND'}</Text>
                    </TouchableOpacity>
                    </Reanimated.View>
                  </View>
                )}
              </View>

              {/* Sprint 6-7 §8.6 — Header แสดงเฉพาะตั้งแต่มีผล G1 เป็นต้นไป (ไม่แสดงตอน arrangement) */}
              {/* Batch 3C-1 Task 4 — เพิ่ม gateAtLeast('g1') ทุกจุด (จริงๆ true ทันทีที่ g1Result มา
                  เพราะกอง G1 ไม่มีอะไรให้ pause รอ) เพื่อความสม่ำเสมอของ pattern gate ทั้งไฟล์ */}
              {!!g1Result && gateAtLeast('g1') && (
                <View style={styles.trialHeader}>
                  <Text style={styles.trialHeaderTitle}>MONARCH'S TRIAL</Text>
                  <Text style={styles.trialHeaderSub}>Special Rule: 2-2-0</Text>
                </View>
              )}

              {g1Result && gateAtLeast('g1') && (
                <View style={styles.resultPanel}>
                  <Text style={styles.resultTitle}>
                    G1 Winner: {round.seats.find(s => s.id === g1Result.g1Winner)?.name ?? '—'}
                  </Text>
                  {g1Result.reveals.map(r => {
                    const seat = round.seats.find(s => s.id === r.id)
                    const isWinner = r.id === g1Result.g1Winner
                    const fouled = g1Result.foulMap[r.id]
                    return (
                      <View key={r.id} style={styles.revealRow}>
                        <Text style={[styles.revealName, isWinner && styles.revealWinner]}>
                          {seat?.emoji} {seat?.name}{fouled ? ' (FOUL)' : ''}
                        </Text>
                        <CardImageRow keys={r.g1Cards} size={30} />
                      </View>
                    )
                  })}
                  {/* Batch 3C-1 Task 2 — ซ่อน Balance ระหว่างเกม (ดู comment เดียวกันที่ arrangement) */}
                </View>
              )}

              {/* Batch 3C-1 Task 4 — pause 1.0s หลัง G1 ก่อน gate เปิด (ตั้งไว้ใน monarch_g2_result handler) */}
              {g2Result && gateAtLeast('g2') && (
                <View style={styles.resultPanel}>
                  <Text style={styles.resultTitle}>
                    G2 Winner: {round.seats.find(s => s.id === g2Result.g2Winner)?.name ?? '—'}
                  </Text>
                  {g2Result.reveals.map(r => {
                    const seat = round.seats.find(s => s.id === r.id)
                    const isWinner = r.id === g2Result.g2Winner
                    const fouled = g2Result.foulMap[r.id]
                    return (
                      <View key={r.id} style={styles.revealRow}>
                        <Text style={[styles.revealName, isWinner && styles.revealWinner]}>
                          {seat?.emoji} {seat?.name}{fouled ? ' (FOUL)' : ''}
                        </Text>
                        <CardImageRow keys={r.g2Cards} size={30} />
                      </View>
                    )
                  })}
                  {/* Batch 3C-1 Task 2 — ซ่อน Balance ระหว่างเกม */}
                </View>
              )}

              {gf && (
                <View style={styles.resultPanel}>
                  <Text style={styles.resultTitle}>Grand Finale — G3</Text>
                  <Text style={styles.cards}>Pot: {gf.pot}   Call: {gf.callAmount}</Text>
                  <Text style={styles.logRow}>
                    Folded: {gf.foldedPlayers.map(id => round.seats.find(s => s.id === id)?.name ?? id).join(', ') || '—'}
                  </Text>
                  {gfLog.map((log, i) => {
                    const seat = round.seats.find(s => s.id === log.playerId)
                    return (
                      <Text key={i} style={styles.logRow}>
                        {seat?.emoji} {seat?.name} {log.action === 'call' ? 'Called' : 'Folded'} — Pot: {log.pot}
                      </Text>
                    )
                  })}
                  {!g3Result && (
                    <View style={styles.gfBtnRow}>
                      <TouchableOpacity
                        style={[styles.submitBtn, styles.gfBtn, (gfSubmitted || (gf.round === 1 && gfSelectedRevealKeys.length !== 3)) && styles.submitBtnDisabled]}
                        disabled={gfSubmitted || (gf.round === 1 && gfSelectedRevealKeys.length !== 3)}
                        onPress={() => handleGrandFinaleAction('call')}
                      >
                        <Text style={styles.submitBtnText}>CALL</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.foldBtn, styles.gfBtn, gfSubmitted && styles.submitBtnDisabled]}
                        disabled={gfSubmitted}
                        onPress={() => handleGrandFinaleAction('fold')}
                      >
                        <Text style={styles.submitBtnText}>FOLD</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {/* Batch 3C-1 Task 4 — จอมืด+เงียบ 0.8s ("THE DECIDING PILE") ก่อนเปิด G3 จริง — reuse
                  onMonarchCue('silence_cut') ที่เรียกไว้แล้วตอน gate เปลี่ยนเป็น g3_dark (ดู
                  monarch_g3_result handler) */}
              {revealGate === 'g3_dark' && (
                <View style={styles.decidingPileOverlay} pointerEvents="none">
                  <Text style={styles.decidingPileText}>THE DECIDING PILE</Text>
                </View>
              )}

              {g3Result && gateAtLeast('g3') && (() => {
                // Batch 3C-2 Task 3 — เกณฑ์แพ้/ชนะเดียวกับ handler/loreBox เป๊ะ ใช้ matchEnd ถ้ามาถึงแล้ว
                // (เกือบเสมอมาถึงแล้วตอนนี้ เพราะ server ยิง monarch_g3_result/monarch_match_end
                // ต่อกันทันที ส่วน gate 'g3' กว่าจะเปิดจริงต้องรอ pause ของ client เอง) ถ้ายังไม่มา
                // ให้ default ไม่ปิดไพ่ไว้ก่อน (fail-safe กันไพ่ปิดแวบแล้วเปิดเองทีหลัง)
                const isVictory = matchEnd ? (matchEnd.isVictory ?? matchEnd.finalStack > (round?.buyInAmount ?? 0)) : true
                return (
                  <View style={styles.resultPanel}>
                    <Text style={styles.resultTitle}>
                      G3 Winner: {round.seats.find(s => s.id === g3Result.g3Winner)?.name ?? '—'}
                    </Text>
                    {g3Result.reveals.map(r => {
                      const seat = round.seats.find(s => s.id === r.id)
                      const isWinner = r.id === g3Result.g3Winner
                      const folded = g3Result.foldedPlayers.includes(r.id)
                      // แพ้ = ปิดไพ่ Monarch บางส่วน (เผยใบแรกพอ ที่เหลือปิด) UI ล้วน ไม่แตะ server —
                      // client มีไพ่ Monarch ครบอยู่แล้วตั้งแต่ reveal จริง (ดู audit ข้อ 10)
                      const isMonarchMasked = !isVictory && r.id === boss?.id
                      return (
                        <View key={r.id} style={styles.revealRow}>
                          <Text style={[styles.revealName, isWinner && styles.revealWinner]}>
                            {seat?.emoji} {seat?.name}{folded ? ' (FOLDED)' : ''}
                          </Text>
                          <CardImageRow keys={r.g3Cards} size={30} revealCount={isMonarchMasked ? 1 : undefined} />
                          {isMonarchMasked && (
                            <Text style={styles.monarchMaskedNote}>
                              You were not ready to see the full hand.
                            </Text>
                          )}
                        </View>
                      )
                    })}
                    {/* Batch 3C-1 Task 2 — ซ่อน Balance ระหว่างเกม (เลขนี้ยังไม่รวม Pot×2 ด้วย ไม่ใช่
                        เลขจริงตอนจบ — ซ่อนสำคัญเป็นพิเศษ กันเข้าใจผิดว่านี่คือผลสุดท้าย) */}
                  </View>
                )
              })()}

              {/* Batch 3C-1 Task 1 — เดิมอิง g3Result.g3Winner===userId ตรงๆ (บั๊กเดียวกับ VFX/toast —
                  ดู monarch_match_end handler) เปลี่ยนมาเกต !!matchEnd (รอผลจริงจาก server ก่อนเสมอ
                  แทนที่จะเดาจาก g3Result ที่มาถึงก่อนจะรู้ผล Pot×2/net จริง) + คำนวณ isVictory จาก
                  finalStack > buyInAmount สูตรเดียวกับ handler เป๊ะ (เทียบเท่า netDelta>0 ของ server) */}
              {!!matchEnd && (() => {
                const buyIn = round?.buyInAmount ?? 0
                const isVictory = matchEnd.isVictory ?? matchEnd.finalStack > buyIn
                return (
                  <View style={styles.loreBox}>
                    {isVictory ? (
                      <>
                        <Text style={styles.loreHeader}>Lore Discovered</Text>
                        <Text style={styles.loreBody}>{MONARCH_VICTORY_LORE}</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.loreHeader}>Lore Fragment Locked</Text>
                        <Text style={styles.loreBody}>Defeat Monarch to uncover the message.</Text>
                      </>
                    )}
                  </View>
                )
              })()}

              {matchEnd && (() => {
                // Batch 3C-1 Task 3 — diff tokenBalance ต่อ event ที่มีอยู่แล้ว (ไม่แตะ server)
                // baseline(arrangement) -> g1Result -> g2Result -> g3Result -> matchEnd
                const baseline = round?.tokenBalance?.[userId] ?? round?.buyInAmount ?? 0
                const afterG1 = g1Result?.tokenBalance?.[userId] ?? baseline
                const afterG2 = g2Result?.tokenBalance?.[userId] ?? afterG1
                const afterG3 = g3Result?.tokenBalance?.[userId] ?? afterG2
                const g1Delta = afterG1 - baseline
                const g2Delta = afterG2 - afterG1
                const g3Delta = afterG3 - afterG2
                const royalBonusDelta = matchEnd.finalStack - afterG3
                const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`)
                // Batch 3C-2 Task 2 — เช็ค foul เฉพาะตอนแพ้เท่านั้น (field ใหม่จาก server อ่านอย่างเดียว
                // ไม่มีผลต่อ isVictory/breakdown ข้างบนเลย) กัน sudden-death งงว่าโดนโกงตอนแพ้จริงๆ
                // (isVictory คำนวณแยกจาก loreBox IIFE ด้านบน เพราะคนละ closure — สูตรเดียวกันเป๊ะ)
                const buyIn = round?.buyInAmount ?? 0
                const isVictory = matchEnd.isVictory ?? matchEnd.finalStack > buyIn
                const foulReason = !isVictory ? matchEnd.foulReasons?.[userId] : undefined
                return (
                  <View style={styles.matchEndPanel}>
                    <Text style={styles.resultTitle}>Match Ended</Text>
                    <Text style={styles.buyIn}>
                      Final Token Balance: {matchEnd.tokenBalance ?? '—'}
                    </Text>
                    {!!foulReason && (
                      <View style={styles.foulBanner}>
                        <Text style={styles.foulBannerTitle}>FOUL</Text>
                        <Text style={styles.foulBannerBody}>
                          You lost this match by foul: {foulReason}
                        </Text>
                      </View>
                    )}
                    <View style={styles.breakdownBox}>
                      <Text style={styles.logRow}>G1: {fmt(g1Delta)}</Text>
                      <Text style={styles.logRow}>G2: {fmt(g2Delta)}</Text>
                      <Text style={styles.logRow}>G3: {fmt(g3Delta)}</Text>
                      {royalBonusDelta !== 0 && (
                        <Text style={styles.logRow}>Royal Bonus (Pot x2): {fmt(royalBonusDelta)}</Text>
                      )}
                    </View>
                  </View>
                )
              })()}
            </Animated.View>
          </>
        )}
      </View>

      {/* Mastermind presentation shell; Monarch rules/events remain authoritative and unchanged. */}
      {!!round && !!g1Result && (() => {
        const activeResult: any = gateAtLeast('g3') && g3Result
          ? g3Result
          : gateAtLeast('g2') && g2Result
            ? g2Result
            : g1Result
        const activePile = gateAtLeast('g3') && g3Result ? 'G3' : gateAtLeast('g2') && g2Result ? 'G2' : 'G1'
        const winnerId = activePile === 'G3' ? g3Result?.g3Winner : activePile === 'G2' ? g2Result?.g2Winner : g1Result.g1Winner
        const humanFouled = !!g1Result.foulMap[userId]
        const humanCallCount = gfLog.filter(log => log.playerId === userId && log.action === 'call').length
        const humanMovedCount = humanCallCount === 0 ? 0 : humanCallCount === 1 ? 3 : 4
        const revealFor = (pid: string): string[] => {
          if (gf && !g3Result) return gfPartialReveals[pid] ?? []
          const reveal = activeResult?.reveals?.find((r: any) => r.id === pid)
          // Monarch GF keeps the fifth G3 card sealed even after server evaluates all five.
          if (reveal?.g3Cards) return reveal.g3Cards.slice(0, 4)
          return reveal?.g2Cards ?? reveal?.g1Cards ?? []
        }
        const seatStyle = (role: Seat['role']) =>
          role === 'boss' ? styles.battleBoss
            : role === 'minion1' ? styles.battleLeft
              : role === 'minion2' ? styles.battleRight
                : styles.battleHuman

        return (
          <View style={styles.battleOverlay} pointerEvents="box-none">
            <Text style={styles.battlePhaseTitle}>
              {gf && !g3Result ? `GRAND FINALE — ROUND ${gf.round}` : `${activePile} SHOWDOWN`}
            </Text>
            <Text style={styles.battleRuleText}>MONARCH'S TRIAL · SPECIAL RULE 2–2–0</Text>

            {round.seats.map(seat => {
              const folded = gf?.foldedPlayers.includes(seat.id) || g3Result?.foldedPlayers.includes(seat.id)
              const cards = revealFor(seat.id)
              const foldedMinion = !!folded && (seat.role === 'minion1' || seat.role === 'minion2')
              const displayedCards = foldedMinion
                ? Array.from({ length: 5 }, (_, i) => `folded-${seat.id}-${i}`)
                : cards
              const isWinner = winnerId === seat.id
              const maskMonarch = activePile === 'G3' && !!matchEnd
                && !(matchEnd.isVictory ?? matchEnd.finalStack > (round.buyInAmount ?? 0)) && seat.role === 'boss'
              const gfHumanCards = piles[2].map(card => card.key)
              const gfBossCards = gfPartialReveals[seat.id] ?? (g3Result?.reveals.find(r => r.id === seat.id)?.g3Cards ?? [])
              const bossMovedCount = Math.min(4, gfBossCards.length)
              return (
                <View key={seat.id} style={[styles.battleSeat, seatStyle(seat.role), folded && styles.battleSeatFolded]}>
                  {seat.role === 'human' && (
                    <MonarchPlayerAvatar value={seat.avatarUrl} size={36} />
                  )}
                  <Text style={[styles.battleSeatName, isWinner && styles.battleWinner]}>
                    {seat.emoji} {seat.name}{folded ? ' · FOLD' : ''}
                  </Text>
                  {!!gf && seat.role === 'human' ? (
                    <MonarchGFHandRow
                      cards={gfHumanCards}
                      movedCount={humanMovedCount}
                      direction="up"
                      showAllFaces
                      selectedKeys={gf.round === 1 ? gfSelectedRevealKeys : []}
                      onToggleSelect={gf.round === 1 ? toggleGFRevealCard : undefined}
                      movedKeys={gfPartialReveals[userId] ?? []}
                    />
                  ) : !!gf && seat.role === 'boss' ? (
                    <MonarchGFHandRow
                      cards={gfBossCards}
                      movedCount={maskMonarch ? Math.min(1, bossMovedCount) : bossMovedCount}
                      direction="down"
                    />
                  ) : (
                    <CardImageRow
                      keys={displayedCards}
                      size={seat.role === 'human' ? 62 : seat.role === 'boss' ? 50 : 42}
                      revealCount={foldedMinion ? 0 : maskMonarch ? 1 : undefined}
                      cardStep={foldedMinion ? 10 : undefined}
                    />
                  )}
                  {isWinner && <Text style={styles.battleWinnerTag}>WINNER</Text>}
                </View>
              )
            })}

            <View style={styles.battleCenter} pointerEvents="none">
              {gf && !g3Result ? (
                <>
                  <Text style={styles.battlePot}>POT {gf.pot}</Text>
                  {humanFouled ? (
                    <Text style={[styles.battleCall, { color: '#FF6B6B', fontWeight: '900' }]}>FOUL · FOLD REQUIRED</Text>
                  ) : (
                    <>
                      <Text style={styles.battleCall}>CALL {gf.callAmount}</Text>
                       <Text style={styles.battleCall}>
                         {gf.revealedCount === 0
                           ? `SELECT 3 CARDS TO REVEAL · ${gfSelectedRevealKeys.length}/3`
                           : 'CALL TO REVEAL 1 MORE CARD'}
                       </Text>
                    </>
                  )}
                </>
              ) : (
                <Text style={styles.battleCenterResult}>
                  {winnerId ? `${round.seats.find(s => s.id === winnerId)?.name ?? '—'} WINS ${activePile}` : `${activePile} DRAW`}
                </Text>
              )}
            </View>

            {gf && !g3Result && (
              <View style={styles.battleActionBar}>
                {!humanFouled && (
                  <TouchableOpacity
                    style={[styles.submitBtn, styles.battleActionBtn, (gfSubmitted || (gf.round === 1 && gfSelectedRevealKeys.length !== 3)) && styles.submitBtnDisabled]}
                    disabled={gfSubmitted || (gf.round === 1 && gfSelectedRevealKeys.length !== 3)}
                    onPress={() => handleGrandFinaleAction('call')}
                  >
                    <Text style={styles.submitBtnText}>CALL</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.foldBtn, styles.battleActionBtn, humanFouled && { flex: 0, width: 180 }, gfSubmitted && styles.submitBtnDisabled]}
                  disabled={gfSubmitted}
                  onPress={() => handleGrandFinaleAction('fold')}
                >
                  <Text style={styles.submitBtnText}>FOLD</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )
      })()}

      {/* Opens as soon as G1 arrives after Seal; G2 fills its tab while this result screen remains open. */}
      {showPreGfShowdown && !!round && !!g1Result && (() => {
        const tab: 1 | 2 = preGfShowdownTab === 2 && g2Result ? 2 : 1
        const result = tab === 1 ? g1Result : g2Result!
        const winnerId = tab === 1 ? g1Result.g1Winner : g2Result!.g2Winner
        const community = tab === 1 ? round.commA : round.commB
        const baseline = round.tokenBalance[userId] ?? round.buyInAmount
        const afterG1 = g1Result.tokenBalance[userId] ?? baseline
        const afterG2 = g2Result?.tokenBalance[userId] ?? afterG1
        const pileDelta = tab === 1 ? afterG1 - baseline : afterG2 - afterG1
        const cardsFor = (playerId: string) => {
          const reveal = result.reveals.find(r => r.id === playerId)
          return tab === 1
            // Server returns the evaluated five-card hand as [3 arranged cards, 2 community].
            // Community is already shown once above, so each player row keeps only its own cards.
            ? ('g1Cards' in (reveal ?? {}) ? (reveal as { g1Cards: string[] }).g1Cards.slice(0, 3) : [])
            : ('g2Cards' in (reveal ?? {}) ? (reveal as { g2Cards: string[] }).g2Cards.slice(0, 3) : [])
        }

        return (
          <View style={styles.preGfShade}>
            <View style={styles.preGfCard}>
              <Text style={styles.preGfTitle}>SHOWDOWN</Text>
              <Text style={styles.preGfSubtitle}>G1 / G2 RESULTS · GRAND FINALE NEXT</Text>

              <View style={styles.preGfTabs}>
                {([1, 2] as const).map(pile => {
                  const pileReady = pile === 1 || !!g2Result
                  const pileWinner = pile === 1 ? g1Result.g1Winner : g2Result?.g2Winner
                  const selected = pile === tab
                  return (
                    <TouchableOpacity
                      key={pile}
                      disabled={!pileReady}
                      onPress={() => setPreGfShowdownTab(pile)}
                      style={[styles.preGfTab, selected && styles.preGfTabActive, !pileReady && { opacity: 0.4 }]}
                    >
                      <Text style={[styles.preGfTabText, selected && styles.preGfTabTextActive]}>PILE {pile}</Text>
                      {pileWinner === userId && <Text style={styles.preGfYouWin}>🏆 YOU</Text>}
                      {!pileReady && <Text style={styles.preGfWaiting}>RESOLVING…</Text>}
                    </TouchableOpacity>
                  )
                })}
              </View>

              <View style={styles.preGfSummaryRow}>
                <View style={styles.preGfCommunity}>
                  <Text style={styles.preGfSectionLabel}>COMMUNITY</Text>
                  <CardImageRow keys={community} size={38} height={55} />
                </View>
                <View style={styles.preGfDeltaBox}>
                  <Text style={styles.preGfSectionLabel}>PILE {tab}</Text>
                  <Text style={[styles.preGfDelta, { color: pileDelta >= 0 ? '#8DFFB5' : '#FF6B6B' }]}>
                    {pileDelta >= 0 ? '+' : ''}{pileDelta}
                  </Text>
                  <Text style={styles.preGfTokenLabel}>tokens</Text>
                </View>
              </View>

              <View style={styles.preGfPlayers}>
                {round.seats.map(seat => {
                  const winner = winnerId === seat.id
                  const fouled = result.foulMap[seat.id]
                  return (
                    <View key={seat.id} style={[styles.preGfPlayer, winner && styles.preGfPlayerWinner]}>
                      <View style={styles.preGfPlayerLabel}>
                        {seat.role === 'human' ? (
                          <MonarchPlayerAvatar value={seat.avatarUrl} size={30} />
                        ) : seat.role === 'boss' ? (
                          <Image source={bossAvatarImg} style={styles.resultAvatar} resizeMode="cover" />
                        ) : (seat.role === 'minion1' || seat.role === 'minion2') && MINION_AVATAR[seat.name] ? (
                          <Image source={MINION_AVATAR[seat.name]} style={styles.resultAvatar} resizeMode="cover" />
                        ) : (
                          <Text style={styles.resultAvatarEmoji}>{seat.emoji}</Text>
                        )}
                        <Text numberOfLines={1} style={[styles.preGfPlayerName, seat.id === userId && styles.preGfPlayerSelf]}>
                          {seat.name}
                        </Text>
                        {winner && <Text style={styles.preGfWinnerText}>🏆 WIN</Text>}
                        {fouled && <Text style={styles.preGfFoulText}>FOUL</Text>}
                      </View>
                      <CardImageRow keys={cardsFor(seat.id)} size={36} height={52} />
                    </View>
                  )
                })}
              </View>

              <TouchableOpacity
                disabled={!gf}
                style={[styles.preGfContinue, !gf && { opacity: 0.45 }]}
                onPress={() => setShowPreGfShowdown(false)}
              >
                <Text style={styles.preGfContinueText}>{gf ? 'CONTINUE TO GRAND FINALE' : 'PREPARING GRAND FINALE…'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )
      })()}

      {revealGate === 'g3_dark' && (
        <View style={styles.decidingPileOverlay} pointerEvents="none">
          <Text style={styles.decidingPileText}>THE DECIDING PILE</Text>
        </View>
      )}

      {showdownCountdown !== null && (
        <View style={styles.showdownCountdownOverlay} pointerEvents="none">
          <Text style={styles.showdownCountdownLabel}>SHOWDOWN</Text>
          <Text style={styles.showdownCountdownNumber}>{showdownCountdown}</Text>
          <Text style={styles.showdownCountdownSub}>The Monarch judges every pile</Text>
        </View>
      )}

      {!!matchEnd && endPresentation === 'outcome' && (() => {
        const victory = matchEnd.isVictory ?? matchEnd.finalStack > (round?.buyInAmount ?? 0)
        return (
          <View style={styles.presentationShade} pointerEvents="none">
            <View style={styles.outcomeCard}>
              <Text style={[styles.outcomeTitle, { color: victory ? '#8DFFB5' : '#f87171' }]}>
                {victory ? 'YOU DEFEATED THE MONARCH' : 'THE MONARCH PREVAILS'}
              </Text>
              <Text style={styles.outcomeSub}>Final Stack · {matchEnd.finalStack.toLocaleString('en-US')}</Text>
            </View>
          </View>
        )
      })()}

      {!!matchEnd && endPresentation === 'summary' && (() => {
        const baseline = round?.tokenBalance?.[userId] ?? round?.buyInAmount ?? 0
        const afterG1 = g1Result?.tokenBalance?.[userId] ?? baseline
        const afterG2 = g2Result?.tokenBalance?.[userId] ?? afterG1
        const afterG3 = g3Result?.tokenBalance?.[userId] ?? afterG2
        const rows = [
          ['G1', afterG1 - baseline],
          ['G2', afterG2 - afterG1],
          ['G3', afterG3 - afterG2],
          ['ROYAL BONUS', matchEnd.finalStack - afterG3],
        ] as const
        return (
          <View style={styles.presentationShade} pointerEvents="none">
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>MATCH SUMMARY</Text>
              {(() => {
                const humanSeat = round?.seats.find(seat => seat.role === 'human')
                const victory = matchEnd.isVictory ?? matchEnd.finalStack > (round?.buyInAmount ?? 0)
                return (
                  <View style={styles.summaryIdentity}>
                    <MonarchPlayerAvatar value={humanSeat?.avatarUrl} size={48} />
                    <View>
                      <Text style={styles.summaryPlayerName}>{humanSeat?.name ?? 'Player'}</Text>
                      <Text style={[styles.summaryPlayerResult, { color: victory ? '#8DFFB5' : '#FF6B6B' }]}>
                        {victory ? 'MONARCH DEFEATED' : 'DEFEATED BY MONARCH'}
                      </Text>
                    </View>
                  </View>
                )
              })()}
              {rows.map(([label, value]) => (
                <View key={label} style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{label}</Text>
                  <Text style={[styles.summaryValue, { color: value >= 0 ? '#8DFFB5' : '#f87171' }]}>
                    {value >= 0 ? '+' : ''}{value}
                  </Text>
                </View>
              ))}
              <View style={styles.summaryTotalRow}>
                <Text style={styles.summaryLabel}>FINAL STACK</Text>
                <Text style={styles.summaryTotal}>{matchEnd.finalStack.toLocaleString('en-US')}</Text>
              </View>
            </View>
          </View>
        )
      })()}

      {!!matchEnd && endPresentation === 'lore' && (
        <View style={styles.lorePresentation} pointerEvents="none">
          <Text style={styles.loreHeader}>
            {(matchEnd.isVictory ?? matchEnd.finalStack > (round?.buyInAmount ?? 0)) ? 'LORE DISCOVERED' : 'LORE FRAGMENT LOCKED'}
          </Text>
          <Text style={styles.loreBody}>
            {(matchEnd.isVictory ?? matchEnd.finalStack > (round?.buyInAmount ?? 0))
              ? MONARCH_VICTORY_LORE
              : 'Defeat Monarch to uncover the message.'}
          </Text>
        </View>
      )}

      {showVictoryVFX && (
        <BossVictoryVFX
          tier="monarch"
          onFinish={() => {
            setShowVictoryVFX(false)
            // Batch 3D-2 Task 2 — เกาะ onFinish จริง (VFX เล่นจบแล้วค่อยเปิด popup) แทนเดา ms ใหม่
            // relicResult อาจ undefined ได้เสมอ (แพ้ไม่มีเลย/roll พลาดฝั่ง server) — guard กัน crash
            if (matchEnd?.relicResult) setRelicReveal(matchEnd.relicResult)
          }}
        />
      )}

      {relicReveal && (
        <RoyalRelicReveal result={relicReveal} onClose={() => setRelicReveal(null)} />
      )}
    </ImageBackground>
  )
}

function SeatCard({ label, sub, small, avatarSource, avatarBorderColor, stillness }: {
  label: string; sub: string; small?: boolean; avatarSource?: any; avatarBorderColor?: string
  // Batch 2 Task 4 — Royal Stillness: idle breathing ≤2% scale, period ≥4s, "ตรงข้าม" reaction UI ใดๆ
  // (audit ยืนยันแล้วว่าไม่มี reaction/emotion/thinking component ไหนเปิดอยู่ในโต๊ะนี้จริง — SeatCard
  // เป็น component ที่ใช้แค่ในไฟล์นี้เท่านั้น ไม่ได้ share กับ Four Gods ของ highNoble/index.tsx จริงๆ
  // แต่ยังใช้รูปแบบ prop ตามที่ขอเพื่อความชัดเจนว่าเป็นการเพิ่มพฤติกรรมเฉพาะที่นั่ง Boss เท่านั้น)
  stillness?: boolean
}) {
  const avatarSize = small ? 44 : 64
  const breathe = useSharedValue(1)
  useEffect(() => {
    if (!stillness) return
    breathe.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.98, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, true,
    )
    return () => { breathe.value = 1 }
  }, [stillness])
  const breatheStyle = useAnimatedStyle(() => (stillness ? { transform: [{ scale: breathe.value }] } : {}))
  return (
    <View style={[styles.seatCard, small && styles.seatCardSmall]}>
      {avatarSource ? (
        <Reanimated.View style={breatheStyle}>
          <Image
            source={avatarSource}
            style={{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2, marginBottom: 6, borderWidth: 2, borderColor: avatarBorderColor ?? COLOR.gold }}
            resizeMode="cover"
          />
        </Reanimated.View>
      ) : (
        <View style={{
          width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2, marginBottom: 6,
          backgroundColor: COLOR.border, alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: avatarSize * 0.45 }}>🤖</Text>
        </View>
      )}
      <Text style={styles.seatLabel}>{label}</Text>
      <Text style={styles.seatSub}>{sub}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bg },
  battleOverlay: {
    ...StyleSheet.absoluteFillObject, top: 48, zIndex: 40,
    backgroundColor: 'transparent', paddingHorizontal: 12,
  },
  showdownCountdownOverlay: {
    ...StyleSheet.absoluteFillObject, zIndex: 58, backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center', justifyContent: 'center',
  },
  showdownCountdownLabel: { color: COLOR.gold, fontSize: 13, fontWeight: '800', letterSpacing: 4, marginBottom: 10 },
  showdownCountdownNumber: { color: '#FFFFFF', fontSize: 88, fontWeight: '900' },
  showdownCountdownSub: { color: COLOR.textSecondary, fontSize: 11, letterSpacing: 1.5, marginTop: 10 },
  battlePhaseTitle: {
    marginTop: 8, color: COLOR.gold, fontFamily: 'Cinzel_700Bold', fontSize: 17,
    letterSpacing: 2, textAlign: 'center',
  },
  battleRuleText: { color: COLOR.textSecondary, fontSize: 9, letterSpacing: 1.2, textAlign: 'center', marginTop: 3 },
  battleSeat: { position: 'absolute', alignItems: 'center', minWidth: 110 },
  battleBoss: { top: 84, left: 0, right: 0 },
  battleLeft: { top: 230, left: 4, alignItems: 'flex-start' },
  battleRight: { top: 230, right: 4, alignItems: 'flex-end' },
  battleHuman: { bottom: 110, left: 0, right: 0 },
  battleSeatFolded: { opacity: 0.42 },
  battleSeatName: { color: COLOR.text, fontSize: 11, fontWeight: '800', marginBottom: 5 },
  battleWinner: { color: '#FFD76A' },
  battleWinnerTag: { color: '#8DFFB5', fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginTop: 4 },
  battleCenter: { position: 'absolute', top: '45%', left: 0, right: 0, alignItems: 'center' },
  battleCenterResult: { color: '#FFD76A', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  battlePot: { color: '#FFD76A', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  battleCall: { color: COLOR.textSecondary, fontSize: 11, marginTop: 4 },
  battleActionBar: {
    position: 'absolute', left: 20, right: 20, bottom: 14, flexDirection: 'row',
    justifyContent: 'center', gap: 12,
  },
  battleActionBtn: { flex: 1, maxWidth: 150 },
  preGfShade: {
    ...StyleSheet.absoluteFillObject, top: 48, zIndex: 75, backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 18,
  },
  preGfCard: {
    width: '100%', maxWidth: 390, maxHeight: '100%', padding: 12, borderRadius: 14,
    backgroundColor: 'rgba(9,24,15,0.98)', borderWidth: 1.5, borderColor: '#FFD76A',
  },
  preGfTitle: { color: '#FFD76A', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  preGfSubtitle: { color: '#A89060', fontSize: 8, fontWeight: '800', letterSpacing: 1, marginTop: 2, marginBottom: 9 },
  preGfTabs: { flexDirection: 'row', gap: 6, marginBottom: 9 },
  preGfTab: { flex: 1, minHeight: 42, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: '#2A4A34', backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  preGfTabActive: { borderColor: '#FFD76A', backgroundColor: 'rgba(255,215,106,0.15)' },
  preGfTabText: { color: '#A89060', fontSize: 12, fontWeight: '800' },
  preGfTabTextActive: { color: '#FFD76A' },
  preGfYouWin: { color: '#8DFFB5', fontSize: 8, fontWeight: '900', marginTop: 1 },
  preGfWaiting: { color: '#A89060', fontSize: 7, fontWeight: '800', marginTop: 1 },
  preGfSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  preGfCommunity: { alignItems: 'center', minWidth: 100 },
  preGfSectionLabel: { color: '#38BDF8', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  preGfDeltaBox: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#2A4A34', backgroundColor: 'rgba(0,0,0,0.3)' },
  preGfDelta: { fontSize: 16, fontWeight: '900' },
  preGfTokenLabel: { color: '#A89060', fontSize: 8 },
  preGfPlayers: { gap: 3 },
  preGfPlayer: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: '#2A4A34', backgroundColor: 'rgba(0,0,0,0.3)' },
  preGfPlayerWinner: { borderColor: '#8DFFB5', backgroundColor: 'rgba(141,255,181,0.08)' },
  preGfPlayerLabel: { width: 76, alignItems: 'center', marginRight: 6 },
  preGfPlayerName: { color: '#F5F2E8', fontSize: 9, fontWeight: '800', maxWidth: 72 },
  preGfPlayerSelf: { color: '#FFD76A' },
  resultAvatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: '#FFD76A', marginBottom: 2 },
  resultAvatarEmoji: { fontSize: 20, marginBottom: 2 },
  preGfWinnerText: { color: '#8DFFB5', fontSize: 8, fontWeight: '900' },
  preGfFoulText: { color: '#FF6B6B', fontSize: 8, fontWeight: '900' },
  preGfContinue: { marginTop: 9, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: '#FFD76A', backgroundColor: '#102218', alignItems: 'center' },
  preGfContinueText: { color: '#FFD76A', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  presentationShade: {
    ...StyleSheet.absoluteFillObject, zIndex: 70, backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20,
  },
  outcomeCard: {
    width: '100%', maxWidth: 330, padding: 24, borderRadius: 16, alignItems: 'center',
    backgroundColor: 'rgba(15,36,24,0.98)', borderWidth: 1.5, borderColor: '#FFD76A',
    transform: [{ translateY: 100 }],
  },
  outcomeTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 20, fontWeight: '900', textAlign: 'center', letterSpacing: 1.5 },
  outcomeSub: { color: COLOR.textSecondary, fontSize: 12, marginTop: 10 },
  summaryCard: {
    width: '100%', maxWidth: 330, padding: 20, borderRadius: 16,
    backgroundColor: 'rgba(15,36,24,0.98)', borderWidth: 1.5, borderColor: '#FFD76A',
    transform: [{ translateY: 100 }],
  },
  summaryTitle: { color: '#FFD76A', fontSize: 18, fontWeight: '900', letterSpacing: 2, textAlign: 'center', marginBottom: 14 },
  summaryIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, marginBottom: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,215,106,0.35)', backgroundColor: 'rgba(0,0,0,0.28)' },
  summaryAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: '#FFD76A' },
  summaryAvatarEmoji: { fontSize: 22 },
  summaryPlayerName: { color: '#F5F2E8', fontSize: 13, fontWeight: '900' },
  summaryPlayerResult: { fontSize: 8, fontWeight: '800', letterSpacing: 1, marginTop: 2 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: 'rgba(201,168,76,0.22)' },
  summaryTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, marginTop: 4 },
  summaryLabel: { color: '#C8C4B0', fontSize: 12, fontWeight: '700' },
  summaryValue: { fontSize: 13, fontWeight: '900' },
  summaryTotal: { color: '#FFD76A', fontSize: 15, fontWeight: '900' },
  lorePresentation: {
    position: 'absolute', zIndex: 65, left: 20, right: 20, bottom: 36,
    borderWidth: 1, borderColor: 'rgba(255,215,106,0.55)', borderRadius: 12,
    backgroundColor: 'rgba(15,36,24,0.97)', padding: 14, alignItems: 'center',
  },
  // Sprint 6-7 §8.2 — Background overlay เต็มจอ ทับพื้นหลังเดิม (ไม่ต้องสร้าง asset ใหม่)
  bgOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: MONARCH_ACCENT.overlay,
  },
  introOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999,
    backgroundColor: 'rgba(5,10,8,0.92)', alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  introBox: { width: '100%', maxWidth: 340, alignItems: 'center' },
  introImageWrap: { alignItems: 'center', justifyContent: 'center' },
  introGlow: {
    position: 'absolute', width: 244, height: 299, borderRadius: 22, backgroundColor: COLOR.gold,
  },
  introImage: { width: 220, height: 275, borderRadius: 14, borderWidth: 2.5, borderColor: COLOR.gold },
  rareBadge: {
    marginTop: 10, borderWidth: 1.5, borderColor: MONARCH_ACCENT.gold, borderRadius: 12,
    paddingVertical: 6, paddingHorizontal: 14, backgroundColor: '#0B1F14', alignItems: 'center',
  },
  rareBadgeText: { fontSize: 11, color: MONARCH_ACCENT.gold, fontWeight: '800', letterSpacing: 1.5 },
  specialRuleText: { fontSize: 9, color: COLOR.textSecondary, fontWeight: '700', letterSpacing: 1, marginTop: 3 },
  introTitle: { fontSize: 20, color: COLOR.gold, fontWeight: '900', letterSpacing: 2, marginTop: 14 },
  introSubtitle: { fontSize: 12, color: COLOR.textSecondary, letterSpacing: 1.5, marginTop: 2 },
  // Batch 3B Task 4 — เดิม introQuote เป็น <Text> เดี่ยว (quote เดียวจบ) ตอนนี้แทนที่ด้วย container
  // (introRevealContainer) ครอบหลายบรรทัดแทน — introRevealTitleLine เด่นกว่าปกติสำหรับบรรทัด
  // "THE MONARCH HAS ARRIVED" โดยเฉพาะ
  introRevealContainer: { marginTop: 16, minHeight: 100, alignItems: 'center' },
  introRevealLine: { fontSize: 13, color: COLOR.text, lineHeight: 20, textAlign: 'center' },
  introRevealTitleLine: { fontSize: 17, color: COLOR.gold, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center', marginVertical: 6 },
  // Batch 3B Task 1 — fake Four Gods intro ใช้ quote เดี่ยว (เทียบ introQuote เดิมทุกประการ แค่แยกชื่อ
  // สไตล์ไม่ให้ปนกับ introRevealLine ของจริง)
  fakeIntroQuote: { fontSize: 13, color: COLOR.text, lineHeight: 20, textAlign: 'center', marginTop: 16, minHeight: 40 },
  introEnterBtn: { marginTop: 20, borderWidth: 1.5, borderColor: COLOR.gold, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 28 },
  introEnterBtnText: { color: COLOR.gold, fontWeight: '800', letterSpacing: 1 },
  // Batch 3B Task 2 — จอมืดวูบ (blackout เต็มจอ) รองรับทั้ง blackout เปล่าๆ และ crown phase ที่ซ้อนทับ
  arrivalBlackout: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998,
    backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center',
  },
  // Batch 3C-1 Task 4 — จอมืดเต็มจอก่อนเปิด G3 ("THE DECIDING PILE") เทียบ arrivalBlackout ของ
  // Batch 3B แต่ zIndex ต่ำกว่าเล็กน้อย (997 ไม่ใช่ 998) กันชนกันถ้าเกิดพร้อมกันในทางทฤษฎี (ไม่มีทาง
  // เกิดจริงเพราะคนละช่วงเวลา — Arrival จบไปนานแล้วก่อนถึง Judgment)
  decidingPileOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 997,
    backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center',
  },
  decidingPileText: {
    color: COLOR.gold, fontFamily: 'Cinzel_700Bold', fontSize: 22, letterSpacing: 3, textAlign: 'center',
  },
  // Batch 3B Task 3 — wash ทองเข้ม #FFC857 12% ซ้อนบน blackout ระหว่าง crown assembly
  goldWash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#FFC857' },
  crownWrap: { width: 240, height: 220, alignItems: 'center', justifyContent: 'center' },
  crownImgWrap: { width: 240, height: 220, alignItems: 'center', justifyContent: 'center' },
  crownImgAbsolute: { position: 'absolute', top: 0, left: 0 },
  crownImg: { width: 240, height: 220 },
  infoBtn: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,215,106,0.2)',
    borderWidth: 1.5, borderColor: COLOR.gold, alignItems: 'center', justifyContent: 'center',
  },
  infoBtnText: { fontSize: 11, color: COLOR.gold, fontWeight: '900' },
  // Batch 3E Task 5 — ปุ่ม Leave ที่ GameTopBar rightSlot (ว่างอยู่เดิม)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalBox: { width: '100%', backgroundColor: COLOR.bgPanel, borderColor: COLOR.gold, borderWidth: 1, borderRadius: 14, padding: 20 },
  modalTitle: { color: COLOR.gold, fontSize: 18, fontWeight: '800', marginBottom: 10 },
  modalText: { color: COLOR.text, fontSize: 14, lineHeight: 20 },
  modalCloseBtn: { backgroundColor: COLOR.gold, borderRadius: 10, paddingVertical: 10, marginTop: 16, alignItems: 'center' },
  modalCloseBtnText: { color: COLOR.bg, fontSize: 15, fontWeight: '700' },
  container: { flex: 1, backgroundColor: 'transparent', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 4 },
  subtitle: { color: COLOR.textSecondary, fontSize: 14, marginBottom: 16 },
  error: { color: COLOR.red, fontSize: 14, marginBottom: 12 },
  tableArea: { flex: 1, width: '100%', position: 'relative', alignItems: 'center', justifyContent: 'center' },
  dealCard: { position: 'absolute', left: '50%', top: '50%', marginLeft: -17, marginTop: -24 },
  dealCardImg: { width: 34, height: 48, borderRadius: 4 },
  midRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginVertical: 12 },
  seatCard: {
    backgroundColor: COLOR.bgPanel, borderColor: COLOR.border, borderWidth: 1, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', minWidth: 120,
  },
  seatCardSmall: { minWidth: 90, paddingVertical: 8, paddingHorizontal: 10 },
  seatLabel: { color: COLOR.text, fontSize: 15, fontWeight: '600' },
  seatSub: { color: COLOR.textSecondary, fontSize: 11, marginTop: 2 },
  community: { alignItems: 'center', flex: 1, marginHorizontal: 8 },
  communityLabel: { color: COLOR.textSecondary, fontSize: 11, marginTop: 6, marginBottom: 2 },
  // Sprint 6-7 §8.3 — กล่องเส้นประแทน "ไม่มี G3 Community" ขนาดเทียบเท่าไพ่ 2 ใบของ CardImageRow(size=34)
  g3EmptyBox: {
    width: 56, height: 48, borderStyle: 'dashed', borderWidth: 1.5, borderColor: MONARCH_ACCENT.dashedBorder,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 4, alignItems: 'center', justifyContent: 'center',
  },
  g3EmptyText: { color: MONARCH_ACCENT.dashedBorder, fontSize: 6.5, lineHeight: 8, textAlign: 'center', paddingHorizontal: 2 },
  cards: { color: COLOR.text, fontSize: 15, fontWeight: '600', letterSpacing: 1 },
  humanPanel: {
    width: '100%', backgroundColor: 'rgba(5,14,10,0.72)', borderColor: 'rgba(201,168,76,0.28)', borderWidth: 1,
    borderRadius: 12, paddingVertical: 6, paddingHorizontal: 8, marginTop: 2, alignItems: 'center',
  },
  humanIdentityRow: { position: 'absolute', left: 8, top: 6, flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 5 },
  humanAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: '#FFD76A' },
  humanAvatarFallback: { backgroundColor: '#132019', alignItems: 'center', justifyContent: 'center' },
  humanAvatarEmoji: { fontSize: 20 },
  humanIdentityName: { color: '#FFD76A', fontSize: 9, fontWeight: '900', maxWidth: 82 },
  humanIdentitySub: { color: '#A89060', fontSize: 7, fontWeight: '800', letterSpacing: 1 },
  battleHumanAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: '#FFD76A', marginBottom: 4 },
  battleHumanAvatarEmoji: { fontSize: 18 },
  buyIn: { color: COLOR.gold, fontSize: 14, marginTop: 10, fontWeight: '600' },
  submitBtn: { backgroundColor: COLOR.gold, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, marginTop: 14 },
  submitBtnDisabled: { backgroundColor: COLOR.border },
  submitBtnText: { color: COLOR.bg, fontSize: 15, fontWeight: '700' },
  // Batch 2 Task 7 — SEAL THE HAND: style เฉพาะปุ่มนี้ ไม่ reuse submitBtn/submitBtnText (ตัวนั้น share
  // กับปุ่ม CALL ของ Grand Finale อยู่ — ห้ามให้เปลี่ยนสีตามไปด้วย) submitBtnDisabled ยังใช้ร่วมได้ปกติ
  sealBtn: {
    backgroundColor: COLOR.bgPanel, borderWidth: 2, borderColor: COLOR.gold,
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, marginTop: 14,
  },
  sealBtnText: { color: COLOR.gold, fontFamily: 'Cinzel_700Bold', fontSize: 16, letterSpacing: 1.5 },
  resultPanel: {
    width: '100%', backgroundColor: COLOR.bgPanel, borderColor: COLOR.gold, borderWidth: 1,
    borderRadius: 12, padding: 16, marginTop: 16,
  },
  resultTitle: { color: COLOR.gold, fontSize: 17, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  revealRow: { marginVertical: 6 },
  revealName: { color: COLOR.text, fontSize: 14, marginBottom: 4 },
  revealWinner: { color: COLOR.green, fontWeight: '700' },
  // Batch 3C-2 Task 3 — ข้อความใต้ไพ่ Monarch ที่ถูกปิดบางส่วนตอนแพ้
  monarchMaskedNote: { color: COLOR.textSecondary, fontSize: 11, fontStyle: 'italic', marginTop: 4 },
  logRow: { color: COLOR.text, fontSize: 14, marginVertical: 2 },
  gfBtnRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 14 },
  gfBtn: { marginHorizontal: 8, minWidth: 100, alignItems: 'center' },
  foldBtn: { backgroundColor: COLOR.red, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  matchEndPanel: {
    width: '100%', backgroundColor: COLOR.bgPanel, borderColor: COLOR.green, borderWidth: 1,
    borderRadius: 12, padding: 16, marginTop: 16, alignItems: 'center',
  },
  // Batch 3C-1 Task 3 — กล่อง net breakdown ต่อกอง แสดงเฉพาะตอนจบเกม
  breakdownBox: { marginTop: 10, alignItems: 'center' },
  // Batch 3C-2 Task 2 — แบนเนอร์ FOUL ตอนแพ้เพราะจัดไพ่ผิดกติกา (เด่นชัดกว่า breakdown ปกติ กัน
  // sudden-death งงว่าโดนโกง)
  foulBanner: {
    width: '100%', backgroundColor: 'rgba(255,107,107,0.12)', borderColor: COLOR.red, borderWidth: 1,
    borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginTop: 10, alignItems: 'center',
  },
  foulBannerTitle: { color: COLOR.red, fontFamily: 'Cinzel_700Bold', fontSize: 16, letterSpacing: 2 },
  foulBannerBody: { color: COLOR.text, fontSize: 13, marginTop: 4, textAlign: 'center' },
  // Sprint 6-7 §8.6 — Header ผลรวม "MONARCH'S TRIAL" เหนือ panel ผล G1 เป็นต้นไป
  trialHeader: { alignItems: 'center', marginTop: 20 },
  trialHeaderTitle: { color: MONARCH_ACCENT.gold, fontSize: 20, fontWeight: '900', letterSpacing: 2 },
  trialHeaderSub: { color: COLOR.textSecondary, fontSize: 12, marginTop: 2, letterSpacing: 1 },
  // Sprint 6-7 §4/§8.6 — Lore box text-only (MVP, ไม่มี asset โลโก้ Arena ตาม Canon Bridge v1.2)
  loreBox: {
    width: '100%', backgroundColor: '#0B1F14', borderColor: MONARCH_ACCENT.gold, borderWidth: 1,
    borderStyle: 'dashed', borderRadius: 10, padding: 14, marginTop: 12, alignItems: 'center',
  },
  loreHeader: { color: MONARCH_ACCENT.gold, fontSize: 13, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  loreBody: { color: COLOR.textSecondary, fontSize: 12, textAlign: 'center', fontStyle: 'italic' },
  // Sprint 6-7 §8.5 — local dialogue toast (ไม่มี icon ตาม audit ที่พบ AiFillNotifyBanner ไม่เข้ากับโทน)
  toastBox: {
    position: 'absolute', top: 100, left: 20, right: 20, zIndex: 500,
    backgroundColor: 'rgba(15,36,24,0.95)', borderColor: MONARCH_ACCENT.gold, borderWidth: 1,
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center',
  },
  toastText: { color: COLOR.text, fontSize: 13, fontStyle: 'italic', textAlign: 'center', lineHeight: 18 },
})
