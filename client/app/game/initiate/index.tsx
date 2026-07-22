/**
 * live.tsx / index.tsx — GameTable Live v5 (Initiate Tier)
 * The Sage Unicorn Studio Co., Ltd.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert, Animated, Image, ImageBackground, Platform, ScrollView, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { io, Socket } from 'socket.io-client'
import { autoSort } from '../../../src/utils/autoSort'
import { useAuthStore } from '../../../src/store/authStore'
import { PRESET_AVATARS } from '../../../src/components/profile/AvatarPicker'
import { useUserStore } from '../../../src/store/userStore'
import PreGameCountdown from '../../../src/components/PreGameCountdown'
import { ActionButton } from '../../../src/components/ui/ActionButton'
import { MenuButton } from '../../../src/components/ui/MenuButton'
import { ResultPanel } from '../../../src/components/ui/ResultPanel'
import { glassPanelDense } from '../../../src/ui/glassStyles'
import { GuideOverlay } from '../../../src/components/onboarding/GuideOverlay'

const SHOWDOWN_BG_FREE = require('../../../assets/backgrounds/bg_main_free.png')
const SHOWDOWN_BG_VIP  = require('../../../assets/backgrounds/bg_main_vip.png')

// ── Assets
const studioLogo  = require('../../../assets/images/sage_unicorn_logo_transparent.png')
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

const CW = 54; const CH = 78; const OVERLAP = -36
const SIDE_COL_W = 72
const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'
const ROOM_ID    = 'Initiate1'
const DEV_FAKE_USER_ID = __DEV__ ? process.env.EXPO_PUBLIC_DEV_FAKE_USER_ID : undefined

interface CardData { id: string; key: string }
interface AIInfo   { id: string; name: string; emoji: string }

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
      Animated.timing(dotAnim, { toValue: 0.25, duration: 900, useNativeDriver: false }),
      Animated.timing(dotAnim, { toValue: 1,    duration: 900, useNativeDriver: false }),
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

const GameTableLive: React.FC = () => {
  const insets = useSafeAreaInsets()
  const isWeb  = Platform.OS === 'web'
  const socketRef = useRef<Socket | null>(null)
  const authUserId = useUserStore(s => s.userId)
  const usingDevFakeId = !authUserId && !!DEV_FAKE_USER_ID
  const PLAYER_ID = authUserId || DEV_FAKE_USER_ID || ''
  const myAvatarRaw = useAuthStore(s => s.profile?.avatar_url) || '👤'
  const myPreset = PRESET_AVATARS.find(p => p.key === myAvatarRaw)
  const myAvatarEmoji = myPreset?.emoji ?? (myPreset?.image ? '' : myAvatarRaw)
  const myAvatarImage = myPreset?.image
  const myDisplayName = useAuthStore(s => s.profile?.display_name) || 'You'
  const isVip = useAuthStore(s => (s.profile?.vip_status ?? 'none') !== 'none')

  const timerValRef = useRef({ val: 90, max: 90 })
  const continueValRef = useRef(0)
  const aiListRef = useRef<AIInfo[]>([])
  const timerRef    = useRef<any>(null)
  const countdownAnimTimeoutRef = useRef<any>(null)
  const dealAnimCompositeRef = useRef<Animated.CompositeAnimation | null>(null)
  const winPulseLoopRef = useRef<Animated.CompositeAnimation | null>(null)
  const winOpacityLoopRef = useRef<Animated.CompositeAnimation | null>(null)
  const confettiActiveRef = useRef(false)
  const confettiCompositesRef = useRef<Animated.CompositeAnimation[]>([])

  const [phase, setPhase]               = useState<'dealing'|'arrangement'|'countdown'|'showdown'|'result'|'end'>('dealing')
  const [dealTrigger, setDealTrigger] = useState(0)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [dealDone, setDealDone]         = useState(false)
  const [dealCount, setDealCount]       = useState(0)
  const [roundNumber, setRoundNumber] = useState(1)
  const [countdown, setCountdown]     = useState(3)
  const [showPreGameCountdown, setShowPreGameCountdown] = useState(false)
  const preGameCountdownShownRef = useRef(false)
  const countAnim = useRef(new Animated.Value(1)).current
  const fadeCards    = useRef(new Animated.Value(1)).current
  const blinkAnim    = useRef(new Animated.Value(1)).current
  const btnBlinkAnim  = useRef(new Animated.Value(1)).current

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

  const [piles, setPiles]       = useState<[CardData[], CardData[], CardData[]]>([[], [], []])
  const [selected, setSelected] = useState<{ pi: number; ci: number } | null>(null)
  const [sortDone, setSortDone] = useState(false)
  const [isReady, setIsReady]   = useState(false)
  const [showReadyGuide, setShowReadyGuide] = useState(false)

  const [comm, setComm]   = useState({ p1: ['',''], p2: ['',''], p3: ['',''] })
  const [blind, setBlind] = useState<string[]>([])

  const [aiList, setAiList]     = useState<AIInfo[]>([])
  const [aiStatus, setAiStatus] = useState<Record<string, string>>({})

  const [allCards, setAllCards]       = useState<Record<string, Record<number, string[]>>>({})
  const [pileWinners, setPileWinners] = useState<Record<number, string>>({})
  const [hasFoul, setHasFoul]         = useState<Record<string, boolean>>({})
  const [foulReasons, setFoulReasons]   = useState<Record<string, string>>({})
  const [showResult, setShowResult]   = useState(false)
  const [handRanks, setHandRanks]       = useState<Record<number, string>>({})
  const [showRankTable, setShowRankTable] = useState(false)
  const [activeShowdownTab, setActiveShowdownTab] = useState<1|2|3>(1)
  const [revealPile, setRevealPile] = useState<0|1|2|3>(0)
  const [showTierInfo, setShowTierInfo] = useState(false)
  const [activeTierTab, setActiveTierTab] = useState('INITIATE')

  const [jackpotWinner, setJackpotWinner] = useState<string | null>(null)
  const jackpotTimeoutRef = useRef<any>(null)

  const [tokenBalance, setTokenBalance] = useState<Record<string, number>>({})
  const fmtToken = (v: number | undefined) => (v ?? buyInAmount).toLocaleString('en-US')
  const [tokenDeltas, setTokenDeltas]   = useState<Record<string, number>>({})
  const [matchResult, setMatchResult]   = useState<any>(null)

  const [showDiscard, setShowDiscard]         = useState(false)
  const [buyInAmount, setBuyInAmount]       = useState(0)
  const [showLockup, setShowLockup]         = useState(false)
  const [discardSelected, setDiscardSelected] = useState<number[]>([])

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

  const jackpotPulse = useRef(new Animated.Value(0.5)).current
  const jackpotConfettiAnims = useRef(
    Array.from({ length: 20 }, () => ({
      x: new Animated.Value(Math.random() * 360 - 30),
      y: new Animated.Value(-20),
      opacity: new Animated.Value(1),
      rotate: new Animated.Value(0),
    }))
  ).current

  const startContinueCountdown = () => {
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

  const triggerJackpot = (winnerId: string) => {
    if (jackpotTimeoutRef.current) clearTimeout(jackpotTimeoutRef.current)
    setJackpotWinner(winnerId)

    jackpotPulse.setValue(0.5)
    Animated.sequence([
      Animated.timing(jackpotPulse, { toValue: 1.15, duration: 250, useNativeDriver: false }),
      Animated.timing(jackpotPulse, { toValue: 1,    duration: 200, useNativeDriver: false }),
    ]).start()

    jackpotConfettiAnims.forEach((a, i) => {
      a.x.setValue(Math.random() * 360 - 30)
      a.y.setValue(-20); a.opacity.setValue(1); a.rotate.setValue(0)
      Animated.parallel([
        Animated.timing(a.y,       { toValue: 700, duration: 1800 + Math.random() * 1200, delay: i * 40, useNativeDriver: false }),
        Animated.timing(a.opacity, { toValue: 0,   duration: 2200, delay: i * 40, useNativeDriver: false }),
        Animated.timing(a.rotate,  { toValue: 720, duration: 1800, delay: i * 40, useNativeDriver: false }),
      ]).start()
    })

    jackpotTimeoutRef.current = setTimeout(() => {
      setJackpotWinner(null)
    }, 5000)
  }

  useEffect(() => {
    const hasFoulAll = Object.keys(hasFoul).length > 0
    const winnersReady = pileWinners[1] && pileWinners[2] && pileWinners[3]
    if (!winnersReady && !hasFoulAll) return
    if (showResult) return
    setShowResult(true)
    startContinueCountdown()
  }, [JSON.stringify(pileWinners), JSON.stringify(hasFoul)])

  useEffect(() => {
    if (!PLAYER_ID) {
      Alert.alert('Session expired', 'Please log in again.', [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }])
      return
    }

    const socket = io(SERVER_URL, { transports: ['websocket'], reconnection: false })
    socketRef.current = socket

    let matchStarted = false
    socket.on('connect', () => {
      setConnectionError(null)
      if (matchStarted) return
      matchStarted = true
      socket.emit('player_join_room', { roomId: ROOM_ID, playerId: PLAYER_ID, isVip: false })
      socket.emit('start_match', { roomId: ROOM_ID, playerId: PLAYER_ID, tier: 'initiate' })
    })

    socket.on('connect_error', (err: any) => {
      setConnectionError(err?.message || 'Cannot reach the game server.')
    })

    socket.on('match_error', (data: { roomId: string; message: string }) => {
      Alert.alert('Cannot Start Match', data.message === 'INSUFFICIENT_TOKENS' ? 'You do not have enough tokens.' : 'Something went wrong.', [{ text: 'OK', onPress: () => router.replace('/(home)/lobby') }])
    })

    socket.on('round_start', (data: any) => {
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
      fadeCards.stopAnimation(() => { fadeCards.setValue(0) })
      setBlind([]); setDealCount(0)
      setTokenBalance(data.tokenBalance ?? {})
      const aiNames = data.aiNames ?? []
      setAiList(aiNames)
      aiListRef.current = aiNames

      const init: Record<string, string> = {}
      data.aiNames?.forEach((a: any) => { init[a.id] = 'Arranging...' })
      setAiStatus(init)

      setComm({ p1: data.communityCards.pile1, p2: data.communityCards.pile2, p3: data.communityCards.pile3 })
      setBlind(data.blindAuction ?? [])

      if (data.buyInAmount && data.roundNumber === 1) {
        setBuyInAmount(data.buyInAmount)
        setShowLockup(true)
      }

      setPhase('dealing')
      setDealTrigger(t => t + 1)
      setDealDone(false)

      const myCards: string[] = data.cards[PLAYER_ID] ?? []
      const cardObjs = myCards.map((k: string, i: number) => ({ id: `c${i}`, key: k }))
      setPiles([cardObjs.slice(0, 3), cardObjs.slice(3, 6), cardObjs.slice(6, 11)])

      const t = (data.timer ?? 90) + 15
      timerValRef.current = { val: t, max: t }
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        const next = Math.max(0, timerValRef.current.val - 1)
        timerValRef.current = { ...timerValRef.current, val: next }
        if (next <= 0) {
          clearInterval(timerRef.current)
          setPiles(cur => {
            socket.emit('player_ready', {
              roomId: ROOM_ID, playerId: PLAYER_ID,
              arrangement: { pile1: cur[0].map(c => c.key), pile2: cur[1].map(c => c.key), pile3: cur[2].slice(0, 3).map(c => c.key) },
            })
            return cur
          })
        }
      }, 1000)
    })

    socket.on('showdown_countdown', (data: any) => {
      setPhase('countdown')
      if (timerRef.current) clearInterval(timerRef.current)
      if (countdownAnimTimeoutRef.current) clearTimeout(countdownAnimTimeoutRef.current)
      let c = data.seconds ?? 3
      const tick = () => {
        setCountdown(c)
        Animated.sequence([
          Animated.timing(countAnim, { toValue: 1.6, duration: 150, useNativeDriver: false }),
          Animated.timing(countAnim, { toValue: 1,    duration: 850, useNativeDriver: false }),
        ]).start()
        if (c > 0) { c--; countdownAnimTimeoutRef.current = setTimeout(tick, 1000) }
      }
      tick()
    })

    socket.on('showdown_result', (data: any) => {
      const results = data.pileResults ?? []
      const newAllCards: Record<string, Record<number, string[]>> = {}
      const newWinners: Record<number, string> = {}
      const newHandRanks: Record<number, string> = {}
      const newFouled: Record<string, boolean> = {}

      results.forEach((pile: any) => {
        const pNum: number = pile.pileNumber
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

      if (newWinners[1] && newWinners[1] === newWinners[2] && newWinners[2] === newWinners[3]) {
        triggerJackpot(newWinners[1])
      }
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
      if (typeof data.newTokenBalance === 'number') {
        useUserStore.getState().updateTokenBalance(data.newTokenBalance)
      }
    })

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (countdownAnimTimeoutRef.current) clearTimeout(countdownAnimTimeoutRef.current)
      if (dealAnimCompositeRef.current) dealAnimCompositeRef.current.stop()
      stopMatchEndAnimations()
      if (jackpotTimeoutRef.current) clearTimeout(jackpotTimeoutRef.current)
      socket.disconnect()
    }
  }, [])

  const startDealAnimation = () => {
    if (dealAnimCompositeRef.current) dealAnimCompositeRef.current.stop()
    const targets = [
      { x: -50,  y: -240 },
      { x: 90,   y: -10  },
      { x: -50,  y: 200  },
      { x: -190, y: -10  },
    ]
    dealAnims.forEach(a => {
      a.x.setValue(0); a.y.setValue(0)
      a.opacity.setValue(0); a.scale.setValue(0.5)
    })

    const delayPerCard = (10000 - 1000) / DEAL_COUNT
    const anims: Animated.CompositeAnimation[] = []

    dealAnims.forEach((a, i) => {
      const playerIdx = i % 4
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
      setTimeout(() => setDealCount(i + 1), i * delayPerCard + 450)
    })

    dealAnimCompositeRef.current = Animated.parallel(anims)
    dealAnimCompositeRef.current.start(({ finished }) => {
      if (!finished) return
      setDealDone(true)
      setShowLockup(false)
      setPhase('arrangement')
      fadeCards.stopAnimation()
      Animated.timing(fadeCards, { toValue: 1, duration: 300, useNativeDriver: false }).start()
    })
  }

  useEffect(() => {
    if (phase === 'dealing') {
      const t = setTimeout(() => startDealAnimation(), 300)
      return () => clearTimeout(t)
    }
  }, [phase, dealTrigger])

  const handleCardPress = useCallback((pi: number, ci: number) => {
    if (isReady || phase !== 'arrangement') return
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

  const handleReady = () => {
    if (isReady || phase !== 'arrangement') return
    setShowDiscard(true); setDiscardSelected([3, 4])
  }

  const handleDiscardConfirm = () => {
    if (discardSelected.length !== 2) return
    setShowDiscard(false); setIsReady(true)
    if (timerRef.current) clearInterval(timerRef.current)
    const pile3kept = piles[2].filter((_, i) => !discardSelected.includes(i))
    socketRef.current?.emit('player_ready', {
      roomId: ROOM_ID, playerId: PLAYER_ID,
      arrangement: {
        pile1: piles[0].map(c => c.key),
        pile2: piles[1].map(c => c.key),
        pile3: pile3kept.map(c => c.key),
      },
    })
  }

  const toggleDiscard = (idx: number) => {
    setDiscardSelected(prev => {
      if (prev.includes(idx)) return prev.filter(i => i !== idx)
      if (prev.length >= 2) return prev
      return [...prev, idx]
    })
  }

  const handleContinue = () => {
    if (continueTimerRef.current) clearInterval(continueTimerRef.current)
    blinkAnim.stopAnimation(); blinkAnim.setValue(1)
    btnBlinkAnim.stopAnimation(); btnBlinkAnim.setValue(1)
    setShowResult(false)
    fadeCards.stopAnimation()
    Animated.timing(fadeCards, { toValue: 0, duration: 600, useNativeDriver: false }).start(() => {
      socketRef.current?.emit('player_continue', { roomId: ROOM_ID, playerId: PLAYER_ID })
    })
  }

  const stopMatchEndAnimations = () => {
    if (winPulseLoopRef.current) winPulseLoopRef.current.stop()
    if (winOpacityLoopRef.current) winOpacityLoopRef.current.stop()
    confettiActiveRef.current = false
    confettiCompositesRef.current.forEach(a => a.stop())
    confettiCompositesRef.current = []
  }

  const handleRematch = () => {
    stopMatchEndAnimations()
    setMatchResult(null); setPhase('arrangement')
    socketRef.current?.emit('start_match', { roomId: ROOM_ID, playerId: PLAYER_ID, tier: 'initiate' })
  }

  const CardBack: React.FC<{ w: number; h: number; ml?: number }> = ({ w, h, ml = 0 }) => (
    <View style={[s.cardBack, { width: w, height: h, borderRadius: w * 0.14, marginLeft: ml }]}>
      <Image source={cardBackImg} style={{ width: w, height: h }} resizeMode="cover" />
    </View>
  )

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

  const AIPiles: React.FC<{ aiId: string }> = ({ aiId }) => {
    const p1 = allCards[aiId]?.[1] ?? []; const p2 = allCards[aiId]?.[2] ?? []; const p3 = allCards[aiId]?.[3] ?? []
    const cards = [...p1, ...p2, ...p3]
    return (
      <View style={s.aiPilesFrame}>
        {([3, 3, 5] as number[]).map((cnt, pi) => (
          <View key={pi} style={s.aiPileGroup}>
            <Text style={s.aiPileLabel}>P{pi + 1}</Text>
            <View style={{ flexDirection: 'row' }}>
              {Array.from({ length: cnt }).map((_, ci) => {
                const idx = pi === 0 ? ci : pi === 1 ? 3 + ci : 6 + ci
                const cardKey = cards[idx]
                return renderCard(cardKey, 24, 34, ci === 0 ? 0 : -16, `${aiId}-${pi}-${ci}-${cardKey ?? 'back'}`)
              })}
            </View>
          </View>
        ))}
      </View>
    )
  }

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

  const pileShadowStyle = {
    shadowColor: '#000', shadowOffset: { width: 3, height: 4 }, shadowOpacity: 0.35, shadowRadius: 5, elevation: 8, borderRadius: 4, backgroundColor: '#fdfaf3',
  }

  const CommRow: React.FC<{ pileNum: number; k1: string; k2: string }> = ({ pileNum, k1, k2 }) => {
    const winner    = pileWinners[pileNum]
    const isWin     = winner === PLAYER_ID
    const winAI     = aiList.find(a => a.id === winner)
    const rawWinner = winner ? (allCards[winner]?.[pileNum] ?? []) : []
    const winCards  = pileNum === 3 ? rawWinner.slice(0, 3) : rawWinner
    const hasWinner = winner && winCards.length > 0

    return (
      <View style={{ alignItems: 'flex-start', gap: 2 }}>
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {k1 && CARD_IMG[k1] && <View style={pileShadowStyle}><View style={s.commCard}><Image source={CARD_IMG[k1]} style={{ width: 50, height: 72 }} resizeMode="cover" /></View></View>}
          {k2 && CARD_IMG[k2] && <View style={[pileShadowStyle, { marginLeft: -17 }]}><View style={s.commCard}><Image source={CARD_IMG[k2]} style={{ width: 50, height: 72 }} resizeMode="cover" /></View></View>}
          {hasWinner && <View style={{ width: 1, height: 72, backgroundColor: 'rgba(201,168,76,0.3)', marginHorizontal: 2 }} />}
          {hasWinner && winCards.map((k, i) => (
            <View key={i} style={[s.commCard, { borderColor: isWin ? '#4ade80' : '#f87171', borderWidth: 1.5, marginLeft: i > 0 ? -17 : 0 }]}>
              {CARD_IMG[k]
                ? <Image source={CARD_IMG[k]} style={{ width: 50, height: 72 }} resizeMode="cover" />
                : <Image source={cardBackImg} style={{ width: 50, height: 72 }} resizeMode="cover" />}
            </View>
          ))}
        </View>
      </View>
    )
  }

  // Component การ์ดในมือผู้เล่น (จัดระยะ overlap -36px)
  const FaceCard: React.FC<{ card: CardData; pi: number; ci: number; first: boolean }> = ({ card, pi, ci, first }) => {
    const isSel = selected?.pi === pi && selected?.ci === ci
    return (
      <TouchableOpacity onPress={() => handleCardPress(pi, ci)} activeOpacity={0.85}
        style={[
          s.userCard,
          !first && { marginLeft: -36 },
          isSel && s.userCardSel,
          { zIndex: ci }
        ]}>
        {CARD_IMG[card.key]
          ? <Image source={CARD_IMG[card.key]} style={{ width: CW, height: CH }} resizeMode="cover" />
          : <Text style={{ fontSize: 8 }}>{card.key}</Text>}
      </TouchableOpacity>
    )
  }

  const ShowdownResult = React.memo(() => {
    const activeTab = activeShowdownTab
    const setActiveTab = setActiveShowdownTab
    const allPlayerIds = [PLAYER_ID, ...Object.keys(allCards).filter(id => id !== PLAYER_ID)]
    const aiData = aiListRef.current.length > 0 ? aiListRef.current : aiList
    const players = allPlayerIds.map(id => {
      if (id === PLAYER_ID) return { id, label: myDisplayName, emoji: myAvatarEmoji }
      const ai = aiData.find(a => a.id === id)
      return { id, label: ai?.name ?? id, emoji: ai?.emoji ?? '🤖' }
    })
    const commMap: Record<number, string[]> = { 1: comm.p1, 2: comm.p2, 3: comm.p3 }
    const CARD_W = 50; const CARD_H = 72

    return (
      <View style={{ flex: 1, width: '100%', ...glassPanelDense, padding: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
          <Text style={{ fontSize: 18, color: '#FFD76A', fontWeight: '900', letterSpacing: 2, flex: 1 }}>SHOWDOWN</Text>
          <TouchableOpacity onPress={handleContinue} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,107,107,0.2)', borderWidth: 1.5, borderColor: '#FF6B6B', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, color: '#FF6B6B', fontWeight: '900' }}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
          {([1,2,3] as const).map(n => {
            const isMyWin = pileWinners[n] === PLAYER_ID
            return (
              <TouchableOpacity key={n} onPress={() => setActiveTab(n)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', borderColor: activeTab === n ? '#FFD76A' : '#2A4A34', backgroundColor: activeTab === n ? 'rgba(255,215,106,0.15)' : 'rgba(0,0,0,0.3)' }}>
                <Text style={{ fontSize: 13, color: activeTab === n ? '#FFD76A' : '#a89060', fontWeight: '800' }}>PILE {n}</Text>
                {isMyWin && <Text style={{ fontSize: 9, color: '#8DFFB5', fontWeight: '900' }}>🏆 YOU</Text>}
              </TouchableOpacity>
            )
          })}
        </View>

        <ScrollView style={{ flex: 1, maxHeight: 680 }} showsVerticalScrollIndicator={false}>
          {hasFoul[PLAYER_ID] && (
            <View style={{ backgroundColor: 'rgba(255,107,107,0.15)', borderWidth: 1.5, borderColor: '#FF6B6B', borderRadius: 8, padding: 6, marginBottom: 8, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, color: '#FF6B6B', fontWeight: '900', letterSpacing: 3 }}>⚠️ FOUL</Text>
              {foulReasons[PLAYER_ID] && <Text style={{ fontSize: 13, color: '#FFB74D', marginTop: 2 }}>{foulReasons[PLAYER_ID]}</Text>}
            </View>
          )}
          {handRanks[activeTab] && (
            <Text style={{ fontSize: 16, color: '#8DFFB5', fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>{handRanks[activeTab]}</Text>
          )}

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
          </View>

          <View style={{ gap: 3 }}>
            {players.map(p => {
              const revealed  = allCards[p.id]?.[activeTab]
              const cardKeys  = revealed ? (activeTab === 3 ? revealed.slice(0,3) : revealed) : []
              const isWinner  = pileWinners[activeTab] === p.id
              const isUser    = p.id === PLAYER_ID
              return (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 5, borderRadius: 8, borderWidth: isWinner ? 1.5 : 1, borderColor: isWinner ? '#8DFFB5' : '#2A4A34', backgroundColor: isWinner ? 'rgba(141,255,181,0.08)' : 'rgba(0,0,0,0.3)' }}>
                  <View style={{ width: 76, alignItems: 'center', marginRight: 8 }}>
                    <Text style={{ fontSize: 18 }}>{p.emoji}</Text>
                    <Text style={{ fontSize: 9, color: isUser ? '#FFD76A' : '#F5F2E8', fontWeight: '800' }} numberOfLines={1}>{isUser ? myDisplayName : p.label}</Text>
                    {isWinner && <Text style={{ fontSize: 9, color: '#8DFFB5', fontWeight: '900' }}>🏆 WIN</Text>}
                  </View>
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
  const userRevealed = allCards[PLAYER_ID]
  const isRevealed   = userRevealed && Object.keys(userRevealed).length > 0

  return (
    <View style={[s.root, isWeb && s.webOuter]}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <View style={[s.gameContainer, isWeb && s.webFrame]}>
        <View style={s.gameArea}>

          <PreGameCountdown visible={showPreGameCountdown} onComplete={() => setShowPreGameCountdown(false)} />
          <View style={StyleSheet.absoluteFill as any} pointerEvents="none"><Image source={tableImg} style={{ width: '100%', height: '100%' }} resizeMode="cover" /></View>

          {/* TOP BAR */}
          <View style={[s.topBar, { paddingTop: isWeb ? 22 : insets.top + 14, opacity: (phase === 'showdown' || phase === 'result') ? 0 : 1 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 50 }}>
              <View style={s.tierBadge}><Text style={s.tierText}>INITIATE</Text></View>
              <Text style={s.roundText}>R{roundNumber}/5</Text>
            </View>
            <View style={[s.potBadge, { marginLeft: 6 }]}>
              <Text style={s.stackLabel}>STACK</Text>
              <Text style={s.potText}>🪙 {tokenBalance[PLAYER_ID] ?? buyInAmount}</Text>
            </View>
            <TimerDisplay valRef={timerValRef} />
          </View>

          <Animated.View style={{ flex: 1, opacity: fadeCards }}>
            {/* BOSS AI (ด้านบน) */}
            <View style={[s.aiSeat, { opacity: (phase === 'countdown' || phase === 'showdown' || phase === 'result') ? 0 : 1 }]}>
              <View style={s.aiRow}>
                <AvatarBubble emoji={bossAI?.emoji ?? '🤖'} size={36} />
                <View>
                  <Text style={s.aiName}>{bossAI?.name ?? 'BOSS AI'}</Text>
                  <Text style={s.seatToken}>🪙 {fmtToken(tokenBalance[bossAI?.id ?? ''])}</Text>
                </View>
              </View>
              {bossAI && <AIPiles aiId={bossAI.id} />}
            </View>

            {/* MAIN AREA (ไพ่กองกลาง) */}
            <View style={[s.mainArea, { opacity: (phase === 'countdown' || phase === 'showdown' || phase === 'result') ? 0 : 1 }]}>
              <View style={[s.sideCol, { paddingLeft: 10 }]}>
                <Text style={s.sideName}>{p2AI?.name ?? 'P2'}</Text>
                <AvatarBubble emoji={p2AI?.emoji ?? '👤'} size={36} />
                {p2AI && <SideSeat rot="270deg" aiId={p2AI.id} />}
              </View>

              <View style={s.commWrap}>
                <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
                  <CommRow pileNum={1} k1={comm.p1[0]} k2={comm.p1[1]} />
                  <CommRow pileNum={2} k1={comm.p2[0]} k2={comm.p2[1]} />
                </View>
                <View style={{ alignSelf: 'center' }}>
                  <CommRow pileNum={3} k1={comm.p3[0]} k2={comm.p3[1]} />
                </View>
              </View>

              <View style={[s.sideCol, { paddingRight: 10 }]}>
                <Text style={s.sideName}>{p4AI?.name ?? 'P4'}</Text>
                <AvatarBubble emoji={p4AI?.emoji ?? '👤'} size={36} />
                {p4AI && <SideSeat rot="90deg" aiId={p4AI.id} />}
              </View>
            </View>

            {/* ── USER AREA: โซนจัดไพ่ในมือแนวนอน 3 กองพร้อมกรอบทอง ── */}
            <View style={[s.userArea, { opacity: (phase === 'countdown' || phase === 'showdown' || phase === 'result') ? 0 : 1 }]}>
              <Text style={[s.swapHint, { opacity: selected ? 1 : 0 }]}>Tap the cards you want to swap</Text>

              {isRevealed ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                  {[1, 2, 3].flatMap(pNum => userRevealed[pNum] ?? []).map((key, ci) => (
                    <View key={ci} style={[s.userCard, { zIndex: ci }]}>
                      {CARD_IMG[key] && <Image source={CARD_IMG[key]} style={{ width: CW, height: CH }} resizeMode="cover" />}
                    </View>
                  ))}
                </View>
              ) : (
                /* กรอบทองครอบทั้ง 3 PILE เรียงแนวนอนแถวเดียวกัน */
                <View style={s.pilesContainerFrame}>
                  {/* PILE 1 */}
                  <View style={s.pileGroup}>
                    <Text style={s.pileLabelHeader}>PILE 1</Text>
                    <View style={s.cardStackRow}>
                      {piles[0].map((card, ci) => (
                        <FaceCard key={card.id} card={card} pi={0} ci={ci} first={ci === 0} total={piles[0].length} />
                      ))}
                    </View>
                  </View>

                  {/* PILE 2 */}
                  <View style={s.pileGroup}>
                    <Text style={s.pileLabelHeader}>PILE 2</Text>
                    <View style={s.cardStackRow}>
                      {piles[1].map((card, ci) => (
                        <FaceCard key={card.id} card={card} pi={1} ci={ci} first={ci === 0} total={piles[1].length} />
                      ))}
                    </View>
                  </View>

                  {/* PILE 3 */}
                  <View style={s.pileGroup}>
                    <Text style={s.pileLabelHeader}>PILE 3</Text>
                    <View style={s.cardStackRow}>
                      {piles[2].map((card, ci) => (
                        <FaceCard key={card.id} card={card} pi={2} ci={ci} first={ci === 0} total={piles[2].length} />
                      ))}
                    </View>
                  </View>
                </View>
              )}
            </View>

          </Animated.View>

          {/* USER HUD (ขอบล่างซ้าย) */}
          <View style={{ position: 'absolute', bottom: Math.max(insets.bottom, 4), left: 10, zIndex: 3, flexDirection: 'row', alignItems: 'center', gap: 6 }} pointerEvents="none">
            <AvatarBubble emoji={myAvatarEmoji} image={myAvatarImage} size={38} />
            <View>
              <Text style={s.userNameTag} numberOfLines={1}>{myDisplayName}</Text>
              <Text style={s.seatToken}>🪙 {fmtToken(tokenBalance[PLAYER_ID])}</Text>
            </View>
          </View>

          {/* ACTION BAR (ปุ่มควบคุม AUTO SORT & READY) */}
          {phase !== 'dealing' && phase !== 'showdown' && phase !== 'result' && (
            <View style={s.actionBar}>
              <ActionButton icon="auto_sort" label={sortDone ? 'Sorted ✓' : 'Auto Sort'} variant={sortDone ? 'disabled' : 'normal'} disabled={sortDone || phase !== 'arrangement'} costBadge="FREE" onPress={handleAutoSort} style={s.actionBtnSize} />
              <ActionButton icon="ready" label="Ready" variant={isReady ? 'waiting' : 'normal'} disabled={isReady || phase !== 'arrangement'} onPress={handleReady} style={s.actionBtnSize} />
            </View>
          )}

        </View>

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

