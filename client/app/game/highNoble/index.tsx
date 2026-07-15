/**
 * index.tsx — High Noble Multiplayer (3 real Human + Four Gods Boss)
 * Patch Multiplayer: เชื่อมกับ highNobleMultiEngine.ts ฝั่ง server ผ่าน room registry
 * (roomId/userId มาจาก route param — matchmaking เกิดที่ lobby.tsx ก่อนเข้าหน้านี้)
 * The Sage Unicorn Studio Co., Ltd.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert, Animated, Image, ImageBackground, PanResponder, Platform, ScrollView, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { io, Socket } from 'socket.io-client'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuthStore } from '../../../src/store/authStore'
import { useUserStore } from '../../../src/store/userStore'
import { autoSort } from '../../../src/utils/autoSort'
import PreGameCountdown from '../../../src/components/PreGameCountdown'
import { MINION_AVATAR } from '../../../src/constants/minionAvatars'
import { ActionButton } from '../../../src/components/ui/ActionButton'
import { MenuButton } from '../../../src/components/ui/MenuButton'
import { ResultPanel } from '../../../src/components/ui/ResultPanel'
import { glassPanelDense } from '../../../src/ui/glassStyles'

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
  // Monarch Spec v1.3: บอสลับ — ผู้เล่นเห็นแค่ชื่อ "Monarch" ไม่รู้ว่าสวมบุคลิกจตุรเทพใด (ล็อคไว้ฝั่ง server)
  'Monarch': {
    image: require('../../../assets/bosses/boss_Monarch.png'),
    quotes: [
      "My mask is the hand I am dealt.",
    ],
  },
}
// Patch High Noble: รูป Avatar จตุรเทพ (square crop หน้าชิด ใช้กับ AvatarBubble ของ P3 เท่านั้น)
const BOSS_AVATAR: Record<string, any> = {
  'Reaper':   require('../../../assets/bosses/boss_reaper_avatar.png'),
  'The Crag': require('../../../assets/bosses/boss_crag_avatar.png'),
  'Cortex':   require('../../../assets/bosses/boss_cortex_avatar.png'),
  'Cipher':   require('../../../assets/bosses/boss_cipher_avatar.png'),
  'Monarch':  require('../../../assets/bosses/boss_Monarch_avatar.png'),
}
const cardBackImg = require('../../../assets/images/card_back_default.png')
const tableImg    = require('../../../assets/images/table_default.png')
const tripleSpade = require('../../../assets/images/triple_poker_icon.png')

// ── Card image map
const CARD_IMG: Record<string, any> = {
  as: require('../../../assets/cards/classic/as.png'),
  '2s': require('../../../assets/cards/classic/2s.png'), '3s': require('../../../assets/cards/classic/3s.png'),
  '4s': require('../../../assets/cards/classic/4s.png'), '5s': require('../../../assets/cards/classic/5s.png'),
  '6s': require('../../../assets/cards/classic/6s.png'), '7s': require('../../../assets/cards/classic/7s.png'),
  '8s': require('../../../assets/cards/classic/8s.png'), '9s': require('../../../assets/cards/classic/9s.png'),
  '10s': require('../../../assets/cards/classic/10s.png'), js: require('../../../assets/cards/classic/js.png'),
  qs: require('../../../assets/cards/classic/qs.png'), ks: require('../../../assets/cards/classic/ks.png'),
  ah: require('../../../assets/cards/classic/ah.png'), '2h': require('../../../assets/cards/classic/2h.png'),
  '3h': require('../../../assets/cards/classic/3h.png'), '4h': require('../../../assets/cards/classic/4h.png'),
  '5h': require('../../../assets/cards/classic/5h.png'), '6h': require('../../../assets/cards/classic/6h.png'),
  '7h': require('../../../assets/cards/classic/7h.png'), '8h': require('../../../assets/cards/classic/8h.png'),
  '9h': require('../../../assets/cards/classic/9h.png'), '10h': require('../../../assets/cards/classic/10h.png'),
  jh: require('../../../assets/cards/classic/jh.png'), qh: require('../../../assets/cards/classic/qh.png'),
  kh: require('../../../assets/cards/classic/kh.png'), ad: require('../../../assets/cards/classic/ad.png'),
  '2d': require('../../../assets/cards/classic/2d.png'), '3d': require('../../../assets/cards/classic/3d.png'),
  '4d': require('../../../assets/cards/classic/4d.png'), '5d': require('../../../assets/cards/classic/5d.png'),
  '6d': require('../../../assets/cards/classic/6d.png'), '7d': require('../../../assets/cards/classic/7d.png'),
  '8d': require('../../../assets/cards/classic/8d.png'), '9d': require('../../../assets/cards/classic/9d.png'),
  '10d': require('../../../assets/cards/classic/10d.png'), jd: require('../../../assets/cards/classic/jd.png'),
  qd: require('../../../assets/cards/classic/qd.png'), kd: require('../../../assets/cards/classic/kd.png'),
  ac: require('../../../assets/cards/classic/ac.png'), '2c': require('../../../assets/cards/classic/2c.png'),
  '3c': require('../../../assets/cards/classic/3c.png'), '4c': require('../../../assets/cards/classic/4c.png'),
  '5c': require('../../../assets/cards/classic/5c.png'), '6c': require('../../../assets/cards/classic/6c.png'),
  '7c': require('../../../assets/cards/classic/7c.png'), '8c': require('../../../assets/cards/classic/8c.png'),
  '9c': require('../../../assets/cards/classic/9c.png'), '10c': require('../../../assets/cards/classic/10c.png'),
  jc: require('../../../assets/cards/classic/jc.png'), qc: require('../../../assets/cards/classic/qc.png'),
  kc: require('../../../assets/cards/classic/kc.png'),
}

const CW = 62; const CH = 90; const OVERLAP = -38
const SIDE_COL_W = 72
const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'
// Escrow (ที่หักตอน matchmaking เต็มห้อง) ผูกกับ user_id จริงใน DB — ห้าม fallback เงียบเป็น literal เด็ดขาด
// เปิดทางเทสเร็วไม่ login ได้เฉพาะ __DEV__ + ตั้ง env EXPO_PUBLIC_DEV_FAKE_USER_ID เอง — production build ตัดทิ้งอัตโนมัติ
const DEV_FAKE_USER_ID = __DEV__ ? process.env.EXPO_PUBLIC_DEV_FAKE_USER_ID : undefined

interface CardData { id: string; key: string }
interface AIInfo   { id: string; name: string; emoji: string }

// =================================================================
// TIMER DISPLAY — แยก component ไม่ให้ main re-render
// =================================================================
const TimerDisplay: React.FC<{
  valRef: React.MutableRefObject<{ val: number; max: number }>
}> = ({ valRef }) => {
  const [val, setVal] = useState(valRef.current.val)
  const [max, setMax] = useState(valRef.current.max)
  useEffect(() => {
    const id = setInterval(() => {
      setVal(valRef.current.val)
      setMax(valRef.current.max)
    }, 250)
    return () => clearInterval(id)
  }, [])
  const ratio = val / (max || 1)
  const color = ratio <= 0.10 ? '#cc2222' : ratio <= 0.30 ? '#c9a84c' : '#3daa4a'
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

const ServerLog = React.memo(() => {
  interface LogEntry { id: number; icon: string; text: string; time: string }
  const [logs, setLogs]     = useState<LogEntry[]>([])
  const [online, setOnline] = useState(247)
  const idRef   = useRef(0)
  const dotAnim = useRef(new Animated.Value(1)).current

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
    const ev  = rnd(evts)
    const now = new Date()
    const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`
    setLogs(prev => {
      const next = [...prev, { id: ++idRef.current, ...ev, time }]
      return next.length > 8 ? next.slice(-8) : next
    })
  }, [])

  useEffect(() => {
    for (let i = 0; i < 4; i++) setTimeout(() => addLog(), i * 200)
    let t: ReturnType<typeof setTimeout>
    const sched = () => { t = setTimeout(() => { addLog(); sched() }, 1500 + Math.random() * 2000) }
    sched()
    const oi = setInterval(() => setOnline(180 + Math.floor(Math.random() * 140)), 15000)
    const p = Animated.loop(Animated.sequence([
      Animated.timing(dotAnim, { toValue: 0.25, duration: 900, useNativeDriver: true }),
      Animated.timing(dotAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
    ]))
    p.start()
    return () => { clearTimeout(t); clearInterval(oi); p.stop() }
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
  const insets = useSafeAreaInsets()
  const isWeb  = Platform.OS === 'web'
  const socketRef = useRef<Socket | null>(null)
  // Patch Multiplayer: roomId/userId มาจาก matchmaking ที่ lobby.tsx (room_auto_match -> room_ready) — ไม่ hardcode อีกต่อไป
  const params   = useLocalSearchParams<{ roomId?: string; userId?: string }>()
  const authUserId = useUserStore(s => s.userId)
  const ROOM_ID  = params.roomId ?? 'HighNoble1'
  // params.userId มาจาก Lobby matchmaking (ผูก escrow ไว้แล้วตอนห้องเต็ม) — authUserId เป็น fallback กันกรณี
  // route param หลุด แต่ทั้งคู่ต้องไม่ว่างพร้อมกัน ห้าม fallback เงียบเป็น literal เด็ดขาด (ดู DEV_FAKE_USER_ID ด้านบน)
  const usingDevFakeId = !params.userId && !authUserId && !!DEV_FAKE_USER_ID
  const PLAYER_ID = params.userId || authUserId || DEV_FAKE_USER_ID || ''
  // Feedback C2 — ไฟล์นี้ไม่เคยผูก authStore เลย ทำให้ P1 (ตัวผู้เล่นเอง) โชว์ '👤'/'You' hardcode ตลอด
  const myAvatarEmoji = useAuthStore(s => s.profile?.avatar_url) || '👤'
  const myDisplayName = useAuthStore(s => s.profile?.display_name) || 'You'
  const isVip = useAuthStore(s => (s.profile?.vip_status ?? 'none') !== 'none') // Feedback C5 — ใช้ vip_status เดิม ไม่สร้าง state ใหม่

  // ── Timer ref (ไม่ trigger re-render)
  const timerValRef = useRef({ val: 90, max: 90 })
  const continueValRef = useRef(0)
  const aiListRef = useRef<AIInfo[]>([])
  const timerRef    = useRef<any>(null)

  // ── Game state
  const [phase, setPhase]             = useState<'dealing'|'arrangement'|'countdown'|'showdown'|'fog_of_war'|'blind_auction'|'auction_done'|'discard'|'discard_done'|'grand_finale'|'grand_finale_done'|'result'|'end'>('dealing')
  const [dealDone, setDealDone]         = useState(false)
  const [dealCount, setDealCount]       = useState(0)
  const [roundNumber, setRoundNumber] = useState(1)
  const [countdown, setCountdown]     = useState(3)
  // Pre-Game Countdown (LobbyMatchmaking_Spec_v1_0 §7.1) — คนละตัวกับ `countdown`/phase 'countdown' ข้างบน (Grand Finale/Showdown เดิม ห้ามแตะ)
  const [showPreGameCountdown, setShowPreGameCountdown] = useState(false)
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
  const [continueCountdown, setContinueCountdown] = useState(33)
  const continueTimerRef = useRef<any>(null)

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
  const [tokenDeltas, setTokenDeltas]   = useState<Record<string, number>>({})
  const [matchResult, setMatchResult]   = useState<any>(null)

  // ── Discard
  const [showDiscard, setShowDiscard]         = useState(false)
  const [buyInAmount, setBuyInAmount]       = useState(0)
  const [showLockup, setShowLockup]         = useState(false)
  // Patch Blind Auction: state ทั้งหมดสำหรับประมูล
  const [auctionBidLevels, setAuctionBidLevels] = useState<number[]>([])
  const [auctionTimeLeft, setAuctionTimeLeft]   = useState(5)
  const [auctionMyBid, setAuctionMyBid]         = useState<{ cardIndex: 0 | 1; level: number } | null>(null)
  const [auctionResult, setAuctionResult]       = useState<any[] | null>(null)
  const auctionTimerRef = useRef<any>(null)
  const auctionGlowAnim = useRef(new Animated.Value(0)).current
  // Patch: ตัวอักษร FOG OF WAR ใหญ่กลางจอ กะพริบ 5 วิ ก่อนเข้า Auction
  const fogBlinkAnim = useRef(new Animated.Value(1)).current
  // Patch: เฟดไพ่ผู้ชนะ Pile1+2 ออกก่อนเข้า Auction (เริ่มเฟดที่ 5s, ใช้เวลา 3s, รวม 8s ตรงกับ Backend delay)
  const pileFadeAnim = useRef(new Animated.Value(1)).current
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

  // showdown_result มาถึง → แสดง ShowdownResult popup ทันที countdown 15 วิ
  const startContinueCountdown = () => {
    // ไม่เรียก setContinueCountdown ที่นี่แล้ว — ContinueTimer อ่านจาก continueValRef เองทุก 500ms
    // เพื่อเลี่ยง parent re-render ทุกวินาที (ต้นเหตุของไพ่กะพริบ)
    continueValRef.current = 33
    if (continueTimerRef.current) clearInterval(continueTimerRef.current)
    continueTimerRef.current = setInterval(() => {
      const next = Math.max(0, continueValRef.current - 1)
      continueValRef.current = next
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

    const socket = io(SERVER_URL, { transports: ['websocket'], reconnection: false })
    socketRef.current = socket

    let matchStarted = false
    socket.on('connect', () => {
      if (matchStarted) return
      matchStarted = true
      // Patch Multiplayer: ห้องเริ่มแมตช์ไปแล้วตั้งแต่ room_ready (lobby.tsx) — หน้านี้แค่ join กลับเข้าไปรับไพ่ของตัวเอง
      socket.emit('game_join', { roomId: ROOM_ID, userId: PLAYER_ID, tier: 'highNoble' })
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
      setIsReady(false); setSortDone(false); setSelected(null)
      setAllCards({}); setPileWinners({})
      setHasFoul({}); setFoulReasons({}); setTokenDeltas({})
      setShowResult(false)
      setHandRanks({})
      setRevealPile(0)
      setActiveShowdownTab(1)
      setContinueCountdown(33)
      continueValRef.current = 33
      if (continueTimerRef.current) clearInterval(continueTimerRef.current)
      setShowDiscard(false); setDiscardSelected([])
      fadeCards.setValue(1)
      setBlind([]); setDealCount(0)
      setTokenBalance(data.tokenBalance ?? {})
      // Patch Multiplayer: server ส่ง seats ทั้ง 4 ที่นั่ง (boss เสมอ + อีก 3 ที่อาจเป็น Human หรือ AI)
      // แปลงเป็น aiList แบบเดิม [boss, ...อีก 2 คนที่ไม่ใช่ฉัน] — โครง bossAI/p2AI/p4AI ด้านล่างใช้ index เดิมได้เลย
      const seats = data.seats ?? []
      const bossSeat = seats.find((s: any) => s.role === 'boss')
      const otherSeats = seats.filter((s: any) => s.id !== PLAYER_ID && s.role !== 'boss')
      const aiNames = [bossSeat, ...otherSeats].filter(Boolean)
      setAiList(aiNames)
      aiListRef.current = aiNames

      const init: Record<string, string> = {}
      aiNames.forEach((a: any) => { init[a.id] = 'Arranging...' })
      setAiStatus(init)

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
          Animated.timing(countAnim, { toValue: 1.6, duration: 150, useNativeDriver: true }),
          Animated.timing(countAnim, { toValue: 1,   duration: 850, useNativeDriver: true }),
        ]).start()
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
      fadeCards.setValue(1)
      pileFadeAnim.setValue(1)
      setTimeout(() => {
        Animated.timing(pileFadeAnim, { toValue: 0, duration: 3000, useNativeDriver: true }).start()
      }, 5000)
      fogBlinkAnim.setValue(1)
      Animated.loop(
        Animated.sequence([
          Animated.timing(fogBlinkAnim, { toValue: 0.2, duration: 500, useNativeDriver: true }),
          Animated.timing(fogBlinkAnim, { toValue: 1,   duration: 500, useNativeDriver: true }),
        ])
      ).start()
    })
    // Patch Blind Auction: เริ่มประมูล
    socket.on('blind_auction_start', (data: any) => {
      // Patch: เผื่อ fadeCards ค้างที่ 0 จาก handleContinue (Showdown popup) - reset กลับเป็น 1
      fadeCards.setValue(1)
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
    })
    // Patch High Noble: Arrangement รอบ2 — จัดไพ่ใหม่รวมไพ่ที่ประมูลได้ (สูงสุด 12 ใบ)
    socket.on('arrangement_2_start', (data: any) => {
      setPhase('arrangement_2')
      setIsReady(false); setSortDone(false); setSelected(null)
      const myCards: string[] = data.cards ?? []
      const cardObjs = myCards.map((k: string, i: number) => ({ id: `c2_${i}`, key: k }))
      setPiles([cardObjs.slice(0, 3), cardObjs.slice(3, 6), cardObjs.slice(6)])
      const t = data.timer ?? 20
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
    })
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
          Animated.sequence([
            Animated.timing(confirmBlinkAnim, { toValue: 0.3, duration: 350, useNativeDriver: true }),
            Animated.timing(confirmBlinkAnim, { toValue: 1,   duration: 350, useNativeDriver: true }),
          ]).start()
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
          Animated.sequence([
            Animated.timing(confirmBlinkAnim, { toValue: 0.3, duration: 350, useNativeDriver: true }),
            Animated.timing(confirmBlinkAnim, { toValue: 1,   duration: 350, useNativeDriver: true }),
          ]).start()
        }
        if (left <= 0) clearInterval(discardTimerRef.current)
      }, 1000)
    })
    socket.on('discard_phase_result', (data: any) => {
      if (discardTimerRef.current) clearInterval(discardTimerRef.current)
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
      console.error('🟢 [DEBUG] grand_finale_start received!', data)
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
    })
    // Patch Grand Finale: ผล action ของผู้เล่นคนหนึ่ง
    socket.on('grand_finale_action', (data: any) => {
      console.error('🔴 [DEBUG] grand_finale_action:', data)
      if (gfTimerRef.current) clearInterval(gfTimerRef.current)
      gfBlinkAnim.stopAnimation()
      if (data.action === 'fold') {
        setGfFoldedPlayers(prev => [...prev, data.playerId])
      } else if (data.revealedCard) {
        console.error('🔴 [DEBUG] revealedCard from server:', data.revealedCard, 'playerId:', data.playerId)
        if (data.playerId === PLAYER_ID) {
          console.error('🔴 [DEBUG] piles[2] keys:', piles[2].map(c => c.key))
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
    })
    socket.on('grand_finale_all_foul', (_data: any) => {
      // emit ก่อน grand_finale_result — ไม่ต้องทำอะไรเพิ่ม รอ grand_finale_result มา
    })
    socket.on('grand_finale_walkover', (_data: any) => {
      // emit ก่อน grand_finale_result — ไม่ต้องทำอะไรเพิ่ม รอ grand_finale_result มา
    })

    socket.on('round_result', (data: any) => {
      setPhase('result')
      setTokenBalance(data.tokenBalance ?? {})
      setTokenDeltas(data.tokenDeltas ?? {})
    })

    socket.on('match_end', (data: any) => {
      setPhase('end')
      setMatchResult(data)
      setTokenBalance(data.tokenBalance ?? {})
      // Server ส่งยอด token_balance จริงหลัง settle มาด้วย (per-player) — ห้ามคำนวณเองจาก buyin/stack
      const myNewBalance = data.newTokenBalances?.[PLAYER_ID] ?? data.newTokenBalance
      if (typeof myNewBalance === 'number') {
        useUserStore.getState().updateTokenBalance(myNewBalance)
      }
      if (data.finalWinner === PLAYER_ID) {
        Animated.loop(Animated.sequence([
          Animated.timing(winPulse, { toValue: 1.25, duration: 400, useNativeDriver: true }),
          Animated.timing(winPulse, { toValue: 1,    duration: 400, useNativeDriver: true }),
        ])).start()
        Animated.loop(Animated.sequence([
          Animated.timing(winOpacity, { toValue: 0.4, duration: 300, useNativeDriver: true }),
          Animated.timing(winOpacity, { toValue: 1,   duration: 300, useNativeDriver: true }),
        ])).start()
        const launchConfetti = () => {
          confettiAnims.forEach((a, i) => {
            a.x.setValue(Math.random() * 360 - 30)
            a.y.setValue(-100); a.opacity.setValue(1); a.rotate.setValue(0)
            Animated.parallel([
              Animated.timing(a.y,       { toValue: 700, duration: 2000 + Math.random() * 1500, delay: i * 80, useNativeDriver: true }),
              Animated.timing(a.opacity, { toValue: 0,   duration: 2500, delay: i * 80, useNativeDriver: true }),
              Animated.timing(a.rotate,  { toValue: 720, duration: 2000, delay: i * 80, useNativeDriver: true }),
            ]).start(({ finished }) => {
              if (finished && i === confettiAnims.length - 1) launchConfetti()
            })
          })
        }
        launchConfetti()
      }
    })

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      socket.disconnect()
    }
  }, [])

  // ── Deal Animation
  const startDealAnimation = () => {
    // ตำแหน่งปลายทาง: Boss=บน, P4=ขวา, User=ล่าง, P2=ซ้าย
    const targets = [
      { x: 0,    y: -240 }, // Boss AI (บน)
      { x: 140,  y: -10  }, // P4 (ขวา)
      { x: 0,    y: 200  }, // User (ล่าง)
      { x: -140, y: -10  }, // P2 (ซ้าย)
    ]
    // reset ทุกใบ
    dealAnims.forEach(a => {
      a.x.setValue(0); a.y.setValue(0)
      a.opacity.setValue(0); a.scale.setValue(0.5)
    })

    const delayPerCard = (10000 - 1000) / DEAL_COUNT // ~205ms ต่อใบ
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
          Animated.timing(a.opacity, { toValue: 0, duration: 80, useNativeDriver: true }),
        ])
      )
      // นับไพ่ที่แจกไปแล้ว
      setTimeout(() => setDealCount(i + 1), i * delayPerCard + 450)
    })

    Animated.parallel(anims).start(() => {
      setDealDone(true)
      setShowLockup(false)
      setPhase('arrangement')
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

  const AIPiles: React.FC<{ aiId: string }> = ({ aiId }) => {
    // Patch: ตอน Fog of War ซ่อนไพ่ Pile1+2 ที่เคยเฉลยไว้ (กลับเป็นหลังไพ่)
    const fog = phase === 'fog_of_war'
    const p1 = fog ? [] : (allCards[aiId]?.[1] ?? []); const p2 = fog ? [] : (allCards[aiId]?.[2] ?? []); const p3 = allCards[aiId]?.[3] ?? []
    const cards = [...p1, ...p2, ...p3]
    // Patch Grand Finale: ตอน gf ใช้ 3 ใบ (เริ่มต้น) หรือ 2 ใบ (ถ้า Call หงายไปแล้ว 1)
    const gf = phase === 'grand_finale' || phase === 'grand_finale_done'
    const gfRevealed = gf ? (gfRevealedCards[aiId]?.length ?? 0) : 0
    const layout: number[] = fog ? [5] : (gf ? [3 - gfRevealed] : [3, 3, 5])
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
    const layout: number[] = fog ? [5] : (gf ? [3 - gfRevealed] : [5, 3, 3])
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
    const hasWinner = winner && winCards.length > 0 && phase !== 'fog_of_war' // Patch: ซ่อนไพ่เฉลย Pile1+2 ตอน Fog of War

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
          {k2 && CARD_IMG[k2] && <View style={pileShadowStyle}><View style={s.commCard}><Image source={CARD_IMG[k2]} style={{ width: 50, height: 72 }} resizeMode="cover" /></View></View>}
          {/* Divider */}
          {hasWinner && <View style={{ width: 1, height: 72, backgroundColor: 'rgba(201,168,76,0.3)', marginHorizontal: 2 }} />}
          {/* Winner cards */}
          {hasWinner && winCards.map((k, i) => (
            <View key={i} style={[s.commCard, {
              borderColor: isWin ? '#4ade80' : '#f87171',
              borderWidth: 1.5,
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

  const FaceCard: React.FC<{ card: CardData; pi: number; ci: number; first: boolean }> = ({ card, pi, ci, first }) => {
    const isSel = selected?.pi === pi && selected?.ci === ci
    return (
      <TouchableOpacity onPress={() => handleCardPress(pi, ci)} activeOpacity={0.85}
        style={[s.userCard, !first && { marginLeft: OVERLAP }, isSel && s.userCardSel, { zIndex: ci }]}>
        {CARD_IMG[card.key]
          ? <Image source={CARD_IMG[card.key]} style={{ width: CW, height: CH }} resizeMode="cover" />
          : <Text style={{ fontSize: 8 }}>{card.key}</Text>}
      </TouchableOpacity>
    )
  }

  // Pile Reveal Overlay — Tab mode ผู้เล่นเลือกดูได้ + Continue button
  const PileRevealOverlay: React.FC<{ pileNum: 1|2|3 }> = ({ pileNum }) => {
    const players = [
      { id: PLAYER_ID, label: myDisplayName, emoji: myAvatarEmoji },
      ...(aiList.map(a => ({ id: a.id, label: a.name, emoji: a.emoji }))),
    ]
    const commMap: Record<number, string[]> = { 1: comm.p1, 2: comm.p2, 3: comm.p3 }
    const cCards = commMap[pileNum] ?? []
    const winner = pileWinners[pileNum]
    const rank   = handRanks[pileNum]
    const CARD_W = 50; const CARD_H = 72

    return (
      <View style={[s.overlay, { justifyContent: 'flex-start', padding: 16, backgroundColor: 'rgba(15,36,24,0.97)' }]}>
        {/* Tab selector */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, marginTop: 8 }}>
          {([1,2,3] as const).map(n => (
            <TouchableOpacity key={n} onPress={() => setRevealPile(n)}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, alignItems: 'center',
                borderColor: pileNum === n ? '#FFD76A' : 'rgba(255,215,106,0.3)',
                backgroundColor: pileNum === n ? 'rgba(255,215,106,0.15)' : 'transparent' }}>
              <Text style={{ fontSize: 14, color: pileNum === n ? '#FFD76A' : '#a89060', fontWeight: '800' }}>PILE {n}</Text>
              {pileWinners[n] === PLAYER_ID && <Text style={{ fontSize: 9, color: '#8DFFB5' }}>🏆 YOU</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* Hand rank */}
        {rank && <Text style={{ fontSize: 16, color: '#8DFFB5', marginBottom: 10, letterSpacing: 1, fontWeight: '700', alignSelf: 'center' }}>{rank}</Text>}

        {/* Community cards */}
        <View style={{ marginBottom: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: '#38bdf8', fontWeight: '800', marginBottom: 6, letterSpacing: 2 }}>COMMUNITY</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {cCards.map((k, i) => (
              <View key={i} style={{ width: CARD_W, height: CARD_H, borderRadius: 4, overflow: 'hidden', borderWidth: 2, borderColor: '#38bdf8' }}>
                {CARD_IMG[k]
                  ? <Image source={CARD_IMG[k]} style={{ width: CARD_W, height: CARD_H }} resizeMode="cover" />
                  : <Image source={cardBackImg} style={{ width: CARD_W, height: CARD_H }} resizeMode="cover" />}
              </View>
            ))}
          </View>
        </View>

        {/* ไพ่แต่ละคน */}
        <View style={{ width: '100%', gap: 8, flex: 1 }}>
          {players.map(p => {
            const revealed = allCards[p.id]?.[pileNum]
            const cardKeys = revealed ? (pileNum === 3 ? revealed.slice(0, 3) : revealed) : []
            const isWinner = pileWinners[pileNum] === p.id
            const isUser   = p.id === PLAYER_ID
            return (
              <View key={p.id} style={{
                flexDirection: 'row', alignItems: 'center',
                borderWidth: isWinner ? 1.5 : 1,
                borderColor: isWinner ? '#4ade80' : '#2A4A34',
                borderRadius: 8, padding: 8,
                backgroundColor: isWinner ? 'rgba(74,222,128,0.08)' : 'rgba(0,0,0,0.3)',
              }}>
                <View style={{ width: 56, alignItems: 'center', marginRight: 8 }}>
                  <Text style={{ fontSize: 20 }}>{p.emoji}</Text>
                  <Text style={{ fontSize: 10, color: isUser ? '#FFD76A' : '#F5F2E8', fontWeight: '800', marginTop: 2 }} numberOfLines={1}>
                    {isUser ? 'You' : p.label.split(' ')[0]}
                  </Text>
                  {isWinner && <Text style={{ fontSize: 9, color: '#8DFFB5', fontWeight: '900' }}>🏆 WIN</Text>}
                </View>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {cardKeys.length > 0 ? cardKeys.map((k, i) => (
                    <View key={i} style={{ width: CARD_W, height: CARD_H, borderRadius: 4, overflow: 'hidden', borderWidth: 1.5, borderColor: isWinner ? '#4ade80' : '#2A4A34' }}>
                      {CARD_IMG[k]
                        ? <Image source={CARD_IMG[k]} style={{ width: CARD_W, height: CARD_H }} resizeMode="cover" />
                        : <Image source={cardBackImg} style={{ width: CARD_W, height: CARD_H }} resizeMode="cover" />}
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


        {/* Continue button */}
        <View style={{ marginTop: 12, width: '100%' }}>
          <ContinueTimer valRef={continueValRef} onContinue={handleContinue} />
        </View>
      </View>
    )
  }

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
    const isTriple   = pileWinners[1] === PLAYER_ID && pileWinners[2] === PLAYER_ID && pileWinners[3] === PLAYER_ID
    // Triple Sweep: Rake 10% (ตาม CoreRules) / ชนะปกติ: Rake 5%
    const rakeRate   = isTriple ? 0.10 : 0.05
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
              <TouchableOpacity key={n} onPress={() => setActiveTab(n)}
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
                const rakeRate = isTriple ? 0.10 : 0.05
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
                    <Text style={{ fontSize: 16, color: net > 0 ? '#8DFFB5' : '#FF6B6B', fontWeight: '900', marginTop: 2 }}>
                      {net > 0 ? '+' : ''}{net}
                    </Text>
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
                  <View style={{ width: 76, alignItems: 'center', marginRight: 8 }}>
                    <Text style={{ fontSize: 18 }}>{p.emoji}</Text>
                    <Text style={{ fontSize: 9, color: isUser ? '#FFD76A' : '#F5F2E8', fontWeight: '800' }} numberOfLines={1}>
                      {isUser ? myDisplayName : p.label}
                    </Text>
                    {isWinner && <Text style={{ fontSize: 9, color: '#8DFFB5', fontWeight: '900' }}>🏆 WIN</Text>}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 4, marginLeft: 100 }}>
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

        {/* Continue button */}
        <View style={{ paddingTop: 8, paddingBottom: 4 }}>
          <ContinueTimer valRef={continueValRef} onContinue={handleContinue} />
        </View>

      </View>
    )
  })

  const bossAI = aiList[0]; const p2AI = aiList[1]; const p4AI = aiList[2]
  const userRevealed = allCards[PLAYER_ID]
  const isRevealed   = userRevealed && Object.keys(userRevealed).length > 0

  // =================================================================
  // RENDER
  // =================================================================
  return (
    <View style={[s.root, isWeb && s.webOuter]}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <View style={[s.gameContainer, isWeb && s.webFrame]}>
        <View style={s.gameArea}>

          <PreGameCountdown visible={showPreGameCountdown} onComplete={() => setShowPreGameCountdown(false)} />

          <View style={StyleSheet.absoluteFill as any} pointerEvents="none"><Image source={tableImg} style={{ width: '100%', height: '100%' }} resizeMode="cover" /></View>
          <View style={[StyleSheet.absoluteFill as any, s.logoWatermark]} pointerEvents="none">
            <Image source={tripleSpade} style={{ width: 120, height: 120, opacity: 0.07 }} resizeMode="contain" />
          </View>

          {/* ── DEAL ANIMATION ── */}
          {phase === 'dealing' && (
            <View style={[StyleSheet.absoluteFill as any, { alignItems: 'center', justifyContent: 'center', zIndex: 50 }]} pointerEvents="none">
              {dealAnims.map((a, i) => (
                <Animated.View key={i} style={{
                  position: 'absolute',
                  width: 50, height: 72, borderRadius: 6,
                  backgroundColor: '#091808',
                  borderWidth: 1, borderColor: 'rgba(201,168,76,.5)',
                  overflow: 'hidden',
                  opacity: a.opacity,
                  transform: [{ translateX: a.x }, { translateY: a.y }, { scale: a.scale }, { rotate: '90deg' }], // Patch Mastermind: หมุน 90deg ให้สอดรับกับไพ่ที่ซ้อนกัน (270deg)
                }}>
                  <Image source={cardBackImg} style={{ width: 50, height: 72 }} resizeMode="cover" />
                </Animated.View>
              ))}
              <Text style={{ color: 'rgba(201,168,76,0.4)', fontSize: 10, letterSpacing: 2, marginTop: 80 }}>DEALING...</Text>
              {/* Boss AI — แสดงจำนวนไพ่ที่ได้รับ */}
              {[0,1,2,3].map(playerIdx => {
                const count = Math.floor(dealCount / 4) + (dealCount % 4 > playerIdx ? 1 : 0)
                const positions = [
                  { x: 195, y: 80 },   // Boss
                  { x: 350, y: 300 },  // P4
                  { x: 195, y: 520 },  // User
                  { x: 40,  y: 300 },  // P2
                ]
                const pos = positions[playerIdx]
                return Array.from({ length: Math.min(count, 11) }).map((_, ci) => (
                  <View key={`p${playerIdx}c${ci}`} style={{
                    position: 'absolute', left: pos.x - 25 + ci * 4, top: pos.y - 36 + ci * 3,
                    width: 50, height: 72, borderRadius: 6, overflow: 'hidden',
                    borderWidth: 1, borderColor: 'rgba(201,168,76,.5)', backgroundColor: '#091808',
                    transform: [{ rotate: '270deg' }], // Patch Mastermind: มุมซ้อนไพ่ตอนแจก ต่างจาก Tier ก่อนหน้า
                  }}>
                    <Image source={cardBackImg} style={{ width: 50, height: 72 }} resizeMode="cover" />
                  </View>
                ))
              })}
            </View>
          )}

          {/* ── BLIND AUCTION OVERLAY ── */}
          {(phase === 'blind_auction' || phase === 'auction_done') && (
            <View style={s.overlay}>
              <Text style={s.discardTitle}>🔮 BLIND AUCTION</Text>
              {phase === 'blind_auction' && (
                <Text style={[s.discardSub, { color: auctionTimeLeft <= 2 ? '#f87171' : '#FFD76A' }]}>
                  เลือกราคาภายใน {auctionTimeLeft}s
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
                                {isWinner ? '🏆 คุณชนะ!' : `${winAI?.emoji ?? '🤖'} ${winAI?.name ?? 'AI'} ชนะ`}
                              </Text>
                              <Text style={{ fontSize: 10, color: '#a89060' }}>-{result.amount} tokens</Text>
                            </>
                          ) : (
                            <Text style={{ fontSize: 11, color: '#a89060' }}>ไม่มีใครประมูล</Text>
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
                  <View style={{ backgroundColor: 'rgba(15,36,24,0.97)', padding: 24, borderRadius: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#FFD76A', minWidth: 280 }}>
                    {gfFinalResult.burned ? (
                      <>
                        <Text style={{ fontSize: 24, color: '#f87171', fontWeight: '900', letterSpacing: 2 }}>🔥 POT BURNED</Text>
                        <Text style={{ fontSize: 12, color: '#a89060', marginTop: 8 }}>ทุกคน Foul — Pot {gfFinalResult.pile3Pot} ถูกเบิร์น</Text>
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
              <View style={[StyleSheet.absoluteFill as any, { alignItems: 'center', justifyContent: 'flex-start', paddingTop: 320, zIndex: 60, backgroundColor: 'rgba(0,0,0,0.65)' }]} pointerEvents="none">
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
                      <Text style={{ color: '#a89060', fontSize: 10, marginTop: 2 }}>คว้าทั้ง 3 กอง!</Text>
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
              <Text style={s.discardTitle}>เลือกไพ่ที่จะทิ้ง (เหลือ 3 ใบ)</Text>
              <Text style={[s.discardSub, { color: discardTimeLeft <= 3 ? '#f87171' : '#FFD76A' }]}>
                {discardSelected.length}/{discardHandKeys.length - 3} ใบที่เลือก — เหลือ {discardTimeLeft}s
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
                { label: 'ไม่แนะนำให้ทิ้ง', filterFn: (key: string) => discardSuggested.includes(key) },
                { label: 'แนะนำให้ทิ้ง', filterFn: (key: string) => !discardSuggested.includes(key) },
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
                <Text style={s.discardTitle}>เลือกไพ่ที่จะทิ้ง (ให้เหลือกองละ 3 ใบ)</Text>
                <Text style={[s.discardSub, { color: discardTimeLeft <= 3 ? '#f87171' : '#FFD76A' }]}>
                  เหลือ {discardTimeLeft}s
                </Text>
                {(['pile1', 'pile2', 'pile3'] as const).map((pile, pIdx) => (
                  <View key={pile} style={{ alignItems: 'center', marginBottom: 10 }}>
                    <Text style={[s.pileLabel, { marginBottom: 4, color: discardSelByPile[pile].length === discardNeed[pile] ? '#8DFFB5' : '#FFC857' }]}>
                      PILE {pIdx + 1} — เลือกทิ้ง {discardSelByPile[pile].length}/{discardNeed[pile]}
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
          {phase === 'countdown' && (
            <View style={s.overlay}>
              <Text style={s.countdownLabel}>SHOWDOWN</Text>
              <Animated.Text style={[s.countdownNum, { transform: [{ scale: countAnim }] }]}>
                {countdown > 0 ? countdown : (
                  <Image source={tripleSpade} style={{ width: 80, height: 80 }} resizeMode="contain" />
                )}
              </Animated.Text>
              <Text style={s.countdownSub}>All piles reveal!</Text>
            </View>
          )}



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
              <ResultPanel
                variant={matchResult.finalWinner === PLAYER_ID ? 'victory' : 'defeat'}
                footer={
                  <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
                    <MenuButton icon="exit" label="Lobby" size="md" onPress={() => router.push('/lobby')} />
                  </View>
                }
              >
                <View style={[s.tierBadge, { alignSelf: 'center', marginBottom: 6 }]}>
                  <Text style={s.tierText}>HIGH NOBLE</Text>
                </View>
                {/* Buy-in Spec §6 — Buy-in/Returned/Net เหนือ Final Token Balance, JetBrains Mono
                    Returned ใช้ finalStackByHuman จาก server ถ้ามี (ตรงกับยอดจริงที่เข้า DB แม้เจอ Monarch ×2) */}
                {(() => {
                  const buyIn = matchResult.buyInAmount ?? buyInAmount
                  const returned = matchResult.finalStackByHuman?.[PLAYER_ID] ?? tokenBalance[PLAYER_ID] ?? 0
                  const net = returned - buyIn
                  return (
                    <View style={s.buyInSummaryRow}>
                      <Text style={s.buyInSummaryText}>
                        Buy-in <Text style={{ color: '#f87171' }}>−{buyIn.toLocaleString('en-US')}</Text>
                        {'   '}Returned <Text style={{ color: '#4ade80' }}>+{returned.toLocaleString('en-US')}</Text>
                        {'   '}Net <Text style={{ color: net >= 0 ? '#4ade80' : '#f87171', fontWeight: '800' }}>
                          {net >= 0 ? '+' : ''}{net.toLocaleString('en-US')}
                        </Text>
                      </Text>
                    </View>
                  )
                })()}
                {/* ยอด token_balance จริงหลัง settle จาก server (ไม่คำนวณเอง) — ต่างจาก "Final Token Balance"
                    ด้านล่างที่เป็น leaderboard stack ในแมตช์นี้ (รวม AI ซึ่งไม่มี token_balance จริงใน DB) */}
                {typeof (matchResult.newTokenBalances?.[PLAYER_ID] ?? matchResult.newTokenBalance) === 'number' && (
                  <Text style={[s.buyInSummaryText, { textAlign: 'center', marginBottom: 8 }]}>
                    Your Token Balance <Text style={{ color: '#c9a84c', fontWeight: '800' }}>{(matchResult.newTokenBalances?.[PLAYER_ID] ?? matchResult.newTokenBalance).toLocaleString('en-US')}</Text>
                  </Text>
                )}
                <Text style={s.matchEndSub}>Final Token Balance</Text>
                {[PLAYER_ID, ...aiList.map(a => a.id)].sort((a, b) => (tokenBalance[b] ?? 0) - (tokenBalance[a] ?? 0)).map(pid => {
                  const ai  = aiList.find(a => a.id === pid)
                  const bal = tokenBalance[pid] ?? (matchResult.buyInAmount ?? buyInAmount)
                  return (
                    <View key={pid} style={s.matchEndRow}>
                      <Text style={[s.matchEndName, pid === PLAYER_ID && { color: '#c9a84c' }]} numberOfLines={1}>
                        {pid === PLAYER_ID ? `${myAvatarEmoji} ${myDisplayName}` : `${ai?.emoji} ${ai?.name}`}
                      </Text>
                      <Text style={[s.matchEndBal, { color: bal >= (matchResult.buyInAmount ?? buyInAmount) ? '#4ade80' : '#f87171' }]}>🪙 {bal}</Text>
                    </View>
                  )
                })}
              </ResultPanel>
            </>
          )}

          {/* LOGOS — position absolute */}
          <View style={{ position: 'absolute', top: 8, left: 10, zIndex: 10, opacity: (phase === 'showdown' || phase === 'result') ? 0 : 1 }} pointerEvents="none">
            <Image source={studioLogo} style={{ width: 28, height: 28, opacity: 0.9 }} resizeMode="contain" />
          </View>
          <View style={{ position: 'absolute', top: 70, left: 0, zIndex: (phase === 'showdown' || phase === 'result') ? 0 : 10, opacity: (phase === 'showdown' || phase === 'result') ? 0 : 1 }}>
            <TouchableOpacity onPress={() => { setShowTierInfo(true); setActiveTierTab('HIGH NOBLE') }}
              style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(180,0,0,0.3)', borderWidth: 1.5, borderColor: '#ff3333', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, color: '#ff3333', fontWeight: '900' }}>i</Text>
            </TouchableOpacity>
          </View>
          <View style={{ position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center', zIndex: 10, opacity: (phase === 'showdown' || phase === 'result') ? 0 : 1 }} pointerEvents="box-none">
            <TouchableOpacity onPress={() => setShowRankTable(true)}
              style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(201,168,76,0.2)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.5)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, color: '#c9a84c', fontWeight: '800' }}>?</Text>
            </TouchableOpacity>
          </View>

          {/* ── TIER INFO OVERLAY ── */}
{showTierInfo && (
  <View style={[s.overlay, { justifyContent: 'flex-start', paddingTop: 20, backgroundColor: 'rgba(15,36,24,0.97)' }]}>
    <Text style={[s.showdownTitle, { marginBottom: 12 }]}>Tier Information</Text>

    {/* แท็บ */}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 12, justifyContent: 'center' }}>
      {['INITIATE','ADEPT','MASTERMIND','HIGH NOBLE','LAST BOSS'].map(t => (
        <TouchableOpacity key={t} onPress={() => setActiveTierTab(t)}
          style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1,
            borderColor: activeTierTab === t ? '#c9a84c' : 'rgba(201,168,76,0.5)',
            backgroundColor: activeTierTab === t ? 'rgba(201,168,76,0.2)' : 'transparent' }}>
          <Text style={{ fontSize: 9, color: activeTierTab === t ? '#c9a84c' : '#a89060', fontWeight: '800' }}>{t}</Text>
        </TouchableOpacity>
      ))}
    </View>

    {/* เนื้อหาแต่ละ Tier */}
    <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={false}>
    {(() => {
      const TIERS: Record<string, any> = {
        'INITIATE': {
          name: 'Initiate', tagline: 'The First Step',
          tokenRange: '100 – 49,999',
          table: 'Bot × 3',
          ante: { pile1: 10, pile2: 20, pile3: 40, call: '-' },
          pot:  { pile1: 40, pile2: 80, pile3: 160 },
          jackpot: { payout: 504, penalty: 90 },
          features: ['Simultaneous Showdown', 'No Fog of War', 'No Blind Auction', 'No Grand Finale Betting', 'Learn the basics (~6 days to advance)'],
        },
        'ADEPT': {
          name: 'Adept', tagline: 'The Rising Player',
          tokenRange: '50,000 – 149,999',
          table: 'Real Player × 1 + Bot × 2',
          ante: { pile1: 60, pile2: 100, pile3: 140, call: '-' },
          pot:  { pile1: 230, pile2: 380, pile3: 530 },
          jackpot: { payout: 2052, penalty: 380 },
          features: ['Simultaneous Showdown', 'No Fog of War', 'No Blind Auction', 'No Grand Finale Betting', 'First real opponents (~12 days to advance)'],
        },
        'MASTERMIND': {
          name: 'Mastermind', tagline: 'The Auction Begins',
          tokenRange: '150,000 – 399,999',
          table: 'Real Player × 2 + Minion AI × 1',
          ante: { pile1: 200, pile2: 300, pile3: 500, call: 1000 },
          pot:  { pile1: 760, pile2: 1140, pile3: 1900 },
          jackpot: { payout: 6840, penalty: 1260 },
          features: ['Sequential Showdown', 'Fog of War ✅', 'Blind Auction ✅', 'Grand Finale Betting ✅', 'Discard Phase ✅ (~31 days to advance)'],
        },
        'HIGH NOBLE': {
          name: 'High Noble', tagline: 'Audience with the Four Gods',
          tokenRange: '400,000+',
          table: 'Real Player × 2 + Four Gods AI × 1',
          ante: { pile1: 500, pile2: 1000, pile3: 1500, call: 3000 },
          pot:  { pile1: 1900, pile2: 3800, pile3: 5700 },
          jackpot: { payout: 20520, penalty: 3800 },
          features: ['Sequential Showdown', 'Fog of War ✅', 'Blind Auction ✅', 'Grand Finale Betting ✅', 'Full Competitive Experience'],
        },
        'LAST BOSS': {
          name: 'The Last Boss', tagline: 'Beyond the Four Gods',
          tokenRange: 'Special Condition',
          table: 'Special Condition',
          ante: { pile1: 1000, pile2: 2000, pile3: 3000, call: 6000 },
          pot:  { pile1: 3800, pile2: 7600, pile3: 11400 },
          jackpot: { payout: 41040, penalty: 7600 },
          features: ['Sequential Showdown', 'Fog of War ✅', 'Blind Auction ✅', 'Grand Finale Betting ✅', 'Final Challenge'],
        },
      }
      const t = TIERS[activeTierTab]
      if (!t) return null
      const Row = ({ label, value, valueColor = '#e8dfc0' }: { label: string; value: string; valueColor?: string }) => (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.2)' }}>
          <Text style={{ fontSize: 10, color: '#a89060', flex: 1 }}>{label}</Text>
          <Text style={{ fontSize: 10, color: valueColor, fontWeight: '700', flex: 2, textAlign: 'right' }}>{value}</Text>
        </View>
      )
      return (
        <View>
          {/* Header */}
          <View style={{ alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.2)' }}>
            <Text style={{ fontSize: 16, color: '#c9a84c', fontWeight: '900', letterSpacing: 2 }}>{t.name}</Text>
            <Text style={{ fontSize: 10, color: '#c9a84c', marginTop: 2, fontStyle: 'italic' }}>"{t.tagline}"</Text>
          </View>

          {/* General */}
          <Text style={{ fontSize: 9, color: '#38bdf8', fontWeight: '800', letterSpacing: 2, marginBottom: 6, marginTop: 4 }}>GENERAL</Text>
          <Row label="Token Range" value={t.tokenRange} valueColor="#4ade80" />
          <Row label="Table" value={t.table} />

          {/* Ante */}
          <Text style={{ fontSize: 9, color: '#38bdf8', fontWeight: '800', letterSpacing: 2, marginBottom: 6, marginTop: 12 }}>ANTE PER HAND</Text>
          <Row label="Pile 1" value={`${t.ante.pile1} tokens`} />
          <Row label="Pile 2" value={`${t.ante.pile2} tokens`} />
          <Row label="Pile 3" value={`${t.ante.pile3} tokens`} />
          <Row label="Grand Finale Call" value={t.ante.call === '-' ? 'N/A' : `${t.ante.call} tokens/round`} valueColor={t.ante.call === '-' ? '#555' : '#e8dfc0'} />

          {/* Pot */}
          <Text style={{ fontSize: 14, color: '#8DFFB5', fontWeight: '800', letterSpacing: 2, marginBottom: 6, marginTop: 12 }}>POT PAYOUT (Rake 5%)</Text>
          <Row label="Win Pile 1" value={`${t.pot.pile1} tokens`} valueColor="#8DFFB5" />
          <Row label="Win Pile 2" value={`${t.pot.pile2} tokens`} valueColor="#8DFFB5" />
          <Row label="Win Pile 3" value={`${t.pot.pile3} tokens`} valueColor="#8DFFB5" />

          {/* Triple Sweep */}
          <Text style={{ fontSize: 14, color: '#FFB74D', fontWeight: '800', letterSpacing: 2, marginBottom: 6, marginTop: 12 }}>⚡ TRIPLE SWEEP JACKPOT</Text>
          <Row label="Winner Payout" value={`${t.jackpot.payout} tokens`} valueColor="#FFD76A" />
          <Row label="Loser Penalty" value={`${t.jackpot.penalty} tokens each`} valueColor="#FFB74D" />
          <Row label="Rake" value="10% (burn)" valueColor="#FFB74D" />

          {/* Features */}
          <Text style={{ fontSize: 14, color: '#8DFFB5', fontWeight: '800', letterSpacing: 2, marginBottom: 6, marginTop: 12 }}>FEATURES</Text>
          {t.features.map((f: string, i: number) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
              <Text style={{ fontSize: 14, color: '#FFD76A', marginRight: 8 }}>•</Text>
              <Text style={{ fontSize: 16, color: '#F5F2E8' }}>{f}</Text>
            </View>
          ))}
          <View style={{ height: 20 }} />
        </View>
      )
    })()}
    </ScrollView>

    <TouchableOpacity style={[s.continueBtn, { marginTop: 12, backgroundColor: '#102218', borderColor: '#FFD76A' }]} onPress={() => setShowTierInfo(false)}>
      <Text style={[s.continueBtnTxt, { color: '#FFD76A', fontSize: 18 }]}>ปิด</Text>
    </TouchableOpacity>
  </View>
)}

          {/* ── RANK TABLE OVERLAY ── */}
{showRankTable && (
  <View style={[s.overlay, { justifyContent: 'flex-start', paddingTop: 40, backgroundColor: 'rgba(11,21,16,0.92)' }]}>
    <Text style={[s.showdownTitle, { marginBottom: 12, fontSize: 24, color: '#FFD76A' }]}>Hand Rankings</Text>
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
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', width: '100%', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A4A34' }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,215,106,0.15)', borderWidth: 1, borderColor: '#FFD76A', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Text style={{ fontSize: 13, color: '#FFD76A', fontWeight: '900' }}>{h.rank}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, color: '#F5F2E8', fontWeight: '700' }}>{h.name}</Text>
          <Text style={{ fontSize: 14, color: '#c9b87a', marginTop: 2 }}>{h.desc}</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 3 }}>
            <Text style={{ fontSize: 14, color: '#8DFFB5' }}>Low: {h.low}</Text>
            <Text style={{ fontSize: 14, color: '#FFC857' }}>High: {h.high}</Text>
          </View>
        </View>
      </View>
    ))}
    <View style={{ height: 16 }} />
    </ScrollView>
    <TouchableOpacity style={[s.continueBtn, { marginTop: 12, backgroundColor: '#102218', borderColor: '#FFD76A' }]} onPress={() => setShowRankTable(false)}>
      <Text style={[s.continueBtnTxt, { color: '#FFD76A', fontSize: 18 }]}>ปิด</Text>
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
                  {bossIntroName === 'Monarch' && (
                    <Text style={{ fontSize: 12, color: '#C8C4B0', letterSpacing: 1.5, marginTop: 2 }}>THE FACELESS KING</Text>
                  )}
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
          <View style={[s.topBar, { paddingTop: isWeb ? 22 : insets.top + 14, opacity: (phase === 'showdown' || phase === 'result') ? 0 : 1 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 50 }}>
              <View style={{ alignItems: 'center' }}>
                <View style={s.tierBadge}><Text style={s.tierText}>HIGH NOBLE</Text></View>
                <Text style={{ fontSize: 13, color: '#FFD76A', marginTop: 2, letterSpacing: 1 }}>★★★★★</Text>
              </View>
              <Text style={s.roundText}>R{roundNumber}/5</Text>
            </View>
            <View style={[s.potBadge, { marginLeft: 6 }]}>
              <Text style={s.stackLabel}>STACK</Text>
              <Text style={s.potText}>🪙 {tokenBalance[PLAYER_ID] ?? buyInAmount}</Text>
              {(tokenDeltas[PLAYER_ID] ?? 0) !== 0 && (
                <Text style={[s.deltaText, { color: (tokenDeltas[PLAYER_ID] ?? 0) > 0 ? '#4ade80' : '#f87171' }]}>
                  {(tokenDeltas[PLAYER_ID] ?? 0) > 0 ? '+' : ''}{tokenDeltas[PLAYER_ID]}
                </Text>
              )}
            </View>
            <TimerDisplay valRef={timerValRef} />
          </View>

          {/* AI SEAT + MAIN + USER — fade เมื่อ continue, ซ่อนระหว่าง dealing */}
          <Animated.View style={{ flex: 1, opacity: phase === 'dealing' ? 0 : fadeCards }}>
          <View style={[s.aiSeat, { opacity: (phase === 'countdown' || phase === 'showdown' || phase === 'result' || phase === 'grand_finale' || phase === 'grand_finale_done') ? 0 : 1 }]}>
            {bossAI && <GFStatusBadge playerId={bossAI.id} />}
            {bossAI && <GFHealthBar playerId={bossAI.id} />}
            <View style={s.aiRow}>
              <AvatarBubble emoji={bossAI?.emoji ?? '🤖'} size={56} glow image={bossAI?.name ? BOSS_AVATAR[bossAI.name] : undefined} />
              <Text style={s.aiName}>{bossAI?.name ?? 'BOSS AI'}</Text>
              <View style={s.statusBadge}>
                <Text style={s.statusText}>{aiStatus[bossAI?.id ?? ''] ?? 'Arranging...'}</Text>
              </View>
            </View>
            {bossAI && <AIPiles aiId={bossAI.id} />}
            {/* Patch: ไพ่ Call หงาย ย้ายลงมาใต้ AIPiles (ใต้หลังไพ่) */}
            {bossAI && phase === 'grand_finale' && <GFCardsForPlayer playerId={bossAI.id} size="normal" />}
          </View>

          {/* MAIN AREA */}
          <View style={[s.mainArea, { opacity: (phase === 'countdown' || phase === 'showdown' || phase === 'result' || phase === 'grand_finale' || phase === 'grand_finale_done') ? 0 : 1 }]}>
            <View style={[s.sideCol, { paddingLeft: 10 }]}>
              <Text style={s.sideName}>{p2AI?.emoji ?? 'P2'}</Text>
              <View style={{ marginTop: 4, marginBottom: 60 }}>
                <AvatarBubble emoji={p2AI?.emoji ?? '👤'} size={36} image={p2AI?.name ? MINION_AVATAR[p2AI.name] : undefined} />
                {p2AI && <GFStatusBadge playerId={p2AI.id} />}
                {p2AI && <GFHealthBar playerId={p2AI.id} />}
              </View>
              {p2AI && <SideSeat rot="270deg" aiId={p2AI.id} />}
              {/* Patch: ไพ่ Call หงาย — ลอยที่ bottom ของ sideCol ไม่กระทบ SideSeat */}
              {p2AI && phase === 'grand_finale' && (
                <View style={{ position: 'absolute', bottom: 4, left: 0, right: 0, alignItems: 'center' }}>
                  <GFCardsForPlayer playerId={p2AI.id} size="normal" />
                </View>
              )}
            </View>

            <View style={s.commWrap}>
              {/* Patch: ตอน Fog of War — โชว์ไพ่ชุดที่ชนะ Pile1+2 (รวม Community 5 ใบ) ให้จำ ก่อน Auction */}
              {phase === 'fog_of_war' && (
                <Animated.View style={{ marginBottom: -8, alignItems: 'center', marginLeft: 40, opacity: pileFadeAnim }}>
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
              {phase !== 'grand_finale' && phase !== 'grand_finale_done' && (
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
              {/* Pile 1 & 2 แถวเดียวกัน — ซ่อนทั้งแถวตอน Fog of War เหลือแค่ Pile 3 */}
              {(phase === 'arrangement' || phase === 'arrangement_2') && (
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
                  <CommRow pileNum={1} k1={comm.p1[0]} k2={comm.p1[1]} />
                  {/* Patch: Community Row 2 เลื่อนขวา +25px */}
                  <View style={{ marginLeft: 25 }}>
                    <CommRow pileNum={2} k1={comm.p2[0]} k2={comm.p2[1]} />
                  </View>
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
                  fontSize: 20, fontWeight: '900', color: '#8DFFB5', letterSpacing: 3,
                  opacity: fogBlinkAnim,
                  textShadowColor: 'rgba(141,255,181,0.6)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 },
                }}>
                  FOG OF WAR
                </Animated.Text>
              )}
            </View>

            <View style={[s.sideCol, { paddingRight: 10 }]}>
              <Text style={s.sideName}>{p4AI?.emoji ?? 'P4'}</Text>
              <View style={{ marginTop: 4, marginBottom: 60 }}>
                <AvatarBubble emoji={p4AI?.emoji ?? '👤'} size={36} image={p4AI?.name ? MINION_AVATAR[p4AI.name] : undefined} />
                {p4AI && <GFStatusBadge playerId={p4AI.id} />}
                {p4AI && <GFHealthBar playerId={p4AI.id} />}
              </View>
              {p4AI && <SideSeat rot="90deg" aiId={p4AI.id} />}
              {/* Patch: ไพ่ Call หงาย — ลอยที่ bottom ของ sideCol ไม่กระทบ SideSeat */}
              {p4AI && phase === 'grand_finale' && (
                <View style={{ position: 'absolute', bottom: 4, left: 0, right: 0, alignItems: 'center' }}>
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

            <Text style={[s.swapHint, { opacity: selected ? 1 : 0 }]}>กดไพ่ใบที่ต้องการสลับตำแหน่ง</Text>
            {hasFoul[PLAYER_ID] && <Text style={s.foulText}>⚠️ FOUL{foulReasons[PLAYER_ID] ? ` — ${foulReasons[PLAYER_ID]}` : ''}</Text>}


            {(isRevealed && phase !== 'fog_of_war' && phase !== 'grand_finale' && phase !== 'grand_finale_done' && phase !== 'blind_auction' && phase !== 'auction_done' && phase !== 'discard' && phase !== 'discard_done') ? ( // Patch: ทุก phase ของ Mastermind หลัง Fog of War ใช้ branch Pile3-only ด้านล่าง
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                {[1, 2, 3].flatMap(pNum => userRevealed[pNum] ?? []).map((key, ci) => (
                  <View key={ci} style={[s.userCard, { zIndex: ci }]}>
                    {CARD_IMG[key] && <Image source={CARD_IMG[key]} style={{ width: CW, height: CH }} resizeMode="cover" />}
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ gap: 4 }}>
                {/* แถวบน: Pile 1 + Pile 2 แยกซ้ายขวา — ซ่อนทุก Phase หลัง Fog of War (เฉลยไปแล้ว เหลือแค่ Pile 3) */}
                {(phase === 'arrangement' || phase === 'arrangement_2') && <View style={{ flexDirection: 'row', gap: 6 }}>
                  <View style={{ flexDirection: 'column', alignItems: 'center' }}>
                    <Text style={[s.pileLabel, { marginBottom: 2 }]}>PILE 1</Text>
                    <View style={{ flexDirection: 'row', marginRight: CW / 2 }}>
                      {piles[0].map((card, ci) => (
                        <FaceCard key={card.id} card={card} pi={0} ci={ci} first={ci === 0} />
                      ))}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'column', alignItems: 'center' }}>
                    <Text style={[s.pileLabel, { marginBottom: 2 }]}>PILE 2</Text>
                    <View style={{ flexDirection: 'row', marginLeft: CW / 2 }}>
                      {piles[1].map((card, ci) => (
                        <FaceCard key={card.id} card={card} pi={1} ci={ci} first={ci === 0} />
                      ))}
                    </View>
                  </View>
                </View>}
                {/* แถวล่าง: Pile 3 */}
                {/* Patch Grand Finale: ถ้า Human Call หงายไพ่ขึ้นมาด้านบน Pile 3 (รองรับหลายใบจาก Call หลายรอบ) */}
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
                <View style={{ flexDirection: 'column', alignItems: 'center' }}>
                  <Text style={[s.pileLabel, { marginBottom: 2 }]}>PILE 3</Text>
                  <View style={{ flexDirection: 'row', alignSelf: 'center' }}>
                    {(phase === 'grand_finale' && (gfRevealedCards[PLAYER_ID]?.length ?? 0) > 0
                      ? piles[2].filter(c => !(gfRevealedCards[PLAYER_ID] ?? []).includes(c.key))
                      : piles[2]
                    ).map((card, ci) => (
                      <TouchableOpacity key={card.id}
                        onPress={() => handleCardPress(2, ci)}
                        activeOpacity={0.85}
                        style={[s.userCard, ci > 0 && { marginLeft: -24 },
                          selected?.pi === 2 && selected?.ci === ci && s.userCardSel,
                          { zIndex: ci }]}>
                        {CARD_IMG[card.key]
                          ? <Image source={CARD_IMG[card.key]} style={{ width: CW, height: CH }} resizeMode="cover" />
                          : <Text style={{ fontSize: 8 }}>{card.key}</Text>}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}
          </View>

          </Animated.View>
          {/* USER AVATAR — มุมล่างซ้าย (ซ่อนตอน Grand Finale เพราะ Overlay มี Avatar P1 แล้ว) — Feedback C2: ใช้ myAvatarEmoji/myDisplayName จริง */}
          {/* bottom ต้องพ้น actionBar (paddingTop 4 + ปุ่มสูง ~87 + paddingBottom 20 = ~111) กันซ้อนปุ่ม Auto Sort */}
          <View style={{ position: 'absolute', bottom: 120, left: 10, zIndex: 10, opacity: (phase === 'showdown' || phase === 'result' || phase === 'grand_finale' || phase === 'grand_finale_done') ? 0 : 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AvatarBubble emoji={myAvatarEmoji} size={40} />
            <Text style={s.userNameTag} numberOfLines={1}>{myDisplayName}</Text>
          </View>

          {/* ACTION BAR */}
          {phase === 'fog_of_war' && (
            <View style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: '#8DFFB5', fontSize: 12, fontWeight: '700' }}>🌫 Fog of War — เหลือ Pile 3 ในมือคุณเท่านั้นที่เห็น</Text>
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

                // PanResponder ตรวจ swipe down (จับเฉพาะเมื่อเป็นตา Human)
                const panResponder = isMyTurn
                  ? PanResponder.create({
                      onStartShouldSetPanResponder: () => false,
                      onMoveShouldSetPanResponder: (_, g) => g.dy > 20 && Math.abs(g.dy) > Math.abs(g.dx),
                      onPanResponderRelease: (_, g) => {
                        if (g.dy > 50) {
                          socketRef.current?.emit('hn_grand_finale_action', { roomId: ROOM_ID, userId: PLAYER_ID, action: 'fold' })
                        }
                      },
                    })
                  : null

                return (
                  <View style={{ flexDirection: 'row', alignSelf: 'center' }} {...(panResponder?.panHandlers ?? {})}>
                    {cards.map((c, i) => {
                      const isCalled = calledKeys.includes(c.key)
                      const isSelected = isMyTurn && !isCalled && c.key === effectiveSelected
                      const handlePress = !isMyTurn || isCalled ? undefined : () => {
                        if (effectiveSelected === c.key) {
                          socketRef.current?.emit('hn_grand_finale_action', {
                            roomId: ROOM_ID, userId: PLAYER_ID, action: 'call', revealedCardKey: c.key,
                          })
                        } else {
                          setGfSelectedCardKey(c.key)
                        }
                      }
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
                        // Patch: ไพ่ที่ AI Call แล้วยกขึ้น 10px ให้เห็นโดดเด่น
                        transform: [{ translateY: isCalledSlot ? -10 : 0 }],
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
            const SeatHeader: React.FC<{ pid: string; emoji: string; name: string; image?: any; glow?: boolean }> = ({ pid, emoji, name, image, glow }) => (
              <View style={{ alignItems: 'center', gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AvatarBubble emoji={emoji} size={32} image={image} glow={glow} />
                  <Text style={{ color: '#FFD76A', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>{name}</Text>
                </View>
                <GFStatusBadge playerId={pid} />
                <GFHealthBar playerId={pid} />
              </View>
            )
            return (
              <View style={{ position: 'absolute', top: 60, left: 0, right: 0, bottom: 0, zIndex: 40, paddingHorizontal: 10 }} pointerEvents="box-none">
                {/* ═══ P3 (Boss) บนสุด ═══ */}
                {bossAI && (
                  <View style={{ alignItems: 'center', marginTop: 4, gap: 4 }}>
                    <SeatHeader pid={bossAI.id} emoji={bossAI.emoji} name={bossAI.name} image={bossAI?.name ? BOSS_AVATAR[bossAI.name] : undefined} glow />
                    <GFPile3Row playerId={bossAI.id} />
                  </View>
                )}
                {/* ═══ Middle row: [P2 | P4] (Community ย้ายไปแถวล่างถัดไป) ═══ */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 14, paddingHorizontal: 4 }}>
                  {p2AI && (
                    <View style={{ alignItems: 'flex-start', gap: 4 }}>
                      <SeatHeader pid={p2AI.id} emoji={p2AI.emoji} name={p2AI.name} image={MINION_AVATAR[p2AI.name]} />
                      <GFPile3Row playerId={p2AI.id} />
                    </View>
                  )}
                  {p4AI && (
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <SeatHeader pid={p4AI.id} emoji={p4AI.emoji} name={p4AI.name} image={MINION_AVATAR[p4AI.name]} />
                      <GFPile3Row playerId={p4AI.id} />
                    </View>
                  )}
                </View>
                {/* ═══ Pile 3 Community — ย้ายมาแถวล่างของ P2/P4 (พื้นที่ว่างใกล้โลโก้) ═══ */}
                <View style={{ alignItems: 'center', marginTop: 2 }}>
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
                {/* ═══ Center: ตัวอักษร YOUR TURN กลาง — render ผ่าน GRAND FINALE BIG TEXT เดิม ═══ */}
                {/* ═══ P1 (Human) ล่าง ═══ */}
                <View style={{ position: 'absolute', bottom: 70, left: 0, right: 0, gap: 6 }} pointerEvents="box-none">
                  {/* Avatar + Status + Health ชิดซ้าย */}
                  <View style={{ alignItems: 'flex-start', paddingLeft: 14, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AvatarBubble emoji={myAvatarEmoji} size={32} />
                      <Text style={{ color: '#FFD76A', fontSize: 11, fontWeight: '700', letterSpacing: 1 }} numberOfLines={1}>{myDisplayName}</Text>
                    </View>
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
            <View style={{ position: 'absolute', bottom: 10, left: 0, right: 0, alignItems: 'center', zIndex: 80, flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
              <View pointerEvents="none" style={{ backgroundColor: 'rgba(15,36,24,0.85)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#FFD76A' }}>
                <Text style={{ color: '#FFD76A', fontSize: 11, fontWeight: '700', letterSpacing: 1, textAlign: 'center' }}>
                  TAP CARD TO MARK ✓ · TAP AGAIN TO CALL (-{gfCallAmount.current})
                </Text>
                <Text style={{ color: '#C8C4B0', fontSize: 10, marginTop: 2, textAlign: 'center' }}>
                  ▼ SWIPE DOWN OR TAP FOLD ▼
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => socketRef.current?.emit('hn_grand_finale_action', { roomId: ROOM_ID, userId: PLAYER_ID, action: 'fold' })}
                style={{ backgroundColor: '#5e1a1a', borderWidth: 1.5, borderColor: '#f87171', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18, justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 1 }}>FOLD ✗</Text>
              </TouchableOpacity>
            </View>
          )}
          {phase !== 'dealing' && phase !== 'showdown' && phase !== 'result' && phase !== 'fog_of_war' && phase !== 'grand_finale' && <View style={s.actionBar}>
            <ActionButton
              icon="auto_sort"
              label={sortDone ? 'Sorted ✓' : 'Auto Sort'}
              variant={sortDone ? 'disabled' : 'normal'}
              disabled={sortDone || (phase !== 'arrangement' && phase !== 'arrangement_2')}
              costBadge="250"
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
        {/* ── SHOWDOWN RESULT (กลางจอ) — Feedback C5: ครอบด้วยพื้นหลัง free/vip ชุดเดียวกับ Profile/Lobby ── */}
        {showResult && (phase === 'showdown' || phase === 'result') && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: -200, zIndex: 200 }}>
            <ImageBackground source={isVip ? SHOWDOWN_BG_VIP : SHOWDOWN_BG_FREE} resizeMode="cover" style={{ flex: 1, padding: 12 }}>
              <ShowdownResult />
            </ImageBackground>
          </View>
        )}
        <ServerLog />
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

  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, zIndex: 2 },
  studioLogo: { width: 28, height: 28, opacity: 0.9 },
  tierBadge:  { borderWidth: 1.5, borderColor: '#38bdf8', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(56,189,248,0.12)' },
  tierText:   { fontSize: 8, color: '#38bdf8', letterSpacing: 2, fontWeight: '800' },
  roundText:  { fontSize: 9, color: '#38bdf8', fontWeight: '800' },
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
  sideSeatWrap:  { flex: 1, width: SIDE_COL_W, overflow: 'visible', justifyContent: 'flex-start', alignItems: 'center' },
  sideSeatInner: { flexDirection: 'row', alignItems: 'center' },

  commWrap:    { flex: 1, paddingLeft: 4, alignItems: 'flex-start', justifyContent: 'center', zIndex: 2 },
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

  // Match end
  buyInSummaryRow:  { alignItems: 'center', marginBottom: 8 },
  buyInSummaryText: { fontSize: 10, fontFamily: 'JetBrainsMono_400Regular', color: '#C8C4B0', textAlign: 'center' },
  matchEndSub:   { fontSize: 10, color: 'rgba(201,168,76,0.5)', letterSpacing: 2, marginBottom: 10, textAlign: 'center' },
  matchEndRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#1e2e22' },
  matchEndName:  { flexShrink: 1, marginRight: 8, fontSize: 13, color: '#e8dfc0', fontWeight: '600' },
  matchEndBal:   { flexShrink: 0, fontSize: 13, fontWeight: '800' },

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
