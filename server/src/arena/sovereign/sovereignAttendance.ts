import { sovereignConfig } from '../config/sovereignConfig'
import { SovereignCheckInStatus, SovereignSeatConfirmation } from '../contracts/sovereignContracts'

export interface ConfirmationDecision {
  status: SovereignSeatConfirmation
  confirmedAt: string | null
}

export interface ReserveOfferWindow {
  offeredAt: string
  expiresAt: string
}

function timestamp(value: string, code: string): number {
  const result = Date.parse(value)
  if (!Number.isFinite(result)) throw new Error(code)
  return result
}

export function confirmSovereignSeat(
  currentStatus: SovereignSeatConfirmation,
  now: string,
  confirmationDeadlineAt: string,
): ConfirmationDecision {
  if (currentStatus === 'CONFIRMED') return { status: 'CONFIRMED', confirmedAt: null }
  if (currentStatus !== 'PENDING') throw new Error('SEAT_NOT_CONFIRMABLE')
  const nowMs = timestamp(now, 'INVALID_CONFIRMATION_TIME')
  const deadlineMs = timestamp(confirmationDeadlineAt, 'INVALID_CONFIRMATION_DEADLINE')
  if (nowMs > deadlineMs) throw new Error('CONFIRMATION_DEADLINE_PASSED')
  return { status: 'CONFIRMED', confirmedAt: new Date(nowMs).toISOString() }
}

export function expireSovereignConfirmation(
  currentStatus: SovereignSeatConfirmation,
  now: string,
  confirmationDeadlineAt: string,
): SovereignSeatConfirmation {
  if (currentStatus !== 'PENDING') return currentStatus
  return timestamp(now, 'INVALID_CONFIRMATION_TIME') > timestamp(confirmationDeadlineAt, 'INVALID_CONFIRMATION_DEADLINE')
    ? 'CONFIRMATION_EXPIRED'
    : 'PENDING'
}

export function createReserveOfferWindow(now: string, standbyOpenAt: string): ReserveOfferWindow {
  const nowMs = timestamp(now, 'INVALID_RESERVE_OFFER_TIME')
  const standbyMs = timestamp(standbyOpenAt, 'INVALID_STANDBY_OPEN_TIME')
  if (nowMs >= standbyMs) throw new Error('PRE_EVENT_RESERVE_CLOSED')
  const expiresAtMs = Math.min(nowMs + sovereignConfig.reserveOfferDurationMs, standbyMs)
  return { offeredAt: new Date(nowMs).toISOString(), expiresAt: new Date(expiresAtMs).toISOString() }
}

export function checkInSovereignSeat(
  currentStatus: SovereignCheckInStatus,
  now: string,
  checkInOpenAt: string,
  checkInCloseAt: string,
): SovereignCheckInStatus {
  if (currentStatus === 'CHECKED_IN') return currentStatus
  if (currentStatus !== 'PENDING') throw new Error('SEAT_NOT_CHECK_IN_ELIGIBLE')
  const nowMs = timestamp(now, 'INVALID_CHECK_IN_TIME')
  const openMs = timestamp(checkInOpenAt, 'INVALID_CHECK_IN_OPEN')
  const closeMs = timestamp(checkInCloseAt, 'INVALID_CHECK_IN_CLOSE')
  if (nowMs < openMs) throw new Error('CHECK_IN_NOT_OPEN')
  if (nowMs >= closeMs) throw new Error('CHECK_IN_CLOSED')
  return 'CHECKED_IN'
}

export function markSovereignNoShow(
  currentStatus: SovereignCheckInStatus,
  now: string,
  checkInCloseAt: string,
): SovereignCheckInStatus {
  if (currentStatus !== 'PENDING') return currentStatus
  return timestamp(now, 'INVALID_NO_SHOW_TIME') >= timestamp(checkInCloseAt, 'INVALID_CHECK_IN_CLOSE')
    ? 'NO_SHOW'
    : 'PENDING'
}
