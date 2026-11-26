import { ThirdPartyDraggable } from '@fullcalendar/interaction'
import { message } from 'antd'
import type { Dayjs } from 'dayjs'
import { useEffect, useRef } from 'react'
import { ReactSortable } from 'react-sortablejs'
import type { SortableEvent } from 'sortablejs'

import { sortKanbanTasks } from '@/Agenda3/helpers/taskPriority'
import useAgendaEntities from '@/Agenda3/hooks/useAgendaEntities'
import type { AgendaTaskWithStartOrDeadline } from '@/types/task'
import { cn, replaceDateInfo } from '@/util/util'

import TaskCard from './taskCard/TaskCard'

export default function TaskDayList({
  day,
  tasks,
  compact = false,
  limit,
}: {
  day: Dayjs
  tasks: AgendaTaskWithStartOrDeadline[]
  compact?: boolean
  limit?: number
}) {
  const container = useRef<HTMLDivElement>(null)
  const { entities, updateEntity } = useAgendaEntities()
  const shown = sortKanbanTasks(tasks).slice(0, limit)
  useEffect(() => {
    if (!container.current) return
    const draggable = new ThirdPartyDraggable(container.current, {
      itemSelector: '.droppable-task-element',
      mirrorSelector: '.dragged-mirror-element',
    })
    return () => draggable.destroy()
  }, [])
  const onAdd = async (event: SortableEvent & { originalEvent?: MouseEvent | TouchEvent }) => {
    // Sortable can report its last hovered list when the actual drop is in FullCalendar.
    const originalEvent = event.originalEvent
    const pointer =
      originalEvent && ('changedTouches' in originalEvent ? originalEvent.changedTouches[0] : originalEvent)
    const bounds = container.current?.getBoundingClientRect()
    // A scrolled month cell can geometrically sit beneath the sidebar or a popover.
    const hit = pointer && document.elementFromPoint?.(pointer.clientX, pointer.clientY)
    if (
      pointer &&
      bounds &&
      (pointer.clientX < bounds.left ||
        pointer.clientX > bounds.right ||
        pointer.clientY < bounds.top ||
        pointer.clientY > bounds.bottom ||
        (hit && !container.current?.contains(hit)))
    ) {
      return
    }
    const id = event.item.dataset.id
    const sourceDay = event.item.dataset.sessionDay
    const task = entities.find((item) => item.id === id)
    try {
      if (!id || !task) throw new Error('Task not found. Refresh Agenda and try again.')
      if (sourceDay) {
        if (sourceDay === day.format('YYYY-MM-DD')) return
        await updateEntity({
          type: 'task-session',
          id,
          data: { type: 'move-day', from: sourceDay, to: day.format('YYYY-MM-DD') },
        })
      } else if (!task.start && task.sessions !== undefined) {
        await updateEntity({
          type: 'task-session',
          id,
          data: { type: 'add', id: crypto.randomUUID(), start: day },
        })
      } else {
        await updateEntity({
          type: 'task-date',
          id,
          data: {
            start: task.start && !task.allDay ? replaceDateInfo(task.start, day) : day,
            allDay: !task.start || task.allDay,
          },
        })
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Could not move task. Please try again.')
    }
  }
  return (
    <div ref={container} className="flex min-h-[48px] min-w-0 flex-1 flex-col">
      <ReactSortable
        sort={false}
        forceFallback
        className={cn('flex min-h-[48px] flex-1 flex-col gap-2', { 'overflow-y-auto': !compact })}
        group="kanban"
        dragClass="dragged-mirror-element"
        draggable=".droppable-task-element"
        list={shown}
        setList={() => {}}
        onAdd={(event) => {
          void onAdd(event)
        }}
      >
        {shown.map((task) => (
          <TaskCard key={task.id} task={task} compact={compact} />
        ))}
      </ReactSortable>
    </div>
  )
}
