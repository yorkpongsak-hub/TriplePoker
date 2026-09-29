export type RateState = { count: number; resetAt: number }

export function takeRate(
  store: Map<string, RateState>, key: string, limit: number, windowMs: number, now = Date.now(),
): boolean {
  if (store.size > 10_000) {
    for (const [storedKey, value] of store) if (value.resetAt <= now) store.delete(storedKey)
  }
  const current = store.get(key)
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (current.count >= limit) return false
  current.count += 1
  return true
}

export function buildOriginPolicy(configuredOrigins: string, production: boolean) {
  const configured = new Set(configuredOrigins.split(',').map(value => value.trim()).filter(Boolean))
  const development = new Set(['http://localhost:8081', 'http://localhost:19006', 'http://127.0.0.1:8081'])
  return (origin?: string): boolean => !origin || configured.has(origin) || (!production && development.has(origin))
}

export function validateSocketPacket(authUserId: unknown, data: unknown): string | undefined {
  if (typeof authUserId !== 'string' || !authUserId) return 'UNAUTHORIZED'
  if (!data || typeof data !== 'object') return undefined
  const packet = data as Record<string, unknown>
  for (const field of ['userId', 'playerId'] as const) {
    if (packet[field] !== undefined && packet[field] !== authUserId) return 'FORBIDDEN_IDENTITY'
  }
  if (packet.roomId !== undefined) {
    if (typeof packet.roomId !== 'string' || packet.roomId.length < 1 || packet.roomId.length > 160 || !/^[A-Za-z0-9:_-]+$/.test(packet.roomId)) {
      return 'INVALID_ROOM_ID'
    }
  }
  return undefined
}
