import dayjs from 'dayjs'

import type { AgendaEntity } from '@/types/entity'

import { getSessionOccurrences } from './taskRecurrence'
import { getTaskSessions } from './taskSessions'

export type TaskTimeInput = Parameters<typeof getTaskSessions>[0] & Pick<AgendaEntity, 'timeLogs' | 'recurrence'>
export type TaskTimeTotals = { sessionMinutes?: number; manualLogMinutes: number; actualMinutes?: number }

/** Actual is allocated session time plus manual logs, including future/overlapping log entries. */
export function getTaskTimeTotals(task: TaskTimeInput, day?: string): TaskTimeTotals {
  // Completion-history projections reuse the parent block's logs; never count them again.
  if (task.recurringPast) return { sessionMinutes: 0, manualLogMinutes: 0, actualMinutes: 0 }
  const manualLogMinutes = (task.timeLogs ?? [])
    .filter((log) => !day || log.start.format('YYYY-MM-DD') === day)
    .reduce((sum, log) => sum + log.amount, 0)
  if (task.sessionsError) return { manualLogMinutes }
  const sessions = getTaskSessions(task)
  const dayStart = day && task.recurrence ? dayjs(day) : undefined
  const displayedSessions = dayStart
    ? getSessionOccurrences(sessions, task.recurrence, { start: dayStart, end: dayStart.add(1, 'day') })
    : sessions
  const sessionMinutes = displayedSessions
    .filter((session) => !day || session.start.format('YYYY-MM-DD') === day)
    .reduce((sum, session) => sum + session.end.diff(session.start, 'minute'), 0)
  return { sessionMinutes, manualLogMinutes, actualMinutes: sessionMinutes + manualLogMinutes }
}

/** Use original entities, not day-shifted Kanban projections, for estimate allocation. */
export function getDailyTimeTotals(tasks: readonly AgendaEntity[], day: string, hideCompleted = false) {
  const unique = [...new Map(tasks.map((task) => [task.id, task])).values()].filter(
    (task) => !task.objective && !task.recurringPast && (!hideCompleted || task.status !== 'done'),
  )
  let estimatedMinutes: number | undefined
  let actualMinutes: number | undefined = 0
  for (const task of unique) {
    const sessions = getTaskSessions(task)
    const firstStart = sessions.reduce<AgendaEntity['start']>(
      (first, session) => (!first || session.start.isBefore(first) ? session.start : first),
      undefined,
    )
    const estimateDay = (firstStart ?? task.start ?? task.deadline?.value)?.format('YYYY-MM-DD')
    if (estimateDay === day && task.estimatedTime !== undefined)
      estimatedMinutes = (estimatedMinutes ?? 0) + task.estimatedTime
    const actual = getTaskTimeTotals(task, day).actualMinutes
    actualMinutes = actual === undefined || actualMinutes === undefined ? undefined : actualMinutes + actual
  }
  return { estimatedMinutes, actualMinutes }
}
