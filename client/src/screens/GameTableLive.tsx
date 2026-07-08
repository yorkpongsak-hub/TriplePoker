/**
 * GameTableLive.tsx — Live Game Screen
 * 1P vs 3 AI, 3 Rounds, Countdown 3-2-1, Token Delta
 * The Sage Unicorn Studio Co., Ltd.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated, Image, ScrollView, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native'
import { io, Socket } from 'socket.io-client'
import { autoSort, CommunityCards } from '../utils/autoSort'

// ── Assets
const cardBackImg = require('../../assets/images/card_back_default.png')
const CARD_IMG: Record<string, any> = {
  as: require('../../assets/cards/classic/as.png'),
  '2s': require('../../assets/cards/classic/2s.png'), '3s': require('../../assets/cards/classic/3s.png'),
  '4s': require('../../assets/cards/classic/4s.png'), '5s': require('../../assets/cards/classic/5s.png'),
  '6s': require('../../assets/cards/classic/6s.png'), '7s': require('../../assets/cards/classic/7s.png'),
  '8s': require('../../assets/cards/classic/8s.png'), '9s': require('../../assets/cards/classic/9s.png'),
  '10s': require('../../assets/cards/classic/10s.png'), js: require('../../assets/cards/classic/js.png'),
  qs: require('../../assets/cards/classic/qs.png'), ks: require('../../assets/cards/classic/ks.png'),
  ah: require('../../assets/cards/classic/ah.png'), '2h': require('../../assets/cards/classic/2h.png'),
  '3h': require('../../assets/cards/classic/3h.png'), '4h': require('../../assets/cards/classic/4h.png'),
  '5h': require('../../assets/cards/classic/5h.png'), '6h': require('../../assets/cards/classic/6h.png'),
  '7h': require('../../assets/cards/classic/7h.png'), '8h': require('../../assets/cards/classic/8h.png'),
  '9h': require('../../assets/cards/classic/9h.png'), '10h': require('../../assets/cards/classic/10h.png'),
  jh: require('../../assets/cards/classic/jh.png'), qh: require('../../assets/cards/classic/qh.png'),
  kh: require('../../assets/cards/classic/kh.png'), ad: require('../../assets/cards/classic/ad.png'),
  '2d': require('../../assets/cards/classic/2d.png'), '3d': require('../../assets/cards/classic/3d.png'),
  '4d': require('../../assets/cards/classic/4d.png'), '5d': require('../../assets/cards/classic/5d.png'),
  '6d': require('../../assets/cards/classic/6d.png'), '7d': require('../../assets/cards/classic/7d.png'),
  '8d': require('../../assets/cards/classic/8d.png'), '9d': require('../../assets/cards/classic/9d.png'),
  '10d': require('../../assets/cards/classic/10d.png'), jd: require('../../assets/cards/classic/jd.png'),
  qd: require('../../assets/cards/classic/qd.png'), kd: require('../../assets/cards/classic/kd.png'),
  ac: require('../../assets/cards/classic/ac.png'), '2c': require('../../assets/cards/classic/2c.png'),
  '3c': require('../../assets/cards/classic/3c.png'), '4c': require('../../assets/cards/classic/4c.png'),
  '5c': require('../../assets/cards/classic/5c.png'), '6c': require('../../assets/cards/classic/6c.png'),
  '7c': require('../../assets/cards/classic/7c.png'), '8c': require('../../assets/cards/classic/8c.png'),
  '9c': require('../../assets/cards/classic/9c.png'), '10c': require('../../assets/cards/classic/10c.png'),
  jc: require('../../assets/cards/classic/jc.png'), qc: require('../../assets/cards/classic/qc.png'),
  kc: require('../../assets/cards/classic/kc.png'),
}

const CW = 44; const CH = 63; const OVERLAP = -30

const SERVER_URL = 'http://localhost:3001'
const ROOM_ID    = 'Beginner1'
const PLAYER_ID  = 'Human1'

const C = {
  bg: '#080f0a', surface: '#0e1a13', border: '#1e2e22',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.4)',
  green: '#1a5e20', felt: '#4a8f5f',
  text: '#e8dfc0', textSec: '#7a8a72', textDim: '#3a4a38',
  red: '#ff3333', blue: '#38bdf8', purple: '#a855f7',
  win: '#4ade80', lose: '#f87171',
}

interface CardData { id: string; key: string }

// ── Phase type
type Phase = 'connecting' | 'arrangement' | 'showdown_countdown' | 'pile_reveal' | 'round_result' | 'match_end'

// ── Card Face
const FaceCard: React.FC<{
  cardKey: string; size?: number; selected?: boolean; onPress?: () => void
}> = ({ cardKey: key, size = CW, selected, onPress }) => {
  const h = size * (CH / CW)
  const img = CARD_IMG[key]
  const content = (
    <View style={[s.card, { width: size, height: h }, selected && s.cardSel]}>
      {img
        ? <Image source={img} style={{ width: size, height: h }} resizeMode="cover" />
        : <Text style={{ fontSize: 7, color: '#333' }}>{key}</Text>}
    </View>
  )
  if (onPress) return <TouchableOpacity onPress={onPress} activeOpacity={0.85}>{content}</TouchableOpacity>
  return content
}

// ── Card Back
const CardBack: React.FC<{ size?: number }> = ({ size = CW }) => {
  const h = size * (CH / CW)
  return (
    <View style={[s.card, { width: size, height: h }]}>
      <Image source={cardBackImg} style={{ width: size, height: h }} resizeMode="cover" />
    </View>
  )
}

// =================================================================
// MAIN
// =================================================================
const GameTableLive: React.FC = () => {
  const socketRef = useRef<Socket | null>(null)
  const [phase, setPhase]             = useState<Phase>('connecting')
  const [roundNumber, setRoundNumber] = useState(1)
  const [countdown, setCountdown]     = useState(0)
  const [timer, setTimer]             = useState(45)
  const timerRef = useRef<any>(null)

  // ไพ่ผู้เล่น
  const [piles, setPiles]       = useState<[CardData[], CardData[], CardData[]]>([[], [], []])
  const [selected, setSelected] = useState<{ pi: number; ci: number } | null>(null)
  const [sortDone, setSortDone] = useState(false)
  const [isReady, setIsReady]   = useState(false)

  // Community + Blind
  const [community, setCommunity] = useState<{ pile1: string[]; pile2: string[]; pile3: string[] }>({ pile1: [], pile2: [], pile3: [] })
  const [blindCards, setBlindCards] = useState<string[]>([])

  // AI info
  const [aiNames, setAiNames] = useState<{ id: string; name: string; emoji: string }[]>([])

  // Showdown reveal
  const [revealedPiles, setRevealedPiles] = useState<Record<number, Record<string, string[]>>>({})
  const [pileWinners, setPileWinners]     = useState<Record<number, string>>({})
  const [currentReveal, setCurrentReveal] = useState(0)

  // Result
  const [tokenBalance, setTokenBalance] = useState<Record<string, number>>({})
  const [tokenDeltas, setTokenDeltas]   = useState<Record<string, number>>({})
  const [matchResult, setMatchResult]   = useState<any>(null)
  const [hasFoul, setHasFoul]           = useState<Record<string, boolean>>({})

  // Countdown animation
  const countAnim = useRef(new Animated.Value(1)).current

  // ── Connect
  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket'] })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('player_join_room', {
        roomId: ROOM_ID, playerId: PLAYER_ID,
        tokenBalance: 5000, isVip: false,
      })
      // เริ่ม match
      socket.emit('start_match', { roomId: ROOM_ID, playerId: PLAYER_ID, tier: 'beginner' })
    })

    socket.on('round_start', (data: any) => {
      setPhase('arrangement')
      setRoundNumber(data.roundNumber)
      setIsReady(false)
      setSortDone(false)
      setSelected(null)
      setRevealedPiles({})
      setPileWinners({})
      setCurrentReveal(0)
      setHasFoul({})
      setTokenDeltas({})
      setTokenBalance(data.tokenBalance ?? {})
      setAiNames(data.aiNames ?? [])

      // Community cards
      setCommunity({
        pile1: data.communityCards.pile1,
        pile2: data.communityCards.pile2,
        pile3: data.communityCards.pile3,
      })
      setBlindCards(data.blindAuction ?? [])

      // แจกไพ่ผู้เล่น 11 ใบ
      const myCards: string[] = data.cards[PLAYER_ID] ?? []
      const cardObjs: CardData[] = myCards.map((k: string, i: number) => ({ id: `c${i}`, key: k }))
      setPiles([cardObjs.slice(0, 3), cardObjs.slice(3, 6), cardObjs.slice(6, 11)])

      // เริ่ม timer
      setTimer(data.timer ?? 45)
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) { clearInterval(timerRef.current); return 0 }
          return prev - 1
        })
      }, 1000)
    })

    socket.on('showdown_countdown', (data: any) => {
      setPhase('showdown_countdown')
      setCountdown(data.seconds)
      if (timerRef.current) clearInterval(timerRef.current)

      // animate countdown
      let c = data.seconds
      const tick = () => {
        setCountdown(c)
        Animated.sequence([
          Animated.timing(countAnim, { toValue: 1.5, duration: 200, useNativeDriver: true }),
          Animated.timing(countAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]).start()
        if (c > 0) { c--; setTimeout(tick, 1000) }
      }
      tick()
    })

    socket.on('pile_reveal', (data: any) => {
      setPhase('pile_reveal')
      setCurrentReveal(data.pileNumber)
      setRevealedPiles(prev => ({ ...prev, [data.pileNumber]: data.arrangements }))
      setPileWinners(prev => ({ ...prev, [data.pileNumber]: data.winner }))
      setHasFoul(data.fouled ?? {})
    })

    socket.on('round_result', (data: any) => {
      setPhase('round_result')
      setTokenBalance(data.tokenBalance ?? {})
      setTokenDeltas(data.tokenDeltas ?? {})
    })

    socket.on('match_end', (data: any) => {
      setPhase('match_end')
      setMatchResult(data)
      setTokenBalance(data.tokenBalance ?? {})
    })

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      socket.disconnect()
    }
  }, [])

  // ── Card swap
  const handleCardPress = useCallback((pi: number, ci: number) => {
    if (isReady || phase !== 'arrangement') return
    if (!selected) { setSelected({ pi, ci }); return }
    if (selected.pi === pi && selected.ci === ci) { setSelected(null); return }
    const np = piles.map(p => [...p]) as [CardData[], CardData[], CardData[]]
    const tmp = np[selected.pi][selected.ci]
    np[selected.pi][selected.ci] = np[pi][ci]
    np[pi][ci] = tmp
    setPiles(np)
    setSelected(null)
    setSortDone(false)
  }, [isReady, phase, selected, piles])

  // ── Auto Sort
  const handleAutoSort = () => {
    const comm: CommunityCards = {
      pile1: [community.pile1[0], community.pile1[1]] as [string, string],
      pile2: [community.pile2[0], community.pile2[1]] as [string, string],
      pile3: [community.pile3[0], community.pile3[1]] as [string, string],
    }
    const all = [...piles[0], ...piles[1], ...piles[2]]
    const sorted = autoSort(all, comm)
    setPiles(sorted)
    setSelected(null)
    setSortDone(true)
  }

  // ── Ready
  const handleReady = () => {
    if (isReady) return
    setIsReady(true)
    if (timerRef.current) clearInterval(timerRef.current)

    // ส่ง arrangement ไป server
    const arrangement = {
      pile1: piles[0].map(c => c.key),
      pile2: piles[1].map(c => c.key),
      pile3: piles[2].map(c => c.key),
    }
    socketRef.current?.emit('player_ready', {
      roomId: ROOM_ID,
      playerId: PLAYER_ID,
      arrangement,
    })
  }

  // ── Rematch
  const handleRematch = () => {
    setMatchResult(null)
    setPhase('connecting')
    socketRef.current?.emit('start_match', { roomId: ROOM_ID, playerId: PLAYER_ID, tier: 'beginner' })
  }

  // ── Timer color
  const timerRatio = timer / 45
  const tbarColor  = timerRatio <= 0.1 ? C.red : timerRatio <= 0.3 ? C.gold : '#3daa4a'

  // ── Pile label + winner badge
  const PileLabel: React.FC<{ pileNum: number }> = ({ pileNum }) => {
    const w = pileWinners[pileNum]
    const isWin = w === PLAYER_ID
    const isLose = w && w !== PLAYER_ID
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
        <Text style={s.pileLabel}>Pile {pileNum}</Text>
        {w && (
          <View style={[s.winBadge, { backgroundColor: isWin ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)' }]}>
            <Text style={[s.winBadgeTxt, { color: isWin ? C.win : C.lose }]}>
              {isWin ? '🏆 YOU WIN' : `${aiNames.find(a => a.id === w)?.emoji ?? '🤖'} ${aiNames.find(a => a.id === w)?.name ?? w}`}
            </Text>
          </View>
        )}
      </View>
    )
  }

  // =================================================================
  // RENDER
  // =================================================================
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── TOP BAR ── */}
      <View style={s.topBar}>
        <Text style={s.roundTxt}>Round {roundNumber}/3</Text>
        <View style={s.tierBadge}><Text style={s.tierTxt}>BEGINNER</Text></View>
        <Text style={s.tokenTxt}>🪙 {tokenBalance[PLAYER_ID] ?? 5000}</Text>
        <Text style={[s.timerTxt, { color: tbarColor }]}>{timer}</Text>
      </View>

      {/* TIMER BAR */}
      <View style={s.tbarWrap}>
        <View style={s.tbarBg}>
          <View style={[s.tbarFill, { width: `${timerRatio * 100}%` as any, backgroundColor: tbarColor }]} />
        </View>
      </View>

      {/* ── COUNTDOWN OVERLAY ── */}
      {phase === 'showdown_countdown' && (
        <View style={s.countdownOverlay}>
          <Text style={s.countdownLabel}>SHOWDOWN</Text>
          <Animated.Text style={[s.countdownNum, { transform: [{ scale: countAnim }] }]}>
            {countdown > 0 ? countdown : '🃏'}
          </Animated.Text>
          <Text style={s.countdownSub}>All piles reveal!</Text>
        </View>
      )}

      {/* ── MATCH END OVERLAY ── */}
      {phase === 'match_end' && matchResult && (
        <View style={s.matchEndOverlay}>
          <Text style={s.matchEndTitle}>
            {matchResult.finalWinner === PLAYER_ID ? '🏆 YOU WIN!' : '💀 YOU LOSE'}
          </Text>
          <Text style={s.matchEndSub}>Final Token Balance</Text>
          {Object.entries(tokenBalance).map(([pid, bal]) => (
            <View key={pid} style={s.matchEndRow}>
              <Text style={[s.matchEndName, pid === PLAYER_ID && { color: C.gold }]}>
                {pid === PLAYER_ID ? '👤 You' : `${aiNames.find(a => a.id === pid)?.emoji} ${aiNames.find(a => a.id === pid)?.name ?? pid}`}
              </Text>
              <Text style={[s.matchEndBal, { color: (bal as number) >= 5000 ? C.win : C.lose }]}>
                🪙 {bal as number}
              </Text>
            </View>
          ))}
          <TouchableOpacity style={s.rematchBtn} onPress={handleRematch}>
            <Text style={s.rematchTxt}>🔄 PLAY AGAIN</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>

        {/* ── AI SECTION ── */}
        <View style={s.aiSection}>
          {aiNames.map(ai => (
            <View key={ai.id} style={s.aiCard}>
              <Text style={s.aiEmoji}>{ai.emoji}</Text>
              <Text style={s.aiName}>{ai.name}</Text>
              <Text style={[s.aiDelta, {
                color: (tokenDeltas[ai.id] ?? 0) >= 0 ? C.win : C.lose
              }]}>
                {(tokenDeltas[ai.id] ?? 0) >= 0 ? '+' : ''}{tokenDeltas[ai.id] ?? ''}
              </Text>
              {/* AI cards back */}
              <View style={{ flexDirection: 'row', marginTop: 4 }}>
                {Array.from({ length: 11 }).map((_, i) => (
                  <View key={i} style={{ marginLeft: i === 0 ? 0 : -28 }}>
                    <CardBack size={36} />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

        {/* ── COMMUNITY ZONE ── */}
        <View style={s.commZone}>
          <Text style={s.commTitle}>Community Cards</Text>

          {/* Blind Auction */}
          {blindCards.length > 0 && (
            <View style={s.blindRow}>
              <Text style={[s.pileLabel, { color: C.purple }]}>🔮 Auction</Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {blindCards.map((k, i) => (
                  <View key={i} style={s.auctionCard}>
                    <Image source={cardBackImg} style={{ width: 44, height: 63 }} resizeMode="cover" />
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Pile 1/2/3 */}
          {[1, 2, 3].map(pNum => (
            <View key={pNum} style={s.commRow}>
              <PileLabel pileNum={pNum} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {/* WIN slot */}
                <View style={s.winSlot}><Text style={s.winSlotTxt}>WIN</Text></View>
                {/* Community cards */}
                {(pNum === 1 ? community.pile1 : pNum === 2 ? community.pile2 : community.pile3).map((k, i) => (
                  <FaceCard key={i} cardKey={k} />
                ))}
                {/* Revealed AI cards */}
                {revealedPiles[pNum] && Object.entries(revealedPiles[pNum]).map(([pid, cards]) => {
                  if (pid === PLAYER_ID) return null
                  const ai = aiNames.find(a => a.id === pid)
                  const isWinner = pileWinners[pNum] === pid
                  return (
                    <View key={pid} style={[s.revealGroup, isWinner && s.revealGroupWin]}>
                      <Text style={s.revealName}>{ai?.emoji}{ai?.name?.split(' ')[1]}</Text>
                      <View style={{ flexDirection: 'row', gap: 2 }}>
                        {(cards as string[]).map((k, i) => <FaceCard key={i} cardKey={k} size={36} />)}
                      </View>
                    </View>
                  )
                })}
              </View>
            </View>
          ))}
        </View>

        {/* ── HUMAN CARDS ── */}
        <View style={s.humanZone}>
          <View style={s.humanHeader}>
            <Text style={s.humanTitle}>👤 Your Hand</Text>
            {Object.keys(tokenDeltas).length > 0 && (
              <Text style={[s.deltaText, { color: (tokenDeltas[PLAYER_ID] ?? 0) >= 0 ? C.win : C.lose }]}>
                {(tokenDeltas[PLAYER_ID] ?? 0) >= 0 ? '+' : ''}{tokenDeltas[PLAYER_ID] ?? 0} tokens
              </Text>
            )}
            {hasFoul[PLAYER_ID] && <Text style={s.foulBadge}>⚠️ FOUL</Text>}
          </View>

          {/* User piles labels */}
          <View style={s.pileLabelRow}>
            {['Pile 1', 'Pile 2', 'Pile 3'].map((l, i) => (
              <View key={i} style={{ flex: i === 2 ? 2 : 1 }}>
                <PileLabel pileNum={i + 1} />
              </View>
            ))}
          </View>

          {/* User piles + revealed */}
          <View style={s.pilesRow}>
            {piles.map((pile, pi) => (
              <React.Fragment key={pi}>
                {pi > 0 && <View style={{ width: 4 }} />}
                <View style={{ flexDirection: 'row' }}>
                  {pile.map((card, ci) => (
                    <View key={card.id} style={{ marginLeft: ci === 0 ? 0 : OVERLAP }}>
                      <FaceCard
                        cardKey={card.key}
                        selected={selected?.pi === pi && selected?.ci === ci}
                        onPress={() => handleCardPress(pi, ci)}
                      />
                    </View>
                  ))}
                </View>
              </React.Fragment>
            ))}
          </View>

          {/* Revealed user cards in showdown */}
          {currentReveal > 0 && revealedPiles[currentReveal]?.[PLAYER_ID] && (
            <View style={s.revealUserRow}>
              <Text style={[s.pileLabel, { color: C.gold }]}>Pile {currentReveal} — Revealed</Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {(revealedPiles[currentReveal][PLAYER_ID] as string[]).map((k, i) => (
                  <FaceCard key={i} cardKey={k} />
                ))}
              </View>
            </View>
          )}
        </View>

      </ScrollView>

      {/* ── ACTION BAR ── */}
      {phase === 'arrangement' && (
        <View style={s.actionBar}>
          <TouchableOpacity
            style={[s.btnSort, sortDone && s.btnSortDone]}
            disabled={sortDone}
            onPress={handleAutoSort}
          >
            <Text style={s.btnSortTxt}>{sortDone ? 'Sorted ✓' : 'Auto Sort'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btnReady, isReady && s.btnReadyDone]}
            onPress={handleReady}
            disabled={isReady}
          >
            <Text style={s.btnReadyTxt}>{isReady ? 'WAITING...' : 'READY ✓'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

// =================================================================
// STYLES
// =================================================================
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  topBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 48, paddingBottom: 8 },
  roundTxt:  { fontSize: 11, color: C.blue, fontWeight: '800', letterSpacing: 1 },
  tierBadge: { borderWidth: 1.5, borderColor: C.blue, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(56,189,248,0.1)' },
  tierTxt:   { fontSize: 8, color: C.blue, fontWeight: '800', letterSpacing: 2 },
  tokenTxt:  { fontSize: 12, color: C.gold, fontWeight: '800' },
  timerTxt:  { fontSize: 22, fontWeight: '800', color: '#fff', minWidth: 36, textAlign: 'right' },

  tbarWrap: { paddingHorizontal: 12, marginBottom: 4 },
  tbarBg:   { height: 3, backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 2, overflow: 'hidden' },
  tbarFill: { height: '100%' as any, borderRadius: 2 },

  // AI section
  aiSection: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, marginBottom: 8 },
  aiCard:    { flex: 1, backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 6, alignItems: 'center' },
  aiEmoji:   { fontSize: 18 },
  aiName:    { fontSize: 8, color: C.text, fontWeight: '700', marginTop: 2 },
  aiDelta:   { fontSize: 10, fontWeight: '800' },

  // Community
  commZone:  { marginHorizontal: 10, marginBottom: 8, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 10 },
  commTitle: { fontSize: 9, color: C.textSec, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, fontWeight: '700' },
  blindRow:  { marginBottom: 8 },
  commRow:   { marginBottom: 8 },

  // Pile labels
  pileLabel:  { fontSize: 7, color: C.goldDim, letterSpacing: 0.5, textTransform: 'uppercase' },
  pileLabelRow: { flexDirection: 'row', marginBottom: 4 },
  winBadge:   { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  winBadgeTxt:{ fontSize: 7, fontWeight: '800' },
  winSlot:    { width: 44, height: 63, borderRadius: 4, borderWidth: 1.5, borderColor: C.blue, backgroundColor: 'rgba(56,189,248,0.06)', alignItems: 'center', justifyContent: 'center' },
  winSlotTxt: { fontSize: 5, color: C.blue, fontWeight: '700' },

  // Auction
  auctionCard: { width: 44, height: 63, borderRadius: 4, borderWidth: 2, borderColor: C.purple, overflow: 'hidden', shadowColor: C.purple, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6, elevation: 6 },

  // Reveal
  revealGroup:    { marginLeft: 6, padding: 4, borderRadius: 6, borderWidth: 1, borderColor: C.border, backgroundColor: 'rgba(0,0,0,0.3)' },
  revealGroupWin: { borderColor: C.win, backgroundColor: 'rgba(74,222,128,0.1)' },
  revealName:     { fontSize: 7, color: C.textSec, marginBottom: 2 },
  revealUserRow:  { marginTop: 8, padding: 8, backgroundColor: 'rgba(201,168,76,0.05)', borderRadius: 8, borderWidth: 1, borderColor: C.goldDim },

  // Human
  humanZone:    { marginHorizontal: 10, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.goldDim, padding: 10 },
  humanHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  humanTitle:   { fontSize: 10, color: C.gold, fontWeight: '800', letterSpacing: 1 },
  deltaText:    { fontSize: 12, fontWeight: '800' },
  foulBadge:    { backgroundColor: 'rgba(248,113,113,0.2)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  pilesRow:     { flexDirection: 'row', alignItems: 'flex-end' },

  // Cards
  card:    { borderRadius: 4, backgroundColor: '#fdfaf3', borderWidth: 1, borderColor: 'rgba(201,168,76,0.5)', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  cardSel: { borderColor: '#6ec87a', borderWidth: 2, transform: [{ translateY: -12 }] },

  // Countdown overlay
  countdownOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  countdownLabel:   { fontSize: 14, color: C.gold, letterSpacing: 4, fontWeight: '800', marginBottom: 12 },
  countdownNum:     { fontSize: 96, color: '#fff', fontWeight: '900' },
  countdownSub:     { fontSize: 12, color: C.textSec, letterSpacing: 2, marginTop: 12 },

  // Match end overlay
  matchEndOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 },
  matchEndTitle:   { fontSize: 32, fontWeight: '900', color: C.gold, marginBottom: 16 },
  matchEndSub:     { fontSize: 11, color: C.textSec, letterSpacing: 2, marginBottom: 12 },
  matchEndRow:     { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  matchEndName:    { fontSize: 13, color: C.text, fontWeight: '600' },
  matchEndBal:     { fontSize: 13, fontWeight: '800' },
  rematchBtn:      { marginTop: 24, backgroundColor: C.green, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 },
  rematchTxt:      { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 2 },

  // Action bar
  actionBar:    { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border },
  btnSort:      { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#e07020', alignItems: 'center' },
  btnSortDone:  { backgroundColor: '#6b4010' },
  btnSortTxt:   { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  btnReady:     { flex: 2, paddingVertical: 10, borderRadius: 8, backgroundColor: C.green, alignItems: 'center' },
  btnReadyDone: { backgroundColor: '#14481a' },
  btnReadyTxt:  { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 1.5 },
})

export default GameTableLive
