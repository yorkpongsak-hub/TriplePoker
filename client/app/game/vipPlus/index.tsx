import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, BackHandler, Image, ImageBackground, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View, ViewStyle } from 'react-native'
import Animated, { Easing, SharedValue, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { io, Socket } from 'socket.io-client'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuthStore } from '../../../src/store/authStore'
import Card, { Suit, Value } from '../../../src/components/game/Card'
import GameTopBar from '../../../src/components/game/GameTopBar'
import VipPlusAuctionOverlay from '../../../src/components/game/VipPlusAuctionOverlay'
import MatchEndOverlay from '../../../src/components/game/MatchEndOverlay'
import { glassPanelDense } from '../../../src/ui/glassStyles'
import { useTableSkins } from '../../../src/hooks/useTableSkins'
import { TABLE_SKINS } from '../../../src/config/tableSkins'
import BossVictoryVFX from '../../../src/components/vfx/BossVictoryVFX'
import FlyingCoins, { FlyingCoinsHandle, Point } from '../../../src/components/game/FlyingCoins'
import { AvatarDisplay, PRESET_AVATARS } from '../../../src/components/profile/AvatarPicker'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'
const TABLE_IMAGE = require('../../../assets/images/table_default.png')
const ACTIVE_MATCH_KEY = 'vip_plus_active_match'
const SEATS = ['H1', 'H2', 'H3', 'H4', 'H5'] as const
const OPTIONS = ['INITIATE_WAGER', 'ADEPT_WAGER', 'MASTERMIND_WAGER'] as const
type Seat = typeof SEATS[number]
type OptionId = typeof OPTIONS[number]
type Arrangement = { g1: string[]; g2: string[]; g3: string[] }

interface Wager {
  optionId: OptionId
  bettingTier: string
  buyInTier: string
  ante: { pile1: number; pile2: number; pile3: number }
  callAmount: number
  buyIn: number
  rake: number
  auctionBidAmounts: [number, number, number, number]
}

// ทดลองมติลุงเยาะ — host เลือกตอนเปิดโต๊ะ ใช้เหมือนกันทั้ง 3 เกมของแมตช์นี้ (ผูกกับ ruleset ไม่ใช่ gameNumber)
// HOLDEM_G3 (รอบ 3) — มือผู้เล่นเปลี่ยนเป็น 3-3-2 (G3 = 2 hole cards, ให้คะแนนร่วมกับกองกลาง G3 อีก 5 ใบ
// แบบ best-of-7 ดู server/src/game/vipPlusMatchEngine.ts's evaluateVipPlusPile) — mirror ค่าจาก
// server/src/game/vipPlusFoundation.ts's VIP_PLUS_LAYOUT.playerHandByRuleset ต้องแก้พร้อมกันถ้าเปลี่ยน
type CenterRuleset = 'WITH_G3_CENTER' | 'NO_G3_CENTER' | 'HOLDEM_G3'
const PLAYER_HAND_LAYOUT: Record<CenterRuleset, [number, number, number]> = {
  WITH_G3_CENTER: [2, 2, 5],
  NO_G3_CENTER: [2, 2, 5],
  HOLDEM_G3: [3, 3, 2],
}
function playerHandTotal(ruleset: CenterRuleset): number {
  return PLAYER_HAND_LAYOUT[ruleset].reduce((a, b) => a + b, 0)
}
function handLayoutLabel(ruleset: CenterRuleset): string {
  return PLAYER_HAND_LAYOUT[ruleset].join('-')
}
function centerRulesetLabel(ruleset: CenterRuleset): string {
  if (ruleset === 'WITH_G3_CENTER') return '3-3-1'
  if (ruleset === 'NO_G3_CENTER') return '3-3-0'
  return "Hold'em 3-3-2"
}

interface WaitingTable {
  tableId: string
  status: 'WAITING' | 'READY'
  wager: Wager
  // Batch 1 (VIP-05 fix, C4/C5) — host โอนได้แล้ว ไม่ใช่ H1 เสมอไปอีกต่อไป
  hostSeat: Seat
  seats: Array<{ seat: Seat; displayName: string; avatarUrl?: string | null; isVip?: boolean; confirmed: boolean; connected: boolean }>
  requiredPlayers: 5
  minimumPlayers: 3
  canHostStart: boolean
  reducedStartApproved: boolean
  entryTermsVersion: string
  centerRuleset: CenterRuleset
  foulRuleEnabled: boolean
}

interface GameView {
  gameNumber: 1 | 2 | 3
  phase: 'INITIAL_ARRANGE' | 'BETTING' | 'BLIND_AUCTION' | 'REARRANGE'
  deadlineAt: number
  center: { g1: string[]; g2: string[]; g3: string[] }
  seats: Array<{ seat: Seat; displayName: string; avatarUrl?: string | null; isVip?: boolean; status?: 'CONNECTED' | 'DISCONNECTED' | 'FORFEITED' | 'BLANK'; isBlank?: boolean }>
  wager: Wager | null
  hand: string[]
  arrangement: Arrangement
  locked: boolean
  actingSeat: Seat | null
  bettingRound: number
  group: number
  groupRound: number
  // มติลุงเยาะ (รอบ 9 — "เข้มข้นยิ่งขึ้น") — เดิมพันจริงของตาปัจจุบัน (1x/2x/4x ตาม group/groupRound) มาจาก
  // server ตรงๆ ทุกครั้ง (betting_turn/match_snapshot) ไม่คำนวณเองฝั่ง client กันเลขเพี้ยนถ้าตัวคูณเปลี่ยนทีหลัง
  currentCallAmount: number
  pot: [number, number, number]
  balances: Partial<Record<Seat, number>>
  folded: Partial<Record<Seat, number>>
  auctionBidAmounts: number[]
  lockedBid: number | null
  auctionCard: string | null
  auctionWinnerSeat: Seat | null
  // มติลุงเยาะ 2026-08-04: ไพ่ที่หงายไปแล้วตอน CALL ระหว่าง Betting — public info เรียงตาม seat -> group
  // (scope ตาม group กันนับปนข้ามกอง ดู server/src/game/vipPlusMatchEngine.ts's revealedCards)
  revealedCards: Partial<Record<Seat, Partial<Record<number, string[]>>>>
  // ทดลองมติลุงเยาะ (เทสมือถือรอบ 2) — มาจาก game_started/match_snapshot ตรงๆ ไม่พึ่ง table (Waiting Chamber
  // state) เพราะ reconnect กลางแมตช์อาจไม่มี table เดิมให้ใช้เลย
  centerRuleset: CenterRuleset
  foulRuleEnabled: boolean
}

// Feedback ลุงเยาะ (บั๊กเทสมือถือรอบ 2, ปรับรอบ 3 ให้รับ ruleset ตรงๆ) — จำนวนไพ่ต่อกอง "ที่ผู้เล่นถืออยู่จริง"
// (ใช้เรนเดอร์หลังไพ่/ใบหงายของคนอื่นให้ครบจำนวนจริง ไม่รวมไพ่กองกลางที่โชว์แยกอยู่แล้ว) G1/G2 อ่านจาก
// PLAYER_HAND_LAYOUT ตรงๆ (2 ปกติ, 3 ตอน HOLDEM_G3) ส่วน G3: WITH_G3_CENTER มีใบทิ้งบังคับเหลือ 4 (จาก 5),
// NO_G3_CENTER เต็ม 5, HOLDEM_G3 มีแค่ 2 ใบ hole card ในมือ (อีก 5 ใบเป็นกองกลางสาธารณะ ไม่ใช่ไพ่ที่ถือ)
function groupPileSize(group: number, ruleset: CenterRuleset): number {
  const [g1Size, g2Size, g3Size] = PLAYER_HAND_LAYOUT[ruleset]
  if (group === 1) return g1Size
  if (group === 2) return g2Size
  return ruleset === 'WITH_G3_CENTER' ? g3Size - 1 : g3Size
}
// ไพ่ของ P1 ตอน Betting ต้องใหญ่กว่าไพ่ของคนอื่นเสมอ (มติลุงเยาะ 2026-08-04)
// Batch 2 (VIP-07/08) — ขยายขนาดไพ่กองกลาง + ไพ่คู่ต่อสู้ตอน BETTING ตามตัวเลขที่ลุงเยาะคำนวณมาแล้ว
const CENTER_CW = 49, CENTER_CH = 71
const OPP_CW = 44, OPP_CH = 64
const OWN_BET_CW = 50, OWN_BET_CH = 72

// Batch 4 (VIP-09) — พิกัดโดยประมาณสำหรับ Coin Flying VFX เทียบจากจุดกึ่งกลางจอ (x:0,y:0) ตาม pattern
// เดียวกับ SEAT_TARGETS ของ Mastermind (mastermind/index.tsx) ⚠️ เป็นค่าประมาณจาก layout (remoteSeatPosition
// / centerZone marginTop:68 / localZone อยู่นอก tableArea) ยังไม่เคยวัดบนอุปกรณ์จริง — ต้องให้ลุงเยาะเทส
// แล้วขยับตัวเลขถ้าเหรียญบินไม่ตรงตำแหน่งที่นั่ง (Mastermind เองก็เริ่มจากค่าประมาณแบบนี้เหมือนกัน)
const VIP_PLUS_SEAT_TARGETS: Record<'center' | 'local' | 'remote0' | 'remote1' | 'remote2' | 'remote3', Point> = {
  center: { x: 0, y: -80 },
  local: { x: 0, y: 220 },
  remote0: { x: -110, y: -220 }, // top-left
  remote1: { x: 110, y: -220 },  // top-right
  remote2: { x: -150, y: -20 },  // mid-left
  remote3: { x: 150, y: -20 },   // mid-right
}

// จำนวนใบที่ต้องหงายตอน CALL — ปกติ 1 ใบเสมอ ยกเว้น G3 รอบแรก (groupRound 1) ที่ต้องหงายให้ "รวมกับไพ่
// กองกลาง G3 เป็น 3 ใบเสมอ" (ผู้เล่นอื่นถึงจะอ่านไพ่ชุดที่ดีที่สุดได้) — mirror requiredVipPlusRevealCount
// ฝั่ง server (server/src/game/vipPlusMatchEngine.ts) ต้องแก้พร้อมกันถ้าค่าเปลี่ยน
function requiredRevealCount(group: number, groupRound: number, centerG3Count: number): number {
  if (group === 3 && groupRound === 1) return Math.max(0, 3 - centerG3Count)
  return 1
}

interface RankingRow {
  seat: Seat; playerId: string; displayName: string; netToken: number; totalGroupWins: number
  g3Wins: number; finalStack: number; rank: number; isWinner: boolean
}
// มติลุงเยาะ (รอบ 12) — ค่าธรรมเนียมท้ายแมตช์ 10% (เฉพาะกำไรสุทธิที่เป็นบวก) รวมทั้งโต๊ะ มาจาก server ตรงๆ
interface MatchResult { rankings: RankingRow[]; winnerSeats: Seat[]; walletBalances?: Partial<Record<Seat, number>>; auctionBurn?: number; profitFeeTotal?: number }

const emptyGame = (): GameView => ({
  gameNumber: 1, phase: 'INITIAL_ARRANGE', deadlineAt: 0,
  center: { g1: [], g2: [], g3: [] }, seats: [], wager: null,
  hand: [], arrangement: { g1: [], g2: [], g3: [] }, locked: false,
  actingSeat: null, bettingRound: 0, group: 1, groupRound: 1, currentCallAmount: 0, pot: [0, 0, 0], balances: {}, folded: {},
  auctionBidAmounts: [], lockedBid: null, auctionCard: null, auctionWinnerSeat: null,
  revealedCards: {},
  centerRuleset: 'WITH_G3_CENTER', foulRuleEnabled: true,
})

