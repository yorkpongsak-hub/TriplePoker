import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Image, ImageBackground, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Reanimated, { Easing, SharedValue, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
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
const STACK_CARD_W = 22
const STACK_CARD_H = 32
const RESOLVED_CARD_OVERLAP_STEP = 5

function TightFaceUpStack({ cards }: { cards: string[] }) {
  const cardWidth = 62
  const cardHeight = Math.round(cardWidth * 1.44)
  // 3px leaves roughly 5% of each 62px card visible (about 95% overlap).
  const overlapStep = 3
  return (
    <View style={{ width: cardWidth + Math.max(0, cards.length - 1) * overlapStep, height: cardHeight }}>
      {cards.map((code, index) => (
        <View key={`${code}-${index}`} style={[styles.parkedCard, { left: index * overlapStep, width: cardWidth, height: cardHeight, zIndex: index + 1 }]}>
          {code === 'JOKER'
            ? <View style={styles.parkedJoker}><Text style={styles.parkedJokerText}>J*</Text></View>
            : <Image source={CARD_IMG[code] ?? CARD_BACK_IMG} style={{ width: cardWidth, height: cardHeight }} resizeMode="cover" />}
        </View>
      ))}
    </View>
  )
}

function PileOneOpeningHand({ piles, width }: { piles: NonNullable<ArenaSeatView['arrangedPiles']>; width: number }) {
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    progress.setValue(0)
    const animation = Animated.timing(progress, { toValue: 1, duration: 650, useNativeDriver: true })
    animation.start()
    return () => animation.stop()
  }, [progress])

  const lane = Math.min(width, 420)
  return (
    <View style={[styles.pileOneOpening, { width: lane }]} pointerEvents="none">
      <Animated.View style={[styles.openingPile, {
        transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-lane * 0.27, 0] }) }],
      }]}>
        <FanHand cards={piles.pile1} cardCount={piles.pile1.length} faceUp width={150} disabled />
        <Text style={styles.openingPileLabel}>PILE 1</Text>
      </Animated.View>
      <Animated.View style={[styles.openingPile, {
        transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [lane * 0.08, lane * 0.38] }) }],
      }]}>
        <TightFaceUpStack cards={[...piles.pile2, ...piles.pile3]} />
        <Text style={styles.parkedPileLabel}>PILES 2–3</Text>
      </Animated.View>
    </View>
  )
}

function PileTwoBettingHand({ piles, width, revealedCards }: { piles: NonNullable<ArenaSeatView['arrangedPiles']>; width: number; revealedCards: readonly string[] }) {
  const progress = useRef(new Animated.Value(0)).current
  useEffect(() => {
    progress.setValue(0)
    const animation = Animated.timing(progress, { toValue: 1, duration: 650, useNativeDriver: true })
    animation.start()
    return () => animation.stop()
  }, [progress])

  const lane = Math.min(width, 420)
  return (
    <View style={[styles.pileOneOpening, { width: lane }]} pointerEvents="none">
      <Animated.View style={[styles.openingPile, {
        transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [lane * 0.38, 0] }) }],
      }]}>
        <FanHand cards={piles.pile2} cardCount={piles.pile2.length} faceUp width={150} disabled revealedCardIds={revealedCards} />
        <Text style={styles.openingPileLabel}>PILE 2 · BETTING</Text>
      </Animated.View>
      <Animated.View style={[styles.openingPile, { transform: [{ translateX: lane * 0.38 }] }]}>
        <TightFaceUpStack cards={piles.pile3} />
        <Text style={styles.parkedPileLabel}>PILE 3</Text>
      </Animated.View>
    </View>
  )
}

function PileThreeBettingHand({ piles, width, revealedCards, selectedCards, onSelectCard, selectable }: { piles: NonNullable<ArenaSeatView['arrangedPiles']>; width: number; revealedCards: readonly string[]; selectedCards: readonly string[]; onSelectCard: (cardId: string) => void; selectable: boolean }) {
  const progress = useRef(new Animated.Value(0)).current
  useEffect(() => {
    progress.setValue(0)
    const animation = Animated.timing(progress, { toValue: 1, duration: 650, useNativeDriver: true })
    animation.start()
    return () => animation.stop()
  }, [progress])

  const lane = Math.min(width, 420)
  return (
    <View style={[styles.pileOneOpening, { width: lane }]} pointerEvents="box-none">
      <Animated.View style={[styles.openingPile, {
        transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [lane * 0.38, 0] }) }],
      }]}>
        <FanHand cards={piles.pile3} cardCount={piles.pile3.length} faceUp width={210} disabled={!selectable} revealedCardIds={revealedCards} selectedCardIds={selectedCards} onCardPress={onSelectCard} />
        <Text style={styles.openingPileLabel}>PILE 3 · FINAL BETTING</Text>
      </Animated.View>
    </View>
  )
}

