import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../../../src/store/authStore'
import { useUserStore } from '../../../src/store/userStore'
import { ArenaClientIntent, ArenaClientSnapshot } from './arenaClientTypes'
import { useArenaTableStore } from './useArenaTableStore'

interface WireSnapshot {
  matchId: string
  phase: ArenaClientSnapshot['phase']
  gameNumber: 0 | 1 | 2 | 3
  version: number
  deadlineAt: number | null
}

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'

export function useArenaTransport(enabled: boolean, fallback: ArenaClientSnapshot) {
  const token = useAuthStore(state => state.session?.access_token ?? null)
  const playerId = useUserStore(state => state.userId)
  const applyServerSnapshot = useArenaTableStore(state => state.applyServerSnapshot)
  const socketRef = useRef<Socket | null>(null)
  const seatsRef = useRef<ArenaClientSnapshot['seats'] | null>(null)
  const [status, setStatus] = useState<'OFFLINE' | 'CONNECTING' | 'QUEUED' | 'MATCHED' | 'ERROR'>('OFFLINE')
  const actionSequence = useRef(1)

  useEffect(() => {
    if (!enabled || !token || !playerId) return
    setStatus('CONNECTING')
    const socket = io(`${SERVER_URL}/arena`, { auth: { token }, transports: ['websocket'], reconnection: true })
    socketRef.current = socket
    socket.on('connect', () => socket.emit('arena:queue:join'))
    socket.on('arena:queue:status', (result: { ok: boolean; status?: string }) => setStatus(result.ok && result.status === 'MATCHED' ? 'MATCHED' : result.ok ? 'QUEUED' : 'ERROR'))
    socket.on('arena:matched', (payload: { composition: { seats: Array<{ seat: 1 | 2 | 3 | 4; controller: 'HUMAN' | 'AI'; playerId?: string; aiId?: string; role: string }> } }) => {
      setStatus('MATCHED')
      seatsRef.current = payload.composition.seats.map(seat => {
        const local = seat.controller === 'HUMAN' && seat.playerId === playerId
        const name = seat.controller === 'AI' ? (seat.aiId ?? 'Arena AI').replaceAll('_', ' ') : local ? 'You' : `Grandmaster ${seat.seat}`
        return { seat: seat.seat, playerId: seat.playerId ?? `ai:${seat.aiId}:seat${seat.seat}`, displayName: name, avatar: seat.controller === 'AI' ? '♛' : '♠', isLocal: local, isBoss: seat.role === 'BOSS', isCurrentTurn: false, connection: 'CONNECTED', cards: [], cardCount: 0, crownCrest: 0 }
      })
      socket.emit('arena:action', { type: 'BUY_IN_RESERVED', actionId: `${playerId}:reserve:${Date.now()}`, actorId: playerId })
      socket.emit('arena:snapshot:request')
    })
    socket.on('arena:snapshot', (wire: WireSnapshot) => {
      applyServerSnapshot({ ...fallback, matchId: wire.matchId, phase: wire.phase, gameNumber: wire.gameNumber, version: wire.version, phaseEndsAt: wire.deadlineAt, seats: seatsRef.current ?? fallback.seats })
    })
    socket.on('connect_error', () => setStatus('ERROR'))
    return () => { socket.disconnect(); socketRef.current = null }
  }, [enabled, token, playerId, applyServerSnapshot, fallback])

  const sendIntent = useCallback((intent: ArenaClientIntent) => {
    const socket = socketRef.current
    if (!socket || !playerId) return
    const actionId = `${playerId}:${Date.now()}:${actionSequence.current++}`
    const common = { actionId, actorId: playerId }
    if (intent.type === 'SUBMIT_ARRANGEMENT') socket.emit('arena:action', { ...common, type: intent.stage, arrangementHash: intent.arrangementHash })
    else if (intent.type === 'AUCTION_BID') socket.emit('arena:action', { ...common, type: intent.round === 'FACE_UP' ? 'FACE_UP_BID' : 'BLIND_BID', amountCrest: intent.amountCrest, cardIndex: intent.cardIndex })
    else if (intent.type === 'JOKER_DECLARE') socket.emit('arena:action', { ...common, ...intent, availableCrest: intent.availableCrest })
    else if (intent.type === 'GF_ACTION') socket.emit('arena:action', { ...common, ...intent })
    else if (intent.type === 'DISCARD') socket.emit('arena:action', { ...common, ...intent })
    else if (intent.type === 'FINAL_LOCK') socket.emit('arena:action', { ...common, ...intent })
  }, [playerId])

  return { status, sendIntent }
}
