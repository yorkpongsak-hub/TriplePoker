import React, { useEffect, useMemo, useState } from 'react'
import { Image, ImageBackground, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CARD_BACK_IMG, CARD_IMG } from '../../../src/components/game/cardAssets'
import PlayerHandView, { HandCardData } from '../../../src/components/game/PlayerHandView'
import { AvatarDisplay } from '../../../src/components/profile/AvatarPicker'
import ArenaOverlays from './ArenaOverlays'
import CrownPanel from './CrownPanel'
import FanHand from './FanHand'
import { ArenaClientIntent, ArenaClientSnapshot, ArenaSeatView } from '../../../src/game/grandmaster/arenaClientTypes'

const MONARCH_TABLE = require('../../../assets/tables/boss_monarch_skin_table.png')

interface Props { snapshot: ArenaClientSnapshot; onIntent: (intent: ArenaClientIntent) => void; transportStatus?: string }

type ArrangingPhase = 'ARRANGE_1' | 'FINAL_ARRANGE' | 'FINAL_LOCK'
const ARRANGING_PHASES: ArrangingPhase[] = ['ARRANGE_1', 'FINAL_ARRANGE', 'FINAL_LOCK']
// ต้องตรงกับ styles.communityCard.height เสมอ — ใช้เลื่อนกองกลางขึ้นบนอีก 1 เท่าของความสูงไพ่กองกลาง
const COMMUNITY_CARD_HEIGHT = 49
// จำนวนไพ่ต่อกอง (นับทุกที่นั่งรวม Fold/Foul ตามมติลุงเยาะ — "จำนวนไพ่บนจอทั้งหงายคว่ำต้องครบ") โต๊ะ Arena
// มี 4 ที่นั่งตายตัวเสมอ (tierSConfig's tableSeats) — pile3 = 5 ใบเสมอหลัง Discard (11 ใบ = 3+3+5)
const PILE_SIZES: Record<1 | 2 | 3, number> = { 1: 3, 2: 3, 3: 5 }
const STACK_SEAT_COUNT = 4
const STACK_CARD_W = 22
const STACK_CARD_H = 32

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
      {seat.controller === 'HUMAN'
        ? <AvatarDisplay config={{ type: 'preset', presetKey: seat.avatar, initial: seat.displayName, frameKey: 'default' }} size={28} showFrame />
        : <Text style={styles.avatar}>{seat.avatar}</Text>}
      <View>
        <Text numberOfLines={1} style={styles.seatName}>{seat.displayName}</Text>
        <Text style={styles.seatBalance}>{Math.floor(seat.crownCrest / 12)} C {seat.crownCrest % 12} Cr</Text>
        {status && <Text style={styles.seatStatus}>{status}</Text>}
      </View>
    </View>
  )
}

