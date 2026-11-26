import type { Dayjs } from 'dayjs'

import { DEFAULT_ESTIMATED_TIME } from '@/constants/agenda'
import type { AgendaEntity } from '@/types/entity'
import type { AgendaTaskWithStartOrDeadline } from '@/types/task'

import { getTaskSessions } from './taskSessions'

export type OverdueTask = {
  task: AgendaTaskWithStartOrDeadline
  reasons: ('schedule' | 'deadline')[]
  overdueSince: Dayjs
}

/** Classify source blocks, never generated calendar occurrences or completion history. */
export function classifyNeedsReview(entities: AgendaEntity[], now: Dayjs) {
  const overdue: OverdueTask[] = []
  const seen = new Set<string>()
  const today = now.startOf('day')

  for (const task of entities) {
    if (task.status !== 'todo' || task.objective || task.recurringPast || seen.has(task.id)) continue
    seen.add(task.id)
    const sessions = getTaskSessions(task)
    const scheduledEnd = sessions.length
      ? sessions.reduce((end, session) => (session.end.isAfter(end) ? session.end : end), sessions[0].end)
      : task.start
      ? task.end ?? (task.allDay ? task.start : task.start.add(task.estimatedTime ?? DEFAULT_ESTIMATED_TIME, 'minute'))
      : undefined
    const missedSchedule = !task.recurrence && scheduledEnd?.isValid() && scheduledEnd.isBefore(today, 'day')
    const missedDeadline = task.deadline?.value.isValid() && task.deadline.value.isBefore(today, 'day')
    if (missedSchedule || missedDeadline) {
      const reasons: OverdueTask['reasons'] = []
      if (missedSchedule) reasons.push('schedule')
      if (missedDeadline) reasons.push('deadline')
      const dates = [missedSchedule ? scheduledEnd : undefined, missedDeadline ? task.deadline?.value : undefined]
        .filter((date): date is Dayjs => Boolean(date))
        .sort((a, b) => a.valueOf() - b.valueOf())
      overdue.push({ task: task as AgendaTaskWithStartOrDeadline, reasons, overdueSince: dates[0] })
    }
  }

  overdue.sort((a, b) => a.overdueSince.valueOf() - b.overdueSince.valueOf() || a.task.id.localeCompare(b.task.id))
  return { overdue, count: overdue.length }
}