export default function VipPlusTableScreen() {
  const insets = useSafeAreaInsets()
  const { activeSkin } = useTableSkins()
  const selectedTableImage = TABLE_SKINS[activeSkin] ?? TABLE_IMAGE
  const session = useAuthStore(s => s.session)
  const profile = useAuthStore(s => s.profile)
  const userId = session?.user.id ?? ''
  const accessToken = session?.access_token ?? null
  const socketRef = useRef<Socket | null>(null)
  const activeTableIdRef = useRef<string | null>(null)
  const selfSeatRef = useRef<Seat | null>(null)
  const victoryShownRef = useRef(false)
  // Batch 1 (VIP-05 fix, C1) — กัน cleanup ยิง leave_table ซ้ำถ้าผู้เล่นกด LEAVE TABLE/FORFEIT เองไปแล้ว
  const hasLeftRef = useRef(false)
  // Batch 1 (VIP-05 fix, C7) — แมตช์เริ่มไปแล้วหรือยัง ใช้กันไม่ให้ cleanup/back เผลอยิง leave_table
  // (leave_table ใช้ได้เฉพาะช่วง Waiting Chamber เท่านั้น เข้าแมตช์แล้วต้องใช้ FORFEIT)
  const matchStartedRef = useRef(false)
  // Batch 1 (VIP-05 fix, C3) — เทียบ hostSeat เดิมกับใหม่เพื่อโชว์ toast เฉพาะตอน "เปลี่ยน" จริงๆ
  const lastHostSeatRef = useRef<Seat | null>(null)
  // Batch 4 (VIP-09) — Coin Flying VFX (reuse FlyingCoins ตัวเดียวกับ Mastermind) + floating token text id counter
  const flyingCoinsRef = useRef<FlyingCoinsHandle>(null)
  const floatingIdRef = useRef(0)
  const [tables, setTables] = useState<WaitingTable[]>([])
  const [table, setTable] = useState<WaitingTable | null>(null)
  const [selfSeat, setSelfSeat] = useState<Seat | null>(null)
  const [game, setGame] = useState<GameView>(() => emptyGame())
  const [screen, setScreen] = useState<'BROWSER' | 'WAITING' | 'GAME'>('BROWSER')
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  // ทดลองมติลุงเยาะ — host เลือกกติกาก่อนกด CREATE TABLE ค่าเริ่มต้น = กติกาหลักเดิมทั้งคู่
  const [centerRuleset, setCenterRuleset] = useState<CenterRuleset>('WITH_G3_CENTER')
  const [foulRuleEnabled, setFoulRuleEnabled] = useState(true)
  // Feedback ลุงเยาะ (เทสมือถือรอบ 2) — การ์ดกติกาแมตช์ในหน้าเล่นเกมจริง (แยกจาก centerRuleset/foulRuleEnabled
  // ด้านบนที่เป็นแค่ตัวเลือกตอน host กำลังเปิดโต๊ะ) ปิดไว้เป็นค่าเริ่มต้น กดแท็บเพื่อเลื่อนลงมาดูรายละเอียด
  const [rulesPanelOpen, setRulesPanelOpen] = useState(false)
  const [showPrivateAuctionCard, setShowPrivateAuctionCard] = useState(false)
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null)
  const [showVictoryVfx, setShowVictoryVfx] = useState(false)
  const [hostToast, setHostToast] = useState(false)
  // ใบที่ P1 เลือกไว้ว่าจะหงายตอนกด CALL รอบเดิมพันปัจจุบัน — reset ทุกครั้งที่ถึงตาใหม่/CALL สำเร็จ
  // เป็น array เพราะ G3 รอบแรก (groupRound 1) ต้องหงายมากกว่า 1 ใบ (ดู requiredRevealCount)
  const [bettingRevealKeys, setBettingRevealKeys] = useState<string[]>([])
  // Batch 4 (VIP-09) — Round Result banner (ใครชนะกองไหนด้วยไพ่อะไร) auto-dismiss เอง
  // มติลุงเยาะ (รอบ 10) — highlightedCards = ไพ่ 5 ใบที่ใช้จริงในมือที่ชนะ (กระพริบเน้น) แยกจาก cards เต็มชุด
  // (WITH_G3_CENTER/G1/G2 ทุก ruleset highlightedCards เท่ากับ cards เป๊ะ — HOLDEM_G3's G3 เท่านั้นที่ต่างกัน
  // 7 ใบเต็มแต่ highlight แค่ 5 ใบที่ใช้จริง อีก 2 ใบ hole card ที่ไม่ได้ใช้แค่หงายเฉยๆ)
  const [roundResultBanner, setRoundResultBanner] = useState<{ group: number; seat: Seat; handName: string; cards: string[]; highlightedCards: string[] } | null>(null)
  // Batch 4 (VIP-09) — ตัวเลข "+amount T" ลอยขึ้นแล้วจางหายต่อผู้ชนะกอง (หลายอันซ้อนกันได้ถ้าจังหวะชิดกัน)
  const [floatingDeltas, setFloatingDeltas] = useState<Array<{ id: number; seat: Seat; amount: number }>>([])

  const authPayload = useCallback(() => ({ userId, accessToken }), [userId, accessToken])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!userId || profile?.vip_status !== 'vip_pro') {
      Alert.alert('VIP Pro Required', 'This table is available to active VIP Pro members only.', [{ text: 'Back', onPress: () => router.back() }])
      return
    }
    const socket = io(SERVER_URL, { transports: ['websocket'], reconnection: true })
    socketRef.current = socket
    socket.on('connect', async () => {
      socket.emit('vip_plus:list_tables', authPayload())
      const storedTableId = activeTableIdRef.current ?? await AsyncStorage.getItem(ACTIVE_MATCH_KEY)
      if (storedTableId) {
        activeTableIdRef.current = storedTableId
        socket.emit('vip_plus:resume_match', { ...authPayload(), tableId: storedTableId })
      }
    })
    socket.on('vip_plus:tables', (next: WaitingTable[]) => setTables(next))
    socket.on('vip_plus:seat_assigned', (data: { tableId: string; seat: Seat }) => {
      selfSeatRef.current = data.seat
      setSelfSeat(data.seat)
      setScreen('WAITING')
      // Batch 1 (VIP-05 fix, C2) — persist ตั้งแต่ได้ที่นั่งใน Waiting Chamber ไม่ใช่รอ game_started
      // เท่านั้น ถึงจะกลับมากู้ที่นั่งได้ถ้าแอปหลุด/ปิดระหว่างรอ
      activeTableIdRef.current = data.tableId
      hasLeftRef.current = false
      matchStartedRef.current = false
      lastHostSeatRef.current = null
      AsyncStorage.setItem(ACTIVE_MATCH_KEY, data.tableId).catch(() => {})
    })
    socket.on('vip_plus:table_state', (next: WaitingTable) => {
      setTable(next)
      setScreen('WAITING')
      setBusy(false)
      // Batch 1 (VIP-05 fix, C3/C5) — แจ้งเตือนเฉพาะตอน host "เปลี่ยนมาเป็นเรา" จริงๆ ไม่ใช่ครั้งแรกที่เข้าโต๊ะ
      if (lastHostSeatRef.current !== null && lastHostSeatRef.current !== next.hostSeat && next.hostSeat === selfSeatRef.current) {
        setHostToast(true)
        setTimeout(() => setHostToast(false), 4000)
      }
      lastHostSeatRef.current = next.hostSeat
    })
    socket.on('vip_plus:table_closed', () => {
      setTable(null)
      setSelfSeat(null)
      setScreen('BROWSER')
      activeTableIdRef.current = null
      AsyncStorage.removeItem(ACTIVE_MATCH_KEY).catch(() => {})
      socket.emit('vip_plus:list_tables', authPayload())
    })
    socket.on('vip_plus:game_started', (data: any) => {
      activeTableIdRef.current = data.roomId
      matchStartedRef.current = true
      AsyncStorage.setItem(ACTIVE_MATCH_KEY, data.roomId).catch(() => {})
      setScreen('GAME')
      setGame(prev => ({
        ...prev, gameNumber: data.gameNumber, phase: data.phase, deadlineAt: data.deadlineAt,
        center: data.center, seats: data.seats ?? prev.seats, wager: data.wager ?? prev.wager ?? table?.wager ?? null,
        hand: [], arrangement: { g1: [], g2: [], g3: [] }, locked: false,
        actingSeat: null, bettingRound: 0, group: 1, groupRound: 1, currentCallAmount: 0, auctionCard: null, lockedBid: null,
        auctionBidAmounts: [], auctionWinnerSeat: null, revealedCards: {},
        pot: data.pot ?? prev.pot,
        // ทดลองมติลุงเยาะ (เทสมือถือรอบ 2) — มาจาก server ตรงๆ ทุกเกม ไม่พึ่ง table (Waiting Chamber state)
        centerRuleset: data.centerRuleset ?? prev.centerRuleset,
        foulRuleEnabled: data.foulRuleEnabled ?? prev.foulRuleEnabled,
      }))
      setBettingRevealKeys([])
    })
    socket.on('vip_plus:private_hand', (data: { cards: string[] }) => {
      setGame(prev => ({ ...prev, hand: data.cards, arrangement: autoArrange(data.cards, prev.centerRuleset), locked: false }))
    })
    socket.on('vip_plus:arrangement_result', (result: { ok: boolean; reason?: string }) => {
      setBusy(false)
      if (!result.ok) Alert.alert('Arrangement Rejected', friendlyError(result.reason))
      else setGame(prev => ({ ...prev, locked: true }))
    })
    socket.on('vip_plus:rearrangement_result', (result: { ok: boolean; reason?: string }) => {
      setBusy(false)
      if (!result.ok) Alert.alert('Rearrangement Rejected', friendlyError(result.reason))
      else setGame(prev => ({ ...prev, locked: true }))
    })
    socket.on('vip_plus:betting_turn', (data: any) => {
      setGame(prev => ({
        ...prev, phase: 'BETTING', deadlineAt: data.deadlineAt, actingSeat: data.actingSeat,
        bettingRound: data.bettingRound, group: data.group, groupRound: data.groupRound ?? prev.groupRound,
        // มติลุงเยาะ (รอบ 4, HOLDEM_G3) — server ส่ง center มาทุกตาแล้ว (เปิด Turn/River ทีละใบ) merge ทับ
        // ของเดิมตรงๆ ruleset อื่นค่าไม่เปลี่ยนอยู่แล้ว (server ส่งค่าเดิมซ้ำ)
        center: data.center ?? prev.center,
        // มติลุงเยาะ (รอบ 9) — เดิมพันจริงของตานี้ (1x/2x/4x) มาจาก server ตรงๆ ทุกตา
        currentCallAmount: data.callAmount ?? prev.currentCallAmount,
      }))
      setBettingRevealKeys([])
    })
    socket.on('vip_plus:betting_action', (data: any) => {
      setGame(prev => ({
        ...prev,
        pot: data.pot,
        folded: data.action === 'FOLD' ? { ...prev.folded, [data.actingSeat]: data.group } : prev.folded,
        revealedCards: (data.revealedCards?.length ?? 0) > 0
          ? {
              ...prev.revealedCards,
              [data.actingSeat]: {
                ...prev.revealedCards[data.actingSeat as Seat],
                [data.group]: [...(prev.revealedCards[data.actingSeat as Seat]?.[data.group] ?? []), ...data.revealedCards],
              },
            }
          : prev.revealedCards,
      }))
      if (data.actingSeat === selfSeatRef.current) setBettingRevealKeys([])
    })
    socket.on('vip_plus:group_settled', (data: {
      gameNumber: number; group: number; winnerSeat: Seat | null; winnerHandName: string | null
      winningCards: string[]; highlightedCards?: string[]; payout: number; tokenBalance: Partial<Record<Seat, number>>
    }) => {
      setGame(prev => ({ ...prev, balances: data.tokenBalance }))
      // Feedback ลุงเยาะ (เทสมือถือรอบ 1, ปรับรอบ 3: 10วิ->6วิ) — server หน่วงจริง resultDisplayMs (6 วิ)
      // ก่อนไปกอง/เกมถัดไป (ดู vipPlusMatchEngine.ts's finishBettingRound / gameConfig.ts's vipPlus5)
      // client เลยแค่โชว์ overlay จนกว่า event ถัดไปจะมาแทนที่ (ไม่ต้องหน่วงเองซ้ำ) auto-dismiss 6 วิ เป็น
      // safety net เฉยๆ เผื่อ event ถัดไปมาช้าผิดปกติ — ต้องตรงกับ gameConfig.vipPlus5.resultDisplayMs เสมอ
      // เฉพาะตอนมีผู้ชนะจริง (all-fold ทั้งกอง winnerSeat เป็น null ไม่มีอะไรให้ฉลอง)
      if (data.winnerSeat && data.winnerHandName) {
        setRoundResultBanner({
          group: data.group, seat: data.winnerSeat, handName: data.winnerHandName, cards: data.winningCards,
          // มติลุงเยาะ (รอบ 10) — fallback เป็น cards ทั้งชุด (blink ทุกใบ) เผื่อ server รุ่นเก่าที่ยังไม่ส่ง
          // highlightedCards มา (ไม่ควรเกิดจริงหลัง restart nodemon แต่กันพังไว้)
          highlightedCards: data.highlightedCards ?? data.winningCards,
        })
        setTimeout(() => setRoundResultBanner(prev => (prev?.group === data.group && prev.seat === data.winnerSeat ? null : prev)), 6_000)
        const target = seatTargetForSeat(data.winnerSeat, selfSeatRef.current)
        const coinVariant = data.group === 1 ? 'pile1' : data.group === 2 ? 'pile2' : 'pile3'
        flyingCoinsRef.current?.fire(coinVariant, VIP_PLUS_SEAT_TARGETS.center, target)
        if (data.payout > 0) {
          const id = ++floatingIdRef.current
          setFloatingDeltas(prev => [...prev, { id, seat: data.winnerSeat!, amount: data.payout }])
          setTimeout(() => setFloatingDeltas(prev => prev.filter(d => d.id !== id)), 1600)
        }
      }
    })
    socket.on('vip_plus:game_result', (data: any) => setGame(prev => ({ ...prev, balances: data.tokenBalance })))
    socket.on('vip_plus:auction_started', (data: any) => setGame(prev => ({
      ...prev, phase: 'BLIND_AUCTION', deadlineAt: data.deadlineAt, auctionBidAmounts: data.bidAmounts, lockedBid: null,
    })))
    socket.on('vip_plus:auction_bid_locked', (data: { amount: number }) => setGame(prev => ({ ...prev, lockedBid: data.amount })))
    socket.on('vip_plus:auction_card_private', (data: { card: string }) => {
      setShowPrivateAuctionCard(true)
      setGame(prev => ({ ...prev, auctionCard: data.card, hand: [...prev.hand, data.card] }))
    })
    socket.on('vip_plus:auction_resolved', (data: any) => setGame(prev => ({
      ...prev, phase: 'REARRANGE', deadlineAt: data.deadlineAt, auctionWinnerSeat: data.winnerSeat, balances: data.tokenBalance,
      arrangement: autoArrange(prev.hand, prev.centerRuleset), locked: false,
    })))
    socket.on('vip_plus:seat_status', (data: { seat: Seat; status: 'CONNECTED' | 'DISCONNECTED' | 'FORFEITED' | 'BLANK' }) => setGame(prev => ({
      ...prev, seats: prev.seats.map(seat => seat.seat === data.seat ? { ...seat, status: data.status } : seat),
    })))
    socket.on('vip_plus:match_snapshot', (data: any) => {
      activeTableIdRef.current = data.roomId
      matchStartedRef.current = true
      setTable(prev => prev ?? ({
        tableId: data.roomId,
        status: 'READY',
        hostSeat: data.selfSeat,
        wager: data.wager,
        seats: data.seats.map((seat: any) => ({ ...seat, confirmed: true, connected: seat.status !== 'DISCONNECTED' })),
        requiredPlayers: 5,
        minimumPlayers: 3,
        canHostStart: false,
        reducedStartApproved: false,
        entryTermsVersion: '',
        // ทดลองมติลุงเยาะ — match_snapshot (reconnect เข้าแมตช์ที่เริ่มไปแล้ว) ไม่มีข้อมูลนี้ในตัว payload
        // เอง (เป็นข้อมูลระดับ Waiting Chamber) ใส่ default ไว้เป็น placeholder เฉยๆ ไม่มีจุดไหนใน GAME
        // screen อ่านค่านี้จริง (ใช้แค่ตอน BROWSER/WAITING เท่านั้น)
        centerRuleset: 'WITH_G3_CENTER',
        foulRuleEnabled: true,
      }))
      setSelfSeat(data.selfSeat)
      selfSeatRef.current = data.selfSeat
      setScreen('GAME')
      const privateRearrangeCard = data.phase === 'REARRANGE' ? data.auction?.privateCard : null
      const snapshotHand = privateRearrangeCard ? [...data.hand, privateRearrangeCard] : data.hand
      const arrangement = data.arrangement ?? autoArrange(snapshotHand, data.centerRuleset ?? 'WITH_G3_CENTER')
      setGame(prev => ({
        ...prev, gameNumber: data.gameNumber, phase: data.phase, deadlineAt: data.deadlineAt, wager: data.wager,
        seats: data.seats, center: data.center, hand: snapshotHand, arrangement,
        locked: !!data.arrangement && data.phase === 'INITIAL_ARRANGE', pot: data.pot, balances: data.tokenBalance,
        actingSeat: data.betting?.actingSeat ?? null, bettingRound: data.betting?.bettingRound ?? 0, group: data.betting?.group ?? 1,
        groupRound: data.betting?.groupRound ?? 1,
        // มติลุงเยาะ (รอบ 9) — reconnect กลาง Betting ต้องได้เดิมพันจริงของรอบปัจจุบันด้วย (ดู
        // buildVipPlusSnapshot's betting.callAmount ฝั่ง server)
        currentCallAmount: data.betting?.callAmount ?? 0,
        folded: snapshotFolded(data.betting?.foldedByGroup), auctionBidAmounts: data.auction?.bidAmounts ?? [],
        lockedBid: data.auction?.ownLockedBid ?? null, auctionCard: data.auction?.privateCard ?? null,
        auctionWinnerSeat: data.auction?.winnerSeat ?? null,
        revealedCards: data.revealedCards ?? {},
        // ทดลองมติลุงเยาะ (เทสมือถือรอบ 2) — buildVipPlusSnapshot ฝั่ง server ส่งค่าจริงมาแล้ว (ไม่ใช่ placeholder)
        centerRuleset: data.centerRuleset ?? prev.centerRuleset,
        foulRuleEnabled: data.foulRuleEnabled ?? prev.foulRuleEnabled,
      }))
      if (data.auction?.privateCard) setShowPrivateAuctionCard(true)
      if (data.matchResult) {
        setMatchResult(data.matchResult)
        if (data.matchResult.winnerSeats?.includes(data.selfSeat) && !victoryShownRef.current) {
          victoryShownRef.current = true
          setShowVictoryVfx(true)
        }
      }
    })
    socket.on('vip_plus:match_complete', (data: MatchResult) => {
      setMatchResult(data)
      if (selfSeatRef.current && data.winnerSeats.includes(selfSeatRef.current) && !victoryShownRef.current) {
        victoryShownRef.current = true
        setShowVictoryVfx(true)
      }
      activeTableIdRef.current = null
      AsyncStorage.removeItem(ACTIVE_MATCH_KEY).catch(() => {})
    })
    socket.on('vip_plus:resume_result', (data: { ok: boolean }) => {
      if (data.ok !== false) return
      activeTableIdRef.current = null
      AsyncStorage.removeItem(ACTIVE_MATCH_KEY).catch(() => {})
    })
    socket.on('vip_plus:error', (data: { message: string; code: string }) => {
      setBusy(false)
      Alert.alert('VIP Plus', friendlyError(data.message || data.code))
    })
    return () => {
      // Batch 1 (VIP-05 fix, C1/C7) — Explicit exit ต้องยิง leave_table ก่อน disconnect เสมอ เฉพาะช่วง
      // ยังไม่เข้าแมตช์ (Waiting Chamber) เท่านั้น — เข้าแมตช์แล้วต้องปล่อยให้ Gate 8 เดิมจัดการผ่าน
      // DISCONNECTED status ตามปกติ (leave_table ใช้ไม่ได้แล้วหลังแมตช์เริ่ม)
      if (!hasLeftRef.current && !matchStartedRef.current && activeTableIdRef.current) {
        socket.emit('vip_plus:leave_table', { userId, accessToken, tableId: activeTableIdRef.current })
      }
      socket.disconnect()
      socketRef.current = null
    }
  }, [userId, accessToken, profile?.vip_status])

  const createTable = (optionId: OptionId) => {
    setBusy(true)
    socketRef.current?.emit('vip_plus:create_table', { ...authPayload(), optionId, centerRuleset, foulRuleEnabled })
  }
  const joinTable = (tableId: string) => {
    setBusy(true)
    socketRef.current?.emit('vip_plus:join_table', { ...authPayload(), tableId })
  }
  const confirmEntry = () => {
    if (!table) return
    setBusy(true)
    socketRef.current?.emit('vip_plus:confirm_entry', { ...authPayload(), tableId: table.tableId, acceptedTermsVersion: table.entryTermsVersion })
  }
  const approveReducedStart = () => {
    // Batch 1 (VIP-05 fix, C4/C5) — host โอนได้แล้ว เช็คกับ table.hostSeat จริง ไม่ใช่ 'H1' ตายตัว
    if (!table || selfSeat !== table.hostSeat || !table.canHostStart) return
    const blankSeats = table.requiredPlayers - table.seats.length
    Alert.alert(
      'Open Table Early?',
      `Start with ${table.seats.length} players and ${blankSeats} Blank seat${blankSeats === 1 ? '' : 's'}? Blank seats receive cards but do not take part in play.`,
      [
        { text: 'Wait for Players', style: 'cancel' },
        { text: 'Open Table', onPress: () => {
          setBusy(true)
          socketRef.current?.emit('vip_plus:approve_reduced_start', { ...authPayload(), tableId: table.tableId })
        } },
      ],
    )
  }
  const leave = () => {
    if (!table) { router.back(); return }
    hasLeftRef.current = true
    socketRef.current?.emit('vip_plus:leave_table', { ...authPayload(), tableId: table.tableId })
    activeTableIdRef.current = null
    AsyncStorage.removeItem(ACTIVE_MATCH_KEY).catch(() => {})
    setTable(null); setSelfSeat(null); setScreen('BROWSER')
  }

  // Batch 1 (VIP-05 fix, C1) — hardware back / gesture back ระหว่าง Waiting Chamber ต้องปล่อยที่นั่งเสมอ
  // (BROWSER ยังไม่มีที่นั่งให้ปล่อย ปล่อยให้ default back ทำงานตามปกติ, GAME อยู่นอกขอบเขต Batch นี้
  // ต้องใช้ FORFEIT เท่านั้นตามระบบเดิม)
  useEffect(() => {
    if (Platform.OS !== 'android') return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'WAITING' && table) {
        leave()
        router.back()
        return true
      }
      return false
    })
    return () => subscription.remove()
  }, [screen, table])

  const forfeit = () => {
    if (!table) return
    Alert.alert('Forfeit Match?', 'Your seat will remain and Auto-Fold every remaining group. This cannot be undone.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Forfeit', style: 'destructive', onPress: () => {
        hasLeftRef.current = true
        socketRef.current?.emit('vip_plus:forfeit', { ...authPayload(), tableId: table.tableId })
        activeTableIdRef.current = null
        AsyncStorage.removeItem(ACTIVE_MATCH_KEY).catch(() => {})
        router.replace('/(home)/lobby' as any)
      } },
    ])
  }
  const submitArrangement = () => {
    if (!table) return
    setBusy(true)
    const event = game.phase === 'REARRANGE' ? 'vip_plus:submit_rearrangement' : 'vip_plus:submit_arrangement'
    socketRef.current?.emit(event, { ...authPayload(), tableId: table.tableId, arrangement: game.arrangement })
  }
  // มติลุงเยาะ 2026-08-04: CALL ส่ง revealedCardKeys ไปด้วยถ้า P1 เลือกไว้ (เลือกไม่ครบจำนวนที่ต้องหงาย = server เติมใบอ่อนสุดให้)
  const bet = (action: 'CALL' | 'FOLD') => table && socketRef.current?.emit('vip_plus:betting_action', {
    ...authPayload(), tableId: table.tableId, action,
    ...(action === 'CALL' && bettingRevealKeys.length > 0 ? { revealedCardKeys: bettingRevealKeys } : {}),
  })
  const bid = (amount: number) => table && socketRef.current?.emit('vip_plus:auction_bid', { ...authPayload(), tableId: table.tableId, amount })

  if (screen === 'BROWSER') return (
    <View style={[s.root, { paddingTop: insets.top + 14 }]}>
      <Text style={s.eyebrow}>VIP PRO EXCLUSIVE</Text>
      <Text style={s.pageTitle}>VIP Plus 3–5 Player</Text>
      <Text style={s.pageSub}>Three players minimum. H1 may open the remaining seats as Blank.</Text>
      <Text style={s.section}>MATCH RULES</Text>
      <View style={s.ruleRow}>
        <TouchableOpacity
          style={[s.ruleOption, centerRuleset === 'WITH_G3_CENTER' && s.ruleOptionActive]}
          onPress={() => setCenterRuleset('WITH_G3_CENTER')}
        >
          <Text style={[s.ruleOptionText, centerRuleset === 'WITH_G3_CENTER' && s.ruleOptionTextActive]}>3-3-1 (Default)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.ruleOption, centerRuleset === 'NO_G3_CENTER' && s.ruleOptionActive]}
          onPress={() => setCenterRuleset('NO_G3_CENTER')}
        >
          <Text style={[s.ruleOptionText, centerRuleset === 'NO_G3_CENTER' && s.ruleOptionTextActive]}>3-3-0</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.ruleOption, centerRuleset === 'HOLDEM_G3' && s.ruleOptionActive]}
          onPress={() => setCenterRuleset('HOLDEM_G3')}
        >
          <Text style={[s.ruleOptionText, centerRuleset === 'HOLDEM_G3' && s.ruleOptionTextActive]}>Hold'em 3-3-2</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.ruleHint}>Center cards per pile — same for all 3 games this match. 3-3-1: no Blind Auction, ever. 3-3-0: Blind Auction every game. Hold'em: G3 becomes a shared 5-card board scored best of 7, no Blind Auction.</Text>
      <View style={s.foulToggleRow}>
        <Text style={s.foulToggleLabel}>Follow G1 ≤ G2 ≤ G3 rule</Text>
        <Switch value={foulRuleEnabled} onValueChange={setFoulRuleEnabled} trackColor={{ true: '#c9a84c' }} />
      </View>
      <Text style={s.section}>CREATE TABLE</Text>
      <View style={s.optionRow}>
        {OPTIONS.map(option => <WagerOption key={option} option={option} disabled={busy} onPress={() => createTable(option)} />)}
      </View>
      <Text style={s.section}>OPEN TABLES</Text>
      <ScrollView style={{ width: '100%' }} contentContainerStyle={{ gap: 8, paddingBottom: 20 }}>
        {tables.length === 0 && <Text style={s.empty}>No open table. Create one as H1.</Text>}
        {tables.map(item => (
          <TouchableOpacity key={item.tableId} style={s.openTable} disabled={busy} onPress={() => joinTable(item.tableId)}>
            <View>
              <Text style={s.tableTitle}>{item.wager.bettingTier.toUpperCase()} WAGER</Text>
              <Text style={s.tableMeta}>{item.seats.length}/5 players · Min 3 | Call {item.wager.callAmount} T</Text>
              <Text style={s.tableMeta}>{centerRulesetLabel(item.centerRuleset)} · {item.foulRuleEnabled ? 'G1≤G2≤G3' : 'Free Arrangement'}</Text>
            </View>
            <Text style={s.join}>JOIN</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>BACK TO LOBBY</Text></TouchableOpacity>
    </View>
  )

  if (screen === 'WAITING' && table) {
    // Batch 1 (VIP-05 fix, C6) — Accept ต้อง disable ถาวรหลัง confirm สำเร็จ (ไม่ใช่แค่ระหว่าง in-flight)
    const selfConfirmed = table.seats.find(p => p.seat === selfSeat)?.confirmed ?? false
    return (
    <View style={[s.root, { paddingTop: insets.top + 14 }]}>
      <Text style={s.eyebrow}>TABLE {table.tableId.slice(-6).toUpperCase()}</Text>
      <Text style={s.pageTitle}>Waiting Chamber</Text>
      <Text style={s.pageSub}>{table.wager.bettingTier.toUpperCase()} wager | Buy-in {table.wager.buyIn.toLocaleString('en-US')} T | Call {table.wager.callAmount} T</Text>
      <Text style={s.pageSub}>
        {centerRulesetLabel(table.centerRuleset)} Center · {table.foulRuleEnabled ? 'G1≤G2≤G3 Required' : 'Free Arrangement'}
      </Text>
      {hostToast && <View style={s.hostToast}><Text style={s.hostToastText}>You are now the table host</Text></View>}
      {/* Feedback ลุงเยาะ — มือถือบางรุ่นจอเตี้ยเลื่อนลงไปกดปุ่มด้านล่างไม่ถึง (root ไม่มี ScrollView) ย้ายปุ่ม
          ทั้งหมด (Accept/Open With N/Leave) มาไว้บนสุดก่อนรายชื่อผู้เล่น รับประกันว่ากดเปิดโต๊ะได้เสมอไม่ว่าจอ
          จะเตี้ยแค่ไหน — รายชื่อผู้เล่น/ENTRY CONDITIONS ย้ายลงไปด้านล่างแทน (เป็นแค่ข้อมูลอ่านอย่างเดียว) */}
      <TouchableOpacity
        style={[s.primary, busy && s.disabled, selfConfirmed && s.primaryConfirmed]}
        disabled={busy || selfConfirmed}
        onPress={confirmEntry}
      >
        <Text style={[s.primaryText, selfConfirmed && s.primaryTextConfirmed]}>
          {selfConfirmed ? '✓ CONFIRMED' : busy ? 'WAITING...' : 'ACCEPT AND CONFIRM ENTRY'}
        </Text>
      </TouchableOpacity>
      {/* Batch 1 (VIP-05 fix, C4/C5): host โอนได้แล้ว เช็คกับ table.hostSeat จริง ไม่ใช่ 'H1' ตายตัว */}
      {selfSeat === table.hostSeat && table.seats.length >= table.minimumPlayers && table.seats.length < table.requiredPlayers && (
        <>
          <TouchableOpacity
            style={[s.primary, (!table.canHostStart || table.reducedStartApproved || busy) && s.disabled]}
            disabled={!table.canHostStart || table.reducedStartApproved || busy}
            onPress={approveReducedStart}
          >
            <Text style={s.primaryText}>{table.reducedStartApproved ? 'EARLY START APPROVED' : `OPEN WITH ${table.seats.length} PLAYERS`}</Text>
          </TouchableOpacity>
          {!table.canHostStart && !table.reducedStartApproved && <Text style={s.empty}>All seated players must confirm first.</Text>}
        </>
      )}
      {/* Batch 1 (VIP-05 fix, C6): LEAVE TABLE เด่นขึ้นเป็นปุ่มเต็มขนาดหลัง confirm สำเร็จ */}
      {selfConfirmed ? (
        <TouchableOpacity style={s.leaveProminent} onPress={leave}><Text style={s.leaveProminentText}>LEAVE TABLE</Text></TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={leave}><Text style={s.back}>LEAVE TABLE</Text></TouchableOpacity>
      )}
      <View style={s.waitingSeats}>
        {SEATS.map(seat => {
          const player = table.seats.find(candidate => candidate.seat === seat)
          return <SeatTile key={seat} seat={seat} name={player?.displayName} avatarUrl={player?.avatarUrl} isVip={player?.isVip} confirmed={player?.confirmed} isSelf={seat === selfSeat} connected={player?.connected} />
        })}
      </View>
      <View style={s.terms}>
        <Text style={s.termsTitle}>ENTRY CONDITIONS</Text>
        <Text style={s.term}>Timers continue during disconnects.</Text>
        <Text style={s.term}>Missed actions become Auto-Fold.</Text>
        <Text style={s.term}>Leaving an active match is a Forfeit.</Text>
        <Text style={s.term}>With 3–4 confirmed players, the host may open the remaining seats as Blank.</Text>
      </View>
    </View>
    )
  }

  const seconds = Math.max(0, Math.ceil((game.deadlineAt - now) / 1000))
  const orderedSeats = rotateSeats(selfSeat)
  const isMyTurn = game.actingSeat === selfSeat
  return (
    <ImageBackground source={selectedTableImage} style={s.gameRoot} resizeMode="cover">
      <GameTopBar
        tierName="VIP PLUS" tierStars={4} round={game.gameNumber} totalRounds={3}
        isWeb={Platform.OS === 'web'} insetsTop={insets.top} opacity={1}
        stackAmount={selfSeat ? game.balances[selfSeat] : undefined}
        leftSlot={<Deadline value={seconds} />}
      />
      {/* Feedback ลุงเยาะ (เทสมือถือรอบ 2) — การ์ดกติกาแมตช์ ปิดไว้เป็น default อยู่บนสุด กดแท็บเพื่อดูรายละเอียด
          (ใช้ "แตะเพื่อเปิด/ปิด" แทน "ปัดลง" ตามที่เสนอ — เลี่ยง gesture handler ที่อาจชนกับการปัดกลับของระบบ
          Android หรือ scroll อื่นในจอ ทำงานแน่นอนกว่าและกดง่ายกว่าบนมือถือ) */}
      <TouchableOpacity style={s.rulesTab} onPress={() => setRulesPanelOpen(prev => !prev)}>
        <Text style={s.rulesTabText}>MATCH RULES {rulesPanelOpen ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {rulesPanelOpen && (
        <View style={s.rulesPanel}>
          <Text style={s.rulesPanelRow}>Center Cards: {centerRulesetLabel(game.centerRuleset)}</Text>
          <Text style={s.rulesPanelRow}>Blind Auction: {game.centerRuleset === 'NO_G3_CENTER' ? 'Every game' : 'None this match'}</Text>
          <Text style={s.rulesPanelRow}>G1 ≤ G2 ≤ G3: {game.foulRuleEnabled ? 'Required' : 'Free Arrangement'}</Text>
          <Text style={s.rulesPanelRow}>Betting: 2 rounds per pile — round 2 doubles round 1. G3 starts at 2x G1's round 1 (up to 4x by G3 round 2)</Text>
          {game.centerRuleset === 'HOLDEM_G3' && (
            <Text style={s.rulesPanelRow}>G3: Hold'em pile — 2 hole cards + 5 shared, best of 7</Text>
          )}
        </View>
      )}
      {/* Feedback ลุงเยาะ — ใบที่ 5 ของ G3 (ใบทิ้งบังคับ) ของทุกที่นั่ง 5 ที่ (รวม Blank) เอาออกจากมือไปคว่ำ
          ซ้อนกันไว้บนสุดของจอ ให้เห็นว่าไพ่ยังครบ 52 ใบเสมอ — โชว์เฉพาะตอนกติกา WITH_G3_CENTER (ใบที่ 5 เป็น
          discard จริง) เช็คจาก centerRuleset ตรงๆ (รอบ 3 แก้จาก center.g3.length>0 เพราะ HOLDEM_G3 ก็มี
          center.g3.length>0 เหมือนกันแต่เป็นกองกลางสาธารณะ 5 ใบ ไม่ใช่ discard concept เดียวกันเลย) ไม่ต้องรู้ว่า
          ใครทิ้งใบไหนจริง เพราะคว่ำหน้าอยู่แล้ว (ไพ่คนอื่นเป็นความลับ) แสดงแค่จำนวนพอ */}
      {game.centerRuleset === 'WITH_G3_CENTER' && (
        <View style={s.discardStackWrap} pointerEvents="none">
          <Text style={s.discardStackLabel}>DISCARDED · 5</Text>
          <View style={s.discardStackRow}>
            {Array.from({ length: 5 }, (_, i) => (
              <Card key={i} variant="back" width={22} height={32} style={{ ...s.discardStackCard, left: i * 6 }} />
            ))}
          </View>
        </View>
      )}
      {/* มติลุงเยาะ (รอบ 5, HOLDEM_G3) — 5×8 (มือ) + 9 (กองกลาง) = 49 ใบ เหลือ 3 ใบไม่ได้แจกโดยตั้งใจ (ดู
          getVipPlusExpectedDeckTotal ฝั่ง server) "ไม่ใช้เลย โชว์คว่ำเป็น bonus visual พอ" — ไม่มีข้อมูลไพ่จริง
          จาก server เลย (ไม่เคยแจก ไม่มีใครเห็น ไม่กระทบเกม) เป็นแค่ตัวเลขคงที่ ไม่ต้องพึ่ง payload ใดๆ */}
      {game.centerRuleset === 'HOLDEM_G3' && (
        <View style={s.discardStackWrap} pointerEvents="none">
          <Text style={s.discardStackLabel}>UNDEALT · 3</Text>
          <View style={s.discardStackRow}>
            {Array.from({ length: 3 }, (_, i) => (
              <Card key={i} variant="back" width={22} height={32} style={{ ...s.discardStackCard, left: i * 6 }} />
            ))}
          </View>
        </View>
      )}
      {/* Batch 2 (VIP-03) — โชว์เฉพาะตอน INITIAL_ARRANGE (ยังไม่เริ่ม action จริง) กันเบียดกับกองไพ่
          กลาง/แถวไพ่คู่ต่อสู้ตอน BETTING ซึ่งเป็นช่วงที่พื้นที่แน่นที่สุด — ดูรายงานเหตุผลเต็มใน Batch 2 */}
      {game.phase === 'INITIAL_ARRANGE' && (
        <View style={s.vipPlusHeaderBlock} pointerEvents="none">
          <Text style={s.vipPlusHeaderTitle}>VIP Plus Only</Text>
          <Text style={s.vipPlusHeaderSub}>New Core Rules in</Text>
          <Text style={s.vipPlusHeaderSub}>"TriplePoker: Beyond the Rules"</Text>
        </View>
      )}
      {/* Feedback ลุงเยาะ (เทสมือถือรอบ 1) — Round Result เดิมเป็น banner เล็กๆ ไม่พอ เปลี่ยนเป็น overlay
          เต็มจอโชว์ไพ่ผู้ชนะครบชุด ค้างจนกว่า event เฟสถัดไปจะมา (server หน่วงจริงแล้วให้เวลาพอดี ~10 วิ) */}
      {roundResultBanner && (
        <View style={s.roundResultOverlay} pointerEvents="none">
          <Text style={s.roundResultPile}>PILE {roundResultBanner.group}</Text>
          <Text style={s.roundResultWinner}>
            {game.seats.find(p => p.seat === roundResultBanner.seat)?.displayName ?? roundResultBanner.seat} WINS
          </Text>
          <Text style={s.roundResultHand}>{roundResultBanner.handName}</Text>
          <View style={s.roundResultCardRow}>
            {/* มติลุงเยาะ (รอบ 10) — ไพ่ 5 ใบที่ใช้จริง (Best 5 from 7 ของ HOLDEM_G3's G3) กระพริบเน้น
                ส่วนอีก 2 ใบ hole card ที่ไม่ได้ใช้แค่หงายให้เห็นเฉยๆ (กองอื่น/ruleset อื่น highlightedCards
                เท่ากับ cards เป๊ะอยู่แล้วเลยกระพริบทุกใบเหมือนเดิม ไม่มี regression) */}
            {roundResultBanner.cards.map((key, index) => (
              <View key={`${key}-${index}`} style={s.roundResultCard}>
                {roundResultBanner.highlightedCards.includes(key)
                  ? <BlinkingCard cardKey={key} width={54} height={78} />
                  : <CardKey cardKey={key} width={54} height={78} />}
              </View>
            ))}
          </View>
        </View>
      )}
      <View style={s.tableArea}>
        {orderedSeats.slice(1).map((seat, index) => {
          // มติลุงเยาะ 2026-08-04: ตอน Betting ต้องเห็นหลังไพ่ของกองที่กำลังเดิมพันของทุกคน + ใบที่หงายแล้ว
          // (scope ตาม game.group กันนับปนกับกองก่อนหน้าที่หงายไปแล้ว) ไพ่ของคนอื่นเล็กกว่าไพ่ P1 เสมอ
          const revealedForGroup = game.revealedCards[seat]?.[game.group] ?? []
          const hiddenCount = Math.max(0, groupPileSize(game.group, game.centerRuleset) - revealedForGroup.length)
          return (
            <View key={seat} style={[s.remoteSeat, remoteSeatPosition(index, game.phase === 'BETTING')]}>
              <SeatBubble seat={seat} name={game.seats.find(p => p.seat === seat)?.displayName} avatarUrl={game.seats.find(p => p.seat === seat)?.avatarUrl} isVip={game.seats.find(p => p.seat === seat)?.isVip} status={game.seats.find(p => p.seat === seat)?.status} isBlank={game.seats.find(p => p.seat === seat)?.isBlank} active={game.actingSeat === seat} folded={game.folded[seat] === game.group} balance={game.balances[seat]} centerRuleset={game.centerRuleset} />
              {game.phase === 'BETTING' && !game.seats.find(p => p.seat === seat)?.isBlank && (
                // Feedback ลุงเยาะ (เทสมือถือ) — ที่นั่ง P4 (บนขวา, remoteSeatPosition index 1) ไพ่หงาย
                // ขยับขวาอีกครึ่งความกว้างไพ่ (OPP_CW/2) กันไปทับกับ container ไพ่กองกลาง
                <View style={[s.oppHandRow, index === 1 && { marginLeft: OPP_CW / 2 }]}>
                  {Array.from({ length: hiddenCount }, (_, i) => (
                    <Card key={`back-${i}`} variant="back" width={OPP_CW} height={OPP_CH} style={s.oppHandCard} />
                  ))}
                  {revealedForGroup.map(key => (
                    <View key={`rev-${key}`} style={[s.oppHandCard, s.oppHandRevealed]}>
                      <CardKey cardKey={key} width={OPP_CW} height={OPP_CH} />
                    </View>
                  ))}
                </View>
              )}
            </View>
          )
        })}
        <View style={s.centerZone}>
          <Text style={s.phase}>{phaseLabel(game)}</Text>
          <CenterGroup label="G1" cards={game.center.g1} />
          <CenterGroup label="G2" cards={game.center.g2} />
          <CenterGroup
            label="G3"
            cards={game.center.g3}
            auction={game.center.g3.length === 0}
            hiddenCount={game.centerRuleset === 'HOLDEM_G3' ? Math.max(0, 5 - game.center.g3.length) : 0}
          />
          <View style={s.pots}><Text style={s.potText}>POTS {game.pot.map(v => v.toLocaleString('en-US')).join(' / ')}</Text></View>
        </View>
      </View>
      <View style={s.localZone}>
        <SeatBubble seat={selfSeat ?? 'H1'} name="YOU" avatarUrl={selfSeat ? game.seats.find(p => p.seat === selfSeat)?.avatarUrl : undefined} isVip={selfSeat ? game.seats.find(p => p.seat === selfSeat)?.isVip : undefined} status={selfSeat ? game.seats.find(p => p.seat === selfSeat)?.status : undefined} active={isMyTurn} folded={selfSeat ? game.folded[selfSeat] === game.group : false} balance={selfSeat ? game.balances[selfSeat] : undefined} centerRuleset={game.centerRuleset} />
        {(game.phase === 'INITIAL_ARRANGE' || game.phase === 'REARRANGE') && (
          <>
            <ArrangementEditor hand={game.hand} arrangement={game.arrangement} disabled={game.locked} centerRuleset={game.centerRuleset} revealedBoardCount={game.center.g3.length} onChange={arrangement => setGame(prev => ({ ...prev, arrangement }))} />
            <TouchableOpacity style={[s.primary, (game.locked || busy || game.hand.length < playerHandTotal(game.centerRuleset)) && s.disabled]} disabled={game.locked || busy || game.hand.length < playerHandTotal(game.centerRuleset)} onPress={submitArrangement}>
              <Text style={s.primaryText}>{game.locked ? 'HAND LOCKED' : game.phase === 'REARRANGE' ? 'LOCK REARRANGEMENT' : `LOCK ${handLayoutLabel(game.centerRuleset)} HAND`}</Text>
            </TouchableOpacity>
          </>
        )}
        {game.phase === 'BETTING' && (
          <>
            {/* มติลุงเยาะ 2026-08-04: เห็นไพ่ในมือของกองที่กำลังเดิมพันเสมอ (ไม่ใช่แค่ตอนตาตัวเอง) —
                ใหญ่กว่าไพ่ของคนอื่น (OWN_BET_CW/CH > OPP_CW/CH) เลือกใบหงายได้เฉพาะตอนถึงตาตัวเอง — G3
                รอบแรกต้องเลือกมากกว่า 1 ใบ (รวมกับกองกลาง G3 ให้ครบ 3 ใบเสมอ) ดู requiredRevealCount() */}
            {(() => {
              const needed = requiredRevealCount(game.group, game.groupRound, game.center.g3.length)
              return (
                <View style={s.ownBetPileWrap}>
                  <Text style={s.ownBetPileLabel}>
                    YOUR G{game.group} HAND{isMyTurn ? ` — TAP ${needed} CARD${needed > 1 ? 'S' : ''} TO REVEAL (${bettingRevealKeys.length}/${needed})` : ''}
                  </Text>
                  <View style={s.ownBetPileRow}>
                    {(() => {
                      const fullPile = game.arrangement[`g${game.group}` as keyof Arrangement] ?? []
                      // Feedback ลุงเยาะ (เทสมือถือรอบ 2, ปรับรอบ 3 ให้เช็ค ruleset ตรงๆ) — arrangement
                      // ล็อกไปแล้วเสมอตอนถึง Betting ใบทิ้งบังคับ (ลำดับ 5 ของ G3 เฉพาะ WITH_G3_CENTER) เลย
                      // ซ่อนไปเลยเหมือนตอน arrange ไม่ใช่แค่กากบาทอีกต่อไป (เหลือ 4 ใบให้เห็นจริง) — HOLDEM_G3
                      // ก็มี center.g3.length>0 เหมือนกันแต่เป็นกองกลางสาธารณะ ไม่ใช่ discard concept เดียวกัน
                      const hasDiscard = game.group === 3 && game.centerRuleset === 'WITH_G3_CENTER' && fullPile.length === 5
                      const pile = hasDiscard ? fullPile.slice(0, 4) : fullPile
                      return pile.map(key => {
                        const isRevealed = (selfSeat ? game.revealedCards[selfSeat]?.[game.group] : undefined)?.includes(key) ?? false
                        const isSelected = bettingRevealKeys.includes(key)
                        const selectDisabled = !isMyTurn || isRevealed || (!isSelected && bettingRevealKeys.length >= needed)
                        return (
                          <TouchableOpacity
                            key={key}
                            disabled={selectDisabled}
                            onPress={() => setBettingRevealKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])}
                            style={[s.ownBetCard, isSelected && s.ownBetCardSel, isRevealed && s.ownBetCardRevealed]}
                          >
                            <CardKey cardKey={key} width={OWN_BET_CW} height={OWN_BET_CH} />
                          </TouchableOpacity>
                        )
                      })
                    })()}
                  </View>
                </View>
              )
            })()}
            <View style={s.actions}>
              <TouchableOpacity style={[s.foldButton, !isMyTurn && s.disabled]} disabled={!isMyTurn} onPress={() => bet('FOLD')}><Text style={s.foldText}>FOLD G{game.group}</Text></TouchableOpacity>
              <TouchableOpacity style={[s.callButton, !isMyTurn && s.disabled]} disabled={!isMyTurn} onPress={() => bet('CALL')}><Text style={s.callText}>CALL {game.currentCallAmount || game.wager?.callAmount || 0} T</Text></TouchableOpacity>
            </View>
          </>
        )}
      </View>
      {/* Batch 4 (VIP-09) — Coin Flying VFX (reuse FlyingCoins ตัวเดียวกับ Mastermind ไม่แก้ component เอง)
          + ตัวเลข "+amount T" ลอยขึ้นแล้วจางหาย — ต้อง render เป็น child ตรงของ wrapper centered นี้เท่านั้น
          (ดู comment ใน FlyingCoins.tsx: ห้ามห่อ View เพิ่มอีกชั้น ไม่งั้นพิกัดอ้างอิงผิดจุด) */}
      <View style={[StyleSheet.absoluteFill, s.vfxOverlay]} pointerEvents="none">
        <FlyingCoins ref={flyingCoinsRef} />
        {floatingDeltas.map(d => (
          <FloatingDeltaText key={d.id} amount={d.amount} point={seatTargetForSeat(d.seat, selfSeat)} />
        ))}
      </View>
      <VipPlusAuctionOverlay visible={game.phase === 'BLIND_AUCTION'} deadlineAt={game.deadlineAt} bidAmounts={game.auctionBidAmounts} lockedBid={game.lockedBid} onSubmit={bid} />
      <VipPlusAuctionOverlay visible={game.phase === 'REARRANGE' && !!game.auctionCard && showPrivateAuctionCard} deadlineAt={game.deadlineAt} bidAmounts={[]} lockedBid={game.lockedBid} privateCard={game.auctionCard} onSubmit={bid} onDismissPrivate={() => setShowPrivateAuctionCard(false)} />
      <TouchableOpacity style={s.forfeit} onPress={forfeit}><Text style={s.forfeitText}>FORFEIT</Text></TouchableOpacity>
      {matchResult && selfSeat && (
        <MatchEndOverlay
          variant={matchResult.winnerSeats.includes(selfSeat) ? 'victory' : 'defeat'}
          tierBadge="VIP PLUS"
          buyInAmount={game.wager?.buyIn ?? 0}
          returnedAmount={matchResult.rankings.find(row => row.seat === selfSeat)?.finalStack ?? 0}
          tokenBalanceDisplay={matchResult.walletBalances?.[selfSeat] ?? undefined}
          leaderboard={matchResult.rankings.map(row => ({ id: row.seat, label: `${row.rank}. ${row.displayName}`, balance: row.finalStack, isSelf: row.seat === selfSeat }))}
          extraContent={<RankingMetrics result={matchResult} selfSeat={selfSeat} />}
          onBackToLobby={() => router.replace('/(home)/lobby' as any)}
          insetsBottom={insets.bottom}
        />
      )}
      {showVictoryVfx && (
        <View style={s.victoryVfx} pointerEvents="none">
          <BossVictoryVFX tier="sentinel" titleOverride="MATCH VICTORY" onFinish={() => setShowVictoryVfx(false)} />
        </View>
      )}
    </ImageBackground>
  )
}

