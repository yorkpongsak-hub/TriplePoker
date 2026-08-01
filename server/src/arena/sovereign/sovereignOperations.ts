export type SovereignAlertCode = 'EARLY_PUBLIC_FEED' | 'WALLET_MISMATCH' | 'DOUBLE_SEAT' | 'SEQUENCE_GAP' | 'STUCK_TRANSITION'

export interface SovereignOperationalSample {
  publicDelayMs?: number
  walletReservedCrest?: number
  walletReconciledCrest?: number
  activeSeatOccupants?: number
  sequenceGap?: boolean
  transitionalForMs?: number
}

export function evaluateSovereignAlerts(sample: SovereignOperationalSample): SovereignAlertCode[] {
  const alerts: SovereignAlertCode[] = []
  if (sample.publicDelayMs !== undefined && sample.publicDelayMs < 30_000) alerts.push('EARLY_PUBLIC_FEED')
  if (sample.walletReservedCrest !== undefined && sample.walletReconciledCrest !== sample.walletReservedCrest) alerts.push('WALLET_MISMATCH')
  if ((sample.activeSeatOccupants ?? 0) > 1) alerts.push('DOUBLE_SEAT')
  if (sample.sequenceGap) alerts.push('SEQUENCE_GAP')
  if ((sample.transitionalForMs ?? 0) > 60_000) alerts.push('STUCK_TRANSITION')
  return alerts
}

export interface SovereignAdminCommand {
  type: 'PREVIEW_CYCLE' | 'PUBLISH_SELECTION' | 'DISQUALIFY' | 'RESCHEDULE' | 'CANCEL_EVENT' | 'ANNUL_REIGN'
  actorId: string
  reason: string
  idempotencyKey: string
}

export function validateSovereignAdminCommand(command: SovereignAdminCommand): void {
  if (!command.actorId || !command.idempotencyKey) throw new Error('ADMIN_COMMAND_IDENTITY_REQUIRED')
  if (command.type !== 'PREVIEW_CYCLE' && command.reason.trim().length < 5) throw new Error('ADMIN_REASON_REQUIRED')
}

export function createCompressedStagingTimeline(nowMs: number): Record<string, string> {
  if (!Number.isFinite(nowMs)) throw new Error('INVALID_STAGING_TIME')
  const at = (minutes: number) => new Date(nowMs + minutes * 60_000).toISOString()
  return { scoringStartAt: at(0), scoringEndAt: at(2), announcementAt: at(3), confirmationDeadlineAt: at(5), standbyOpenAt: at(6), checkInOpenAt: at(7), checkInCloseAt: at(8), matchStartAt: at(8.5) }
}