function ResolvedCardStack({ count }: { count: number }) {
  const arrivals = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current
  useEffect(() => {
    const animation = Animated.stagger(35, arrivals.map(value => Animated.timing(value, { toValue: 1, duration: 320, useNativeDriver: true })))
    animation.start()
    return () => animation.stop()
  }, [arrivals])
  return (
    <View style={[styles.pileStackWrap, { height: STACK_CARD_H + (count - 1) * RESOLVED_CARD_OVERLAP_STEP }]} pointerEvents="none">
      {arrivals.map((value, index) => (
        <Animated.Image
          key={index}
          source={CARD_BACK_IMG}
          style={[styles.pileStackCard, { top: index * RESOLVED_CARD_OVERLAP_STEP, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [120, 0] }) }] }]}
          resizeMode="cover"
        />
      ))}
    </View>
  )
}

function CardBackStack({ count, offset = 2 }: { count: number; offset?: number }) {
  if (count <= 0) return null
  return (
    <View style={{ width: STACK_CARD_W, height: STACK_CARD_H + Math.max(0, count - 1) * offset }}>
      {Array.from({ length: count }).map((_, index) => (
        <Image key={index} source={CARD_BACK_IMG} style={[styles.zoneStackCard, { top: index * offset }]} resizeMode="cover" />
      ))}
    </View>
  )
}

function ArenaDealAnimation({ width, height, localSeat }: { width: number; height: number; localSeat: 1 | 2 | 3 | 4 }) {
  const [started, setStarted] = useState(false)
  const anims = useRef(Array.from({ length: 53 }, () => ({ x: new Animated.Value(0), y: new Animated.Value(0), scale: new Animated.Value(0.55) }))).current
  const compositeRef = useRef<Animated.CompositeAnimation | null>(null)
  const otherSeats = ([1, 2, 4] as const).filter(seat => seat !== localSeat)
  const targetFor = (seat: 1 | 2 | 3 | 4, cardIndex: number) => {
    const spread = (cardIndex - 5) * 3
    if (seat === 3) return { x: spread, y: -Math.min(210, height * 0.31) }
    if (seat === localSeat) return { x: spread, y: Math.min(205, height * 0.31) }
    if (seat === otherSeats[0]) return { x: -Math.min(245, width * 0.38), y: spread }
    return { x: Math.min(245, width * 0.38), y: spread }
  }

  const reserveTargetFor = (index: number) => {
    const reserveIndex = index - 44
    if (reserveIndex < 6) {
      const pile = Math.floor(reserveIndex / 2)
      const withinPile = reserveIndex % 2
      return { x: (pile - 1) * 66 + withinPile * 13, y: -18 }
    }
    return { x: (reserveIndex - 7) * 18, y: -82 }
  }

  useEffect(() => {
    // Keep one fully card-free frame between rounds. This prevents the previous
    // game's hands/community/resolved stacks from persisting under the new deal.
    const clearTimer = setTimeout(() => {
      setStarted(true)
      const moves = anims.map((anim, index) => {
      const target = index < 44
        ? targetFor(((index % 4) + 1) as 1 | 2 | 3 | 4, Math.floor(index / 4))
        : reserveTargetFor(index)
      return Animated.sequence([
        Animated.delay(index * 65),
        Animated.parallel([
          Animated.timing(anim.x, { toValue: target.x, duration: 220, useNativeDriver: true }),
          Animated.timing(anim.y, { toValue: target.y, duration: 220, useNativeDriver: true }),
          Animated.timing(anim.scale, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]),
      ])
      })
      compositeRef.current = Animated.parallel(moves)
      compositeRef.current.start()
    }, 150)
    return () => { clearTimeout(clearTimer); compositeRef.current?.stop() }
    // target positions are snapshotted for this four-second phase
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return started ? (
    <View pointerEvents="none" style={styles.dealOverlay}>
      {anims.map((anim, index) => (
        <Animated.View key={index} style={[styles.dealCard, { zIndex: index + 1, transform: [{ translateX: anim.x }, { translateY: anim.y }, { scale: anim.scale }, { rotate: '90deg' }] }]}>
          <Image source={CARD_BACK_IMG} style={styles.dealCardImage} resizeMode="cover" />
        </Animated.View>
      ))}
      <Text style={styles.dealingText}>DEALING 53-CARD ARENA DECK</Text>
    </View>
  ) : null
}

function AuctionAwardAnimation({ result, width, height, localSeat, delayMs = 0, hidden = false }: {
  result: NonNullable<ArenaClientSnapshot['auctionResult']>; width: number; height: number; localSeat: 1 | 2 | 3 | 4; delayMs?: number; hidden?: boolean
}) {
  const x = useRef(new Animated.Value(0)).current
  const y = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(0.35)).current
  const opacity = useRef(new Animated.Value(0)).current
  const messageOpacity = useRef(new Animated.Value(0)).current
  const otherSeats = ([1, 2, 4] as const).filter(seat => seat !== localSeat)
  const target = result.winnerSeat === null ? { x: Math.min(270, width * 0.43), y: Math.min(190, height * 0.28) }
    : result.winnerSeat === 3 ? { x: 0, y: -Math.min(210, height * 0.31) }
    : result.winnerSeat === localSeat ? { x: 0, y: Math.min(205, height * 0.31) }
    : result.winnerSeat === otherSeats[0] ? { x: -Math.min(245, width * 0.38), y: 0 }
    : { x: Math.min(245, width * 0.38), y: 0 }

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.delay(delayMs),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(messageOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1.25, friction: 6, tension: 70, useNativeDriver: true }),
      ]),
      Animated.delay(1500),
      Animated.parallel([
        Animated.timing(x, { toValue: target.x, duration: 700, useNativeDriver: true }),
        Animated.timing(y, { toValue: target.y, duration: 700, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.65, duration: 700, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(messageOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]),
    ])
    animation.start()
    return () => animation.stop()
    // target is fixed for this award animation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <View pointerEvents="none" style={styles.awardOverlay}>
      <Animated.View style={[styles.awardMessage, { opacity: messageOpacity }]}>
        <Text style={styles.awardTitle}>{result.winnerSeat ? `${result.winnerDisplayName} WINS THE AUCTION` : 'NO BID · CARD DISCARDED'}</Text>
      </Animated.View>
      <Animated.View style={[styles.awardCard, { opacity, transform: [{ translateX: x }, { translateY: y }, { scale }] }]}>
        {hidden
          ? <Image source={CARD_BACK_IMG} style={styles.awardCardImage} resizeMode="cover" />
          : result.card === 'JOKER'
          ? <View style={styles.awardJoker}><Text style={styles.awardJokerText}>JOKER</Text></View>
          : <Image source={CARD_IMG[result.card] ?? CARD_BACK_IMG} style={styles.awardCardImage} resizeMode="cover" />}
      </Animated.View>
    </View>
  )
}

