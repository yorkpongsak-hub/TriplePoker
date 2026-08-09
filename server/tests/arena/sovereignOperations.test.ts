import { createCompressedStagingTimeline, evaluateSovereignAlerts, validateSovereignAdminCommand } from '../../src/arena/sovereign/sovereignOperations'

test('Gate 10.6 operations raises every locked critical alert', () => {
  expect(evaluateSovereignAlerts({ publicDelayMs: 29_999, walletReservedCrest: 360, walletReconciledCrest: 359, activeSeatOccupants: 2, sequenceGap: true, transitionalForMs: 60_001 }))
    .toEqual(['EARLY_PUBLIC_FEED','WALLET_MISMATCH','DOUBLE_SEAT','SEQUENCE_GAP','STUCK_TRANSITION'])
})

test('Gate 10.6 admin commands require audit identity and reason', () => {
  expect(() => validateSovereignAdminCommand({ type: 'ANNUL_REIGN', actorId: 'admin', reason: '', idempotencyKey: 'k' }))
    .toThrow('ADMIN_REASON_REQUIRED')
  expect(() => validateSovereignAdminCommand({ type: 'ANNUL_REIGN', actorId: 'admin', reason: 'fraud confirmed', idempotencyKey: 'k' }))
    .not.toThrow()
})

test('Gate 10.6 staging timeline compresses a cycle into minutes', () => {
  expect(createCompressedStagingTimeline(Date.parse('2026-08-01T00:00:00Z')).matchStartAt).toBe('2026-08-01T00:08:30.000Z')
})
