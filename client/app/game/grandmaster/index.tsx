import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams, useRouter } from 'expo-router'
import GrandmasterTableView from './GrandmasterTableView'
import ArenaWelcomeGuide from './ArenaWelcomeGuide'
import { ArenaClientIntent, ArenaClientPhase, ArenaClientSnapshot } from '../../../src/game/grandmaster/arenaClientTypes'
import { useArenaTableStore } from '../../../src/game/grandmaster/useArenaTableStore'
import { useArenaTransport } from '../../../src/game/grandmaster/useArenaTransport'
import { useAuthStore } from '../../../src/store/authStore'

const ARENA_GUIDE_VERSION = 'v1'

const cards = ['as', 'kh', 'qd', 'jc', '10s', '9h', '8d', '7c', '6s', '5h', 'JOKER']

function previewSnapshot(mode?: string): ArenaClientSnapshot {
  let phase: ArenaClientPhase = 'ARRANGE_1'
  if (mode === 'auction') phase = 'AUCTION_BLIND'
  if (mode === 'joker') phase = 'JOKER_DECLARE'
  if (mode === 'gf') phase = 'GF_PILE_3_ROUND_1'
  if (mode === 'result') phase = 'MATCH_RESULT'
  if (mode === 'reveal') phase = 'REVEAL_PILE_2'
  return {
    matchId: 'grandmaster-preview', version: 1, phase, gameNumber: 1,
    phaseEndsAt: Date.now() + 30_000,
    seats: [
      { seat: 1, playerId: 'local', displayName: 'Grandmaster', avatar: 'wolf', isVip: false, controller: 'HUMAN', isLocal: true, isBoss: false, isCurrentTurn: phase.includes('GF'), connection: mode === 'reconnect' ? 'RECONNECTING' : 'CONNECTED', cards, cardCount: 11, crownCrest: 246 },
      { seat: 2, playerId: 'p2', displayName: 'Cipher Veil', avatar: 'fox', isVip: false, controller: 'HUMAN', isLocal: false, isBoss: false, isCurrentTurn: false, connection: 'CONNECTED', cards: [], cardCount: 11, crownCrest: 210 },
      { seat: 3, playerId: 'boss', displayName: 'Monarch', avatar: '♛', isVip: false, controller: 'AI', isLocal: false, isBoss: true, isCurrentTurn: false, connection: 'CONNECTED', cards: [], cardCount: 11, crownCrest: 300 },
      { seat: 4, playerId: 'p4', displayName: 'Sovereign Fox', avatar: 'owl', isVip: false, controller: 'HUMAN', isLocal: false, isBoss: false, isCurrentTurn: false, connection: 'CONNECTED', cards: [], cardCount: 11, crownCrest: 198 },
    ],
    cardZones: {
      stockCount: phase === 'ARRANGE_1' ? 3 : 0,
      discardCount: 0,
      auction: { faceUpCard: null, blindCount: phase === 'AUCTION_BLIND' ? 2 : 0 },
      resolvedPileCounts: { pile1: 0, pile2: phase === 'REVEAL_PILE_2' || phase === 'MATCH_RESULT' ? 12 : 0, pile3: phase === 'MATCH_RESULT' ? 20 : 0 },
      totalCards: 53,
    },
    crown: { pile1PotCrest: 12, pile2PotCrest: 15, pile3PotCrest: 24, battleRewardsCrest: 18, tableTotalCrest: 954, localBalanceCrest: 246 },
    communityCards: { pile1: ['ah', '10h'], pile2: ['ks', 'kd'], pile3: ['qc', 'JOKER'] },
    auction: phase === 'AUCTION_BLIND' ? { round: 'BLIND', bidOptionsCrest: [0, 3, 6, 9, 12], locked: false } : null,
    auctionDisplay: phase === 'AUCTION_BLIND' ? { faceUpCard: 'ah' } : null,
    auctionResult: phase === 'AUCTION_BLIND' ? { round: 'FACE_UP', card: 'ah', winnerSeat: 2, winnerDisplayName: 'Cipher Veil' } : null,
    blindAuctionResults: [],
    pilesResolved: {
      pile1: phase !== 'ARRANGE_1' && phase !== 'AUCTION_BLIND',
      pile2: phase === 'REVEAL_PILE_2' || phase === 'MATCH_RESULT',
      pile3: phase === 'MATCH_RESULT',
    },
    joker: phase === 'JOKER_DECLARE' ? { canChoose: true, anteX2Enabled: true } : null,
    gf: phase === 'GF_PILE_3_ROUND_1' ? { pile: 3, round: 1, localTurn: true, callCostCrest: 3 } : null,
    bossPresentation: mode === 'boss' ? {
      bossId: 'MONARCH',
      title: 'MONARCH',
      subtitle: 'THE WATCHER',
      atmosphere: 'A shadow falls over the table...',
      quote: 'Power is easy to claim. Restraint is harder to prove.',
    } : mode === 'soren' ? {
      bossId: 'SOREN',
      title: 'SOREN VEYL',
      subtitle: 'THE FIRST EXILE',
      atmosphere: 'A stranger slides into the empty seat...',
      quote: 'Titles are just stories people agree not to question.',
    } : null,
    dualBossLore: null,
    result: phase === 'MATCH_RESULT' ? {
      title: 'MATCH COMPLETE',
      lines: [
        { label: 'Ante', crest: -36 }, { label: 'Joker Extra Ante', crest: -6 },
        { label: 'Auction', crest: -12 }, { label: 'Call', crest: -9 },
        { label: 'Sweep Jackpot', crest: 42 },
        { label: 'Win / Loss', crest: 66 },
      ],
      playNetCrest: 33,
      entryFeeCrest: 12,
      netCrest: 21,
      psGained: 4,
    } : null,
    reveal: phase === 'REVEAL_PILE_2' ? {
      pile: 2, winnerSeat: 2, winnerDisplayName: 'Cipher Veil', handName: 'full_house',
      cards: ['ks', 'kd', 'kc', '9h', '9s'], highlightedCards: ['ks', 'kd', 'kc', '9h', '9s'],
      payoutCrest: 30,
    } : null,
  }
}