function splitIntoPiles(cards: string[]): [HandCardData[], HandCardData[], HandCardData[]] {
  const objs: HandCardData[] = cards.map(key => ({ id: key, key }))
  return [objs.slice(0, 3), objs.slice(3, 6), objs.slice(6)]
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

  const arrangingPhase: ArrangingPhase | null = local?.isCurrentTurn && ARRANGING_PHASES.includes(snapshot.phase as ArrangingPhase)
    ? (snapshot.phase as ArrangingPhase)
    : null

  const [piles, setPiles] = useState<[HandCardData[], HandCardData[], HandCardData[]] | null>(null)
  const [selectedCard, setSelectedCard] = useState<{ pi: number; ci: number } | null>(null)

  useEffect(() => {
    if (!arrangingPhase || !local) { setPiles(null); setSelectedCard(null); return }
    setPiles(splitIntoPiles(local.cards))
    setSelectedCard(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrangingPhase, snapshot.gameNumber])

  const [discardTarget, setDiscardTarget] = useState<string | null>(null)
  useEffect(() => {
    if (snapshot.phase !== 'DISCARD' || !local?.isCurrentTurn) { setDiscardTarget(null); return }
    setDiscardTarget(local.cards.length ? local.cards[local.cards.length - 1] : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.phase, snapshot.gameNumber])

  if (!local) return <View style={styles.fatal}><Text style={styles.fatalText}>LOCAL SEAT NOT FOUND</Text></View>

  // ที่นั่ง 3 คือ Boss เสมอ (AI เท่านั้น ไม่มีทาง isLocal) เลยตรึงไว้ 'top' ได้ตายตัว
  // ที่นั่งที่เหลือ (1/2/4) ต้องหมุนตาม local.seat จริง ไม่งั้นคนที่ไม่ได้นั่ง seat 1 จะเห็นตัวเองไปโผล่
  // ที่ตำแหน่งข้าง (compact/หมุน 90deg) แทนที่จะเป็นตำแหน่ง bottom หลักเหมือนกันทุก user
  const otherChallengerSeats = ([1, 2, 4] as const).filter(seatNumber => seatNumber !== local.seat)

  const handleArrangeCardPress = (pi: number, ci: number) => {
    if (!piles) return
    if (!selectedCard) { setSelectedCard({ pi, ci }); return }
    if (selectedCard.pi === pi && selectedCard.ci === ci) { setSelectedCard(null); return }
    const next: [HandCardData[], HandCardData[], HandCardData[]] = [[...piles[0]], [...piles[1]], [...piles[2]]]
    const swap = next[selectedCard.pi][selectedCard.ci]
    next[selectedCard.pi][selectedCard.ci] = next[pi][ci]
    next[pi][ci] = swap
    setPiles(next)
    setSelectedCard(null)
  }

  const confirmArrangement = () => {
    if (!piles) return
    const pileKeys = { pile1: piles[0].map(card => card.key), pile2: piles[1].map(card => card.key), pile3: piles[2].map(card => card.key) }
    if (arrangingPhase === 'FINAL_LOCK') onIntent({ type: 'FINAL_LOCK', ...pileKeys })
    else if (arrangingPhase) onIntent({ type: 'SUBMIT_ARRANGEMENT', stage: arrangingPhase, ...pileKeys })
  }

  const renderSeat = (number: 1 | 2 | 3 | 4, placement: 'top' | 'left' | 'right' | 'bottom') => {
    const seat = bySeat.get(number)
    if (!seat) return null
    if (seat.isLocal && arrangingPhase) return <View style={[styles.seat, styles[placement]]}><SeatLabel seat={seat} /></View>
    const side = placement === 'left' || placement === 'right'
    const hand = (
      <View style={side && (placement === 'left' ? styles.rotateLeft : styles.rotateRight)}>
        <FanHand
          cards={seat.cards}
          cardCount={seat.cardCount}
          faceUp={seat.isLocal}
          compact={!seat.isLocal}
          width={seat.isLocal ? Math.min(width * 0.7, 420) : 190}
          disabled={!seat.isLocal}
          onCardPress={cardId => onIntent({ type: 'SELECT_CARD', cardId })}
        />
      </View>
    )
    // มติลุงเยาะ: ไพ่ในมือ P1 (ตัวเอง) ต้องอยู่เหนือรายชื่อ/Avatar เสมอ ห่างจากขอบล่างไพ่ไม่น้อยกว่า 30px —
    // สลับลำดับเฉพาะที่นั่งตัวเอง คู่ต่อสู้คนอื่นยังคงชื่ออยู่บนไพ่เหมือนเดิม (ยังต้องแยกจาก reference ใหม่)
    if (seat.isLocal) {
      return (
        <View style={[styles.seat, styles[placement]]}>
          <View style={styles.localHandGap}>{hand}</View>
          <SeatLabel seat={seat} />
        </View>
      )
    }
    return (
      <View style={[styles.seat, styles[placement]]}>
        <SeatLabel seat={seat} />
        {hand}
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
          <View style={styles.backButton} />
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
          {renderSeat(otherChallengerSeats[0], 'left')}
          {renderSeat(otherChallengerSeats[1], 'right')}
          {renderSeat(local.seat, 'bottom')}

          {/* ไพ่ประมูล — ต้องเห็นได้ทุกคนตลอดช่วงประมูล ไม่ใช่แค่คนกำลังบิดตาตัวเอง (มติลุงเยาะ) ใบเปิดซ้าย
              ใบปิด (Blind) 2 ใบขวา แสดงแค่หลังไพ่เสมอ (คงหลังไพ่ Blind Auction ไว้ตามกฎเดิม ไม่ใช่บั๊ก) */}
          {snapshot.auctionDisplay && (
            <View style={[styles.auctionRow, { top: height * 0.31 - COMMUNITY_CARD_HEIGHT - 78 }]}>
              <View style={styles.auctionSide}>
                <Text style={styles.auctionLabel}>FACE-UP</Text>
                <View style={styles.cardsRow}>{cardView(snapshot.auctionDisplay.faceUpCard)}</View>
              </View>
              <View style={styles.auctionSide}>
                <Text style={styles.auctionLabel}>BLIND</Text>
                <View style={styles.cardsRow}>{cardView('blind0', true)}{cardView('blind1', true)}</View>
              </View>
            </View>
          )}

          <View style={[styles.centerBoard, { top: height * 0.31 - COMMUNITY_CARD_HEIGHT }]}>
            <View style={styles.pileRow}>
              {([1, 2, 3] as const).map(pile => {
                const cards = snapshot.communityCards[`pile${pile}`]
                const pot = snapshot.crown[`pile${pile}PotCrest`]
                const resolved = snapshot.pilesResolved[`pile${pile}`]
                const stackCount = PILE_SIZES[pile] * STACK_SEAT_COUNT
                return (
                  <View key={pile} style={styles.pile}>
                    <Text style={styles.pileTitle}>PILE {pile}</Text>
                    <View style={styles.cardsRow}>{cards.map(code => cardView(code))}</View>
                    <Text style={styles.pot}>{pot} Crest</Text>
                    {/* กองไพ่คว่ำสะสมของกองที่จบแล้ว — ไพ่ทุกที่นั่ง (รวม Fold/Foul) ไม่ใช่แค่ผู้ชนะ เพราะคว่ำ
                        อยู่แล้วไม่ผิดกฎ Fog of War แค่ต้องนับจำนวนให้ครบ (มติลุงเยาะ) เลื่อนแกน Y ใบละ 10px */}
                    {resolved && (
                      <View style={[styles.pileStackWrap, { height: STACK_CARD_H + (stackCount - 1) * 10 }]}>
                        {Array.from({ length: stackCount }).map((_, index) => (
                          <Image key={index} source={CARD_BACK_IMG} style={[styles.pileStackCard, { top: index * 10 }]} resizeMode="cover" />
                        ))}
                      </View>
                    )}
                  </View>
                )
              })}
            </View>
            <View style={styles.battleBadge}>
              <Text style={styles.battleLabel}>BATTLE REWARDS</Text>
              <Text style={styles.battleValue}>{snapshot.crown.battleRewardsCrest} CREST</Text>
            </View>
          </View>

          {arrangingPhase && piles && (
            <View style={styles.arrangeSheet}>
              <Text style={styles.arrangeTitle}>
                {arrangingPhase === 'ARRANGE_1' ? 'ARRANGE YOUR HAND' : arrangingPhase === 'FINAL_ARRANGE' ? 'FINAL ARRANGE' : 'CONFIRM FINAL LOCK'}
              </Text>
              <Text style={styles.arrangeSub}>Tap a card, then tap another to swap. Pile 1 must not beat Pile 2; Pile 2 must not beat Pile 3.</Text>
              <PlayerHandView piles={piles} selected={selectedCard} onCardPress={handleArrangeCardPress} isVip={false} />
              <Pressable onPress={confirmArrangement} hitSlop={10} style={({ pressed }) => [styles.primaryAction, pressed && styles.primaryActionPressed]}>
                {({ pressed }) => (
                  <Text style={[styles.primaryActionText, pressed && styles.primaryActionTextPressed]}>
                    {arrangingPhase === 'FINAL_LOCK' ? 'FINAL LOCK' : arrangingPhase === 'ARRANGE_1' ? 'READY' : 'CONFIRM ARRANGEMENT'}
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          {snapshot.phase === 'DISCARD' && local.isCurrentTurn && (
            <View style={styles.arrangeSheet}>
              <Text style={styles.arrangeTitle}>DISCARD ONE CARD</Text>
              <Text style={styles.arrangeSub}>You won an extra card at auction — pick one card to discard.</Text>
              <View style={styles.discardRow}>
                {local.cards.map(code => (
                  <Pressable
                    key={code}
                    onPress={() => setDiscardTarget(code)}
                    hitSlop={6}
                    style={({ pressed }) => [styles.discardCard, discardTarget === code && styles.discardCardSelected, pressed && styles.primaryActionPressed]}
                  >
                    <Image source={CARD_IMG[code]} style={styles.discardImage} resizeMode="cover" />
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={() => discardTarget && onIntent({ type: 'DISCARD', cardId: discardTarget })}
                hitSlop={10}
                style={({ pressed }) => [styles.primaryAction, pressed && styles.primaryActionPressed]}
              >
                {({ pressed }) => <Text style={[styles.primaryActionText, pressed && styles.primaryActionTextPressed]}>DISCARD</Text>}
              </Pressable>
            </View>
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
  // ระยะห่างขั้นต่ำ 30px ระหว่างขอบล่างไพ่ในมือ P1 กับรายชื่อ/Avatar ด้านล่าง (มติลุงเยาะ)
  localHandGap: { marginBottom: 30 },
  seatLabel: { minWidth: 108, maxWidth: 145, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 18, backgroundColor: 'rgba(7,18,12,0.9)', borderWidth: 1, borderColor: '#3A5A44', zIndex: 20 },
  seatTurn: { borderColor: '#8DFFB5', shadowColor: '#8DFFB5', shadowOpacity: 0.8, shadowRadius: 8, elevation: 8 },
  bossLabel: { borderColor: '#FFD76A', backgroundColor: 'rgba(29,19,5,0.94)' },
  avatar: { fontSize: 19 },
  seatName: { color: '#F5F2E8', fontSize: 9, fontWeight: '900', maxWidth: 100 },
  seatBalance: { color: '#FFD76A', fontSize: 7, marginTop: 1 },
  seatStatus: { color: '#FF8A8A', fontSize: 6, fontWeight: '800', maxWidth: 100 },
  centerBoard: { position: 'absolute', alignSelf: 'center', alignItems: 'center' },
  auctionRow: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', gap: 20,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(3,12,7,0.57)',
  },
  auctionSide: { alignItems: 'center' },
  auctionLabel: { color: '#FFD76A', fontSize: 7, fontWeight: '900', letterSpacing: 1, marginBottom: 3 },
  pileRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(3,12,7,0.57)' },
  pile: { alignItems: 'center', minWidth: 76 },
  pileTitle: { color: '#FFD76A', fontSize: 8, fontWeight: '900', marginBottom: 4 },
  cardsRow: { flexDirection: 'row' },
  communityCard: { width: 34, height: 49, marginLeft: -3, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,215,106,0.65)', backgroundColor: '#091808' },
  communityImage: { width: 34, height: 49 },
  communityJoker: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#160C1E' },
  communityJokerText: { color: '#FFD76A', fontSize: 7, fontWeight: '900', transform: [{ rotate: '-90deg' }] },
  pot: { color: '#8DFFB5', fontSize: 7, fontWeight: '800', marginTop: 3 },
  pileStackWrap: { marginTop: 6, width: STACK_CARD_W, alignSelf: 'center' },
  pileStackCard: {
    position: 'absolute', width: STACK_CARD_W, height: STACK_CARD_H, borderRadius: 3,
    borderWidth: 1, borderColor: 'rgba(255,215,106,0.4)', backgroundColor: '#091808',
  },
  battleBadge: { marginTop: 7, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(22,12,30,0.9)', borderWidth: 1, borderColor: '#B982FF', alignItems: 'center' },
  battleLabel: { color: '#C8A1FF', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  battleValue: { color: '#F5F2E8', fontSize: 10, fontWeight: '900' },
  arrangeSheet: { position: 'absolute', bottom: 8, alignSelf: 'center', width: '96%', paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(8,20,13,0.97)', borderWidth: 1, borderColor: '#FFD76A', alignItems: 'center', zIndex: 35 },
  arrangeTitle: { color: '#FFD76A', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  arrangeSub: { color: '#C8C4B0', fontSize: 8, marginTop: 2, marginBottom: 4, textAlign: 'center', paddingHorizontal: 12 },
  discardRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, paddingHorizontal: 10, marginBottom: 8 },
  discardCard: { width: 44, height: 62, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,215,106,0.5)', backgroundColor: '#160C1E', alignItems: 'center', justifyContent: 'center' },
  discardCardSelected: { borderColor: '#FF6B6B', borderWidth: 2 },
  discardImage: { width: 44, height: 62 },
  primaryAction: { marginTop: 6, minHeight: 44, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 10, backgroundColor: '#245C39', borderWidth: 1, borderColor: '#8DFFB5', alignItems: 'center', justifyContent: 'center' },
  // มติลุงเยาะ: ต้องเปลี่ยนสีจริงตอนกด ใช้สีทองสัญญาณ "active" เดียวกับทั้งแอป (ดู ArenaOverlays.tsx's pressed)
  primaryActionPressed: { opacity: 0.85, transform: [{ scale: 0.97 }], backgroundColor: '#FFD76A', borderColor: '#FFD76A' },
  primaryActionText: { color: '#F5F2E8', fontSize: 11, fontWeight: '900' },
  primaryActionTextPressed: { color: '#0F2418' },
  fatal: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F2418' },
  fatalText: { color: '#FF6B6B', fontWeight: '900' },
})