function WagerOption({ option, disabled, onPress }: { option: OptionId; disabled: boolean; onPress: () => void }) {
  const label = option.replace('_WAGER', '').replace('_', ' ')
  return <TouchableOpacity style={[s.option, disabled && s.disabled]} disabled={disabled} onPress={onPress}><Text style={s.optionTier}>{label}</Text><Text style={s.optionMeta}>Lower-tier wager</Text><Text style={s.optionAction}>SELECT</Text></TouchableOpacity>
}

function SeatTile({ seat, name, avatarUrl, isVip, confirmed, isSelf, connected }: { seat: Seat; name?: string; avatarUrl?: string | null; isVip?: boolean; confirmed?: boolean; isSelf?: boolean; connected?: boolean }) {
  // Batch 1 (VIP-05 fix, C2/C3) — offline เฉพาะที่นั่งมีคนแล้วแต่หลุดสัญญาณ ยังไม่หมด grace
  const offline = !!name && connected === false
  // Batch 2 (VIP-04) — จุดวิ่งเฉพาะที่นั่งว่างจริงๆ (ไม่มีชื่อเลย) ที่นั่ง NOT CONFIRMED/OFFLINE คงเดิม
  const isEmpty = !name
  return (
    <View style={[s.seatTile, isSelf && s.selfSeat, s.seatTileRow]}>
      {/* มติลุงเยาะ — Avatar หน้าชื่อผู้เล่นทุกที่นั่ง (ที่นั่งว่างไม่โชว์ ไม่มีใครให้แสดง) */}
      {!isEmpty && <VipPlusPlayerAvatar value={avatarUrl} size={36} isVip={isVip} />}
      <View style={s.seatTileInfo}>
        <Text style={s.seatId}>{seat}{isSelf ? ' / YOU' : ''}</Text>
        <Text style={s.seatName}>{name ?? 'OPEN SEAT'}</Text>
        <View style={s.seatStatusRow}>
          <Text style={[s.seatStatus, confirmed && s.ready]}>{confirmed ? 'READY' : name ? 'NOT CONFIRMED' : 'WAITING'}{offline ? ' · OFFLINE' : ''}</Text>
          {isEmpty && <WaitingDots />}
        </View>
      </View>
    </View>
  )
}

