import React, { useEffect, useRef, useState } from 'react'
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { audio } from '../../audio/AudioManager'
import { AudioEvent } from '../../audio/audioEvents'

const VICTORY_FX = require('../../../assets/fx/vfx_you_win.webp')
const TROPHIES = {
  bronze: require('../../../assets/league/Bronze League Trophy.png'),
  silver: require('../../../assets/league/Silver League Trophy.png'),
  gold: require('../../../assets/league/Gold League Trophy.png'),
  platinum: require('../../../assets/league/Platinum League Trophy.png'),
  diamond: require('../../../assets/league/Diamond League Trophy.png'),
  elite: require('../../../assets/league/Elite League Trophy.png'),
  master: require('../../../assets/league/Master League Trophy.png'),
  grandmaster: require('../../../assets/league/Grandmaster League Trophy.png'),
  legend: require('../../../assets/league/Legend League Trophy.png'),
  mythic: require('../../../assets/league/Champion League Trophy.png'),
} as const

function leagueFor(level: number): keyof typeof TROPHIES {
  if (level <= 50) return 'bronze'; if (level <= 100) return 'silver'; if (level <= 150) return 'gold'
  if (level <= 200) return 'platinum'; if (level <= 250) return 'diamond'; if (level <= 350) return 'elite'
  if (level <= 500) return 'master'; if (level <= 700) return 'grandmaster'; if (level <= 1000) return 'legend'
  return 'mythic'
}

/** One-time acknowledgement for a server-awarded Top 3 competition trophy. */
export function TierDTopThreeAward({ level, rank, onCollected }: { level: number; rank: 1 | 2 | 3; onCollected: () => void }) {
  const league = leagueFor(level)
  const collect = useRef(new Animated.Value(0)).current
  const [collecting, setCollecting] = useState(false)
  useEffect(() => { audio.play(AudioEvent.MATCH_WIN, { dedupeKey: `tier-d:top-three:${level}:${rank}` }) }, [level, rank])
  const claim = () => {
    if (collecting) return
    setCollecting(true)
    collect.setValue(0)
    Animated.timing(collect, { toValue: 1, duration: 3000, useNativeDriver: true }).start(({ finished }) => { if (finished) onCollected() })
  }
  const trophyStyle = collecting ? {
    opacity: collect.interpolate({ inputRange: [0, .78, 1], outputRange: [1, 1, 0] }),
    transform: [
      { translateY: collect.interpolate({ inputRange: [0, 1], outputRange: [34, -146] }) },
      { scale: collect.interpolate({ inputRange: [0, .7, 1], outputRange: [.58, 2.15, 2.55] }) },
    ],
  } : undefined
  return <View style={s.screen}>
    <Image source={VICTORY_FX} resizeMode="cover" style={s.victoryFx}/>
    <View style={s.panel}>
      <Text style={s.kicker}>LEAGUE PODIUM</Text>
      <Text style={s.title}>TOP 3 FINISH!</Text>
      <Text style={s.league}>{league.toUpperCase()} LEAGUE</Text>
      <Text style={s.rank}>#{rank}</Text>
      <Text style={s.rankLabel}>YOUR FINAL RANK</Text>
      <Animated.View style={[s.trophyWrap, trophyStyle]}><Image source={TROPHIES[league]} resizeMode="contain" style={s.trophy}/></Animated.View>
      <Text style={s.reward}>LEAGUE TROPHY AWARDED</Text>
      <Pressable disabled={collecting} onPress={claim} style={[s.collect, collecting && s.collectDisabled]}>
        <Text style={s.collectText}>{collecting ? 'COLLECTING…' : 'COLLECT TROPHY'}</Text>
      </Pressable>
    </View>
  </View>
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#06180e', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  victoryFx: { position: 'absolute', width: '150%', height: '100%', opacity: .72 },
  panel: { width: '88%', minHeight: 520, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFD76A', borderRadius: 24, backgroundColor: 'rgba(7,30,18,.91)', overflow: 'hidden', padding: 24, shadowColor: '#FFD76A', shadowOpacity: .55, shadowRadius: 24, elevation: 18 },
  kicker: { color: '#9DDAFF', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#FFF0A8', fontSize: 30, fontWeight: '900', letterSpacing: 1.4, marginTop: 8, textShadowColor: '#B76D00', textShadowRadius: 12 },
  league: { color: '#D8F3E0', fontSize: 12, fontWeight: '900', letterSpacing: 1.3, marginTop: 8 },
  rank: { color: '#FFD76A', fontSize: 66, fontWeight: '900', lineHeight: 75, marginTop: 8, textShadowColor: '#A56200', textShadowRadius: 16 },
  rankLabel: { color: '#D8F3E0', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  trophyWrap: { width: 158, height: 154, alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
  trophy: { width: 150, height: 150 },
  reward: { color: '#8DFFB5', fontSize: 12, fontWeight: '900', letterSpacing: .8, marginBottom: 18 },
  collect: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: '#FFD76A', borderRadius: 12, paddingVertical: 15, shadowColor: '#FFD76A', shadowOpacity: .7, shadowRadius: 12, elevation: 10 },
  collectDisabled: { opacity: .72 },
  collectText: { color: '#163A25', fontSize: 15, fontWeight: '900', letterSpacing: 1 },
})
