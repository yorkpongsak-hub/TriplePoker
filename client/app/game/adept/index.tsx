/**
 * live.tsx — GameTable Live v5 (Clean)
 * - TimerDisplay แยก component ไม่กะพริบ
 * - Showdown หงายพร้อมกันทันที
 * - Winner แสดงกลางจอ 3 แถว
 * - CONTINUE emit player_continue รอ server
 * The Sage Unicorn Studio Co., Ltd.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert, Animated, Image, ImageBackground, Platform, ScrollView, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { io, Socket } from 'socket.io-client'
import * as Haptics from 'expo-haptics'
import { autoSort } from '../../../src/utils/autoSort'
import { getReduceMotion } from '../../../src/utils/reduceMotion'
import { clearPendingMatch, markPendingMatch } from '../../../src/utils/pendingMatch'
import { useAuthStore } from '../../../src/store/authStore'
// Patch 2026-07-18: resolve avatar preset key → emoji/รูปภาพ (แก้ VIP preset ไม่โชว์ที่โต๊ะ)
import { PRESET_AVATARS } from '../../../src/components/profile/AvatarPicker'
import { MINION_AVATAR } from '../../../src/constants/minionAvatars'
import { useTableSkins } from '../../../src/hooks/useTableSkins'
import { TABLE_SKINS } from '../../../src/config/tableSkins'
import { useUserStore } from '../../../src/store/userStore'
import PreGameCountdown from '../../../src/components/PreGameCountdown'
import MonarchConquestBanner from '../../../src/components/game/MonarchConquestBanner'
import { ActionButton } from '../../../src/components/ui/ActionButton'
import { glassPanelDense } from '../../../src/ui/glassStyles'
import { CARD_IMG, CARD_BACK_IMG } from '../../../src/components/game/cardAssets'
import PlayerHandView from '../../../src/components/game/PlayerHandView'
import CharacterBarkBubble, { useCharacterBarks } from '../../../src/components/game/CharacterBarkBubble'
import BossHandRow from '../../../src/components/game/BossHandRow'
import GameTopBar from '../../../src/components/game/GameTopBar'
import MatchEndOverlay from '../../../src/components/game/MatchEndOverlay'
import { TierInfoModal } from '../../../src/components/game/TierInfoModal'
import type { TierInfoLabel } from '../../../src/config/tierInfoData'
import TokenFlowPanel, { PANEL_WIDTH, PANEL_RIGHT } from '../../../src/components/game/TokenFlowPanel'
import FlyingCoins, { FlyingCoinsHandle, Point } from '../../../src/components/game/FlyingCoins'
import LegendaryCardVFX from '../../../src/components/vfx/LegendaryCardVFX'
import {
  playCountdownWarning, playCardArrange1, playCardArrange2, playJackpotFanfare, playBossPileWinThunder,
  playCardShuffle, playCardReveal, playPokerChip, playAnte, playAutoSortButton, playReadyButton, playRevealCountdownTick,
} from '../../../src/services/gameSfxService'

// ตำแหน่งที่นั่งเดียวกับ targets ใน startDealAnimation (Boss=บน, P4=ขวา, User=ล่าง, P2=ซ้าย)
const SEAT_TARGETS = {
  boss:   { x: -50,  y: -240 },
  p4:     { x: 90,   y: -10  },
  user:   { x: -50,  y: 200  },
  p2:     { x: -190, y: -10  },
  center: { x: 0,    y: 0    },
} as const
// Gold Radiance: กรอบทองเฉพาะโต๊ะที่มี buy-in (Adept ขึ้นไป) และเฉพาะที่นั่งของผู้เล่นเอง
import AvatarFrame from '../../../src/components/game/AvatarFrame'

// Feedback C5 — Showdown result ครอบด้วยพื้นหลังชุดเดียวกับ Profile/Lobby (bg free/vip ตาม isVip)
const SHOWDOWN_BG_FREE = require('../../../assets/backgrounds/bg_main_free.png')
const SHOWDOWN_BG_VIP  = require('../../../assets/backgrounds/bg_main_vip.png')

// ── Assets
const studioLogo  = require('../../../assets/images/sage_unicorn_logo_transparent.png')
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
// Patch (2026-07-17): ใช้แทนที่นั่งคู่แข่งทั้งหมดแล้ว ไม่ใช่แค่ AI (id เป็น userId จริงถ้า Human,
// emoji เป็น avatarUrl ของ Human ถ้ามี — ดู round_start handler ที่ map จาก data.seats)
interface AIInfo   { id: string; name: string; emoji: string; avatarUrl?: string; isVip?: boolean; isHuman?: boolean }

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
      Animated.timing(dotAnim, { toValue: 0.25, duration: 900, useNativeDriver: false }),
      Animated.timing(dotAnim, { toValue: 1,    duration: 900, useNativeDriver: false }),
    ]))
    p.start()
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
  const matchStartRef = useRef(Date.now())

  // Patch Multiplayer: roomId/userId มาจาก Lobby (auto-match) ผ่าน route params
  const params = useLocalSearchParams<{ roomId?: string; userId?: string }>()
  const authUserId = useUserStore(s => s.userId)
  // roomId ต้องมาจาก matchmaking จริงเท่านั้น — ห้าม fallback เป็นค่าคงที่ 'Adept1' (บั๊กเดิม: 2 ห้องพร้อมกัน
  // ชน state กัน) ถ้า params.roomId หลุด (เข้าหน้านี้ตรงๆ ไม่ผ่าน Lobby) ให้ block+redirect แทน — ดู guard ด้านล่าง
  const ROOM_ID = params.roomId ?? ''
  // params.userId มาจาก Lobby matchmaking (ผูก escrow ไว้แล้วตอนห้องเต็ม) — authUserId เป็น fallback กันกรณี
  // route param หลุด แต่ทั้งคู่ต้องไม่ว่างพร้อมกัน ห้าม fallback เงียบเป็น literal เด็ดขาด (ดู DEV_FAKE_USER_ID ด้านบน)
  const usingDevFakeId = !params.userId && !authUserId && !!DEV_FAKE_USER_ID
  const PLAYER_ID = params.userId || authUserId || DEV_FAKE_USER_ID || ''
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
  // Coin Flying VFX (มติลุงเยาะ 2026-07-26) — แปลง playerId -> ตำแหน่งที่นั่งจริง อ่าน aiListRef.current
  // สดทุกครั้งที่เรียก (aiList ตอนนี้คือ "คู่แข่งทั้งหมด" ไม่ใช่แค่ AI แล้ว — ดู comment เดิมตอน setAiList(opponents))
  const seatTargetFor = (playerId: string): Point => {
    if (playerId === PLAYER_ID) return SEAT_TARGETS.user
    const opp = aiListRef.current
    if (opp[0]?.id === playerId) return SEAT_TARGETS.boss
    if (opp[1]?.id === playerId) return SEAT_TARGETS.p2
    if (opp[2]?.id === playerId) return SEAT_TARGETS.p4
    return SEAT_TARGETS.center
  }
  const timerRef    = useRef<any>(null)
  const countdownAnimTimeoutRef = useRef<any>(null)
  const dealAnimCompositeRef = useRef<Animated.CompositeAnimation | null>(null)
  // Reduce Motion preference (Settings modal, AsyncStorage local) — โหลดครั้งเดียวตอน mount แล้ว
  // เก็บใน ref (ไม่ trigger re-render) ให้ startDealAnimation() อ่านสดตอนถูกเรียกจริง
  const reduceMotionRef = useRef(false)
  useEffect(() => { getReduceMotion().then(v => { reduceMotionRef.current = v }) }, [])
  const winPulseLoopRef = useRef<Animated.CompositeAnimation | null>(null)
  const winOpacityLoopRef = useRef<Animated.CompositeAnimation | null>(null)
  const confettiActiveRef = useRef(false)
  const confettiCompositesRef = useRef<Animated.CompositeAnimation[]>([])

  // ── Game state
  const [phase, setPhase]             = useState<'dealing'|'arrangement'|'countdown'|'showdown'|'result'|'end'>('dealing')
  // phase เริ่มต้นเป็น 'dealing' อยู่แล้ว (โชว์ loading animation ระหว่างรอ connect) ทำให้ setPhase('dealing')
  // จาก round_start เป็น no-op ตอนรอบแรก (ค่าไม่เปลี่ยน useEffect([phase]) เลยไม่ trigger ซ้ำ) ใช้ตัวนับนี้
  // แทนเพื่อบังคับ trigger startDealAnimation ทุกครั้งที่ round_start มาถึงจริง ไม่ว่าค่า phase จะซ้ำเดิมหรือไม่
  const [dealTrigger, setDealTrigger] = useState(0)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  // A5 — Bug A fix (2026-07-17): Reconnect UI state
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [afkNotice, setAfkNotice] = useState<string | null>(null)
  const afkNoticeTimeoutRef = useRef<any>(null)
  const [dealDone, setDealDone]         = useState(false)
  const [dealCount, setDealCount]       = useState(0)
  const [roundNumber, setRoundNumber] = useState(1)
  const [countdown, setCountdown]     = useState(3)
  // Pre-Game Countdown (LobbyMatchmaking_Spec_v1_0 §7.1) — คนละตัวกับ `countdown` ข้างบน (Simultaneous Showdown 3-2-1 เดิม ห้ามแตะ)
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

  // ── AI
  const [aiList, setAiList]     = useState<AIInfo[]>([])
  const [aiStatus, setAiStatus] = useState<Record<string, string>>({})

  // ── Showdown — เก็บไพ่ทุกคนหลัง reveal ครบ
  const [allCards, setAllCards]       = useState<Record<string, Record<number, string[]>>>({})
  const [pileWinners, setPileWinners] = useState<Record<number, string>>({})
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
  const [activeTierTab, setActiveTierTab] = useState('INITIATE')

  // ── Triple Sweep Jackpot VFX — ใครก็ได้ (human/AI) ชนะครบ 3 กอง
  const [jackpotWinner, setJackpotWinner] = useState<string | null>(null)
  const jackpotTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Result
  const [tokenBalance, setTokenBalance] = useState<Record<string, number>>({})
  // Patch 2026-07-18: format ยอดโทเคนเต็มมี comma (มติลุงเยาะ: แบบเต็ม ไม่ย่อ K/M) — pattern Initiate
  const fmtToken = (v: number | undefined) => (v ?? buyInAmount).toLocaleString('en-US')
  const [tokenDeltas, setTokenDeltas]   = useState<Record<string, number>>({})
  const [matchResult, setMatchResult]   = useState<any>(null)

  // Token Flow Panel (Spec v1.1) - ค่าทั้งหมดมาจาก server ล้วน client ไม่คำนวณเอง
  // flowBuyIn แยกจาก buyInAmount เพราะตัวหลัง set เฉพาะรอบ 1 (คู่กับ popup Lock-up)
  const [flowPot, setFlowPot]         = useState<[number, number, number]>([0, 0, 0])
  const [flowFeeRake, setFlowFeeRake] = useState(0)
  const [flowBuyIn, setFlowBuyIn]     = useState(0)
  const [burnToast, setBurnToast]     = useState<string | null>(null)
  // ค่า Auto Sort ต่อครั้งของ Tier นี้ (server ส่งมาทุกรอบ) - ไม่มีรอบฟรีแล้วตามมติลุงเยาะ 2026-07-25
  const [autoSortFee, setAutoSortFee] = useState(0)
  // "จ่ายค่า Auto Sort ของรอบนี้ไปแล้ว" - แยกจาก sortDone เพราะ sortDone ถูก reset ทุกครั้งที่ผู้เล่น
  // สลับไพ่เอง ถ้าใช้ตัวเดียวกันผู้เล่นจะโดนเรียกเก็บซ้ำได้ในรอบเดียว  ตัวนี้ reset เฉพาะตอนขึ้นรอบใหม่
  // ให้ตรงกับ state.autoSortUsed ฝั่ง server ที่เคลียร์ใน startMultiRound
  const [autoSortPaid, setAutoSortPaid] = useState(false)

  // ── Discard
  const [showDiscard, setShowDiscard]         = useState(false)
  const [buyInAmount, setBuyInAmount]       = useState(0)
  const [showLockup, setShowLockup]         = useState(false)
  const [discardSelected, setDiscardSelected] = useState<number[]>([])

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

  // Legacy jackpot VFX — ใช้เมื่อ P2/P3/P4 หรือ AI เป็นผู้ทำ Triple Sweep เท่านั้น
  const jackpotPulse = useRef(new Animated.Value(0.5)).current
  const jackpotConfettiAnims = useRef(
    Array.from({ length: 20 }, () => ({
      x: new Animated.Value(Math.random() * 360 - 30),
      y: new Animated.Value(-20),
      opacity: new Animated.Value(1),
      rotate: new Animated.Value(0),
    }))
  ).current

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

  // P1 uses Legendary Card; every other winner keeps the original jackpot VFX.
  const triggerJackpot = (winnerId: string) => {
    if (jackpotTimeoutRef.current) clearTimeout(jackpotTimeoutRef.current)
    setJackpotWinner(winnerId)
    // Congratulations is private to P1; other winners keep their visual result without this sound.
    if (winnerId === PLAYER_ID) playJackpotFanfare()

    if (winnerId === PLAYER_ID) return

    jackpotPulse.setValue(0.5)
    Animated.sequence([
      Animated.timing(jackpotPulse, { toValue: 1.15, duration: 250, useNativeDriver: false }),
      Animated.timing(jackpotPulse, { toValue: 1, duration: 200, useNativeDriver: false }),
    ]).start()

    jackpotConfettiAnims.forEach((a, i) => {
      a.x.setValue(Math.random() * 360 - 30)
      a.y.setValue(-20); a.opacity.setValue(1); a.rotate.setValue(0)
      Animated.parallel([
        Animated.timing(a.y, { toValue: 700, duration: 1800 + Math.random() * 1200, delay: i * 40, useNativeDriver: false }),
        Animated.timing(a.opacity, { toValue: 0, duration: 2200, delay: i * 40, useNativeDriver: false }),
        Animated.timing(a.rotate, { toValue: 720, duration: 1800, delay: i * 40, useNativeDriver: false }),
      ]).start()
    })

    jackpotTimeoutRef.current = setTimeout(() => setJackpotWinner(null), 5000)
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
    // ค่าคงที่ 'Adept1' เด็ดขาด — บั๊กเดิม: 2 ห้องพร้อมกันชน state กัน ดู Phase 2.2) กลับ Lobby ให้จับคู่ใหม่
    if (!ROOM_ID) {
      console.error('[game] roomId missing — entered without matchmaking')
      Alert.alert(
        'Table Not Found',
        'This table could not be found. Please join a table from the lobby.',
        [{ text: 'OK', onPress: () => router.replace('/(home)/lobby') }]
      )
      return
    }

    // A5 (Bug A fix, 2026-07-17): เปิด reconnection จริง (เดิม false — เน็ตสะดุดแป๊บเดียวก็ค้างจอถาวร
    // ไม่มีทางกลับมาเองเลย) ค่า attempts/delay ตามที่ socketService.ts ใช้อยู่แล้วที่อื่นในโปรเจค
    const socket = io(SERVER_URL, {
      transports: ['websocket'], reconnection: true, reconnectionAttempts: 5, reconnectionDelay: 1000,
    })
    socketRef.current = socket

    // Patch Multiplayer: ห้องถูกสร้าง + startMultiplayerMatch ถูกเรียกจาก server แล้ว
    // (ตอน room_auto_match / room_join_private ทำให้ห้องเต็ม) — client แค่ join room + รอ round_start
    // 'connect' ยิงทั้งตอน connect ครั้งแรกและตอน reconnect สำเร็จ — game_join ทำหน้าที่คืนที่นั่งให้
    // อัตโนมัติทั้งสองกรณี (ดู resendRoundStartToPlayer ฝั่ง server ที่ยกเลิก grace timer ให้เอง)
    socket.on('connect', () => {
      setConnectionError(null)
      setIsReconnecting(false)
      socket.emit('game_join', { roomId: ROOM_ID, userId: PLAYER_ID })
    })

    socket.on('connect_error', (err: any) => {
      setConnectionError(err?.message || 'Cannot reach the game server.')
    })

    // A5: เน็ตหลุดกลางเกม — โชว์ "Reconnecting..." ระหว่างรอ socket.io ต่อเองอัตโนมัติ (reconnection:true
    // ด้านบน) ยกเว้นตอนที่เราเป็นคน disconnect เอง (unmount/ออกจากหน้านี้ — ดู cleanup ท้าย useEffect)
    socket.on('disconnect', (reason: string) => {
      if (reason === 'io client disconnect') return
      setIsReconnecting(true)
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

    // A5: อีกคนหลุด (AI เล่นแทนทันที ระหว่าง grace 60s รอ reconnect) — แจ้งผู้เล่นที่เหลือเฉยๆ ไม่บล็อกจอ
    socket.on('player_disconnected_replaced', (data: { roomId: string; disconnectedUserId: string; displayName?: string; graceSeconds?: number }) => {
      if (data.disconnectedUserId === PLAYER_ID) return // ตัวเองไม่ต้องเห็น notice ของตัวเอง
      if (afkNoticeTimeoutRef.current) clearTimeout(afkNoticeTimeoutRef.current)
      setAfkNotice(`${data.displayName ?? 'A player'} disconnected — AI takes over`)
      afkNoticeTimeoutRef.current = setTimeout(() => setAfkNotice(null), 4000)
    })

    socket.on('round_start', (data: any) => {
      if (typeof data.buyInAmount === 'number') void markPendingMatch('adept')
      // Pre-Game Countdown §7.1 — โชว์ครั้งเดียวตอนเริ่มแมตช์
      if (data.roundNumber === 1 && !preGameCountdownShownRef.current) {
        preGameCountdownShownRef.current = true
        setShowPreGameCountdown(true)
      }
      setPhase('arrangement')
      setRoundNumber(data.roundNumber)
      setIsReady(false); setSortDone(false); setSelected(null); setAutoSortPaid(false)
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
      // ต้อง stopAnimation ก่อน setValue เสมอ กัน native-driven timing ที่ยังค้างจาก handleContinue ชนกัน
      fadeCards.stopAnimation(() => { fadeCards.setValue(0) })
      setBlind([]); setDealCount(0)
      setTokenBalance(data.tokenBalance ?? {})
      // Token Flow: ต้นรอบ server หัก Ante เข้า Pot มาให้แล้ว (tokenBalance ข้างบนคือยอดหลังหัก)
      setFlowPot(data.pot ?? [0, 0, 0])
      setFlowFeeRake(data.feeRake ?? 0)
      if (typeof data.buyIn === 'number') setFlowBuyIn(data.buyIn)
      if (typeof data.autoSortFee === 'number') setAutoSortFee(data.autoSortFee)
      // Bug B/C fix (2026-07-17): server เปลี่ยนจาก aiNames (AI-only) เป็น seats (4 ที่นั่งเรียงตาม
      // ห้องจริง รวม Human) — เดิม Adept 2H+2AI มี AI แค่ 2 ตัว ทำให้ p4AI (index 2) ว่างเปล่าเวลาที่นั่ง
      // นั้นเป็น Human จริง (หลังไพ่/avatar/ชื่อไม่โชว์เลย) map เป็นรูปแบบ AIInfo เดิมให้ bossAI/p2AI/p4AI
      // derivation ทำงานถูกต้องเสมอไม่ว่าที่นั่งจะเป็น Human หรือ AI — ตัวแปรชื่อ aiList ยังคงไว้ (ไม่ rename
      // ทั้งไฟล์) แต่ตอนนี้หมายถึง "คู่แข่งทั้งหมด" ไม่ใช่แค่ AI แล้ว
      const opponents: AIInfo[] = (data.seats ?? [])
        .filter((seat: any) => seat.userId !== PLAYER_ID)
        .map((seat: any) => ({ id: seat.userId, name: seat.displayName, emoji: seat.avatarUrl || seat.emoji || '👤', avatarUrl: seat.avatarUrl, isVip: seat.isVip, isHuman: seat.isHuman }))
      setAiList(opponents)
      aiListRef.current = opponents

      const init: Record<string, string> = {}
      opponents.forEach((o) => { init[o.id] = 'Arranging' })
      setAiStatus(init)

      // Coin Flying VFX — Ante: ทุกที่นั่งส่งเหรียญเข้ากองกลางตอนเริ่มรอบ (มติลุงเยาะ 2026-07-26)
      ;[SEAT_TARGETS.boss, SEAT_TARGETS.p4, SEAT_TARGETS.user, SEAT_TARGETS.p2].forEach(from => {
        flyingCoinsRef.current?.fire('ante', from, SEAT_TARGETS.center)
      })
      playAnte() // SFX: หัก Ante ต้นรอบ — ครั้งเดียวต่อรอบ ไม่ใช่ต่อที่นั่ง

      setComm({
        p1: data.communityCards.pile1,
        p2: data.communityCards.pile2,
        p3: data.communityCards.pile3,
      })
      setBlind(data.blindAuction ?? [])

      // Buy-in (Escrow) — แสดง popup เฉพาะ Round 1
      if (data.buyInAmount && data.roundNumber === 1) {
        setBuyInAmount(data.buyInAmount)
        setShowLockup(true)
      }

      // เริ่ม deal animation
      setPhase('dealing')
      setDealTrigger(t => t + 1)
      setDealDone(false)

      const myCards: string[] = data.cards[PLAYER_ID] ?? []
      const cardObjs = myCards.map((k: string, i: number) => ({ id: `c${i}`, key: k }))
      setPiles([cardObjs.slice(0, 3), cardObjs.slice(3, 6), cardObjs.slice(6, 11)])

      // Patch v1.2: tierBonus (+15 เดิม) พับเข้า gameConfig.arrangementTimer.adept (75→90) แล้ว —
      // ใช้ data.timer ตรงๆ เหมือน Mastermind/HighNoble (ผู้เล่นเห็นตัวเลขเท่าเดิมทุกประการ)
      const t = data.timer ?? 90
      timerValRef.current = { val: t, max: t }
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        const next = Math.max(0, timerValRef.current.val - 1)
        timerValRef.current = { ...timerValRef.current, val: next }
        // SFX: เตือนครั้งเดียวตอนตัวนับข้าม 3 วิ (fresh setInterval ทุกรอบใหม่ เลยไม่ต้องกัน re-fire ข้ามรอบ)
        if (next === 3) playCountdownWarning()
        if (next <= 0) {
          clearInterval(timerRef.current)
          // TODO (backlog, 2026-07-24): Adept multiplayer arrangement round 1 has no server-side
          // timeout enforcement (unlike HighNoble's resolveHNArrangementTimeout in
          // highNobleMultiEngine.ts) — this client-side auto-submit-on-timeout is the ONLY thing
          // that ever resolves this phase. A frozen/malicious client that never emits
          // 'player_ready_multi' could hang the entire table indefinitely (server just waits
          // forever for submitMultiArrangement). Needs a resolveAdeptArrangementTimeout mirroring
          // the HighNoble pattern (setTimeout in gameLoop.ts's startMultiRound, tied to
          // gameConfig.arrangementTimer.adept). Flagged as separate backlog item, not fixed here.
          setPiles(cur => {
            socket.emit('player_ready_multi', {
              roomId: ROOM_ID, userId: PLAYER_ID,
              arrangement: {
                pile1: cur[0].map((c: CardData) => c.key),
                pile2: cur[1].map((c: CardData) => c.key),
                pile3: cur[2].slice(0, 3).map((c: CardData) => c.key),
              },
            })
            return cur
          })
        }
      }, 1000)
    })

    // showdown_countdown — แสดง countdown 3-2-1 ก่อน
    socket.on('showdown_countdown', (data: any) => {
      setPhase('countdown')
      if (timerRef.current) clearInterval(timerRef.current)
      if (countdownAnimTimeoutRef.current) clearTimeout(countdownAnimTimeoutRef.current)
      let c = data.seconds ?? 3
      const tick = () => {
        setCountdown(c)
        if (c > 0) playRevealCountdownTick()
        Animated.sequence([
          Animated.timing(countAnim, { toValue: 1.6, duration: 150, useNativeDriver: false }),
          Animated.timing(countAnim, { toValue: 1,   duration: 850, useNativeDriver: false }),
        ]).start()
        if (c > 0) { c--; countdownAnimTimeoutRef.current = setTimeout(tick, 1000) }
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
      // Token Flow: Pot ไหลออกไปหาผู้ชนะ/Fee & Rake แล้ว - stack ทุกที่นั่งเปลี่ยนตรงนี้
      if (data.tokenBalance) setTokenBalance(data.tokenBalance)
      if (data.pot) setFlowPot(data.pot)
      if (typeof data.feeRake === 'number') setFlowFeeRake(data.feeRake)
      if (typeof data.buyIn === 'number') setFlowBuyIn(data.buyIn)
      setPhase('showdown')
      playCardReveal() // SFX: เปิดเผยผลลัพธ์ — Adept เป็น Simultaneous Showdown ทั้ง 3 กองพร้อมกัน เลยเล่นครั้งเดียว

      // Coin Flying VFX — รางวัลออกจากกองกลางไปหาผู้ชนะแต่ละกอง (มติลุงเยาะ 2026-07-26)
      const pileCoinVariant = { 1: 'pile1', 2: 'pile2', 3: 'pile3' } as const
      ;([1, 2, 3] as const).forEach(pNum => {
        const winnerId = newWinners[pNum]
        if (winnerId) { flyingCoinsRef.current?.fire(pileCoinVariant[pNum], SEAT_TARGETS.center, seatTargetFor(winnerId)); playPokerChip() }
      })

      // SFX: ฟ้าร้องเฉพาะกองที่ AI ชนะ (ไม่ใช่ Human คนไหนเลย รวมผู้เล่นเอง) — Adept เป็น 2H+2AI จริง
      // เช็คจาก isHuman ที่ map มาจาก data.seats ตอน round_start (server ส่ง state.seatOrder มาให้อยู่แล้ว)
      ;([1, 2, 3] as const).forEach(pNum => {
        const winnerId = newWinners[pNum]
        if (winnerId && aiListRef.current.some(o => o.id === winnerId && o.isHuman === false)) {
          playBossPileWinThunder()
        }
      })

      // Triple Sweep Jackpot — คนเดียวกันชนะครบทั้ง 3 กอง
      if (newWinners[1] && newWinners[1] === newWinners[2] && newWinners[2] === newWinners[3]) {
        triggerJackpot(newWinners[1])
      }
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
      if (pNum === 3) setPhase('showdown')
    })

    socket.on('round_result', (data: any) => {
      setPhase('result')
      setTokenBalance(data.tokenBalance ?? {})
      setTokenDeltas(data.tokenDeltas ?? {})
      if (data.pot) setFlowPot(data.pot)
      if (typeof data.feeRake === 'number') setFlowFeeRake(data.feeRake)
      if (typeof data.buyIn === 'number') setFlowBuyIn(data.buyIn)
      const speaker = aiListRef.current[0]?.name ?? 'The Sage'
      const winners = Object.values(data.pileWinners ?? {})
      offerBark({ speaker, event: winners.length >= 3 && winners.every(id => id === PLAYER_ID) ? 'TRIPLE_SWEEP' : (data.tokenDeltas?.[PLAYER_ID] ?? 0) > 0 ? 'COMEBACK' : 'G1_LOSS' })
    })

    // Token Flow: มีคนกด Auto Sort - fee ไหลจาก stack คนนั้นเข้า Fee & Rake (broadcast ทั้งโต๊ะ)
    socket.on('token_flow_update', (data: any) => {
      if (data.tokenBalance) setTokenBalance(data.tokenBalance)
      if (data.pot) setFlowPot(data.pot)
      if (typeof data.feeRake === 'number') setFlowFeeRake(data.feeRake)
      if (typeof data.buyIn === 'number') setFlowBuyIn(data.buyIn)
    })

    socket.on('match_end', (data: any) => {
      void clearPendingMatch()
      setPhase('end')
      setMatchResult(data)
      setTokenBalance(data.tokenBalance ?? {})
      // Token Flow Spec ข้อ 5: จบเกม -> Fee & Rake burn จริง (ออกจากจอ)
      if (typeof data.feeRakeBurned === 'number') {
        setFlowFeeRake(0)
        setFlowPot([0, 0, 0])
        setBurnToast(`House collected: ${data.feeRakeBurned.toLocaleString('en-US')} tokens`)
        setTimeout(() => setBurnToast(null), 4000)
      }
      // Server ส่งยอด token_balance จริงหลัง settle มาด้วย (per-player) — ห้ามคำนวณเองจาก buyin/stack
      const myNewBalance = data.newTokenBalances?.[PLAYER_ID] ?? data.newTokenBalance
      if (typeof myNewBalance === 'number') {
        useUserStore.getState().updateTokenBalance(myNewBalance)
      }
      if (data.finalWinner === PLAYER_ID) {
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
      if (countdownAnimTimeoutRef.current) clearTimeout(countdownAnimTimeoutRef.current)
      if (dealAnimCompositeRef.current) dealAnimCompositeRef.current.stop()
      stopMatchEndAnimations()
      if (jackpotTimeoutRef.current) clearTimeout(jackpotTimeoutRef.current)
      jackpotPulse.stopAnimation()
      jackpotConfettiAnims.forEach(a => {
        a.x.stopAnimation(); a.y.stopAnimation(); a.opacity.stopAnimation(); a.rotate.stopAnimation()
      })
      if (afkNoticeTimeoutRef.current) clearTimeout(afkNoticeTimeoutRef.current)
      socket.disconnect()
    }
  }, [])

  // ── Deal Animation
  const startDealAnimation = () => {
    // กันรอบใหม่เริ่ม deal ทับรอบเก่าที่ยังเล่นไม่จบ (native driver ชนกันถ้าปล่อยให้วิ่งพร้อมกัน)
    if (dealAnimCompositeRef.current) dealAnimCompositeRef.current.stop()
    playCardShuffle() // SFX: ครั้งเดียวตอนเริ่ม deal animation ของรอบ
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
      a.opacity.setValue(0); a.scale.setValue(0.5)
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
            Animated.timing(a.opacity, { toValue: 1, duration: 100, useNativeDriver: false }),
            Animated.timing(a.scale,   { toValue: 1, duration: 150, useNativeDriver: false }),
          ]),
          Animated.parallel([
            Animated.timing(a.x,       { toValue: target.x, duration: 200, useNativeDriver: false }),
            Animated.timing(a.y,       { toValue: target.y, duration: 200, useNativeDriver: false }),
          ]),
          Animated.timing(a.opacity, { toValue: 0, duration: 80, useNativeDriver: false }),
        ])
      )
      // นับไพ่ที่แจกไปแล้ว
      setTimeout(() => setDealCount(i + 1), i * delayPerCard + 450)
    })

    dealAnimCompositeRef.current = Animated.parallel(anims)
    dealAnimCompositeRef.current.start(({ finished }) => {
      // ถ้าโดน .stop() ตัดกลางคัน (finished=false) เพราะรอบใหม่มาแทรก ห้ามทำ reveal logic นี้
      // ไม่งั้น phase/fadeCards จะเพี้ยนไปตามข้อมูล deal รอบเก่าที่ถูกยกเลิกไปแล้ว
      if (!finished) return
      setDealDone(true)
      setShowLockup(false)
      setPhase('arrangement')
      // เผยไพ่กลับมาให้เห็นหลัง deal เสร็จ (fadeCards ถูกกดไว้ที่ 0 ตอนเริ่ม dealing)
      fadeCards.stopAnimation()
      Animated.timing(fadeCards, { toValue: 1, duration: 300, useNativeDriver: false }).start()
    })
  }

  // เริ่ม deal เมื่อ phase เปลี่ยนเป็น dealing — ใช้ dealTrigger คู่กับ phase กัน round_start
  // แรกสุดที่ setPhase('dealing') เป็น no-op (phase เป็น 'dealing' อยู่แล้วตั้งแต่ initial state)
  useEffect(() => {
    if (phase === 'dealing') {
      const t = setTimeout(() => startDealAnimation(), 300)
      return () => clearTimeout(t)
    }
  }, [phase, dealTrigger])

  // ── Card swap
  const handleCardPress = useCallback((pi: number, ci: number) => {
    if (isReady || phase !== 'arrangement') return
    // SFX: ใบแรก (เลือก) = arrange1, ใบที่สอง (สลับสำเร็จ) = arrange2 — มติลุงเยาะ 2026-08-15 รอบ 2
    if (!selected) { setSelected({ pi, ci }); playCardArrange1(); return }
    if (selected.pi === pi && selected.ci === ci) { setSelected(null); return }
    const np = piles.map(p => [...p]) as [CardData[], CardData[], CardData[]]
    const tmp = np[selected.pi][selected.ci]
    np[selected.pi][selected.ci] = np[pi][ci]
    np[pi][ci] = tmp
    setPiles(np); setSelected(null); setSortDone(false)
    playCardArrange2()
  }, [isReady, phase, selected, piles])

  // Auto Sort (Adept เสีย fee ทุกครั้ง ไม่มีรอบฟรี - มติลุงเยาะ 2026-07-25)
  // Server-authoritative: ต้องขออนุญาต + ให้ server หัก fee เข้า Fee & Rake ก่อน ถึงจะจัดไพ่ให้จริง
  // (ห้ามจัดไพ่ก่อนแล้วค่อยแจ้ง server ไม่งั้นผู้เล่นได้ของฟรีเมื่อ request ล้มเหลว)
  const handleAutoSort = () => {
    if (!comm.p1[0] || sortDone || phase !== 'arrangement') return
    playAutoSortButton() // SFX: กดปุ่ม AUTO SORT

    // ใช้ updater form เพื่ออ่านไพ่ล่าสุด เผื่อผู้เล่นสลับไพ่ระหว่างรอ ack จาก server
    const applySort = () => {
      setPiles(cur => autoSort([...cur[0], ...cur[1], ...cur[2]], {
        pile1: [comm.p1[0], comm.p1[1]] as [string, string],
        pile2: [comm.p2[0], comm.p2[1]] as [string, string],
        pile3: [comm.p3[0], comm.p3[1]] as [string, string],
      }))
      setSelected(null); setSortDone(true)
    }

    // จ่ายค่าธรรมเนียมของรอบนี้ไปแล้ว (กดแล้วสลับไพ่เอง แล้วกดใหม่) -> จัดให้เลย ไม่เรียกเก็บซ้ำ
    // ตรงกับฝั่ง server ที่ตอบ ALREADY_USED และไม่หักเงินอีก
    if (autoSortPaid) { applySort(); return }

    const sock = socketRef.current
    if (!sock) return

    sock.once('auto_sort_ack', (res: { ok: boolean; reason?: string }) => {
      if (!res?.ok) {
        Alert.alert(
          'Auto Sort unavailable',
          res?.reason === 'INSUFFICIENT_TOKENS'
            ? `You need ${autoSortFee} tokens to use Auto Sort.`
            : 'Auto Sort is not available right now.',
        )
        return
      }
      setAutoSortPaid(true)
      applySort()
    })
    sock.emit('auto_sort_request', { roomId: ROOM_ID, userId: PLAYER_ID })
  }

  const handleReady = () => {
    if (isReady || phase !== 'arrangement') return
    playReadyButton() // SFX: กดปุ่ม READY
    // Auto-select ใบที่ 4,5 (index 3,4) เป็น discard เพราะ autoSort เรียงไว้แล้ว
    setShowDiscard(true); setDiscardSelected([3, 4])
  }

  const handleDiscardConfirm = () => {
    if (discardSelected.length !== 2) return
    playReadyButton()
    setShowDiscard(false); setIsReady(true)
    if (timerRef.current) clearInterval(timerRef.current)
    const pile3kept = piles[2].filter((_, i) => !discardSelected.includes(i))
    socketRef.current?.emit('player_ready_multi', {
      roomId: ROOM_ID, userId: PLAYER_ID,
      arrangement: {
        pile1: piles[0].map(c => c.key),
        pile2: piles[1].map(c => c.key),
        pile3: pile3kept.map(c => c.key),
      },
    })
  }

  const toggleDiscard = (idx: number) => {
    playCardArrange1()
    setDiscardSelected(prev => {
      if (prev.includes(idx)) return prev.filter(i => i !== idx)
      if (prev.length >= 2) return prev
      return [...prev, idx]
    })
  }

  // ── Continue → emit player_continue รอ server
  const handleContinue = () => {
    if (continueTimerRef.current) clearInterval(continueTimerRef.current)
    blinkAnim.stopAnimation(); blinkAnim.setValue(1)
    btnBlinkAnim.stopAnimation(); btnBlinkAnim.setValue(1)
    setShowResult(false)
    // Fade out ไพ่ทุกใบก่อน emit continue (stop ก่อนเสมอ กัน timing ค้างจากรอบก่อน)
    fadeCards.stopAnimation()
    Animated.timing(fadeCards, {
      toValue: 0, duration: 600, useNativeDriver: false,
    }).start(() => {
      socketRef.current?.emit('player_continue', { roomId: ROOM_ID, playerId: PLAYER_ID })
    })
  }

  // auto continue ย้ายไปทำใน startContinueCountdown interval แทน (เลี่ยง re-render)

  // หยุด win-pulse/win-opacity loop + confetti recursion ทั้งหมด ก่อน unmount MATCH END OVERLAY เสมอ
  // (Animated.loop และ confetti recursion ไม่มีวันจบเอง ถ้าไม่ stop จะไปชน native attach ตอน mount รอบถัดไป)
  const stopMatchEndAnimations = () => {
    if (winPulseLoopRef.current) winPulseLoopRef.current.stop()
    if (winOpacityLoopRef.current) winOpacityLoopRef.current.stop()
    confettiActiveRef.current = false
    confettiCompositesRef.current.forEach(a => a.stop())
    confettiCompositesRef.current = []
  }

  const handleBackToLobby = () => {
    stopMatchEndAnimations()
    if (matchResult?.finalWinner === PLAYER_ID) {
      const tokensWon = (tokenBalance[PLAYER_ID] ?? 0) - (matchResult.buyInAmount ?? buyInAmount)
      router.replace({
        pathname: '/(home)/victory',
        params: {
          tier: 'adept',
          tokensWon: String(tokensWon),
          matchDurationSec: String(Math.max(0, Math.round((Date.now() - matchStartRef.current) / 1000))),
          ...(matchResult.bestHandThisMatch?.label ? { bestHandLabel: matchResult.bestHandThisMatch.label } : {}),
        },
      } as any)
    } else {
      router.push('/lobby')
    }
  }

  // ── Sub-components
  const CardBack: React.FC<{ w: number; h: number; ml?: number }> = ({ w, h, ml = 0 }) => (
    <View style={[s.cardBack, { width: w, height: h, borderRadius: w * 0.14, marginLeft: ml }]}>
      <Image source={cardBackImg} style={{ width: w, height: h }} resizeMode="cover" />
    </View>
  )

  // Patch 2026-07-18: รองรับ preset แบบรูปภาพ (avatar_vip_01-09) — เดิมรับแต่ emoji (pattern Initiate)
  const AvatarBubble: React.FC<{ emoji: string; size?: number; image?: any }> = ({ emoji, size = 36, image }) => (
    <View style={[s.avatarBubble, { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }]}>
      {image
        ? <Image source={image} style={{ width: size, height: size }} resizeMode="cover" />
        : <Text style={{ fontSize: size * 0.45 }}>{emoji}</Text>}
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

  // (AIPiles เดิมถูกแทนที่ด้วย BossHandRow กลางแล้ว — ดู src/components/game/BossHandRow.tsx)

  const SideSeat: React.FC<{ rot: '270deg' | '90deg'; aiId: string }> = ({ rot, aiId }) => {
    const p1 = allCards[aiId]?.[1] ?? []; const p2 = allCards[aiId]?.[2] ?? []; const p3 = allCards[aiId]?.[3] ?? []
    const cards = [...p1, ...p2, ...p3]
    return (
      <View style={s.sideSeatWrap}>
        <View style={[s.sideSeatInner, { transform: [{ rotate: rot }] }]}>
          {([5, 3, 3] as number[]).map((cnt, pi) => (
            <React.Fragment key={pi}>
              {pi > 0 && <View style={{ width: 4 }} />}
              <View style={{ flexDirection: 'row' }}>
                {Array.from({ length: cnt }).map((_, ci) => {
                  const idx = pi === 0 ? ci : pi === 1 ? 3 + ci : 6 + ci
                  const cardKey = cards[idx]
                  return renderCard(cardKey, 25, 36, ci === 0 ? 0 : -18, `${aiId}-${pi}-${ci}-${cardKey ?? 'back'}`)
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
    const hasWinner = winner && winCards.length > 0

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

  // ContinueTimer — แยก component ไม่ให้ ScrollView re-render
  const ContinueTimer: React.FC<{
    valRef: React.MutableRefObject<number>
    onContinue: () => void
  }> = ({ valRef, onContinue }) => {
    const [val, setVal] = useState(valRef.current)
    useEffect(() => {
      const id = setInterval(() => setVal(valRef.current), 500)
      return () => clearInterval(id)
    }, [])
    const color = val <= 5 ? '#f87171' : '#FFD76A'
    return (
      <TouchableOpacity style={[s.continueBtn, {
        borderColor: color, backgroundColor: '#102218', width: '100%', alignItems: 'center'
      }]} onPress={onContinue}>
        <Text style={[s.continueBtnTxt, { color, fontSize: 14 }]}>
          CONTINUE {val > 0 && val <= 15 ? `(${val}s)` : ''}
        </Text>
      </TouchableOpacity>
    )
  }

  // Showdown Result — Tab 3 Pile + Token Summary + Continue
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
    const rake       = isWin ? Math.round(raw * 0.05) : 0
    const netToken   = isWin ? raw - rake : raw
    const isTriple   = pileWinners[1] === PLAYER_ID && pileWinners[2] === PLAYER_ID && pileWinners[3] === PLAYER_ID
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
                const rake  = isWin ? Math.round(raw * 0.05) : 0
                const net   = isWin ? raw - rake : raw
                const isTriple = pileWinners[1] === PLAYER_ID && pileWinners[2] === PLAYER_ID && pileWinners[3] === PLAYER_ID
                return (
                  <>
                    {[1,2,3].map(n => {
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
                    {raw > 0 && <Text style={{ fontSize: 11, color: '#FFB74D' }}>Rake -5%</Text>}
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

  // Bug B fix: bossAI/p2AI/p4AI = 3 ตำแหน่งภาพบนโต๊ะ (บน/ซ้าย/ขวา) ไม่ใช่ "Boss" จริงแบบ Mastermind/
  // HighNoble — Adept ไม่มี Boss concept ชื่อตัวแปรสืบมาจาก template เดิมเฉยๆ ค่าคือ 3 คู่แข่งที่เหลือ
  // เรียงตาม seat index จริงในห้อง (aiList = data.seats กรองตัวเองออก) ใครจะอยู่ตำแหน่งไหนไม่คงที่ —
  // LobbyMatchmaking_Spec_v1_1: ห้อง Adept public เติม Human จากหัว (seat 0→1→2) ไม่ fix Sage ไว้ seat 0
  // อีกต่อไปแล้ว (private room ยังคง Sage seat 0 เสมอ — ดู buildAdeptPrivateInitialSeats ฝั่ง server)
  const bossAI = aiList[0]; const p2AI = aiList[1]; const p4AI = aiList[2]
  // Symptom B fix: ตำแหน่งไหนก็ตามอาจเป็น Human จริง (ไม่ใช่แค่ P3) — resolve avatarUrl ผ่าน
  // PRESET_AVATARS แบบเดียวกับ avatar ตัวเอง (myAvatarEmoji/myAvatarImage ด้านบน) ก่อน ถ้า resolve ไม่ได้
  // (เป็น AI ที่มี seat.emoji อยู่แล้ว หรือ preset key ที่ไม่รู้จัก) fallback ไปที่ emoji/text เดิมเป๊ะ
  const resolveOpponentAvatar = (info: AIInfo | undefined, fallbackEmoji: string): { emoji: string; image?: any } => {
    const preset = info?.avatarUrl ? PRESET_AVATARS.find(p => p.key === info.avatarUrl) : undefined
    if (preset) return { emoji: preset.emoji ?? (preset.image ? '' : info!.avatarUrl!), image: preset.image }
    const minionImage = info?.name ? MINION_AVATAR[info.name] : undefined
    if (minionImage) return { emoji: '', image: minionImage }
    return { emoji: info?.emoji ?? fallbackEmoji }
  }
  const bossAvatar = resolveOpponentAvatar(bossAI, '🤖')
  const p2Avatar = resolveOpponentAvatar(p2AI, '👤')
  const p4Avatar = resolveOpponentAvatar(p4AI, '👤')
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

          <View style={StyleSheet.absoluteFill as any} pointerEvents="none"><Image source={selectedTableImg} style={{ width: '100%', height: '100%' }} resizeMode="cover" /></View>
          <View style={[StyleSheet.absoluteFill as any, s.logoWatermark]} pointerEvents="none">
            <Image source={tripleSpade} style={{ width: 120, height: 120, opacity: 0.07 }} resizeMode="contain" />
          </View>

          {/* ── DEAL ANIMATION ── */}
          {/* ค้าง mount ไว้เสมอ toggle แค่ opacity — เหตุผลเดียวกับ COUNTDOWN OVERLAY ด้านล่าง:
              dealAnims ใช้ native driver ถ้า unmount ระหว่าง animation เล่นอยู่จะชน native attach */}
          <View style={[StyleSheet.absoluteFill as any, { alignItems: 'center', justifyContent: 'center', zIndex: 50, opacity: phase === 'dealing' ? 1 : 0 }]} pointerEvents="none">
              {dealAnims.map((a, i) => (
                <Animated.View key={i} style={{
                  position: 'absolute',
                  width: 25, height: 36, borderRadius: 6,
                  backgroundColor: '#091808',
                  borderWidth: 1, borderColor: 'rgba(201,168,76,.5)',
                  overflow: 'hidden',
                  opacity: a.opacity,
                  transform: [{ translateX: a.x }, { translateY: a.y }, { scale: a.scale }],
                }}>
                  <Image source={cardBackImg} style={{ width: 25, height: 36 }} resizeMode="cover" />
                </Animated.View>
              ))}
              <Text style={{ color: 'rgba(201,168,76,0.4)', fontSize: 10, letterSpacing: 2, marginTop: 80 }}>DEALING...</Text>
              {connectionError && (
                <View style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: 'rgba(255,107,107,0.15)', borderWidth: 1, borderColor: 'rgba(255,107,107,0.4)', borderRadius: 10 }}>
                  <Text style={{ color: '#FF6B6B', fontSize: 11, textAlign: 'center' }}>Connection failed. Please check your network and try again.</Text>
                </View>
              )}
              {/* A5 — Bug A fix: เน็ตหลุด กำลังต่อใหม่อัตโนมัติ */}
              {isReconnecting && (
                <View style={{ position: 'absolute', top: 12, alignSelf: 'center', zIndex: 999, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: 'rgba(255,199,87,0.15)', borderWidth: 1, borderColor: 'rgba(255,199,87,0.5)', borderRadius: 10 }}>
                  <Text style={{ color: '#FFC857', fontSize: 12, fontWeight: '700', textAlign: 'center' }}>Reconnecting...</Text>
                </View>
              )}
              {/* A5 — Bug A fix: อีกคนหลุด/AI เล่นแทน แจ้งเตือนสั้นๆ */}
              {afkNotice && (
                <View style={{ position: 'absolute', top: 12, alignSelf: 'center', zIndex: 999, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: 'rgba(15,36,24,0.85)', borderWidth: 1, borderColor: 'rgba(255,215,106,0.5)', borderRadius: 10 }}>
                  <Text style={{ color: '#F5F2E8', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{afkNotice}</Text>
                </View>
              )}
              {/* Boss AI — แสดงจำนวนไพ่ที่ได้รับ */}
              {[0,1,2,3].map(playerIdx => {
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
          {showDiscard && (
            <View style={s.overlay}>
              <Text style={s.discardTitle}>Choose 2 cards to discard from Pile 3</Text>
              <Text style={s.discardSub}>({discardSelected.length}/2 cards selected)</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
                {piles[2].map((card, idx) => {
                  const isSel = discardSelected.includes(idx)
                  return (
                    <TouchableOpacity key={card.id} onPress={() => toggleDiscard(idx)} activeOpacity={0.8}
                      style={[s.discardCard, isSel && s.discardCardSel]}>
                      {CARD_IMG[card.key] && <Image source={CARD_IMG[card.key]} style={{ width: 56, height: 80 }} resizeMode="cover" />}
                      {isSel && <View style={s.discardX}><Text style={s.discardXTxt}>✕</Text></View>}
                    </TouchableOpacity>
                  )
                })}
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={[s.discardBtn, { backgroundColor: '#1a3a1a' }]} onPress={() => setShowDiscard(false)}>
                  <Text style={s.discardBtnTxt}>← Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.discardBtn, { backgroundColor: discardSelected.length === 2 ? '#1a5e20' : '#2a2a2a' }]}
                  onPress={handleDiscardConfirm} disabled={discardSelected.length !== 2}>
                  <Text style={s.discardBtnTxt} numberOfLines={1}>Confirm discard ✓</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── COUNTDOWN OVERLAY ── */}
          {/* ค้าง mount ไว้เสมอ toggle แค่ opacity — ห้ามใช้ && unmount ตรงนี้ เพราะ countAnim ใช้ native driver
              ถ้า unmount ระหว่าง animation กำลังเล่นอยู่จะชน native attach (Animated node already attached to a view) */}
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
                <View style={[StyleSheet.absoluteFill, { zIndex: 200 }]} pointerEvents="none">
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
                buyInAmount={matchResult.buyInAmount ?? buyInAmount}
                returnedAmount={tokenBalance[PLAYER_ID] ?? 0}
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
                onBackToLobby={handleBackToLobby}
                insetsBottom={insets.bottom}
              />
            </>
          )}

          {/* ── TRIPLE SWEEP — Legendary สำหรับ P1, VFX เดิมสำหรับผู้เล่นอื่น ── */}
          {jackpotWinner && (() => {
            const isMe = jackpotWinner === PLAYER_ID
            const winAI = aiList.find(a => a.id === jackpotWinner)
            const label = isMe ? myDisplayName : (winAI?.name ?? jackpotWinner)
            if (isMe) return (
              <LegendaryCardVFX
                title="TRIPLE SWEEP JACKPOT"
                subtitle={`${label} WON ALL 3 PILES`}
                onFinish={() => setJackpotWinner(null)}
              />
            )
            const emoji = winAI?.emoji ?? '🤖'
            return (
              <View style={[s.overlay, { backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 300 }]} pointerEvents="none">
                {jackpotConfettiAnims.map((a, i) => {
                  const colors = ['#FFD76A', '#FFC857', '#8DFFB5', '#ff6b6b', '#4d96ff', '#cc5de8']
                  const rotStr = a.rotate.interpolate({ inputRange: [0, 720], outputRange: ['0deg', '720deg'] })
                  return <Animated.View key={i} style={{
                    position: 'absolute', width: 8, height: 8, borderRadius: 2,
                    backgroundColor: colors[i % colors.length], zIndex: 301,
                    transform: [{ translateX: a.x }, { translateY: a.y }, { rotate: rotStr }], opacity: a.opacity,
                  }} />
                })}
                <Animated.Text style={{
                  transform: [{ scale: jackpotPulse }], fontSize: 26, fontWeight: '900', color: '#FFD76A',
                  letterSpacing: 1, textShadowColor: '#ffd700', textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 20, textAlign: 'center',
                }}>⚡ TRIPLE SWEEP JACKPOT! ⚡</Animated.Text>
                <Text style={{ marginTop: 10, fontSize: 16, color: '#8DFFB5', fontWeight: '800' }}>
                  {emoji} {label} won all 3 piles!
                </Text>
              </View>
            )
          })()}

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

          {/* TOP BAR */}
          <GameTopBar
            tierName="ADEPT"
            tierStars={3}
            round={roundNumber}
            isWeb={isWeb}
            insetsTop={insets.top}
            opacity={(phase === 'showdown' || phase === 'result') ? 0 : 1}
            /* STACK badge ถูกตัดออกตามมติลุงเยาะ 2026-07-25 (ยึด layout ของ Initiate เป็นต้นแบบ) -
               ยอดของตัวเองมีใต้ชื่อที่นั่งอยู่แล้ว และ Token Flow Panel มีแถว 4P รวมให้อีกชั้น
               Timer + ปุ่ม i ย้ายมา leftSlot เพื่อเปิดพื้นที่มุมขวาบนทั้งแถบให้ Panel */
            leftSlot={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <TouchableOpacity
                  onPress={() => { setShowTierInfo(true); setActiveTierTab('ADEPT') }}
                  style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(180,0,0,0.3)', borderWidth: 1.5, borderColor: '#ff3333', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 11, color: '#ff3333', fontWeight: '900' }}>i</Text>
                </TouchableOpacity>
                <TimerDisplay valRef={timerValRef} />
              </View>
            }
          />

          {/* TOKEN FLOW PANEL - ค้างตลอดเกม (Spec ข้อ 2) ซ่อนเฉพาะตอนจบเกมที่มีจอสรุปทับ */}
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

          {burnToast && (
            <View style={s.burnToast} pointerEvents="none">
              <Text style={s.burnToastText}>{burnToast}</Text>
            </View>
          )}

          {/* AI SEAT + MAIN + USER — fade เมื่อ continue, ซ่อนระหว่าง dealing
              ห้ามสลับ opacity ระหว่าง literal 0 กับ fadeCards node ตรงนี้ (native driver
              จะ attach/detach node ทุกครั้งที่สลับ) — bind ค้างไว้กับ fadeCards node เสมอ
              แล้วให้ startDealAnimation/round_start เป็นคน drive ค่า fadeCards เองแทน */}
          <Animated.View style={{ flex: 1, opacity: fadeCards }}>
          <View style={[s.aiSeat, { opacity: (phase === 'countdown' || phase === 'showdown' || phase === 'result') ? 0 : 1 }]}>
            <View style={s.aiRow}>
              {/* translateX -50 เดิมถูกลบแล้ว - aiSeat เป็น flex-end ทั้งบล็อกจัดตำแหน่งพร้อมกันอยู่แล้ว */}
              <View>{bossAI?.isVip
                ? <AvatarFrame size={36}><AvatarBubble emoji={bossAvatar.emoji} image={bossAvatar.image} size={36} /></AvatarFrame>
                : <AvatarBubble emoji={bossAvatar.emoji} image={bossAvatar.image} size={36} />}
              </View>
              <View>
                <Text style={s.aiName}>{bossAI?.name ?? 'BOSS AI'}</Text>
                <Text style={s.seatToken}>🪙 {fmtToken(tokenBalance[bossAI?.id ?? ''])}</Text>
              </View>
              <View style={s.statusBadge}>
                <AiStatusDots label={aiStatus[bossAI?.id ?? ''] ?? 'Arranging'} />
              </View>
            </View>
            {bossAI && <View style={{ marginTop: -10 /* Patch 2026-07-18: ยกไพ่บอสขึ้น 10px */ }}>
              <BossHandRow revealed={[
                ...(allCards[bossAI.id]?.[1] ?? []),
                ...(allCards[bossAI.id]?.[2] ?? []),
                ...(allCards[bossAI.id]?.[3] ?? []),
              ]} />
            </View>}
          </View>

          {/* MAIN AREA */}
          <View style={[s.mainArea, { opacity: (phase === 'countdown' || phase === 'showdown' || phase === 'result') ? 0 : 1 }]}>
            <View style={[s.sideCol, { paddingLeft: 10 }]}>
              <Text style={s.sideName}>{p2AI?.name ?? 'P2'}</Text>
              <Text style={s.seatToken}>🪙 {fmtToken(tokenBalance[p2AI?.id ?? ''])}</Text>
              <View style={{ marginTop: -6, marginBottom: 60 }}>
                {p2AI?.isVip
                  ? <AvatarFrame size={36}><AvatarBubble emoji={p2Avatar.emoji} image={p2Avatar.image} size={36} /></AvatarFrame>
                  : <AvatarBubble emoji={p2Avatar.emoji} image={p2Avatar.image} size={36} />}
              </View>
              {p2AI && <SideSeat rot="270deg" aiId={p2AI.id} />}
            </View>

            <View style={s.commWrap}>
              {/* Pile 1 & 2 แถวเดียวกัน */}
              <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4, marginLeft: 0 /* Patch 2026-07-18: เดิม -25 → ขยับขวา 25px (pattern Initiate) */ }}>
                <CommRow pileNum={1} k1={comm.p1[0]} k2={comm.p1[1]} />
                <CommRow pileNum={2} k1={comm.p2[0]} k2={comm.p2[1]} />
              </View>
              {/* Pile 3 แถวล่าง — กึ่งกลางระหว่าง Pile 1 และ Pile 2 */}
              <View style={{ alignSelf: 'center' }}>
                <CommRow pileNum={3} k1={comm.p3[0]} k2={comm.p3[1]} />
              </View>
            </View>

            <View style={[s.sideCol, { paddingRight: 10 }]}>
              <Text style={s.sideName}>{p4AI?.name ?? 'P4'}</Text>
              <Text style={s.seatToken}>🪙 {fmtToken(tokenBalance[p4AI?.id ?? ''])}</Text>
              <View style={{ marginTop: -6, marginBottom: 60 }}>
                {p4AI?.isVip
                  ? <AvatarFrame size={36}><AvatarBubble emoji={p4Avatar.emoji} image={p4Avatar.image} size={36} /></AvatarFrame>
                  : <AvatarBubble emoji={p4Avatar.emoji} image={p4Avatar.image} size={36} />}
              </View>
              {p4AI && (
                <View style={{ marginLeft: 15 }}>
                  <SideSeat rot="90deg" aiId={p4AI.id} />
                </View>
              )}
            </View>
          </View>

          {/* USER AREA */}
          <View style={[s.userArea, { opacity: (phase === 'countdown' || phase === 'showdown' || phase === 'result') ? 0 : 1 }]}>
            <Text style={[s.swapHint, { opacity: selected ? 1 : 0 }]}>Tap the cards you want to swap</Text>
            {hasFoul[PLAYER_ID] && <Text style={s.foulText}>⚠️ FOUL{foulReasons[PLAYER_ID] ? ` — ${foulReasons[PLAYER_ID]}` : ''}</Text>}


            {isRevealed ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 20 /* Patch 2026-07-18: เลื่อนไพ่ในมือลง 20px */ }}>
                {[1, 2, 3].flatMap(pNum => userRevealed[pNum] ?? []).map((key, ci) => (
                  <View key={ci} style={[s.userCard, { zIndex: ci }]}>
                    {CARD_IMG[key] && <Image source={CARD_IMG[key]} style={{ width: CW, height: CH }} resizeMode="cover" />}
                  </View>
                ))}
              </View>
            ) : (
              // โซนจัดไพ่ในมือ — PlayerHandView กลาง (Free: overlap แถวตรง / VIP: fan arc)
              <View style={{ width: '100%', marginTop: 20, alignItems: 'center' }}>
                <PlayerHandView
                  piles={piles}
                  selected={selected}
                  onCardPress={handleCardPress}
                  isVip={isVip}
                />
              </View>
            )}
          </View>

          </Animated.View>
          {/* USER AVATAR — มุมล่างซ้าย — Feedback C2: ใช้ myAvatarEmoji/myDisplayName จริงแทน hardcode */}
          {/* P1 HUD ย้ายลงชิดขอบล่าง — pointerEvents none เพื่อไม่บังปุ่ม actionBar */}
          <View style={{ position: 'absolute', bottom: Math.max(insets.bottom, 4), left: 10, zIndex: 3, opacity: (phase === 'showdown' || phase === 'result') ? 0 : 1, flexDirection: 'row', alignItems: 'center', gap: 6 }} pointerEvents="none">
            {/* Gold Radiance - Adept ไม่มี turn state จริง (arrangement/showdown เป็น simultaneous)
                จึงเป็นกรอบนิ่งอย่างเดียว ไม่มี Active Turn Pulse ตามมติลุงเยาะ 2026-07-25 */}
            {isVip
              ? <AvatarFrame size={40}><AvatarBubble emoji={myAvatarEmoji} image={myAvatarImage} size={40} /></AvatarFrame>
              : <AvatarBubble emoji={myAvatarEmoji} image={myAvatarImage} size={40} />}
            <View>
              <Text style={s.userNameTag} numberOfLines={1}>{myDisplayName}</Text>
              {/* Patch 2026-07-18: ยอดโทเคนคงเหลือใต้ชื่อ (pattern Initiate) */}
              <Text style={s.seatToken}>🪙 {fmtToken(tokenBalance[PLAYER_ID])}</Text>
            </View>
          </View>

          {/* ACTION BAR */}
          {phase !== 'dealing' && phase !== 'showdown' && phase !== 'result' && <View style={s.actionBar}>
            <ActionButton
              icon="auto_sort"
              label={sortDone ? 'Sorted ✓' : 'Auto Sort'}
              /* Spec ข้อ 8: token ไม่พอจ่าย fee -> ปุ่ม disabled ไปเลย ผู้เล่นต้องจัดเอง
                 (server ก็ปฏิเสธซ้ำอีกชั้นใน requestAutoSort - ไม่เชื่อ client ฝ่ายเดียว) */
              variant={(sortDone || (!autoSortPaid && (tokenBalance[PLAYER_ID] ?? 0) < autoSortFee)) ? 'disabled' : 'normal'}
              disabled={sortDone || phase !== 'arrangement' || (!autoSortPaid && (tokenBalance[PLAYER_ID] ?? 0) < autoSortFee)}
              costBadge={autoSortPaid ? 'PAID' : String(autoSortFee)}
              onPress={handleAutoSort}
              style={s.actionBtnSize}
            />
            <ActionButton
              icon="ready"
              label="Ready"
              variant={isReady ? 'waiting' : 'normal'}
              disabled={isReady || phase !== 'arrangement'}
              onPress={handleReady}
              style={s.actionBtnSize}
            />
          </View>}

        </View>
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
  timerText:  { fontSize: 20, fontWeight: '700', minWidth: 48, textAlign: 'right' },
  tbarWrap:   { paddingHorizontal: 12, paddingBottom: 2, zIndex: 2 },
  tbarBg:     { height: 3, backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 2, overflow: 'hidden' },
  tbarFill:   { height: '100%' as any, borderRadius: 2 },

  // จัดบล็อกที่นั่งบนสุดชิดขวา เว้น paddingRight เท่าพื้นที่ที่ Token Flow Panel กินไปพอดี
  // ผลคือขอบขวาของกรอบไพ่ไปชนขอบซ้ายของ Panel เป๊ะทุกขนาดจอ (ต้นแบบจาก Initiate)
  aiSeat:       { paddingLeft: 12, paddingRight: PANEL_WIDTH + PANEL_RIGHT, paddingVertical: 4, alignItems: 'flex-end', gap: 4, zIndex: 2 },

  // Token Flow Panel - toast แจ้ง burn ตอนจบเกม (Spec ข้อ 9)
  burnToast:     { position: 'absolute', top: '42%', alignSelf: 'center', zIndex: 400, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#3A5A44', backgroundColor: 'rgba(15,36,24,0.94)' },
  burnToastText: { fontSize: 11, color: '#FFD76A', fontFamily: 'JetBrainsMono_600SemiBold', letterSpacing: 0.5 },
  aiRow:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatarBubble: { backgroundColor: '#132019', borderWidth: 2, borderColor: '#c9a84c', alignItems: 'center', justifyContent: 'center', shadowColor: '#c9a84c', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 },
  aiName:       { fontSize: 9, color: '#ff3333', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '800' },
  statusBadge:  { borderWidth: 1, borderColor: 'rgba(74,154,90,.2)', backgroundColor: 'rgba(74,154,90,.1)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  statusText:   { fontSize: 7, color: '#4a9a5a' },
  cardBack:     { backgroundColor: '#091808', borderWidth: 1, borderColor: 'rgba(201,168,76,.5)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },

  mainArea:      { flex: 1, flexDirection: 'row', zIndex: 2 },
  sideCol:       { width: SIDE_COL_W, alignItems: 'center', paddingTop: 0, gap: 2 },
  sideName:      { fontSize: 9, color: '#ffffff', letterSpacing: 1, fontWeight: '700' },
  userNameTag:   { fontSize: 10, color: '#ffffff', letterSpacing: 1, fontWeight: '800', maxWidth: 100, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  // Patch 2026-07-18: ยอดโทเคนคงเหลือใต้ชื่อทุกที่นั่ง — ทองธีมหลัก, JetBrains Mono ตามมาตรฐานตัวเลข
  seatToken:     { fontSize: 9, color: '#FFD76A', fontFamily: 'JetBrainsMono_600SemiBold', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  sideSeatWrap:  { flex: 1, width: SIDE_COL_W, overflow: 'visible', justifyContent: 'flex-start', alignItems: 'center' },
  sideSeatInner: { flexDirection: 'row', alignItems: 'center' },

  commWrap:    { flex: 1, paddingLeft: 4, paddingRight: 18, alignItems: 'flex-start', justifyContent: 'center', marginTop: 40 /* Patch 2026-07-18: เลื่อนกองกลางทั้ง 3 กองลง 40px — ใช้พื้นที่ว่างกลางจอ */, zIndex: 2 },
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
