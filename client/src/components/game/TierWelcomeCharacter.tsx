import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { audio } from '../../audio'
import { registerTierEntry, TIER_WELCOME_NAMES, type LaunchTierId, type TierEntryGreeting } from '../../game/tierWelcome'

const SHEET = require('../../../assets/characters/tier_welcome_character_sheet.png')
type Position = 'center' | 'left' | 'right'
type SpeechModule = typeof import('expo-speech')

let speechModule: SpeechModule | null | undefined
function getSpeechModule(): SpeechModule | null {
  if (speechModule !== undefined) return speechModule
  try {
    // Keep older development clients usable until they are rebuilt with ExpoSpeech.
    speechModule = require('expo-speech') as SpeechModule
  } catch {
    speechModule = null
  }
  return speechModule
}

const randomPosition = (): Position => ['center', 'left', 'right'][Math.floor(Math.random() * 3)] as Position
const jitter = (amount: number) => Math.round((Math.random() * 2 - 1) * amount)

export function TierWelcomeCharacter({ playerId, tierId }: { playerId?: string; tierId: LaunchTierId }) {
  const { width } = useWindowDimensions()
  const [visible, setVisible] = useState(false)
  const [frame, setFrame] = useState(0)
  const [position, setPosition] = useState<Position>('center')
  const [message, setMessage] = useState('')
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const spoke = useRef(false)
  const opacity = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(.7)).current
  const bounce = useRef(new Animated.Value(18)).current
  const wiggle = useRef(new Animated.Value(0)).current

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, Math.max(0, ms)))
  }, [])

  const play = useCallback((greeting: Exclude<TierEntryGreeting, 'none'>) => {
    clearTimers()
    const nextMessage = greeting === 'cheer' ? 'Cheer Cheer!!' : `Welcome to Tier ${TIER_WELCOME_NAMES[tierId]}!`
    setMessage(nextMessage)
    setPosition(randomPosition())
    setFrame(0)
    setVisible(true)
    opacity.setValue(0)
    scale.setValue(.68)
    bounce.setValue(20)
    wiggle.setValue(0)

    const danceShift = jitter(65)
    const talkShift = jitter(75)
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 105, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(bounce, { toValue: -10, duration: 190 + danceShift, useNativeDriver: true }),
        Animated.spring(bounce, { toValue: 0, friction: 4, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(260),
        Animated.timing(wiggle, { toValue: 1, duration: 170, useNativeDriver: true }),
        Animated.timing(wiggle, { toValue: -1, duration: 170, useNativeDriver: true }),
        Animated.spring(wiggle, { toValue: 0, friction: 4, useNativeDriver: true }),
      ]),
    ]).start()

    later(() => setFrame(1), 250 + danceShift)
    later(() => setFrame(2), 650 + jitter(55))
    later(() => {
      const settings = audio.getSettings()
      if (!settings.muted && settings.master > 0) {
        const speech = getSpeechModule()
        if (speech) {
          spoke.current = true
          speech.speak(nextMessage, {
            language: 'en-US', rate: .92, pitch: 1.12, volume: settings.master,
          })
        }
      }
    }, 720 + talkShift)
    ;[3, 4, 3, 4, 3].forEach((mouthFrame, index) => {
      later(() => setFrame(mouthFrame), 790 + talkShift + index * (145 + jitter(18)))
    })
    later(() => setFrame(5), 1760 + jitter(80))
    later(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 320, useNativeDriver: true }),
        Animated.timing(scale, { toValue: .82, duration: 320, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: -28, duration: 320, useNativeDriver: true }),
      ]).start(({ finished }) => finished && setVisible(false))
    }, 2260 + jitter(100))
  }, [bounce, clearTimers, later, opacity, scale, tierId, wiggle])

  useEffect(() => {
    let active = true
    if (playerId) {
      registerTierEntry(playerId, tierId)
        .then(greeting => { if (active && greeting !== 'none') play(greeting) })
        .catch(error => console.warn('[tier-welcome] persistence failed', error))
    }
    return () => {
      active = false
      clearTimers()
      if (spoke.current) getSpeechModule()?.stop()
    }
  }, [clearTimers, play, playerId, tierId])

  const frameWidth = Math.min(190, Math.max(132, width * .39))
  const frameHeight = frameWidth * 2
  const edgeOffset = frameWidth * .38
  const horizontal = position === 'left' ? -edgeOffset : position === 'right' ? edgeOffset : 0
  const rotate = wiggle.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-4deg', '0deg', '4deg'] })

  return (
    <>
      {__DEV__ && !visible ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Replay Tier Welcome" onPress={() => play('welcome')} style={styles.debugButton}>
          <Text style={styles.debugText}>Replay Tier Welcome</Text>
        </Pressable>
      ) : null}
      {visible ? (
        <View accessibilityViewIsModal accessibilityLabel={message} style={styles.overlay}>
          <Animated.View style={[styles.characterGroup, {
            width: frameWidth,
            transform: [{ translateX: horizontal }, { translateY: bounce }, { rotate }, { scale }],
            opacity,
          }]}>
            <View style={styles.bubble}>
              <Text style={styles.bubbleText}>{message}</Text>
              <Text style={styles.heart}>♥</Text>
            </View>
            <View style={{ width: frameWidth, height: frameHeight, overflow: 'hidden' }}>
              <Image
                source={SHEET}
                resizeMode="stretch"
                style={{ position: 'absolute', left: -frame * frameWidth, top: 0, width: frameWidth * 6, height: frameHeight }}
              />
            </View>
          </Animated.View>
        </View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 50000,
    elevation: 50000,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(4,12,10,.14)',
  },
  characterGroup: { alignItems: 'center' },
  bubble: {
    minWidth: 150,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: -8,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#5b4a53',
    backgroundColor: 'rgba(255,252,248,.97)',
    alignItems: 'center',
    zIndex: 2,
  },
  bubbleText: { color: '#30242b', fontSize: 15, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
  heart: { color: '#ec5f91', fontSize: 13, marginTop: 1 },
  debugButton: {
    position: 'absolute', top: 50, right: 8, zIndex: 49000, elevation: 49000,
    paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: '#ff91bd', backgroundColor: 'rgba(45,20,38,.86)',
  },
  debugText: { color: '#ffd2e3', fontSize: 9, fontWeight: '800' },
})
