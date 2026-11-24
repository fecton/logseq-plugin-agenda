import type { EventApi } from '@fullcalendar/core'
import { message } from 'antd'
import dayjs from 'dayjs'

import { getTaskSessions } from '../helpers/taskSessions'
import useAgendaEntities from './useAgendaEntities'

const leavingEvents = new Map<string, () => void>()
export function captureSessionLeave(info: { event: EventApi; revert: () => void }) {
  leavingEvents.set(info.event.id, info.revert)
}

export default function useSessionScheduling() {
  const { updateEntity, entities } = useAgendaEntities()
  return async (info: { event: EventApi; revert: () => void }, receive = false) => {
    const { event } = info
    if (receive) {
      // The two calendars share tasks. Keep the source event until the saved state replaces it.
      leavingEvents.get(event.id)?.()
      leavingEvents.delete(event.id)
    }
    const taskId = event.extendedProps.id ?? event.id
    const task = entities.find((entity) => entity.id === taskId)
    try {
      if (!task || !event.start) throw new Error('Task or session not found. Refresh Agenda and try again.')
      if (task.sessionsError) throw new Error(task.sessionsError)
      const start = dayjs(event.start)
      if (
        receive &&
        event.extendedProps.eventKind !== 'session' &&
        event.extendedProps.eventKind !== 'time-log' &&
        (!event.allDay || getTaskSessions(task).length)
      ) {
        const previous = getTaskSessions(task).at(-1)
        const sessionStart =
          event.allDay && previous ? start.hour(previous.start.hour()).minute(previous.start.minute()) : start
        await updateEntity({
          type: 'task-session',
          id: taskId,
          data: { type: 'add', id: crypto.randomUUID(), start: sessionStart },
        })
      } else if (event.extendedProps.eventKind === 'session') {
        const previous = getTaskSessions(task).find((session) => session.id === event.extendedProps.sessionId)
        if (!previous) throw new Error('This session no longer exists. Refresh Agenda and try again.')
        // A month cell supplies only a date; keep the selected session's time and duration.
        const sessionStart = event.allDay ? start.hour(previous.start.hour()).minute(previous.start.minute()) : start
        const sessionEnd =
          event.allDay || !event.end
            ? sessionStart.add(previous.end.diff(previous.start, 'minute'), 'minute')
            : dayjs(event.end)
        await updateEntity({
          type: 'task-session',
          id: taskId,
          data: { type: 'update', id: event.extendedProps.sessionId, start: sessionStart, end: sessionEnd },
        })
      } else {
        if (event.extendedProps.eventKind === 'time-log') throw new Error('Edit actual work in the task editor.')
        await updateEntity({
          type: 'task-date',
          id: taskId,
          data: {
            start,
            allDay: event.allDay,
            ...(event.allDay
              ? {
                  end:
                    event.end && dayjs(event.end).diff(start, 'day') > 1
                      ? dayjs(event.end).subtract(1, 'day')
                      : undefined,
                }
              : { estimatedTime: dayjs(event.end).diff(start, 'minute') }),
          },
        })
      }
      if (receive) event.remove()
    } catch (error) {
      info.revert()
      message.error(error instanceof Error ? error.message : 'Could not save the session. Please try again.')
    }
  }
}
