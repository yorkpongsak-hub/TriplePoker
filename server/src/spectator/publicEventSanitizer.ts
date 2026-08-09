import { SpectatorEvent } from './spectatorTypes'

const PUBLIC_EVENT_TYPES = new Set([
  'MATCH_CREATED', 'PLAYER_JOINED', 'BOSS_REVEALED', 'ROUND_STARTED',
  'CENTER_CARD_REVEALED', 'PLAYER_ACTION_CONFIRMED', 'PILE_REVEALED',
  'PILE_RESULT', 'SHOWDOWN_RESULTS', 'PLAYER_RECONNECTING', 'AI_TAKEOVER',
  'MATCH_FINISHED', 'BROADCAST_ENDED',
])

const FORBIDDEN_KEYS = new Set([
  'cards', 'hand', 'hands', 'arrangement', 'dragPosition', 'autoSort',
  'deck', 'deckOrder', 'remainingDeck', 'rngSeed', 'seed', 'privateTimer',
  'networkStatus', 'disconnectedAt', 'hiddenCenterCards', 'debug', 'metadata',
])

function containsForbiddenKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(containsForbiddenKey)
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => FORBIDDEN_KEYS.has(key) || containsForbiddenKey(nested),
  )
}

/** Fail closed: unknown event types and payloads containing private-state keys never leave the server. */
export function sanitizePublicEvent(value: unknown): SpectatorEvent | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.type !== 'string' || !PUBLIC_EVENT_TYPES.has(candidate.type)) return null
  if (containsForbiddenKey(candidate)) return null
  return JSON.parse(JSON.stringify(candidate)) as SpectatorEvent
}
