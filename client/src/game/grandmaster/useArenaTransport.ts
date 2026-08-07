import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../../store/authStore'
import { useUserStore } from '../../../src/store/userStore'
import { ArenaClientIntent, ArenaClientSnapshot } from './arenaClientTypes'
import { useArenaTableStore } from './useArenaTableStore'

type WireSnapshot = ArenaClientSnapshot

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'

export function useArenaTransport(enabled: boolean) {
  const token = useAuthStore(state => state.session?.access_token ?? null)
  const playerId = useUserStore(state => state.userId)
  const applyServerSnapshot = useArenaTableStore(state => state.applyServerSnapshot)
  const socketRef = useRef<Socket | null>(null)
  const [status, setStatus] = useState<'OFFLINE' | 'CONNECTING' | 'QUEUED' | 'MATCHED' | 'ERROR'>('OFFLINE')
  const actionSequence = useRef(1)

  useEffect(() => {
    if (!enabled || !token || !playerId) return
    setStatus('CONNECTING')
    const socket = io(`${SERVER_URL}/arena`, { auth: { token }, transports: ['websocket'], reconnection: true })
    socketRef.current = socket
    socket.on('connect', () => socket.emit('arena:queue:join'))
    socket.on('arena:queue:status', (result: { ok: boolean; status?: string }) => setStatus(result.ok && result.status === 'MATCHED' ? 'MATCHED' : result.ok ? 'QUEUED' : 'ERROR'))
    socket.on('arena:matched', () => {
      setStatus('MATCHED')
      socket.emit('arena:action', { type: 'BUY_IN_RESERVED', actionId: `${playerId}:reserve:${Date.now()}`, actorId: playerId })
      socket.emit('arena:snapshot:request')
    })
    socket.on('arena:snapshot', (wire: WireSnapshot) => {
      applyServerSnapshot(wire)
    })
    socket.on('connect_error', () => setStatus('ERROR'))
    return () => { socket.disconnect(); socketRef.current = null }
  }, [enabled, token, playerId, applyServerSnapshot])

  const sendIntent = useCallback((intent: ArenaClientIntent) => {
    const socket = socketRef.current
    if (!socket || !playerId) return
    const actionId = `${playerId}:${Date.now()}:${actionSequence.current++}`
    const common = { actionId, actorId: playerId }
    if (intent.type === 'SUBMIT_ARRANGEMENT') socket.emit('arena:action', { ...common, type: intent.stage, pile1: intent.pile1, pile2: intent.pile2, pile3: intent.pile3 })
    else if (intent.type === 'AUCTION_BID') socket.emit('arena:action', { ...common, type: intent.round === 'FACE_UP' ? 'FACE_UP_BID' : 'BLIND_BID', amountCrest: intent.amountCrest, cardIndex: intent.cardIndex })
    else if (intent.type === 'JOKER_DECLARE') socket.emit('arena:action', { ...common, ...intent, availableCrest: intent.availableCrest })
    else if (intent.type === 'GF_ACTION') socket.emit('arena:action', { ...common, ...intent })
    else if (intent.type === 'DISCARD') socket.emit('arena:action', { ...common, ...intent })
    else if (intent.type === 'FINAL_LOCK') socket.emit('arena:action', { ...common, ...intent })
  }, [playerId])

  return { status, sendIntent }
}
