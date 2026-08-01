import { createSovereignCycleSchedule } from '../../src/arena/sovereign/sovereignSchedule'

describe('Gate 10.2 Sovereign monthly schedule', () => {
  test('uses the last Friday and permits the weekend to cross into the next month', () => {
    const schedule = createSovereignCycleSchedule(2026, 10)

    expect(schedule.yearMonth).toBe('2026-10')
    expect(schedule.scoringStartAt).toBe('2026-09-30T17:00:01.000Z')
    expect(schedule.scoringEndAt).toBe('2026-10-25T11:00:00.000Z')
    expect(schedule.announcementAt).toBe('2026-10-25T13:00:00.000Z')
    expect(schedule.confirmationDeadlineAt).toBe('2026-10-28T16:59:59.000Z')
    expect(schedule.matches.map(match => match.localDate)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ])
    expect(schedule.matches[0].startAt).toBe('2026-10-30T13:05:30.000Z')
  })

  test('uses the last Friday even when all event days remain inside the month', () => {
    const schedule = createSovereignCycleSchedule(2026, 8)
    expect(schedule.matches.map(match => match.localDate)).toEqual([
      '2026-08-28',
      '2026-08-29',
      '2026-08-30',
    ])
  })

  test('rejects invalid cycle input', () => {
    expect(() => createSovereignCycleSchedule(2026, 0)).toThrow('INVALID_CYCLE_MONTH')
    expect(() => createSovereignCycleSchedule(1999, 1)).toThrow('INVALID_CYCLE_YEAR')
  })
})