// มติลุงเยาะ — Avatar หน้าชื่อผู้เล่นพร้อมกรอบ (mirror pattern เดียวกับ monarch/index.tsx's
// MonarchPlayerAvatar เป๊ะ) value = preset key (resolve ผ่าน PRESET_AVATARS + AvatarDisplay ที่มีกรอบ
// ในตัวอยู่แล้ว) หรือ http(s)/data URL จริง หรือ emoji ดิบ — null/undefined fallback เป็นอิโมจิ default
function VipPlusPlayerAvatar({ value, size, isVip = false }: { value?: string | null; size: number; isVip?: boolean }) {
  const preset = value ? PRESET_AVATARS.find(item => item.key === value) : undefined
  if (preset) {
    return <AvatarDisplay config={{ type: 'preset', presetKey: preset.key, frameKey: isVip ? 'gold' : 'default' }} size={size} showFrame={isVip} />
  }
  const borderColor = isVip ? '#c9a84c' : '#2A4A34'
  if (value && /^(https?:|data:)/i.test(value)) {
    return <Image source={{ uri: value }} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor }} resizeMode="cover" />
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor, backgroundColor: '#132019', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: Math.round(size * 0.52) }}>{value || '🧑'}</Text>
    </View>
  )
}

// Batch 2 (VIP-04) — จุดวิ่ง 1→5 วนไม่รู้จบ (Reanimated v4 ล้วน ไม่มี setInterval/setState) cleanup
// อัตโนมัติตอน unmount เพราะ shared value ผูกกับ component lifecycle ของ hook เอง ไม่ต้อง clear มือ
function WaitingDots() {
  const progress = useSharedValue(0)
  useEffect(() => {
    // ~400ms ต่อจุด รวม 5 จุด = 2000ms แล้ว snap กลับ 0 ทันที (duration:0) เพื่อวนใหม่ (withRepeat
    // reverse:false เดินหน้าซ้ำจากค่าปัจจุบันเสมอ ไม่รีเซตเองถ้าไม่มี step กลับแบบนี้)
    progress.value = withRepeat(
      withSequence(
        withTiming(5, { duration: 2000, easing: Easing.linear }),
        withTiming(0, { duration: 0 }),
      ),
      -1,
      false,
    )
  }, [])
  return (
    <View style={s.waitingDotsRow}>
      {[0, 1, 2, 3, 4].map(index => <WaitingDot key={index} index={index} progress={progress} />)}
    </View>
  )
}

