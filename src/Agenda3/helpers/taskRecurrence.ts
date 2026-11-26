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

function shiftSession(session: PlannedSession, days: number): PlannedSession {
  if (!days) return session
  const start = session.start.add(days, 'day')
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
  const first = nextMatchingStart(anchor, rule)
  const lookback = sessions.reduce((days, { end }) => Math.max(days, daysBetween(anchor, end)), 0) + 1
  const lower = ruleDay(range.start.subtract(lookback, 'day'))
  const upper = ruleDay(range.end)
  const ruleEnd = rule.end.type === 'on' ? ruleDay(dayjs(rule.end.date)) : undefined
  const anchorTime = ruleDay(anchor).getTime()
  const byweekday =
    rule.frequency === 'week'
      ? (rule.weekdays ?? [recurrenceWeekday(first)]).map((day) => RRule[day])
      : rule.frequency === 'month' && rule.monthPattern === 'weekday'
      ? [RRule[recurrenceWeekday(first)].nth(ordinalWeek(first))]
      : undefined
  const recurrence = new RRule({
    freq: frequencyMap[rule.frequency],
    interval: rule.interval,
    dtstart: ruleDay(first),
    wkst: RRule.MO,
    byweekday,
    count: firstOnly ? 1 : rule.end.type === 'after' ? rule.end.count : undefined,
    until: ruleEnd && ruleEnd < upper ? ruleEnd : upper,
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
