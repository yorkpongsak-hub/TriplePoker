// live-tier-s-plus.tsx
// Tier S+ frontend scaffold adapted from live.tsx event-driven structure
// Focus: correct phase machine + socket contract for Tier S+

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { io, Socket } from 'socket.io-client'

const cardBackImg = require('../../../assets/images/card_back_default.png')
const tableImg = require('../../../assets/images/table_default.png')
const studioLogo = require('../../../assets/images/sage_unicorn_logo_transparent.png')

const SERVER_URL = 'http://localhost:3001'
const ROOM_ID = 'TierSPlusRoom1'
const PLAYER_ID = 'Human1'

const CW = 62
const CH = 90
const OVERLAP = -38

type TierSPlusPhase =
  | 'idle'
  | 'boss_intro'
  | 'dealing'
  | 'auction1'
  | 'arrangement_pile1'
  | 'pile1_result'
  | 'auction2_card1'
  | 'auction2_card2'
  | 'reveal_pile3_hidden'
  | 'final_arrangement'
  | 'pile2_betting'
  | 'pile2_result'
  | 'pile3_betting'
  | 'pile3_result'
  | 'proof_reveal'
  | 'round_result'
  | 'match_end'

interface CardData {
  id: string
  key: string
}

interface AIInfo {
  id: string
  name: string
  emoji?: string
}

interface BidResult {
  winnerId?: string
  bid?: number
  cardIndex?: 0 | 1
}

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
  }, [valRef])

  const ratio = val / (max || 1)
  const color = ratio <= 0.1 ? '#cc2222' : ratio <= 0.3 ? '#c9a84c' : '#3daa4a'

  return (
    <>
      <Text style={[styles.timerText, { color }]}>{val}</Text>
      <View style={styles.tbarWrap}>
        <View style={styles.tbarBg}>
          <View style={[styles.tbarFill, { width: `${ratio * 100}%` as any, backgroundColor: color }]} />
        </View>
      </View>
    </>
  )
}

const CardView: React.FC<{ label?: string; facedown?: boolean; small?: boolean }> = ({
  label,
  facedown,
  small,
}) => {
  const w = small ? 42 : CW
  const h = small ? 60 : CH
  return (
    <View style={[styles.card, { width: w, height: h }]}> 
      {facedown ? (
        <Image source={cardBackImg} style={{ width: '100%', height: '100%', borderRadius: 8 }} />
      ) : (
        <Text style={styles.cardText}>{label || '?'}</Text>
      )}
    </View>
  )
}

