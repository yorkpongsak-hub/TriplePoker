/**
 * index.tsx — High Noble Multiplayer (3 real Human + Four Gods Boss)
 * Patch Multiplayer: เชื่อมกับ highNobleMultiEngine.ts ฝั่ง server ผ่าน room registry
 * (roomId/userId มาจาก route param — matchmaking เกิดที่ lobby.tsx ก่อนเข้าหน้านี้)
 * The Sage Unicorn Studio Co., Ltd.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert, Animated, Image, ImageBackground, Platform, ScrollView, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { io, Socket } from 'socket.io-client'
import { router, useLocalSearchParams } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { useAuthStore } from '../../../src/store/authStore'
// Patch 2026-07-18: resolve avatar preset key → emoji/รูปภาพ (แก้ VIP preset ไม่โชว์ที่โต๊ะ)
import { PRESET_AVATARS } from '../../../src/components/profile/AvatarPicker'
import { useTableSkins } from '../../../src/hooks/useTableSkins'
import { TABLE_SKINS } from '../../../src/config/tableSkins'
import BossVictoryVFX, { VictoryTier } from '../../../src/components/vfx/BossVictoryVFX'
import LegendaryCardVFX from '../../../src/components/vfx/LegendaryCardVFX'
import { isLocalTripleSweep } from '../../../src/components/vfx/vfxPolicy'
import { useUserStore } from '../../../src/store/userStore'
import { autoSort } from '../../../src/utils/autoSort'
import { getReduceMotion } from '../../../src/utils/reduceMotion'
import { clearPendingMatch, markPendingMatch } from '../../../src/utils/pendingMatch'
import PreGameCountdown from '../../../src/components/PreGameCountdown'
import MonarchConquestBanner from '../../../src/components/game/MonarchConquestBanner'
import { MINION_AVATAR } from '../../../src/constants/minionAvatars'
import { ActionButton } from '../../../src/components/ui/ActionButton'
import { glassPanelDense } from '../../../src/ui/glassStyles'
import { CARD_IMG, CARD_BACK_IMG } from '../../../src/components/game/cardAssets'
import PlayerHandView from '../../../src/components/game/PlayerHandView'
import TokenFlowPanel from '../../../src/components/game/TokenFlowPanel'
import CharacterBarkBubble, { useCharacterBarks } from '../../../src/components/game/CharacterBarkBubble'
import GFHandView from '../../../src/components/game/GFHandView'
import BossHandRow from '../../../src/components/game/BossHandRow'
import GameTopBar from '../../../src/components/game/GameTopBar'
import MatchEndOverlay from '../../../src/components/game/MatchEndOverlay'
import { TierInfoModal } from '../../../src/components/game/TierInfoModal'
import type { TierInfoLabel } from '../../../src/config/tierInfoData'
// Gold Radiance: กรอบทองเฉพาะโต๊ะที่มี buy-in (Adept ขึ้นไป) และเฉพาะที่นั่งของผู้เล่นเอง
import AvatarFrame from '../../../src/components/game/AvatarFrame'
import FlyingCoins, { FlyingCoinsHandle, Point } from '../../../src/components/game/FlyingCoins'

// ตำแหน่งที่นั่งเดียวกับ targets ใน startDealAnimation (Boss=บน, P4=ขวา, User=ล่าง, P2=ซ้าย)
const SEAT_TARGETS = {
  boss:   { x: -50,  y: -240 },
  p4:     { x: 90,   y: -10  },
  user:   { x: -50,  y: 200  },
  p2:     { x: -190, y: -10  },
  center: { x: 0,    y: 0    },
} as const

// Feedback C5 — Showdown result ครอบด้วยพื้นหลังชุดเดียวกับ Profile/Lobby (bg free/vip ตาม isVip)
const SHOWDOWN_BG_FREE = require('../../../assets/backgrounds/bg_main_free.png')
const SHOWDOWN_BG_VIP  = require('../../../assets/backgrounds/bg_main_vip.png')

// ── Assets
const studioLogo  = require('../../../assets/images/sage_unicorn_logo_transparent.png')
// Patch High Noble: Boss Intro Popup — รูป + คำพูดแนะนำตัวจตุรเทพ (key ตรงกับ aiNames[0].name จาก server)
const BOSS_INTRO: Record<string, { image: any; quotes: string[] }> = {
  'Reaper': {
    image: require('../../../assets/bosses/boss_reaper.png'),
    quotes: [
      "You've climbed far, mortal. But every soul that sits across from me... eventually folds.",
      "I never walk away from a hand. Not once. Not ever. Make your peace with that — or make me regret it.",
    ],
  },
  'The Crag': {
    image: require('../../../assets/bosses/boss_crag.png'),
    quotes: [
      "A thousand storms have broken against me. Not one has moved me an inch.",
      "My first two pillars do not crack. But even mountains... have a weaker side.",
    ],
  },
  'Cortex': {
    image: require('../../../assets/bosses/boss_cortex.png'),
    quotes: [
      "Emotion is noise. I do not fold to fear, and I do not call out of pride. Only the numbers decide.",
      "I will never bluff you. I will also never be bluffed. Play the math — not me.",
    ],
  },
  'Cipher': {
    image: require('../../../assets/bosses/boss_cipher.png'),
    quotes: [
      "Reaper is wrath. The Crag is stone. Cortex is cold arithmetic. And I... am none of them. I am all of them. I am whichever I feel like being tonight.",
      "There is no pattern to crack. There is only luck — and how well you bear it.",
    ],
  },
  // Batch 1 Task 2 (Monarch v2.2 cleanup): เอา 'Monarch' ออกจาก map นี้แล้ว — โต๊ะ High Noble ปกติ
  // ไม่มีทางสุ่มเจอ Monarch อีกต่อไป (ดู monarchSpawn.ts's rollHighNobleBoss()) Monarch มีแค่ context
  // เดียวคือ client/app/game/monarch/index.tsx เท่านั้น
}
// Patch High Noble: รูป Avatar จตุรเทพ (square crop หน้าชิด ใช้กับ AvatarBubble ของ P3 เท่านั้น)
const BOSS_AVATAR: Record<string, any> = {
  'Reaper':   require('../../../assets/bosses/boss_reaper_avatar.png'),
  'The Crag': require('../../../assets/bosses/boss_crag_avatar.png'),
  'Cortex':   require('../../../assets/bosses/boss_cortex_avatar.png'),
  'Cipher':   require('../../../assets/bosses/boss_cipher_avatar.png'),
}
const cardBackImg = CARD_BACK_IMG // ใช้หลังไพ่จากไฟล์กลาง cardAssets.ts (คง alias เดิมกันแก้ทุกจุดที่อ้างถึง)
const tableImg    = require('../../../assets/images/table_default.png')
const tripleSpade = require('../../../assets/images/triple_poker_icon.png')

const CW = 62; const CH = 90; const OVERLAP = -38
const SIDE_COL_W = 72
const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'
// Escrow (ที่หักตอน matchmaking เต็มห้อง) ผูกกับ user_id จริงใน DB — ห้าม fallback เงียบเป็น literal เด็ดขาด
// เปิดทางเทสเร็วไม่ login ได้เฉพาะ __DEV__ + ตั้ง env EXPO_PUBLIC_DEV_FAKE_USER_ID เอง — production build ตัดทิ้งอัตโนมัติ
const DEV_FAKE_USER_ID = __DEV__ ? process.env.EXPO_PUBLIC_DEV_FAKE_USER_ID : undefined

interface CardData { id: string; key: string }
interface AIInfo   { id: string; name: string; emoji: string; avatarUrl?: string; isVip?: boolean }
interface HNCardZones {
  stockCount: number; communityCount: number; auctionCount: number; discardCount: number
  handCounts: Record<string, number>
  resolvedPileCounts: { pile1: number; pile2: number; pile3: number }
  totalCards: 52
}
const EMPTY_HN_ZONES: HNCardZones = {
  stockCount: 52, communityCount: 0, auctionCount: 0, discardCount: 0,
  handCounts: {}, resolvedPileCounts: { pile1: 0, pile2: 0, pile3: 0 }, totalCards: 52,
}

// =================================================================
// TIMER DISPLAY — แยก component ไม่ให้ main re-render
// =================================================================
const TimerDisplay: React.FC<{
  valRef: React.MutableRefObject<{ val: number; max: number }>
}> = ({ valRef }) => {
  const [val, setVal] = useState(valRef.current.val)
  const [max, setMax] = useState(valRef.current.max)
  const hapticFiredRef = useRef(false)
  useEffect(() => {
    const id = setInterval(() => {
      setVal(valRef.current.val)
      setMax(valRef.current.max)
    }, 250)
    return () => clearInterval(id)
  }, [])
  const ratio = val / (max || 1)
  const isRed = ratio <= 0.10
  useEffect(() => {
    if (isRed && !hapticFiredRef.current) {
      hapticFiredRef.current = true
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
    } else if (!isRed) {
      hapticFiredRef.current = false
    }
  }, [isRed])
  const color = isRed ? '#cc2222' : ratio <= 0.30 ? '#c9a84c' : '#3daa4a'
  return (
    <>
      <Text style={[s.timerText, { color }]}>{val}</Text>
      <View style={s.tbarWrap}>
        <View style={s.tbarBg}>
          <View style={[s.tbarFill, { width: `${ratio * 100}%` as any, backgroundColor: color }]} />
        </View>
      </View>
    </>
  )
}

// =================================================================
// SERVER LOG (mock)
// =================================================================
const NAMES  = ['SomchaiX','NongBeer','JaoPoker','WinWin99','ThaiDragon','LuckyAce','KingCard','PokerPro7']
const TABLES = ['Table #1','Table #3','Table #7','VIP Room']
const rnd = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]

// Token counter นับวิ่งจาก 0 (หรือค่าเดิม) ไปค่าใหม่ ~650ms — ใช้ตอนโชว์ผล net token ต่อรอบ
const AnimatedTokenNumber: React.FC<{ value: number; style?: any }> = ({ value, style }) => {
  const [display, setDisplay] = useState(0)
  const prevValueRef = useRef(0)
  useEffect(() => {
    const from = prevValueRef.current
    const to = value
    const duration = 650
    const startTime = Date.now()
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - startTime) / duration)
      setDisplay(Math.round(from + (to - from) * t))
      if (t >= 1) {
        clearInterval(id)
        prevValueRef.current = to
      }
    }, 33)
    return () => clearInterval(id)
  }, [value])
  return <Text style={style}>{display > 0 ? '+' : ''}{display}</Text>
}

// Animated "Arranging..." dots ของ AI status badge — วนจำนวนจุดอิสระของตัวเอง ไม่ผูกกับ dotAnim ของ ServerLog ด้านล่าง
const AiStatusDots = React.memo(({ label }: { label: string }) => {
  const [dots, setDots] = useState(1)
  useEffect(() => {
    const id = setInterval(() => setDots(prev => (prev % 3) + 1), 450)
    return () => clearInterval(id)
  }, [])
  return <Text style={s.statusText}>{label}{'.'.repeat(dots)}</Text>
})

const ServerLog = React.memo(({ socket, onMonarchWin }: { socket: Socket | null; onMonarchWin?: (name: string) => void }) => {
  interface LogEntry { id: number; icon: string; text: string; time: string }
  const [logs, setLogs]     = useState<LogEntry[]>([])
  const [online, setOnline] = useState(247)
  const idRef   = useRef(0)
  const dotAnim = useRef(new Animated.Value(1)).current

  const pushLog = useCallback((icon: string, text: string) => {
    const now = new Date()
    const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`
    setLogs(prev => {
      const next = [...prev, { id: ++idRef.current, icon, text, time }]
      return next.length > 8 ? next.slice(-8) : next
    })
  }, [])

  const addLog = useCallback(() => {
    const n = rnd(NAMES), t = rnd(TABLES)
    const evts = [
      { icon: '🟢', text: `${n} joined the server` },
      { icon: '🎮', text: `${n} entered ${t}` },
      { icon: '🏆', text: `${n} won +${50 + Math.floor(Math.random() * 350)} tokens` },
      { icon: '💀', text: `${n} lost -${50 + Math.floor(Math.random() * 150)} tokens` },
      { icon: '🔮', text: `${n} won a Blind Auction!` },
      { icon: '💎', text: `${n} upgraded to VIP` },
    ]
    const ev = rnd(evts)
    pushLog(ev.icon, ev.text)
  }, [pushLog])

  // Server Activity จริง (มติลุงเยาะ 2026-07-26): online count + table_open/win มาจาก
  // io.emit('server_activity', ...) จริงฝั่ง server ผสมกับ mock event ด้านบน (join/entered/lost/auction/vip)
  useEffect(() => {
    if (!socket) return
    const onActivity = (payload: { kind: string; tier?: string; winnerName?: string; isHuman?: boolean; count?: number }) => {
      if (payload.kind === 'online_count') {
        if (typeof payload.count === 'number') setOnline(payload.count)
      } else if (payload.kind === 'win') {
        pushLog(payload.isHuman ? '🏆' : '🤖', `${payload.winnerName} won a match at ${(payload.tier ?? '').toUpperCase()}!`)
      } else if (payload.kind === 'table_open') {
        pushLog('🆕', `New ${(payload.tier ?? '').toUpperCase()} table opened`)
      } else if (payload.kind === 'monarch_spawn') {
        // Sprint 8: Boss Monarch 1v1 — broadcast กว้างตอนโต๊ะเริ่ม (gameSocket.ts room_auto_match)
        pushLog('👑', 'A Hidden Boss has appeared at the High Noble tables!')
      } else if (payload.kind === 'monarch_win') {
        // Sprint 8: broadcast ตอนมีคนพิชิต Monarch ได้ (monarchEngine.ts finalizeMonarchG3) — พิเศษ
        // กว่าการชนะทั่วไป มีการ์ดเลื่อนลงจากขอบบนจอด้วย (ดู MonarchConquestBanner)
        pushLog('👑', `${payload.winnerName} has conquered the Hidden Boss!`)
        if (payload.winnerName) onMonarchWin?.(payload.winnerName)
      }
    }
    socket.on('server_activity', onActivity)
    return () => { socket.off('server_activity', onActivity) }
  }, [socket, pushLog, onMonarchWin])

  useEffect(() => {
    for (let i = 0; i < 4; i++) setTimeout(() => addLog(), i * 200)
    let t: ReturnType<typeof setTimeout>
    const sched = () => { t = setTimeout(() => { addLog(); sched() }, 1500 + Math.random() * 2000) }
    sched()
    const p = Animated.loop(Animated.sequence([
      Animated.timing(dotAnim, { toValue: 0.25, duration: 900, useNativeDriver: true }),
      Animated.timing(dotAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
    ]))
    p.start()
    console.log('[ANIM-DEBUG] START dotAnim (ServerLog, always-mounted)') // ANIM-DEBUG: ลบออกหลังปิดเคส
    return () => { clearTimeout(t); p.stop() }
  }, [addLog])

  return (
    <View style={s.logZone}>
      <View style={[StyleSheet.absoluteFill as any, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
        <Image source={tripleSpade} style={{ width: 160, height: 160, opacity: 0.22 }} resizeMode="contain" />
      </View>
      <View style={s.logHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Animated.View style={[s.liveDot, { opacity: dotAnim }]} />
          <Text style={s.logTitle}>SERVER ACTIVITY</Text>
        </View>
        <Text style={s.onlineTxt}>🟢 {online} online</Text>
      </View>
      <View style={s.logList}>
        {logs.map(l => (
          <View key={l.id} style={s.logBubble}>
            <Text style={{ fontSize: 9 }}>{l.icon}</Text>
            <Text style={s.logTxt} numberOfLines={1}>{l.text}</Text>
            <Text style={s.logTime}>{l.time}</Text>
          </View>
        ))}
      </View>
    </View>
  )
})

// =================================================================
// MAIN
// =================================================================
const GameTableLive: React.FC = () => {
  const { bark, offer: offerBark } = useCharacterBarks()
  const insets = useSafeAreaInsets()
  const isWeb  = Platform.OS === 'web'
  const socketRef = useRef<Socket | null>(null)
  // Patch Multiplayer: roomId/userId มาจาก matchmaking ที่ lobby.tsx (room_auto_match -> room_ready) — ไม่ hardcode อีกต่อไป
  const params   = useLocalSearchParams<{ roomId?: string; userId?: string }>()
  const authUserId = useUserStore(s => s.userId)
  // roomId ต้องมาจาก matchmaking จริงเท่านั้น — ห้าม fallback เป็นค่าคงที่ 'HighNoble1' (บั๊กเดิม: 2 ห้อง
  // พร้อมกันชน state กัน) ถ้า params.roomId หลุด (เข้าหน้านี้ตรงๆ ไม่ผ่าน Lobby) ให้ block+redirect แทน (pattern Adept)
  const ROOM_ID  = params.roomId ?? ''
  // params.userId มาจาก Lobby matchmaking (ผูก escrow ไว้แล้วตอนห้องเต็ม) — authUserId เป็น fallback กันกรณี
  // route param หลุด แต่ทั้งคู่ต้องไม่ว่างพร้อมกัน ห้าม fallback เงียบเป็น literal เด็ดขาด (ดู DEV_FAKE_USER_ID ด้านบน)
  const usingDevFakeId = !params.userId && !authUserId && !!DEV_FAKE_USER_ID
  const PLAYER_ID = params.userId || authUserId || DEV_FAKE_USER_ID || ''
  // Feedback C2 — ไฟล์นี้ไม่เคยผูก authStore เลย ทำให้ P1 (ตัวผู้เล่นเอง) โชว์ '👤'/'You' hardcode ตลอด
  // Patch 2026-07-18: avatar_url เก็บเป็น preset key — resolve ผ่าน PRESET_AVATARS ก่อน render (pattern Initiate)
  const myAvatarRaw = useAuthStore(s => s.profile?.avatar_url) || '👤'
  const myPreset = PRESET_AVATARS.find(p => p.key === myAvatarRaw)
  const myAvatarEmoji = myPreset?.emoji ?? (myPreset?.image ? '' : myAvatarRaw)
  const myAvatarImage = myPreset?.image
  const myDisplayName = useAuthStore(s => s.profile?.display_name) || 'You'
  const isVip = useAuthStore(s => (s.profile?.vip_status ?? 'none') !== 'none') // Feedback C5 — ใช้ vip_status เดิม ไม่สร้าง state ใหม่
  const { activeSkin } = useTableSkins()
  const selectedTableImg = TABLE_SKINS[activeSkin] ?? tableImg

  // ── Timer ref (ไม่ trigger re-render)
  const timerValRef = useRef({ val: 90, max: 90 })
  const continueValRef = useRef(0)
  const aiListRef = useRef<AIInfo[]>([])
  const flyingCoinsRef = useRef<FlyingCoinsHandle>(null)
  // Coin Flying VFX (มติลุงเยาะ 2026-07-26) — แปลง playerId -> ตำแหน่งที่นั่งจริง อ่าน aiListRef.current สด
  const seatTargetFor = (playerId: string): Point => {
    if (playerId === PLAYER_ID) return SEAT_TARGETS.user
    const opp = aiListRef.current
    if (opp[0]?.id === playerId) return SEAT_TARGETS.boss
    if (opp[1]?.id === playerId) return SEAT_TARGETS.p2
    if (opp[2]?.id === playerId) return SEAT_TARGETS.p4
    return SEAT_TARGETS.center
  }
  const timerRef    = useRef<any>(null)

  // ── Full Reconnect System Step 2C — connection lifecycle state (เดิมไม่มีเลย เพราะ
  // reconnection:false มาตลอด) pattern เดียวกับ adept/index.tsx:291-295
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [afkNotice, setAfkNotice] = useState<string | null>(null)
  const afkNoticeTimeoutRef = useRef<any>(null)
  // ownSubmitted จาก game_state_snapshot — ใช้ตัดสินใจตอน hydrate ว่าจะโชว์หน้าจัดไพ่ (ยังไม่ submit)
  // หรือหน้ารอผลจากคนอื่น (submit ไปแล้วก่อนหลุด) กันโดนบังคับจัดไพ่ซ้ำหลัง reconnect
  const [myOwnSubmitted, setMyOwnSubmitted] = useState<{ arrangement: boolean; auctionBid: boolean; discard: boolean }>({ arrangement: false, auctionBid: false, discard: false })

  // ── Game state
  const [phase, setPhase]             = useState<'dealing'|'arrangement'|'arrangement_2'|'countdown'|'showdown'|'fog_of_war'|'blind_auction'|'auction_done'|'discard'|'discard_done'|'grand_finale'|'grand_finale_done'|'result'|'end'>('dealing')
  const [dealDone, setDealDone]         = useState(false)
  const [dealCount, setDealCount]       = useState(0)
  const [roundNumber, setRoundNumber] = useState(1)
  const [totalRounds, setTotalRounds] = useState(5)
  const [flowPot, setFlowPot] = useState<[number, number, number]>([0, 0, 0])
  const [flowFeeRake, setFlowFeeRake] = useState(0)
  const [flowBuyIn, setFlowBuyIn] = useState(0)
  const [countdown, setCountdown]     = useState(3)
  // Pre-Game Countdown (LobbyMatchmaking_Spec_v1_0 §7.1) — คนละตัวกับ `countdown`/phase 'countdown' ข้างบน (Grand Finale/Showdown เดิม ห้ามแตะ)
  const [showPreGameCountdown, setShowPreGameCountdown] = useState(false)
  const [monarchWinner, setMonarchWinner] = useState<string | null>(null) // Sprint 8: Boss Monarch conquest banner
  const preGameCountdownShownRef = useRef(false)
  const countAnim = useRef(new Animated.Value(1)).current
  const fadeCards    = useRef(new Animated.Value(1)).current
  const blinkAnim    = useRef(new Animated.Value(1)).current
  const btnBlinkAnim  = useRef(new Animated.Value(1)).current
  // 44 ใบ (11×4 คน) แต่ละใบมี x, y, opacity, scale
  const DEAL_COUNT = 44
  const dealAnims  = useRef(
    Array.from({ length: DEAL_COUNT }, () => ({
      x:       new Animated.Value(0),
      y:       new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale:   new Animated.Value(0.5),
    }))
  ).current
  // Multiplayer (Adept/HighNoble) — ยืดจาก 33s เดิม (Solo: Initiate/Mastermind) เป็น 45s เพราะต้องดู
  // ไพ่ของผู้เล่นคนอื่นเพิ่มด้วย ไม่ใช่แค่ AI + แบ่งเป็น auto-cycle Pile1→2→3 ทุก 15s (ดู startContinueCountdown)
  const SHOWDOWN_TIMER_SEC = 45
  const [continueCountdown, setContinueCountdown] = useState(SHOWDOWN_TIMER_SEC)
  const continueTimerRef = useRef<any>(null)
  // true ทันทีที่ผู้เล่นแตะเลือก Pile tab เอง — auto-cycle หยุดถาวรจนจบ showdown รอบนี้ (เคารพการเลือกดูของผู้เล่น)
  const autoCycleStoppedRef = useRef(false)

  // ── Cards
  const [piles, setPiles]       = useState<[CardData[], CardData[], CardData[]]>([[], [], []])
  const [selected, setSelected] = useState<{ pi: number; ci: number } | null>(null)
  const [sortDone, setSortDone] = useState(false)
  const [isReady, setIsReady]   = useState(false)

  // ── Community + Blind
  const [comm, setComm]   = useState({ p1: ['',''], p2: ['',''], p3: ['',''] })
  const [blind, setBlind] = useState<string[]>([])
  const [cardZones, setCardZones] = useState<HNCardZones>(EMPTY_HN_ZONES)

  // ── AI
  const [aiList, setAiList]     = useState<AIInfo[]>([])
  const [aiStatus, setAiStatus] = useState<Record<string, string>>({})

  // ── Showdown — เก็บไพ่ทุกคนหลัง reveal ครบ
  const [allCards, setAllCards]       = useState<Record<string, Record<number, string[]>>>({})
  const [pileWinners, setPileWinners] = useState<Record<number, string>>({})
  const [showLegendarySweep, setShowLegendarySweep] = useState(false)
  const [hasFoul, setHasFoul]         = useState<Record<string, boolean>>({})
  // Haptic เตือน Foul ของฉันเอง — ยิงครั้งเดียวตอน hasFoul[PLAYER_ID] เปลี่ยนจาก false → true
  useEffect(() => {
    if (hasFoul[PLAYER_ID]) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
  }, [hasFoul[PLAYER_ID]])
  const [foulReasons, setFoulReasons]   = useState<Record<string, string>>({})
  const [showResult, setShowResult]   = useState(false)
  const [handRanks, setHandRanks]       = useState<Record<number, string>>({})
  const [showRankTable, setShowRankTable] = useState(false)
  const [activeShowdownTab, setActiveShowdownTab] = useState<1|2|3>(1)
  const [revealPile, setRevealPile] = useState<0|1|2|3>(0) // 0=ไม่แสดง 1/2/3=Pile นั้น
  const [showTierInfo, setShowTierInfo] = useState(false)
  const [activeTierTab, setActiveTierTab] = useState('MASTERMIND')
  // Patch High Noble: เก็บ round_start data ไว้รอ — จะ process จริงตอนปิด Boss Intro Popup (Round แรกเท่านั้น)
  const pendingRoundDataRef = useRef<any>(null)
  const processRoundStartRef = useRef<((data: any) => void) | null>(null)
  // Patch High Noble: Boss Intro Popup state + Typewriter effect
  const [showBossIntro, setShowBossIntro] = useState(false)
  const [bossIntroName, setBossIntroName] = useState<string>('Reaper')
  const [typedText, setTypedText] = useState('')
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!showBossIntro) return
    const intro = BOSS_INTRO[bossIntroName]
    if (!intro) return
    const fullText = intro.quotes.join('\n\n')
    const words = fullText.split(' ')
    let i = 0
    setTypedText('')
    if (typewriterRef.current) clearInterval(typewriterRef.current)
    const totalMs = 5000 // Patch: ใช้เวลารวมประมาณ 5 วินาทีจนพิมพ์จบ ไม่ว่าข้อความจะยาวแค่ไหน
    const intervalMs = Math.max(30, Math.floor(totalMs / words.length))
    typewriterRef.current = setInterval(() => {
      i++
      setTypedText(words.slice(0, i).join(' '))
      if (i >= words.length && typewriterRef.current) {
        clearInterval(typewriterRef.current)
        typewriterRef.current = null
      }
    }, intervalMs)
    return () => { if (typewriterRef.current) clearInterval(typewriterRef.current) }
  }, [showBossIntro, bossIntroName])

  // ── Result
  const [tokenBalance, setTokenBalance] = useState<Record<string, number>>({})
  // Patch 2026-07-18: format ยอดโทเคนเต็มมี comma (มติลุงเยาะ: แบบเต็ม ไม่ย่อ K/M) — pattern Initiate
  const fmtToken = (v: number | undefined) => (v ?? buyInAmount).toLocaleString('en-US')
  const [tokenDeltas, setTokenDeltas]   = useState<Record<string, number>>({})
  // Patch 2026-07-18: Boss Victory VFX — god (Four Gods) / monarch ตามบอสของแมตช์
  const [victoryVfx, setVictoryVfx] = useState<VictoryTier | null>(null)
  const [matchResult, setMatchResult]   = useState<any>(null)

  // ── Discard
  const [showDiscard, setShowDiscard]         = useState(false)
  const [buyInAmount, setBuyInAmount]       = useState(0)
  const [showLockup, setShowLockup]         = useState(false)
  // Patch Blind Auction: state ทั้งหมดสำหรับประมูล
  const [auctionBidLevels, setAuctionBidLevels] = useState<number[]>([])
  const [auctionTimeLeft, setAuctionTimeLeft]   = useState(5)
  // Haptic เตือน Auction timer ใกล้หมดเวลา — ยิงตอนแตะ 2s พอดี (จุดเดียวกับที่ text เปลี่ยนสีแดง)
  useEffect(() => {
    if (auctionTimeLeft === 2) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
  }, [auctionTimeLeft])
  const [auctionMyBid, setAuctionMyBid]         = useState<{ cardIndex: 0 | 1; level: number } | null>(null)
  const [auctionResult, setAuctionResult]       = useState<any[] | null>(null)
  const auctionTimerRef = useRef<any>(null)
  const auctionGlowAnim = useRef(new Animated.Value(0)).current
  // Patch: ตัวอักษร FOG OF WAR ใหญ่กลางจอ กะพริบ 5 วิ ก่อนเข้า Auction
  const fogBlinkAnim = useRef(new Animated.Value(1)).current
  // Patch 2026-07-18: เก็บ Animated.loop ของ fogBlinkAnim ไว้ stop ได้ (pattern เดียวกับ
  // dealAnimCompositeRef/winPulseLoopRef) — เดิม Animated.loop วิ่งไม่มีวันจบเอง ไม่เคยถูก stop เลย
  // ถ้า unmount ระหว่าง loop ยังวิ่งอยู่จะชน native attach ("Animated node already attached to a view")
  const fogBlinkLoopRef = useRef<Animated.CompositeAnimation | null>(null)
  // Patch: เฟดไพ่ผู้ชนะ Pile1+2 ออกก่อนเข้า Auction (เริ่มเฟดที่ 5s, ใช้เวลา 3s, รวม 8s ตรงกับ Backend delay)
  const pileFadeAnim = useRef(new Animated.Value(1)).current
  // Patch 2026-07-18: เก็บ setTimeout id ของ pileFadeAnim ไว้ clear ได้ตอนออก phase/unmount ก่อน
  // timeout ทำงาน (เดิมไม่มีทางยกเลิก timeout ที่รอ start animation อยู่เลย)
  const pileFadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Patch: ปุ่ม Confirm discard กะพริบตอนเหลือ 5 วิสุดท้าย
  const confirmBlinkAnim = useRef(new Animated.Value(1)).current
  // Patch Grand Finale: state ทั้งหมด
  const [gfTurnPlayerId, setGfTurnPlayerId]   = useState<string | null>(null)
  const [gfRoundNumber, setGfRoundNumber]     = useState<1 | 2>(1)
  const [gfPile3Pot, setGfPile3Pot]           = useState(0)
  const [gfTimeLeft, setGfTimeLeft]           = useState(10)
  const [gfFoulPlayers, setGfFoulPlayers]     = useState<string[]>([])
  const [gfFoldedPlayers, setGfFoldedPlayers] = useState<string[]>([])
  const [gfRevealedCards, setGfRevealedCards] = useState<Record<string, string[]>>({}) // pid -> ไพ่ที่หงายแล้ว (รอบ 1 และรอบ 2)
  const [gfFinalReveals, setGfFinalReveals]   = useState<Record<string, string[]>>({}) // pid -> ไพ่ครบ 3 ใบ (Round 2 จบ)
  const [gfFinalResult, setGfFinalResult]     = useState<any>(null)
  const [gfResultStage, setGfResultStage]     = useState<1 | 2>(1) // 1: Grand Finale, 2: Round Summary
  // Patch High Noble: ใบที่ Human เลือกหงายในตา Call ปัจจุบัน (default = ใบอ่อนสุดที่ยังไม่หงาย)
  const [gfSelectedCardKey, setGfSelectedCardKey] = useState<string | null>(null)
  const gfTimerRef = useRef<any>(null)
  const gfBlinkAnim = useRef(new Animated.Value(1)).current
  // Patch: Animated.Value สำหรับ Health Bar — ไม่ trigger re-render ทั้ง tree
  const gfHealthAnim = useRef(new Animated.Value(1)).current
  const gfCallAmount = useRef(0)
  // Patch Discard Phase: state ใหม่ — ไพ่มาจาก Server (5-6 ใบ) ไม่ใช่ piles[2] เดิม
  const [discardHandKeys, setDiscardHandKeys]   = useState<string[]>([])
  const [discardSuggested, setDiscardSuggested] = useState<string[]>([])
  const [discardTimeLeft, setDiscardTimeLeft]   = useState(20)
  // Haptic เตือน Discard timer ใกล้หมดเวลา — ยิงตอนแตะ 3s พอดี (จุดเดียวกับที่ discardSub text เปลี่ยนสีแดง)
  useEffect(() => {
    if (discardTimeLeft === 3) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
  }, [discardTimeLeft])
  const discardTimerRef = useRef<any>(null)
  const [discardSelected, setDiscardSelected] = useState<number[]>([])
  // Patch (บั๊กแก้) High Noble: Discard แบบ 3 กอง — เลือกทิ้งจากกองไหนก็ได้ใน 11-12 ใบ ให้เหลือกองละ 3 ใบเป๊ะ
  const [isHNDiscard, setIsHNDiscard] = useState(false)
  const [discardPiles, setDiscardPiles] = useState<{ pile1: string[]; pile2: string[]; pile3: string[] }>({ pile1: [], pile2: [], pile3: [] })
  const [discardNeed, setDiscardNeed] = useState<{ pile1: number; pile2: number; pile3: number }>({ pile1: 0, pile2: 0, pile3: 0 })
  const [discardSelByPile, setDiscardSelByPile] = useState<{ pile1: number[]; pile2: number[]; pile3: number[] }>({ pile1: [], pile2: [], pile3: [] })

  // ── VFX
  const winPulse      = useRef(new Animated.Value(1)).current
  const winOpacity    = useRef(new Animated.Value(1)).current
  const confettiAnims = useRef(
    Array.from({ length: 20 }, () => ({
      x: new Animated.Value(Math.random() * 360 - 30),
      y: new Animated.Value(-20),
      opacity: new Animated.Value(1),
      rotate: new Animated.Value(0),
    }))
  ).current
  // Patch 2026-07-18: เก็บ composite animation ของ win-pulse/win-opacity/confetti ไว้ stop ได้ (pattern Adept)
  // กัน "Animated node already attached to a view" ถ้า component unmount/เล่นซ้ำขณะ loop ยังวิ่งอยู่
  const winPulseLoopRef = useRef<Animated.CompositeAnimation | null>(null)
  const winOpacityLoopRef = useRef<Animated.CompositeAnimation | null>(null)
  const confettiActiveRef = useRef(false)
  const confettiCompositesRef = useRef<Animated.CompositeAnimation[]>([])

  // ANIM-DEBUG: ลบออกหลังปิดเคส — log mount/unmount ของทุก conditional-mount block ที่มี
  // Animated.View/Animated.Text ข้างใน (native driver ตัวไหนยังผูกอยู่ ดู START log คู่กัน)
  useEffect(() => {
    const active = phase === 'countdown'
    if (active) console.log('[ANIM-DEBUG] MOUNT countdown-overlay (countAnim), phase=', phase)
    return () => { if (active) console.log('[ANIM-DEBUG] UNMOUNT countdown-overlay (countAnim), phase=', phase) }
  }, [phase === 'countdown']) // ANIM-DEBUG: ลบออกหลังปิดเคส

  useEffect(() => {
    const active = phase === 'fog_of_war'
    if (active) console.log('[ANIM-DEBUG] MOUNT fog-of-war-memory-cards (pileFadeAnim), phase=', phase)
    return () => { if (active) console.log('[ANIM-DEBUG] UNMOUNT fog-of-war-memory-cards (pileFadeAnim), phase=', phase) }
  }, [phase === 'fog_of_war']) // ANIM-DEBUG: ลบออกหลังปิดเคส

  useEffect(() => {
    const active = phase === 'fog_of_war'
    if (active) console.log('[ANIM-DEBUG] MOUNT fog-of-war-big-text (fogBlinkAnim), phase=', phase)
    return () => { if (active) console.log('[ANIM-DEBUG] UNMOUNT fog-of-war-big-text (fogBlinkAnim), phase=', phase) }
  }, [phase === 'fog_of_war']) // ANIM-DEBUG: ลบออกหลังปิดเคส

  useEffect(() => {
    const active = phase === 'grand_finale' && !!gfTurnPlayerId
    if (active) console.log('[ANIM-DEBUG] MOUNT grand-finale-big-text (gfBlinkAnim), phase=', phase)
    return () => { if (active) console.log('[ANIM-DEBUG] UNMOUNT grand-finale-big-text (gfBlinkAnim), phase=', phase) }
  }, [phase === 'grand_finale' && !!gfTurnPlayerId]) // ANIM-DEBUG: ลบออกหลังปิดเคส

  useEffect(() => {
    const active = showDiscard && !isHNDiscard
    if (active) console.log('[ANIM-DEBUG] MOUNT discard-modal-simple (confirmBlinkAnim), phase=', phase)
    return () => { if (active) console.log('[ANIM-DEBUG] UNMOUNT discard-modal-simple (confirmBlinkAnim), phase=', phase) }
  }, [showDiscard && !isHNDiscard]) // ANIM-DEBUG: ลบออกหลังปิดเคส

  useEffect(() => {
    const active = showDiscard && isHNDiscard
    if (active) console.log('[ANIM-DEBUG] MOUNT discard-modal-hn (confirmBlinkAnim), phase=', phase)
    return () => { if (active) console.log('[ANIM-DEBUG] UNMOUNT discard-modal-hn (confirmBlinkAnim), phase=', phase) }
  }, [showDiscard && isHNDiscard]) // ANIM-DEBUG: ลบออกหลังปิดเคส

  // showdown_result มาถึง → แสดง ShowdownResult popup ทันที countdown 45 วิ (Multiplayer)
  const startContinueCountdown = () => {
    // ไม่เรียก setContinueCountdown ที่นี่แล้ว — ContinueTimer อ่านจาก continueValRef เองทุก 500ms
    // เพื่อเลี่ยง parent re-render ทุกวินาที (ต้นเหตุของไพ่กะพริบ)
    continueValRef.current = SHOWDOWN_TIMER_SEC
    autoCycleStoppedRef.current = false
    if (continueTimerRef.current) clearInterval(continueTimerRef.current)
    continueTimerRef.current = setInterval(() => {
      const next = Math.max(0, continueValRef.current - 1)
      continueValRef.current = next
      // Auto-cycle Pile tab ทุก 15s (45s/3 กอง) ถ้าผู้เล่นยังไม่เคยแตะเลือกเองรอบนี้ — setState ด้วยค่า
      // เดิมซ้ำ React จะไม่ re-render เพิ่ม (bail out เอง) เลยเรียกได้ทุก tick โดยไม่ต้องเช็ค tab ปัจจุบัน
      if (!autoCycleStoppedRef.current) {
        const elapsed = SHOWDOWN_TIMER_SEC - next
        const targetTab = elapsed < 15 ? 1 : elapsed < 30 ? 2 : 3
        setActiveShowdownTab(targetTab)
      }
      if (next <= 0) {
        clearInterval(continueTimerRef.current)
        handleContinue()
      }
    }, 1000)
  }

  useEffect(() => {
    const hasFoulAll = Object.keys(hasFoul).length > 0
    const winnersReady = pileWinners[1] && pileWinners[2] && pileWinners[3]
    if (!winnersReady && !hasFoulAll) return
    if (showResult) return // ป้องกัน run ซ้ำ
    setShowResult(true)
    startContinueCountdown()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(pileWinners), JSON.stringify(hasFoul)])

  // Local-only: this screen celebrates only when its P1 user wins all three piles in this round.
  useEffect(() => {
    if (isLocalTripleSweep(pileWinners, PLAYER_ID)) setShowLegendarySweep(true)
  }, [pileWinners[1], pileWinners[2], pileWinners[3], PLAYER_ID])

  // ── Connect Socket (ครั้งเดียว)
  useEffect(() => {
    // Auth guard: userId ว่างแปลว่าหลุด auth guard มาได้ (authStore ยังไม่ sync) — ห้ามเข้าโต๊ะต่อ
    // เพราะ escrow จะผูก token จริงเข้ากับ id ที่ไม่มีอยู่จริง คืนไม่ได้ — fail loud แทน fail silent
    if (!PLAYER_ID) {
      console.error('[game] userId missing — auth state broken')
      Alert.alert(
        'Session expired',
        'Please log in again.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
      )
      return
    }
    if (usingDevFakeId) {
      console.warn('[game] Using DEV_FAKE_USER_ID for PLAYER_ID:', PLAYER_ID)
    }
    // Room guard: roomId ว่างแปลว่าเข้าหน้านี้ตรงๆ ไม่ผ่าน Lobby matchmaking (ห้าม fallback เป็น
    // ค่าคงที่ 'HighNoble1' เด็ดขาด — บั๊กเดิม: 2 ห้องพร้อมกันชน state กัน) กลับ Lobby ให้จับคู่ใหม่
    if (!ROOM_ID) {
      console.error('[game] roomId missing — entered without matchmaking')
      Alert.alert(
        'Table Not Found',
        'This table could not be found. Please join a table from the lobby.',
        [{ text: 'OK', onPress: () => router.replace('/(home)/lobby') }]
      )
      return
    }

    // Full Reconnect System Step 2C — เปิด reconnection จริง (เดิม false — เน็ตสะดุดแป๊บเดียวก็ค้างจอ
    // ถาวร ไม่มีทางกลับมาเองเลย) ค่า attempts/delay ตรงกับ adept/index.tsx:497-499
    const socket = io(SERVER_URL, {
      transports: ['websocket'], reconnection: true, reconnectionAttempts: 5, reconnectionDelay: 1000,
    })
    socketRef.current = socket

    // 'connect' ยิงทั้งตอน connect ครั้งแรกและตอน reconnect สำเร็จ (คนละ event ต่อการเชื่อมต่อจริงแต่ละครั้ง)
    // — ต้อง emit game_join ทุกครั้งไม่มีข้อยกเว้น เพื่อให้ server ยิง game_state_snapshot กลับมา คืนที่นั่ง
    // ให้จริง (เดิมมี matchStarted guard กันยิงซ้ำ ซึ่งจะบล็อก game_join ตอน reconnect ไปด้วยโดยไม่ตั้งใจ
    // จึงต้องลบทิ้ง — ตอนนี้ reconnection:true แล้ว connect ที่ยิงซ้ำคือสัญญาณว่าต้อง join ใหม่จริงๆ)
    socket.on('connect', () => {
      setIsReconnecting(false)
      setConnectionError(null)
      socket.emit('game_join', { roomId: ROOM_ID, userId: PLAYER_ID, tier: 'highNoble' })
    })

    socket.on('connect_error', (err: any) => {
      setConnectionError(err?.message || 'Cannot reach the game server.')
    })

    // Full Reconnect System Step 2C — เน็ตหลุดกลางเกม โชว์ "Reconnecting..." ระหว่างรอ socket.io ต่อเอง
    // อัตโนมัติ (reconnection:true ด้านบน) ยกเว้นตอนที่เราเป็นคน disconnect เอง (unmount/ออกจากหน้านี้)
    socket.on('disconnect', (reason: string) => {
      if (reason === 'io client disconnect') return
      setIsReconnecting(true)
    })

    // Full Reconnect System Step 2C — อีกคน (P4/P1/P2) หลุด/กลับมา — field จริงจาก markHNPlayerAFK/
    // finalizeHNAFKReplacement คือ {userId, temporary, graceSeconds?, replacementName?} (ไม่ใช่
    // disconnectedUserId/displayName แบบ Adept — payload คนละ shape ห้าม copy handler ของ Adept ตรงๆ)
    socket.on('player_disconnected_replaced', (data: { roomId: string; userId: string; temporary: boolean; graceSeconds?: number; replacementName?: string }) => {
      if (data.userId === PLAYER_ID) return // ตัวเองไม่ต้องเห็น notice ของตัวเอง
      const name = data.replacementName ?? 'A player'
      if (afkNoticeTimeoutRef.current) clearTimeout(afkNoticeTimeoutRef.current)
      setAfkNotice(data.temporary ? `${name} disconnected — reconnecting...` : `${name} was replaced by AI`)
      afkNoticeTimeoutRef.current = setTimeout(() => setAfkNotice(null), 4000)
    })

    // Full Reconnect System Step 2C — reconnect มาถึงหลัง match จบไปแล้ว (state ถูกลบแล้วฝั่ง server)
    // ต้องเด้งกลับ lobby แทนค้างจอรอ event ที่ไม่มีวันมาถึง (pattern เดียวกับ match_error ด้านล่าง)
    socket.on('match_not_found', (_data: { roomId: string }) => {
      Alert.alert(
        'Match Ended',
        'This match has already ended.',
        [{ text: 'OK', onPress: () => router.replace('/(home)/lobby') }]
      )
    })

    // Buy-in Spec §4 safety net — server ปฏิเสธเข้าโต๊ะเพราะ token ไม่พอ (ปกติ Lobby เช็คไว้ก่อนแล้ว)
    socket.on('match_error', (data: { roomId: string; message: string }) => {
      Alert.alert(
        'Cannot Start Match',
        data.message === 'INSUFFICIENT_TOKENS' ? 'You do not have enough tokens for this table\'s buy-in.'
          : data.message === 'ACTIVE_MATCH_EXISTS' ? 'You have an unfinished match.'
          : 'Something went wrong. Please try again.',
        [{ text: 'OK', onPress: () => router.replace('/(home)/lobby') }]
      )
    })

    // Patch High Noble: แยก logic จริงของ round_start ออกมาเป็นฟังก์ชัน — defer ตอน Round แรก (รอปิด Boss Intro Popup ก่อนแจกไพ่)
    const processRoundStart = (data: any) => {
      // Pre-Game Countdown §7.1 — โชว์ครั้งเดียวตอนเริ่มแมตช์ (หลัง Boss Intro Popup ปิดแล้ว ถ้ามี — processRoundStart
      // ถูก defer มาจนกว่าจะปิด popup อยู่แล้วตาม comment ด้านบน)
      if (data.roundNumber === 1 && !preGameCountdownShownRef.current) {
        preGameCountdownShownRef.current = true
        setShowPreGameCountdown(true)
      }
      setPhase('arrangement')
      setRoundNumber(data.roundNumber)
      setTotalRounds(data.totalRounds ?? 5)
      setIsReady(false); setSortDone(false); setSelected(null)
      setAllCards({}); setPileWinners({})
      setHasFoul({}); setFoulReasons({}); setTokenDeltas({})
      setShowResult(false)
      setHandRanks({})
      setRevealPile(0)
      setActiveShowdownTab(1)
      autoCycleStoppedRef.current = false
      setContinueCountdown(SHOWDOWN_TIMER_SEC)
      continueValRef.current = SHOWDOWN_TIMER_SEC
      if (continueTimerRef.current) clearInterval(continueTimerRef.current)
      setShowDiscard(false); setDiscardSelected([])
      // Patch 2026-07-18: ต้อง stopAnimation ก่อน setValue เสมอ กัน native-driven timing ที่ยังค้างจาก
      // handleContinue ชนกัน — กดไพ่ให้ซ่อน (0) ตอนเริ่มรอบใหม่ ไม่ใช่ 1 (fadeCards bind ค้างแล้ว ไม่มี
      // literal ternary คอยบังตอน dealing อีกต่อไป — ค่านี้คือตัวซ่อนไพ่จริงตอน dealing)
      fadeCards.stopAnimation(() => { fadeCards.setValue(0) })
      setBlind([]); setDealCount(0)
      setTokenBalance(data.tokenBalance ?? {})
      if (typeof data.buyInAmount === 'number') setFlowBuyIn(data.buyInAmount)
      // Patch Multiplayer: server ส่ง seats ทั้ง 4 ที่นั่ง (boss เสมอ + อีก 3 ที่อาจเป็น Human หรือ AI)
      // แปลงเป็น aiList แบบเดิม [boss, ...อีก 2 คนที่ไม่ใช่ฉัน] — โครง bossAI/p2AI/p4AI ด้านล่างใช้ index เดิมได้เลย
      const seats = data.seats ?? []
      const bossSeat = seats.find((s: any) => s.role === 'boss')
      const otherSeats = seats.filter((s: any) => s.id !== PLAYER_ID && s.role !== 'boss')
      const aiNames = [bossSeat, ...otherSeats].filter(Boolean)
      setAiList(aiNames)
      aiListRef.current = aiNames

      const init: Record<string, string> = {}
      aiNames.forEach((a: any) => { init[a.id] = 'Arranging' })
      setAiStatus(init)

      // Coin Flying VFX — Ante: ทุกที่นั่งส่งเหรียญเข้ากองกลางตอนเริ่มรอบ (มติลุงเยาะ 2026-07-26)
      ;[SEAT_TARGETS.boss, SEAT_TARGETS.p4, SEAT_TARGETS.user, SEAT_TARGETS.p2].forEach(from => {
        flyingCoinsRef.current?.fire('ante', from, SEAT_TARGETS.center)
      })

      setComm({
        p1: data.communityCards.pile1,
        p2: data.communityCards.pile2,
        p3: data.communityCards.pile3,
      })
      setBlind(data.blindAuction ?? [])
      if (data.cardZones) setCardZones(data.cardZones)

      // Buy-in (Escrow) — แสดง popup เฉพาะ Round 1
      if (data.buyInAmount && data.roundNumber === 1) {
        setBuyInAmount(data.buyInAmount)
        setShowLockup(true)
      }

      // เริ่ม deal animation
      setPhase('dealing')
      setDealDone(false)

      const myCards: string[] = data.cards[PLAYER_ID] ?? []
      const cardObjs = myCards.map((k: string, i: number) => ({ id: `c${i}`, key: k }))
      setPiles([cardObjs.slice(0, 3), cardObjs.slice(3, 6), cardObjs.slice(6, 11)])

      // Patch: timer Arrangement R1 อ่านจาก gameConfig.arrangementTimer (Backend ส่งมาทาง data.timer)
      const t = data.timer ?? 35
      timerValRef.current = { val: t, max: t }
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        const next = Math.max(0, timerValRef.current.val - 1)
        timerValRef.current = { ...timerValRef.current, val: next }
        if (next <= 0) {
          clearInterval(timerRef.current)
          setPiles(cur => {
            socket.emit('hn_player_ready', {
              roomId: ROOM_ID, userId: PLAYER_ID,
              arrangement: {
                pile1: cur[0].map((c: CardData) => c.key),
                pile2: cur[1].map((c: CardData) => c.key),
                pile3: cur[2].map((c: CardData) => c.key), // Patch Mastermind: ส่ง 5 ใบเต็ม Discard Phase จะตัดทีหลัง (ไม่ใช่ slice เหลือ 3 แบบ Initiate)
              },
            })
            return cur
          })
        }
      }, 1000)
    }
    processRoundStartRef.current = processRoundStart

    socket.on('round_start', (data: any) => {
      if (typeof data.buyInAmount === 'number') void markPendingMatch('highNoble')
      // Patch High Noble: Round แรกของ Match — โชว์ Boss Intro Popup ก่อน แล้วค่อยแจกไพ่ตอนปิด popup
      if (data.roundNumber === 1) {
        const bossName = (data.seats ?? []).find((s: any) => s.role === 'boss')?.name
        if (bossName && BOSS_INTRO[bossName]) {
          setBossIntroName(bossName)
          setShowBossIntro(true)
          pendingRoundDataRef.current = data
          return
        }
      }
      processRoundStart(data)
    })

    // showdown_countdown — แสดง countdown 3-2-1 ก่อน
    socket.on('showdown_countdown', (data: any) => {
      setPhase('countdown')
      if (timerRef.current) clearInterval(timerRef.current)
      let c = data.seconds ?? 3
      const tick = () => {
        setCountdown(c)
        Animated.sequence([
          // Patch 2026-07-18: useNativeDriver false ตาม Adept (adept:520-521) — countdown overlay
          // ค้าง mount ตลอดเวลาแล้ว (ไม่ conditional-mount อีกต่อไป) แต่ยังคง false ไว้กันความเสี่ยง
          // native-attach ซ้ำซ้อน เผื่อกรณี tick ถี่เกินจน animation ก่อนหน้ายังไม่จบ
          Animated.timing(countAnim, { toValue: 1.6, duration: 150, useNativeDriver: false }),
          Animated.timing(countAnim, { toValue: 1,   duration: 850, useNativeDriver: false }),
        ]).start()
        console.log('[ANIM-DEBUG] START countAnim (tick c=' + c + '), phase=', phase) // ANIM-DEBUG: ลบออกหลังปิดเคส
        if (c > 0) { c--; setTimeout(tick, 1000) }
      }
      tick()
    })

    // showdown_result — server ส่งผลทุก Pile พร้อมกัน → แสดง popup ทันที
    socket.on('showdown_result', (data: any) => {
      const results = data.pileResults ?? []
      const newAllCards: Record<string, Record<number, string[]>> = {}
      const newWinners: Record<number, string> = {}
      const newHandRanks: Record<number, string> = {}
      const newFouled: Record<string, boolean> = {}

      results.forEach((pile: any) => {
        const pNum: number = pile.pileNumber
        // เก็บไพ่ทุกคน
        Object.entries(pile.arrangements ?? {}).forEach(([pid, cards]) => {
          if (!newAllCards[pid]) newAllCards[pid] = {}
          newAllCards[pid][pNum] = cards as string[]
        })
        if (pile.winner) newWinners[pNum] = pile.winner
        if (pile.winnerHandRank) newHandRanks[pNum] = pile.winnerHandRank
        if (pile.fouled) Object.assign(newFouled, pile.fouled)
      })

      setAllCards(newAllCards)
      setPileWinners(newWinners)
      setHandRanks(newHandRanks)
      setHasFoul(newFouled)
      setFoulReasons(data.foulReasons ?? {})
      setTokenDeltas(data.tokenDeltas ?? {})
      setPhase('showdown')

      // Coin Flying VFX — High Noble = Sequential Showdown: showdown_result มีแค่ Pile1/2
      // (Pile3/Grand Finale แยกไปยิงที่ grand_finale_result ด้านล่าง)
      const pileCoinVariant = { 1: 'pile1', 2: 'pile2', 3: 'pile3' } as const
      ;([1, 2] as const).forEach(pNum => {
        const winnerId = newWinners[pNum]
        if (winnerId) flyingCoinsRef.current?.fire(pileCoinVariant[pNum], SEAT_TARGETS.center, seatTargetFor(winnerId))
      })
    })

    // pile_reveal — Pro+ sequential (ยังคงไว้สำหรับ Mastermind+)
    socket.on('pile_reveal', (data: any) => {
      const pNum: number = data.pileNumber
      const arrangements: Record<string, string[]> = data.arrangements ?? {}
      setAllCards(prev => {
        const next = { ...prev }
        Object.entries(arrangements).forEach(([pid, cards]) => {
          if (!next[pid]) next[pid] = {}
          next[pid] = { ...next[pid], [pNum]: cards as string[] }
        })
        return next
      })
      setPileWinners(prev => ({ ...prev, [pNum]: data.winner }))
      if (data.winnerHandRank) setHandRanks(prev => ({ ...prev, [pNum]: data.winnerHandRank }))
      setHasFoul(data.fouled ?? {})
      if (data.foulReasons) setFoulReasons(data.foulReasons)
      // Patch: เปิด popup Showdown ทันทีที่ Pile แรกมาถึง (ไม่ต้องรอ pNum===3 ซึ่ง Mastermind ไม่ไปถึง ณ จุดนี้)
      setPhase('showdown')
    })
    // Patch Mastermind: Fog of War — กลับหน้าโต๊ะ เหลือ Pile 3 เท่านั้น
    socket.on('fog_of_war', (_data: any) => {
      setPhase('fog_of_war')
      // Patch: reset fadeCards กลับเป็น 1 (เพราะ handleContinue ของ Showdown fade ไป 0 แล้ว ยังไม่ reset)
      // Patch 2026-07-18: stopAnimation ก่อน setValue เสมอ กัน native-driven timing ค้างจากรอบก่อนชนกัน
      fadeCards.stopAnimation(() => { fadeCards.setValue(1) })
      // Patch 2026-07-18: stopAnimation ก่อน setValue/start เสมอ + clear timeout ค้างจากรอบก่อน
      // กัน native-driven timing ซ้อนกัน ("Animated node already attached to a view")
      if (pileFadeTimeoutRef.current) clearTimeout(pileFadeTimeoutRef.current)
      pileFadeAnim.stopAnimation(() => { pileFadeAnim.setValue(1) })
      pileFadeTimeoutRef.current = setTimeout(() => {
        pileFadeTimeoutRef.current = null
        pileFadeAnim.stopAnimation()
        Animated.timing(pileFadeAnim, { toValue: 0, duration: 3000, useNativeDriver: true }).start()
        console.log('[ANIM-DEBUG] START pileFadeAnim (fog_of_war, +5s one-shot), phase=', phase) // ANIM-DEBUG: ลบออกหลังปิดเคส
      }, 5000)
      fogBlinkLoopRef.current?.stop()
      fogBlinkAnim.setValue(1)
      fogBlinkLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(fogBlinkAnim, { toValue: 0.2, duration: 500, useNativeDriver: true }),
          Animated.timing(fogBlinkAnim, { toValue: 1,   duration: 500, useNativeDriver: true }),
        ])
      )
      fogBlinkLoopRef.current.start()
      console.log('[ANIM-DEBUG] START fogBlinkAnim (Animated.loop, fog_of_war handler), phase=', phase) // ANIM-DEBUG: ลบออกหลังปิดเคส
    })
    // Patch Blind Auction: เริ่มประมูล
    socket.on('blind_auction_start', (data: any) => {
      // Patch: เผื่อ fadeCards ค้างที่ 0 จาก handleContinue (Showdown popup) - reset กลับเป็น 1
      // Patch 2026-07-18: stopAnimation ก่อน setValue เสมอ กัน native-driven timing ค้างจากรอบก่อนชนกัน
      fadeCards.stopAnimation(() => { fadeCards.setValue(1) })
      // Patch 2026-07-18: ออกจาก fog_of_war phase แล้ว — หยุด fogBlinkAnim loop + pileFadeAnim
      // (รวม clear timeout ที่อาจยังรออยู่) กัน loop/timing ค้างวิ่งต่อหลัง Fog of War UI unmount
      if (pileFadeTimeoutRef.current) { clearTimeout(pileFadeTimeoutRef.current); pileFadeTimeoutRef.current = null }
      pileFadeAnim.stopAnimation()
      fogBlinkLoopRef.current?.stop()
      fogBlinkLoopRef.current = null
      setPhase('blind_auction')
      setAuctionBidLevels(data.bidLevels ?? [])
      setAuctionMyBid(null)
      setAuctionResult(null)
      const totalSec = Math.ceil((data.decisionTimeMs ?? 5000) / 1000)
      setAuctionTimeLeft(totalSec)
      if (auctionTimerRef.current) clearInterval(auctionTimerRef.current)
      let left = totalSec
      auctionTimerRef.current = setInterval(() => {
        left -= 1
        setAuctionTimeLeft(Math.max(0, left))
        if (left <= 0) clearInterval(auctionTimerRef.current)
      }, 1000)
      auctionGlowAnim.setValue(0)
      Animated.loop(
        Animated.sequence([
          Animated.timing(auctionGlowAnim, { toValue: 1, duration: 900, useNativeDriver: false }),
          Animated.timing(auctionGlowAnim, { toValue: 0, duration: 900, useNativeDriver: false }),
        ])
      ).start()
    })
    // Patch Blind Auction: ผลประมูล
    socket.on('blind_auction_result', (data: any) => {
      if (auctionTimerRef.current) clearInterval(auctionTimerRef.current)
      auctionGlowAnim.stopAnimation()
      setAuctionResult(data.results ?? [])
      setTokenBalance(data.tokenBalance ?? {})
      setPhase('auction_done')
      offerBark({ speaker: aiListRef.current[0]?.name ?? 'Cipher', event: 'AUCTION_WIN' })
    })
    socket.on('token_flow_update', (data: any) => {
      if (data.tokenBalance) setTokenBalance(data.tokenBalance)
      if (typeof data.roundNumber === 'number') setRoundNumber(data.roundNumber)
      if (typeof data.totalRounds === 'number') setTotalRounds(data.totalRounds)
      if (data.pot) setFlowPot(data.pot)
      if (typeof data.feeRake === 'number') setFlowFeeRake(data.feeRake)
      if (typeof data.buyInAmount === 'number') setFlowBuyIn(data.buyInAmount)
      if (data.pot) setFlowPot(data.pot)
      if (typeof data.feeRake === 'number') setFlowFeeRake(data.feeRake)
      if (typeof data.buyIn === 'number') setFlowBuyIn(data.buyIn)
    })
    // Full Reconnect System Step 2C — แยก logic จริงของ arrangement_2_start ออกมาเป็นฟังก์ชัน (เดิม inline
    // อยู่ในตัว listener อย่างเดียว) เพื่อให้ game_state_snapshot hydration (ด้านล่าง) เรียกซ้ำได้โดยไม่
    // copy โค้ด — พฤติกรรมของ listener เดิมไม่เปลี่ยนแม้แต่บรรทัดเดียว แค่ห่อเป็นฟังก์ชัน
    const applyArr2 = (cards: string[], timer: number) => {
      setPhase('arrangement_2')
      setIsReady(false); setSortDone(false); setSelected(null)
      const cardObjs = cards.map((k: string, i: number) => ({ id: `c2_${i}`, key: k }))
      setPiles([cardObjs.slice(0, 3), cardObjs.slice(3, 6), cardObjs.slice(6)])
      const t = timer
      timerValRef.current = { val: t, max: t }
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        const next = Math.max(0, timerValRef.current.val - 1)
        timerValRef.current = { ...timerValRef.current, val: next }
        if (next <= 0) {
          clearInterval(timerRef.current)
          setPiles(cur => {
            socket.emit('hn_arrangement_2', {
              roomId: ROOM_ID, userId: PLAYER_ID,
              arrangement: {
                pile1: cur[0].map((c: CardData) => c.key),
                pile2: cur[1].map((c: CardData) => c.key),
                pile3: cur[2].map((c: CardData) => c.key),
              },
            })
            return cur
          })
        }
      }, 1000)
    }
    // Patch High Noble: Arrangement รอบ2 — จัดไพ่ใหม่รวมไพ่ที่ประมูลได้ (สูงสุด 12 ใบ)
    socket.on('arrangement_2_start', (data: any) => {
      applyArr2(data.cards ?? [], data.timer ?? 20)
    })

    // ─────────────────────────────────────────────────────────────────────
    // Full Reconnect System Step 2C — hydrate state ทั้งก้อนจาก game_state_snapshot (Step 2A)
    // ครอบทุก phase (round_start/arrangement_2_start เดิมครอบแค่ arrangement/arrangement_2 เท่านั้น)
    // เจตนา: "resume ที่ค้างอยู่" ไม่ใช่ "เริ่มรอบใหม่" จึงไม่ replay ante VFX / buy-in popup / deal
    // animation ซ้ำ (ต่างจาก processRoundStart ที่ทำครบสำหรับรอบใหม่จริงๆ — เจตนาไม่ reuse ตรงๆ ตรงนี้
    // เพราะจะเล่น ceremony รอบใหม่ซ้ำให้คนที่แค่หลุดเน็ตแป๊บเดียวเห็นโดยไม่ควร)
    // ⚠️ timer: design ล็อกให้ "เริ่มนับเต็มใหม่" เสมอ (ไม่อ่าน timeRemainingMs ซึ่งเป็น null อยู่แล้ว
    // ตอนนี้) ใช้ค่า default เดียวกับที่แต่ละ handler เดิมใช้เป็น fallback (35/20 ฯลฯ)
    // ⚠️ decorative animation loop (auction glow, GF health-bar/blink) ไม่ replay ตอน hydrate — จะกลับมา
    // เล่นเองตอน event ปกติถัดไปมาถึง ตัวเลข countdown ถูกต้องตาม design ล็อกอยู่แล้วโดยไม่ต้องมี animation
    // ─────────────────────────────────────────────────────────────────────
    const applySnapshot = (data: any) => {
      const mappedPhase = data.phase === 'match_end' ? 'end' : data.phase
      setPhase(mappedPhase)

      // ── Common ทุก phase ──
      if (data.community) {
        setComm({ p1: data.community.pile1, p2: data.community.pile2, p3: data.community.pile3 })
      }
      if (data.blindAuctionCards) setBlind(data.blindAuctionCards)
      if (data.cardZones) setCardZones(data.cardZones)
      if (data.seats) {
        const bossSeat = data.seats.find((s: any) => s.role === 'boss')
        const otherSeats = data.seats.filter((s: any) => s.id !== PLAYER_ID && s.role !== 'boss')
        const aiNames = [bossSeat, ...otherSeats].filter(Boolean)
        setAiList(aiNames)
        aiListRef.current = aiNames
      }
      if (data.tokenBalance) setTokenBalance(data.tokenBalance)
      if (data.ownSubmitted) setMyOwnSubmitted(data.ownSubmitted)

      const toCardObjs = (keys: string[], prefix: string) => keys.map((k: string, i: number) => ({ id: `${prefix}${i}`, key: k }))
      const submittedArrangement = !!data.ownSubmitted?.arrangement
      const submittedDiscard = !!data.ownSubmitted?.discard

      // ── มือตัวเอง ต่อ phase (Q9: submit แล้ว → myArrangement ที่จัดแล้ว, ยังไม่ submit → myCards ดิบ) ──
      if (mappedPhase === 'arrangement') {
        if (submittedArrangement && data.myArrangement) {
          setPiles([toCardObjs(data.myArrangement.pile1, 'sp1_'), toCardObjs(data.myArrangement.pile2, 'sp2_'), toCardObjs(data.myArrangement.pile3, 'sp3_')])
        } else if (data.myCards) {
          const cardObjs = toCardObjs(data.myCards, 'sc')
          setPiles([cardObjs.slice(0, 3), cardObjs.slice(3, 6), cardObjs.slice(6, 11)])
          setIsReady(false); setSortDone(false); setSelected(null)
          const t = 35
          timerValRef.current = { val: t, max: t }
          if (timerRef.current) clearInterval(timerRef.current)
          timerRef.current = setInterval(() => {
            const next = Math.max(0, timerValRef.current.val - 1)
            timerValRef.current = { ...timerValRef.current, val: next }
            if (next <= 0) {
              clearInterval(timerRef.current)
              setPiles(cur => {
                socket.emit('hn_player_ready', {
                  roomId: ROOM_ID, userId: PLAYER_ID,
                  arrangement: { pile1: cur[0].map((c: CardData) => c.key), pile2: cur[1].map((c: CardData) => c.key), pile3: cur[2].map((c: CardData) => c.key) },
                })
                return cur
              })
            }
          }, 1000)
        }
      } else if (mappedPhase === 'arrangement_2') {
        if (submittedArrangement && data.myArrangement) {
          setPiles([toCardObjs(data.myArrangement.pile1, 'sp1_'), toCardObjs(data.myArrangement.pile2, 'sp2_'), toCardObjs(data.myArrangement.pile3, 'sp3_')])
        } else if (data.myCards) {
          applyArr2(data.myCards, 20)
        }
      } else if (data.myArrangement) {
        // discard/discard_done/fog_of_war/grand_finale/grand_finale_done/end — arrangement ล็อกไปแล้ว
        // เสมอตั้งแต่ arrangement_2 จบ (ไม่ว่า ownSubmitted.discard จะ true/false ก็ตาม)
        setPiles([toCardObjs(data.myArrangement.pile1, 'sp1_'), toCardObjs(data.myArrangement.pile2, 'sp2_'), toCardObjs(data.myArrangement.pile3, 'sp3_')])
      }
      if (data.myFinalPile3) {
        // discard_done เป็นต้นไป — pile3 คือมือสุดท้าย 3 ใบ (ทับ index 2 เหมือนที่ discard_phase_result ทำ)
        setPiles(prev => [prev[0], prev[1], toCardObjs(data.myFinalPile3, 'gf-c')] as any)
      }

      // ── Pile reveals (D2 — 1:1 ไม่แปลง shape, null ของผู้แพ้ = การ์ดหลังอัตโนมัติผ่าน ?? [] ที่จุด render) ──
      if (data.pileReveals) {
        const next: Record<string, Record<number, string[]>> = {}
        const assign = (pileNum: 1 | 2, record: Record<string, string[] | null>) => {
          Object.entries(record ?? {}).forEach(([pid, cards]) => {
            if (!next[pid]) next[pid] = {}
            next[pid][pileNum] = cards as any
          })
        }
        assign(1, data.pileReveals.pile1)
        assign(2, data.pileReveals.pile2)
        setAllCards(next)
        const findWinner = (record: Record<string, string[] | null>) => Object.entries(record ?? {}).find(([, c]) => c !== null)?.[0]
        const w1 = findWinner(data.pileReveals.pile1)
        const w2 = findWinner(data.pileReveals.pile2)
        setPileWinners({ ...(w1 ? { 1: w1 } : {}), ...(w2 ? { 2: w2 } : {}) })
      }
      if (data.foulMap) setHasFoul(data.foulMap)
      if (data.foulReasons) setFoulReasons(data.foulReasons)

      // ── Auction (D1 — level/amount ไม่มีใน snapshot ยอมรับ gap ตามมติลุงเยาะ ใส่ null แล้ว guard ที่ UI) ──
      if (data.auctionWonCards && data.blindAuctionCards) {
        const results = Object.entries(data.auctionWonCards).map(([winnerId, cardKey]) => ({
          cardIndex: data.blindAuctionCards[0] === cardKey ? 0 : 1,
          winnerId, cardKey, level: null as number | null, amount: null as number | null,
        }))
        setAuctionResult(results)
      }

      // ── Grand Finale (ชื่อ field ตรงเกือบหมด, turnPlayerId derive จาก turnOrder[currentTurnIdx]) ──
      if (data.grandFinale) {
        const gf = data.grandFinale
        setGfPile3Pot(gf.pile3Pot ?? 0)
        setGfFoulPlayers(gf.foulPlayers ?? [])
        setGfFoldedPlayers(gf.foldedPlayers ?? [])
        setGfRevealedCards(gf.revealedCards ?? {})
        setGfRoundNumber(gf.roundNumber ?? 1)
        const currentTurnId: string | null = gf.turnOrder?.[gf.currentTurnIdx] ?? null
        setGfTurnPlayerId(currentTurnId)
        if (currentTurnId) setGfTimeLeft(10) // เต็มใหม่ตาม design ล็อก (ค่า default เดียวกับ useState เดิม)
      }

      // ── Discard-in-progress (D3): ยังไม่ submit discard → derive discardNeed จาก myArrangement เอง
      // (สูตรเดียวกับที่ server ใช้คำนวณ needDiscard: pileN.length - 3) ไม่ต้องรอ field ใหม่จาก server ──
      if (mappedPhase === 'discard' && !submittedDiscard && data.myArrangement) {
        const arr = data.myArrangement
        setDiscardPiles({ pile1: arr.pile1, pile2: arr.pile2, pile3: arr.pile3 })
        const need = {
          pile1: Math.max(0, arr.pile1.length - 3),
          pile2: Math.max(0, arr.pile2.length - 3),
          pile3: Math.max(0, arr.pile3.length - 3),
        }
        setDiscardNeed(need)
        const lastIdx = (len: number, n: number) => Array.from({ length: n }, (_, i) => len - n + i)
        setDiscardSelByPile({
          pile1: lastIdx(arr.pile1.length, need.pile1),
          pile2: lastIdx(arr.pile2.length, need.pile2),
          pile3: lastIdx(arr.pile3.length, need.pile3),
        })
        setIsHNDiscard(true)
        setShowDiscard(true)
        const totalSec = 20 // เต็มใหม่ตาม design ล็อก (ค่าเดียวกับ discardTimer.highNoble default)
        setDiscardTimeLeft(totalSec)
        if (discardTimerRef.current) clearInterval(discardTimerRef.current)
        let left = totalSec
        discardTimerRef.current = setInterval(() => {
          left -= 1
          setDiscardTimeLeft(Math.max(0, left))
          if (left <= 0) clearInterval(discardTimerRef.current)
        }, 1000)
      }
    }
    socket.on('game_state_snapshot', applySnapshot)
    socket.on('hn_card_zones', (zones: HNCardZones) => setCardZones(zones))

    // Patch Discard Phase: เริ่มเลือกทิ้งไพ่
    socket.on('discard_phase_start', (data: any) => {
      const hand: string[] = data.hand ?? []
      const suggested: string[] = data.suggestedKeep ?? []
      setDiscardHandKeys(hand)
      setDiscardSuggested(suggested)
      // default: เลือกทิ้งไพ่ที่ "ไม่ใช่" suggestedKeep (กากบาทคำแนะนำ)
      const defaultDiscardIdx = hand
        .map((k, i) => ({ k, i }))
        .filter(({ k }) => !suggested.includes(k))
        .map(({ i }) => i)
      setDiscardSelected(defaultDiscardIdx)
      setShowDiscard(true)
      setPhase('discard')
      const totalSec = Math.ceil((data.decisionTimeMs ?? 10000) / 1000)
      setDiscardTimeLeft(totalSec)
      if (discardTimerRef.current) clearInterval(discardTimerRef.current)
      let left = totalSec
      discardTimerRef.current = setInterval(() => {
        left -= 1
        setDiscardTimeLeft(Math.max(0, left))
        if (left <= 5 && left > 0) {
          // Patch 2026-07-18: stopAnimation ก่อน start ใหม่ทุกครั้ง กัน tick ถี่เกินจน animation
          // ก่อนหน้ายังไม่จบซ้อนกัน ("Animated node already attached to a view")
          confirmBlinkAnim.stopAnimation()
          Animated.sequence([
            Animated.timing(confirmBlinkAnim, { toValue: 0.3, duration: 350, useNativeDriver: true }),
            Animated.timing(confirmBlinkAnim, { toValue: 1,   duration: 350, useNativeDriver: true }),
          ]).start()
          console.log('[ANIM-DEBUG] START confirmBlinkAnim (discard tick left=' + left + '), phase=', phase) // ANIM-DEBUG: ลบออกหลังปิดเคส
        }
        if (left <= 0) clearInterval(discardTimerRef.current)
      }, 1000)
    })
    // Patch (บั๊กแก้) High Noble: เปิด Discard แบบ 3 กอง
    socket.on('discard_phase_start_highnoble', (data: any) => {
      setIsHNDiscard(true)
      const p1 = data.pile1 ?? []
      const p2 = data.pile2 ?? []
      const p3 = data.pile3 ?? []
      const need = data.needDiscard ?? { pile1: 0, pile2: 0, pile3: 0 }
      setDiscardPiles({ pile1: p1, pile2: p2, pile3: p3 })
      setDiscardNeed(need)
      // Patch: default เลือกทิ้ง "ใบสุดท้าย" ของแต่ละกองตามจำนวนที่ต้องทิ้ง (ขึ้นกากบาทไว้ก่อนเลย)
      // ผู้เล่นกดเปลี่ยนเองได้ — ถ้าไม่กดอะไรเลย ระบบจะทิ้งตามนี้อัตโนมัติตอนหมดเวลา
      const lastIdx = (len: number, n: number) => Array.from({ length: n }, (_, i) => len - n + i)
      setDiscardSelByPile({
        pile1: lastIdx(p1.length, need.pile1),
        pile2: lastIdx(p2.length, need.pile2),
        pile3: lastIdx(p3.length, need.pile3),
      })
      setShowDiscard(true)
      setPhase('discard')
      const totalSec = Math.ceil((data.decisionTimeMs ?? 20000) / 1000)
      setDiscardTimeLeft(totalSec)
      if (discardTimerRef.current) clearInterval(discardTimerRef.current)
      let left = totalSec
      discardTimerRef.current = setInterval(() => {
        left -= 1
        setDiscardTimeLeft(Math.max(0, left))
        if (left <= 5 && left > 0) {
          // Patch 2026-07-18: stopAnimation ก่อน start ใหม่ทุกครั้ง กัน tick ถี่เกินจน animation
          // ก่อนหน้ายังไม่จบซ้อนกัน ("Animated node already attached to a view")
          confirmBlinkAnim.stopAnimation()
          Animated.sequence([
            Animated.timing(confirmBlinkAnim, { toValue: 0.3, duration: 350, useNativeDriver: true }),
            Animated.timing(confirmBlinkAnim, { toValue: 1,   duration: 350, useNativeDriver: true }),
          ]).start()
          console.log('[ANIM-DEBUG] START confirmBlinkAnim (discard tick left=' + left + '), phase=', phase) // ANIM-DEBUG: ลบออกหลังปิดเคส
        }
        if (left <= 0) clearInterval(discardTimerRef.current)
      }, 1000)
    })
    socket.on('discard_phase_result', (data: any) => {
      if (discardTimerRef.current) clearInterval(discardTimerRef.current)
      // Patch 2026-07-18: discard จบแล้ว modal กำลังจะปิด — หยุด confirmBlinkAnim ก่อนเสมอ
      // กัน "Animated node already attached to a view" ตอน modal unmount ระหว่าง blink ยังเล่นอยู่
      confirmBlinkAnim.stopAnimation()
      setShowDiscard(false)
      setPhase('discard_done')
      const myFinalHand: string[] = data.myFinalHand ?? []
      if (myFinalHand.length > 0) {
        setPiles(prev => {
          const np = [prev[0], prev[1], myFinalHand.map((k, i) => ({ id: `gf-c${i}`, key: k }))] as typeof prev
          return np
        })
      }
    })
    // Patch Grand Finale: เริ่ม
    socket.on('grand_finale_start', (data: any) => {
      // Patch High Noble: reset selected card เมื่อเริ่ม Grand Finale
      setGfSelectedCardKey(null)
      console.log('🟢 [DEBUG] grand_finale_start received!', data)
      setPhase('grand_finale')
      setGfRoundNumber(1)
      setGfPile3Pot(data.pile3Pot ?? 0)
      setGfFoulPlayers(data.foulPlayers ?? [])
      setGfFoldedPlayers([])
      setGfRevealedCards({})
      setGfFinalReveals({})
      setGfFinalResult(null)
    })
    // Patch Grand Finale: เปลี่ยน Round
    socket.on('grand_finale_round_start', (data: any) => {
      // Patch High Noble: reset selected card เมื่อเข้ารอบใหม่
      setGfSelectedCardKey(null)
      setGfRoundNumber(data.roundNumber ?? 2)
      setGfPile3Pot(data.pile3Pot ?? gfPile3Pot)
    })
    // Patch Grand Finale: ตา player คนนี้
    socket.on('grand_finale_turn', (data: any) => {
      setGfTurnPlayerId(data.playerId ?? null)
      gfCallAmount.current = data.callAmount ?? 0
      const totalSec = Math.ceil((data.timeLimitMs ?? 10000) / 1000)
      setGfTimeLeft(totalSec)
      if (gfTimerRef.current) clearInterval(gfTimerRef.current)
      let left = totalSec
      gfTimerRef.current = setInterval(() => {
        left -= 1
        setGfTimeLeft(Math.max(0, left))
        if (left <= 0) clearInterval(gfTimerRef.current)
      }, 1000)
      // Patch: Animated Health Bar — animate จาก 1 → 0 ภายในเวลา (ไม่ trigger re-render)
      gfHealthAnim.setValue(1)
      Animated.timing(gfHealthAnim, {
        toValue: 0,
        duration: data.timeLimitMs ?? 20000,
        useNativeDriver: false, // ต้องใช้ JS-driven เพราะ width animation
      }).start()
      // เริ่ม blink animation
      gfBlinkAnim.setValue(1)
      Animated.loop(
        Animated.sequence([
          Animated.timing(gfBlinkAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
          Animated.timing(gfBlinkAnim, { toValue: 1,   duration: 500, useNativeDriver: true }),
        ])
      ).start()
      console.log('[ANIM-DEBUG] START gfBlinkAnim (Animated.loop, grand finale turn handler), phase=', phase) // ANIM-DEBUG: ลบออกหลังปิดเคส
    })
    // Patch Grand Finale: ผล action ของผู้เล่นคนหนึ่ง
    socket.on('grand_finale_action', (data: any) => {
      console.log('🔴 [DEBUG] grand_finale_action:', data)
      if (gfTimerRef.current) clearInterval(gfTimerRef.current)
      gfBlinkAnim.stopAnimation()
      if (data.action === 'fold') {
        setGfFoldedPlayers(prev => [...prev, data.playerId])
      } else if (data.revealedCard) {
        console.log('🔴 [DEBUG] revealedCard from server:', data.revealedCard, 'playerId:', data.playerId)
        if (data.playerId === PLAYER_ID) {
          console.log('🔴 [DEBUG] piles[2] keys:', piles[2].map(c => c.key))
        }
        setGfRevealedCards(prev => ({ ...prev, [data.playerId]: [...(prev[data.playerId] ?? []), data.revealedCard] }))
      }
      setGfPile3Pot(data.pile3Pot ?? 0)
      setTokenBalance(data.tokenBalance ?? {})
      setGfTurnPlayerId(null)
    })
    // Patch Grand Finale: เทียบไพ่ Round 2 (หงายไพ่ครบทุกคนที่เหลือ)
    socket.on('grand_finale_reveal_all', (data: any) => {
      setGfFinalReveals(data.reveals ?? {})
    })
    // Patch Grand Finale: ผลสุดท้าย
    socket.on('grand_finale_result', (data: any) => {
      setGfFinalResult(data)
      setTokenBalance(data.tokenBalance ?? {})
      setPhase('grand_finale_done')
      setGfResultStage(1)
      // หลัง 5 วิ ไป stage 2 (Round Summary)
      setTimeout(() => setGfResultStage(2), 5000)

      // Coin Flying VFX — Pile3 (Grand Finale) รู้ผลแยกจาก Pile1/2 (winnerId ว่างได้ถ้า all-foul)
      if (data.winnerId) flyingCoinsRef.current?.fire('pile3', SEAT_TARGETS.center, seatTargetFor(data.winnerId))
    })
    socket.on('grand_finale_all_foul', (_data: any) => {
      offerBark({ speaker: aiListRef.current[0]?.name ?? 'Reaper', event: 'FOUL' })
      // emit ก่อน grand_finale_result — ไม่ต้องทำอะไรเพิ่ม รอ grand_finale_result มา
    })
    socket.on('grand_finale_walkover', (_data: any) => {
      // emit ก่อน grand_finale_result — ไม่ต้องทำอะไรเพิ่ม รอ grand_finale_result มา
    })

    socket.on('round_result', (data: any) => {
      setPhase('result')
      setTokenBalance(data.tokenBalance ?? {})
      setTokenDeltas(data.tokenDeltas ?? {})
      const speaker = aiListRef.current[0]?.name ?? 'Reaper'
      const winners = Object.values(data.pileWinners ?? {})
      offerBark({ speaker, event: winners.length >= 3 && winners.every(id => id === PLAYER_ID) ? 'TRIPLE_SWEEP' : (data.tokenDeltas?.[PLAYER_ID] ?? 0) > 0 ? 'COMEBACK' : 'G1_LOSS' })
    })

    socket.on('match_end', (data: any) => {
      void clearPendingMatch()
      setPhase('end')
      setMatchResult(data)
      setTokenBalance(data.tokenBalance ?? {})
      // Server ส่งยอด token_balance จริงหลัง settle มาด้วย (per-player) — ห้ามคำนวณเองจาก buyin/stack
      const myNewBalance = data.newTokenBalances?.[PLAYER_ID] ?? data.newTokenBalance
      if (typeof myNewBalance === 'number') {
        useUserStore.getState().updateTokenBalance(myNewBalance)
      }
      if (data.finalWinner === PLAYER_ID) {
        // Batch 1.5 Task 3 (quarantine cleanup, 2026-07-30): เดิมเช็ค bossIntroName==='Monarch' เพื่อ
        // เลือก VFX ระดับตำนาน — เส้นทางนั้นตายแล้วตั้งแต่ Batch 1 (ลบ BOSS_INTRO['Monarch'] ออกไปแล้ว
        // bossIntroName จึงไม่มีทางเป็น 'Monarch' อีกต่อไปในไฟล์นี้ — Monarch มีแค่โต๊ะแยกของตัวเองที่
        // monarch/index.tsx เท่านั้น) เหลือ 'god' ตรงๆ ไม่ต้องเช็คเงื่อนไขที่ไม่มีทางเป็นจริงอีก
        setVictoryVfx('god')
        // Patch 2026-07-18: หยุด loop/composite ค้างจากรอบก่อน (ถ้ามี) ก่อนเริ่มใหม่เสมอ +
        // useNativeDriver:false ทุกจุด (pattern Adept) กัน native "already attached to a view"
        stopMatchEndAnimations()
        winPulseLoopRef.current = Animated.loop(Animated.sequence([
          Animated.timing(winPulse, { toValue: 1.25, duration: 400, useNativeDriver: false }),
          Animated.timing(winPulse, { toValue: 1,    duration: 400, useNativeDriver: false }),
        ]))
        winPulseLoopRef.current.start()
        winOpacityLoopRef.current = Animated.loop(Animated.sequence([
          Animated.timing(winOpacity, { toValue: 0.4, duration: 300, useNativeDriver: false }),
          Animated.timing(winOpacity, { toValue: 1,   duration: 300, useNativeDriver: false }),
        ]))
        winOpacityLoopRef.current.start()
        confettiActiveRef.current = true
        const launchConfetti = () => {
          if (!confettiActiveRef.current) return
          confettiCompositesRef.current = []
          confettiAnims.forEach((a, i) => {
            a.x.setValue(Math.random() * 360 - 30)
            a.y.setValue(-100); a.opacity.setValue(1); a.rotate.setValue(0)
            const anim = Animated.parallel([
              Animated.timing(a.y,       { toValue: 700, duration: 2000 + Math.random() * 1500, delay: i * 80, useNativeDriver: false }),
              Animated.timing(a.opacity, { toValue: 0,   duration: 2500, delay: i * 80, useNativeDriver: false }),
              Animated.timing(a.rotate,  { toValue: 720, duration: 2000, delay: i * 80, useNativeDriver: false }),
            ])
            confettiCompositesRef.current.push(anim)
            anim.start(({ finished }) => {
              if (finished && confettiActiveRef.current && i === confettiAnims.length - 1) launchConfetti()
            })
          })
        }
        launchConfetti()
      }
    })

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (dealAnimCompositeRef.current) dealAnimCompositeRef.current.stop() // Patch: หยุด deal anim ตอน unmount
      // Patch 2026-07-18: หยุด win-pulse/win-opacity/confetti ก่อน unmount เสมอ (pattern Adept) — ไม่งั้น
      // Animated.loop/confetti recursion ที่ไม่มีวันจบเองจะไปชน native attach ตอน mount รอบถัดไป
      stopMatchEndAnimations()
      // Patch 2026-07-18: safety-net หยุด fogBlinkAnim/pileFadeAnim/confirmBlinkAnim/gfBlinkAnim ตอน
      // unmount เสมอ — เผื่อ component unmount กลาง phase ก่อนถึงจุด stop ปกติใน handler ถัดไป
      if (pileFadeTimeoutRef.current) { clearTimeout(pileFadeTimeoutRef.current); pileFadeTimeoutRef.current = null }
      pileFadeAnim.stopAnimation()
      fogBlinkLoopRef.current?.stop()
      fogBlinkLoopRef.current = null
      confirmBlinkAnim.stopAnimation()
      gfBlinkAnim.stopAnimation()
      socket.disconnect()
    }
  }, [])

  // ── Deal Animation
  // Patch 2026-07-17: composite ref เก็บ Animated.parallel ไว้เรียก .stop() (พอร์ต pattern จาก Adept)
  const dealAnimCompositeRef = useRef<Animated.CompositeAnimation | null>(null)
  // Reduce Motion preference (Settings modal, AsyncStorage local) — โหลดครั้งเดียวตอน mount แล้ว
  // เก็บใน ref (ไม่ trigger re-render) ให้ startDealAnimation() อ่านสดตอนถูกเรียกจริง
  const reduceMotionRef = useRef(false)
  useEffect(() => { getReduceMotion().then(v => { reduceMotionRef.current = v }) }, [])

  const startDealAnimation = () => {
    // Patch: หยุด animation รอบเก่าก่อนเสมอ — กัน "Animated node is already attached to a view"
    if (dealAnimCompositeRef.current) dealAnimCompositeRef.current.stop()
    // ตำแหน่งปลายทาง: Boss=บน, P4=ขวา, User=ล่าง, P2=ซ้าย
    const targets = [
      { x: -50,  y: -240 }, // Boss AI (บน)
      { x: 90,   y: -10  }, // P4 (ขวา)
      { x: -50,  y: 200  }, // User (ล่าง)
      { x: -190, y: -10  }, // P2 (ซ้าย)
    ]
    // reset ทุกใบ
    dealAnims.forEach(a => {
      a.x.setValue(0); a.y.setValue(0)
      a.opacity.setValue(1); a.scale.setValue(0.5)
    })

    // Reduce Motion: ย่นเวลารวมจาก 10s เหลือ ~1.2s ตามสัดส่วนเดิม (DEAL_COUNT ไม่เปลี่ยน)
    const dealDurationMs = reduceMotionRef.current ? 1200 : 4000
    const delayPerCard = (dealDurationMs - 1000) / DEAL_COUNT // ~205ms ต่อใบ (ปกติ) / ~4.5ms (Reduce Motion)
    const anims: Animated.CompositeAnimation[] = []

    dealAnims.forEach((a, i) => {
      const playerIdx = i % 4 // วนตามเข็มนาฬิกา Boss→P4→User→P2
      const target = targets[playerIdx]
      anims.push(
        Animated.sequence([
          Animated.delay(i * delayPerCard),
          Animated.parallel([
            Animated.timing(a.opacity, { toValue: 1, duration: 100, useNativeDriver: true }),
            Animated.timing(a.scale,   { toValue: 1, duration: 150, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(a.x,       { toValue: target.x, duration: 200, useNativeDriver: true }),
            Animated.timing(a.y,       { toValue: target.y, duration: 200, useNativeDriver: true }),
          ]),
        ])
      )
      // นับไพ่ที่แจกไปแล้ว
      setTimeout(() => setDealCount(i + 1), i * delayPerCard + 450)
    })

    const dealComposite = Animated.parallel(anims)
    dealAnimCompositeRef.current = dealComposite
    console.log('[ANIM-DEBUG] START dealAnims composite (dealAnimCompositeRef), phase=', phase) // ANIM-DEBUG: ลบออกหลังปิดเคส
    dealComposite.start(({ finished }) => {
      dealAnimCompositeRef.current = null
      if (!finished) return // ถูก .stop() กลางทาง — ห้ามแตะ phase (กันเด้งไป arrangement ผิดจังหวะ)
      setDealDone(true)
      setShowLockup(false)
      setPhase('arrangement')
      // Patch 2026-07-18: เผยไพ่กลับมาให้เห็นหลัง deal เสร็จ (fadeCards ถูกกดไว้ที่ 0 ตอนเริ่ม dealing
      // ใน processRoundStart) — stopAnimation ก่อนเสมอกันชนกับ timing ค้างจากรอบก่อน (pattern Adept)
      fadeCards.stopAnimation()
      Animated.timing(fadeCards, { toValue: 1, duration: 300, useNativeDriver: false }).start()
    })
  }

  // เริ่ม deal เมื่อ phase เปลี่ยนเป็น dealing
  useEffect(() => {
    if (phase === 'dealing') {
      const t = setTimeout(() => startDealAnimation(), 300)
      return () => clearTimeout(t)
    }
  }, [phase])

  // ── Card swap
  const handleCardPress = useCallback((pi: number, ci: number) => {
    if (isReady || (phase !== 'arrangement' && phase !== 'arrangement_2')) return
    if (!selected) { setSelected({ pi, ci }); return }
    if (selected.pi === pi && selected.ci === ci) { setSelected(null); return }
    const np = piles.map(p => [...p]) as [CardData[], CardData[], CardData[]]
    const tmp = np[selected.pi][selected.ci]
    np[selected.pi][selected.ci] = np[pi][ci]
    np[pi][ci] = tmp
    setPiles(np); setSelected(null); setSortDone(false)
  }, [isReady, phase, selected, piles])

  const handleAutoSort = () => {
    if (!comm.p1[0]) return
    const sorted = autoSort([...piles[0], ...piles[1], ...piles[2]], {
      pile1: [comm.p1[0], comm.p1[1]] as [string, string],
      pile2: [comm.p2[0], comm.p2[1]] as [string, string],
      pile3: [comm.p3[0], comm.p3[1]] as [string, string],
    })
    setPiles(sorted); setSelected(null); setSortDone(true)
  }

  // Patch Mastermind: ตัด Discard popup ออกจาก Ready — Discard Phase จริงเกิดหลัง Blind Auction (patch ถัดไป)
  const handleReady = () => {
    if (isReady || (phase !== 'arrangement' && phase !== 'arrangement_2')) return
    setIsReady(true)
    if (timerRef.current) clearInterval(timerRef.current)
    // Patch Multiplayer: arrangement_2 ส่งไป hn_arrangement_2 แทน hn_player_ready
    const eventName = phase === 'arrangement_2' ? 'hn_arrangement_2' : 'hn_player_ready'
    socketRef.current?.emit(eventName, {
      roomId: ROOM_ID, userId: PLAYER_ID,
      arrangement: {
        pile1: piles[0].map(c => c.key),
        pile2: piles[1].map(c => c.key),
        pile3: piles[2].map(c => c.key), // เต็ม 5 ใบ — Discard Phase จริงจะตัดทีหลัง
      },
    })
  }
  // Patch Discard Phase: ยืนยันเลือกทิ้งไพ่จากมือ Server (5-6 ใบ) เหลือ 3 ใบ
  const handleDiscardConfirm = () => {
    const maxDiscard = discardHandKeys.length - 3
    if (discardSelected.length !== maxDiscard) return
    if (discardTimerRef.current) clearInterval(discardTimerRef.current)
    const keepKeys = discardHandKeys.filter((_, i) => !discardSelected.includes(i))
    socketRef.current?.emit('hn_discard_submit', { roomId: ROOM_ID, userId: PLAYER_ID, keepKeys })
    // Patch 2026-07-18: ปิด modal เอง (กดยืนยันก่อนหมดเวลา) — หยุด confirmBlinkAnim ก่อนเสมอ
    confirmBlinkAnim.stopAnimation()
    setShowDiscard(false)
  }

  // Patch (บั๊กแก้) High Noble: toggle เลือกทิ้งทีละกอง
  const toggleDiscardPile = (pile: 'pile1' | 'pile2' | 'pile3', idx: number) => {
    setDiscardSelByPile(cur => {
      const list = cur[pile]
      const next = list.includes(idx) ? list.filter(i => i !== idx) : [...list, idx]
      return { ...cur, [pile]: next }
    })
  }
  const handleDiscardConfirmHighNoble = () => {
    const okP1 = discardSelByPile.pile1.length === discardNeed.pile1
    const okP2 = discardSelByPile.pile2.length === discardNeed.pile2
    const okP3 = discardSelByPile.pile3.length === discardNeed.pile3
    if (!okP1 || !okP2 || !okP3) return
    if (discardTimerRef.current) clearInterval(discardTimerRef.current)
    const keepFrom = (pile: 'pile1' | 'pile2' | 'pile3') =>
      discardPiles[pile].filter((_, i) => !discardSelByPile[pile].includes(i))
    const keepKeys = [...keepFrom('pile1'), ...keepFrom('pile2'), ...keepFrom('pile3')]
    socketRef.current?.emit('hn_discard_submit', { roomId: ROOM_ID, userId: PLAYER_ID, keepKeys })
    // Patch 2026-07-18: ปิด modal เอง (กดยืนยันก่อนหมดเวลา) — หยุด confirmBlinkAnim ก่อนเสมอ
    confirmBlinkAnim.stopAnimation()
    setShowDiscard(false)
    setIsHNDiscard(false)
  }
  const toggleDiscard = (idx: number) => {
    setDiscardSelected(prev => {
      if (prev.includes(idx)) return prev.filter(i => i !== idx)
      if (prev.length >= 2) return prev
      return [...prev, idx]
    })
  }
  // Patch Blind Auction: กดเลือกราคา — ล็อคทันที กดได้ครั้งเดียว/ใบ (1 คนเลือกได้แค่ 1 ใบ)
  const handleAuctionBid = (cardIndex: 0 | 1, level: number) => {
    if (auctionMyBid) return
    setAuctionMyBid({ cardIndex, level })
    socketRef.current?.emit('hn_auction_bid', { roomId: ROOM_ID, userId: PLAYER_ID, cardIndex, level })
  }

  // Patch 2026-07-18: หยุด win-pulse/win-opacity loop + confetti recursion ทั้งหมด ก่อน unmount/เริ่มรอบใหม่
  // เสมอ (Animated.loop และ confetti recursion ไม่มีวันจบเอง ถ้าไม่ stop จะไปชน native attach ตอน mount
  // รอบถัดไป — pattern Adept)
  const stopMatchEndAnimations = () => {
    if (winPulseLoopRef.current) winPulseLoopRef.current.stop()
    if (winOpacityLoopRef.current) winOpacityLoopRef.current.stop()
    confettiActiveRef.current = false
    confettiCompositesRef.current.forEach(a => a.stop())
    confettiCompositesRef.current = []
  }

  // ── Continue → emit player_continue รอ server (Mastermind: ไม่ fade ออก เพราะต่อ Flow ใน Round เดียวกัน)
  const handleContinue = () => {
    if (continueTimerRef.current) clearInterval(continueTimerRef.current)
    blinkAnim.stopAnimation(); blinkAnim.setValue(1)
    btnBlinkAnim.stopAnimation(); btnBlinkAnim.setValue(1)
    setShowResult(false)
    // Patch Mastermind: ไม่ fade ไพ่ออกเพราะ Flow ต่อใน Round เดิม (Fog of War → Auction → Discard → Grand Finale)
    socketRef.current?.emit('player_continue', { roomId: ROOM_ID, playerId: PLAYER_ID })
  }

  // auto continue ย้ายไปทำใน startContinueCountdown interval แทน (เลี่ยง re-render)

  // Patch Multiplayer: ไม่มี "Play Again" ในที่เดิม — ผู้เล่นอีก 2 คนอาจไม่อยากเล่นซ้ำทันที
  // ต้อง re-queue ผ่าน lobby.tsx ใหม่เสมอ (ตรงกับ pattern เดียวกับ Adept multiplayer)

  // ── Sub-components
  const CardBack: React.FC<{ w: number; h: number; ml?: number }> = ({ w, h, ml = 0 }) => (
    <View style={[s.cardBack, { width: w, height: h, borderRadius: w * 0.14, marginLeft: ml }]}>
      <Image source={cardBackImg} style={{ width: w, height: h }} resizeMode="cover" />
    </View>
  )

  // Patch Grand Finale Patch C: Helper components
  const GFHealthBar: React.FC<{ playerId: string }> = ({ playerId }) => {
    if (phase !== 'grand_finale' && phase !== 'grand_finale_done') return null
    const isMyTurn = gfTurnPlayerId === playerId
    if (!isMyTurn) {
      // ยังไม่ถึงตา → เต็มแถบสีเขียวเข้ม (ตำแหน่งคงที่ ไม่เคลื่อน)
      return (
        <View style={{ width: 60, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.5)', overflow: 'hidden', marginTop: 2 }}>
          <View style={{ width: '100%', height: '100%', backgroundColor: '#163A25' }} />
        </View>
      )
    }
    // ตา player นี้ — ใช้ Animated.View (ไม่ trigger re-render ทั้ง tree)
    const widthInterpolate = gfHealthAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0%', '100%'],
    })
    const colorInterpolate = gfHealthAnim.interpolate({
      inputRange: [0, 0.2, 0.4, 0.7, 1],
      outputRange: ['#f87171', '#f87171', '#fb923c', '#FFC857', '#4ade80'],
    })
    return (
      <View style={{ width: 60, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.5)', overflow: 'hidden', marginTop: 2 }}>
        <Animated.View style={{ width: widthInterpolate, height: '100%', backgroundColor: colorInterpolate }} />
      </View>
    )
  }
  const GFStatusBadge: React.FC<{ playerId: string }> = ({ playerId }) => {
    if (phase !== 'grand_finale' && phase !== 'grand_finale_done') return null
    const isFoul = gfFoulPlayers.includes(playerId)
    const isFolded = gfFoldedPlayers.includes(playerId)
    if (!isFoul && !isFolded) return null
    const label = isFoul ? 'FOULED' : 'FOLDED'
    const color = isFoul ? '#f87171' : 'rgba(180,180,180,0.7)'
    return (
      <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: `${color}33`, borderWidth: 1, borderColor: color, marginTop: 2 }}>
        <Text style={{ fontSize: 7, color, fontWeight: '800', letterSpacing: 1 }}>{label}</Text>
      </View>
    )
  }
  // ไพ่หงายของผู้เล่นแต่ละคนใน Grand Finale (Round 1 = 1 ใบ, Round 2 จบ = 3 ใบ)
  const GFCardsForPlayer: React.FC<{ playerId: string; size?: 'normal' | 'small' }> = ({ playerId, size = 'normal' }) => {
    if (phase !== 'grand_finale' && phase !== 'grand_finale_done') return null
    const w = size === 'normal' ? 50 : 25 // ขนาดเท่าหลังไพ่ในแถวเดียวกัน
    const h = size === 'normal' ? 72 : 36
    const revealedList = gfRevealedCards[playerId] ?? []   // ใบที่หงายแล้ว (รอบ 1 + รอบ 2)
    const finalRev = gfFinalReveals[playerId] ?? [] // Round 2 จบ — 3 ใบครบ
    const cardsToShow = finalRev.length > 0 ? finalRev : revealedList
    if (cardsToShow.length === 0) return null
    return (
      <View style={{ flexDirection: 'row', marginTop: 4, justifyContent: 'center' }}>
        {cardsToShow.map((k, i) => (
          <View key={i} style={{
            width: w, height: h, borderRadius: 3, overflow: 'hidden',
            borderWidth: 1, borderColor: '#FFD76A',
            marginLeft: i > 0 ? -10 : 0,
          }}>
            {CARD_IMG[k] && <Image source={CARD_IMG[k]} style={{ width: w, height: h }} resizeMode="cover" />}
          </View>
        ))}
      </View>
    )
  }
  const AvatarBubble: React.FC<{ emoji: string; size?: number; glow?: boolean; image?: any }> = ({ emoji, size = 36, glow = false, image }) => (
    <View style={[
      s.avatarBubble,
      { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' },
      glow && {
        borderWidth: 2.5, borderColor: '#FFD76A',
        shadowColor: '#FFD76A', shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
        elevation: 10,
      },
    ]}>
      {image
        ? <Image source={image} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />
        : <Text style={{ fontSize: size * 0.45 }}>{emoji}</Text>
      }
    </View>
  )

  const renderCard = (key: string | undefined, w: number, h: number, ml: number = 0, elKey?: string) => {
    if (key && CARD_IMG[key]) {
      return (
        <View key={elKey} style={{ width: w, height: h, borderRadius: w * 0.14, marginLeft: ml, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(201,168,76,.5)' }}>
          <Image source={CARD_IMG[key]} style={{ width: w, height: h }} resizeMode="cover" />
        </View>
      )
    }
    return <CardBack key={elKey} w={w} h={h} ml={ml} />
  }

  const zonePileSizes = (playerId: string): [number, number, number] => {
    const count = cardZones.handCounts[playerId] ?? 0
    if (cardZones.resolvedPileCounts.pile2 > 0) return [0, 0, count]
    if (cardZones.resolvedPileCounts.pile1 > 0) return [0, Math.min(3, count), Math.max(0, count - 3)]
    return [Math.min(3, count), Math.min(3, Math.max(0, count - 3)), Math.max(0, count - 6)]
  }

  const AIPiles: React.FC<{ aiId: string }> = ({ aiId }) => {
    // Patch: ตอน Fog of War ซ่อนไพ่ Pile1+2 ที่เคยเฉลยไว้ (กลับเป็นหลังไพ่)
    const fog = phase === 'fog_of_war'
    const p1 = fog ? [] : (allCards[aiId]?.[1] ?? []); const p2 = fog ? [] : (allCards[aiId]?.[2] ?? []); const p3 = allCards[aiId]?.[3] ?? []
    const cards = [...p1, ...p2, ...p3]
    // Patch Grand Finale: ตอน gf ใช้ 3 ใบ (เริ่มต้น) หรือ 2 ใบ (ถ้า Call หงายไปแล้ว 1)
    const gf = phase === 'grand_finale' || phase === 'grand_finale_done'
    const gfRevealed = gf ? (gfRevealedCards[aiId]?.length ?? 0) : 0
    const layout: number[] = gf ? [Math.max(0, (cardZones.handCounts[aiId] ?? 3) - gfRevealed)] : zonePileSizes(aiId)
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {layout.map((cnt, pi) => (
          <React.Fragment key={pi}>
            {pi > 0 && <View style={{ width: 4 }} />}
            <View style={{ flexDirection: 'row' }}>
              {Array.from({ length: cnt }).map((_, ci) => {
                const idx = fog ? ci : (gf ? 6 + ci + gfRevealed : (pi === 0 ? ci : pi === 1 ? 3 + ci : 6 + ci))
                const cardKey = cards[idx]
                const elKey = `${aiId}-${pi}-${ci}-${cardKey ?? 'back'}`
                return (fog || gf)
                  ? renderCard(cardKey, 50, 72, ci === 0 ? 0 : -34, elKey)   // Fog of War / Grand Finale: ขนาดจริง
                  : renderCard(cardKey, 25, 36, ci === 0 ? 0 : -18, elKey)   // Arrangement: ขนาดเล็กเดิม
              })}
            </View>
          </React.Fragment>
        ))}
      </View>
    )
  }

  const SideSeat: React.FC<{ rot: '270deg' | '90deg'; aiId: string }> = ({ rot, aiId }) => {
    // Patch: ตอน Fog of War ซ่อนไพ่ Pile1+2 ที่เคยเฉลยไว้ (กลับเป็นหลังไพ่)
    const fog = phase === 'fog_of_war'
    const p1 = fog ? [] : (allCards[aiId]?.[1] ?? []); const p2 = fog ? [] : (allCards[aiId]?.[2] ?? []); const p3 = allCards[aiId]?.[3] ?? []
    const cards = [...p1, ...p2, ...p3]
    // Patch Grand Finale: ตอน gf ใช้ 3 ใบ หรือ 2 ใบ (ถ้า Call หงายไปแล้ว 1)
    const gf = phase === 'grand_finale' || phase === 'grand_finale_done'
    const gfRevealed = gf ? (gfRevealedCards[aiId]?.length ?? 0) : 0
    const layout: number[] = gf ? [Math.max(0, (cardZones.handCounts[aiId] ?? 3) - gfRevealed)] : zonePileSizes(aiId)
    return (
      <View style={s.sideSeatWrap}>
        <View style={[s.sideSeatInner, { transform: [{ rotate: rot }] }]}>
          {layout.map((cnt, pi) => (
            <React.Fragment key={pi}>
              {pi > 0 && <View style={{ width: 4 }} />}
              <View style={{ flexDirection: 'row' }}>
                {Array.from({ length: cnt }).map((_, ci) => {
                  const idx = fog ? ci : (pi === 0 ? ci : pi === 1 ? 3 + ci : 6 + ci)
                  const cardKey = cards[idx]
                  const elKey = `${aiId}-${pi}-${ci}-${cardKey ?? 'back'}`
                  return fog
                    ? renderCard(cardKey, 50, 72, ci === 0 ? 0 : -34, elKey)   // Fog of War: ขนาดจริง (เหลือ 5 ใบ)
                    : renderCard(cardKey, 25, 36, ci === 0 ? 0 : -18, elKey)   // Arrangement: ขนาดเล็กเดิม
                })}
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>
    )
  }

  // เงาไพ่กองกลาง — แยกจากไพ่ในมือผู้เล่น (Scope A)
  const pileShadowStyle = {
    shadowColor: '#000',
    shadowOffset: { width: 3, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 8,                // Android
    borderRadius: 4,             // ให้เงาโค้งตามมุมไพ่เดิม (คงค่า 4 ตาม commCard)
    backgroundColor: '#fdfaf3',  // จำเป็นสำหรับ elevation บน Android (คงสีเดิม)
  }

  const CommRow: React.FC<{ pileNum: number; k1: string; k2: string }> = ({ pileNum, k1, k2 }) => {
    const winner    = pileWinners[pileNum]
    const isWin     = winner === PLAYER_ID
    const winAI     = aiList.find(a => a.id === winner)
    // ไพ่ผู้ชนะ Pile นี้
    const rawWinner = winner ? (allCards[winner]?.[pileNum] ?? []) : []
    const winCards  = pileNum === 3 ? rawWinner.slice(0, 3) : rawWinner
    const pileAlreadyMoved = pileNum === 1 ? cardZones.resolvedPileCounts.pile1 > 0
      : pileNum === 2 ? cardZones.resolvedPileCounts.pile2 > 0 : cardZones.resolvedPileCounts.pile3 > 0
    const hasWinner = winner && winCards.length > 0 && phase !== 'fog_of_war' && !pileAlreadyMoved

    return (
      <View style={{ alignItems: 'flex-start', gap: 2 }}>
        {/* Label + Winner badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={s.pileLabel}>PILE {pileNum}</Text>
          {hasWinner && (
            <View style={[s.winBadge, { backgroundColor: isWin ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)' }]}>
              <Text style={[s.winBadgeTxt, { color: isWin ? '#4ade80' : '#f87171' }]}>
                {isWin ? '🏆 YOU' : `${winAI?.emoji ?? '🤖'} ${winAI?.name ?? winner}`}
              </Text>
            </View>
          )}
        </View>
        {/* Community + ไพ่ผู้ชนะ */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {/* Community cards */}
          {/* two-layer wrapper: View ชั้นนอกถือเงา (ห้ามมี overflow:hidden กันเงาโดนตัดบน iOS) / View ชั้นในคง s.commCard เดิมทุกประการ */}
          {k1 && CARD_IMG[k1] && <View style={pileShadowStyle}><View style={s.commCard}><Image source={CARD_IMG[k1]} style={{ width: 50, height: 72 }} resizeMode="cover" /></View></View>}
          {/* Patch 2026-07-18: ไพ่กองกลางใบ 2 ซ้อนทับใบแรก 1/3 — แยก visual จากไพ่ในมือ + ประหยัดพื้นที่โต๊ะ */}
          {k2 && CARD_IMG[k2] && <View style={[pileShadowStyle, { marginLeft: -17 }]}><View style={s.commCard}><Image source={CARD_IMG[k2]} style={{ width: 50, height: 72 }} resizeMode="cover" /></View></View>}
          {/* Divider */}
          {hasWinner && <View style={{ width: 1, height: 72, backgroundColor: 'rgba(201,168,76,0.3)', marginHorizontal: 2 }} />}
          {/* Winner cards */}
          {/* Patch 2026-07-18: ไพ่ผู้ชนะซ้อน 1/3 เท่ากองกลาง — แถว showdown ไม่ยาวล้น */}
          {hasWinner && winCards.map((k, i) => (
            <View key={i} style={[s.commCard, {
              borderColor: isWin ? '#4ade80' : '#f87171',
              borderWidth: 1.5,
              marginLeft: i > 0 ? -17 : 0,
            }]}>
              {CARD_IMG[k]
                ? <Image source={CARD_IMG[k]} style={{ width: 50, height: 72 }} resizeMode="cover" />
                : <Image source={cardBackImg} style={{ width: 50, height: 72 }} resizeMode="cover" />}
            </View>
          ))}
        </View>
      </View>
    )
  }

  // (FaceCard เดิมถูกแทนที่ด้วย PlayerHandView กลางแล้ว — ดู src/components/game/PlayerHandView.tsx)

  // Showdown Result — ปิดด้วยปุ่มกากบาทหรือ auto-continue เท่านั้น
  // eslint-disable-next-line react/display-name
  const ShowdownResult = React.memo(() => {
    const activeTab = activeShowdownTab
    const setActiveTab = setActiveShowdownTab
    // ดึง player list จาก allCards keys เพื่อให้ครบทุกคนเสมอ
    const allPlayerIds = [PLAYER_ID, ...Object.keys(allCards).filter(id => id !== PLAYER_ID)]
    const aiData = aiListRef.current.length > 0 ? aiListRef.current : aiList
    const players = allPlayerIds.map(id => {
      if (id === PLAYER_ID) return { id, label: myDisplayName, emoji: myAvatarEmoji }
      const ai = aiData.find(a => a.id === id)
      return { id, label: ai?.name ?? id, emoji: ai?.emoji ?? '🤖' }
    })
    const commMap: Record<number, string[]> = { 1: comm.p1, 2: comm.p2, 3: comm.p3 }
    const CARD_W = 50; const CARD_H = 72

    // คำนวณ token breakdown
    const raw        = tokenDeltas[PLAYER_ID] ?? 0
    const isWin      = raw > 0
    const isTriple   = pileWinners[1] === PLAYER_ID && pileWinners[2] === PLAYER_ID && pileWinners[3] === PLAYER_ID
    // Patch (2026-07-17): ยกเลิก Rake 10% ของ Triple Sweep — ใช้ Rake 5% อัตราเดียวทุกกรณีแล้ว
    const rakeRate   = 0.05
    const rake       = isWin ? Math.round(raw * rakeRate) : 0
    const netToken   = isWin ? raw - rake : raw
    const potWin     = isTriple ? Math.round(raw / 2) : raw  // ประมาณ
    const bonusTriple = isTriple ? Math.round(raw / 2) : 0

    return (
      <View style={{ flex: 1, width: '100%', ...glassPanelDense, padding: 12 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
          <Text style={{ fontSize: 18, color: '#FFD76A', fontWeight: '900', letterSpacing: 2, flex: 1 }}>SHOWDOWN</Text>
          <TouchableOpacity onPress={handleContinue}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,107,107,0.2)', borderWidth: 1.5, borderColor: '#FF6B6B', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, color: '#FF6B6B', fontWeight: '900' }}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Pile Tabs */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
          {([1,2,3] as const).map(n => {
            const isMyWin = pileWinners[n] === PLAYER_ID
            return (
              <TouchableOpacity key={n} onPress={() => { autoCycleStoppedRef.current = true; setActiveTab(n) }}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, alignItems: 'center',
                  borderColor: activeTab === n ? '#FFD76A' : '#2A4A34',
                  backgroundColor: activeTab === n ? 'rgba(255,215,106,0.15)' : 'rgba(0,0,0,0.3)' }}>
                <Text style={{ fontSize: 13, color: activeTab === n ? '#FFD76A' : '#a89060', fontWeight: '800' }}>PILE {n}</Text>
                {isMyWin && <Text style={{ fontSize: 9, color: '#8DFFB5', fontWeight: '900' }}>🏆 YOU</Text>}
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Tab Content */}
        <ScrollView style={{ flex: 1, maxHeight: 680 }} showsVerticalScrollIndicator={false}>
          {/* FOUL badge */}
          {hasFoul[PLAYER_ID] && (
            <View style={{ backgroundColor: 'rgba(255,107,107,0.15)', borderWidth: 1.5, borderColor: '#FF6B6B', borderRadius: 8, padding: 6, marginBottom: 8, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, color: '#FF6B6B', fontWeight: '900', letterSpacing: 3 }}>⚠️ FOUL</Text>
              {foulReasons[PLAYER_ID] && <Text style={{ fontSize: 13, color: '#FFB74D', marginTop: 2 }}>{foulReasons[PLAYER_ID]}</Text>}
            </View>
          )}
          {/* Hand Rank */}
          {handRanks[activeTab] && (
            <Text style={{ fontSize: 16, color: '#8DFFB5', fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
              {handRanks[activeTab]}
            </Text>
          )}

          {/* Community + Token ด้านขวา */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: '#38bdf8', fontWeight: '800', letterSpacing: 2, marginBottom: 6 }}>COMMUNITY</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(commMap[activeTab] ?? []).map((k, i) => (
                  <View key={i} style={{ width: CARD_W, height: CARD_H, borderRadius: 4, overflow: 'hidden', borderWidth: 2, borderColor: '#38bdf8' }}>
                    {CARD_IMG[k] ? <Image source={CARD_IMG[k]} style={{ width: CARD_W, height: CARD_H }} resizeMode="cover" /> : <Image source={cardBackImg} style={{ width: CARD_W, height: CARD_H }} resizeMode="cover" />}
                  </View>
                ))}
              </View>
            </View>
            {/* Token ของ Pile นี้ */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#2A4A34', backgroundColor: 'rgba(0,0,0,0.3)' }}>
              {(() => {
                const raw   = tokenDeltas[PLAYER_ID] ?? 0
                const isWin = raw > 0
                const isTriple = pileWinners[1] === PLAYER_ID && pileWinners[2] === PLAYER_ID && pileWinners[3] === PLAYER_ID
                // Patch (2026-07-17): ยกเลิก Rake 10% ของ Triple Sweep — ใช้ Rake 5% อัตราเดียวทุกกรณีแล้ว
                const rakeRate = 0.05
                const rake  = isWin ? Math.round(raw * rakeRate) : 0
                const net   = isWin ? raw - rake : raw
                return (
                  <>
                    {[1,2].map(n => { // Patch Mastermind: ตัด Pile 3 ออก — ยังไม่ resolve ในจุดนี้
                      const w = pileWinners[n] === PLAYER_ID
                      return (
                        <View key={n} style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 2 }}>
                          <Text style={{ fontSize: 12, color: activeTab === n ? '#FFD76A' : '#a89060' }}>Pile {n}</Text>
                          <Text style={{ fontSize: 13, color: w ? '#8DFFB5' : '#FF6B6B', fontWeight: '700' }}>
                            {w ? '+' : '-'}{w ? '✓' : '✗'}
                          </Text>
                        </View>
                      )
                    })}
                    <View style={{ height: 1, backgroundColor: '#2A4A34', width: '100%', marginVertical: 4 }} />
                    {isTriple && (
                      <Text style={{ fontSize: 11, color: '#FFC857', fontWeight: '700', textAlign: 'center' }}>⚡ Triple!</Text>
                    )}
                    {raw > 0 && <Text style={{ fontSize: 11, color: '#FFB74D' }}>Rake -{Math.round(rakeRate * 100)}%</Text>}
                    <AnimatedTokenNumber value={net} style={{ fontSize: 16, color: net > 0 ? '#8DFFB5' : '#FF6B6B', fontWeight: '900', marginTop: 2 }} />
                    <Text style={{ fontSize: 10, color: '#a89060' }}>tokens</Text>
                  </>
                )
              })()}
            </View>
          </View>

          {/* Players */}
          <View style={{ gap: 3 }}>
            {players.map(p => {
              const revealed  = allCards[p.id]?.[activeTab]
              const cardKeys  = revealed ? (activeTab === 3 ? revealed.slice(0,3) : revealed) : []
              const isWinner  = pileWinners[activeTab] === p.id
              const isUser    = p.id === PLAYER_ID
              return (
                <View key={p.id} style={{
                  flexDirection: 'row', alignItems: 'center', padding: 5, borderRadius: 8,
                  borderWidth: isWinner ? 1.5 : 1,
                  borderColor: isWinner ? '#8DFFB5' : '#2A4A34',
                  backgroundColor: isWinner ? 'rgba(141,255,181,0.08)' : 'rgba(0,0,0,0.3)',
                }}>
                  {/* Patch 3.5 Step 7: ตัด Avatar emoji ออก เหลือชื่อ+ตัวเลข — คงความกว้างคอลัมน์ 76px
                      ไว้เท่าเดิม เพื่อไม่ให้แถวไพ่หงาย (marginLeft: 25 ด้านล่าง) เลื่อนหนี — ห้ามแก้ไฟล์เดียว */}
                  <View style={{ width: 76, alignItems: 'center', marginRight: 8 }}>
                    <Text style={{ fontSize: 9, color: isUser ? '#FFD76A' : '#F5F2E8', fontWeight: '800' }} numberOfLines={1}>
                      {isUser ? myDisplayName : p.label}
                    </Text>
                    {isWinner && <Text style={{ fontSize: 9, color: '#8DFFB5', fontWeight: '900' }}>🏆 WIN</Text>}
                  </View>
                  {/* ตำแหน่งแถวไพ่หงายใน Showdown — unify เท่ากันทุก Tier ห้ามแก้ไฟล์เดียว */}
                  <View style={{ flexDirection: 'row', gap: 4, marginLeft: 25 }}>
                    {cardKeys.length > 0 ? cardKeys.map((k, i) => (
                      <View key={i} style={{ width: CARD_W, height: CARD_H, borderRadius: 4, overflow: 'hidden', borderWidth: 1.5, borderColor: isWinner ? '#8DFFB5' : '#2A4A34' }}>
                        {CARD_IMG[k] ? <Image source={CARD_IMG[k]} style={{ width: CARD_W, height: CARD_H }} resizeMode="cover" /> : <Image source={cardBackImg} style={{ width: CARD_W, height: CARD_H }} resizeMode="cover" />}
                      </View>
                    )) : Array.from({ length: 3 }).map((_, i) => (
                      <View key={i} style={{ width: CARD_W, height: CARD_H, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: '#2A4A34' }}>
                        <Image source={cardBackImg} style={{ width: CARD_W, height: CARD_H }} resizeMode="cover" />
                      </View>
                    ))}
                  </View>
                </View>
              )
            })}
          </View>

          <View style={{ height: 8 }} />
        </ScrollView>

      </View>
    )
  })

  const bossAI = aiList[0]; const p2AI = aiList[1]; const p4AI = aiList[2]
  const resolveSeatAvatar = (seat: AIInfo | undefined, fallback: string, fallbackImage?: any) => {
    const preset = seat?.avatarUrl ? PRESET_AVATARS.find(p => p.key === seat.avatarUrl) : undefined
    if (preset) return { emoji: preset.emoji ?? (preset.image ? '' : seat!.avatarUrl!), image: preset.image }
    return { emoji: seat?.emoji ?? fallback, image: fallbackImage }
  }
  const bossAvatar = resolveSeatAvatar(bossAI, '🤖', bossAI?.name ? BOSS_AVATAR[bossAI.name] : undefined)
  const p2Avatar = resolveSeatAvatar(p2AI, '👤', p2AI?.name ? MINION_AVATAR[p2AI.name] : undefined)
  const p4Avatar = resolveSeatAvatar(p4AI, '👤', p4AI?.name ? MINION_AVATAR[p4AI.name] : undefined)
  const userRevealed = allCards[PLAYER_ID]
  const isRevealed   = userRevealed && Object.keys(userRevealed).length > 0

  // =================================================================
  // RENDER
  // =================================================================
  return (
    <View style={[s.root, isWeb && s.webOuter]}>
      <CharacterBarkBubble bark={bark} />
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <View style={[s.gameContainer, isWeb && s.webFrame]}>
        <View style={s.gameArea}>

          <PreGameCountdown visible={showPreGameCountdown} onComplete={() => setShowPreGameCountdown(false)} />
          <MonarchConquestBanner winnerName={monarchWinner} onHidden={() => setMonarchWinner(null)} />

          {/* ── Full Reconnect System Step 2C — connection overlay, sibling ลอยทับทุก phase (ไม่ผูก
              เงื่อนไข phase ใดๆ) ตำแหน่งเดียวกับ pattern ของ adept/index.tsx:1332-1348 ── */}
          {connectionError && (
            <View style={{ position: 'absolute', top: 12, alignSelf: 'center', zIndex: 999, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: 'rgba(255,107,107,0.15)', borderWidth: 1, borderColor: 'rgba(255,107,107,0.4)', borderRadius: 10 }}>
              <Text style={{ color: '#FF6B6B', fontSize: 11, textAlign: 'center' }}>Connection failed. Please check your network and try again.</Text>
            </View>
          )}
          {isReconnecting && (
            <View style={{ position: 'absolute', top: 12, alignSelf: 'center', zIndex: 999, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: 'rgba(255,199,87,0.15)', borderWidth: 1, borderColor: 'rgba(255,199,87,0.5)', borderRadius: 10 }}>
              <Text style={{ color: '#FFC857', fontSize: 12, fontWeight: '700', textAlign: 'center' }}>Reconnecting...</Text>
            </View>
          )}
          {afkNotice && (
            <View style={{ position: 'absolute', top: 12, alignSelf: 'center', zIndex: 999, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: 'rgba(15,36,24,0.85)', borderWidth: 1, borderColor: 'rgba(255,215,106,0.5)', borderRadius: 10 }}>
              <Text style={{ color: '#F5F2E8', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{afkNotice}</Text>
            </View>
          )}

          <View style={StyleSheet.absoluteFill as any} pointerEvents="none"><Image source={selectedTableImg} style={{ width: '100%', height: '100%' }} resizeMode="cover" /></View>
          <View style={[StyleSheet.absoluteFill as any, s.logoWatermark]} pointerEvents="none">
            <Image source={tripleSpade} style={{ width: 120, height: 120, opacity: 0.07 }} resizeMode="contain" />
          </View>

          {phase !== 'dealing' && <View style={StyleSheet.absoluteFill as any} pointerEvents="none">
            <View style={{ position: 'absolute', top: 68, right: 12, alignItems: 'center', zIndex: 18 }}>
              <Text style={{ color: '#D6B65E', fontSize: 9 }}>STOCK · {cardZones.stockCount}</Text>
              {Array.from({ length: cardZones.stockCount }).map((_, i) => <Image key={i} source={cardBackImg} style={{ position: 'absolute', top: 12 + i * 2, width: 30, height: 42 }} />)}
            </View>
            {/* มติลุงเยาะ 2026-08-13 (แก้เพิ่มหลังเห็นภาพจริง — เดิมย้ายแค่กอง 3 ตามที่เลือกไว้ก่อนหน้า แต่
                Pile1/2 ยังลอยเป็น 2 คอลัมน์กลางจอทั้งหงาย+คว่ำ): ตอน Grand Finale ย้ายไพ่ที่เล่นไปแล้วทั้ง
                3 กอง (ไม่ใช่แค่กอง 3) ไปรวมกับ DISCARD มุมล่างขวาแทน คว่ำล้วนทุกใบ ไม่มีคอลัมน์กลางจอเหลือเลย */}
            {(() => {
              const inGf = phase === 'grand_finale' || phase === 'grand_finale_done'
              const { pile1, pile2, pile3 } = cardZones.resolvedPileCounts
              const discardCount = cardZones.discardCount + (inGf ? pile1 + pile2 + pile3 : 0)
              return (
                <View style={{ position: 'absolute', bottom: 116, right: 12, alignItems: 'center', zIndex: 18 }}>
                  <Text style={{ color: '#D6B65E', fontSize: 9 }}>DISCARD · {discardCount}</Text>
                  {Array.from({ length: discardCount }).map((_, i) => <Image key={i} source={cardBackImg} style={{ position: 'absolute', top: 12 + i * 2, width: 30, height: 42 }} />)}
                </View>
              )
            })()}
            <View style={{ position: 'absolute', left: '35%', right: '35%', top: '34%', flexDirection: 'row', justifyContent: 'space-between', zIndex: 17 }}>
              {(phase === 'grand_finale' || phase === 'grand_finale_done') ? null : ([cardZones.resolvedPileCounts.pile1, cardZones.resolvedPileCounts.pile2, cardZones.resolvedPileCounts.pile3] as number[]).map((count, pileIdx) => {
                const revealed = allCards[pileWinners[pileIdx + 1]]?.[pileIdx + 1] ?? []
                return <View key={pileIdx} style={{ alignItems: 'center' }}>
                  <Text style={{ color: '#D6B65E', fontSize: 8 }}>PLAYED {pileIdx + 1} · {count}</Text>
                  {Array.from({ length: count }).map((_, i) => {
                    const faceKey = i >= count - revealed.length ? revealed[i - (count - revealed.length)] : undefined
                    return <Image key={i} source={faceKey && CARD_IMG[faceKey] ? CARD_IMG[faceKey] : cardBackImg} style={{ position: 'absolute', top: 12 + i * 10, width: 28, height: 40 }} />
                  })}
                </View>
              })}
            </View>
            <Text style={{ position: 'absolute', top: 48, right: 10, color: 'rgba(245,242,232,.65)', fontSize: 8 }}>CARD ZONES · {cardZones.totalCards}/52</Text>
          </View>}

          {/* ── DEAL ANIMATION ── */}
          {/* Patch: opacity-toggle แทน conditional-mount (pattern Adept) — View คง mount ตลอด กัน node attach ซ้ำ */}
            <View style={[StyleSheet.absoluteFill as any, { alignItems: 'center', justifyContent: 'center', zIndex: 50, opacity: phase === 'dealing' ? 1 : 0 }]} pointerEvents="none">
              {dealAnims.map((a, i) => (
                <Animated.View key={i} style={{
                  position: 'absolute',
                  width: 25, height: 36, borderRadius: 6,
                  backgroundColor: '#091808',
                  borderWidth: 1, borderColor: 'rgba(201,168,76,.5)',
                  overflow: 'hidden',
                  opacity: a.opacity,
                  transform: [{ translateX: a.x }, { translateY: a.y }, { scale: a.scale }, { rotate: '90deg' }], // Patch Mastermind: หมุน 90deg ให้สอดรับกับไพ่ที่ซ้อนกัน (270deg)
                }}>
                  <Image source={cardBackImg} style={{ width: 25, height: 36 }} resizeMode="cover" />
                </Animated.View>
              ))}
              {Array.from({ length: 8 }).map((_, i) => (
                <View key={`reserve-${i}`} style={{
                  position: 'absolute', width: 25, height: 36, borderRadius: 6, overflow: 'hidden',
                  left: i < 6 ? `${43 + (i % 2) * 5}%` : `${54 + (i - 6) * 5}%`,
                  top: i < 6 ? `${43 + Math.floor(i / 2) * 5}%` : '50%',
                  borderWidth: 1, borderColor: 'rgba(201,168,76,.5)', backgroundColor: '#091808',
                }}>
                  <Image source={cardBackImg} style={{ width: 25, height: 36 }} resizeMode="cover" />
                </View>
              ))}
              <Text style={{ color: 'rgba(201,168,76,0.4)', fontSize: 10, letterSpacing: 2, marginTop: 80 }}>DEALING...</Text>
              {/* Boss AI — แสดงจำนวนไพ่ที่ได้รับ */}
              {false && [0,1,2,3].map(playerIdx => {
                const count = Math.floor(dealCount / 4) + (dealCount % 4 > playerIdx ? 1 : 0)
                const positions = [
                  { x: 145, y: 80 },   // Boss
                  { x: 300, y: 300 },  // P4
                  { x: 145, y: 520 },  // User
                  { x: -10, y: 300 },  // P2
                ]
                const pos = positions[playerIdx]
                return Array.from({ length: Math.min(count, 11) }).map((_, ci) => (
                  <View key={`p${playerIdx}c${ci}`} style={{
                    position: 'absolute', left: pos.x - 12 + ci * 4, top: pos.y - 18 + ci * 3,
                    width: 25, height: 36, borderRadius: 6, overflow: 'hidden',
                    borderWidth: 1, borderColor: 'rgba(201,168,76,.5)', backgroundColor: '#091808',
                    transform: [{ rotate: '270deg' }], // Patch Mastermind: มุมซ้อนไพ่ตอนแจก ต่างจาก Tier ก่อนหน้า
                  }}>
                    <Image source={cardBackImg} style={{ width: 25, height: 36 }} resizeMode="cover" />
                  </View>
                ))
              })}
            </View>

          {/* ── COIN FLYING VFX (มติลุงเยาะ 2026-07-26) ── */}
          <View style={[StyleSheet.absoluteFill as any, { alignItems: 'center', justifyContent: 'center', zIndex: 55 }]} pointerEvents="none">
            <FlyingCoins ref={flyingCoinsRef} />
          </View>

          {/* ── BLIND AUCTION OVERLAY ── */}
          {(phase === 'blind_auction' || phase === 'auction_done') && (
            <View style={s.overlay}>
              <Text style={s.discardTitle}>🔮 BLIND AUCTION</Text>
              {phase === 'blind_auction' && (
                <Text style={[s.discardSub, { color: auctionTimeLeft <= 2 ? '#f87171' : '#FFD76A' }]}>
                  Choose a price within {auctionTimeLeft}s
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: 28, marginTop: 16 }}>
                {([0, 1] as const).map(ci => {
                  const result = auctionResult?.find((r: any) => r.cardIndex === ci)
                  const isWinner = result?.winnerId === PLAYER_ID
                  const winAI = aiList.find(a => a.id === result?.winnerId)
                  const glowColor = auctionGlowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['rgba(168,85,247,0.25)', 'rgba(168,85,247,1)'],
                  })
                  return (
                    <View key={ci} style={{ alignItems: 'center' }}>
                      <Animated.View style={{
                        width: 60, height: 86, borderRadius: 6, overflow: 'hidden',
                        borderWidth: 2.5,
                        borderColor: phase === 'blind_auction' ? glowColor : (result?.winnerId ? '#FFD76A' : 'rgba(160,80,220,.4)'),
                        backgroundColor: '#091808',
                        shadowColor: '#a855f7', shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: phase === 'blind_auction' ? 0.8 : 0, shadowRadius: 10, elevation: 8,
                      }}>
                        <Image source={cardBackImg} style={{ width: 60, height: 86 }} resizeMode="cover" />
                      </Animated.View>

                      {phase === 'blind_auction' && (
                        <View style={{ marginTop: 10, gap: 6 }}>
                          {auctionBidLevels.map((lvl, li) => {
                            const isMyChoice = auctionMyBid?.cardIndex === ci && auctionMyBid?.level === li
                            const disabled = !!auctionMyBid
                            return (
                              <TouchableOpacity
                                key={li}
                                disabled={disabled}
                                onPress={() => handleAuctionBid(ci, li)}
                                style={{
                                  width: 70, paddingVertical: 6, borderRadius: 6, alignItems: 'center',
                                  borderWidth: 1.5,
                                  borderColor: isMyChoice ? '#FFD76A' : 'rgba(168,85,247,0.5)',
                                  backgroundColor: isMyChoice ? 'rgba(255,215,106,0.15)' : 'rgba(168,85,247,0.08)',
                                  opacity: disabled && !isMyChoice ? 0.3 : 1,
                                }}
                              >
                                <Text style={{ fontSize: 12, fontWeight: '800', color: isMyChoice ? '#FFD76A' : '#c084fc' }}>
                                  🪙 {lvl}
                                </Text>
                              </TouchableOpacity>
                            )
                          })}
                        </View>
                      )}

                      {phase === 'auction_done' && (
                        <View style={{ marginTop: 10, alignItems: 'center' }}>
                          {result?.winnerId ? (
                            <>
                              <Text style={{ fontSize: 11, color: isWinner ? '#8DFFB5' : '#FF6B6B', fontWeight: '700' }}>
                                {isWinner ? '🏆 You win!' : `${winAI?.emoji ?? '🤖'} ${winAI?.name ?? 'AI'} wins`}
                              </Text>
                              {/* Full Reconnect System Step 2C (D1) — amount ไม่มีใน game_state_snapshot
                                  (server ไม่เก็บ level/amount ไว้หลัง resolve) ซ่อนบรรทัดนี้แทนโชว์ "-null tokens" */}
                              {result.amount != null && (
                                <Text style={{ fontSize: 10, color: '#a89060' }}>-{result.amount} tokens</Text>
                              )}
                            </>
                          ) : (
                            <Text style={{ fontSize: 11, color: '#a89060' }}>No one bid</Text>
                          )}
                        </View>
                      )}
                    </View>
                  )
                })}
              </View>
            </View>
          )}
          {/* ── GRAND FINALE BIG TEXT (ใต้ Pile 3 Community) ── */}
          {phase === 'grand_finale' && gfTurnPlayerId && (
            <View style={{ position: 'absolute', top: '60%', left: 0, right: 0, alignItems: 'center', zIndex: 55 }} pointerEvents="none">
              <Animated.View style={{ opacity: gfBlinkAnim, alignItems: 'center' }}>
                <Text style={{
                  fontSize: 10, color: '#FFC857', letterSpacing: 2, fontWeight: '700', marginBottom: 2,
                }}>
                  Round {gfRoundNumber} — {gfTimeLeft}s
                </Text>
                <Text style={{
                  fontSize: 22, fontWeight: '900', letterSpacing: 4,
                  color: gfTurnPlayerId === PLAYER_ID ? '#8DFFB5' : '#FFD76A',
                  textShadowColor: gfTurnPlayerId === PLAYER_ID ? 'rgba(141,255,181,0.6)' : 'rgba(255,215,106,0.6)',
                  textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 },
                }}>
                  {gfTurnPlayerId === PLAYER_ID
                    ? 'YOUR TURN'
                    : `${aiList.find(a => a.id === gfTurnPlayerId)?.name ?? 'AI'}`.toUpperCase()}
                </Text>
                <Text style={{
                  fontSize: 14, color: '#FFD76A', letterSpacing: 2, marginTop: 4, fontWeight: '700',
                }}>
                  🪙 Pile 3 Pot: {gfPile3Pot}
                </Text>
              </Animated.View>
            </View>
          )}
          {/* ── GRAND FINALE: 2-STAGE POPUP ── */}
          {phase === 'grand_finale_done' && gfFinalResult && (() => {
            const rankLabels: Record<string, string> = {
              royal_flush: 'Royal Flush 👑', straight_flush: 'Straight Flush ⚡',
              four_of_a_kind: 'Four of a Kind 💎', full_house: 'Full House 🏠',
              flush: 'Flush ♠', straight: 'Straight ➡', three_of_a_kind: 'Three of a Kind 🎯',
              two_pair: 'Two Pair 🎴', one_pair: 'One Pair 🎴', high_card: 'High Card 🃏',
            }
            const winnerName = (pid: string | null) => {
              if (!pid) return '—'
              if (pid === PLAYER_ID) return 'YOU'
              return aiList.find(a => a.id === pid)?.name ?? 'AI'
            }
            const deltaForMe = gfFinalResult.tokenDeltas?.[PLAYER_ID] ?? 0
            // STAGE 1: Grand Finale Result (5 วินาที)
            if (gfResultStage === 1) {
              return (
                <View style={[StyleSheet.absoluteFill as any, { alignItems: 'center', justifyContent: 'center', zIndex: 60, backgroundColor: 'rgba(0,0,0,0.55)' }]} pointerEvents="none">
                  <View style={{ backgroundColor: 'rgba(15,36,24,0.97)', padding: 24, borderRadius: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#FFD76A', minWidth: 280, transform: [{ translateY: 100 }] }}>
                    {gfFinalResult.burned ? (
                      <>
                        <Text style={{ fontSize: 24, color: '#f87171', fontWeight: '900', letterSpacing: 2 }}>🔥 POT BURNED</Text>
                        <Text style={{ fontSize: 12, color: '#a89060', marginTop: 8 }}>Everyone fouled — Pot {gfFinalResult.pile3Pot} burned</Text>
                      </>
                    ) : gfFinalResult.winnerId === PLAYER_ID ? (
                      <>
                        <Text style={{ fontSize: 24, color: '#8DFFB5', fontWeight: '900', letterSpacing: 2 }}>🏆 YOU WIN!</Text>
                        {gfFinalResult.winnerRank && (
                          <Text style={{ fontSize: 16, color: '#FFC857', marginTop: 8, fontWeight: '700' }}>
                            {rankLabels[gfFinalResult.winnerRank] ?? gfFinalResult.winnerRank}
                          </Text>
                        )}
                        <Text style={{ fontSize: 14, color: '#FFD76A', marginTop: 4 }}>Pile 3 Pot: +{gfFinalResult.pile3Pot}</Text>
                      </>
                    ) : (
                      <>
                        <Text style={{ fontSize: 20, color: '#FFD76A', fontWeight: '900', letterSpacing: 2 }}>
                          {winnerName(gfFinalResult.winnerId)} WINS
                        </Text>
                        {gfFinalResult.winnerRank && (
                          <Text style={{ fontSize: 14, color: '#FFC857', marginTop: 8, fontWeight: '700' }}>
                            {rankLabels[gfFinalResult.winnerRank] ?? gfFinalResult.winnerRank}
                          </Text>
                        )}
                        <Text style={{ fontSize: 12, color: '#a89060', marginTop: 4 }}>Pile 3 Pot: {gfFinalResult.pile3Pot}</Text>
                      </>
                    )}
                  </View>
                </View>
              )
            }
            // STAGE 2: Round Summary (5 วินาที)
            // Patch: ใช้ paddingTop เลื่อน popup ลงให้เห็นไพ่ P2/P4 ด้านบนชัดขึ้น (ไม่ center จอ)
            return (
              <View style={[StyleSheet.absoluteFill as any, { alignItems: 'center', justifyContent: 'flex-start', paddingTop: 420, zIndex: 60, backgroundColor: 'rgba(0,0,0,0.65)' }]} pointerEvents="none">
                <View style={{ backgroundColor: 'rgba(15,36,24,0.98)', padding: 20, borderRadius: 16, alignItems: 'stretch', borderWidth: 1.5, borderColor: '#FFD76A', minWidth: 300 }}>
                  <Text style={{ fontSize: 18, color: '#FFD76A', fontWeight: '900', letterSpacing: 2, textAlign: 'center', marginBottom: 14 }}>
                    📊 ROUND SUMMARY
                  </Text>
                  {/* Pile 1 */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: 'rgba(201,168,76,0.2)' }}>
                    <Text style={{ color: '#C8C4B0', fontSize: 13 }}>PILE 1</Text>
                    <Text style={{ color: '#F5F2E8', fontSize: 13, fontWeight: '700' }}>
                      {winnerName(gfFinalResult.pile1Winner)} <Text style={{ color: '#FFD76A' }}>+{gfFinalResult.pile1Pot ?? 0}</Text>
                    </Text>
                  </View>
                  {/* Pile 2 */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: 'rgba(201,168,76,0.2)' }}>
                    <Text style={{ color: '#C8C4B0', fontSize: 13 }}>PILE 2</Text>
                    <Text style={{ color: '#F5F2E8', fontSize: 13, fontWeight: '700' }}>
                      {winnerName(gfFinalResult.pile2Winner)} <Text style={{ color: '#FFD76A' }}>+{gfFinalResult.pile2Pot ?? 0}</Text>
                    </Text>
                  </View>
                  {/* Pile 3 */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: 'rgba(201,168,76,0.2)' }}>
                    <Text style={{ color: '#C8C4B0', fontSize: 13 }}>PILE 3</Text>
                    <Text style={{ color: '#F5F2E8', fontSize: 13, fontWeight: '700' }}>
                      {gfFinalResult.burned ? <Text style={{ color: '#f87171' }}>🔥 BURNED</Text> : (
                        <>{winnerName(gfFinalResult.winnerId)} <Text style={{ color: '#FFD76A' }}>+{gfFinalResult.pile3Pot}</Text></>
                      )}
                    </Text>
                  </View>
                  {/* Jackpot */}
                  {gfFinalResult.jackpotWinner && (
                    <View style={{ marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, backgroundColor: 'rgba(255,215,106,0.15)', borderWidth: 1.5, borderColor: '#FFD76A', alignItems: 'center' }}>
                      <Text style={{ color: '#FFC857', fontSize: 14, fontWeight: '900', letterSpacing: 1 }}>
                        🎰 JACKPOT! {winnerName(gfFinalResult.jackpotWinner)}
                      </Text>
                      <Text style={{ color: '#a89060', fontSize: 10, marginTop: 2 }}>Swept all 3 piles!</Text>
                    </View>
                  )}
                  {/* Your delta */}
                  <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,215,106,0.4)' }}>
                    <Text style={{ color: '#FFD76A', fontSize: 12, fontWeight: '700', textAlign: 'center' }}>
                      Your net this round: <Text style={{ color: deltaForMe >= 0 ? '#8DFFB5' : '#f87171', fontSize: 14 }}>
                        {deltaForMe >= 0 ? '+' : ''}{deltaForMe}
                      </Text>
                    </Text>
                  </View>
                </View>
              </View>
            )
          })()}

          {/* ── LOCKUP OVERLAY (Round 1 only, พร้อม deal animation) ── */}
          {showLockup && phase === 'dealing' && (
            <View style={{ position: 'absolute', bottom: 120, left: 20, right: 20, zIndex: 60,
              backgroundColor: 'rgba(15,36,24,0.95)', borderRadius: 12, borderWidth: 1.5,
              borderColor: '#FFD76A', padding: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: '#FFD76A', fontWeight: '800', marginBottom: 6 }}>
                🪙 Buy-in
              </Text>
              <Text style={{ fontSize: 12, color: '#F5F2E8', textAlign: 'center', lineHeight: 18 }}>
                {buyInAmount} tokens deducted for this match.{'\n'}Settled automatically when the match ends.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
                <Text style={{ fontSize: 11, color: '#8DFFB5', fontFamily: 'JetBrainsMono_400Regular' }}>Buy-in: {buyInAmount}</Text>
              </View>
            </View>
          )}

          {/* ── DISCARD OVERLAY ── */}
          {showDiscard && !isHNDiscard && (
            <View style={s.overlay}>
              <Text style={s.discardTitle}>Choose cards to discard (keep 3)</Text>
              <Text style={[s.discardSub, { color: discardTimeLeft <= 3 ? '#f87171' : '#FFD76A' }]}>
                {discardSelected.length}/{discardHandKeys.length - 3} selected — {discardTimeLeft}s left
              </Text>
              {/* Patch: โชว์ Community Pile3 ประกอบการตัดสินใจ (บังคับรวมในการประเมิน Hand เสมอ) */}
              <View style={{ alignItems: 'center', marginTop: 6, marginBottom: 4 }}>
                <Text style={[s.pileLabel, { marginBottom: 4 }]}>COMMUNITY (Pile 3)</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {comm.p3.map((k, i) => (
                    <View key={i} style={{ width: 50, height: 72, borderRadius: 4, overflow: 'hidden', borderWidth: 1.5, borderColor: '#38bdf8' }}>
                      {CARD_IMG[k] && <Image source={CARD_IMG[k]} style={{ width: 50, height: 72 }} resizeMode="cover" />}
                    </View>
                  ))}
                </View>
              </View>
              {/* Patch: แยก 2 แถว — ไม่แนะนำให้ทิ้ง (เก็บ) / แนะนำให้ทิ้ง */}
              {([
                { label: 'Not recommended to discard', filterFn: (key: string) => discardSuggested.includes(key) },
                { label: 'Recommended to discard', filterFn: (key: string) => !discardSuggested.includes(key) },
              ]).map((group, gi) => {
                const items = discardHandKeys
                  .map((key, idx) => ({ key, idx }))
                  .filter(({ key }) => group.filterFn(key))
                if (items.length === 0) return null
                return (
                  <View key={gi} style={{ alignItems: 'center', marginBottom: 10 }}>
                    <Text style={[s.pileLabel, { marginBottom: 4, color: gi === 1 ? '#FFC857' : '#8DFFB5' }]}>{group.label}</Text>
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                      {items.map(({ key, idx }) => {
                        const isSel = discardSelected.includes(idx)
                        return (
                          <TouchableOpacity key={`${key}-${idx}`} onPress={() => toggleDiscard(idx)} activeOpacity={0.8}
                            style={[s.discardCard, isSel && s.discardCardSel]}>
                            {CARD_IMG[key] && <Image source={CARD_IMG[key]} style={{ width: 56, height: 80 }} resizeMode="cover" />}
                            {isSel && <View style={s.discardX}><Text style={s.discardXTxt}>✕</Text></View>}
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  </View>
                )
              })}
              <Animated.View style={{ opacity: confirmBlinkAnim }}>
                <TouchableOpacity
                  style={[s.discardBtn, {
                    flex: 0, alignSelf: 'center', minHeight: 48, justifyContent: 'center', paddingVertical: 14,
                    backgroundColor: discardTimeLeft <= 5
                      ? '#5e1a1a'
                      : (discardSelected.length === (discardHandKeys.length - 3) ? '#1a5e20' : '#2a2a2a'),
                    borderColor: discardTimeLeft <= 5 ? '#f87171' : 'rgba(201,168,76,0.2)',
                  }]}
                  onPress={handleDiscardConfirm} disabled={discardSelected.length !== (discardHandKeys.length - 3)}>
                  <Text style={[s.discardBtnTxt, discardTimeLeft <= 5 && { color: '#f87171' }]} numberOfLines={1}>Confirm discard ✓</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          )}
          {/* Patch (บั๊กแก้) High Noble: Discard Modal แบบ 3 กอง — เลือกทิ้งจากกองไหนก็ได้ ให้เหลือกองละ 3 ใบ */}
          {showDiscard && isHNDiscard && (() => {
            const allOk = discardSelByPile.pile1.length === discardNeed.pile1
              && discardSelByPile.pile2.length === discardNeed.pile2
              && discardSelByPile.pile3.length === discardNeed.pile3
            return (
              <View style={s.overlay}>
                <Text style={s.discardTitle}>Choose cards to discard (keep 3 per pile)</Text>
                <Text style={[s.discardSub, { color: discardTimeLeft <= 3 ? '#f87171' : '#FFD76A' }]}>
                  {discardTimeLeft}s left
                </Text>
                {(['pile1', 'pile2', 'pile3'] as const).map((pile, pIdx) => (
                  <View key={pile} style={{ alignItems: 'center', marginBottom: 10 }}>
                    <Text style={[s.pileLabel, { marginBottom: 4, color: discardSelByPile[pile].length === discardNeed[pile] ? '#8DFFB5' : '#FFC857' }]}>
                      PILE {pIdx + 1} — Discard {discardSelByPile[pile].length}/{discardNeed[pile]}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                      {discardPiles[pile].map((key, idx) => {
                        const isSel = discardSelByPile[pile].includes(idx)
                        return (
                          <TouchableOpacity key={`${pile}-${key}-${idx}`} onPress={() => toggleDiscardPile(pile, idx)} activeOpacity={0.8}
                            style={[s.discardCard, isSel && s.discardCardSel]}>
                            {CARD_IMG[key] && <Image source={CARD_IMG[key]} style={{ width: 56, height: 80 }} resizeMode="cover" />}
                            {isSel && <View style={s.discardX}><Text style={s.discardXTxt}>✕</Text></View>}
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  </View>
                ))}
                <Animated.View style={{ opacity: confirmBlinkAnim }}>
                  <TouchableOpacity
                    style={[s.discardBtn, {
                      flex: 0, alignSelf: 'center', minHeight: 48, justifyContent: 'center', paddingVertical: 14,
                      backgroundColor: discardTimeLeft <= 5 ? '#5e1a1a' : (allOk ? '#1a5e20' : '#2a2a2a'),
                      borderColor: discardTimeLeft <= 5 ? '#f87171' : 'rgba(201,168,76,0.2)',
                    }]}
                    onPress={handleDiscardConfirmHighNoble} disabled={!allOk}>
                    <Text style={[s.discardBtnTxt, discardTimeLeft <= 5 && { color: '#f87171' }]} numberOfLines={1}>Confirm discard ✓</Text>
                  </TouchableOpacity>
                </Animated.View>
              </View>
            )
          })()}

          {/* ── COUNTDOWN OVERLAY ── */}
          {/* Patch 2026-07-18: ค้าง mount ไว้เสมอ toggle แค่ opacity (pattern Adept adept:1328-1330) —
              countAnim ใช้ native driver ถ้า unmount ระหว่าง animation กำลังเล่นอยู่จะชน native attach
              ("Animated node already attached to a view") ห้ามใช้ && unmount ตรงนี้อีก */}
          <View style={[s.overlay, { opacity: phase === 'countdown' ? 1 : 0 }]} pointerEvents={phase === 'countdown' ? 'auto' : 'none'}>
            <Text style={s.countdownLabel}>SHOWDOWN</Text>
            <Animated.Text style={[s.countdownNum, { transform: [{ scale: countAnim }] }]}>
              {countdown > 0 ? countdown : (
                <Image source={tripleSpade} style={{ width: 80, height: 80 }} resizeMode="contain" />
              )}
            </Animated.Text>
            <Text style={s.countdownSub}>All piles reveal!</Text>
          </View>



          {/* ── MATCH END OVERLAY ── */}
          {phase === 'end' && matchResult && (
            <>
              {matchResult.finalWinner === PLAYER_ID && (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  {confettiAnims.map((a, i) => {
                    const colors = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff922b','#cc5de8']
                    const rotStr = a.rotate.interpolate({ inputRange: [0, 720], outputRange: ['0deg', '720deg'] })
                    return (
                      <Animated.View key={i} style={{
                        position: 'absolute', width: 8, height: 8, borderRadius: 2,
                        backgroundColor: colors[i % colors.length], zIndex: 200,
                        transform: [{ translateX: a.x }, { translateY: a.y }, { rotate: rotStr }],
                        opacity: a.opacity,
                      }} />
                    )
                  })}
                </View>
              )}
              <MatchEndOverlay
                variant={matchResult.finalWinner === PLAYER_ID ? 'victory' : 'defeat'}
                tierBadge="HIGH NOBLE"
                buyInAmount={matchResult.buyInAmount ?? buyInAmount}
                // Returned ใช้ finalStackByHuman จาก server ถ้ามี (ตรงกับยอดจริงที่เข้า DB แม้เจอ Monarch ×2)
                returnedAmount={matchResult.finalStackByHuman?.[PLAYER_ID] ?? tokenBalance[PLAYER_ID] ?? 0}
                tokenBalanceDisplay={
                  typeof (matchResult.newTokenBalances?.[PLAYER_ID] ?? matchResult.newTokenBalance) === 'number'
                    ? (matchResult.newTokenBalances?.[PLAYER_ID] ?? matchResult.newTokenBalance)
                    : undefined
                }
                leaderboard={[PLAYER_ID, ...aiList.map(a => a.id)]
                  .sort((a, b) => (tokenBalance[b] ?? 0) - (tokenBalance[a] ?? 0))
                  .map(pid => {
                    const ai = aiList.find(a => a.id === pid)
                    return {
                      id: pid,
                      label: pid === PLAYER_ID ? myDisplayName : (ai?.name ?? pid),
                      balance: tokenBalance[pid] ?? (matchResult.buyInAmount ?? buyInAmount),
                      isSelf: pid === PLAYER_ID,
                    }
                  })}
                onBackToLobby={() => router.push('/lobby')}
                insetsBottom={insets.bottom}
              />
            </>
          )}

          {/* LOGOS — position absolute */}
          <View style={{ position: 'absolute', top: 8, left: 10, zIndex: 10, opacity: (phase === 'showdown' || phase === 'result') ? 0 : 1 }} pointerEvents="none">
            <Image source={studioLogo} style={{ width: 28, height: 28, opacity: 0.9 }} resizeMode="contain" />
          </View>
          {/* Hand Ranking (?) — ย้ายจากกลางบนจอ (ชนกล้องหน้ามือถือ กดไม่ได้) ไปอยู่ใต้ปุ่ม i ใน
              leftSlot ของ GameTopBar แทน (มติลุงเยาะ 2026-07-26) — top ใช้สูตรเดียวกับ paddingTop
              ของ topBar เอง (isWeb?22:insets.top+14) บวกความสูงแถว i/Timer อีก ~30 */}
          <View style={{ position: 'absolute', top: (isWeb ? 22 : insets.top + 14) + 30, left: 14, zIndex: 10, opacity: (phase === 'showdown' || phase === 'result') ? 0 : 1 }} pointerEvents="box-none">
            <TouchableOpacity onPress={() => setShowRankTable(true)}
              style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(201,168,76,0.2)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.5)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, color: '#c9a84c', fontWeight: '800' }}>?</Text>
            </TouchableOpacity>
          </View>

          {/* ── TIER INFO OVERLAY ── */}
          <TierInfoModal
            visible={showTierInfo}
            activeTab={activeTierTab as TierInfoLabel}
            onTabChange={setActiveTierTab}
            onClose={() => setShowTierInfo(false)}
          />

          {/* ── RANK TABLE OVERLAY ── */}
{showRankTable && (
  <View style={[s.overlay, { justifyContent: 'flex-start', paddingTop: 40, backgroundColor: 'rgba(11,21,16,0.92)' }]}>
    <Text style={[s.showdownTitle, { marginBottom: 12, fontSize: 18, color: '#FFD76A' }]}>Hand Rankings</Text>
    <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={false}>
    {[
      { rank: 9, name: 'Royal Flush',     desc: '5 same-suit cards in sequence',        low: 'A♠ K♠ Q♠ J♠ 10♠',  high: 'A♥ K♥ Q♥ J♥ 10♥' },
      { rank: 8, name: 'Straight Flush',  desc: '5 same-suit cards in sequence',        low: 'A♣ 2♣ 3♣ 4♣ 5♣',   high: '9♠ 10♠ J♠ Q♠ K♠' },
      { rank: 7, name: 'Four of a Kind',  desc: '4 cards of the same value',            low: '2♠ 2♥ 2♦ 2♣ 3♠',   high: 'A♠ A♥ A♦ A♣ K♠' },
      { rank: 6, name: 'Full House',      desc: 'Three of a Kind + One Pair',           low: '2♠ 2♥ 2♦ 3♠ 3♥',   high: 'A♠ A♥ A♦ K♠ K♥' },
      { rank: 5, name: 'Flush',           desc: '5 cards of the same suit (any order)', low: '2♠ 3♠ 5♠ 7♠ 9♠',   high: 'A♥ K♥ Q♥ J♥ 9♥' },
      { rank: 4, name: 'Straight',        desc: '5 cards in sequence (any suit)',       low: 'A♠ 2♥ 3♦ 4♣ 5♠',   high: '10♠ J♥ Q♦ K♣ A♠' },
      { rank: 3, name: 'Three of a Kind', desc: '3 cards of the same value',            low: '2♠ 2♥ 2♦ 3♠ 4♥',   high: 'A♠ A♥ A♦ K♠ Q♥' },
      { rank: 2, name: 'Two Pair',        desc: '2 different pairs',                    low: '2♠ 2♥ 3♦ 3♣ 4♠',   high: 'A♠ A♥ K♦ K♣ Q♠' },
      { rank: 1, name: 'One Pair',        desc: '2 cards of the same value',            low: '2♠ 2♥ 3♦ 4♣ 5♠',   high: 'A♠ A♥ K♦ Q♣ J♠' },
      { rank: 0, name: 'High Card',       desc: 'No combination — highest card wins',   low: '2♠ 3♥ 5♦ 7♣ 9♠',   high: 'A♠ K♥ Q♦ J♣ 9♠' },
    ].map((h, i) => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', width: '100%', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#2A4A34' }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,215,106,0.15)', borderWidth: 1, borderColor: '#FFD76A', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
          <Text style={{ fontSize: 10, color: '#FFD76A', fontWeight: '900' }}>{h.rank}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, color: '#F5F2E8', fontWeight: '700' }}>{h.name}</Text>
          <Text style={{ fontSize: 10, color: '#c9b87a', marginTop: 1 }}>{h.desc}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
            <Text style={{ fontSize: 10, color: '#8DFFB5' }}>Low: {h.low}</Text>
            <Text style={{ fontSize: 10, color: '#FFC857' }}>High: {h.high}</Text>
          </View>
        </View>
      </View>
    ))}
    <View style={{ height: 16 }} />
    </ScrollView>
    <TouchableOpacity style={[s.continueBtn, { marginTop: 12, backgroundColor: '#102218', borderColor: '#FFD76A' }]} onPress={() => setShowRankTable(false)}>
      <Text style={[s.continueBtnTxt, { color: '#FFD76A', fontSize: 14 }]}>Close</Text>
    </TouchableOpacity>
  </View>
)}

          {/* Patch High Noble: Boss Intro Popup */}
          {showBossIntro && (() => {
            const intro = BOSS_INTRO[bossIntroName]
            if (!intro) return null
            return (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, backgroundColor: 'rgba(5,10,8,0.92)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <View style={{ width: '100%', maxWidth: 340, alignItems: 'center' }}>
                  <Image source={intro.image} style={{ width: 220, height: 275, borderRadius: 14, borderWidth: 2.5, borderColor: '#FFD76A' }} resizeMode="cover" />
                  <Text style={{ fontSize: 20, color: '#FFD76A', fontWeight: '900', letterSpacing: 2, marginTop: 14 }}>{bossIntroName.toUpperCase()}</Text>
                  {/* Batch 1.5 Task 3 (quarantine cleanup, 2026-07-30): เดิมเช็ค bossIntroName==='Monarch'
                      เพื่อโชว์ subtitle "THE FACELESS KING" ใต้ชื่อบอส — เส้นทางนี้ตายแล้วตั้งแต่ Batch 1
                      (ลบ BOSS_INTRO['Monarch'] ออกไปแล้ว bossIntroName จึงไม่มีทางเป็น 'Monarch' ในไฟล์นี้
                      อีกต่อไป — Monarch มีแค่โต๊ะแยกของตัวเองที่ monarch/index.tsx เท่านั้น) ลบ block ทิ้ง */}
                  <Text style={{ fontSize: 13, color: '#F5F2E8', lineHeight: 20, textAlign: 'center', marginTop: 16, minHeight: 110 }}>
                    {typedText}
                  </Text>
                  <TouchableOpacity onPress={() => {
                    setShowBossIntro(false)
                    if (pendingRoundDataRef.current) {
                      const pending = pendingRoundDataRef.current
                      pendingRoundDataRef.current = null
                      processRoundStartRef.current?.(pending)
                    }
                  }}
                    style={{ marginTop: 20, borderWidth: 1.5, borderColor: '#FFD76A', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 28 }}>
                    <Text style={{ color: '#FFD76A', fontWeight: '800', letterSpacing: 1 }}>ENTER THE MATCH</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          })()}
          {/* TOP BAR */}
          {/* Patch 2026-07-19: ตัด Stack badge — ยอดโทเคนมีใต้ชื่อผู้เล่นแล้ว (มติลุงเยาะ) — GameTopBar
              ไม่ส่ง stackAmount ให้ = ไม่แสดง Stack badge (คงพฤติกรรมเดิม) */}
          <GameTopBar
            tierName="HIGH NOBLE"
            tierStars={5}
            round={roundNumber}
            totalRounds={totalRounds}
            isWeb={isWeb}
            insetsTop={insets.top}
            opacity={(phase === 'showdown' || phase === 'result') ? 0 : 1}
            /* มติลุงเยาะ 2026-07-26: ย้าย Timer จาก children (ขวาสุด, ห่างจาก Tier badge มาก
               เพราะ topBar เป็น space-between) มาเป็น leftSlot เหมือน Initiate/Adept/Mastermind
               เพื่อให้ Tier badge ติดกับ Timer ได้ — ย้ายปุ่ม i เข้ามาด้วย (ลบปุ่มลอยเดิม
               position:'absolute' top:70 left:0 ทิ้งแล้ว กันปุ่มซ้อนกัน 2 อัน) */
            leftSlot={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <TouchableOpacity
                  onPress={() => { setShowTierInfo(true); setActiveTierTab('HIGH NOBLE') }}
                  style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(180,0,0,0.3)', borderWidth: 1.5, borderColor: '#ff3333', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 11, color: '#ff3333', fontWeight: '900' }}>i</Text>
                </TouchableOpacity>
                <TimerDisplay valRef={timerValRef} />
              </View>
            }
          />

          {/* AI SEAT + MAIN + USER — fade เมื่อ continue, ซ่อนระหว่าง dealing
              Patch 2026-07-18: ห้ามสลับ opacity ระหว่าง literal 0 กับ fadeCards node ตรงนี้ (native driver
              จะ attach/detach node ทุกครั้งที่สลับ) — bind ค้างไว้กับ fadeCards node เสมอ แล้วให้
              startDealAnimation/round_start เป็นคน drive ค่า fadeCards เองแทน (pattern Adept) */}
          {phase !== 'end' && flowBuyIn > 0 && (
            <TokenFlowPanel
              pot={flowPot}
              feeRake={flowFeeRake}
              stacks={tokenBalance}
              seatIds={[PLAYER_ID, ...aiList.map(a => a.id)]}
              buyIn={flowBuyIn}
              topOffset={isWeb ? 6 : insets.top + 2}
            />
          )}

          <Animated.View style={{ flex: 1, opacity: fadeCards }}>
          <View style={[s.aiSeat, { opacity: (phase === 'countdown' || phase === 'showdown' || phase === 'result') ? 0 : 1 }]}>
            <View style={s.aiRow}>
              <View style={{ transform: [{ translateX: -50 }] /* Patch 2026-07-18: ขยับ avatar บอสไปซ้าย 50px (pattern Initiate) */ }}>
                {bossAI?.isVip
                  ? <AvatarFrame size={56}><AvatarBubble emoji={bossAvatar.emoji} size={56} glow image={bossAvatar.image} /></AvatarFrame>
                  : <AvatarBubble emoji={bossAvatar.emoji} size={56} glow image={bossAvatar.image} />}
              </View>
              <View style={{ transform: [{ translateX: -50 }] /* Patch 2026-07-18: ชื่อ+ยอดโทเคนบอสตาม avatar ไปซ้าย 50px */ }}>
                <Text style={s.aiName}>{bossAI?.name ?? 'BOSS AI'}</Text>
                <Text style={s.seatToken}>🪙 {fmtToken(tokenBalance[bossAI?.id ?? ''])}</Text>
              </View>
              <View style={s.statusBadge}>
                <AiStatusDots label={aiStatus[bossAI?.id ?? ''] ?? 'Arranging'} />
              </View>
            </View>
            {/* Fog of War / Grand Finale ใช้ AIPiles เดิม (index math ผูกกับ gfRevealedCards ห้ามแตะ) —
                phase ปกติ (arrangement/discard/auction ฯลฯ) ใช้ BossHandRow กลางแทน (pattern initiate/adept/mastermind) */}
            {bossAI && phase !== 'grand_finale' && phase !== 'grand_finale_done' && <View style={{ marginTop: -10 /* Patch 2026-07-18: ยกไพ่บอสขึ้น 10px */ }}>
              {phase === 'fog_of_war'
                ? <AIPiles aiId={bossAI.id} />
                : <BossHandRow revealed={[
                    ...(allCards[bossAI.id]?.[1] ?? []),
                    ...(allCards[bossAI.id]?.[2] ?? []),
                    ...(allCards[bossAI.id]?.[3] ?? []),
                  ]} pileSizes={zonePileSizes(bossAI.id)} />}
            </View>}
          </View>

          {/* MAIN AREA */}
          <View style={[s.mainArea, { opacity: (phase === 'countdown' || phase === 'showdown' || phase === 'result' || phase === 'grand_finale' || phase === 'grand_finale_done') ? 0 : 1 }]}>
            <View style={[s.sideCol, { paddingLeft: 10 }]}>
              <Text style={s.sideName}>{p2AI?.name ?? 'P2'}</Text>
              {/* Patch 2026-07-18: ยอดโทเคนคงเหลือใต้ชื่อ (pattern Initiate) */}
              <Text style={s.seatToken}>🪙 {fmtToken(tokenBalance[p2AI?.id ?? ''])}</Text>
              <View style={{ marginTop: 4, marginBottom: 60 }}>
                {p2AI?.isVip
                  ? <AvatarFrame size={36}><AvatarBubble emoji={p2Avatar.emoji} size={36} image={p2Avatar.image} /></AvatarFrame>
                  : <AvatarBubble emoji={p2Avatar.emoji} size={36} image={p2Avatar.image} />}
                {p2AI && <GFStatusBadge playerId={p2AI.id} />}
                {p2AI && <GFHealthBar playerId={p2AI.id} />}
              </View>
              {p2AI && <SideSeat rot="270deg" aiId={p2AI.id} />}
              {/* Patch: ไพ่ Call หงาย — ลอยที่ bottom ของ sideCol ไม่กระทบ SideSeat */}
              {p2AI && phase === 'grand_finale' && (
                <View style={{ position: 'absolute', bottom: -80 /* Patch 2026-07-19: กางลงล่าง — ตาม Mastermind */, left: 0, right: 0, alignItems: 'center' }}>
                  <GFCardsForPlayer playerId={p2AI.id} size="normal" />
                </View>
              )}
            </View>

            <View style={s.commWrap}>
              {/* Patch: ตอน Fog of War — โชว์ไพ่ชุดที่ชนะ Pile1+2 (รวม Community 5 ใบ) ให้จำ ก่อน Auction
                  (มติลุงเยาะ 2026-08-13: เปิดใช้ตาม pattern Mastermind — เดิม false && ปิดไว้เฉยๆ) */}
              {phase === 'fog_of_war' && (
                <Animated.View style={{ marginBottom: -8, alignItems: 'center', marginLeft: 15 /* Patch 2026-07-19: จูนรอบ 2 ตาม Mastermind */, opacity: pileFadeAnim }}>
                  {([1, 2] as const).map(pNum => {
                    const winnerId = pileWinners[pNum]
                    const commCards = pNum === 1 ? comm.p1 : comm.p2
                    const handCards = winnerId ? (allCards[winnerId]?.[pNum] ?? []) : []
                    const fullHand = [...commCards, ...handCards].filter(Boolean)
                    if (fullHand.length === 0) return null
                    return (
                      <View key={pNum} style={[
                        { flexDirection: 'row', alignSelf: 'center' },
                        pNum === 2 && { marginTop: -(CH * 0.25) }, // ซ้อนทับ Pile1 แนวตั้ง ~25%
                      ]}>
                        {fullHand.map((k, ci) => (
                          <View key={ci} style={[
                            { width: CW, height: CH, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(201,168,76,.5)' },
                            ci > 0 && { marginLeft: OVERLAP },
                          ]}>
                            {CARD_IMG[k] && <Image source={CARD_IMG[k]} style={{ width: CW, height: CH }} resizeMode="cover" />}
                          </View>
                        ))}
                      </View>
                    )
                  })}
                </Animated.View>
              )}
              {/* Auction — จัดกึ่งกลางให้ตรงกับ Pile 3 ด้านล่าง — ซ่อนตอน Grand Finale (Phase นี้ไม่เกี่ยวกับ Auction แล้ว) */}
              {/* Patch 2026-07-18: แสดงเฉพาะช่วงประมูลจริง — เดิมโชว์ทุก phase ทำให้ทับโซนจัดไพ่ผู้เล่น (ตาม Mastermind) */}
              {false && (phase === 'blind_auction' || phase === 'auction_done') && (
                <View style={{ alignItems: 'center', gap: 3, marginBottom: 4, width: '100%' }}>
                  <Text style={s.auctionLbl}>Auction</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {[0, 1].map(i => (
                      <View key={i} style={s.auctionCard}>
                        <Image source={cardBackImg} style={{ width: 50, height: 72 }} resizeMode="cover" />
                      </View>
                    ))}
                  </View>
                </View>
              )}
              {/* Pile 1 & 2 แถวเดียวกัน — ซ่อนทั้งแถวตอน Fog of War เหลือแค่ Pile 3 (มติลุงเยาะ 2026-08-13:
                  ตรงกับ pattern Mastermind — เดิม High Noble โชว์ค้างแม้ fog_of_war ก็ตาม) */}
              {phase !== 'dealing' && phase !== 'fog_of_war' && (
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
                  <CommRow pileNum={1} k1={comm.p1[0]} k2={comm.p1[1]} />
                  {/* Patch 2026-07-18: ถอด wrapper marginLeft 25 เดิมออก ให้ตรง Initiate/Adept/Mastermind */}
                  <CommRow pileNum={2} k1={comm.p2[0]} k2={comm.p2[1]} />
                </View>
              )}
              {/* Pile 3 แถวล่าง — กึ่งกลางระหว่าง Pile 1 และ Pile 2 */}
              <View style={{ alignSelf: 'center' }}>
                <CommRow pileNum={3} k1={comm.p3[0]} k2={comm.p3[1]} />
              </View>
              {/* Patch: ย้าย FOG OF WAR มาไว้ใต้ Pile 3 (จากเดิมกลางจอ) */}
              {phase === 'fog_of_war' && (
                <Animated.Text style={{
                  marginTop: 8, alignSelf: 'center',
                  fontSize: 18, fontWeight: '900', color: '#8DFFB5', letterSpacing: 2, minWidth: 260, textAlign: 'center', /* Patch 2026-07-19: บังคับบรรทัดเดียว */
                  opacity: fogBlinkAnim,
                  textShadowColor: 'rgba(141,255,181,0.6)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 },
                }}>
                  FOG OF WAR
                </Animated.Text>
              )}
            </View>

            <View style={[s.sideCol, { paddingRight: 10 }]}>
              <Text style={s.sideName}>{p4AI?.name ?? 'P4'}</Text>
              {/* Patch 2026-07-18: ยอดโทเคนคงเหลือใต้ชื่อ (pattern Initiate) */}
              <Text style={s.seatToken}>🪙 {fmtToken(tokenBalance[p4AI?.id ?? ''])}</Text>
              <View style={{ marginTop: 4, marginBottom: 60 }}>
                {p4AI?.isVip
                  ? <AvatarFrame size={36}><AvatarBubble emoji={p4Avatar.emoji} size={36} image={p4Avatar.image} /></AvatarFrame>
                  : <AvatarBubble emoji={p4Avatar.emoji} size={36} image={p4Avatar.image} />}
                {p4AI && <GFStatusBadge playerId={p4AI.id} />}
                {p4AI && <GFHealthBar playerId={p4AI.id} />}
              </View>
              {p4AI && <SideSeat rot="90deg" aiId={p4AI.id} />}
              {/* Patch: ไพ่ Call หงาย — ลอยที่ bottom ของ sideCol ไม่กระทบ SideSeat */}
              {p4AI && phase === 'grand_finale' && (
                <View style={{ position: 'absolute', bottom: -80 /* Patch 2026-07-19: กางลงล่าง — ตาม Mastermind */, left: 0, right: 0, alignItems: 'center' }}>
                  <GFCardsForPlayer playerId={p4AI.id} size="normal" />
                </View>
              )}
            </View>
          </View>

          {/* USER AREA */}
          <View style={[
            s.userArea,
            { opacity: (phase === 'countdown' || phase === 'showdown' || phase === 'result' || phase === 'grand_finale' || phase === 'grand_finale_done') ? 0 : 1 },
          ]}>

            <Text style={[s.swapHint, { opacity: selected ? 1 : 0 }]}>Tap the cards you want to swap</Text>
            {hasFoul[PLAYER_ID] && <Text style={s.foulText}>⚠️ FOUL{foulReasons[PLAYER_ID] ? ` — ${foulReasons[PLAYER_ID]}` : ''}</Text>}


            {(isRevealed && phase !== 'fog_of_war' && phase !== 'grand_finale' && phase !== 'grand_finale_done' && phase !== 'blind_auction' && phase !== 'auction_done' && phase !== 'discard' && phase !== 'discard_done') ? ( // Patch: ทุก phase ของ Mastermind หลัง Fog of War ใช้ branch Pile3-only ด้านล่าง
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 20 /* Patch 2026-07-18: เลื่อนไพ่ในมือลง 20px */ }}>
                {[1, 2, 3].flatMap(pNum => userRevealed[pNum] ?? []).map((key, ci) => (
                  <View key={ci} style={[s.userCard, { zIndex: ci }]}>
                    {CARD_IMG[key] && <Image source={CARD_IMG[key]} style={{ width: CW, height: CH }} resizeMode="cover" />}
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ gap: 4, marginTop: 20 /* Patch 2026-07-18: เลื่อนไพ่ในมือลง 20px */ }}>
                {/* Patch Grand Finale: ถ้า Human Call หงายไพ่ขึ้นมาด้านบน Pile 3 (รองรับหลายใบจาก Call หลายรอบ)
                    — ห้ามแตะ (Grand Finale UX) หมายเหตุ: userArea ทั้ง View มี opacity:0 ระหว่าง grand_finale
                    อยู่แล้ว (บรรทัดบน) ตัว Grand Finale overlay จริงอยู่แยกที่ GRAND FINALE OVERLAY ด้านล่าง
                    บล็อกนี้จึงไม่เคยแสดงผลจริง แต่คงไว้เผื่อ opacity transition ระหว่างเปลี่ยน phase */}
                {phase === 'grand_finale' && (gfRevealedCards[PLAYER_ID]?.length ?? 0) > 0 && (
                  <View style={{ alignItems: 'center', marginBottom: 6 }}>
                    <Text style={[s.pileLabel, { marginBottom: 2, color: '#FFD76A' }]}>YOUR CALL</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {(gfRevealedCards[PLAYER_ID] ?? []).map((k, i) => (
                        <View key={i} style={{ width: 50, height: 72, borderRadius: 4, overflow: 'hidden', borderWidth: 1.5, borderColor: '#FFD76A' }}>
                          {CARD_IMG[k] && <Image source={CARD_IMG[k]} style={{ width: 50, height: 72 }} resizeMode="cover" />}
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                {/* โซนจัดไพ่ในมือ — PlayerHandView กลาง: visiblePiles ซ่อน Pile1/2 หลัง Fog of War
                    (คง Pile1/2 เฉพาะ phase arrangement/arrangement_2) revealedCards แทนที่ Pile 3
                    ด้วยไพ่ที่เหลือหลังหัก "YOUR CALL" ออกแล้วตอน Grand Finale (มือตัวเองเท่านั้น — ไม่ต้องรองรับ
                    per-player เพราะ PlayerHandView ใช้แสดงมือผู้เล่นปัจจุบันเท่านั้น) */}
                <View style={{ width: '100%', alignItems: 'center' }}>
                  <PlayerHandView
                    piles={piles}
                    selected={selected}
                    onCardPress={handleCardPress}
                    isVip={isVip}
                    visiblePiles={cardZones.resolvedPileCounts.pile3 > 0 ? []
                      : cardZones.resolvedPileCounts.pile2 > 0 ? [2]
                      : cardZones.resolvedPileCounts.pile1 > 0 ? [1, 2]
                      : [0, 1, 2]}
                    revealedCards={
                      phase === 'grand_finale' && (gfRevealedCards[PLAYER_ID]?.length ?? 0) > 0
                        ? { 2: piles[2].filter(c => !(gfRevealedCards[PLAYER_ID] ?? []).includes(c.key)).map(c => c.key) }
                        : undefined
                    }
                    handFanAngleScale={1.2}
                  />
                </View>
              </View>
            )}
          </View>

          </Animated.View>
          {/* USER AVATAR — มุมล่างซ้าย (ซ่อนตอน Grand Finale เพราะ Overlay มี Avatar P1 แล้ว) — Feedback C2: ใช้ myAvatarEmoji/myDisplayName จริง */}
          {/* P1 HUD ย้ายลงชิดขอบล่าง — pointerEvents none เพื่อไม่บังปุ่ม actionBar */}
          <View style={{ position: 'absolute', bottom: Math.max(insets.bottom + 76, 80), left: 10, zIndex: 4, opacity: (phase === 'showdown' || phase === 'result') ? 0 : 1 /* Keep P1 above the action bar, just below the first hand pile. */, flexDirection: 'row', alignItems: 'center', gap: 6 }} pointerEvents="none">
            {/* Gold Radiance + Active Turn Pulse - reuse gfTurnPlayerId ตัวเดียวกับ SeatHeader ไม่สร้าง state ใหม่ */}
            {isVip
              ? <AvatarFrame size={40} active={phase === 'grand_finale' && gfTurnPlayerId === PLAYER_ID}><AvatarBubble emoji={myAvatarEmoji} image={myAvatarImage} size={40} /></AvatarFrame>
              : <AvatarBubble emoji={myAvatarEmoji} image={myAvatarImage} size={40} />}
            <View>
              <Text style={s.userNameTag} numberOfLines={1}>{myDisplayName}</Text>
              {/* Patch 2026-07-18: ยอดโทเคนคงเหลือใต้ชื่อ (pattern Initiate) */}
              <Text style={s.seatToken}>🪙 {fmtToken(tokenBalance[PLAYER_ID])}</Text>
            </View>
          </View>

          {/* ACTION BAR */}
          {phase === 'fog_of_war' && (
            <View style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: '#8DFFB5', fontSize: 12, fontWeight: '700' }}>🌫 Fog of War — Only your Pile 3 is visible</Text>
            </View>
          )}
          {/* ═════════════════════════════════════════════════════════ */}
          {/*  GRAND FINALE OVERLAY — Layout ใหม่สมมาตรทั้งโต๊ะ              */}
          {/*  P3 บนสุด • [P2|Community|P4] กลาง • P1 ล่าง                  */}
          {/* ═════════════════════════════════════════════════════════ */}
          {(phase === 'grand_finale' || phase === 'grand_finale_done') && (() => {
            // helper component: แถวไพ่ 3 ใบเรียงแนวนอน (หลังไพ่หรือหงาย)
            const GF_CW = 50, GF_CH = 72, GF_GAP = -25, GF_CALL_GAP = 6 // overlap 50% หลังไพ่ + ใบ Call gap ปกติ
            const GFPile3Row: React.FC<{
              playerId: string; isHuman?: boolean
            }> = ({ playerId, isHuman = false }) => {
              // Patch: User ใช้ขนาดไพ่ใหญ่เท่าตอน arrangement (62×90); AI คงขนาดเล็กเดิม (50×72)
              const CW_USER_OR_AI = isHuman ? CW : GF_CW
              const CH_USER_OR_AI = isHuman ? CH : GF_CH
              const GAP_USER_OR_AI = isHuman ? OVERLAP : GF_GAP
              const calledKeys = gfRevealedCards[playerId] ?? []
              const finalRev = gfFinalReveals[playerId] ?? []
              // Round 2 จบ → หงายครบ 3 ใบ
              if (finalRev.length === 3) {
                return (
                  <View style={{ flexDirection: 'row', gap: GAP_USER_OR_AI, alignSelf: 'center' }}>
                    {finalRev.map((k, i) => (
                      <View key={i} style={{
                        width: CW_USER_OR_AI, height: CH_USER_OR_AI, borderRadius: 4, overflow: 'hidden',
                        borderWidth: 1.5, borderColor: '#FFD76A',
                      }}>
                        {CARD_IMG[k] && <Image source={CARD_IMG[k]} style={{ width: CW_USER_OR_AI, height: CH_USER_OR_AI }} resizeMode="cover" />}
                      </View>
                    ))}
                  </View>
                )
              }
              // P1 (Human) เห็นไพ่ตัวเอง 3 ใบ — ใบที่ Call ย้ายไปอยู่ขวาเสมอ (รองรับหลายใบที่หงายในรอบ 1+2)
              if (isHuman) {
                const rawCards = piles[2] ?? []
                // Patch: ใบที่ Call แล้วย้ายไปอยู่ขวาสุด (เรียงตามลำดับที่หงาย)
                const calledCards = calledKeys
                  .map(k => rawCards.find(c => c.key === k))
                  .filter((c): c is NonNullable<typeof c> => !!c)
                const cards = calledKeys.length > 0
                  ? [...rawCards.filter(c => !calledKeys.includes(c.key)), ...calledCards]
                  : rawCards
                // Patch High Noble: ตา Human ใน Grand Finale — คลิกเลือก/หงาย + swipe down เพื่อ Fold
                const isMyTurn = phase === 'grand_finale' && gfTurnPlayerId === PLAYER_ID
                const unrevealedCards = cards.filter(c => !calledKeys.includes(c.key))
                // ตั้ง default selected = ใบอ่อนสุดที่ยังไม่หงาย (อ้างจาก rank ของ card key)
                const cardValue = (key: string) => {
                  const r = key.slice(0, -1).toLowerCase()
                  if (r === 'a') return 14; if (r === 'k') return 13; if (r === 'q') return 12; if (r === 'j') return 11
                  return parseInt(r) || 0
                }
                const defaultSelected = unrevealedCards.length > 0
                  ? unrevealedCards.reduce((min, c) => cardValue(c.key) < cardValue(min.key) ? c : min, unrevealedCards[0]).key
                  : null
                const effectiveSelected = gfSelectedCardKey ?? defaultSelected

                // VIP: ไพ่พัดชุดเดียวกับ arrangement -- Free ใช้ path แถวตรงเดิมด้านล่างต่อไป
                if (isVip) {
                  return (
                    <GFHandView
                      cards={cards}
                      calledKeys={calledKeys}
                      selectedKey={effectiveSelected}
                      isMyTurn={isMyTurn}
                      onSelect={setGfSelectedCardKey}
                    />
                  )
                }

                // มติลุงเยาะ 2026-07-25: ตัด swipe down = Fold ออก ใช้ปุ่ม FOLD จริงด้านล่างแทน
                return (
                  <View style={{ flexDirection: 'row', alignSelf: 'center' }}>
                    {cards.map((c, i) => {
                      const isCalled = calledKeys.includes(c.key)
                      const isSelected = isMyTurn && !isCalled && c.key === effectiveSelected
                      // แตะ = เลือกใบที่จะหงายเท่านั้น ไม่ยิง Call เอง (กันกดพลาดเสียเงิน) ยืนยันที่ปุ่ม CALL
                      const handlePress = !isMyTurn || isCalled ? undefined : () => setGfSelectedCardKey(c.key)
                      const cardBox = (
                        <View style={{
                          width: CW_USER_OR_AI, height: CH_USER_OR_AI, borderRadius: 4, overflow: 'hidden',
                          borderWidth: (isCalled || isSelected) ? 2.5 : 1,
                          borderColor: isCalled ? '#FFD76A' : isSelected ? '#8DFFB5' : 'rgba(201,168,76,0.4)',
                          marginLeft: i === 0 ? 0 : GAP_USER_OR_AI,
                          shadowColor: isCalled ? '#FFD76A' : isSelected ? '#8DFFB5' : 'transparent',
                          shadowOpacity: (isCalled || isSelected) ? 0.8 : 0, shadowRadius: 8,
                          // Patch: ไพ่ที่ Call แล้วยกขึ้น 10px ให้เห็นโดดเด่น
                          transform: [{ translateY: isCalled ? -10 : 0 }],
                        }}>
                          {CARD_IMG[c.key] && <Image source={CARD_IMG[c.key]} style={{ width: CW_USER_OR_AI, height: CH_USER_OR_AI }} resizeMode="cover" />}
                          {isSelected && (
                            <View style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: '#8DFFB5', alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 11, color: '#0F2418', fontWeight: '900' }}>✓</Text>
                            </View>
                          )}
                        </View>
                      )
                      return handlePress
                        ? <TouchableOpacity key={c.id} onPress={handlePress} activeOpacity={0.7}>{cardBox}</TouchableOpacity>
                        : <View key={c.id}>{cardBox}</View>
                    })}
                  </View>
                )
              }
              // AI: 3 ใบหลัง — ใบที่ Call หงายแทน (right-most อันดับสุดท้าย, รองรับหลายใบจากรอบ 1+2)
              // ถ้า Call 1 ใบ → ใบที่ 3 หงาย, 2 ใบ → ใบที่ 2-3 หงาย
              const numRevealed = Math.min(calledKeys.length, 3)
              return (
                <View style={{ flexDirection: 'row', alignSelf: 'center' }}>
                  {[0, 1, 2].map(i => {
                    // slot i = 2 คือใบขวาสุด, i = 1 ใบกลาง (หงายลำดับ 2), i = 0 ซ้ายสุด
                    const revealIdx = i - (3 - numRevealed) // index ใน calledKeys array (เรียงจากซ้ายไปขวา)
                    const isCalledSlot = revealIdx >= 0 && revealIdx < calledKeys.length
                    const ml = i === 0 ? 0 : GAP_USER_OR_AI
                    return (
                      <View key={i} style={{
                        width: CW_USER_OR_AI, height: CH_USER_OR_AI, borderRadius: 4, overflow: 'hidden',
                        borderWidth: isCalledSlot ? 2.5 : 1, borderColor: isCalledSlot ? '#FFD76A' : 'rgba(201,168,76,0.4)',
                        marginLeft: ml,
                        shadowColor: isCalledSlot ? '#FFD76A' : 'transparent',
                        shadowOpacity: isCalledSlot ? 0.8 : 0, shadowRadius: 8,
                        // Patch 3.5 Step 5: ไพ่ที่ AI/opponent Call แล้ว เด้งลง 10px แทนเด้งขึ้น
                        // (แยกทิศจาก P1 — กันดูสับสนว่าใบไหนเป็นของใคร ขนาด offset เท่าเดิม)
                        transform: [{ translateY: isCalledSlot ? 10 : 0 }],
                      }}>
                        {isCalledSlot
                          ? <Image source={CARD_IMG[calledKeys[revealIdx]]} style={{ width: CW_USER_OR_AI, height: CH_USER_OR_AI }} resizeMode="cover" />
                          : <Image source={cardBackImg} style={{ width: CW_USER_OR_AI, height: CH_USER_OR_AI }} resizeMode="cover" />
                        }
                      </View>
                    )
                  })}
                </View>
              )
            }
            // Seat glow/dim ผูกกับตาจริงของ Grand Finale (gfTurnPlayerId) แทน static hardcode glow=true ที่ boss เดิม
            const SeatHeader: React.FC<{ pid: string; emoji: string; name: string; image?: any }> = ({ pid, emoji, name, image }) => {
              const isTurnSeat = gfTurnPlayerId === pid
              const seatIsVip = pid === PLAYER_ID ? isVip : !!aiList.find(seat => seat.id === pid)?.isVip
              return (
                <View style={{ alignItems: 'center', gap: 2, opacity: gfTurnPlayerId && !isTurnSeat ? 0.75 : 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {seatIsVip
                      ? <AvatarFrame size={32} active={isTurnSeat}><AvatarBubble emoji={emoji} size={32} image={image} glow={isTurnSeat} /></AvatarFrame>
                      : <AvatarBubble emoji={emoji} size={32} image={image} glow={isTurnSeat} />}
                    <Text style={{ color: '#FFD76A', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>{name}</Text>
                  </View>
                  {/* Stack ปัจจุบัน (มติลุงเยาะ 2026-07-26) — ต้องเห็นก่อนตัดสินใจ Call/Fold รอบท้ายๆ */}
                  <Text style={{ fontFamily: 'JetBrainsMono_600SemiBold', color: '#C8C4B0', fontSize: 9 }}>
                    🪙 {(tokenBalance[pid] ?? 0).toLocaleString('en-US')}
                  </Text>
                  <GFStatusBadge playerId={pid} />
                  <GFHealthBar playerId={pid} />
                </View>
              )
            }
            return (
              // top 60->78 (มติลุงเยาะ 2026-07-26): GameTopBar สูงขึ้นหลังย้ายดาวลงมาอยู่ใต้ชื่อ Tier
              // (แก้ก่อนหน้านี้) เดิม P3 (Boss) ไปทับแถวดาว ต้องเลื่อนลงให้พ้น
              <View style={{ position: 'absolute', top: 78, left: 0, right: 0, bottom: 0, zIndex: 40, paddingHorizontal: 10 }} pointerEvents="box-none">
                {/* ═══ P3 (Boss) บนสุด ═══ */}
                {bossAI && (
                  <View style={{ alignItems: 'center', marginTop: 4, gap: 4, transform: [{ translateY: GF_CH }] }}>
                    <GFPile3Row playerId={bossAI.id} />
                  </View>
                )}
                {/* ═══ Middle row: [P2 | Pile 3 Community | P4] ═══ */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 14, paddingHorizontal: 4 }}>
                  {p2AI && (
                    <View style={{ alignItems: 'flex-start', gap: 4, transform: [{ translateX: -10 }] }}>
                      <SeatHeader pid={p2AI.id} emoji={p2AI.emoji} name={p2AI.name} image={MINION_AVATAR[p2AI.name]} />
                      <GFPile3Row playerId={p2AI.id} />
                    </View>
                  )}
                  {/* ตำแหน่ง Pile 3 Community ให้ตรงกับ Mastermind */}
                  <View style={{ alignItems: 'center', marginTop: 0, transform: [{ translateY: GF_CH }] }}>
                    <Text style={[s.pileLabel, { marginBottom: 4 }]}>PILE 3 COMMUNITY</Text>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      {comm.p3.map((k, i) => (
                        <View key={i} style={{
                          width: 50, height: 72, borderRadius: 4, overflow: 'hidden',
                          borderWidth: 1.5, borderColor: '#38bdf8',
                        }}>
                          {CARD_IMG[k] && <Image source={CARD_IMG[k]} style={{ width: 50, height: 72 }} resizeMode="cover" />}
                        </View>
                      ))}
                    </View>
                  </View>
                  {p4AI && (
                    <View style={{ alignItems: 'flex-end', gap: 4, transform: [{ translateX: 10 }] }}>
                      <SeatHeader pid={p4AI.id} emoji={p4AI.emoji} name={p4AI.name} image={MINION_AVATAR[p4AI.name]} />
                      <GFPile3Row playerId={p4AI.id} />
                    </View>
                  )}
                </View>
                {/* ═══ Center: ตัวอักษร YOUR TURN กลาง — render ผ่าน GRAND FINALE BIG TEXT เดิม ═══ */}
                {/* ═══ P1 (Human) ล่าง ═══ */}
                <View style={{ position: 'absolute', bottom: 70, left: 0, right: 0, gap: 6 }} pointerEvents="box-none">
                  {/* Patch 3.5 Step 4: ตัด Avatar+ชื่อซ้ำออก — ชุดที่ P1 HUD มุมล่างซ้าย (ซึ่งคงแสดงตลอด
                      รวม Grand Finale ตาม "มติลุงเยาะ" Patch 2026-07-19) มีอยู่แล้ว เหลือแค่ Status/Health ที่นี่ */}
                  <View style={{ alignItems: 'flex-start', paddingLeft: 14, gap: 2 }}>
                    <GFStatusBadge playerId={PLAYER_ID} />
                    <GFHealthBar playerId={PLAYER_ID} />
                  </View>
                  {/* ไพ่ Pile 3 คงไว้กึ่งกลาง */}
                  <View style={{ alignItems: 'center' }}>
                    <GFPile3Row playerId={PLAYER_ID} isHuman />
                  </View>
                </View>
              </View>
            )
          })()}
          {/* Patch High Noble: ลบปุ่ม Call/Fold ออก — Human เลือกหงายไพ่ในหน้าเกมเลย:
                คลิก = ย้าย ✓ / คลิกซ้ำใบที่มี ✓ = Call / swipe down = Fold / หมดเวลา = Call ใบ default
                แต่ยังเก็บปุ่มไว้สำหรับ Mastermind/Initiate */}
          {phase === 'grand_finale' && gfTurnPlayerId === PLAYER_ID && (
            <View style={s.gfActionBar}>
              <Text style={s.gfActionHint}>TAP A CARD TO CHOOSE WHICH TO REVEAL</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12 }}>
                <TouchableOpacity
                  onPress={() => socketRef.current?.emit('hn_grand_finale_action', {
                    roomId: ROOM_ID, userId: PLAYER_ID, action: 'call',
                    // ไม่ได้เลือกใบไหนไว้ -> ไม่ส่ง key ให้ server เลือกใบอ่อนสุดให้เอง (pickRevealCard)
                    ...(gfSelectedCardKey ? { revealedCardKey: gfSelectedCardKey } : {}),
                  })}
                  style={[s.gfActionBtn, { backgroundColor: '#1C4830', borderColor: '#8DFFB5' }]}>
                  <Text style={[s.gfActionBtnTxt, { color: '#8DFFB5' }]}>CALL -{gfCallAmount.current}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => socketRef.current?.emit('hn_grand_finale_action', { roomId: ROOM_ID, userId: PLAYER_ID, action: 'fold' })}
                  style={[s.gfActionBtn, { backgroundColor: '#5e1a1a', borderColor: '#f87171' }]}>
                  <Text style={[s.gfActionBtnTxt, { color: '#fff' }]}>FOLD</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {phase !== 'dealing' && phase !== 'showdown' && phase !== 'result' && phase !== 'fog_of_war' && phase !== 'grand_finale' && <View style={s.actionBar}>
            <ActionButton
              icon="auto_sort"
              label={sortDone ? 'Sorted ✓' : 'Auto Sort'}
              variant={sortDone ? 'disabled' : 'normal'}
              disabled={sortDone || (phase !== 'arrangement' && phase !== 'arrangement_2')}
              /* 750 = 50% ของ Ante กอง 3 (1,500) ตามสูตรใหม่ 2026-07-25 — เดิมค้างเลขเก่า 250 ไว้
                 ⚠️ ตัวเลขนี้ยัง "แสดงผลอย่างเดียว" Tier นี้ยังไม่ได้ wire Token Flow จึงยังไม่หักเงินจริง
                 ตอนทำ Token Flow ของ High Noble ให้เปลี่ยนเป็นรับ autoSortFee จาก payload round_start
                 เหมือน Adept/Mastermind (แหล่งความจริงคือ getAutoSortFee() ใน server gameConfig.ts) */
              costBadge="750"
              onPress={handleAutoSort}
              style={s.actionBtnSize}
            />
            <ActionButton
              icon="ready"
              label="Ready"
              variant={isReady ? 'waiting' : 'normal'}
              disabled={isReady || (phase !== 'arrangement' && phase !== 'arrangement_2')}
              onPress={handleReady}
              style={s.actionBtnSize}
            />
          </View>}

        </View>
        {/* Patch 2026-07-18: Boss Victory VFX — ทับทุก layer, จบแล้วถอดตัวเอง */}
        {victoryVfx && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} pointerEvents="none">
            <BossVictoryVFX tier={victoryVfx} onFinish={() => setVictoryVfx(null)} />
          </View>
        )}
        {/* Boss victory has priority; a pending Triple Sweep plays immediately after it finishes. */}
        {showLegendarySweep && !victoryVfx && (
          <LegendaryCardVFX
            title="TRIPLE SWEEP JACKPOT"
            subtitle={`${myDisplayName} WON ALL 3 PILES`}
            onFinish={() => setShowLegendarySweep(false)}
          />

        )}
        {/* ── SHOWDOWN RESULT (กลางจอ) — Feedback C5: ครอบด้วยพื้นหลัง free/vip ชุดเดียวกับ Profile/Lobby ── */}
        {showResult && (phase === 'showdown' || phase === 'result') && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: -200, zIndex: 200 }}>
            <ImageBackground source={isVip ? SHOWDOWN_BG_VIP : SHOWDOWN_BG_FREE} resizeMode="cover" style={{ flex: 1, padding: 12 }}>
              <ShowdownResult />
            </ImageBackground>
          </View>
        )}
        <ServerLog socket={socketRef.current} onMonarchWin={setMonarchWinner} />
      </View>
    </View>
  )
}

