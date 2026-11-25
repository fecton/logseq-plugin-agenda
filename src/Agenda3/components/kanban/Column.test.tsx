import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { message } from 'antd'
import dayjs from 'dayjs'
import type { ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import type { AgendaEntity } from '@/types/entity'
import type { AgendaTaskWithStart } from '@/types/task'

import Column from './Column'

const { updateEntity, drag, destroyDraggable } = vi.hoisted(() => ({
  updateEntity: vi.fn(),
  destroyDraggable: vi.fn(),
  drag: { outside: false, day: undefined as string | undefined },
}))
vi.mock('@/Agenda3/hooks/useAgendaEntities', () => ({ default: () => ({ updateEntity }) }))
vi.mock('@/Agenda3/helpers/umami', () => ({ track: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values = {}) => key.replace(/{{(\w+)}}/g, (_, name) => String(values[name])),
  }),
}))
vi.mock('@fullcalendar/interaction', () => ({ ThirdPartyDraggable: vi.fn(() => ({ destroy: destroyDraggable })) }))
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

test('a month cell underneath the sidebar does not also move a card dropped into Time Box', () => {
  const rect = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({ left: 0, top: 0, right: 2000, bottom: 2000 } as DOMRect)
  const previous = document.elementFromPoint
  document.elementFromPoint = vi.fn(() => document.body)
  render(<Column compact day={dayjs('2026-11-29')} tasks={[]} allKanbanItems={[]} />)
  drag.outside = true
  fireEvent.click(screen.getByRole('button', { name: 'Move to this day' }))
  expect(updateEntity).not.toHaveBeenCalled()
  rect.mockRestore()
  document.elementFromPoint = previous
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

test('month cells show the first three priorities and open the complete sorted day in a popover', async () => {
  const tasks = ['low', 'medium', 'high', 'blocker', 'lowest'].map(
    (priority) =>
      ({ id: priority, priority, status: 'todo', allDay: true, start: dayjs('2026-11-25') } as AgendaTaskWithStart),
  )
  const view = render(<Column compact day={dayjs('2026-11-25')} tasks={tasks} allKanbanItems={tasks} />)
  expect(screen.getAllByRole('article').map((el) => el.textContent)).toEqual(['blocker', 'high', 'medium'])
  fireEvent.click(screen.getByRole('button', { name: '+2 more' }))
  const popover = await screen.findByRole('region', { name: 'All tasks for 2026-11-25' })
  expect(
    within(popover)
      .getAllByRole('article')
      .map((el) => el.textContent),
  ).toEqual(['blocker', 'high', 'medium', 'low', 'lowest'])
  view.unmount()
  expect(destroyDraggable).toHaveBeenCalledTimes(2)
})

test('failed drops keep the existing cards and report the error', async () => {
  const error = vi.spyOn(message, 'error').mockImplementation(() => undefined as never)
  updateEntity.mockRejectedValueOnce(new Error('Save failed'))
  const task = { id: 'medium', start: dayjs('2026-11-24T13:00'), allDay: false, status: 'todo' } as AgendaTaskWithStart
  render(<Column day={dayjs('2026-11-25')} tasks={[task]} allKanbanItems={[task]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Move to this day' }))
  await waitFor(() => expect(error).toHaveBeenCalledWith('Save failed'))
  expect(screen.getByRole('article')).toHaveTextContent('medium')
  expect(updateEntity).toHaveBeenCalledTimes(1)
  error.mockRestore()
})
