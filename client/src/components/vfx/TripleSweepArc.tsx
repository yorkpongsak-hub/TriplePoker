import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { audio } from '../../audio/AudioManager'
import { AudioEvent } from '../../audio/audioEvents'

const LABEL = 'TRIPLE SWEEP'
const DURATION_MS = 3500

/** Table-local, non-modal Triple Sweep title arranged along an upward arc. */
export default function TripleSweepArc({ scores, onFinish }: { scores: { game: 1|2|3; points: number }[]; onFinish: () => void }) {
  const progress = useRef(new Animated.Value(0)).current
  const finish = useRef(onFinish)
  const scoreKey = scores.map(score => `${score.game}-${score.points}`).join(':')
  finish.current = onFinish

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    })
    animation.start(({ finished }) => { if (finished) finish.current() })
    return () => animation.stop()
  }, [progress])

  useEffect(() => {
    // The lightning lanes peak just after their initial flash. Keep this cue
    // local and deduped: a remount or delayed render must not create a second
    // thunder hit for the same already-settled Triple Sweep.
    const thunder = setTimeout(() => audio.play(AudioEvent.TRIPLE_SWEEP_THUNDER, { dedupeKey: `tier-d:triple-sweep-thunder:${scoreKey}` }), 260)
    return () => clearTimeout(thunder)
  }, [scoreKey])

  const opacity = progress.interpolate({
    inputRange: [0, .10, .55, 1],
    outputRange: [0, 1, 1, 0],
  })
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [.62, 1.48],
  })
  const scoreOpacity = progress.interpolate({ inputRange: [0, .14, .72, 1], outputRange: [0, 1, 1, 0] })
  const scoreLift = progress.interpolate({ inputRange: [0, 1], outputRange: [32, -52] })
  const scoreScale = progress.interpolate({ inputRange: [0, .2, 1], outputRange: [.55, 1.3, 1.04] })

  return <Animated.View
    pointerEvents="none"
    accessibilityLabel="Triple Sweep"
    style={[s.root, { opacity, transform: [{ scale }] }]}
  >
    <View style={s.arc}>
      {[...LABEL].map((character, index) => {
        const middle = (LABEL.length - 1) / 2
        const normalized = (index - middle) / middle
        const top = 38 * normalized * normalized
        const rotate = normalized * 18
        return <Text key={`${character}-${index}`} style={[s.letter, { left: index * 25, top, transform: [{ rotate: `${rotate}deg` }] }]}>{character === ' ' ? '\u00a0' : character}</Text>
      })}
    </View>
    <View style={s.scoreRow}>
      {scores.map(score => <Animated.View key={score.game} style={[s.scoreFloat,{opacity:scoreOpacity,transform:[{translateY:scoreLift},{scale:scoreScale}]}]}><Text style={s.scoreGame}>G{score.game}</Text><Text style={s.scoreValue}>+{score.points}</Text></Animated.View>)}
    </View>
  </Animated.View>
}

const s = StyleSheet.create({
  root: { position: 'absolute', top: '15%', marginTop: 30, left: 0, right: 0, height: 185, zIndex: 30, elevation: 30, alignItems: 'center', justifyContent: 'center' },
  arc: { width: 300, height: 105, position: 'relative' },
  letter: { position: 'absolute', color: '#FFF0A8', fontSize: 31, fontWeight: '900', textShadowColor: '#FF9D00', textShadowRadius: 12 },
  scoreRow: { width: 250, flexDirection: 'row', justifyContent: 'space-between', marginTop: -2 },
  scoreFloat: { minWidth: 68, alignItems: 'center' },
  scoreGame: { color: '#FFF0A8', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  scoreValue: { color: '#8DFFB5', fontSize: 29, fontWeight: '900', textShadowColor: '#0B3E24', textShadowRadius: 7 },
})