const TierSPlusLive: React.FC = () => {
  const insets = useSafeAreaInsets()
  const socketRef = useRef<Socket | null>(null)
  const timerRef = useRef<any>(null)
  const timerValRef = useRef({ val: 0, max: 0 })

  const [phase, setPhase] = useState<TierSPlusPhase>('idle')
  const [roundNumber, setRoundNumber] = useState(1)
  const [aiList, setAiList] = useState<AIInfo[]>([])
  const [tokenBalance, setTokenBalance] = useState<Record<string, number>>({})

  const [myHand, setMyHand] = useState<CardData[]>([])
  const [pile1Cards, setPile1Cards] = useState<CardData[]>([])
  const [reserveCards, setReserveCards] = useState<CardData[]>([])
  const [pile2Cards, setPile2Cards] = useState<CardData[]>([])
  const [pile3Cards, setPile3Cards] = useState<CardData[]>([])

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [community, setCommunity] = useState({
    pile1: ['', ''],
    pile2: ['', ''],
    pile3Open: '',
    pile3HiddenRevealed: '',
  })

  const [auction1Card, setAuction1Card] = useState('')
  const [auction1BidLevels, setAuction1BidLevels] = useState<number[]>([])
  const [auction2BidLevels, setAuction2BidLevels] = useState<number[]>([])
  const [auction2CardIndex, setAuction2CardIndex] = useState<0 | 1>(0)
  const [auctionLocked, setAuctionLocked] = useState(false)
  const [auctionResults, setAuctionResults] = useState<BidResult[]>([])

  const [pile1Result, setPile1Result] = useState<any>(null)
  const [pile2State, setPile2State] = useState<any>(null)
  const [pile3State, setPile3State] = useState<any>(null)
  const [proofState, setProofState] = useState<any>(null)
  const [matchResult, setMatchResult] = useState<any>(null)

  const canSubmitPile1 = selectedIds.length === 3
  const canSubmitFinal = pile2Cards.length > 0 && pile3Cards.length > 0 && pile2Cards.length + pile3Cards.length === reserveCards.length

  const reserveSelected = useMemo(
    () => reserveCards.filter(c => selectedIds.includes(c.id)),
    [reserveCards, selectedIds]
  )

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket'], reconnection: false })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('player_join_room', {
        roomId: ROOM_ID,
        playerId: PLAYER_ID,
        tokenBalance: 5000,
        isVip: true,
      })
      socket.emit('start_match', {
        roomId: ROOM_ID,
        playerId: PLAYER_ID,
        tier: 'tierSPlus',
      })
    })

    socket.on('tier_s_plus_round_start', (data: any) => {
      setPhase('dealing')
      setRoundNumber(data.roundNumber ?? 1)
      setAiList(data.aiNames ?? [])
      setTokenBalance(data.tokenBalance ?? {})
      setCommunity({
        pile1: data.community?.pile1 ?? ['', ''],
        pile2: data.community?.pile2 ?? ['', ''],
        pile3Open: data.community?.pile3Open ?? '',
        pile3HiddenRevealed: '',
      })
      setAuction1Card(data.auction1Card ?? '')
      setAuction1BidLevels(data.auction1BidLevels ?? [1, 2, 3, 5])
      setAuction2BidLevels(data.auction2BidLevels ?? [2, 3, 4, 5])
      const hand = (data.cards ?? []).map((k: string, i: number) => ({ id: `h_${i}`, key: k }))
      setMyHand(hand)
      setPile1Cards([])
      setReserveCards(hand)
      setPile2Cards([])
      setPile3Cards([])
      setSelectedIds([])
      setAuctionLocked(false)
      setAuctionResults([])
      setPile1Result(null)
      setPile2State(null)
      setPile3State(null)
      setProofState(null)
      const sec = data.timerSec ?? 15
      timerValRef.current = { val: sec, max: sec }
    })

    socket.on('auction1_start', (data: any) => {
      setPhase('auction1')
      setAuction1Card(data.card ?? auction1Card)
      setAuction1BidLevels(data.bidLevels ?? [1, 2, 3, 5])
      setAuctionLocked(false)
      startTimer(data.decisionTimeSec ?? 5)
    })

    socket.on('auction1_result', (data: any) => {
      setAuctionResults(prev => [...prev, data])
      setTokenBalance(data.tokenBalance ?? {})
      if (Array.isArray(data.myUpdatedHand)) {
        const hand = data.myUpdatedHand.map((k: string, i: number) => ({ id: `a1_${i}`, key: k }))
        setMyHand(hand)
        setReserveCards(hand)
      }
      setPhase('arrangement_pile1')
      startTimer(data.arrangementTimeSec ?? 15)
    })

    socket.on('pile1_arrangement_start', (data: any) => {
      setPhase('arrangement_pile1')
      if (Array.isArray(data.cards)) {
        const hand = data.cards.map((k: string, i: number) => ({ id: `p1_${i}`, key: k }))
        setMyHand(hand)
        setReserveCards(hand)
      }
      setSelectedIds([])
      startTimer(data.decisionTimeSec ?? 15)
    })

    socket.on('pile1_result', (data: any) => {
      setPile1Result(data)
      setTokenBalance(data.tokenBalance ?? {})
      setPhase('pile1_result')
    })

    socket.on('auction2_start', (data: any) => {
      setAuction2CardIndex(data.cardIndex ?? 0)
      setAuction2BidLevels(data.bidLevels ?? [2, 3, 4, 5])
      setAuctionLocked(false)
      setPhase(data.cardIndex === 0 ? 'auction2_card1' : 'auction2_card2')
      startTimer(data.decisionTimeSec ?? 5)
    })

    socket.on('auction2_result', (data: any) => {
      setAuctionResults(prev => [...prev, data])
      setTokenBalance(data.tokenBalance ?? {})
      if (Array.isArray(data.myUpdatedHand)) {
        const reserve = data.myUpdatedHand.map((k: string, i: number) => ({ id: `a2_${i}`, key: k }))
        setReserveCards(reserve)
      }
    })

    socket.on('pile3_hidden_revealed', (data: any) => {
      setCommunity(prev => ({ ...prev, pile3HiddenRevealed: data.card ?? '' }))
      setPhase('reveal_pile3_hidden')
    })

    socket.on('final_arrangement_start', (data: any) => {
      setPhase('final_arrangement')
      const reserve = (data.cards ?? []).map((k: string, i: number) => ({ id: `f_${i}`, key: k }))
      setReserveCards(reserve)
      setPile2Cards([])
      setPile3Cards([])
      startTimer(data.decisionTimeSec ?? 20)
    })

    socket.on('pile2_betting_start', (data: any) => {
      setPhase('pile2_betting')
      setPile2State(data)
    })

    socket.on('pile2_turn', (data: any) => {
      setPhase('pile2_betting')
      setPile2State((prev: any) => ({ ...(prev || {}), ...data }))
      startTimer(data.timeLimitSec ?? 10)
    })

    socket.on('pile2_action_result', (data: any) => {
      setPile2State((prev: any) => ({ ...(prev || {}), ...data }))
      setTokenBalance(data.tokenBalance ?? {})
    })

    socket.on('pile2_result', (data: any) => {
      setPile2State(data)
      setTokenBalance(data.tokenBalance ?? {})
      setPhase('pile2_result')
    })

    socket.on('pile3_betting_start', (data: any) => {
      setPhase('pile3_betting')
      setPile3State(data)
    })

    socket.on('pile3_turn', (data: any) => {
      setPhase('pile3_betting')
      setPile3State((prev: any) => ({ ...(prev || {}), ...data }))
      startTimer(data.timeLimitSec ?? 10)
    })

    socket.on('pile3_action_result', (data: any) => {
      setPile3State((prev: any) => ({ ...(prev || {}), ...data }))
      setTokenBalance(data.tokenBalance ?? {})
    })

    socket.on('pile3_result', (data: any) => {
      setPile3State(data)
      setTokenBalance(data.tokenBalance ?? {})
      setPhase('pile3_result')
    })

    socket.on('proof_card_reveal', (data: any) => {
      setProofState(data)
      setPhase('proof_reveal')
    })

    socket.on('round_result', (data: any) => {
      setTokenBalance(data.tokenBalance ?? {})
      setPhase('round_result')
    })

    socket.on('match_end', (data: any) => {
      setMatchResult(data)
      setTokenBalance(data.tokenBalance ?? {})
      setPhase('match_end')
    })

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      socket.disconnect()
    }
  }, [])

  const startTimer = (sec: number) => {
    timerValRef.current = { val: sec, max: sec }
    if (timerRef.current) clearInterval(timerRef.current)
    let left = sec
    timerRef.current = setInterval(() => {
      left -= 1
      timerValRef.current = { val: Math.max(0, left), max: sec }
      if (left <= 0) clearInterval(timerRef.current)
    }, 1000)
  }

  const submitAuction1Bid = (level: number) => {
    if (auctionLocked) return
    setAuctionLocked(true)
    socketRef.current?.emit('auction1_bid', { roomId: ROOM_ID, playerId: PLAYER_ID, level })
  }

  const submitAuction2Bid = (level: number) => {
    if (auctionLocked) return
    setAuctionLocked(true)
    socketRef.current?.emit('auction2_bid', {
      roomId: ROOM_ID,
      playerId: PLAYER_ID,
      cardIndex: auction2CardIndex,
      level,
    })
  }

  const togglePile1Select = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 3) return prev
      return [...prev, id]
    })
  }

  const submitPile1Arrangement = () => {
    const chosen = reserveCards.filter(c => selectedIds.includes(c.id))
    const remain = reserveCards.filter(c => !selectedIds.includes(c.id))
    setPile1Cards(chosen)
    setReserveCards(remain)
    socketRef.current?.emit('submit_pile1_arrangement', {
      roomId: ROOM_ID,
      playerId: PLAYER_ID,
      pile1: chosen.map(c => c.key),
    })
  }

  const moveReserveToPile = (card: CardData, pile: 2 | 3) => {
    setReserveCards(prev => prev.filter(c => c.id !== card.id))
    if (pile === 2) setPile2Cards(prev => [...prev, card])
    else setPile3Cards(prev => [...prev, card])
  }

  const movePileBack = (card: CardData, pile: 2 | 3) => {
    if (pile === 2) setPile2Cards(prev => prev.filter(c => c.id !== card.id))
    else setPile3Cards(prev => prev.filter(c => c.id !== card.id))
    setReserveCards(prev => [...prev, card])
  }

  const submitFinalArrangement = () => {
    socketRef.current?.emit('submit_final_arrangement', {
      roomId: ROOM_ID,
      playerId: PLAYER_ID,
      pile2: pile2Cards.map(c => c.key),
      pile3: pile3Cards.map(c => c.key),
    })
  }

  const sendPile2Action = (action: 'call' | 'fold') => {
    socketRef.current?.emit('pile2_action', { roomId: ROOM_ID, playerId: PLAYER_ID, action })
  }

  const sendPile3Action = (action: 'call' | 'fold' | 'raise') => {
    socketRef.current?.emit('pile3_action', { roomId: ROOM_ID, playerId: PLAYER_ID, action })
  }

  const continueFlow = () => {
    socketRef.current?.emit('player_continue', { roomId: ROOM_ID, playerId: PLAYER_ID })
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}> 
      <Image source={tableImg} style={StyleSheet.absoluteFillObject} resizeMode="cover" />

      <View style={styles.header}>
        <Image source={studioLogo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Tier S+ : The Last Boss</Text>
        <Text style={styles.phase}>{phase}</Text>
      </View>

      <View style={styles.timerBox}>
        <TimerDisplay valRef={timerValRef} />
      </View>

      <View style={styles.communityBoard}>
        <Text style={styles.sectionTitle}>Community</Text>
        <View style={styles.row}>
          <View style={styles.group}>
            <Text style={styles.label}>Pile 1</Text>
            <CardView label={community.pile1[0]} />
            <CardView label={community.pile1[1]} />
          </View>
          <View style={styles.group}>
            <Text style={styles.label}>Pile 2</Text>
            <CardView label={community.pile2[0]} />
            <CardView label={community.pile2[1]} />
          </View>
          <View style={styles.group}>
            <Text style={styles.label}>Pile 3</Text>
            <CardView label={community.pile3Open} />
            <CardView label={community.pile3HiddenRevealed} facedown={!community.pile3HiddenRevealed} />
          </View>
        </View>
      </View>

      <View style={styles.statusBox}>
        <Text style={styles.label}>Boss + opponents</Text>
        <Text style={styles.smallText}>{aiList.map(a => a.name).join(' | ') || '-'}</Text>
        <Text style={styles.smallText}>Round {roundNumber}</Text>
        <Text style={styles.smallText}>Your tokens: {tokenBalance[PLAYER_ID] ?? '-'}</Text>
      </View>

      {phase === 'auction1' && (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Auction Round 1</Text>
          <Text style={styles.smallText}>Open card</Text>
          <CardView label={auction1Card} />
          <View style={styles.actionRow}>
            {auction1BidLevels.map(level => (
              <TouchableOpacity key={level} style={styles.button} onPress={() => submitAuction1Bid(level)}>
                <Text style={styles.buttonText}>Bid {level}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {phase === 'arrangement_pile1' && (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Arrange for Pile 1</Text>
          <Text style={styles.smallText}>Select exactly 3 cards to fight Pile 1.</Text>
          <View style={styles.handRow}>
            {reserveCards.map(card => {
              const active = selectedIds.includes(card.id)
              return (
                <TouchableOpacity key={card.id} onPress={() => togglePile1Select(card.id)}>
                  <View style={[styles.cardWrap, active && styles.selectedCard]}>
                    <CardView label={card.key} />
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
          <Text style={styles.smallText}>Selected: {reserveSelected.map(c => c.key).join(', ') || '-'}</Text>
          <TouchableOpacity
            style={[styles.button, !canSubmitPile1 && styles.buttonDisabled]}
            disabled={!canSubmitPile1}
            onPress={submitPile1Arrangement}
          >
            <Text style={styles.buttonText}>Submit Pile 1</Text>
          </TouchableOpacity>
        </View>
      )}

      {(phase === 'auction2_card1' || phase === 'auction2_card2') && (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Auction Round 2</Text>
          <Text style={styles.smallText}>Hidden card #{auction2CardIndex + 1}</Text>
          <CardView facedown />
          <View style={styles.actionRow}>
            {auction2BidLevels.map(level => (
              <TouchableOpacity key={level} style={styles.button} onPress={() => submitAuction2Bid(level)}>
                <Text style={styles.buttonText}>Bid {level}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {phase === 'final_arrangement' && (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Final Arrangement</Text>
          <Text style={styles.smallText}>Distribute remaining cards into Pile 2 and Pile 3 freely.</Text>

          <Text style={styles.label}>Reserve</Text>
          <View style={styles.handRow}>
            {reserveCards.map(card => (
              <View key={card.id} style={styles.cardActionCol}>
                <CardView label={card.key} />
                <View style={styles.row}>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => moveReserveToPile(card, 2)}>
                    <Text style={styles.smallBtnText}>P2</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => moveReserveToPile(card, 3)}>
                    <Text style={styles.smallBtnText}>P3</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          <Text style={styles.label}>Pile 2</Text>
          <View style={styles.handRow}>
            {pile2Cards.map(card => (
              <TouchableOpacity key={card.id} onPress={() => movePileBack(card, 2)}>
                <CardView label={card.key} />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Pile 3</Text>
          <View style={styles.handRow}>
            {pile3Cards.map(card => (
              <TouchableOpacity key={card.id} onPress={() => movePileBack(card, 3)}>
                <CardView label={card.key} />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.button, !canSubmitFinal && styles.buttonDisabled]}
            disabled={!canSubmitFinal}
            onPress={submitFinalArrangement}
          >
            <Text style={styles.buttonText}>Submit Final Arrangement</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'pile2_betting' && (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Pile 2 Battle</Text>
          <Text style={styles.smallText}>Ante 2 | Call 1</Text>
          <Text style={styles.smallText}>Turn: {pile2State?.playerId ?? '-'}</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.button} onPress={() => sendPile2Action('call')}>
              <Text style={styles.buttonText}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={() => sendPile2Action('fold')}>
              <Text style={styles.buttonText}>Fold</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {phase === 'pile3_betting' && (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Pile 3 Battle</Text>
          <Text style={styles.smallText}>Ante 4 | Call 1 | Raise +1</Text>
          <Text style={styles.smallText}>Turn: {pile3State?.playerId ?? '-'}</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.button} onPress={() => sendPile3Action('call')}>
              <Text style={styles.buttonText}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={() => sendPile3Action('raise')}>
              <Text style={styles.buttonText}>Raise</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={() => sendPile3Action('fold')}>
              <Text style={styles.buttonText}>Fold</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {(phase === 'pile1_result' || phase === 'pile2_result' || phase === 'pile3_result' || phase === 'proof_reveal' || phase === 'round_result') && (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Resolution</Text>
          <Text style={styles.smallText}>{JSON.stringify(pile1Result || pile2State || pile3State || proofState || {}, null, 2)}</Text>
          <TouchableOpacity style={styles.button} onPress={continueFlow}>
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'match_end' && (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Match End</Text>
          <Text style={styles.smallText}>{JSON.stringify(matchResult || {}, null, 2)}</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1020' },
  header: { alignItems: 'center', paddingTop: 8 },
  logo: { width: 80, height: 48, opacity: 0.9 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  phase: { color: '#d7c17d', marginTop: 4 },
  timerBox: { alignItems: 'center', marginVertical: 12 },
  timerText: { fontSize: 28, fontWeight: '800' },
  tbarWrap: { width: 220, marginTop: 4 },
  tbarBg: { height: 10, backgroundColor: '#222', borderRadius: 10, overflow: 'hidden' },
  tbarFill: { height: 10, borderRadius: 10 },
  communityBoard: {
    marginHorizontal: 16,
    backgroundColor: 'rgba(10,10,10,0.45)',
    borderRadius: 14,
    padding: 12,
  },
  statusBox: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: 'rgba(10,10,10,0.45)',
    borderRadius: 14,
    padding: 12,
  },
  panel: {
    margin: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(12,12,18,0.84)',
  },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  label: { color: '#d9d9d9', fontWeight: '700', marginBottom: 6 },
  smallText: { color: '#cfd3dc', fontSize: 12, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  group: { marginRight: 14, alignItems: 'center' },
  handRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: {
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: OVERLAP + 46,
    overflow: 'hidden',
  },
  cardText: { color: '#111', fontWeight: '800', fontSize: 14 },
  cardWrap: { borderRadius: 10, padding: 2 },
  selectedCard: { backgroundColor: '#d7c17d' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  button: {
    backgroundColor: '#6d4aff',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontWeight: '800' },
  cardActionCol: { alignItems: 'center', marginRight: 8 },
  smallBtn: {
    backgroundColor: '#24304b',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
    marginRight: 4,
  },
  smallBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
})

export default TierSPlusLive