// ── STYLES
const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#0a0a0a' },
  webOuter:      { alignItems: 'center', justifyContent: 'center' },
  webFrame:      { width: 390, height: 920, borderRadius: 40, borderWidth: 3, borderColor: '#333', overflow: 'hidden' },
  gameContainer: { flex: 1, flexDirection: 'column' },
  gameArea:      { flex: 90, backgroundColor: '#6aaf7f', overflow: 'hidden', position: 'relative' },
  topBar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, zIndex: 2 },
  tierBadge:     { borderWidth: 1.5, borderColor: '#38bdf8', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(56,189,248,0.12)' },
  tierText:      { fontSize: 8, color: '#38bdf8', letterSpacing: 2, fontWeight: '800' },
  roundText:     { fontSize: 9, color: '#38bdf8', fontWeight: '800' },
  potBadge:      { borderWidth: 1, borderColor: 'rgba(201,168,76,.4)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center' },
  stackLabel:    { fontSize: 6, fontWeight: '800', letterSpacing: 1, color: 'rgba(201,168,76,.6)' },
  potText:       { fontSize: 10, fontWeight: '700', color: '#c9a84c' },
  timerText:     { fontSize: 20, fontWeight: '700', minWidth: 48, textAlign: 'right' },
  tbarWrap:      { paddingHorizontal: 12, paddingBottom: 2, zIndex: 2 },
  tbarBg:        { height: 3, backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 2, overflow: 'hidden' },
  tbarFill:      { height: '100%' as any, borderRadius: 2 },

  aiSeat:        { paddingHorizontal: 12, paddingVertical: 4, alignItems: 'center', gap: 4, zIndex: 2 },
  aiRow:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatarBubble:  { backgroundColor: '#132019', borderWidth: 2, borderColor: '#c9a84c', alignItems: 'center', justifyContent: 'center' },
  aiName:        { fontSize: 9, color: '#ff3333', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '800' },
  seatToken:     { fontSize: 9, color: '#FFD76A', fontWeight: '600' },
  cardBack:      { backgroundColor: '#091808', borderWidth: 1, borderColor: 'rgba(201,168,76,.5)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },

  mainArea:      { flex: 1, flexDirection: 'row', zIndex: 2, marginTop: -30 },
  sideCol:       { width: SIDE_COL_W, alignItems: 'center', paddingTop: 0, marginTop: 125, gap: 2 },
  sideName:      { fontSize: 9, color: '#ffffff', letterSpacing: 1, fontWeight: '700' },
  userNameTag:   { fontSize: 9, color: '#ffffff', letterSpacing: 1, fontWeight: '800', maxWidth: 80 },
  sideSeatWrap:  { flex: 1, width: SIDE_COL_W, overflow: 'visible', justifyContent: 'flex-start', alignItems: 'center' },
  sideSeatInner: { flexDirection: 'row', alignItems: 'center' },

  commWrap:      { flex: 1, paddingLeft: 4, paddingRight: 18, alignItems: 'flex-start', justifyContent: 'flex-start', marginTop: 90, zIndex: 2 },
  commCard:      { width: 50, height: 72, borderRadius: 4, backgroundColor: '#fdfaf3', borderWidth: 1, borderColor: 'rgba(74,154,90,.75)', overflow: 'hidden' },
  pileLabel:     { fontSize: 7, color: '#38bdf8', letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: '700' },
  winBadge:      { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  winBadgeTxt:   { fontSize: 7, fontWeight: '800' },

  /* ── โซนจัดไพ่ในมือแนวนอนพร้อมกรอบทอง ── */
  userArea:      { width: '100%', paddingHorizontal: 4, paddingBottom: 0, zIndex: 2, alignItems: 'center', marginTop: -10 },
  pilesContainerFrame: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '98%',
    paddingVertical: 8,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(0, 30, 15, 0.65)',
    borderWidth: 1.5,
    borderColor: '#c9a84c',
    borderRadius: 14,
    marginTop: 4,
  },
  pileGroup: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  pileLabelHeader: {
    fontSize: 9,
    color: '#FFD76A',
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  cardStackRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userCard:    { width: CW, height: CH, borderRadius: 4, backgroundColor: '#fdfaf3', borderWidth: 1, borderColor: 'rgba(201,168,76,.65)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  userCardSel: { borderColor: '#6ec87a', borderWidth: 2, transform: [{ translateY: -10 }] },
  swapHint:    { fontSize: 8, color: 'rgba(201,168,76,.9)', textAlign: 'center', marginBottom: 2 },
  actionBar:   { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 28, zIndex: 2, marginTop: 6 },
  actionBtnSize: { width: 130 },

  aiPilesFrame: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(0, 30, 15, 0.45)',
    borderWidth: 1.2,
    borderColor: '#c9a84c',
    borderRadius: 10,
  },
  aiPileGroup: { alignItems: 'center' },
  aiPileLabel: { fontSize: 8, color: '#FFD76A', fontWeight: '800', marginBottom: 2 },

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
