import { useAtomValue } from 'jotai'
import { useEffect, useMemo, useRef } from 'react'

import { DATE_FORMATTER_FOR_KEY, separateTasksInDay, transformTasksToKanbanTasks } from '@/Agenda3/helpers/task'
import { dateViewAtom } from '@/Agenda3/models/dateView'
import { calendarTasksAtom, tasksWithStartOrDeadlineAtom } from '@/Agenda3/models/entities/tasks'
import { settingsAtom } from '@/Agenda3/models/settings'
import type { AgendaTaskWithStartOrDeadline } from '@/types/task'

import Column from './Column'

export default function KanBan() {
  const settings = useAtomValue(settingsAtom)
  const range = useAtomValue(dateViewAtom)
  const sourceTasks = useAtomValue(tasksWithStartOrDeadlineAtom)
  const allTasks = useAtomValue(calendarTasksAtom)
  const container = useRef<HTMLDivElement>(null)
  const hideCompleted = settings.viewOptions?.hideCompleted
  const tasks = useMemo(
    () =>
      transformTasksToKanbanTasks(sourceTasks, {
        showFirstEventInCycleOnly: settings.viewOptions?.showFirstEventInCycleOnly,
        range: { start: range.visibleStart, end: range.visibleEnd },
      }).filter((task) => !hideCompleted || task.status !== 'done'),
    [sourceTasks, range, settings.viewOptions, hideCompleted],
  )
  const tasksInDay = separateTasksInDay(tasks)
  const accountingTasks = allTasks.filter((task) => !hideCompleted || task.status !== 'done')
  const month = range.view === 'month'
  const visibleStart = range.visibleStart.valueOf()
  useEffect(() => {
    container.current?.scrollTo?.({ left: 0, top: 0 })
  }, [range.view, visibleStart])
  return (
    <div ref={container} className="h-full overflow-auto pr-2" aria-label="Tasks date range">
      <div
        className={month ? 'grid min-w-[1120px] grid-cols-7' : 'grid h-full gap-4'}
        style={month ? undefined : { gridTemplateColumns: `repeat(${range.days.length}, minmax(265px, 1fr))` }}
      >
        {month &&
          range.days.slice(0, 7).map((day) => (
            <div
              key={day.day()}
              className="sticky top-0 z-10 border-b border-gray-200 bg-gray-100 px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              {day.format('ddd')}
            </div>
          ))}
        {range.days.map((day) => (
          <Column
            key={day.format('YYYY-MM-DD')}
            day={day}
            tasks={tasksInDay.get(day.format(DATE_FORMATTER_FOR_KEY)) ?? []}
            allKanbanItems={tasks}
            accountingTasks={accountingTasks}
            compact={month}
            muted={month && !day.isSame(range.start, 'month')}
          />
        ))}
      </div>
    </div>
  )
}
export type KanBanItem = AgendaTaskWithStartOrDeadline & { filtered?: boolean }
