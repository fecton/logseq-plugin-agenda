import type { EventApi } from '@fullcalendar/core'
import { message } from 'antd'
import dayjs from 'dayjs'

import { getTaskSessions } from '../helpers/taskSessions'
import useAgendaEntities from './useAgendaEntities'

export default function useSessionScheduling() {
  const { updateEntity, entities } = useAgendaEntities()
  return async (info: { event: EventApi; revert: () => void }, receive = false) => {
    const { event } = info
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
        if (event.allDay || !event.end)
          throw new Error('Sessions need a start time and duration. Edit the session to change its date.')
        await updateEntity({
          type: 'task-session',
          id: taskId,
          data: { type: 'update', id: event.extendedProps.sessionId, start, end: dayjs(event.end) },
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
