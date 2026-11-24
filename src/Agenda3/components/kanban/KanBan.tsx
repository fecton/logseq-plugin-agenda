import dayjs from 'dayjs'
import { useAtomValue } from 'jotai'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

import { DATE_FORMATTER_FOR_KEY, separateTasksInDay, transformTasksToKanbanTasks } from '@/Agenda3/helpers/task'
import { calendarTasksAtom, recentTasksAtom } from '@/Agenda3/models/entities/tasks'
import { settingsAtom } from '@/Agenda3/models/settings'
import { getRecentDaysRange } from '@/constants/agenda'
import type { AgendaTaskWithStartOrDeadline } from '@/types/task'
import { genDays } from '@/util/util'

import Column, { type ColumnHandle } from './Column'

const getRecentDays = () => {
  const [startDay, endDay] = getRecentDaysRange()
  return genDays(startDay, endDay)
}
export type KanBanHandle = {
  scrollToToday: () => void
}
const KanBan = (props, ref) => {
  const kanBanContainerRef = useRef<HTMLDivElement>(null)
  const columnRefs = useRef<Record<string, ColumnHandle | null>>({})

  const settings = useAtomValue(settingsAtom)

  const recentTasks = useAtomValue(recentTasksAtom)
  const allTasks = useAtomValue(calendarTasksAtom)
  const visible = (task: { status: string }) => !settings.viewOptions?.hideCompleted || task.status !== 'done'
  const accountingTasks = allTasks.filter(visible)
  const tasks = transformTasksToKanbanTasks(recentTasks, {
    showFirstEventInCycleOnly: settings.viewOptions?.showFirstEventInCycleOnly,
  }).filter(visible)
  const tasksInDay = separateTasksInDay(tasks)
  const days = getRecentDays()

  const scrollToToday = () => {
    const todayDateStr = dayjs().format('MM-DD ddd')
    columnRefs.current[todayDateStr]?.scrollIntoView()
    kanBanContainerRef.current?.scrollBy({ left: -30, behavior: 'smooth' })
  }

  // scroll to today
  useEffect(() => {
    scrollToToday()
  }, [])

  useImperativeHandle(ref, () => ({
    scrollToToday,
  }))

  return (
    <div className="flex h-full flex-1 gap-8 overflow-auto" ref={kanBanContainerRef}>
      {/* ========= Single Day List ========= */}
      {days.map((day) => {
        const dateStr = day.format('MM-DD ddd')
        const columnTasks = tasksInDay.get(day.format(DATE_FORMATTER_FOR_KEY)) || []
        return (
          <Column
            key={dateStr}
            ref={(el) => (columnRefs.current[dateStr] = el)}
            day={day}
            tasks={columnTasks}
            allKanbanItems={tasks}
            accountingTasks={accountingTasks}
          />
        )
      })}
    </div>
  )
}

export type KanBanItem = AgendaTaskWithStartOrDeadline & {
  filtered?: boolean
}
export default forwardRef<KanBanHandle>(KanBan)