function CommunityRevealCard({ code }: { code: string }) {
  const scaleX = useRef(new Animated.Value(0)).current
  const glow = useRef(new Animated.Value(0.35)).current
  useEffect(() => {
    Animated.timing(scaleX, { toValue: 1, duration: 650, useNativeDriver: true }).start()
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.35, duration: 280, useNativeDriver: true }),
    ]), { iterations: 4 })
    pulse.start()
    return () => pulse.stop()
  }, [glow, scaleX])
  return <Animated.View style={[styles.communityRevealGlow, { opacity: glow, transform: [{ scaleX }] }]}>{cardView(code)}</Animated.View>
}

const cardView = (code: string, hidden = false) => (
  <View key={code} style={styles.communityCard}>
    {code === 'JOKER'
      ? <View style={styles.communityJoker}><Text style={styles.communityJokerText}>JOKER</Text></View>
      : <Image source={!hidden && CARD_IMG[code] ? CARD_IMG[code] : CARD_BACK_IMG} style={styles.communityImage} resizeMode="cover" />}
  </View>
)

function WaitingDots() {
  const progress = useSharedValue(0)
  useEffect(() => {
    progress.value = withRepeat(withSequence(
      withTiming(5, { duration: 2000, easing: Easing.linear }),
      withTiming(0, { duration: 0 }),
    ), -1, false)
  }, [progress])
  return <View style={styles.waitingDotsRow}>{[0, 1, 2, 3, 4].map(index => <WaitingDot key={index} index={index} progress={progress} />)}</View>
}

