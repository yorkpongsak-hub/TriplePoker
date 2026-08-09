import React, { useEffect, useRef } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { io, Socket } from 'socket.io-client'
import { useUserStore } from '../../../src/store/userStore'
import { useSpectatorStore } from '../../../src/store/spectatorStore'
import { DelayedSpectatorEvent, SpectatorSnapshot } from '../../../src/types/spectator.types'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'

export default function SpectatorScreen() {
  const { broadcastId } = useLocalSearchParams<{ broadcastId: string }>()
  const userId = useUserStore(s => s.userId)
  const state = useSpectatorStore()
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!broadcastId || !userId) return
    state.connect(broadcastId)
    const socket = io(SERVER_URL, { transports: ['websocket'] })
    socketRef.current = socket
    socket.on('connect', () => socket.emit('spectator:join', { broadcastId, userId }))
    socket.on('spectator:snapshot', (snapshot: SpectatorSnapshot) => state.hydrate(snapshot))
    socket.on('spectator:event', (event: DelayedSpectatorEvent) => state.append(event))
    socket.on('spectator:viewer-count', ({ viewerCount, viewerLimit }: { viewerCount: number; viewerLimit?: number }) => state.setViewers(viewerCount, viewerLimit))
    socket.on('spectator:broadcast-ended', () => state.end())
    socket.on('spectator:error', ({ code }: { code: string }) => state.fail(code))
    return () => { socket.emit('spectator:leave', { broadcastId, userId }); socket.disconnect(); state.reset() }
  }, [broadcastId, userId])

  const exit = () => router.back()
  const round = [...state.events].reverse().find(e => e.payload.type === 'ROUND_STARTED')?.payload.round ?? state.snapshot?.round ?? 0
  const totalRounds = state.snapshot?.totalRounds ?? 5

  return <View style={s.root}>
    <View style={s.topBar}>
      <Text style={s.live}>● LIVE</Text><Text style={s.delay}>30s DELAY</Text>
      <Text style={s.viewers}>◉ {state.viewerCount}/{state.viewerLimit}</Text>
      <TouchableOpacity onPress={exit}><Text style={s.exit}>EXIT</Text></TouchableOpacity>
    </View>

    {state.connectionStatus === 'CONNECTING' && <ActivityIndicator color="#FFD76A" style={{ flex: 1 }} />}
    {state.connectionStatus === 'ENDED' ? <View style={s.center}>
      <Text style={s.ended}>BROADCAST ENDED</Text>
      <Text style={s.muted}>{state.error ? errorMessage(state.error) : 'Thanks for watching'}</Text>
      <TouchableOpacity style={s.button} onPress={exit}><Text style={s.buttonText}>BACK TO LOBBY</Text></TouchableOpacity>
    </View> : <>
      <View style={s.table}>
        <Text style={s.boss}>{state.snapshot?.boss?.name ?? 'HIGH NOBLE LIVE TABLE'}</Text>
        <View style={s.seats}>{(state.snapshot?.players ?? []).map(player => <View key={player.seat} style={s.seat}>
          <Text style={s.cardBack}>♠</Text><Text style={s.player}>{player.displayName}</Text>
        </View>)}</View>
        <Text style={s.pot}>PUBLIC POT  {(state.snapshot?.publicPot.amount ?? 0).toLocaleString('en-US')}</Text>
      </View>
      <ScrollView style={s.timeline} contentContainerStyle={{ padding: 12 }}>
        {state.events.slice(-8).map(event => <Text key={event.eventId} style={s.event}>{eventLabel(event)}</Text>)}
      </ScrollView>
      <View style={s.bottom}><Text style={s.mode}>SPECTATOR MODE</Text><Text style={s.muted}>Broadcast delayed by 30 seconds</Text><Text style={s.round}>Round {String(round)} / {totalRounds}</Text></View>
    </>}
  </View>
}

function eventLabel(event: DelayedSpectatorEvent): string {
  const p = event.payload
  if (p.type === 'PLAYER_RECONNECTING') return `Seat ${Number(p.seat) + 1} is reconnecting…`
  if (p.type === 'AI_TAKEOVER') return `AI Assist has taken control of Seat ${Number(p.seat) + 1}`
  if (p.type === 'ROUND_STARTED') return `Round ${p.round} started`
  if (p.type === 'PILE_RESULT') return `Pile ${p.pile} resolved`
  if (p.type === 'SHOWDOWN_RESULTS') return 'Showdown results revealed'
  return p.type.replaceAll('_', ' ')
}
function errorMessage(code: string): string {
  if (code === 'SPECTATOR_LIMIT_REACHED') return 'This Live Table is full. 10/10 spectators.'
  if (code === 'BROADCAST_ALREADY_ENDED') return 'This broadcast has ended.'
  return 'This broadcast is not available.'
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07150d', paddingTop: 42 }, topBar: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: '#34533d' },
  live: { color: '#ff5a5f', fontWeight: '900' }, delay: { color: '#FFD76A', fontSize: 11, flex: 1 }, viewers: { color: '#F5F2E8' }, exit: { color: '#FF8A8A', fontWeight: '800' },
  table: { flex: 1, margin: 14, borderRadius: 100, borderWidth: 3, borderColor: '#B79236', backgroundColor: '#123d25', alignItems: 'center', justifyContent: 'space-around', padding: 24 }, boss: { color: '#FFD76A', fontWeight: '900' }, seats: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }, seat: { alignItems: 'center' }, cardBack: { color: '#FFD76A', backgroundColor: '#301d3e', borderWidth: 1, borderColor: '#FFD76A', padding: 12, borderRadius: 5 }, player: { color: '#F5F2E8', fontSize: 10, marginTop: 4 }, pot: { color: '#D8D2B7', fontWeight: '700' },
  timeline: { maxHeight: 110, borderTopWidth: 1, borderColor: '#294632' }, event: { color: '#C8C4B0', fontSize: 11, marginBottom: 5 }, bottom: { padding: 16, alignItems: 'center', backgroundColor: '#10291a' }, mode: { color: '#FFD76A', fontWeight: '900' }, muted: { color: '#9F9B8B', marginTop: 5, textAlign: 'center' }, round: { color: '#F5F2E8', marginTop: 5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }, ended: { color: '#FFD76A', fontSize: 22, fontWeight: '900' }, button: { marginTop: 24, padding: 14, borderWidth: 1, borderColor: '#FFD76A', borderRadius: 8 }, buttonText: { color: '#FFD76A', fontWeight: '800' },
})
