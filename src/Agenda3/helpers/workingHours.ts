import type { Dayjs } from 'dayjs'

import { minutesToHHmm } from './fullCalendar'
import { findConflictingOccurrence, type TaskRecurrence } from './taskRecurrence'
import { getTaskSessions, sameSession, type PlannedSession } from './taskSessions'

export const WORKING_HOURS_PRESETS = ['workdays', 'weekends', 'custom'] as const
export const ACTIVITY_PRESETS = ['daily', ...WORKING_HOURS_PRESETS] as const

type TimeRange = { start: string; end: string }
type ClockPeriod = [start: number, end: number]
export type BlockedActivity = TimeRange & {
  name: string
  preset: (typeof ACTIVITY_PRESETS)[number]
  customDays: number[]
}

export type WorkingHoursSettings = {
  enabled: boolean
  preset: (typeof WORKING_HOURS_PRESETS)[number]
  customDays: number[]
  ranges: TimeRange[]
  blockedActivities: BlockedActivity[]
}

const weekdays = [0, 1, 2, 3, 4, 5, 6]
const daysByPreset = { daily: weekdays, workdays: [1, 2, 3, 4, 5], weekends: [0, 6] }
const getDays = ({ preset, customDays }: Pick<BlockedActivity, 'preset' | 'customDays'>) =>
  preset === 'custom' ? customDays : daysByPreset[preset]
const minutesPerDay = 1440

export const DEFAULT_WORKING_HOURS: WorkingHoursSettings = {
  enabled: false,
  preset: 'workdays',
  customDays: [1, 2, 3, 4, 5],
  ranges: [
    { start: '08:00', end: '10:00' },
    { start: '18:00', end: '20:00' },
  ],
  blockedActivities: [],
}

function clockMinutes(time: unknown) {
  if (time === '24:00') return minutesPerDay
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
}

const toClockPeriod = ({ start, end }: TimeRange): ClockPeriod => [clockMinutes(start), clockMinutes(end)]

const validClockPeriod = ([start, end]: ClockPeriod) =>
  Number.isFinite(start) && Number.isFinite(end) && start < minutesPerDay && start !== end

function periodsOnDay([start, end]: ClockPeriod, days: number[], day: number): ClockPeriod[] {
  const periods: ClockPeriod[] = []
  if (days.includes(day)) periods.push([start, end < start ? minutesPerDay : end])
  if (end > 0 && end < start && days.includes((day + 6) % 7)) periods.push([0, end])
  return periods
}

export function workingHoursError(settings: WorkingHoursSettings) {
  if (settings.preset === 'custom' && !settings.customDays.length) return 'Select at least one working day.'
  const ranges = settings.ranges.map(toClockPeriod)
  if (!ranges.length || ranges.some((range) => !validClockPeriod(range))) {
    return 'Each work period needs different start and end times.'
  }
  const days = getDays(settings)
  for (const day of weekdays) {
    const segments = ranges.flatMap((range) => periodsOnDay(range, days, day)).sort((a, b) => a[0] - b[0])
    if (segments.some(([start], index) => index > 0 && start < segments[index - 1][1])) {
      return 'Working periods cannot overlap.'
    }
  }
}

const validDays = (days: unknown) =>
  Array.isArray(days) && days.every((day) => typeof day === 'number' && weekdays.includes(day))

export function blockedActivityError(activity: BlockedActivity) {
  if (typeof activity?.name !== 'string' || !activity.name.trim()) return 'Enter a name for each blocked activity.'
  if (
    !ACTIVITY_PRESETS.includes(activity.preset) ||
    !validDays(activity.customDays) ||
    (activity.preset === 'custom' && !activity.customDays.length)
  )
    return 'Select at least one day for each blocked activity.'

  if (!validClockPeriod(toClockPeriod(activity))) {
    return 'Each blocked activity needs different start and end times.'
  }
}

export function readWorkingHours(value?: string): WorkingHoursSettings {
  if (!value) return DEFAULT_WORKING_HOURS
  try {
    const settings = JSON.parse(value) as WorkingHoursSettings
    if (
      typeof settings?.enabled === 'boolean' &&
      WORKING_HOURS_PRESETS.includes(settings.preset) &&
      validDays(settings.customDays) &&
      Array.isArray(settings.ranges) &&
      !workingHoursError(settings)
    ) {
      return {
        ...settings,
        blockedActivities: Array.isArray(settings.blockedActivities)
          ? settings.blockedActivities.filter((activity) => !blockedActivityError(activity))
          : [],
      }
    }
  } catch {
    // Settings may have been edited outside Agenda.
  }
  return DEFAULT_WORKING_HOURS
}

