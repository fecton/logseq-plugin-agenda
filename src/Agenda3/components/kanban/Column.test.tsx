import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import dayjs from 'dayjs'
import type { ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import type { AgendaEntity } from '@/types/entity'
import type { AgendaTaskWithStart } from '@/types/task'

import Column from './Column'

const { updateEntity, drag } = vi.hoisted(() => ({
  updateEntity: vi.fn(),
  drag: { outside: false, day: undefined as string | undefined },
}))
vi.mock('@/Agenda3/hooks/useAgendaEntities', () => ({ default: () => ({ updateEntity }) }))
vi.mock('@/Agenda3/helpers/umami', () => ({ track: vi.fn() }))
vi.mock('@fullcalendar/interaction', () => ({ ThirdPartyDraggable: vi.fn() }))
vi.mock('./ColumnTitle', () => ({ default: () => null }))
vi.mock('./AddTaskCard', () => ({
  default: ({ estimatedTime, actualTime }) => (
    <output data-testid="daily-totals">{`${estimatedTime ?? 'unset'}:${actualTime ?? 'unavailable'}`}</output>
  ),
}))
vi.mock('./taskCard/TaskCard', () => ({ default: ({ task }) => <article>{task.id}</article> }))
vi.mock('react-sortablejs', () => ({
  ReactSortable: ({
    children,
    sort,
    onAdd,
  }: {
    children?: ReactNode
    sort?: boolean
    onAdd: (event: {
      item: { dataset: { id: string; sessionDay?: string } }
      originalEvent?: { clientX: number; clientY: number }
    }) => void
  }) => (
    <div data-testid="sortable" data-sort={String(sort)}>
      <button
        onClick={() =>
          onAdd({
            item: { dataset: { id: 'medium', sessionDay: drag.day } },
            ...(drag.outside ? { originalEvent: { clientX: 900, clientY: 300 } } : {}),
          })
        }
      >
        Move to this day
      </button>
      {children}
    </div>
  ),
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  drag.outside = false
  drag.day = undefined
})

test('ignores a drop outside the hovered Kanban column, and moves sessions only on a real day drop', () => {
  const task = {
    id: 'medium',
    start: dayjs('2026-11-24T13:00'),
    status: 'todo',
    allDay: false,
    sessionDay: '2026-11-24',
  } as AgendaTaskWithStart
  render(<Column day={dayjs('2026-11-25')} tasks={[]} allKanbanItems={[task]} />)
  drag.outside = true
  drag.day = '2026-11-24'
  fireEvent.click(screen.getByRole('button', { name: 'Move to this day' }))
  expect(updateEntity).not.toHaveBeenCalled()
  drag.outside = false
  fireEvent.click(screen.getByRole('button', { name: 'Move to this day' }))
  expect(updateEntity).toHaveBeenCalledWith({
    type: 'task-session',
    id: 'medium',
    data: { type: 'move-day', from: '2026-11-24', to: '2026-11-25' },
  })
})

test('renders priority order, reorders refreshed tasks, and retains cross-day scheduling', () => {
  const task = (id: string, priority?: AgendaTaskWithStart['priority'], status: 'todo' | 'done' = 'todo') =>
    ({
      id,
      priority,
      status,
      start: dayjs('2026-11-24T13:00'),
      allDay: false,
      estimatedTime: 60,
      size: 'XL',
    } as AgendaTaskWithStart)
  const tasks = [
    task('done', 'highest', 'done'),
    task('low', 'low'),
    task('unset'),
    task('medium', 'medium'),
    task('high', 'high'),
  ]
  const day = dayjs('2026-11-25')
  const { rerender } = render(<Column day={day} tasks={tasks} allKanbanItems={tasks} />)
  expect(screen.getAllByRole('article').map((el) => el.textContent)).toEqual(['high', 'unset', 'medium', 'low', 'done'])
  expect(screen.getByTestId('sortable')).toHaveAttribute('data-sort', 'false')
  fireEvent.click(screen.getByRole('button', { name: 'Move to this day' }))
  const update = updateEntity.mock.calls[0][0]
  expect(update).toMatchObject({ id: 'medium', type: 'task-date', data: { allDay: false } })
  expect(update.data.start.format('YYYY-MM-DD HH:mm')).toBe('2026-11-25 13:00')
  expect(tasks[3]).toMatchObject({ priority: 'medium', size: 'XL' })
  const refreshed = tasks.map((t) => (t.id === 'low' ? { ...t, priority: 'blocker' as const } : t))
  rerender(<Column day={day} tasks={refreshed} allKanbanItems={refreshed} />)
  expect(screen.getAllByRole('article').map((el) => el.textContent)).toEqual(['low', 'high', 'unset', 'medium', 'done'])
})

test('daily totals include logs on days without cards and follow accounting task refreshes', () => {
  const task: AgendaEntity = {
    id: 'log-only',
    title: 'Logged work',
    showTitle: 'Logged work',
    status: 'todo',
    allDay: true,
    project: { id: 'page', originalName: 'Work', isJournal: false },
    rawBlock: {} as AgendaEntity['rawBlock'],
    sessions: [],
    estimatedTime: 120,
    timeLogs: [{ start: dayjs('2026-11-25T14:00'), end: dayjs('2026-11-25T14:15'), amount: 15 }],
  }
  const { rerender } = render(
    <Column day={dayjs('2026-11-25')} tasks={[]} allKanbanItems={[]} accountingTasks={[task]} />,
  )
  expect(screen.getByTestId('daily-totals')).toHaveTextContent('unset:15')
  expect(screen.queryByRole('article')).toBeNull()
  rerender(<Column day={dayjs('2026-11-25')} tasks={[]} allKanbanItems={[]} accountingTasks={[]} />)
  expect(screen.getByTestId('daily-totals')).toHaveTextContent('unset:0')
})
