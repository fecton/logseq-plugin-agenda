import type { Dayjs } from 'dayjs'

import { findConflictingOccurrence, type TaskRecurrence } from './taskRecurrence'
import { getTaskSessions, sameSession, type PlannedSession } from './taskSessions'

export type WorkingHoursSettings = {
  enabled: boolean
  preset: 'workdays' | 'weekends' | 'custom'
  customDays: number[]
  ranges: { start: string; end: string }[]
}

export const DEFAULT_WORKING_HOURS: WorkingHoursSettings = {
  enabled: false,
  preset: 'workdays',
  customDays: [1, 2, 3, 4, 5],
  ranges: [
    { start: '08:00', end: '10:00' },
    { start: '18:00', end: '20:00' },
  ],
}

export const WORKING_HOURS_PRESETS = ['workdays', 'weekends', 'custom'] as const

function clockMinutes(time: unknown) {
  if (time === '24:00') return 1440
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
}

export function workingHoursError(settings: WorkingHoursSettings) {
  if (settings.preset === 'custom' && !settings.customDays.length) return 'Select at least one working day.'
  const ranges = settings.ranges.map(({ start, end }) => [clockMinutes(start), clockMinutes(end)])
  if (!ranges.length || ranges.some(([start, end]) => !(start < end))) {
    return 'Each working period needs a start time before its end time.'
  }
  ranges.sort((a, b) => a[0] - b[0])
  if (ranges.some(([start], index) => index > 0 && start < ranges[index - 1][1])) {
    return 'Working periods cannot overlap.'
  }
}

export function readWorkingHours(value?: string): WorkingHoursSettings {
  if (!value) return DEFAULT_WORKING_HOURS
  try {
    const settings = JSON.parse(value) as WorkingHoursSettings
    if (
      typeof settings?.enabled === 'boolean' &&
      WORKING_HOURS_PRESETS.includes(settings.preset) &&
      Array.isArray(settings.customDays) &&
      settings.customDays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) &&
      Array.isArray(settings.ranges) &&
      !workingHoursError(settings)
    ) {
      return settings
    }
  } catch {
    // Settings may have been edited outside Agenda.
  }
  return DEFAULT_WORKING_HOURS
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
  if (!settings.enabled) return
  const daysOfWeek =
    settings.preset === 'custom' ? settings.customDays : settings.preset === 'workdays' ? [1, 2, 3, 4, 5] : [0, 6]
  const ranges: WorkingHoursSettings['ranges'] = []
  for (const range of [...settings.ranges].sort((a, b) => a.start.localeCompare(b.start))) {
    const previous = ranges.at(-1)
    if (previous?.end === range.start) previous.end = range.end
    else ranges.push({ ...range })
  }
  const businessHours = ranges.map(({ start, end }) => ({ startTime: start, endTime: end, daysOfWeek }))
  const boundaries = ranges.map(({ start, end }) => [clockMinutes(start) * 60_000, clockMinutes(end) * 60_000])
  const fullWeek =
    new Set(daysOfWeek).size === 7 && ranges.length === 1 && ranges[0].start === '00:00' && ranges[0].end === '24:00'

  const coversClockRange = (first: Date, last: Date) => {
    const left = clockMilliseconds(first)
    const right = clockMilliseconds(last) + 1
    return boundaries.some(([start, end]) => start <= left && right <= end)
  }

  const allows = (start: Date, end: Date) => {
    let from = start.getTime()
    const through = end.getTime()
    if (!(from < through)) return false
    const lastInstant = new Date(through - 1)
    let first = start
    while (from < through) {
      if (!daysOfWeek.includes(first.getDay())) return false
      const offset = first.getTimezoneOffset()
      if (
        first.getDate() === lastInstant.getDate() &&
        first.getMonth() === lastInstant.getMonth() &&
        first.getFullYear() === lastInstant.getFullYear() &&
        offset === lastInstant.getTimezoneOffset()
      ) {
        return coversClockRange(first, lastInstant)
      }
      const midnight = new Date(from).setHours(24, 0, 0, 0)
      let until = Math.min(midnight, through)
      let last = new Date(until - 1)
      // On clock-change days, check each uninterrupted part of the local clock separately.
      if (offset !== last.getTimezoneOffset()) {
        until = offsetChange(from, until - 1, offset)
        last = new Date(until - 1)
      }
      if (!coversClockRange(first, last)) return false
      from = until
      first = new Date(from)
    }
    return true
  }
  return { businessHours, allows, fullWeek }
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
