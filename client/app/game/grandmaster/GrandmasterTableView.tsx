import React, { useEffect, useMemo, useState } from 'react'
import { Image, ImageBackground, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CARD_BACK_IMG, CARD_IMG } from '../../../src/components/game/cardAssets'
import ArenaOverlays from './ArenaOverlays'
import CrownPanel from './CrownPanel'
import FanHand from './FanHand'
import { ArenaClientIntent, ArenaClientSnapshot, ArenaSeatView } from './arenaClientTypes'

const MONARCH_TABLE = require('../../../assets/tables/boss_monarch_skin_table.png')

interface Props { snapshot: ArenaClientSnapshot; onIntent: (intent: ArenaClientIntent) => void; transportStatus?: string }

const cardView = (code: string, hidden = false) => (
  <View key={code} style={styles.communityCard}>
    {code === 'JOKER'
      ? <View style={styles.communityJoker}><Text style={styles.communityJokerText}>JOKER</Text></View>
      : <Image source={!hidden && CARD_IMG[code] ? CARD_IMG[code] : CARD_BACK_IMG} style={styles.communityImage} resizeMode="cover" />}
  </View>
)

function SeatLabel({ seat }: { seat: ArenaSeatView }) {
  const status = seat.connection === 'CONNECTED' ? null : seat.connection.replaceAll('_', ' ')
  return (
    <View style={[styles.seatLabel, seat.isCurrentTurn && styles.seatTurn, seat.isBoss && styles.bossLabel]}>
      <Text style={styles.avatar}>{seat.avatar}</Text>
      <View>
        <Text numberOfLines={1} style={styles.seatName}>{seat.displayName}</Text>
        <Text style={styles.seatBalance}>{Math.floor(seat.crownCrest / 12)} C {seat.crownCrest % 12} Cr</Text>
        {status && <Text style={styles.seatStatus}>{status}</Text>}
      </View>
    </View>
  )
}

export default function GrandmasterTableView({ snapshot, onIntent, transportStatus }: Props) {
  const { width, height } = useWindowDimensions()
  const compact = width < 700 || height < 420
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [])

  const seconds = snapshot.phaseEndsAt ? Math.max(0, Math.ceil((snapshot.phaseEndsAt - now) / 1000)) : null
  const bySeat = useMemo(() => new Map(snapshot.seats.map(seat => [seat.seat, seat])), [snapshot.seats])
  const local = snapshot.seats.find(seat => seat.isLocal)
  if (!local) return <View style={styles.fatal}><Text style={styles.fatalText}>LOCAL SEAT NOT FOUND</Text></View>

  const renderSeat = (number: 1 | 2 | 3 | 4, placement: 'top' | 'left' | 'right' | 'bottom') => {
    const seat = bySeat.get(number)
    if (!seat) return null
    const side = placement === 'left' || placement === 'right'
    return (
      <View style={[styles.seat, styles[placement]]}>
        <SeatLabel seat={seat} />
        <View style={side && (placement === 'left' ? styles.rotateLeft : styles.rotateRight)}>
          <FanHand
            cards={seat.cards}
            cardCount={seat.cardCount}
            faceUp={seat.isLocal}
            compact={!seat.isLocal || compact}
            width={seat.isLocal ? Math.min(width * 0.46, 360) : 190}
            disabled={!seat.isLocal}
            onCardPress={cardId => onIntent({ type: 'SELECT_CARD', cardId })}
          />
        </View>
      </View>
    )
  }

  return (
    <ImageBackground source={MONARCH_TABLE} resizeMode="cover" style={styles.root}>
      <View style={styles.darkWash} />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        {transportStatus && transportStatus !== 'MATCHED' && (
          <View style={styles.queueBanner}><Text style={styles.queueText}>ARENA {transportStatus}</Text></View>
        )}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>{'<'}</Text></Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.tier}>GRANDMASTER</Text>
            <Text style={styles.phase}>GAME {snapshot.gameNumber}/3  |  {snapshot.phase.replaceAll('_', ' ')}</Text>
          </View>
          <View style={[styles.timer, seconds !== null && seconds <= 3 && styles.timerDanger]}>
            <Text style={styles.timerText}>{seconds === null ? '--' : seconds}</Text>
          </View>
        </View>

        <View style={styles.tableArea}>
          <View style={styles.crownPosition}><CrownPanel value={snapshot.crown} /></View>

          {renderSeat(3, 'top')}
          {renderSeat(2, 'left')}
          {renderSeat(4, 'right')}
          {renderSeat(1, 'bottom')}

          <View style={styles.centerBoard}>
            <View style={styles.pileRow}>
              {([1, 2, 3] as const).map(pile => {
                const cards = snapshot.communityCards[`pile${pile}`]
                const pot = snapshot.crown[`pile${pile}PotCrest`]
                return (
                  <View key={pile} style={styles.pile}>
                    <Text style={styles.pileTitle}>PILE {pile}</Text>
                    <View style={styles.cardsRow}>{cards.map(code => cardView(code))}</View>
                    <Text style={styles.pot}>{pot} Crest</Text>
                  </View>
                )
              })}
            </View>
            <View style={styles.battleBadge}>
              <Text style={styles.battleLabel}>BATTLE REWARDS</Text>
              <Text style={styles.battleValue}>{snapshot.crown.battleRewardsCrest} CREST</Text>
            </View>
          </View>

          {(snapshot.phase === 'ARRANGE_1' || snapshot.phase === 'FINAL_ARRANGE') && (
            <Pressable onPress={() => onIntent({ type: 'SUBMIT_ARRANGEMENT', stage: snapshot.phase as 'ARRANGE_1' | 'FINAL_ARRANGE', arrangementHash: `v${snapshot.version}:${local?.cards.join(',') ?? ''}` })} style={styles.primaryAction}>
              <Text style={styles.primaryActionText}>{snapshot.phase === 'ARRANGE_1' ? 'READY' : 'CONFIRM ARRANGEMENT'}</Text>
            </Pressable>
          )}
          {snapshot.phase === 'FINAL_LOCK' && (
            <Pressable onPress={() => onIntent({ type: 'FINAL_LOCK', arrangementHash: `v${snapshot.version}:${local?.cards.join(',') ?? ''}` })} style={styles.primaryAction}>
              <Text style={styles.primaryActionText}>FINAL LOCK</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
      <ArenaOverlays snapshot={snapshot} onIntent={onIntent} />
    </ImageBackground>
  )
}

