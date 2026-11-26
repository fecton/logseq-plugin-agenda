import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import dayjs from 'dayjs'
import { Provider, useSetAtom } from 'jotai'
import { afterEach, expect, test, vi } from 'vitest'

import { DATE_VIEWS, getDateView } from '@/Agenda3/helpers/dateViews'
import { DEFAULT_WORKING_HOURS } from '@/Agenda3/helpers/workingHours'
import { appAtom } from '@/Agenda3/models/app'
import { agendaEntitiesAtom } from '@/Agenda3/models/entities/entities'
import { settingsAtom } from '@/Agenda3/models/settings'
import type { AgendaEntity } from '@/types/entity'

import TimeBox from '../timebox/TimeBox'
import WorkingHoursModal from '../timebox/WorkingHoursModal'
import Calendar from './Calendar'

vi.mock('@/Agenda3/components/ThemeProvider', () => ({ useTheme: () => ({ currentTheme: 'light' }) }))
vi.mock('@/Agenda3/hooks/useSessionScheduling', () => ({ default: () => vi.fn(), captureSessionLeave: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, { position }: { position?: number } = {}) => key.replace('{{position}}', String(position)),
    i18n: { language: 'en' },
  }),
}))
const { modalOpened } = vi.hoisted(() => ({ modalOpened: vi.fn() }))
vi.mock('../modals/TaskModal', () => ({
  default: ({ open, info, children }: { open?: boolean; info: unknown; children?: React.ReactNode }) => {
    if (open) modalOpened(info)
    return children ? <span onClick={() => modalOpened(info)}>{children}</span> : null
  },
}))
vi.mock('./WeekNumber', () => ({ default: () => null }))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

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

test('Time Box renders named blocks on their repeat days and applies activity edits', () => {
  // FullCalendar measures the time grid before it renders background events.
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(2400)
  const computedStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => computedStyle(element))
  const today = dayjs()
  const workingHours = {
    ...DEFAULT_WORKING_HOURS,
    blockedActivities: [
      { name: 'Sleep', preset: 'daily', customDays: [], start: '22:00', end: '06:00' },
      { name: 'Work', preset: 'custom', customDays: [today.day()], start: '09:00', end: '17:00' },
    ],
  }
  const { container } = render(
    <Provider
      initialValues={[[settingsAtom, { isInitialized: true, timeBoxWorkingHours: JSON.stringify(workingHours) }]]}
    >
      <TimeBox />
    </Provider>,
  )

  expect(container.querySelectorAll('.fc-bg-event')).toHaveLength(3)
  expect(screen.getAllByText('Sleep')).toHaveLength(2)
  expect(screen.getByText('Work')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Working hours' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Activity 2 name' }), { target: { value: 'Office' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByText('Office')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next Time Box day' }))
  expect(screen.getAllByText('Sleep')).toHaveLength(2)
  expect(screen.queryByText('Office')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Working hours' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add blocked activity' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Activity 3 name' }), { target: { value: 'Dinner' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Each blocked activity needs different start and end times.')
  for (const [field, time] of [
    ['start', '18:00'],
    ['end', '19:00'],
  ]) {
    const input = screen.getByRole('combobox', { name: `Activity 3 ${field}` })
    fireEvent.mouseDown(input)
    fireEvent.change(input, { target: { value: time } })
    fireEvent.click(screen.getByText(time, { selector: '.ant-select-item-option-content' }))
  }
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByText('Dinner')).toBeInTheDocument()
})

test('Working hours saves the overnight work and sleep periods and puts errors in the work section', () => {
  const computedStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => computedStyle(element))
  const onSave = vi.fn()
  const initial = {
    ...DEFAULT_WORKING_HOURS,
    enabled: true,
    ranges: [{ start: '11:00', end: '07:00' }],
    blockedActivities: [{ name: 'Sleep', preset: 'daily' as const, customDays: [], start: '22:00', end: '06:00' }],
  }
  render(<WorkingHoursModal initial={initial} onSave={onSave} onClose={() => undefined} />)

  const work = within(screen.getByRole('region', { name: 'Work periods' }))
  const blocked = within(screen.getByRole('region', { name: 'Blocked activities' }))
  expect(work.getByText('Ends next day')).toBeInTheDocument()
  expect(blocked.getByText('Ends next day')).toBeInTheDocument()
  fireEvent.click(work.getByRole('button', { name: 'Add work period' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(work.getByRole('alert')).toHaveTextContent('Each work period needs different start and end times.')
  expect(blocked.queryByRole('alert')).not.toBeInTheDocument()
  expect(onSave).not.toHaveBeenCalled()

  fireEvent.click(work.getByRole('button', { name: 'Remove work period 2' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(onSave).toHaveBeenCalledWith(initial)
})
