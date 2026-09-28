import React, { useEffect, useRef, useState } from 'react'
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { WinnerHandShowcase } from './WinnerHandShowcase'
import { CARD_BACK_IMG, CARD_IMG } from './cardAssets'
import ComboCardBurst from '../vfx/ComboCardBurst'

export type TierCPlusReveal = {
  key: string
  pile: 1 | 2
  winnerId: string
  winnerBestFive: string[]
  communityCards: string[]
  handRanking: string
  missionScores?: Record<string, number>
  localCombo?: { kind: 'COMBO' | 'SUPER_COMBO'; bonus: number }
}

/** Runs the canonical Best-5 flip presentation used by Tier D for G1/G2. */
export function TierCPlusPileReveal({ reveals, localPlayerId, playerIds, localPiles, localIsVip = false, winnerName, waitForG1Commit = false, onCommitG1, onG2Complete, onSequenceComplete }: { reveals: TierCPlusReveal[]; localPlayerId: string; playerIds: string[]; localPiles: readonly (readonly { key: string }[])[]; localIsVip?: boolean; winnerName: (winnerId: string) => string; waitForG1Commit?: boolean; onCommitG1?: () => void; onG2Complete?: () => void; onSequenceComplete: () => void }) {
  const [index, setIndex] = useState(0)
  const [commitReady, setCommitReady] = useState(false)
  const previousFirstKey = useRef<string | undefined>(undefined)

  useEffect(() => {
    const firstKey = reveals[0]?.key
    if (firstKey && firstKey !== previousFirstKey.current) {
      previousFirstKey.current = firstKey
      setIndex(0)
      setCommitReady(false)
    }
  }, [reveals])

  const reveal = reveals[index]
  if (!reveal || reveal.winnerBestFive.length !== 5) return null
  const centerCards = reveal.winnerBestFive.filter(card => reveal.communityCards.includes(card))
  const winnerCards = reveal.winnerBestFive.filter(card => !reveal.communityCards.includes(card))

  const remainingPiles = reveal.pile === 1 ? [2, 3] : [3]
  const localCards = remainingPiles.flatMap(pile => (localPiles[pile - 1] ?? []).map(card => card.key))
  const remainingCount = reveal.pile === 1 ? 8 : 5
  return <View pointerEvents="box-none" style={styles.layer}>
    <RemainingHands localCards={localCards} localIsVip={localIsVip} opponents={playerIds.filter(id => id !== localPlayerId)} remainingCount={remainingCount} />
    {Object.entries(reveal.missionScores ?? {}).filter(([, score]) => score > 0).map(([playerId, score]) => <MissionScoreFloat key={`${reveal.key}:${playerId}`} eventKey={`${reveal.key}:${playerId}`} score={score} seat={playerId === localPlayerId ? 'user' : Math.max(0, playerIds.filter(id => id !== localPlayerId).indexOf(playerId)) as 0|1|2} />)}
    <WinnerHandShowcase
      key={reveal.key}
      pile={reveal.pile}
      centerCards={centerCards}
      winnerCards={winnerCards}
      handRanking={reveal.handRanking}
      winnerName={winnerName(reveal.winnerId)}
      winnerOrigin={reveal.winnerId === localPlayerId ? 'bottom' : 'top'}
      onComplete={() => {
        if (waitForG1Commit && reveal.pile === 1) { setCommitReady(true); return }
        if (index + 1 >= reveals.length) { onSequenceComplete(); if (reveal.pile === 2) onG2Complete?.() }
        else setIndex(current => current + 1)
      }}
    />
    {commitReady ? <Pressable accessibilityRole="button" style={styles.commitButton} onPress={() => { setCommitReady(false); onSequenceComplete(); onCommitG1?.() }}><Text style={styles.commitText}>COMMIT G1 &amp; REVEAL G2</Text></Pressable> : null}
    {reveal.localCombo ? <ComboCardBurst eventKey={`${reveal.key}:${reveal.localCombo.kind}`} kind={reveal.localCombo.kind} bonus={reveal.localCombo.bonus} /> : null}
  </View>
}