function WaitingDot({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const dotStyle = useAnimatedStyle(() => ({ opacity: progress.value > index ? 1 : 0.18 }))
  return <Animated.View style={[s.waitingDot, dotStyle]} />
}

// Batch 4 (VIP-09) — ตัวเลข "+amount T" ลอยขึ้น 40px แล้วจางหายภายใน 1.4 วิ ที่ตำแหน่งเดียวกับที่นั่งผู้ชนะ
// (Reanimated v4 ล้วน) point เป็น offset จากจุดกึ่งกลางจอเดียวกับ VIP_PLUS_SEAT_TARGETS/FlyingCoins
function FloatingDeltaText({ amount, point }: { amount: number; point: Point }) {
  const riseY = useSharedValue(0)
  const opacity = useSharedValue(1)
  useEffect(() => {
    riseY.value = withTiming(-40, { duration: 1400, easing: Easing.out(Easing.quad) })
    opacity.value = withTiming(0, { duration: 1400 })
  }, [])
  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    // Reanimated typing บังคับ transform tuple แบบ discriminated union ต่อ shape (เหมือน ShimmerOverlay.tsx) — cast เฉพาะจุดนี้
    transform: [{ translateX: point.x }, { translateY: point.y + riseY.value }] as any,
  }))
  return (
    <Animated.View style={[s.floatingDelta, animStyle]} pointerEvents="none">
      <Text style={s.floatingDeltaText}>+{amount.toLocaleString('en-US')} T</Text>
    </Animated.View>
  )
}

