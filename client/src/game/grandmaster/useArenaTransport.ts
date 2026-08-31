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
  const [status, setStatus] = useState<'OFFLINE' | 'CONNECTING' | 'QUEUED' | 'MATCHED' | 'INSUFFICIENT_CROWN' | 'ERROR'>('OFFLINE')
  const [connected, setConnected] = useState(false)
  const [queueRoster, setQueueRoster] = useState<Array<{ seat: 1 | 2 | 4; playerId: string; displayName: string; avatar: string }>>([])
  const actionSequence = useRef(1)

  useEffect(() => {
    if (!enabled || !token || !playerId) return
    setStatus('CONNECTING')
    const socket = io(`${SERVER_URL}/arena`, { auth: { token }, transports: ['websocket'], reconnection: true })
    socketRef.current = socket
    socket.on('connect', () => { setConnected(true); socket.emit('arena:queue:join') })
    socket.on('disconnect', () => setConnected(false))
    socket.on('arena:queue:status', (result: { ok: boolean; status?: string }) => setStatus(
      result.ok && result.status === 'MATCHED' ? 'MATCHED'
        : result.ok ? 'QUEUED'
          : result.status === 'INSUFFICIENT_CROWN' ? 'INSUFFICIENT_CROWN' : 'ERROR',
    ))
    socket.on('arena:matched', () => {
      setStatus('MATCHED')
      setQueueRoster([])
      socket.emit('arena:snapshot:request')
    })
    socket.on('arena:queue:roster', setQueueRoster)
    socket.on('arena:match:cancelled', () => setStatus('ERROR'))
    socket.on('arena:snapshot', (wire: WireSnapshot) => {
      applyServerSnapshot(wire)
    })
    socket.on('connect_error', () => { setConnected(false); setStatus('ERROR') })
    return () => { setConnected(false); socket.disconnect(); socketRef.current = null }
  }, [enabled, token, playerId, applyServerSnapshot])

  const sendIntent = useCallback((intent: ArenaClientIntent) => {
    const socket = socketRef.current
    if (!socket || !playerId) return
    const actionId = `${playerId}:${Date.now()}:${actionSequence.current++}`
    const common = { actionId, actorId: playerId }
    if (intent.type === 'DUAL_BOSS_INTRO_ACK') socket.emit('arena:action', { ...common, type: 'DUAL_BOSS_INTRO_ACK' })
    else if (intent.type === 'SAVE_ARRANGEMENT_DRAFT') socket.emit('arena:action', { ...common, type: 'ARRANGE_DRAFT', pile1: intent.pile1, pile2: intent.pile2, pile3: intent.pile3 })
    else if (intent.type === 'SUBMIT_ARRANGEMENT') socket.emit('arena:action', { ...common, type: intent.stage, pile1: intent.pile1, pile2: intent.pile2, pile3: intent.pile3 })
    else if (intent.type === 'AUCTION_BID') socket.emit('arena:action', { ...common, type: intent.round === 'FACE_UP' ? 'FACE_UP_BID' : 'BLIND_BID', amountCrest: intent.amountCrest, cardIndex: intent.cardIndex })
    else if (intent.type === 'JOKER_DECLARE') socket.emit('arena:action', { ...common, ...intent, availableCrest: intent.availableCrest })
    else if (intent.type === 'GF_ACTION') socket.emit('arena:action', { ...common, ...intent })
    else if (intent.type === 'DISCARD') socket.emit('arena:action', { ...common, ...intent })
    else if (intent.type === 'FINAL_LOCK') socket.emit('arena:action', { ...common, ...intent })
  }, [playerId])

  return { status, connected, queueRoster, playerId, sendIntent }
}
