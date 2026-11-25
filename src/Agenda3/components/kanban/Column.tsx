import { Popover, Progress } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getDailyTimeTotals } from '@/Agenda3/helpers/taskTime'
import type { AgendaEntity } from '@/types/entity'
import type { AgendaTaskWithStartOrDeadline } from '@/types/task'
import { cn } from '@/util/util'

import AddTaskCard from './AddTaskCard'
import ColumnTitle from './ColumnTitle'
import TaskDayList from './TaskDayList'

export type ColumnProps = {
  day: Dayjs
  tasks: AgendaTaskWithStartOrDeadline[]
  allKanbanItems: AgendaTaskWithStartOrDeadline[]
  accountingTasks?: AgendaEntity[]
  compact?: boolean
  muted?: boolean
}
export default function Column({
  day,
  tasks,
  allKanbanItems,
  accountingTasks = allKanbanItems,
  compact = false,
  muted = false,
}: ColumnProps) {
  const { t } = useTranslation()
  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowContent = useRef<HTMLElement>(null)
  const overflowButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (overflowOpen) overflowContent.current?.focus()
  }, [overflowOpen])
  const isToday = day.isSame(dayjs(), 'day')
  const doneCount = tasks.filter((task) => task.status === 'done').length
  const totals = getDailyTimeTotals(accountingTasks, day.format('YYYY-MM-DD'))
  return (
    <section
      aria-label={day.format('YYYY-MM-DD')}
      className={cn(
        'flex min-w-0 flex-col',
        compact ? 'min-h-[190px] border border-gray-200 p-2 dark:border-zinc-700' : 'h-full pt-2',
        { 'bg-gray-200/50 dark:bg-zinc-900/50': muted },
      )}
    >
      {compact ? (
        <div className="flex items-center justify-between text-sm">
          <time
            dateTime={day.format('YYYY-MM-DD')}
            className={cn('rounded px-1.5 py-0.5', {
              'bg-blue-600 text-white': isToday,
              'text-gray-500': muted && !isToday,
            })}
          >
            {day.format(day.date() === 1 ? 'MMM D' : 'D')}
          </time>
          <span className="text-xs text-gray-500">{tasks.length || ''}</span>
        </div>
      ) : (
        <>
          <ColumnTitle day={day} />
          {isToday ? (
            <Progress
              size="small"
              status="success"
              className="!m-0"
              showInfo={false}
              percent={tasks.length ? (doneCount / tasks.length) * 100 : 0}
            />
          ) : (
            <div className="h-[24px]" />
          )}
        </>
      )}
      <AddTaskCard
        isGray={doneCount === tasks.length}
        day={day}
        actualTime={totals.actualMinutes}
        estimatedTime={totals.estimatedMinutes}
        compact={compact}
      />
      <TaskDayList
        day={day}
        tasks={tasks}
        allTasks={allKanbanItems}
        compact={compact}
        limit={compact ? 3 : undefined}
      />
      {compact && tasks.length > 3 ? (
        <Popover
          trigger="click"
          open={overflowOpen}
          onOpenChange={setOverflowOpen}
          destroyTooltipOnHide
          placement="right"
          title={day.format('ddd, D MMM YYYY')}
          content={
            <section
              ref={overflowContent}
              tabIndex={-1}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  setOverflowOpen(false)
                  overflowButton.current?.focus()
                }
              }}
              aria-label={t('All tasks for {{date}}', { date: day.format('YYYY-MM-DD') })}
              className="flex max-h-[60vh] w-[300px] flex-col overflow-y-auto"
            >
              <TaskDayList day={day} tasks={tasks} allTasks={allKanbanItems} />
            </section>
          }
        >
          <button
            ref={overflowButton}
            type="button"
            aria-expanded={overflowOpen}
            className="mt-2 rounded px-1 text-left text-xs text-blue-700 hover:underline dark:text-blue-300"
          >
            {t('+{{count}} more', { count: tasks.length - 3 })}
          </button>
        </Popover>
      ) : null}
    </section>
  )
}
