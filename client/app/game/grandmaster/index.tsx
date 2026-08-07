import React, { useEffect, useMemo } from 'react'
import { useLocalSearchParams } from 'expo-router'
import GrandmasterTableView from './GrandmasterTableView'
import { ArenaClientIntent, ArenaClientPhase, ArenaClientSnapshot } from '../../../src/game/grandmaster/arenaClientTypes'
import { useArenaTableStore } from '../../../src/game/grandmaster/useArenaTableStore'
import { useArenaTransport } from '../../../src/game/grandmaster/useArenaTransport'

const cards = ['as', 'kh', 'qd', 'jc', '10s', '9h', '8d', '7c', '6s', '5h', 'JOKER']

function previewSnapshot(mode?: string): ArenaClientSnapshot {
  let phase: ArenaClientPhase = 'ARRANGE_1'
  if (mode === 'auction') phase = 'AUCTION_BLIND'
  if (mode === 'joker') phase = 'JOKER_DECLARE'
  if (mode === 'gf') phase = 'GF_PILE_3_ROUND_1'
  if (mode === 'result') phase = 'MATCH_RESULT'
  return {
    matchId: 'grandmaster-preview', version: 1, phase, gameNumber: 1,
    phaseEndsAt: Date.now() + 30_000,
    seats: [
      { seat: 1, playerId: 'local', displayName: 'Grandmaster', avatar: '♠', isLocal: true, isBoss: false, isCurrentTurn: phase.includes('GF'), connection: mode === 'reconnect' ? 'RECONNECTING' : 'CONNECTED', cards, cardCount: 11, crownCrest: 246 },
      { seat: 2, playerId: 'p2', displayName: 'Cipher Veil', avatar: '◆', isLocal: false, isBoss: false, isCurrentTurn: false, connection: 'CONNECTED', cards: [], cardCount: 11, crownCrest: 210 },
      { seat: 3, playerId: 'boss', displayName: 'Monarch', avatar: '♛', isLocal: false, isBoss: true, isCurrentTurn: false, connection: 'CONNECTED', cards: [], cardCount: 11, crownCrest: 300 },
      { seat: 4, playerId: 'p4', displayName: 'Sovereign Fox', avatar: '♣', isLocal: false, isBoss: false, isCurrentTurn: false, connection: 'CONNECTED', cards: [], cardCount: 11, crownCrest: 198 },
    ],
    crown: { pile1PotCrest: 12, pile2PotCrest: 15, pile3PotCrest: 24, battleRewardsCrest: 18, tableTotalCrest: 954, localBalanceCrest: 246 },
    communityCards: { pile1: ['ah', '10h'], pile2: ['ks', 'kd'], pile3: ['qc', 'JOKER'] },
    auction: phase === 'AUCTION_BLIND' ? { round: 'BLIND', bidOptionsCrest: [0, 3, 6, 9, 12], locked: false } : null,
    joker: phase === 'JOKER_DECLARE' ? { canChoose: true, anteX2Enabled: true } : null,
    gf: phase === 'GF_PILE_3_ROUND_1' ? { pile: 3, round: 1, localTurn: true, callCostCrest: 3 } : null,
    bossPresentation: mode === 'boss' ? {
      bossId: 'MONARCH',
      title: 'BOSS ENCOUNTER',
      subtitle: 'MONARCH | FOUR GODS',
      dialogue: 'Every crown remembers the hand that earned it.',
    } : null,
    result: phase === 'MATCH_RESULT' ? {
      title: 'MATCH COMPLETE',
      lines: [
        { label: 'Ante', crest: -36 }, { label: 'Joker Extra Ante', crest: -6 },
        { label: 'Auction', crest: -12 }, { label: 'Call', crest: -9 },
        { label: 'Boss Fee', crest: -24 }, { label: 'Sweep Jackpot', crest: 42 },
        { label: 'Win / Loss', crest: 66 },
      ],
      netCrest: 21,
    } : null,
  }
}

export default function GrandmasterScreen() {
  const params = useLocalSearchParams<{ preview?: string }>()
  const snapshot = useArenaTableStore(state => state.snapshot)
  const applyServerSnapshot = useArenaTableStore(state => state.applyServerSnapshot)
  const live = typeof params.preview !== 'string'
  const initial = useMemo(() => {
    const value = previewSnapshot(params.preview)
    if (!live) return value
    return {
      ...value, phase: 'WAITING_FOR_PLAYERS' as const, gameNumber: 0 as const, phaseEndsAt: null,
      seats: value.seats.map(seat => ({ ...seat, cards: [], cardCount: 0 })),
      communityCards: { pile1: [], pile2: [], pile3: [] },
      crown: { pile1PotCrest: 0, pile2PotCrest: 0, pile3PotCrest: 0, battleRewardsCrest: 0, tableTotalCrest: 0, localBalanceCrest: 0 },
    }
  }, [params.preview, live])
  const transport = useArenaTransport(live, initial)

  useEffect(() => { applyServerSnapshot(initial) }, [initial, applyServerSnapshot])

  const handleIntent = (intent: ArenaClientIntent) => {
    if (live) transport.sendIntent(intent)
    else console.log('[ARENA-PREVIEW-INTENT]', intent)
  }

  return <GrandmasterTableView snapshot={snapshot ?? initial} onIntent={handleIntent} transportStatus={live ? transport.status : undefined} />
}
