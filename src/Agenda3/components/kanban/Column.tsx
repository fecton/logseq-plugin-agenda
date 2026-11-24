import { ThirdPartyDraggable } from '@fullcalendar/interaction'
import { Progress, message } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useAtomValue } from 'jotai'
import { useEffect, useImperativeHandle, useRef } from 'react'
import React from 'react'
import { ReactSortable } from 'react-sortablejs'

import { sortKanbanTasks } from '@/Agenda3/helpers/taskPriority'
import { getDailyTimeTotals } from '@/Agenda3/helpers/taskTime'
import { track } from '@/Agenda3/helpers/umami'
import useAgendaEntities from '@/Agenda3/hooks/useAgendaEntities'
import { appAtom } from '@/Agenda3/models/app'
import type { AgendaEntity } from '@/types/entity'
import type { AgendaTaskWithStartOrDeadline } from '@/types/task'
import { cn, replaceDateInfo } from '@/util/util'

import AddTaskCard from './AddTaskCard'
import ColumnTitle from './ColumnTitle'
import type { KanBanItem } from './KanBan'
import TaskCard from './taskCard/TaskCard'

export type ColumnProps = {
  day: Dayjs
  tasks: AgendaTaskWithStartOrDeadline[]
  allKanbanItems: KanBanItem[]
  accountingTasks?: AgendaEntity[]
}
const Column = ({ day, tasks, allKanbanItems, accountingTasks = allKanbanItems }: ColumnProps, ref) => {
  const columnContainerRef = useRef<HTMLDivElement>(null)
  // bind draggable
  const hadBindDropRef = useRef(false)

  const app = useAtomValue(appAtom)

  const today = dayjs()
  const dateStr = day.format('MM-DD ddd')

  const isToday = day.isSame(today, 'day')
  const doneTasks = tasks.filter((task) => task.status === 'done')
  const undoneTasks = tasks.filter((task) => task.status !== 'done')
  const _dayTasks = sortKanbanTasks(tasks)
  const { estimatedMinutes: estimatedTime, actualMinutes: actualTime } = getDailyTimeTotals(
    accountingTasks,
    day.format('YYYY-MM-DD'),
  )

  const { updateEntity } = useAgendaEntities()

  const onAddTaskByDrag = async (sortableEvent) => {
    console.log('[faiz:] === kanban onAdd', sortableEvent)
    // Sortable can report its last hovered column when FullCalendar receives the drop.
    const pointer = sortableEvent.originalEvent
    const bounds = columnContainerRef.current?.getBoundingClientRect()
    if (
      pointer &&
      bounds &&
      (pointer.clientX < bounds.left ||
        pointer.clientX > bounds.right ||
        pointer.clientY < bounds.top ||
        pointer.clientY > bounds.bottom)
    ) {
      sortableEvent.from?.insertBefore(sortableEvent.item, sortableEvent.from.children[sortableEvent.oldIndex] ?? null)
      return
    }
    const id = sortableEvent?.item?.dataset?.id
    const task = allKanbanItems.find((task) => task.id === id)
    const sourceDay = sortableEvent?.item?.dataset?.sessionDay
    if (task && sourceDay) {
      try {
        await updateEntity({
          type: 'task-session',
          id,
          data: { type: 'move-day', from: sourceDay, to: day.format('YYYY-MM-DD') },
        })
      } catch (error) {
        sortableEvent.from?.insertBefore(
          sortableEvent.item,
          sortableEvent.from.children[sortableEvent.oldIndex] ?? null,
        )
        message.error(error instanceof Error ? error.message : 'Could not move sessions.')
      }
      return
    }
    // TODO: 支持拖拽修改 deadline
    if (!task?.start) return logseq.UI.showMsg('Drag task without start date is not supported', 'error')
    if (!task || !id) return logseq.UI.showMsg('task id not found', 'error')
    let startDay = day
    // remain time info
    if (task.allDay === false) {
      startDay = replaceDateInfo(task.start, day)
    }
    await updateEntity({
      type: 'task-date',
      id,
      data: {
        start: startDay,
        allDay: task.allDay,
      },
    })
    track('KanBan: Drag Task')
  }

  useImperativeHandle(ref, () => ({
    scrollIntoView: () => {
      columnContainerRef.current?.scrollIntoView({ block: 'nearest', inline: 'start' })
    },
    // 你可以在这里添加更多你需要暴露给父组件的方法或属性
  }))

  useEffect(() => {
    if (app.view === 'tasks' && !hadBindDropRef.current && columnContainerRef.current) {
      new ThirdPartyDraggable(columnContainerRef.current, {
        itemSelector: '.droppable-task-element',
        mirrorSelector: '.dragged-mirror-element',
      })
      hadBindDropRef.current = true
    }
    return () => {
      hadBindDropRef.current = false
    }
  }, [app.view])

  return (
    <>
      <div key={dateStr} className="mt-2 flex w-[265px] shrink-0 flex-col" id={dateStr} ref={columnContainerRef}>
        {/* ========= Title ========= */}
        <ColumnTitle day={day} />

        {/* ========= Progress ========= */}
        {isToday ? (
          <Progress
            size="small"
            status="success"
            className="!m-0"
            showInfo={false}
            percent={(doneTasks.length / _dayTasks.length) * 100}
          />
        ) : (
          <div className="h-[24px]"></div>
        )}

        {/* ========= Add a task Card ========= */}
        <AddTaskCard
          isGray={undoneTasks.length === 0}
          day={day}
          actualTime={actualTime}
          estimatedTime={estimatedTime}
        />

        {/* ========= Tasks List ========= */}
        <ReactSortable
          sort={false}
          forceFallback // 该属性如果不加就无法与 fullcalendar 交互
          className={cn('flex flex-1 flex-col gap-2 overflow-y-auto', { 'pb-28': _dayTasks.length === 0 })}
          group="shared"
          dragClass="dragged-mirror-element"
          draggable=".droppable-task-element"
          list={_dayTasks}
          // onMove={(event, originalEvent) => {
          //   console.log('[faiz:] === xxx onMove', event)
          //   console.log('[faiz:] === xxx originalEvent', originalEvent)
          //   return true
          // }}
          setList={() => {
            // console.log(`[faiz:] === setList ${day.format('MM-DD ddd')}`, list)
          }}
          onAdd={onAddTaskByDrag}
        >
          {_dayTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </ReactSortable>
      </div>

      {/* Daily Review Modal */}
    </>
  )
}

export type ColumnHandle = {
  scrollIntoView: () => void
}
export default React.forwardRef<ColumnHandle, ColumnProps>(Column)
