import dayjs, { type Dayjs } from 'dayjs'
import { RRule } from 'rrule'

import type { PlannedSession } from './taskSessions'

const frequencyMap = { day: RRule.DAILY, week: RRule.WEEKLY, month: RRule.MONTHLY, year: RRule.YEARLY }
export const RECURRENCE_WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const
export type RecurrenceWeekday = (typeof RECURRENCE_WEEKDAYS)[number]
export type RecurrenceFrequency = keyof typeof frequencyMap
export type TaskRecurrence = {
  frequency: RecurrenceFrequency
  interval: number
  weekdays?: RecurrenceWeekday[]
  monthPattern?: 'date' | 'weekday'
  end: { type: 'never' } | { type: 'on'; date: string } | { type: 'after'; count: number }
}
export type SessionRange = { start: Dayjs; end: Dayjs }
export type SessionOccurrence = PlannedSession & { occurrenceDate?: string }

const dayFormat = 'YYYY-MM-DD'
const dayMilliseconds = 86_400_000
const positiveInteger = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0

function isTaskRecurrence(input: unknown): input is TaskRecurrence {
  if (!input || typeof input !== 'object') return false
  const { frequency, interval, weekdays, monthPattern, end } = input as Partial<TaskRecurrence>
  if (typeof frequency !== 'string' || !Object.hasOwn(frequencyMap, frequency) || !positiveInteger(interval))
    return false
  if (
    weekdays !== undefined &&
    (frequency !== 'week' ||
      !Array.isArray(weekdays) ||
      !weekdays.length ||
      weekdays.some((day) => !RECURRENCE_WEEKDAYS.includes(day)) ||
      new Set(weekdays).size !== weekdays.length)
  )
    return false
  if (monthPattern !== undefined && (frequency !== 'month' || !['date', 'weekday'].includes(monthPattern))) return false
  switch (end?.type) {
    case 'never':
      return true
    case 'after':
      return positiveInteger(end.count)
    case 'on':
      return (
        typeof end.date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(end.date) &&
        dayjs(end.date).format(dayFormat) === end.date
      )
    default:
      return false
  }
}

export function parseTaskRecurrence(value: string): TaskRecurrence {
  const input: unknown = JSON.parse(value)
  if (!isTaskRecurrence(input)) throw new Error('Invalid recurrence rule.')
  return input
}

export const recurrenceWeekday = (date: Dayjs) => RECURRENCE_WEEKDAYS[(date.day() + 6) % 7]

export function nextMatchingStart(start: Dayjs, rule: TaskRecurrence) {
  const weekdays = rule.frequency === 'week' ? rule.weekdays : undefined
  if (!weekdays?.length) return start
  const offset = RECURRENCE_WEEKDAYS.findIndex((_, day) =>
    weekdays.includes(RECURRENCE_WEEKDAYS[(start.day() + 6 + day) % 7]),
  )
  return offset > 0 ? start.add(offset, 'day') : start
}

export const ordinalWeek = (date: Dayjs) => {
  const ordinal = Math.ceil(date.date() / 7)
  return ordinal === 5 ? -1 : ordinal
}

// UTC is a date-only coordinate for the rule. Actual session times are constructed in local time.
const ruleDay = (date: Dayjs) => new Date(`${date.format(dayFormat)}T00:00:00Z`)
const daysBetween = (from: Dayjs, to: Dayjs) => (ruleDay(to).getTime() - ruleDay(from).getTime()) / dayMilliseconds

function shiftStart(start: Date, days: number) {
  if (days) start.setDate(start.getDate() + days)
  return start
}

function shiftSession(session: PlannedSession, days: number): PlannedSession {
  if (!days) return session
  const start = dayjs(shiftStart(session.start.toDate(), days))
  return { ...session, start, end: start.add(session.end.diff(session.start), 'millisecond') }
}

export function validateRecurringSchedule(sessions: PlannedSession[], rule: TaskRecurrence) {
  if (!isTaskRecurrence(rule)) throw new Error('Enter a valid repeat interval, days, and ending.')
  const anchor = sessions[0]?.start
  if (!anchor) throw new Error('Add a timed session to repeat this task.')
  const first = nextMatchingStart(anchor, rule)
  if (rule.end.type === 'on' && rule.end.date < first.format(dayFormat))
    throw new Error('The repeat end date must be on or after the first occurrence.')
  const shift = daysBetween(anchor, first)
  return shift ? sessions.map((session) => shiftSession(session, shift)) : sessions
}

