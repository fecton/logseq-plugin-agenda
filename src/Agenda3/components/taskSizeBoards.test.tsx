import type { EventContentArg } from '@fullcalendar/core'
import { cleanup, render, screen, within } from '@testing-library/react'
import dayjs from 'dayjs'
import type { ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import { transformAgendaTaskToCalendarEvent } from '@/Agenda3/helpers/fullCalendar'
import type { AgendaTaskWithStart } from '@/types/task'
import { TASK_SIZES } from '@/types/taskSize'

import TaskSizeBadge from './TaskSizeBadge'
import TaskCard from './kanban/taskCard/TaskCard'
import TimeBoxEvent from './timebox/TheCalendarEvent'

vi.mock('@/Agenda3/hooks/useAgendaEntities', () => ({
  default: () => ({ updateEntity: vi.fn(), deleteEntity: vi.fn() }),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (value: string) => value }) }))
vi.mock('./modals/TaskModal', () => ({ default: ({ children }: { children?: ReactNode }) => <>{children}</> }))
afterEach(cleanup)

test.each([...TASK_SIZES, undefined])('shows size %s on Kanban and Time Box, including unset sizes', (size) => {
  const task = {
    id: 'task',
    title: 'Board task',
    showTitle: 'Board task',
    start: dayjs('2026-11-24T13:00'),
    status: 'todo',
    allDay: false,
    estimatedTime: 60,
    size,
    project: { id: 'page', originalName: 'Work', bgColor: '#2196f3' },
    rawBlock: {},
  } as AgendaTaskWithStart
  const event = transformAgendaTaskToCalendarEvent(task)[0]
  render(
    <>
      <section aria-label="Kanban">
        <TaskCard task={task} />
      </section>
      <section aria-label="Time Box">
        <TimeBoxEvent info={{ event, timeText: '13:00 - 14:00' } as unknown as EventContentArg} />
      </section>
    </>,
  )
  for (const board of ['Kanban', 'Time Box']) {
    const region = within(screen.getByRole('region', { name: board }))
    expect(region.getByText('Board task')).toBeVisible()
    const badge = region.getByLabelText(`Size: ${size ?? 'Not set'}`)
    expect(badge).toBeVisible()
    expect(badge).toHaveTextContent(size ?? 'Size: —')
    expect(badge.querySelector('svg')).not.toBeNull()
  }
  expect(task.size).toBe(size)
})

test('other uses still hide unset sizes by default', () => {
  const { container } = render(<TaskSizeBadge />)
  expect(container).toBeEmptyDOMElement()
})