function compileDay(settings: WorkingHoursSettings, day: number) {
  const workdays = getDays(settings)
  const workPeriods = settings.enabled
    ? settings.ranges.flatMap((range) => periodsOnDay(toClockPeriod(range), workdays, day))
    : [[0, minutesPerDay]]

  const activities = settings.blockedActivities.flatMap((activity) =>
    periodsOnDay(toClockPeriod(activity), getDays(activity), day).map(([start, end]) => ({
      start,
      end,
      name: activity.name.trim(),
    })),
  )
  const boundaries = [
    ...new Set([0, minutesPerDay, ...workPeriods.flat(), ...activities.flatMap(({ start, end }) => [start, end])]),
  ].sort((a, b) => a - b)
  const available: [number, number][] = []
  const blocked: { from: number; to: number; label: string }[] = []

  for (const [index, from] of boundaries.slice(0, -1).entries()) {
    const to = boundaries[index + 1]
    const label = [
      ...new Set(activities.filter(({ start, end }) => start <= from && to <= end).map(({ name }) => name)),
    ].join(' · ')
    if (!label && workPeriods.some(([start, end]) => start <= from && to <= end)) {
      const previous = available.at(-1)
      if (previous?.[1] === from * 60_000) previous[1] = to * 60_000
      else available.push([from * 60_000, to * 60_000])
    } else {
      const previous = blocked.at(-1)
      if (previous?.to === from && previous.label === label) previous.to = to
      else blocked.push({ from, to, label })
    }
  }
  return { available, blocked }
}

function clockMilliseconds(date: Date) {
  return ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000 + date.getMilliseconds()
}

function offsetChange(start: number, end: number, offset: number) {
  while (end - start > 1) {
    const mid = start + Math.floor((end - start) / 2)
    if (new Date(mid).getTimezoneOffset() === offset) start = mid
    else end = mid
  }
  return end
}

export function getWorkingHours(settings: WorkingHoursSettings) {
  if (!settings.enabled && !settings.blockedActivities.length) return
  const schedule = weekdays.map((day) => compileDay(settings, day))
  const blockedPeriods = schedule.flatMap(({ blocked }, day) =>
    blocked.map(({ from, to, label }) => ({
      day,
      start: minutesToHHmm(from),
      end: minutesToHHmm(to),
      label,
    })),
  )

  const coversClockRange = (available: [number, number][], first: Date, last: Date) => {
    const left = clockMilliseconds(first)
    const right = clockMilliseconds(last) + 1
    return available.some(([start, end]) => start <= left && right <= end)
  }

  const allows = (start: Date, end: Date) => {
    let from = start.getTime()
    const through = end.getTime()
    if (!(from < through)) return false
    const lastInstant = new Date(through - 1)
    let first = start
    while (from < through) {
      const { available } = schedule[first.getDay()]
      if (!available.length) return false
      const offset = first.getTimezoneOffset()
      if (
        first.getDate() === lastInstant.getDate() &&
        first.getMonth() === lastInstant.getMonth() &&
        first.getFullYear() === lastInstant.getFullYear() &&
        offset === lastInstant.getTimezoneOffset()
      ) {
        return coversClockRange(available, first, lastInstant)
      }
      const midnight = new Date(from).setHours(24, 0, 0, 0)
      let until = Math.min(midnight, through)
      let last = new Date(until - 1)
      // On clock-change days, check each uninterrupted part of the local clock separately.
      if (offset !== last.getTimezoneOffset()) {
        until = offsetChange(from, until - 1, offset)
        last = new Date(until - 1)
      }
      if (!coversClockRange(available, first, last)) return false
      from = until
      first = new Date(from)
    }
    return true
  }
  return { blockedPeriods, allows, fullWeek: !blockedPeriods.length }
}

type TaskSchedule = { sessions: readonly PlannedSession[]; recurrence?: TaskRecurrence }
export type ScheduleValidator = (next: TaskSchedule, previous?: TaskSchedule) => Promise<void>

export function getTaskSchedule(
  task: Parameters<typeof getTaskSessions>[0] & { recurrence?: TaskRecurrence },
): TaskSchedule {
  const sessions = getTaskSessions(task)
  if (task.sessions === undefined && !task.allDay && task.start && task.end) {
    return { sessions: [{ id: 'scheduled', start: task.start, end: task.end.add(1, 'day') }] }
  }
  return { sessions, recurrence: task.recurrence }
}

export function validateWorkingHours(
  hours: NonNullable<ReturnType<typeof getWorkingHours>>,
  conflictMessage: (start: Dayjs) => string,
): ScheduleValidator {
  return async (next, previous) => {
    if (hours.fullWeek || !next.sessions.length) return
    const changed = next.sessions.filter(
      (session) =>
        !sameSession(
          session,
          previous?.sessions.find(({ id }) => id === session.id),
        ),
    )
    if (next.recurrence) {
      const sameAnchor = next.sessions[0]?.start.valueOf() === previous?.sessions[0]?.start.valueOf()
      if (!changed.length && sameAnchor && JSON.stringify(next.recurrence) === JSON.stringify(previous?.recurrence))
        return
      const conflict = await findConflictingOccurrence(next.sessions, next.recurrence, hours.allows)
      if (conflict) throw new Error(conflictMessage(conflict.start))
      return
    }
    for (const { start, end } of changed) {
      if (!hours.allows(start.toDate(), end.toDate())) throw new Error(conflictMessage(start))
    }
  }
}
