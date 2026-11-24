import { transformAgendaTaskToCalendarEvent } from '@/Agenda3/helpers/fullCalendar'
import { getRRuleInstance } from '@/Agenda3/helpers/task'
import type { AgendaEntity } from '@/types/entity'
import type { AgendaTaskWithStart } from '@/types/task'

import { getTaskSessions } from './taskSessions'

export type TaskEndNotification = { id: string; title: string; end: number; sessionId?: string }

/** Use Agenda's calendar duration, including its default 30-minute estimate. */
export const getDueTaskEndNotifications = (
  entities: AgendaEntity[],
  since: number,
  now: number,
): TaskEndNotification[] => {
  const due: TaskEndNotification[] = []
  for (const task of entities) {
    if (task.sessionsError) continue
    if (!task.start || task.allDay || task.status === 'done' || task.objective || task.recurringPast) continue
    const sessions = getTaskSessions(task)
    if (sessions.length || task.sessions !== undefined) {
      for (const session of sessions) {
        const end = session.end.valueOf()
        if (end > since && end <= now)
          due.push({
            id: task.id,
            ...(session.id === 'scheduled' ? {} : { sessionId: session.id }),
            title: task.showTitle || task.title,
            end,
          })
      }
      continue
    }
    const [event] = transformAgendaTaskToCalendarEvent(task as AgendaTaskWithStart)
    const duration = task.rrule ? (event.duration?.minute ?? 30) * 60_000 : event.end.getTime() - event.start.getTime()
    if (!Number.isFinite(duration) || duration <= 0) continue
    const starts = task.rrule
      ? getRRuleInstance(task.rrule).between(new Date(since - duration), new Date(now - duration), true)
      : [event.start]
    for (const start of starts) {
      const end = start.getTime() + duration
      if (end > since && end <= now) due.push({ id: task.id, title: task.showTitle || task.title, end })
    }
  }
  return due
}