function SeatBubble({ seat, name, avatarUrl, isVip, status, isBlank, active, folded, balance, centerRuleset }: { seat: Seat; name?: string; avatarUrl?: string | null; isVip?: boolean; status?: 'CONNECTED' | 'DISCONNECTED' | 'FORFEITED' | 'BLANK'; isBlank?: boolean; active: boolean; folded: boolean; balance?: number; centerRuleset: CenterRuleset }) {
  const blank = isBlank || status === 'BLANK'
  return <View style={[s.bubble, active && s.bubbleActive, (folded || status === 'FORFEITED' || blank) && s.bubbleFolded]}>
    <Text style={s.bubbleSeat}>{seat}</Text>
    {/* มติลุงเยาะ — Avatar หน้าชื่อผู้เล่นในเกม (ที่นั่ง Blank ไม่มีคนจริง ไม่ต้องโชว์) */}
    <View style={s.bubbleNameRow}>
      {!blank && <VipPlusPlayerAvatar value={avatarUrl} size={16} isVip={isVip} />}
      <Text style={s.bubbleName} numberOfLines={1}>{blank ? 'BLANK' : name ?? 'PLAYER'}</Text>
    </View>
    {blank ? <BlankHand centerRuleset={centerRuleset} /> : balance !== undefined && <Text style={s.bubbleStack}>{balance.toLocaleString('en-US')} T</Text>}
    {status === 'DISCONNECTED' && <Text style={s.disconnectBadge}>DISCONNECTED</Text>}
    {status === 'FORFEITED' && <Text style={s.foldBadge}>FORFEITED</Text>}
    {folded && status !== 'FORFEITED' && !blank && <Text style={s.foldBadge}>FOULED</Text>}
  </View>
}

// Feedback ลุงเยาะ (รอบ 3) — จำนวนไพ่มือ Blank ต้องตรงกับ ruleset จริง (เดิม hardcode 9 ใบ ผิดสำหรับ
// HOLDEM_G3 ที่มือจริงแค่ 8 ใบ — 3-3-2)
function BlankHand({ centerRuleset }: { centerRuleset: CenterRuleset }) {
  const total = playerHandTotal(centerRuleset)
  return <><View style={s.blankCards}>{Array.from({ length: total }, (_, index) => <Card key={index} variant="back" width={16} height={23} style={{ position: 'absolute', left: index * 4 }} />)}</View><Text style={s.blankLabel}>{total} CARDS · INACTIVE</Text></>
}

function Deadline({ value }: { value: number }) { return <View style={s.deadline}><Text style={s.deadlineValue}>{value}</Text><Text style={s.deadlineLabel}>SEC</Text></View> }

function RankingMetrics({ result, selfSeat }: { result: MatchResult; selfSeat: Seat }) {
  return <View style={s.metrics}>
    <Text style={s.metricsTitle}>{result.winnerSeats.length > 1 ? 'JOINT WINNERS' : 'MATCH RANKING'}</Text>
    <View style={s.metricsHeader}><Text style={s.metricName}>PLAYER</Text><Text style={s.metricCell}>NET</Text><Text style={s.metricCell}>PILES</Text><Text style={s.metricCell}>G3</Text></View>
    {result.rankings.map(row => <View key={row.seat} style={[s.metricsRow, row.seat === selfSeat && s.metricsSelf]}><Text style={s.metricName}>{row.rank}. {row.displayName}</Text><Text style={[s.metricCell, { color: row.netToken >= 0 ? '#4ade80' : '#f87171' }]}>{row.netToken >= 0 ? '+' : ''}{row.netToken}</Text><Text style={s.metricCell}>{row.totalGroupWins}</Text><Text style={s.metricCell}>{row.g3Wins}</Text></View>)}
    <Text style={s.burnTotal}>Auction Burn: {(result.auctionBurn ?? 0).toLocaleString('en-US')} T</Text>
    {/* มติลุงเยาะ (รอบ 12) — ป้ายโชว์ค่าธรรมเนียมท้ายแมตช์ 10% (เฉพาะกำไรสุทธิที่เป็นบวก) รวมทั้งโต๊ะ */}
    <Text style={s.burnTotal}>Match Fee (10% of profit): {(result.profitFeeTotal ?? 0).toLocaleString('en-US')} T</Text>
  </View>
}

// มติลุงเยาะ (รอบ 6, HOLDEM_G3) — hiddenCount โชว์ไพ่กองกลาง G3 ที่ยังไม่เปิด (Turn/River) เป็นการ์ดคว่ำ
// ต่อท้ายใบที่หงายแล้วตั้งแต่ Flop เลย ให้ผู้เล่นเห็นว่ายังมีไพ่ค้างอยู่กี่ใบ (ruleset อื่นไม่ส่ง prop นี้)
function CenterGroup({ label, cards, auction, hiddenCount = 0 }: { label: string; cards: string[]; auction?: boolean; hiddenCount?: number }) {
  return <View style={s.centerRow}><Text style={s.groupLabel}>{label}</Text>{cards.map(key => <CardKey key={key} cardKey={key} width={CENTER_CW} height={CENTER_CH} />)}{Array.from({ length: hiddenCount }, (_, i) => <Card key={`hidden-${i}`} variant="back" width={CENTER_CW} height={CENTER_CH} />)}{cards.length === 0 && !auction && <Text style={s.noCenter}>HAND ONLY</Text>}{auction && <Card variant="auction" width={CENTER_CW} height={CENTER_CH} />}</View>
}

// Two-row fan hand (มติลุงเยาะ 2026-08-04): แถวบน G1+G2 (4 ใบ), แถวล่าง G3 (5 ใบ) — เดิมเรียงแถวเดียว 9 ใบ
// เก็บเอฟเฟกต์โค้งพัดไพ่ไว้ในแต่ละแถว (renderRow คำนวณ centerOffset ใหม่ต่อแถว) การ์ดใหญ่ขึ้น 56x80 (เดิม 38x55)
function ArrangementEditor({ hand, arrangement, disabled, centerRuleset, revealedBoardCount, onChange }: { hand: string[]; arrangement: Arrangement; disabled: boolean; centerRuleset: CenterRuleset; revealedBoardCount: number; onChange: (value: Arrangement) => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [g1Size, g2Size, g3Size] = PLAYER_HAND_LAYOUT[centerRuleset]
  // ทดลองมติลุงเยาะ (รอบ 3 — เช็ค ruleset ตรงๆ แทน center.g3.length>0) ใบสุดท้าย (ลำดับ 5) ของ G3 เป็น
  // forced discard เฉพาะ WITH_G3_CENTER เท่านั้น (NO_G3_CENTER ไม่มีเลยทั้ง 3 เกม, HOLDEM_G3 ก็ไม่มีเช่นกัน
  // เพราะ G3 ที่นั่นเหลือแค่ 2 ใบ hole card ไม่มีใบเกินให้ทิ้ง) — ดู vipPlusPileScoringCards() ฝั่ง server
  const showG3Discard = centerRuleset === 'WITH_G3_CENTER'
  // Feedback ลุงเยาะ (เทสมือถือรอบ 2) — ก่อนล็อก (disabled=false) ยังโชว์ 5 ใบพร้อมกากบาทให้สลับได้ตามเดิม
  // พอล็อกแล้ว (disabled=true) ซ่อนใบที่ 5 ไปเลย เหลือแค่ 4 ใบใน G3 ให้เห็นชัดว่าทิ้งไปแล้วจริงๆ (ไม่ได้แค่
  // ทำเครื่องหมายไว้เฉยๆ)
  const hideDiscard = disabled && showG3Discard && arrangement.g3.length === g3Size
  // Feedback ลุงเยาะ (เทสมือถือรอบ 2) — 3-3-0 ตอน REARRANGE หลังชนะประมูล ผู้เล่นมีไพ่ available 10 ใบ (9 เดิม
  // + auction card) แต่ใช้ได้จริงแค่ 9 (2-2-5) เหลือ 1 ใบเกิน ("ใบที่ 6" ของแถวล่าง) ต้องกากบาท+ซ่อนหลังล็อก
  // เหมือน 3-3-1 ทุกประการ — คนละ scenario กับ showG3Discard เสมอ (WITH_G3_CENTER/HOLDEM_G3 ไม่มี Auction
  // เลย ไม่มีทาง hand เกินจำนวนเต็มพร้อมกันได้) เทียบกับ total ตาม ruleset ไม่ใช่ 9 ตายตัวอีกต่อไป
  const hasExtraCard = hand.length > g1Size + g2Size + g3Size
  const assignment = useMemo(() => new Map<string, keyof Arrangement>([
    ...arrangement.g1.map(c => [c, 'g1'] as const),
    ...arrangement.g2.map(c => [c, 'g2'] as const),
    ...arrangement.g3.map(c => [c, 'g3'] as const),
  ]), [arrangement])
  const { topCards, bottomCards, discardCardKey } = useMemo(() => {
    const top = [...arrangement.g1, ...arrangement.g2]
    // placed ยังต้องนับใบที่ 5 ของ G3 อยู่เสมอ (ไม่ว่าจะซ่อนหรือไม่) กันมันหลุดไปโผล่ในกองไพ่ที่ยังไม่ได้จัด
    const placed = new Set([...top, ...arrangement.g3])
    const g3Visible = hideDiscard ? arrangement.g3.slice(0, 4) : arrangement.g3
    const leftover = hand.filter(card => !placed.has(card))
    // ตอนล็อกแล้วและมีใบเกิน (ชนะประมูล) ซ่อนใบที่ไม่ได้ใช้ไปเลยเหมือนกัน กองสุดท้ายจะได้เหลือ 5 ใบจริง
    const visibleLeftover = disabled && hasExtraCard ? [] : leftover
    // ใบที่ต้อง mark กากบาทตอนยังไม่ล็อก — เช็ค card value ไม่ใช่ index (leftover ไม่ได้อยู่ตำแหน่งคงที่
    // เหมือน G3 ใบที่ 5 เพราะขึ้นกับว่าผู้เล่นสลับใบไหนออกไปอยู่นอกกองบ้าง)
    let discardCardKey: string | null = null
    if (showG3Discard && arrangement.g3.length === g3Size) discardCardKey = arrangement.g3[g3Size - 1]
    else if (hasExtraCard && leftover.length === 1) discardCardKey = leftover[0]
    return { topCards: top, bottomCards: [...g3Visible, ...visibleLeftover], discardCardKey }
  }, [arrangement, hand, hideDiscard, disabled, hasExtraCard, showG3Discard, g3Size])
  const selectOrSwap = (card: string) => {
    if (disabled) return
    if (!selected) { setSelected(card); return }
    if (selected === card) { setSelected(null); return }
    const firstGroup = assignment.get(selected)
    const secondGroup = assignment.get(card)
    const next: Arrangement = { g1: [...arrangement.g1], g2: [...arrangement.g2], g3: [...arrangement.g3] }
    if (firstGroup && firstGroup === secondGroup) {
      // สลับไพ่ 2 ใบในกองเดียวกัน — ต้องสลับด้วย index เดียว ห้ามใช้ .map() แทนค่า 2 รอบซ้อนบน array
      // เดียวกัน (รอบสองจะไปทับใบที่เพิ่งแทนที่ในรอบแรกซ้ำ ทำให้ไพ่อีกใบหายไปกลายเป็นไพ่ซ้ำ)
      const arr = next[firstGroup]
      const firstIndex = arr.indexOf(selected)
      const secondIndex = arr.indexOf(card)
      arr[firstIndex] = card
      arr[secondIndex] = selected
    } else {
      if (firstGroup) next[firstGroup] = next[firstGroup].map(value => value === selected ? card : value)
      if (secondGroup) next[secondGroup] = next[secondGroup].map(value => value === card ? selected : value)
    }
    setSelected(null)
    onChange(next)
  }
  const cardWidth = 56
  const cardHeight = 80
  // Feedback ลุงเยาะ — ไพ่ในกองเดียวกันซ้อนเกยกัน ~20% ของความกว้างไพ่ (step = 80% ของ cardWidth) ส่วนกอง
  // G1 ต้องห่างจากกอง G2 เพิ่มอีกครึ่งใบ (groupGapExtra = cardWidth/2) ที่จุด groupSplitAt ในแถวบนเท่านั้น
  const normalStep = cardWidth * 0.8
  const groupGapExtra = cardWidth * 0.5
  // groupSplitAt: index ที่เริ่มกลุ่มถัดไปในแถวนั้น (null = ไม่มีจุดแบ่งกลุ่มในแถว) ใช้ดันไพ่กลุ่มหลังออกห่างเล็กน้อย
  // discardCardKey เทียบด้วย "ตัวไพ่จริง" ไม่ใช่ index อีกต่อไป (เคส leftover ของ REARRANGE ไม่ได้อยู่
  // ตำแหน่งคงที่แบบ G3 ใบที่ 5) — ครอบคลุมทั้ง 2 scenario ด้วยกลไกเดียว
  const renderRow = (cards: string[], groupSplitAt: number | null) => {
    const fanWidth = cardWidth + Math.max(0, cards.length - 1) * normalStep + (groupSplitAt !== null ? groupGapExtra : 0)
    return <View style={[s.handRow, { width: fanWidth }]}>{cards.map((card, index) => {
      const centerOffset = index - (cards.length - 1) / 2
      const groupOffset = groupSplitAt !== null && index >= groupSplitAt ? groupGapExtra : 0
      const isDiscard = card === discardCardKey
      return <TouchableOpacity key={card} disabled={disabled} onPress={() => selectOrSwap(card)} style={[s.handCard, { left: index * normalStep + groupOffset, zIndex: index + 1, transform: [{ translateY: Math.abs(centerOffset) * 1.2 + (selected === card ? -7 : 0) }, { rotate: `${centerOffset * 2.2}deg` }] }, selected === card && s.selectedCard]}>
        <CardKey cardKey={card} width={cardWidth} height={cardHeight} />
        <Text style={s.cardGroup}>{String(assignment.get(card) ?? 'OUT').toUpperCase()}</Text>
        {isDiscard && (
          <View style={s.discardMark} pointerEvents="none">
            <Text style={s.discardMarkText}>✕</Text>
          </View>
        )}
      </TouchableOpacity>
    })}</View>
  }
  return <View style={s.editor}>
    {renderRow(topCards, g1Size)}
    <View style={{ height: 10 }} />
    {renderRow(bottomCards, null)}
    <Text style={s.editorHint}>
      Fan hand · G1 {g1Size} cards · G2 {g2Size} cards · G3 {hideDiscard ? g3Size - 1 : g3Size} cards
      {hideDiscard ? ' (1 card discarded)' : showG3Discard ? ' (last card discarded)'
        : hasExtraCard ? (disabled ? ' (extra card discarded)' : ' (1 extra card — will be discarded)')
        : centerRuleset === 'HOLDEM_G3' ? ` + ${revealedBoardCount} shared card${revealedBoardCount === 1 ? '' : 's'} revealed so far (best of 7)` : ''}
    </Text>
  </View>
}

function CardKey({ cardKey, width, height }: { cardKey: string; width: number; height: number }) {
  const parsed = parseCard(cardKey)
  return parsed ? <Card variant="face" suit={parsed.suit} value={parsed.value} width={width} height={height} /> : <Card variant="back" width={width} height={height} />
}

// มติลุงเยาะ (รอบ 10) — ไพ่กระพริบเน้น 5 ใบที่ใช้จริงในมือที่ชนะ (Reanimated v4 ล้วน ตาม pattern เดียวกับ
// WaitingDots/FloatingDeltaText) opacity วน 1 -> 0.25 -> 1 ไม่รู้จบ จนกว่า overlay จะปิด (unmount เอง cleanup)
function BlinkingCard({ cardKey, width, height }: { cardKey: string; width: number; height: number }) {
  const opacity = useSharedValue(1)
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.25, { duration: 450, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 450, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    )
  }, [])
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return <Animated.View style={animStyle}><CardKey cardKey={cardKey} width={width} height={height} /></Animated.View>
}

