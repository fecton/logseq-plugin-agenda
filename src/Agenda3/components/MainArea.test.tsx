import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import dayjs from 'dayjs'
import { Provider, useAtomValue } from 'jotai'
import { afterEach, expect, test, vi } from 'vitest'

import { appAtom } from '../models/app'
import { dateViewAtom } from '../models/dateView'
import { settingsAtom } from '../models/settings'
import MainArea from './MainArea'

vi.mock('./kanban/KanBan', () => ({ default: () => <div>Task board</div> }))
vi.mock('./calendar/Calendar', () => ({ default: () => <div>Calendar grid</div> }))
vi.mock('./modals/SettingsModal', () => ({ default: () => null }))
vi.mock('./Filter', () => ({ default: () => null }))
vi.mock('./UploadIcs', () => ({ default: () => null }))
vi.mock('@/Agenda3/helpers/umami', () => ({ track: vi.fn() }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

function State() {
  const app = useAtomValue(appAtom)
  const range = useAtomValue(dateViewAtom)
  return (
    <output data-testid="state">
      {app.view}:{app.anchorDate}:{range.view}:{range.days.length}
    </output>
  )
}
function mount(dateRange?: string) {
  return render(
    <Provider
      initialValues={[
        [appAtom, { view: 'tasks', anchorDate: '2026-11-29', rightSidebarFolded: false, sidebarType: 'timebox' }],
        [settingsAtom, { isInitialized: true, general: { startOfWeek: 0 }, viewOptions: { dateRange } }],
      ]}
    >
      <MainArea />
      <State />
    </Provider>,
  )
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})
const key = (code: string) => fireEvent.keyDown(document, { code })

test('shared controls retain the anchor across modes and persist only the range preference', async () => {
  mount()
  expect(screen.getByTestId('state')).toHaveTextContent('tasks:2026-11-29:workWeek:5')
  expect(screen.getByRole('heading')).toHaveTextContent('23 Nov – 27 Nov 2026')
  fireEvent.click(screen.getByRole('button', { name: 'Date range' }))
  fireEvent.click(await screen.findByRole('menuitemradio', { name: '3 days' }))
  expect(screen.getByTestId('state')).toHaveTextContent('tasks:2026-11-29:threeDays:3')
  fireEvent.click(screen.getByRole('radio', { name: /Calendar/ }))
  expect(screen.getByTestId('state')).toHaveTextContent('calendar:2026-11-29:threeDays:3')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByTestId('state')).toHaveTextContent('calendar:2026-12-02:threeDays:3')
  key('KeyT')
  expect(screen.getByTestId('state')).toHaveTextContent('tasks:2026-12-02:threeDays:3')
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
  await waitFor(() =>
    expect(JSON.parse(localStorage.getItem('settings')!)).toMatchObject({ viewOptions: { dateRange: 'threeDays' } }),
  )
  expect(localStorage.getItem('settings')).not.toContain('anchorDate')
  fireEvent.click(screen.getByRole('button', { name: 'Today' }))
  expect(screen.getByTestId('state')).toHaveTextContent(`tasks:${dayjs().format('YYYY-MM-DD')}:threeDays:3`)
})

test('shortcuts toggle month/week and navigate once; typing and visible dialogs suppress them', () => {
  mount('day')
  key('KeyW')
  expect(screen.getByTestId('state')).toHaveTextContent('tasks:2026-11-29:month:35')
  key('BracketRight')
  key('BracketRight')
  expect(screen.getByTestId('state')).toHaveTextContent('tasks:2026-12-29:month:35')
  key('KeyW')
  expect(screen.getByTestId('state')).toHaveTextContent('tasks:2026-12-29:week:7')
  const input = document.createElement('input')
  document.body.append(input)
  input.focus()
  key('KeyT')
  key('KeyW')
  key('BracketLeft')
  key('BracketLeft')
  expect(screen.getByTestId('state')).toHaveTextContent('tasks:2026-12-29:week:7')
  input.remove()
  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  document.body.append(dialog)
  key('KeyT')
  expect(screen.getByTestId('state')).toHaveTextContent('tasks:2026-12-29:week:7')
  dialog.style.display = 'none'
  key('KeyT')
  expect(screen.getByTestId('state')).toHaveTextContent('calendar:2026-12-29:week:7')
  dialog.remove()
})