const styles = StyleSheet.create({
  queueBanner: { position: 'absolute', top: 10, alignSelf: 'center', zIndex: 20, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(8,20,13,0.94)', borderWidth: 1, borderColor: '#FFD76A' },
  queueText: { color: '#FFD76A', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  root: { flex: 1, backgroundColor: '#07150D' },
  darkWash: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3,10,6,0.28)' },
  safe: { flex: 1 },
  header: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, backgroundColor: 'rgba(5,14,9,0.88)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,215,106,0.34)' },
  backButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, borderWidth: 1, borderColor: '#3A5A44' },
  backText: { color: '#F5F2E8', fontSize: 19, fontWeight: '900' },
  headerCenter: { alignItems: 'center' },
  tier: { color: '#FFD76A', fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  phase: { color: '#C8C4B0', fontSize: 8, marginTop: 2 },
  timer: { width: 38, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#163A25', borderWidth: 1, borderColor: '#8DFFB5' },
  timerDanger: { backgroundColor: '#5A2020', borderColor: '#FF6B6B' },
  timerText: { color: '#F5F2E8', fontSize: 12, fontWeight: '900' },
  tableArea: { flex: 1, position: 'relative', overflow: 'hidden' },
  crownPosition: { position: 'absolute', left: 8, top: 8, zIndex: 30 },
  seat: { position: 'absolute', alignItems: 'center', zIndex: 10 },
  top: { top: 4, alignSelf: 'center' },
  bottom: { bottom: -5, alignSelf: 'center' },
  left: { left: -34, top: '38%' },
  right: { right: -34, top: '38%' },
  rotateLeft: { transform: [{ rotate: '90deg' }], marginTop: 30 },
  rotateRight: { transform: [{ rotate: '-90deg' }], marginTop: 30 },
  seatLabel: { minWidth: 108, maxWidth: 145, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 18, backgroundColor: 'rgba(7,18,12,0.9)', borderWidth: 1, borderColor: '#3A5A44', zIndex: 20 },
  seatTurn: { borderColor: '#8DFFB5', shadowColor: '#8DFFB5', shadowOpacity: 0.8, shadowRadius: 8, elevation: 8 },
  bossLabel: { borderColor: '#FFD76A', backgroundColor: 'rgba(29,19,5,0.94)' },
  avatar: { fontSize: 19 },
  seatName: { color: '#F5F2E8', fontSize: 9, fontWeight: '900', maxWidth: 100 },
  seatBalance: { color: '#FFD76A', fontSize: 7, marginTop: 1 },
  seatStatus: { color: '#FF8A8A', fontSize: 6, fontWeight: '800', maxWidth: 100 },
  centerBoard: { position: 'absolute', alignSelf: 'center', top: '31%', alignItems: 'center' },
  pileRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(3,12,7,0.57)' },
  pile: { alignItems: 'center', minWidth: 76 },
  pileTitle: { color: '#FFD76A', fontSize: 8, fontWeight: '900', marginBottom: 4 },
  cardsRow: { flexDirection: 'row' },
  communityCard: { width: 34, height: 49, marginLeft: -3, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,215,106,0.65)', backgroundColor: '#091808' },
  communityImage: { width: 34, height: 49 },
  communityJoker: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#160C1E' },
  communityJokerText: { color: '#FFD76A', fontSize: 7, fontWeight: '900', transform: [{ rotate: '-90deg' }] },
  pot: { color: '#8DFFB5', fontSize: 7, fontWeight: '800', marginTop: 3 },
  battleBadge: { marginTop: 7, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(22,12,30,0.9)', borderWidth: 1, borderColor: '#B982FF', alignItems: 'center' },
  battleLabel: { color: '#C8A1FF', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  battleValue: { color: '#F5F2E8', fontSize: 10, fontWeight: '900' },
  primaryAction: { position: 'absolute', right: 12, bottom: 12, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: '#245C39', borderWidth: 1, borderColor: '#8DFFB5', zIndex: 35 },
  primaryActionText: { color: '#F5F2E8', fontSize: 10, fontWeight: '900' },
  fatal: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F2418' },
  fatalText: { color: '#FF6B6B', fontWeight: '900' },
})
