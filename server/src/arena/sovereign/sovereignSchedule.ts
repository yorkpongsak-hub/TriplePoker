import { sovereignConfig } from '../config/sovereignConfig'
import { SovereignEventDay } from '../contracts/sovereignContracts'

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1_000

export interface SovereignScheduledMatch {
  eventDay: SovereignEventDay
  localDate: string
  standbyOpenAt: string
  checkInOpenAt: string
  checkInCloseAt: string
  startAt: string
}

export interface SovereignCycleSchedule {
  yearMonth: string
  timezone: 'Asia/Bangkok'
  scoringStartAt: string
  scoringEndAt: string
  announcementAt: string
  confirmationDeadlineAt: string
  matches: readonly SovereignScheduledMatch[]
}

function assertYearMonth(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error('INVALID_CYCLE_YEAR')
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('INVALID_CYCLE_MONTH')
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1_000)
}

function localDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function bangkokLocalToUtc(localDate: Date, localTime: string): string {
  const match = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?$/.exec(localTime)
  if (!match) throw new Error('INVALID_LOCAL_TIME')
  const [, hours, minutes, seconds, milliseconds = '000'] = match
  const utcMs = Date.UTC(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth(),
    localDate.getUTCDate(),
    Number(hours),
    Number(minutes),
    Number(seconds),
    Number(milliseconds),
  ) - BANGKOK_OFFSET_MS
  return new Date(utcMs).toISOString()
}

export function createSovereignCycleSchedule(year: number, month: number): SovereignCycleSchedule {
  assertYearMonth(year, month)

  const firstDay = new Date(Date.UTC(year, month - 1, 1))
  const lastDay = new Date(Date.UTC(year, month, 0))
  const daysBackToFriday = (lastDay.getUTCDay() - 5 + 7) % 7
  const friday = addUtcDays(lastDay, -daysBackToFriday)
  const saturday = addUtcDays(friday, 1)
  const sunday = addUtcDays(friday, 2)
  const cutoffSunday = addUtcDays(friday, -5)
  const confirmationWednesday = addUtcDays(friday, -2)

  const eventDates: ReadonlyArray<[SovereignEventDay, Date]> = [
    ['FRIDAY', friday],
    ['SATURDAY', saturday],
    ['SUNDAY', sunday],
  ]

  return {
    yearMonth: `${year}-${String(month).padStart(2, '0')}`,
    timezone: sovereignConfig.timezone,
    scoringStartAt: bangkokLocalToUtc(firstDay, sovereignConfig.scoringOpenLocal),
    scoringEndAt: bangkokLocalToUtc(cutoffSunday, sovereignConfig.scoringCloseLocal),
    announcementAt: bangkokLocalToUtc(cutoffSunday, sovereignConfig.publishLocal),
    confirmationDeadlineAt: bangkokLocalToUtc(
      confirmationWednesday,
      sovereignConfig.confirmationDeadlineLocal,
    ),
    matches: eventDates.map(([eventDay, date]) => ({
      eventDay,
      localDate: localDateString(date),
      standbyOpenAt: bangkokLocalToUtc(date, sovereignConfig.standbyOpenLocal),
      checkInOpenAt: bangkokLocalToUtc(date, sovereignConfig.checkInOpenLocal),
      checkInCloseAt: bangkokLocalToUtc(date, sovereignConfig.checkInCloseLocal),
      startAt: bangkokLocalToUtc(date, sovereignConfig.matchStartLocal),
    })),
  }
}
