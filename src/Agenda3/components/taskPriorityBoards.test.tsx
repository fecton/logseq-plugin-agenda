import type { EventContentArg } from '@fullcalendar/core'
import { cleanup, render, screen, within } from '@testing-library/react'
import dayjs from 'dayjs'
import type { ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import { transformAgendaTaskToCalendarEvent } from '@/Agenda3/helpers/fullCalendar'
import type { AgendaTaskWithStart } from '@/types/task'
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from '@/types/taskPriority'

import TaskPriorityBadge from './TaskPriorityBadge'
import CalendarEvent from './calendar/TheCalendarEvent'
import TaskCard from './kanban/taskCard/TaskCard'
import TimeBoxEvent from './timebox/TheCalendarEvent'

const { loaded, editTask } = vi.hoisted(() => ({
  loaded: { entities: [] as AgendaTaskWithStart[] },
  editTask: vi.fn(),
}))
vi.mock('@/Agenda3/hooks/useAgendaEntities', () => ({
  default: () => ({ updateEntity: vi.fn(), deleteEntity: vi.fn(), entities: loaded.entities }),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (value: string) => value }) }))
vi.mock('./modals/TaskModal', () => ({
  default: ({ children, info }: { children?: ReactNode; info: unknown }) => {
    editTask(info)
    return <>{children}</>
  },
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  loaded.entities = []
})

test.each([...TASK_PRIORITIES, undefined])(
  'shows priority %s without hiding Size or changing event times',
  (priority) => {
    const task = {
      id: 'task',
      title: 'Board task',
      showTitle: 'Board task',
      start: dayjs('2026-11-24T13:00'),
      status: 'todo',
      allDay: false,
      estimatedTime: 60,
      priority,
      size: 'XL',
      project: { id: 'page', originalName: 'Work', bgColor: '#2196f3' },
      rawBlock: {},
    } as AgendaTaskWithStart
    const event = transformAgendaTaskToCalendarEvent(task)[0]
    const info = { event, timeText: '13:00 - 14:00' } as unknown as EventContentArg
    render(
      <>
        <section aria-label="Kanban">
          <TaskCard task={task} />
        </section>
        <section aria-label="Time Box">
          <TimeBoxEvent info={info} />
        </section>
        <section aria-label="Month">
          <CalendarEvent info={{ ...info, view: { type: 'dayGridMonth' } } as EventContentArg} />
        </section>
        <section aria-label="Week">
          <CalendarEvent info={{ ...info, view: { type: 'timeGridWeek' } } as EventContentArg} />
        </section>
      </>,
    )
    for (const board of ['Kanban', 'Time Box', 'Month', 'Week']) {
      const region = within(screen.getByRole('region', { name: board }))
      expect(region.getByLabelText('Size: XL')).toBeVisible()
      const label = `Priority: ${priority ? TASK_PRIORITY_LABELS[priority] : 'Not set'}`
      if (priority || board === 'Kanban' || board === 'Time Box') {
        expect(region.getByLabelText(label)).toBeVisible()
        expect(region.getByLabelText(label).querySelector('svg')).not.toBeNull()
      } else expect(region.queryByLabelText(label)).toBeNull()
    }
    expect(dayjs(event.start).format('HH:mm')).toBe('13:00')
    expect(dayjs(event.end).format('HH:mm')).toBe('14:00')
  },
)

test('non-board uses hide unset priorities by default', () => {
  const { container } = render(<TaskPriorityBadge />)
  expect(container).toBeEmptyDOMElement()
})

test('external Time Box drops retain badges and wait for complete task data before mounting the editor', () => {
  const task = {
    id: 'dropped',
    title: 'Dropped task',
    showTitle: 'Dropped task',
    priority: 'high',
    size: 'XL',
    status: 'todo',
    start: dayjs('2026-11-24T13:00'),
    allDay: false,
    rawBlock: {},
  } as AgendaTaskWithStart
  loaded.entities = [task]
  const event = {
    id: 'dropped',
    title: 'Dropped task',
    start: new Date('2026-11-24T14:00'),
    end: new Date('2026-11-24T14:30'),
    allDay: false,
    extendedProps: {},
  }
  const { rerender } = render(<TimeBoxEvent info={{ event } as unknown as EventContentArg} />)
  expect(screen.getByLabelText('Priority: High')).toBeVisible()
  expect(screen.getByLabelText('Size: XL')).toBeVisible()
  expect(editTask).not.toHaveBeenCalled()
  loaded.entities = []
  rerender(<TimeBoxEvent info={{ event: { ...event, id: 'unknown' } } as unknown as EventContentArg} />)
  expect(screen.getByText('Dropped task')).toBeVisible()
  expect(editTask).not.toHaveBeenCalled()
  rerender(
    <TimeBoxEvent
      info={
        { event: { ...event, extendedProps: { ...task, start: dayjs(event.start) } } } as unknown as EventContentArg
      }
    />,
  )
  expect(editTask).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'edit',
      initialTaskData: expect.objectContaining({ id: 'dropped', priority: 'high', size: 'XL', rawBlock: {} }),
    }),
  )
})
