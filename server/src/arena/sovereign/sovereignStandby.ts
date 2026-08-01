import { sovereignConfig } from '../config/sovereignConfig'
import { SovereignStandbyStatus } from '../contracts/sovereignContracts'

export interface SovereignStandbyEntry {
  id: string
  userId: string
  queueSequence: number
  joinedAtServer: string
  status: SovereignStandbyStatus
  connected: boolean
  eligible: boolean
  reservationActive: boolean
  graceExpiresAt: string | null
}

export function canJoinSovereignStandby(now: string, standbyOpenAt: string, checkInCloseAt: string): boolean {
  const nowMs = Date.parse(now)
  const openMs = Date.parse(standbyOpenAt)
  const closeMs = Date.parse(checkInCloseAt)
  if (![nowMs, openMs, closeMs].every(Number.isFinite)) throw new Error('INVALID_STANDBY_WINDOW')
  return nowMs >= openMs && nowMs < closeMs
}

export function beginStandbyDisconnectGrace(entry: SovereignStandbyEntry, now: string): SovereignStandbyEntry {
  if (entry.status !== 'QUEUED') return entry
  const nowMs = Date.parse(now)
  if (!Number.isFinite(nowMs)) throw new Error('INVALID_DISCONNECT_TIME')
  return {
    ...entry,
    status: 'GRACE',
    connected: false,
    graceExpiresAt: new Date(nowMs + sovereignConfig.standbyReconnectGraceMs).toISOString(),
  }
}

export function restoreStandbyConnection(entry: SovereignStandbyEntry, now: string): SovereignStandbyEntry {
  if (entry.status !== 'GRACE' || !entry.graceExpiresAt) throw new Error('STANDBY_NOT_IN_GRACE')
  const nowMs = Date.parse(now)
  if (!Number.isFinite(nowMs)) throw new Error('INVALID_RECONNECT_TIME')
  if (nowMs > Date.parse(entry.graceExpiresAt)) throw new Error('STANDBY_GRACE_EXPIRED')
  return { ...entry, status: 'QUEUED', connected: true, graceExpiresAt: null }
}

export function claimFirstValidStandby(
  entries: readonly SovereignStandbyEntry[],
  now: string,
): { claimed: SovereignStandbyEntry | null; skippedIds: string[] } {
  const nowMs = Date.parse(now)
  if (!Number.isFinite(nowMs)) throw new Error('INVALID_CLAIM_TIME')
  const ordered = [...entries].sort((left, right) => (
    Date.parse(left.joinedAtServer) - Date.parse(right.joinedAtServer)
    || left.queueSequence - right.queueSequence
  ))
  const skippedIds: string[] = []

  for (const entry of ordered) {
    const graceValid = entry.status === 'GRACE'
      && entry.graceExpiresAt !== null
      && nowMs <= Date.parse(entry.graceExpiresAt)
    const valid = (entry.status === 'QUEUED' || graceValid)
      && entry.connected
      && entry.eligible
      && entry.reservationActive
    if (valid) return { claimed: { ...entry, status: 'CLAIMED' }, skippedIds }
    if (entry.status === 'QUEUED' || entry.status === 'GRACE') skippedIds.push(entry.id)
  }
  return { claimed: null, skippedIds }
}
