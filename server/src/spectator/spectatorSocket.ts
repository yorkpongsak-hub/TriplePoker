import { Server, Socket } from 'socket.io'
import { SpectatorService } from './spectatorService'

export function registerSpectatorSocket(io: Server): SpectatorService {
  const service = new SpectatorService((broadcastId, event) => {
    io.to(`broadcast:${broadcastId}:spectators`).emit('spectator:event', event)
    if (event.payload.type === 'BROADCAST_ENDED') io.to(`broadcast:${broadcastId}:spectators`).emit('spectator:broadcast-ended', event.payload)
  })

  io.on('connection', (socket: Socket) => {
    const memberships = new Map<string, string>()
    socket.on('spectator:list', (data: { tierId?: string } = {}) => socket.emit('spectator:tables', service.list(data.tierId)))
    socket.on('spectator:join', (data: { broadcastId: string; userId: string }) => {
      try {
        const timeline = service.join(data.broadcastId, data.userId)
        memberships.set(data.broadcastId, data.userId)
        socket.join(`broadcast:${data.broadcastId}:spectators`)
        if (timeline.snapshot) socket.emit('spectator:snapshot', timeline.snapshot)
        timeline.replay.forEach(event => socket.emit('spectator:event', event))
        io.to(`broadcast:${data.broadcastId}:spectators`).emit('spectator:viewer-count', { viewerCount: timeline.viewerCount, viewerLimit: timeline.viewerLimit })
      } catch (error) {
        socket.emit('spectator:error', { code: error instanceof Error ? error.message : 'SPECTATOR_CONNECTION_FAILED' })
      }
    })
    socket.on('spectator:leave', (data: { broadcastId: string; userId: string }) => {
      socket.leave(`broadcast:${data.broadcastId}:spectators`)
      memberships.delete(data.broadcastId)
      const viewerCount = service.leave(data.broadcastId, data.userId)
      io.to(`broadcast:${data.broadcastId}:spectators`).emit('spectator:viewer-count', { viewerCount })
    })
    socket.on('disconnect', () => memberships.forEach((userId, broadcastId) => service.leave(broadcastId, userId)))
  })
  return service
}