export default function GrandmasterScreen() {
  const params = useLocalSearchParams<{ preview?: string; guide?: string }>()
  const router = useRouter()
  const userId = useAuthStore(state => state.user?.id ?? 'preview')
  const [guideSeen, setGuideSeen] = useState<boolean | null>(null)
  const snapshot = useArenaTableStore(state => state.snapshot)
  const applyServerSnapshot = useArenaTableStore(state => state.applyServerSnapshot)
  const live = typeof params.preview !== 'string'
  const guideKey = `arena_first_visit_${ARENA_GUIDE_VERSION}_${userId}`
  const forceGuide = params.guide === '1'
  // Development table previews stay one-tap; append ?guide=1 when QA needs this onboarding.
  const tableReady = !forceGuide && (guideSeen === true || !live)
  const transport = useArenaTransport(live && tableReady)

  useEffect(() => {
    let active = true
    AsyncStorage.getItem(guideKey)
      .then(value => { if (active) setGuideSeen(value === '1') })
      .catch(() => { if (active) setGuideSeen(false) })
    return () => { active = false }
  }, [guideKey])
  const initial = useMemo(() => {
    const value = previewSnapshot(params.preview)
    if (!live) return value
    const rosterBySeat = new Map(transport.queueRoster.map(entry => [entry.seat, entry]))
    return {
      ...value, version: 0, phase: 'WAITING_FOR_PLAYERS' as const, gameNumber: 0 as const, phaseEndsAt: null,
      seats: value.seats.map(seat => {
        const entry = rosterBySeat.get(seat.seat as 1 | 2 | 4)
        if (entry) return {
          ...seat, playerId: entry.playerId, displayName: entry.displayName, avatar: entry.avatar,
          controller: 'HUMAN' as const, isBoss: false, isLocal: entry.playerId === transport.playerId,
          isCurrentTurn: false, cards: [], cardCount: 0, crownCrest: 0, isWaiting: false,
        }
        // Before the first roster packet, keep the local player visible in
        // seat 1. Every genuinely unassigned seat, including the future Boss
        // seat, uses the same animated Waiting state as VIP Plus.
        if (!transport.queueRoster.length && seat.seat === 1) return { ...seat, displayName: 'You', cards: [], cardCount: 0, isWaiting: false }
        return { ...seat, playerId: `waiting-seat-${seat.seat}`, displayName: 'Waiting', avatar: '', controller: 'HUMAN' as const, isBoss: false, isLocal: false, isCurrentTurn: false, cards: [], cardCount: 0, crownCrest: 0, isWaiting: true }
      }),
      cardZones: { stockCount: 53, discardCount: 0, auction: { faceUpCard: null, blindCount: 0 }, resolvedPileCounts: { pile1: 0, pile2: 0, pile3: 0 }, totalCards: 53 as const },
      communityCards: { pile1: [], pile2: [], pile3: [] },
      crown: { pile1PotCrest: 0, pile2PotCrest: 0, pile3PotCrest: 0, battleRewardsCrest: 0, tableTotalCrest: 0, localBalanceCrest: 0 },
    }
  }, [params.preview, live, transport.playerId, transport.queueRoster])

  useEffect(() => { applyServerSnapshot(initial) }, [initial, applyServerSnapshot])

  const handleIntent = (intent: ArenaClientIntent) => {
    if (live) transport.sendIntent(intent)
    else console.log('[ARENA-PREVIEW-INTENT]', intent)
  }

  const completeGuide = async () => {
    await AsyncStorage.setItem(guideKey, '1').catch(() => {})
    setGuideSeen(true)
    if (forceGuide) router.replace('/game/grandmaster')
  }

  if (guideSeen === null) return <View style={styles.guideLoading}><ActivityIndicator color="#FFD76A" /></View>
  if (!tableReady) return <ArenaWelcomeGuide onComplete={completeGuide} onExit={() => router.replace('/(home)/lobby')} />

  return <GrandmasterTableView snapshot={snapshot ?? initial} onIntent={handleIntent} transportStatus={live ? transport.status : undefined} />
}

const styles = StyleSheet.create({ guideLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#07100B' } })