function RemainingHands({ localCards, localIsVip, opponents, remainingCount }: { localCards: string[]; localIsVip: boolean; opponents: string[]; remainingCount: number }) {
  return <View style={styles.remainingLayer}>
    {opponents.slice(0, 3).map((id, index) => <View key={id} style={[styles.aiHand, index === 0 ? styles.boss : index === 1 ? styles.left : styles.right]}><CardRow count={remainingCount} /></View>)}
    <View style={styles.userHand}><CardRow cards={localCards} count={localCards.length} faceUp playerSize={localIsVip ? 'vip' : 'free'} /></View>
  </View>
}

function CardRow({ cards = [], count, faceUp = false, playerSize }: { cards?: string[]; count: number; faceUp?: boolean; playerSize?: 'free'|'vip' }) {
  const compact = count > 5
  const width=playerSize==='free'?62:playerSize==='vip'?54:38
  const height=playerSize==='free'?90:playerSize==='vip'?78:55
  const overlap=playerSize ? (compact ? -(width-35) : -(width-39)) : (compact ? -27 : -23)
  return <View style={styles.cardRow}>{Array.from({ length: count }).map((_, index) => <View key={`${cards[index] ?? 'back'}-${index}`} style={[styles.card, {width,height}, index > 0 && { marginLeft: overlap }]}><Image source={faceUp && CARD_IMG[cards[index]] ? CARD_IMG[cards[index]] : CARD_BACK_IMG} style={{width,height}} resizeMode="cover" /></View>)}</View>
}

function MissionScoreFloat({ eventKey, score, seat }: { eventKey: string; score: number; seat: 'user' | 0 | 1 | 2 }) {
  const motion = useRef(new Animated.Value(0)).current
  useEffect(() => { motion.setValue(0); const animation = Animated.timing(motion, { toValue: 1, duration: 1450, useNativeDriver: true }); animation.start(); return () => animation.stop() }, [eventKey, motion])
  const position = seat === 'user' ? styles.scoreUser : seat === 0 ? styles.scoreBoss : seat === 1 ? styles.scoreLeft : styles.scoreRight
  return <Animated.View style={[styles.scoreFloat, position, { opacity: motion.interpolate({ inputRange: [0, .12, .72, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [0, -58] }) }, { scale: motion.interpolate({ inputRange: [0, .2, 1], outputRange: [.72, 1.18, 1] }) }] }]}><Text style={styles.scoreLabel}>MISSION +{score}</Text></Animated.View>
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, zIndex: 69, elevation: 69 },
  remainingLayer: { ...StyleSheet.absoluteFill, zIndex: 68 },
  aiHand: { position: 'absolute' }, boss: { top: 92, alignSelf: 'center' }, left: { left: 7, top: '42%' }, right: { right: 7, top: '42%' }, userHand: { position: 'absolute', bottom: 66, alignSelf: 'center' },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, card: { width: 38, height: 55, borderRadius: 5, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,215,106,.65)', backgroundColor: '#071b10' }, cardImage: { width: 38, height: 55 },
  scoreFloat: { position: 'absolute', zIndex: 200, elevation: 200 }, scoreUser: { bottom: 102, left: 28 }, scoreBoss: { top: 112, alignSelf: 'center' }, scoreLeft: { top: '44%', left: 14 }, scoreRight: { top: '44%', right: 14 }, scoreLabel: { color: '#8DFFB5', fontSize: 17, fontWeight: '900', textShadowColor: '#09220f', textShadowRadius: 7 },
  commitButton: { position:'absolute', bottom:18, alignSelf:'center', zIndex:40010, elevation:40010, minWidth:238, minHeight:48, paddingHorizontal:18, borderRadius:12, borderWidth:1.5, borderColor:'#FFD76A', backgroundColor:'rgba(15,54,31,.98)', alignItems:'center', justifyContent:'center' }, commitText: { color:'#FFF2B0', fontSize:13, fontWeight:'900', letterSpacing:.8 },
})