function parseCard(key: string): { suit: Suit; value: Value } | null {
  const suitMap: Record<string, Suit> = { s: 'spade', h: 'heart', d: 'diamond', c: 'club' }
  const suit = suitMap[key.slice(-1)]
  const value = key.slice(0, -1) as Value
  return suit && value ? { suit, value } : null
}
function autoArrange(cards: string[], ruleset: CenterRuleset): Arrangement {
  const [g1Size, g2Size, g3Size] = PLAYER_HAND_LAYOUT[ruleset]
  return { g1: cards.slice(0, g1Size), g2: cards.slice(g1Size, g1Size + g2Size), g3: cards.slice(g1Size + g2Size, g1Size + g2Size + g3Size) }
}
function snapshotFolded(value?: Record<string, Seat[]>): Partial<Record<Seat, number>> {
  const result: Partial<Record<Seat, number>> = {}
  if (!value) return result
  for (const [group, seats] of Object.entries(value)) for (const seat of seats) result[seat] = Number(group)
  return result
}
function rotateSeats(self: Seat | null): Seat[] { if (!self) return [...SEATS]; const index = SEATS.indexOf(self); return [...SEATS.slice(index), ...SEATS.slice(0, index)] }
// Batch 4 (VIP-09) — แปลง seat จริง (H1-H5) -> ตำแหน่งพิกัดบนจอตาม rotation ปัจจุบัน (ที่นั่งตัวเองอยู่
// index 0 เสมอใน orderedSeats ส่วนที่เหลือ index 1-4 ตรงกับ remoteSeatPosition(0-3))
function seatTargetForSeat(targetSeat: Seat, selfSeat: Seat | null): Point {
  const ordered = rotateSeats(selfSeat)
  const position = ordered.indexOf(targetSeat)
  if (position <= 0) return VIP_PLUS_SEAT_TARGETS.local
  const remoteKey = (`remote${position - 1}`) as 'remote0' | 'remote1' | 'remote2' | 'remote3'
  return VIP_PLUS_SEAT_TARGETS[remoteKey] ?? VIP_PLUS_SEAT_TARGETS.center
}
// Feedback ลุงเยาะ (เทสมือถือรอบ 2) — เลื่อนที่นั่งบนซ้าย/บนขวา/กลางซ้าย/กลางขวาขึ้นอีก 100px กันไพ่ในมือ
// ทับไพ่กองกลาง G3 บนจอที่สูงไม่พอ — บนซ้าย/บนขวาลบ top ตรงๆ (2-100=-98) ส่วนกลางซ้าย/กลางขวาใช้ top เป็น %
// อยู่แล้ว (คำนวณ px ตรงไม่ได้) เลยใช้ marginTop ติดลบทบเข้าไปแทน (ผลลัพธ์เดียวกับลบ 100px จากตำแหน่งเดิม)
// Feedback ลุงเยาะ (รอบ 7) — กลางซ้าย/กลางขวาลงต่ำไปอีก 70px จากรอบก่อน (marginTop -100 -> -30) บนซ้าย/บนขวา
// คงเดิมไม่เปลี่ยน (ลุงระบุแค่ "ผู้เล่นกลางซ้ายและกลางขวา" เท่านั้น)
// Feedback ลุงเยาะ (รอบ 8) — ตอน BETTING (เริ่มกด Call/Fold กองแรกเป็นต้นไปจนจบ ครอบคลุมทั้ง G1/G2/G3)
// กลางซ้าย/กลางขวาลงต่ำอีกหนึ่งความสูงไพ่คู่ต่อสู้ (OPP_CH) กันชนกับแถวหลังไพ่ที่โผล่มาตอนนี้ — เฟสอื่น
// (ARRANGE/AUCTION/REARRANGE) ไม่มีแถวไพ่โชว์ใต้ bubble เลยไม่ต้องขยับ
// Feedback ลุงเยาะ (รอบ 11) — มือถือบางรุ่นยังทับไพ่กองกลางอยู่ + พื้นที่ว่างด้านล่างยังเหลือพอ ขยับฐาน
// (ทุกเฟส ไม่ใช่แค่ตอน BETTING) ลงอีก 40px (marginTop -30 -> 10)
function remoteSeatPosition(index: number, isBetting: boolean): ViewStyle {
  const midBettingShift = isBetting ? OPP_CH : 0
  return [
    { top: -98, left: '8%' },
    { top: -98, right: '8%' },
    { top: '45%', left: 2, marginTop: 10 + midBettingShift },
    { top: '45%', right: 2, marginTop: 10 + midBettingShift },
  ][index] as ViewStyle
}
// มติลุงเยาะ (รอบ 4, HOLDEM_G3) — G3 มี 2 รอบเดิมพัน ตรงกับจังหวะ Turn (groupRound 1, เพิ่งเปิดใบที่ 4)
// และ River (groupRound 2, เพิ่งเปิดใบที่ 5) ใส่ label ให้ผู้เล่นรู้จังหวะชัดเจนขึ้น (ruleset อื่นไม่เปลี่ยน)
function phaseLabel(game: GameView) {
  if (game.phase === 'BETTING') {
    if (game.centerRuleset === 'HOLDEM_G3' && game.group === 3) {
      return `G3 BETTING — ${game.groupRound === 1 ? 'TURN' : 'RIVER'} / ROUND ${game.bettingRound}`
    }
    return `G${game.group} BETTING / ROUND ${game.bettingRound}`
  }
  if (game.phase === 'INITIAL_ARRANGE') return `ARRANGE ${handLayoutLabel(game.centerRuleset)}`
  if (game.phase === 'BLIND_AUCTION') return 'SEALED AUCTION'
  return `REARRANGE ${handLayoutLabel(game.centerRuleset)}`
}
function friendlyError(value?: string) { return (value ?? 'Something went wrong.').replaceAll('_', ' ').toLowerCase().replace(/^./, c => c.toUpperCase()) }

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07120b', paddingHorizontal: 18, alignItems: 'center' },
  eyebrow: { color: '#38bdf8', fontSize: 9, fontWeight: '900', letterSpacing: 3 },
  pageTitle: { color: '#f5f2e8', fontSize: 25, fontWeight: '900', marginTop: 5 },
  pageSub: { color: '#90a696', fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  section: { color: '#c9a84c', fontSize: 10, fontWeight: '900', letterSpacing: 2, alignSelf: 'flex-start', marginVertical: 10 },
  // ทดลองมติลุงเยาะ — host เลือกกติกากองกลาง/FOUL_HAND ก่อนเปิดโต๊ะ
  ruleRow: { width: '100%', flexDirection: 'row', gap: 7 },
  ruleOption: { flex: 1, ...glassPanelDense, padding: 10, alignItems: 'center', borderColor: '#31523d' },
  ruleOptionActive: { borderColor: '#c9a84c', backgroundColor: 'rgba(201,168,76,.12)' },
  ruleOptionText: { color: '#90a696', fontSize: 11, fontWeight: '900' },
  ruleOptionTextActive: { color: '#c9a84c' },
  ruleHint: { color: '#758a7b', fontSize: 8, marginTop: 4, alignSelf: 'flex-start' },
  foulToggleRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  foulToggleLabel: { color: '#d9e1db', fontSize: 11, fontWeight: '800' },
  optionRow: { width: '100%', flexDirection: 'row', gap: 7 },
  option: { flex: 1, ...glassPanelDense, padding: 10, alignItems: 'center' },
  optionTier: { color: '#f5f2e8', fontSize: 11, fontWeight: '900', textAlign: 'center' },
  optionMeta: { color: '#90a696', fontSize: 8, marginTop: 4 }, optionAction: { color: '#c9a84c', fontSize: 9, fontWeight: '900', marginTop: 9 },
  empty: { color: '#758a7b', textAlign: 'center', padding: 20 },
  openTable: { ...glassPanelDense, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tableTitle: { color: '#f5f2e8', fontWeight: '900', fontSize: 12 }, tableMeta: { color: '#90a696', fontSize: 10, marginTop: 3 }, join: { color: '#c9a84c', fontWeight: '900' },
  back: { color: '#90a696', fontSize: 10, fontWeight: '800', letterSpacing: 1, padding: 12 },
  waitingSeats: { width: '100%', gap: 7 }, seatTile: { ...glassPanelDense, padding: 9 }, selfSeat: { borderColor: '#38bdf8' },
  // มติลุงเยาะ — Avatar หน้าชื่อผู้เล่นใน Waiting Chamber (แถวแนวนอน: avatar ซ้าย, ข้อมูลที่นั่งขวา)
  seatTileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, seatTileInfo: { flex: 1 },
  seatId: { color: '#38bdf8', fontSize: 9, fontWeight: '900' }, seatName: { color: '#f5f2e8', fontWeight: '800', marginTop: 2 }, seatStatus: { color: '#9b8570', fontSize: 8, fontWeight: '900', marginTop: 3 }, ready: { color: '#6ec87a' },
  // Batch 2 (VIP-04) — จุดวิ่งข้างข้อความ WAITING เฉพาะที่นั่งว่างจริง
  seatStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  waitingDotsRow: { flexDirection: 'row', gap: 2 },
  waitingDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#9b8570' },
  terms: { ...glassPanelDense, width: '100%', marginTop: 12, padding: 12 }, termsTitle: { color: '#c9a84c', fontWeight: '900', fontSize: 10, marginBottom: 5 }, term: { color: '#b6c2b9', fontSize: 10, marginTop: 3 },
  primary: { width: '100%', backgroundColor: '#c9a84c', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 10 }, primaryText: { color: '#07120b', fontWeight: '900', fontSize: 11, letterSpacing: 1 }, disabled: { opacity: 0.38 },
  // Batch 1 (VIP-05 fix, C6) — Accept ที่ confirm แล้ว: dim ตามธีม (ไม่ใช่ opacity ทึบแบบ s.disabled ธรรมดา)
  primaryConfirmed: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#2A4A34' },
  primaryTextConfirmed: { color: '#7A7A6A' },
  // Batch 1 (VIP-05 fix, C6) — LEAVE TABLE เด่นขึ้นหลัง confirm สำเร็จ (ห้ามแก้ s.back ตรงๆ — BROWSER screen ใช้ร่วม)
  leaveProminent: { width: '100%', borderWidth: 1, borderColor: '#FF6B6B', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 10, backgroundColor: 'transparent' },
  leaveProminentText: { color: '#FF6B6B', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  // Batch 1 (VIP-05 fix, C3) — toast แจ้งตอนได้ host role ใหม่
  hostToast: { width: '100%', backgroundColor: 'rgba(201,168,76,.16)', borderWidth: 1, borderColor: '#c9a84c', borderRadius: 8, padding: 8, marginTop: 10, alignItems: 'center' },
  hostToastText: { color: '#c9a84c', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  gameRoot: { flex: 1, backgroundColor: '#07120b' }, tableArea: { flex: 1, marginHorizontal: 10, position: 'relative' },
  // Feedback ลุงเยาะ (เทสมือถือรอบ 2) — แท็บ/การ์ดกติกาแมตช์ บนสุดของจอ ปิดไว้เป็น default
  rulesTab: { alignSelf: 'center', marginTop: 3, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(7,18,11,.7)', borderWidth: 1, borderColor: '#31523d' },
  rulesTabText: { color: '#90a696', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  rulesPanel: { alignSelf: 'center', marginTop: 4, ...glassPanelDense, padding: 8, minWidth: 200 },
  rulesPanelRow: { color: '#d9e1db', fontSize: 9, fontWeight: '700', marginTop: 2 },
  // Feedback ลุงเยาะ — ไพ่ทิ้งบังคับคว่ำซ้อนกันบนสุดของจอ (ใต้ GameTopBar โดยตรง เป็น flex flow ปกติ ไม่ใช้
  // absolute กัน overlap กับอย่างอื่น) กว้างพอสำหรับ 5 ใบซ้อน (22 + 4*6 = 46px)
  discardStackWrap: { alignItems: 'center', marginTop: 4 },
  discardStackLabel: { color: '#758a7b', fontSize: 7, fontWeight: '900', letterSpacing: 1, marginBottom: 2 },
  discardStackRow: { width: 46, height: 32 },
  discardStackCard: { position: 'absolute', top: 0, borderRadius: 3, overflow: 'hidden' },
  // Batch 2 (VIP-03) — header ใต้ GameTopBar เฉพาะตอน INITIAL_ARRANGE
  vipPlusHeaderBlock: { alignItems: 'center', marginTop: 4, paddingHorizontal: 12 },
  vipPlusHeaderTitle: { fontFamily: 'Cinzel_700Bold', color: '#FFD76A', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  vipPlusHeaderSub: { color: '#C8C4B0', fontSize: 9, marginTop: 1 },
  // Batch 4 (VIP-09) — Round Result banner
  // Feedback ลุงเยาะ (เทสมือถือรอบ 1) — เดิม banner เล็กไม่พอ เปลี่ยนเป็น overlay เต็มจอโชว์ไพ่ผู้ชนะครบชุด
  roundResultOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 900,
    backgroundColor: 'rgba(7,18,11,.88)', alignItems: 'center', justifyContent: 'center',
  },
  roundResultPile: { color: '#38bdf8', fontSize: 12, fontWeight: '900', letterSpacing: 3 },
  roundResultWinner: { color: '#c9a84c', fontSize: 24, fontWeight: '900', marginTop: 6 },
  roundResultHand: { color: '#8DFFB5', fontSize: 15, fontWeight: '800', marginTop: 4 },
  roundResultCardRow: { flexDirection: 'row', gap: 8, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' },
  roundResultCard: { borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#c9a84c' },
  // Batch 4 (VIP-09) — Coin Flying VFX wrapper (ต้อง alignItems/justifyContent:'center' ให้ FlyingCoins ตีความ (0,0) เป็นกึ่งกลางจอ)
  vfxOverlay: { alignItems: 'center', justifyContent: 'center', zIndex: 55 },
  floatingDelta: { position: 'absolute' },
  floatingDeltaText: { color: '#8DFFB5', fontSize: 15, fontWeight: '900', textShadowColor: 'rgba(0,0,0,.6)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  remoteSeat: { position: 'absolute', zIndex: 5 }, bubble: { width: 78, borderRadius: 12, borderWidth: 1, borderColor: '#31523d', backgroundColor: 'rgba(7,18,11,.9)', padding: 6, alignItems: 'center' },
  bubbleActive: { borderColor: '#c9a84c', shadowColor: '#c9a84c', shadowOpacity: .6, shadowRadius: 8 }, bubbleFolded: { opacity: .48 }, bubbleSeat: { color: '#38bdf8', fontSize: 8, fontWeight: '900' },
  // มติลุงเยาะ — Avatar หน้าชื่อผู้เล่นใน bubble ระหว่างเกม (แถวแนวนอนเล็กๆ: avatar ซ้าย, ชื่อขวา)
  bubbleNameRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  bubbleName: { color: '#f5f2e8', fontSize: 10, fontWeight: '800', maxWidth: 58 }, bubbleStack: { color: '#6ec87a', fontSize: 8, marginTop: 2 }, foldBadge: { color: '#ff8b72', fontSize: 7, fontWeight: '900' }, disconnectBadge: { color: '#facc15', fontSize: 6, fontWeight: '900' },
  blankCards: { width: 48, height: 24, marginTop: 4, position: 'relative' }, blankLabel: { color: '#9b8570', fontSize: 5, fontWeight: '900', marginTop: 2 },
  // Betting phase — หลังไพ่/ไพ่หงายของคนอื่น (เล็กกว่าไพ่ P1 เสมอ — มติลุงเยาะ 2026-08-04)
  oppHandRow: { flexDirection: 'row', marginTop: 4, alignSelf: 'center' },
  // Batch 2 (VIP-08) — ซ้อน 60% ของ OPP_CW (44 * 0.6 ≈ 26) ใบแรกไม่มีใบก่อนหน้าให้ซ้อน แต่ marginLeft
  // ติดลบใช้ได้ปลอดภัยเพราะ Card แรกอยู่ใน flexbox row เดียวกัน ไม่ใช่ absolute (แค่ขยับเข้าหา label ก่อนหน้าเล็กน้อย)
  oppHandCard: { marginLeft: -26, borderRadius: 3, overflow: 'hidden' },
  oppHandRevealed: { borderWidth: 1.5, borderColor: '#c9a84c' },
  // Betting phase — ไพ่ในมือ P1 ของกองที่กำลังเดิมพัน (ใหญ่กว่า oppHandCard เสมอ)
  ownBetPileWrap: { width: '100%', alignItems: 'center', marginTop: 4 },
  ownBetPileLabel: { color: '#c9a84c', fontSize: 9, fontWeight: '900', letterSpacing: 0.5, marginBottom: 4 },
  ownBetPileRow: { flexDirection: 'row' },
  ownBetCard: { marginLeft: 6, borderRadius: 4, borderWidth: 1, borderColor: 'transparent' },
  // Feedback ลุงเยาะ (เทสมือถือรอบ 1) — เดิมขยับแค่ -8px มองไม่ค่อยออกว่าใบไหนถูกเลือกหงาย ขยับเพิ่มเป็น -20px
  // ทั้ง 2 สถานะ (เลือกไว้ก่อน CALL / หงายแล้วหลัง CALL) กันใบตกกลับตำแหน่งเดิมทันทีที่ CALL สำเร็จ
  ownBetCardSel: { borderColor: '#8DFFB5', borderWidth: 2, transform: [{ translateY: -20 }] },
  ownBetCardRevealed: { borderColor: '#c9a84c', borderWidth: 2, opacity: 0.85, transform: [{ translateY: -20 }] },
  // Feedback ลุงเยาะ (เทสมือถือ) — เดิม 68 ขยับลง +71 (CENTER_CH) เป็น 139 แล้วเลื่อนกลับขึ้นครึ่งหนึ่ง
  // (71/2=35.5) เหลือ 103.5 ล่าสุดขยับขึ้นอีก 100px กันไพ่คู่ต่อสู้ทับกองกลาง G3 บนจอที่สูงไม่พอ (103.5-100=3.5)
  centerZone: { alignSelf: 'center', marginTop: 3.5, width: '68%', alignItems: 'center', ...glassPanelDense, padding: 9 }, phase: { color: '#c9a84c', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 5 },
  centerRow: { minHeight: 54, flexDirection: 'row', gap: 3, alignItems: 'center', marginVertical: 2 }, groupLabel: { width: 20, color: '#90a696', fontSize: 9, fontWeight: '900' }, noCenter: { color: '#758a7b', fontSize: 8 }, pots: { marginTop: 4, borderTopWidth: 1, borderTopColor: '#31523d', paddingTop: 4 }, potText: { color: '#c9a84c', fontSize: 8, fontWeight: '800' },
  localZone: { paddingHorizontal: 10, paddingBottom: 8, alignItems: 'center' }, editor: { width: '100%', marginTop: 4, alignItems: 'center' }, handRow: { height: 100, position: 'relative', alignSelf: 'center' }, handCard: { position: 'absolute', top: 0, alignItems: 'center', borderWidth: 1, borderColor: 'transparent', borderRadius: 4 }, selectedCard: { borderColor: '#c9a84c' }, cardGroup: { color: '#38bdf8', fontSize: 8, fontWeight: '900', marginTop: 2 }, editorHint: { color: '#90a696', fontSize: 8, textAlign: 'center', marginTop: 3 },
  // Feedback ลุงเยาะ — กากบาทบนใบที่ถูกบังคับทิ้ง (G3 ลำดับที่ 5 เฉพาะ Game 1-2)
  // Feedback ลุงเยาะ (เทสมือถือรอบ 2) — ต้องมี elevation สูงกว่า Card.tsx's cardBase (elevation:4) ไม่งั้น
  // บน Android ไพ่จะซ้อนทับกากบาทได้ทั้งที่ JSX เขียนกากบาทไว้ทีหลัง (elevation คุมลำดับซ้อนแยกจาก JSX order
  // บน Android) — ห้ามแก้ Card.tsx เลยแก้ที่ overlay ของตัวเองแทนให้สูงกว่าเสมอ
  discardMark: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(7,18,11,.55)', borderRadius: 4, zIndex: 20, elevation: 20,
  },
  discardMarkText: { color: '#FF6B6B', fontSize: 30, fontWeight: '900' },
  actions: { width: '100%', flexDirection: 'row', gap: 8, marginTop: 8 }, foldButton: { flex: 1, borderWidth: 1, borderColor: '#ff8b72', borderRadius: 10, padding: 12, alignItems: 'center', backgroundColor: 'rgba(110,30,25,.8)' }, foldText: { color: '#ffb1a0', fontWeight: '900' }, callButton: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center', backgroundColor: '#c9a84c' }, callText: { color: '#07120b', fontWeight: '900' },
  deadline: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#c9a84c', alignItems: 'center', justifyContent: 'center' }, deadlineValue: { color: '#f5f2e8', fontWeight: '900', fontSize: 14 }, deadlineLabel: { color: '#90a696', fontSize: 6 },
  forfeit: { position: 'absolute', right: 8, bottom: 8, borderWidth: 1, borderColor: '#ff8b72', borderRadius: 8, backgroundColor: 'rgba(60,15,12,.85)', paddingHorizontal: 9, paddingVertical: 6 }, forfeitText: { color: '#ffb1a0', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  metrics: { width: '100%', borderWidth: 1, borderColor: '#31523d', borderRadius: 10, padding: 8, marginBottom: 8 }, metricsTitle: { color: '#c9a84c', fontSize: 10, fontWeight: '900', textAlign: 'center', letterSpacing: 2, marginBottom: 5 }, metricsHeader: { flexDirection: 'row', paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: '#31523d' }, metricsRow: { flexDirection: 'row', paddingVertical: 3 }, metricsSelf: { backgroundColor: 'rgba(201,168,76,.12)' }, metricName: { flex: 1, color: '#d9e1db', fontSize: 8 }, metricCell: { width: 42, color: '#d9e1db', fontSize: 8, fontWeight: '800', textAlign: 'right' }, burnTotal: { color: '#9db1a2', fontSize: 8, textAlign: 'right', marginTop: 5 },
  victoryVfx: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 },
})
