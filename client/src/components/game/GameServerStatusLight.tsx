import React, { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import type { Socket } from 'socket.io-client'

type SocketRef = { current: Socket | null }

interface Props {
  socketRef?: SocketRef
  online?: boolean
  compact?: boolean
}

/** Shared table-level heartbeat indicator. Reuses the table socket; never opens its own connection. */
export default function GameServerStatusLight({ socketRef, online, compact = false }: Props) {
  const [connected, setConnected] = useState(online ?? socketRef?.current?.connected ?? false)
  const pulse = useRef(new Animated.Value(0.35)).current

  useEffect(() => {
    if (typeof online === 'boolean') {
      setConnected(online)
      return
    }
    const update = () => setConnected(socketRef?.current?.connected === true)
    update()
    const timer = setInterval(update, 5_000)
    return () => clearInterval(timer)
  }, [online, socketRef])

  useEffect(() => {
    pulse.setValue(0.35)
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.35, duration: 500, useNativeDriver: true }),
    ]))
    animation.start()
    return () => animation.stop()
  }, [connected, pulse])

  const color = connected ? '#45F27A' : '#FF4D4D'
  return (
    <View
      pointerEvents="none"
      accessibilityRole="text"
      accessibilityLabel={connected ? 'Game server online' : 'Game server offline'}
      style={[styles.wrap, compact && styles.wrapCompact]}
    >
      <Animated.View style={[styles.glow, { backgroundColor: color, opacity: pulse, transform: [{ scale: pulse.interpolate({ inputRange: [0.35, 1], outputRange: [0.82, 1.18] }) }] }]} />
      <View style={[styles.dot, { backgroundColor: color, borderColor: connected ? '#B8FFCB' : '#FFC1C1' }]} />
      {!compact && <Text style={[styles.label, { color }]}>{connected ? 'SERVER ONLINE' : 'SERVER OFFLINE'}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 54, right: 10, zIndex: 1000, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, height: 25, borderRadius: 13, backgroundColor: 'rgba(4,12,8,0.84)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' },
  wrapCompact: { width: 24, paddingHorizontal: 0, justifyContent: 'center' },
  glow: { position: 'absolute', left: 7, width: 13, height: 13, borderRadius: 7 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1 },
  label: { fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
})