// =================================================================
// STYLES
// =================================================================
const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#0a0a0a' },
  webOuter:      { alignItems: 'center', justifyContent: 'center' },
  webFrame:      { width: 390, height: 920, borderRadius: 40, borderWidth: 3, borderColor: '#333', overflow: 'hidden' },
  gameContainer: { flex: 1, flexDirection: 'column' },
  gameArea:      { flex: 90, backgroundColor: '#6aaf7f', overflow: 'hidden', position: 'relative' },
  feltOverlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)' },
  logoWatermark: { alignItems: 'center', justifyContent: 'center' },

  studioLogo: { width: 28, height: 28, opacity: 0.9 },
  potBadge:   { borderWidth: 1, borderColor: 'rgba(201,168,76,.4)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center' },
  stackLabel: { fontSize: 6, fontWeight: '800', letterSpacing: 1, color: 'rgba(201,168,76,.6)', fontFamily: 'JetBrainsMono_400Regular' },
  potText:    { fontSize: 10, fontWeight: '700', color: '#c9a84c' },
  deltaText:  { fontSize: 9, fontWeight: '800' },
  timerText:  { fontSize: 20, fontWeight: '700', minWidth: 48, textAlign: 'right' },
  tbarWrap:   { paddingHorizontal: 12, paddingBottom: 2, zIndex: 2 },
  tbarBg:     { height: 3, backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 2, overflow: 'hidden' },
  tbarFill:   { height: '100%' as any, borderRadius: 2 },

  aiSeat:       { paddingHorizontal: 12, paddingVertical: 4, alignItems: 'center', gap: 4, zIndex: 2 },
  aiRow:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatarBubble: { backgroundColor: '#132019', borderWidth: 2, borderColor: '#c9a84c', alignItems: 'center', justifyContent: 'center', shadowColor: '#c9a84c', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 },
  aiName:       { fontSize: 9, color: '#ff3333', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '800' },
  statusBadge:  { borderWidth: 1, borderColor: 'rgba(74,154,90,.2)', backgroundColor: 'rgba(74,154,90,.1)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  statusText:   { fontSize: 7, color: '#4a9a5a' },
  cardBack:     { backgroundColor: '#091808', borderWidth: 1, borderColor: 'rgba(201,168,76,.5)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },

  mainArea:      { flex: 1, flexDirection: 'row', zIndex: 2 },
  sideCol:       { width: SIDE_COL_W, alignItems: 'center', paddingTop: 4, gap: 2 },
  sideName:      { fontSize: 9, color: '#ffffff', letterSpacing: 1, fontWeight: '700' },
  userNameTag:   { fontSize: 10, color: '#ffffff', letterSpacing: 1, fontWeight: '800', maxWidth: 100, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  // Patch 2026-07-18: ยอดโทเคนคงเหลือใต้ชื่อทุกที่นั่ง — ทองธีมหลัก, JetBrains Mono ตามมาตรฐานตัวเลข
  seatToken:     { fontSize: 9, color: '#FFD76A', fontFamily: 'JetBrainsMono_600SemiBold', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  sideSeatWrap:  { flex: 1, width: SIDE_COL_W, overflow: 'visible', justifyContent: 'flex-start', alignItems: 'center' },
  sideSeatInner: { flexDirection: 'row', alignItems: 'center' },

  commWrap:    { flex: 1, paddingLeft: 4, paddingRight: 18 /* Patch 2026-07-18: คืน paddingRight ให้ตรง Initiate/Adept/Mastermind — เดิมตกหล่น */, alignItems: 'flex-start', justifyContent: 'center', marginTop: 40 /* Patch 2026-07-18: เลื่อนกองกลางทั้ง 3 กองลง 40px — ใช้พื้นที่ว่างกลางจอ */, zIndex: 2 },
  auctionLbl:  { fontSize: 7, color: 'rgba(160,80,220,.55)', letterSpacing: 1, textTransform: 'uppercase' },
  auctionCard: { width: 50, height: 72, borderRadius: 4, backgroundColor: '#091808', borderWidth: 2, borderColor: '#a855f7', overflow: 'hidden', shadowColor: '#a855f7', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 8, elevation: 8 },
  commCard:    { width: 50, height: 72, borderRadius: 4, backgroundColor: '#fdfaf3', borderWidth: 1, borderColor: 'rgba(74,154,90,.75)', overflow: 'hidden' },
  pileLabel:   { fontSize: 7, color: '#38bdf8', letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: '700' },
  winBadge:    { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  winBadgeTxt: { fontSize: 7, fontWeight: '800' },

  userArea:     { paddingHorizontal: 8, paddingTop: 4, paddingBottom: 4, borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,.15)', zIndex: 2, alignItems: 'center' },
  userLabels:   { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 3 },
  userPilesRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-start' },
  userCard:     { width: CW, height: CH, borderRadius: 4, backgroundColor: '#fdfaf3', borderWidth: 1, borderColor: 'rgba(201,168,76,.65)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  userCardSel:  { borderColor: '#6ec87a', borderWidth: 2, transform: [{ translateY: -16 }] },
  swapHint:     { fontSize: 8, color: 'rgba(201,168,76,.9)', textAlign: 'center', marginBottom: 2 },
  foulText:     { fontSize: 12, color: '#FF6B6B', fontWeight: '800', letterSpacing: 1, textAlign: 'center', marginBottom: 4 },
  actionBar:      { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 20, zIndex: 2 },

  // Grand Finale - ปุ่ม CALL / FOLD (มติลุงเยาะ 2026-07-25: เลิกใช้ gesture + คำอธิบายยาว)
  gfActionBar:    { position: 'absolute', bottom: 10, left: 0, right: 0, alignItems: 'center', zIndex: 80, gap: 6 },
  gfActionHint:   { color: '#7A7A6A', fontSize: 9, letterSpacing: 0.5, fontWeight: '600' },
  gfActionBtn:    { borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, justifyContent: 'center', minWidth: 120, alignItems: 'center' },
  gfActionBtnTxt: { fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  actionBtnSize:  { width: 130 },

  // Overlay
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.90)', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 },

  // Showdown result
  showdownPanel:     { width: '100%', alignItems: 'center' },
  showdownTitle:     { fontSize: 14, color: '#c9a84c', fontWeight: '900', letterSpacing: 3, marginBottom: 12 },
  showdownRow:       { width: '100%', borderWidth: 1.5, borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: 'rgba(0,0,0,0.4)' },
  showdownPileLabel: { fontSize: 9, fontWeight: '800', marginBottom: 6, letterSpacing: 0.5 },
  showdownCard:      { width: 44, height: 63, borderRadius: 4, overflow: 'hidden', borderWidth: 1.5 },
  showdownDelta:     { fontSize: 16, fontWeight: '900', marginVertical: 8 },
  continueBtn:       { marginTop: 8, backgroundColor: '#1a3a6e', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 40, borderWidth: 1.5, borderColor: '#38bdf8' },
  continueBtnTxt:    { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 2 },

  // Discard
  discardTitle:   { fontSize: 14, color: '#c9a84c', fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  discardSub:     { fontSize: 11, color: 'rgba(201,168,76,0.5)', marginBottom: 16, letterSpacing: 1 },
  discardCard:    { width: 56, height: 80, borderRadius: 6, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(201,168,76,0.3)' },
  discardCardSel: { borderColor: '#f87171', borderWidth: 3, opacity: 0.6 },
  discardX:       { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(248,113,113,0.4)' },
  discardXTxt:    { fontSize: 28, color: '#f87171', fontWeight: '900' },
  discardBtn:     { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)', minWidth: 150 },
  discardBtnTxt:  { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },

  // Countdown
  countdownLabel: { fontSize: 13, color: '#c9a84c', letterSpacing: 4, fontWeight: '800', marginBottom: 10 },
  countdownNum:   { fontSize: 88, color: '#fff', fontWeight: '900' },
  countdownSub:   { fontSize: 11, color: 'rgba(201,168,76,0.6)', letterSpacing: 2, marginTop: 10 },

  // Server log
  logZone:   { flex: 10, backgroundColor: '#080808', borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,.12)' },
  logHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.05)' },
  liveDot:   { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#4a9a5a' },
  logTitle:  { fontSize: 8, color: 'rgba(201,168,76,.5)', letterSpacing: 2, textTransform: 'uppercase' },
  onlineTxt: { fontSize: 8, color: 'rgba(74,154,90,.7)' },
  logList:   { flex: 1, paddingHorizontal: 8, paddingVertical: 3, gap: 3 },
  logBubble: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  logTxt:    { flex: 1, fontSize: 9, color: '#888' },
  logTime:   { fontSize: 7, color: '#333', minWidth: 52, textAlign: 'right' },
})

export default GameTableLive
