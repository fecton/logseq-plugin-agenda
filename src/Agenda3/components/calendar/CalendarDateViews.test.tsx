import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import dayjs from 'dayjs'
import { Provider, useSetAtom } from 'jotai'
import { afterEach, expect, test, vi } from 'vitest'

import { DATE_VIEWS, getDateView } from '@/Agenda3/helpers/dateViews'
import { appAtom } from '@/Agenda3/models/app'
import { agendaEntitiesAtom } from '@/Agenda3/models/entities/entities'
import { settingsAtom } from '@/Agenda3/models/settings'
import type { AgendaEntity } from '@/types/entity'

import TimeBox from '../timebox/TimeBox'
import Calendar from './Calendar'

vi.mock('@/Agenda3/components/ThemeProvider', () => ({ useTheme: () => ({ currentTheme: 'light' }) }))
vi.mock('@/Agenda3/hooks/useSessionScheduling', () => ({ default: () => vi.fn(), captureSessionLeave: vi.fn() }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
const { modalOpened } = vi.hoisted(() => ({ modalOpened: vi.fn() }))
vi.mock('../modals/TaskModal', () => ({
  default: ({ open, info, children }: { open?: boolean; info: unknown; children?: React.ReactNode }) => {
    if (open) modalOpened(info)
    return children ? <span onClick={() => modalOpened(info)}>{children}</span> : null
  },
}))
vi.mock('./WeekNumber', () => ({ default: () => null }))
afterEach(cleanup)

function Controls() {
  const setSettings = useSetAtom(settingsAtom)
  return (
    <>
      {DATE_VIEWS.map((view) => (
        <button
          key={view}
          onClick={() =>
            setSettings({ isInitialized: true, general: { startOfWeek: 0 }, viewOptions: { dateRange: view } })
          }
        >
          {view}
        </button>
      ))}
    </>
  )
}
test('installed Calendar engine shows the same dates as Tasks in every range after repeated switches', () => {
  const anchor = '2026-11-29'
  const { container } = render(
    <Provider
      initialValues={[
        [appAtom, { view: 'calendar', anchorDate: anchor, rightSidebarFolded: false, sidebarType: 'timebox' }],
        [settingsAtom, { isInitialized: true, general: { startOfWeek: 0 }, viewOptions: { dateRange: 'workWeek' } }],
      ]}
    >
      <Controls />
      <Calendar />
    </Provider>,
  )
  for (const view of ['workWeek', 'day', 'threeDays', 'week', 'month', 'workWeek', 'week'] as const) {
    fireEvent.click(screen.getByRole('button', { name: view }))
    const selector = view === 'month' ? '.fc-daygrid-day[data-date]' : '.fc-col-header-cell[data-date]'
    const actual = Array.from(container.querySelectorAll(selector)).map((el) => el.getAttribute('data-date'))
    expect(actual).toEqual(getDateView(view, anchor, 0).days.map((day) => day.format('YYYY-MM-DD')))
  }
})

test('Calendar and Time Box open the source series from later occurrences as their dates change', () => {
  const today = dayjs().startOf('day')
  const start = today.subtract(10, 'day').hour(9)
  const task = {
    id: 'series',
    title: 'Focus',
    showTitle: 'Focus',
    status: 'todo',
    allDay: false,
    start,
    sessions: [{ id: 'a', start, end: start.add(1, 'hour') }],
    recurrence: { frequency: 'day', interval: 1, end: { type: 'never' } },
    project: { id: 'page', bgColor: '#6495ed' },
    rawBlock: {},
  } as AgendaEntity
  render(
    <Provider
      initialValues={[
        [agendaEntitiesAtom, [task]],
        [
          appAtom,
          {
            view: 'calendar',
            anchorDate: today.format('YYYY-MM-DD'),
            rightSidebarFolded: false,
            sidebarType: 'timebox',
          },
        ],
        [settingsAtom, { isInitialized: true, viewOptions: { dateRange: 'day' } }],
      ]}
    >
      <section aria-label="Main calendar">
        <Calendar />
      </section>
      <section aria-label="Time Box sidebar">
        <TimeBox />
      </section>
    </Provider>,
  )
  const calendar = screen.getByRole('region', { name: 'Main calendar' })
  const sidebar = screen.getByRole('region', { name: 'Time Box sidebar' })
  const clickToday = (region: Element) => {
    const event = region.querySelector('.fc-event')!
    expect(event).not.toHaveClass('fc-event-draggable')
    fireEvent.click(event.querySelector('[title="Focus"]') ?? event.firstElementChild ?? event)
    expect(modalOpened).toHaveBeenLastCalledWith({
      type: 'edit',
      initialTaskData: expect.objectContaining({ id: 'series', start, sessions: task.sessions }),
      sessionId: 'a',
    })
    modalOpened.mockClear()
  }
  clickToday(calendar)
  clickToday(sidebar)
  fireEvent.click(screen.getByRole('button', { name: 'Next Time Box day' }))
  expect(sidebar.querySelector('.fc-col-header-cell')).toHaveAttribute(
    'data-date',
    today.add(1, 'day').format('YYYY-MM-DD'),
  )
  clickToday(sidebar)
})
