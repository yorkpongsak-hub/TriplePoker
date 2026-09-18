import React, { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { AnimatedCardFlip } from './AnimatedCardFlip'
import { handRankKey, t } from '../../i18n'
import { useI18n } from '../../i18n/store'

export type WinnerHandShowcaseProps = { pile: 1 | 2 | 3; centerCards: string[]; winnerCards: string[]; handRanking: string; winnerOrigin: 'bottom' | 'top'; isCombo?: boolean; isSuperCombo?: boolean; onComplete: () => void }

/** Presentation-only. All cards, winner identity and hand label are canonical inputs. */
export function WinnerHandShowcase({ pile, centerCards, winnerCards, handRanking, winnerOrigin, isCombo, isSuperCombo, onComplete }: WinnerHandShowcaseProps) {
  const locale = useI18n(state => state.locale)
  const label = useRef(new Animated.Value(0)).current
  // Parent renders while the authoritative timer is paused. Keep the completion
  // callback current without restarting this one-shot presentation sequence.
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  useEffect(() => {
    const centerDuration = 550 + Math.max(0, centerCards.length - 1) * 130
    const winnerDuration = 550 + Math.max(0, winnerCards.length - 1) * 130
    const finish = setTimeout(() => {
      Animated.timing(label, { toValue: 1, duration: 180, useNativeDriver: true }).start()
    }, centerDuration + winnerDuration)
    // Keep the assembled canonical hand on the felt long enough to read before
    // the existing all-player showdown panel takes over.
    const complete = setTimeout(() => onCompleteRef.current(), centerDuration + winnerDuration + 3200)
    return () => { clearTimeout(finish); clearTimeout(complete); label.stopAnimation() }
  }, [centerCards.length, winnerCards.length, label])
  const winnerDelay = 550 + Math.max(0, centerCards.length - 1) * 130
  const originY = winnerOrigin === 'bottom' ? 210 : -210
  // The finished hand always occupies the G1 showcase slot.  G2/G3 therefore
  // travel left from their real table slots before the winning cards join them.
  const centerSourceX = (pile - 1) * 88
  return <View pointerEvents="none" style={s.overlay} accessibilityLiveRegion="polite">
    <View style={s.hand}>{centerCards.map((card, index) => <AnimatedCardFlip key={`center-${card}-${index}`} cardKey={card} delay={index * 130} startOffset={{x:centerSourceX+(index-.5)*16,y:0}} />)}<View style={s.divider}/>{winnerCards.map((card, index) => <AnimatedCardFlip key={`winner-${card}-${index}`} cardKey={card} delay={winnerDelay + index * 130} startOffset={{x:(index-1)*48,y:originY}} />)}</View>
    <Animated.View style={[s.rank, { opacity: label, transform: [{ scale: label.interpolate({ inputRange: [0, 1], outputRange: [.8, 1] }) }] }]}><Text style={s.rankText}>{t(handRankKey(handRanking), {}, locale)}</Text>{isSuperCombo ? <Text style={s.vfx}>{t('game.superCombo', {}, locale)}</Text> : isCombo ? <Text style={s.vfx}>{t('game.combo', {}, locale)}</Text> : null}</Animated.View>
  </View>
}
const s = StyleSheet.create({ overlay: { ...StyleSheet.absoluteFill, zIndex: 70, elevation: 70, alignItems: 'center', justifyContent: 'center' }, hand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 84, marginTop:-26, paddingHorizontal:4 }, divider: { width: 1, height: 48, backgroundColor: 'rgba(255,215,106,.75)', marginHorizontal: 7 }, rank: { marginTop: 18, alignItems: 'center', paddingHorizontal:16, paddingVertical:5, borderTopWidth:1, borderBottomWidth:1, borderColor:'rgba(255,215,106,.62)', backgroundColor:'rgba(7,36,20,.72)' }, rankText: { color: '#fff0a8', fontSize: 27, fontWeight: '900', letterSpacing: 1.5, textShadowColor: '#9a5f00', textShadowRadius: 12 }, vfx: { color: '#8dffb5', fontSize: 15, fontWeight: '900', marginTop: 6 } })