function WaitingDot({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const animatedStyle = useAnimatedStyle(() => ({ opacity: progress.value > index ? 1 : 0.18 }))
  return <Reanimated.View style={[styles.waitingDot, animatedStyle]} />
}

function SeatLabel({ seat, turnSeconds }: { seat: ArenaSeatView; turnSeconds?: number | null }) {
  const status = seat.connection === 'CONNECTED' ? null : seat.connection.replaceAll('_', ' ')
  if (seat.isWaiting) return (
    <View style={[styles.seatLabel, styles.waitingSeatLabel]}>
      <Text style={styles.waitingName}>Waiting</Text>
      <WaitingDots />
    </View>
  )
  return (
    <View style={[styles.seatLabel, seat.isCurrentTurn && styles.seatTurn, seat.isBoss && styles.bossLabel]}>
      {seat.controller === 'HUMAN'
        ? <AvatarDisplay config={{ type: 'preset', presetKey: seat.avatar, initial: seat.displayName, frameKey: 'default' }} size={28} showFrame />
        : <Text style={styles.avatar}>{seat.avatar}</Text>}
      <View>
        <Text numberOfLines={1} style={styles.seatName}>{seat.displayName}</Text>
        <Text style={styles.seatBalance}>{Math.floor(seat.crownCrest / 12)} C {seat.crownCrest % 12} Cr</Text>
        {seat.isCurrentTurn && turnSeconds !== null && turnSeconds !== undefined && <Text style={styles.seatTurnTimer}>CALL / FOLD · {turnSeconds}s</Text>}
        {status && <Text style={styles.seatStatus}>{status}</Text>}
      </View>
    </View>
  )
}

function splitIntoPiles(cards: string[]): [HandCardData[], HandCardData[], HandCardData[]] {
  const objs: HandCardData[] = cards.map(key => ({ id: key, key }))
  return [objs.slice(0, 3), objs.slice(3, 6), objs.slice(6)]
}

function restoreSavedPiles(cards: string[], saved?: ArenaSeatView['arrangedPiles']): [HandCardData[], HandCardData[], HandCardData[]] {
  if (!saved) return splitIntoPiles(cards)
  const held = new Set(cards)
  const savedIds = [...saved.pile1, ...saved.pile2, ...saved.pile3]
  if (new Set(savedIds).size !== savedIds.length || savedIds.some(id => !held.has(id))) return splitIntoPiles(cards)
  const missing = cards.filter(id => !savedIds.includes(id))
  const toCards = (ids: string[]) => ids.map(key => ({ id: key, key }))
  return [toCards(saved.pile1), toCards(saved.pile2), toCards([...saved.pile3, ...missing])]
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
  const isDealAnimation = snapshot.phase === 'DEAL_ANIMATION'
  const [auctionAwardActive, setAuctionAwardActive] = useState(false)
  const [completedBlindAwards, setCompletedBlindAwards] = useState<Set<string>>(new Set())
  const [selectedGFCardIds, setSelectedGFCardIds] = useState<string[]>([])

  const localGFPlayer = snapshot.gfTable?.players.find(player => player.seat === local?.seat)
  const alreadyGFRevealed = localGFPlayer?.revealedCards ?? []
  const requiredGFSelection = snapshot.gf?.localTurn && snapshot.gf.pile === 3 ? 2 : 0
  useEffect(() => { setSelectedGFCardIds([]) }, [snapshot.phase, snapshot.gf?.round, snapshot.gfTable?.currentSeat])

  const toggleGFRevealCard = (cardId: string) => {
    if (!snapshot.gf?.localTurn || snapshot.gf.pile !== 3 || alreadyGFRevealed.includes(cardId)) return
    setSelectedGFCardIds(current => current.includes(cardId)
      ? current.filter(id => id !== cardId)
      : current.length < requiredGFSelection ? [...current, cardId] : current)
  }

  useEffect(() => {
    if (!snapshot.auctionResult) { setAuctionAwardActive(false); return }
    setAuctionAwardActive(true)
    const timer = setTimeout(() => setAuctionAwardActive(false), 2950)
    return () => clearTimeout(timer)
  }, [snapshot.gameNumber, snapshot.auctionResult?.round, snapshot.auctionResult?.card])

  useEffect(() => {
    setCompletedBlindAwards(new Set())
    if (!snapshot.blindAuctionResults.length) return
    const timers = snapshot.blindAuctionResults.map((result, index) => setTimeout(() => {
      setCompletedBlindAwards(current => new Set(current).add(`${result.cardIndex}`))
    }, index * 2000 + 1910))
    return () => timers.forEach(clearTimeout)
  }, [snapshot.gameNumber, snapshot.blindAuctionResults.map(result => `${result.cardIndex}:${result.winnerSeat}:${result.ownedCard ?? ''}`).join('|')])

  const pendingDiscardAnimations = (auctionAwardActive && snapshot.auctionResult?.winnerSeat === null ? 1 : 0)
    + snapshot.blindAuctionResults.filter(result => result.winnerSeat === null && !completedBlindAwards.has(`${result.cardIndex}`)).length
  const displayedDiscardCount = Math.max(0, snapshot.cardZones.discardCount - pendingDiscardAnimations)

  const arrangingPhase: ArrangingPhase | null = local?.isCurrentTurn && ARRANGING_PHASES.includes(snapshot.phase as ArrangingPhase)
    ? (snapshot.phase as ArrangingPhase)
    : null

  const [piles, setPiles] = useState<[HandCardData[], HandCardData[], HandCardData[]] | null>(null)
  const [selectedCard, setSelectedCard] = useState<{ pi: number; ci: number } | null>(null)
  const finalDraftSentRef = useRef<string | null>(null)

  useEffect(() => {
    if (!arrangingPhase || !local) { setPiles(null); setSelectedCard(null); return }
    setPiles(restoreSavedPiles(local.cards, local.arrangedPiles))
    setSelectedCard(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrangingPhase, snapshot.gameNumber])

  // Save every stable ARRANGE_1 edit as a server-side draft without marking
  // the player Ready. This survives reconnects and becomes the starting layout
  // when the post-auction arrange phase opens.
  useEffect(() => {
    if (arrangingPhase !== 'ARRANGE_1' || !piles) return
    const timer = setTimeout(() => onIntent({
      type: 'SAVE_ARRANGEMENT_DRAFT',
      pile1: piles[0].map(card => card.key), pile2: piles[1].map(card => card.key), pile3: piles[2].map(card => card.key),
    }), 350)
    return () => clearTimeout(timer)
  }, [arrangingPhase, piles, onIntent])

  // Flush once more before the deadline so the latest on-screen ordering wins
  // even if the final edit happened inside the debounce window.
  useEffect(() => {
    if (arrangingPhase !== 'ARRANGE_1' || seconds === null || seconds > 3 || !piles) return
    const key = `${snapshot.gameNumber}:${snapshot.phaseEndsAt}`
    if (finalDraftSentRef.current === key) return
    finalDraftSentRef.current = key
    onIntent({
      type: 'SAVE_ARRANGEMENT_DRAFT',
      pile1: piles[0].map(card => card.key), pile2: piles[1].map(card => card.key), pile3: piles[2].map(card => card.key),
    })
  }, [arrangingPhase, onIntent, piles, seconds, snapshot.gameNumber, snapshot.phaseEndsAt])

  const [discardTarget, setDiscardTarget] = useState<string | null>(null)
  useEffect(() => {
    if (snapshot.phase !== 'DISCARD' || !local?.isCurrentTurn) { setDiscardTarget(null); return }
    const pile3 = local.arrangedPiles?.pile3
    setDiscardTarget(pile3?.length ? pile3[pile3.length - 1] : null)
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
    const gfTurnSeconds = snapshot.gfTable && seat.isCurrentTurn ? seconds : null
    if (snapshot.phase === 'DEAL_ANIMATION') return <View style={[styles.seat, styles[placement]]}><SeatLabel seat={seat} turnSeconds={gfTurnSeconds} /></View>
    if (seat.isLocal && arrangingPhase) return <View style={[styles.seat, styles[placement]]}><SeatLabel seat={seat} turnSeconds={gfTurnSeconds} /></View>
    if (seat.isLocal && snapshot.phase === 'DISCARD' && seat.isCurrentTurn) return <View style={[styles.seat, styles[placement]]}><SeatLabel seat={seat} turnSeconds={gfTurnSeconds} /></View>
    if (seat.isLocal && snapshot.phase === 'RESOLVE_PILE_1' && seat.arrangedPiles) {
      return (
        <View style={[styles.seat, styles[placement]]}>
          <View style={styles.localHandGap}><PileOneOpeningHand piles={seat.arrangedPiles} width={Math.min(width * 0.82, 460)} /></View>
          <SeatLabel seat={seat} turnSeconds={gfTurnSeconds} />
        </View>
      )
    }
    if (seat.isLocal && snapshot.phase === 'GF_PILE_2' && seat.arrangedPiles) {
      const revealedCards = snapshot.gfTable?.players.find(player => player.seat === seat.seat)?.revealedCards ?? []
      return (
        <View style={[styles.seat, styles[placement]]}>
          <View style={styles.localHandGap}><PileTwoBettingHand piles={seat.arrangedPiles} width={Math.min(width * 0.82, 460)} revealedCards={revealedCards} /></View>
          <SeatLabel seat={seat} turnSeconds={gfTurnSeconds} />
        </View>
      )
    }
    if (seat.isLocal && (snapshot.phase === 'GF_PILE_3_ROUND_1' || snapshot.phase === 'GF_PILE_3_ROUND_2') && seat.arrangedPiles) {
      const revealedCards = snapshot.gfTable?.players.find(player => player.seat === seat.seat)?.revealedCards ?? []
      return (
        <View style={[styles.seat, styles[placement]]}>
          <View style={styles.localHandGap}><PileThreeBettingHand piles={seat.arrangedPiles} width={Math.min(width * 0.82, 460)} revealedCards={revealedCards} selectedCards={selectedGFCardIds} onSelectCard={toggleGFRevealCard} selectable={!!snapshot.gf?.localTurn} /></View>
          <SeatLabel seat={seat} turnSeconds={gfTurnSeconds} />
        </View>
      )
    }
    const side = placement === 'left' || placement === 'right'
    const awardCards = [
      ...(auctionAwardActive && snapshot.auctionResult?.winnerSeat === number ? [snapshot.auctionResult.card] : []),
      ...snapshot.blindAuctionResults
        .filter(result => result.winnerSeat === number && result.ownedCard && !completedBlindAwards.has(`${result.cardIndex}`))
        .map(result => result.ownedCard!),
    ]
    const pendingBlindAwardCount = snapshot.blindAuctionResults
      .filter(result => result.winnerSeat === number && !completedBlindAwards.has(`${result.cardIndex}`)).length
    const pendingFaceUpAwardCount = auctionAwardActive && snapshot.auctionResult?.winnerSeat === number ? 1 : 0
    const pendingAwardCards = [...awardCards]
    const visibleCards = awardCards.length ? seat.cards.filter(card => {
      const index = pendingAwardCards.indexOf(card)
      if (index >= 0) { pendingAwardCards.splice(index, 1); return false }
      return true
    }) : seat.cards
    const visibleCardCount = Math.max(0, seat.cardCount - pendingFaceUpAwardCount - pendingBlindAwardCount)
    const gfPlayer = snapshot.gfTable?.players.find(player => player.seat === number)
    const gfRevealedCards = gfPlayer?.revealedCards ?? []
    const gfPileActive = !!snapshot.gfTable
    const gfPrivateCardCount = snapshot.gfTable?.pile === 2 ? 3 : 5
    const hand = (
      <View style={side && (placement === 'left' ? styles.rotateLeft : styles.rotateRight)}>
        <FanHand
          cards={gfPileActive ? gfRevealedCards : visibleCards}
          cardCount={gfPileActive ? gfPrivateCardCount : visibleCardCount}
          faceUp={seat.isLocal || gfPileActive}
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
          <SeatLabel seat={seat} turnSeconds={gfTurnSeconds} />
        </View>
      )
    }
    return (
      <View style={[styles.seat, styles[placement]]}>
        <SeatLabel seat={seat} turnSeconds={gfTurnSeconds} />
        {hand}
      </View>
    )
  }

  return (
    <ImageBackground source={MONARCH_TABLE} resizeMode="cover" style={styles.root}>
      <View style={styles.darkWash} />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        {transportStatus && transportStatus !== 'MATCHED' && (
          <View style={styles.queueBanner}><Text style={styles.queueText}>{transportStatus === 'INSUFFICIENT_CROWN' ? 'NEED 20 CROWN TO ENTER' : `ARENA ${transportStatus.replaceAll('_', ' ')}`}</Text></View>
        )}
        <View style={styles.header}>
          <View style={styles.backButton} />
          <View style={styles.headerCenter}>
            <Text style={styles.tier}>GRANDMASTER</Text>
            <Text style={styles.phase}>GAME {snapshot.gameNumber}/3  |  {snapshot.phase.replaceAll('_', ' ')}</Text>
          </View>
          <View style={[styles.timer, seconds !== null && seconds <= 3 && styles.timerDanger]}>
            <Text style={styles.timerText}>{snapshot.gfTable?.currentSeat ? `S${snapshot.gfTable.currentSeat}` : seconds === null ? '--' : seconds}</Text>
          </View>
        </View>

        <View style={styles.tableArea}>
          <View style={styles.crownPosition}><CrownPanel value={snapshot.crown} /></View>

          {renderSeat(3, 'top')}
          {renderSeat(otherChallengerSeats[0], 'left')}
          {renderSeat(otherChallengerSeats[1], 'right')}
          {renderSeat(local.seat, 'bottom')}

          {isDealAnimation && <ArenaDealAnimation key={`deal-${snapshot.gameNumber}`} width={width} height={height} localSeat={local.seat} />}
          {snapshot.auctionResult && auctionAwardActive && <AuctionAwardAnimation key={`award-${snapshot.gameNumber}-${snapshot.auctionResult.card}`} result={snapshot.auctionResult} width={width} height={height} localSeat={local.seat} />}
          {snapshot.blindAuctionResults.map((result, index) => <AuctionAwardAnimation
            key={`blind-award-${snapshot.gameNumber}-${result.cardIndex}`}
            result={{ round: 'FACE_UP', card: 'BLIND', winnerSeat: result.winnerSeat, winnerDisplayName: result.winnerDisplayName }}
            width={width} height={height} localSeat={local.seat} delayMs={index * 2000} hidden
          />)}

          {!isDealAnimation && snapshot.cardZones.stockCount > 0 && (
            <View style={styles.stockZone}>
              <Text style={styles.zoneLabel}>{snapshot.phase === 'DEAL_ANIMATION' ? 'AUCTION RESERVE' : 'DECK'}</Text>
              <CardBackStack count={snapshot.cardZones.stockCount} offset={snapshot.cardZones.stockCount > 10 ? 0.35 : 2} />
            </View>
          )}

          {!isDealAnimation && displayedDiscardCount > 0 && (
            <View style={styles.discardZone}>
              <Text style={styles.zoneLabel}>DISCARD / BURN</Text>
              <CardBackStack count={displayedDiscardCount} offset={2} />
            </View>
          )}

          {/* ไพ่ประมูล — ต้องเห็นได้ทุกคนตลอดช่วงประมูล ไม่ใช่แค่คนกำลังบิดตาตัวเอง (มติลุงเยาะ) ใบเปิดซ้าย
              ใบปิด (Blind) 2 ใบขวา แสดงแค่หลังไพ่เสมอ (คงหลังไพ่ Blind Auction ไว้ตามกฎเดิม ไม่ใช่บั๊ก) */}
          {!isDealAnimation && (snapshot.cardZones.auction.faceUpCard || snapshot.cardZones.auction.blindCount > 0) && (
            <View style={[styles.auctionRow, { top: height * 0.31 - COMMUNITY_CARD_HEIGHT - 78 }]}>
              {snapshot.cardZones.auction.faceUpCard && <View style={styles.auctionSide}>
                <Text style={styles.auctionLabel}>FACE-UP</Text>
                <View style={styles.cardsRow}>{cardView(snapshot.cardZones.auction.faceUpCard)}</View>
              </View>}
              <View style={styles.auctionSide}>
                <Text style={styles.auctionLabel}>BLIND</Text>
                <View style={styles.cardsRow}>{Array.from({ length: snapshot.cardZones.auction.blindCount }).map((_, index) => cardView(`blind${index}`, true))}</View>
              </View>
            </View>
          )}

          {!isDealAnimation && <View style={[styles.centerBoard, { top: height * 0.31 - COMMUNITY_CARD_HEIGHT }]}>
            <View style={styles.pileRow}>
              {([1, 2, 3] as const).map(pile => {
                const cards = snapshot.communityCards[`pile${pile}`]
                const pot = snapshot.crown[`pile${pile}PotCrest`]
                const resolved = snapshot.pilesResolved[`pile${pile}`]
                const stackCount = snapshot.cardZones.resolvedPileCounts[`pile${pile}`]
                return (
                  <View key={pile} style={styles.pile}>
                    <Text style={styles.pileTitle}>PILE {pile}</Text>
                    <View style={styles.cardsRow}>{cards.map((code, index) => pile === 3 && index === 1 && snapshot.phase === 'REVEAL_PILE3_COMMUNITY_CARD_2'
                      ? <CommunityRevealCard key={`community-reveal-${snapshot.gameNumber}-${code}`} code={code} />
                      : cardView(code))}</View>
                    <Text style={styles.pot}>{pot} Crest</Text>
                    {/* กองไพ่คว่ำสะสมของกองที่จบแล้ว — ไพ่ทุกที่นั่ง (รวม Fold/Foul) ไม่ใช่แค่ผู้ชนะ เพราะคว่ำ
                        อยู่แล้วไม่ผิดกฎ Fog of War แค่ต้องนับจำนวนให้ครบ (มติลุงเยาะ) เลื่อนแกน Y ใบละ 5px */}
                    {resolved && stackCount > 0 && (
                      <ResolvedCardStack key={`${snapshot.gameNumber}-resolved-${pile}`} count={stackCount} />
                    )}
                  </View>
                )
              })}
            </View>
            <View style={styles.battleBadge}>
              <Text style={styles.battleLabel}>BATTLE REWARDS</Text>
              <Text style={styles.battleValue}>{snapshot.crown.battleRewardsCrest} CREST</Text>
            </View>
          </View>}

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
              <Text style={styles.arrangeTitle}>MANDATORY DISCARD</Text>
              <Text style={styles.arrangeSub}>The final card in Pile 3 must be discarded. The first five cards plus two community cards rank as Best 5 of 7.</Text>
              <View style={styles.discardRow}>
                {discardTarget ? [discardTarget].map(code => (
                  <Pressable
                    key={code}
                    disabled
                    hitSlop={6}
                    style={[styles.discardCard, styles.discardCardSelected]}
                  >
                    <Image source={CARD_IMG[code]} style={styles.discardImage} resizeMode="cover" />
                  </Pressable>
                )) : null}
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
      {!isDealAnimation && <ArenaOverlays snapshot={auctionAwardActive ? { ...snapshot, auction: null } : snapshot} onIntent={onIntent} selectedGFCardIds={selectedGFCardIds} requiredGFSelection={requiredGFSelection} />}
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
  seatTurnTimer: { color: '#FFD76A', fontSize: 8, fontWeight: '900', marginTop: 2 },
  waitingSeatLabel: { justifyContent: 'center', minWidth: 104, borderStyle: 'dashed', opacity: 0.9 },
  waitingName: { color: '#C8C4B0', fontSize: 10, fontWeight: '800' },
  waitingDotsRow: { flexDirection: 'row', gap: 3, alignItems: 'center', marginLeft: 2 },
  waitingDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFD76A' },
  tableArea: { flex: 1, position: 'relative', overflow: 'hidden' },
  dealOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 45, alignItems: 'center', justifyContent: 'center' },
  dealCard: { position: 'absolute', width: 25, height: 36, borderRadius: 5, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,215,106,0.65)', backgroundColor: '#091808' },
  dealCardImage: { width: 25, height: 36 },
  dealingText: { position: 'absolute', top: '55%', color: 'rgba(255,215,106,0.72)', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  awardOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 60, alignItems: 'center', justifyContent: 'center' },
  awardMessage: { position: 'absolute', top: '31%', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(7,18,11,0.94)', borderWidth: 1, borderColor: '#FFD76A' },
  awardTitle: { color: '#FFD76A', fontSize: 12, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  awardCard: { width: 54, height: 78, borderRadius: 6, overflow: 'hidden', borderWidth: 2, borderColor: '#FFD76A', backgroundColor: '#130D1F', shadowColor: '#FFD76A', shadowOpacity: 0.9, shadowRadius: 12, elevation: 15 },
  awardCardImage: { width: 54, height: 78 },
  awardJoker: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#130D1F' },
  awardJokerText: { color: '#FFD76A', fontWeight: '900', fontSize: 14 },
  communityRevealGlow: { borderRadius: 6, borderWidth: 2, borderColor: '#FFD76A', shadowColor: '#FFD76A', shadowOpacity: 1, shadowRadius: 14, elevation: 16 },
  stockZone: { position: 'absolute', left: '51%', top: '34%', zIndex: 32, alignItems: 'center' },
  discardZone: { position: 'absolute', right: 8, bottom: '25%', zIndex: 32, alignItems: 'center' },
  zoneLabel: { color: '#C8C4B0', fontSize: 6, fontWeight: '900', letterSpacing: 0.6, marginBottom: 3 },
  zoneStackCard: { position: 'absolute', left: 0, width: STACK_CARD_W, height: STACK_CARD_H, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(255,215,106,0.45)', backgroundColor: '#091808' },
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
  pileOneOpening: { height: 116, position: 'relative', alignSelf: 'center', overflow: 'visible' },
  openingPile: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  openingPileLabel: { marginTop: -8, color: '#FFD76A', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  parkedCard: { position: 'absolute', top: 0, overflow: 'hidden', borderRadius: 5, borderWidth: 1, borderColor: 'rgba(255,215,106,0.72)', backgroundColor: '#091808' },
  parkedJoker: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#130D1F' },
  parkedJokerText: { color: '#FFD76A', fontSize: 18, fontWeight: '900' },
  parkedPileLabel: { marginTop: 3, color: '#C8C4B0', fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
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