function recurrenceOptions(anchor: Dayjs, rule: TaskRecurrence) {
  const first = nextMatchingStart(anchor, rule)
  const byweekday =
    rule.frequency === 'week'
      ? (rule.weekdays ?? [recurrenceWeekday(first)]).map((day) => RRule[day])
      : rule.frequency === 'month' && rule.monthPattern === 'weekday'
      ? [RRule[recurrenceWeekday(first)].nth(ordinalWeek(first))]
      : undefined
  const fixedDate = rule.frequency === 'year' || (rule.frequency === 'month' && !byweekday)
  return {
    freq: frequencyMap[rule.frequency],
    interval: rule.interval,
    dtstart: ruleDay(first),
    wkst: RRule.MO,
    byweekday,
    bymonth: rule.frequency === 'year' ? first.month() + 1 : undefined,
    bymonthday: fixedDate ? first.date() : undefined,
    count: rule.end.type === 'after' ? rule.end.count : undefined,
    until: rule.end.type === 'on' ? ruleDay(dayjs(rule.end.date)) : undefined,
  }
}

export function getSessionOccurrences(
  sessions: readonly PlannedSession[],
  rule: TaskRecurrence | undefined,
  range: SessionRange,
  firstOnly = false,
): SessionOccurrence[] {
  const overlaps = ({ start, end }: PlannedSession) => start.isBefore(range.end) && end.isAfter(range.start)
  if (!sessions.length || !range.end.isAfter(range.start)) return []
  if (!rule) return sessions.filter(overlaps)

  const anchor = sessions[0].start
  const lookback = sessions.reduce((days, { end }) => Math.max(days, daysBetween(anchor, end)), 0) + 1
  const lower = ruleDay(range.start.subtract(lookback, 'day'))
  const upper = ruleDay(range.end)
  const anchorTime = ruleDay(anchor).getTime()
  const options = recurrenceOptions(anchor, rule)
  const recurrence = new RRule({
    ...options,
    count: firstOnly ? 1 : options.count,
    until: options.until && options.until < upper ? options.until : upper,
  })

  return recurrence
    .between(lower, upper, true)
    .flatMap((date) => {
      const occurrenceDate = date.toISOString().slice(0, 10)
      const offset = (date.getTime() - anchorTime) / dayMilliseconds
      return sessions.map((session) => ({ ...shiftSession(session, offset), occurrenceDate })).filter(overlaps)
    })
    .sort((a, b) => a.start.valueOf() - b.start.valueOf())
}

function periodStart(first: Date, frequency: RecurrenceFrequency, offset: number) {
  const date = new Date(first)
  switch (frequency) {
    case 'day':
      date.setUTCDate(date.getUTCDate() + offset)
      break
    case 'week':
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7) + offset * 7)
      break
    case 'month':
      date.setUTCMonth(date.getUTCMonth() + offset, 1)
      break
    case 'year':
      date.setUTCFullYear(date.getUTCFullYear() + offset, 0, 1)
      break
  }
  return date
}

export async function findConflictingOccurrence(
  sessions: readonly PlannedSession[],
  rule: TaskRecurrence,
  allows: (start: Date, end: Date) => boolean,
) {
  if (!sessions.length) return
  const anchor = sessions[0].start
  const anchorTime = ruleDay(anchor).getTime()
  const options = recurrenceOptions(anchor, rule)
  const first = options.dtstart
  // RRule generates dates through year 9999.
  const last = options.until ?? new Date('9999-12-31T00:00:00Z')
  const interval = Math.min(options.interval, Math.floor((last.getTime() - first.getTime()) / dayMilliseconds) + 2)
  if (interval <= 0 || first > last) return
  const stride = 128 * interval
  const ranges = sessions.map(({ id, start, end }) => ({
    id,
    startTime: start.valueOf(),
    duration: end.diff(start),
  }))
  let count = options.count
  let conflict: PlannedSession | undefined
  let conflictTime = Infinity
  let conflictDay = Infinity
  let sliceStarted = performance.now()
  for (let offset = 0, start = first; start <= last && count !== 0; offset += stride) {
    let next = periodStart(first, rule.frequency, offset + stride)
    if (!Number.isFinite(next.getTime()) || next > last) next = new Date(last.getTime() + dayMilliseconds)
    // Resume on the original rule's period boundary and retain its date filters and remaining count.
    const until = new Date(Math.min(last.getTime(), next.getTime() - 1))
    const dates = new RRule({ ...options, interval, dtstart: start, count, until }, true).all()
    for (const date of dates) {
      if (date.getTime() > conflictDay) return conflict
      const shift = (date.getTime() - anchorTime) / dayMilliseconds
      for (const { id, startTime, duration } of ranges) {
        const start = shiftStart(new Date(startTime), shift)
        if (start.getTime() >= conflictTime) continue
        const end = new Date(start.getTime() + duration)
        if (!allows(start, end)) {
          conflict = { id, start: dayjs(start), end: dayjs(end) }
          conflictTime = start.getTime()
          conflictDay = ruleDay(conflict.start).getTime()
        }
      }
    }
    if (count !== undefined) count -= dates.length
    start = next
    if (start.getTime() > conflictDay) return conflict
    if (start <= last && count !== 0 && performance.now() - sliceStarted >= 12) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      sliceStarted = performance.now()
    }
  }
  return conflict
}
