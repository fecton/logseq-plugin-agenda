import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Provider, useSetAtom } from 'jotai'
import { afterEach, expect, test, vi } from 'vitest'

import { DATE_VIEWS, getDateView } from '@/Agenda3/helpers/dateViews'
import { appAtom } from '@/Agenda3/models/app'
import { settingsAtom } from '@/Agenda3/models/settings'

import Calendar from './Calendar'

vi.mock('@/Agenda3/components/ThemeProvider', () => ({ useTheme: () => ({ currentTheme: 'light' }) }))
vi.mock('@/Agenda3/hooks/useSessionScheduling', () => ({ default: () => vi.fn(), captureSessionLeave: vi.fn() }))
vi.mock('../modals/TaskModal', () => ({ default: () => null }))
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
