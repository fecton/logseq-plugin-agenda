import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import dayjs from 'dayjs'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import type { TaskRecurrence } from '@/Agenda3/helpers/taskRecurrence'

import Repeat from './Repeat'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => key.replace(/{{(\w+)}}/g, (_, name) => values?.[name] ?? ''),
  }),
}))
afterEach(cleanup)

test('exposes presets and edits the selected weekdays, interval and ending', () => {
  function Editor() {
    const [rule, setRule] = useState<TaskRecurrence>()
    const saturday = dayjs('2026-11-28T09:00')
    return (
      <>
        <Repeat
          sessions={[{ id: 'one', start: saturday, end: saturday.add(1, 'hour') }]}
          value={rule}
          onChange={setRule}
        />
        <output aria-label="Rule">{JSON.stringify(rule)}</output>
      </>
    )
  }
  const choose = (field: string, label: string) => {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: field }))
    fireEvent.click(screen.getByText(label))
  }
  render(<Editor />)
  choose('Repeat', 'Every weekday (Monday to Friday)')
  expect(screen.getByText(/First occurrence moves to 2026-11-30/)).toBeInTheDocument()
  choose('Repeat', 'Custom')
  expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Saturday' })).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(screen.getByRole('button', { name: 'Saturday' }))
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Repeat interval' }), { target: { value: '2' } })
  choose('Ends', 'After')
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Number of occurrences' }), { target: { value: '3' } })
  expect(JSON.parse(screen.getByLabelText('Rule').textContent ?? '')).toEqual({
    frequency: 'week',
    interval: 2,
    weekdays: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA'],
    end: { type: 'after', count: 3 },
  })
  choose('Repeat', 'Does not repeat')
  expect(screen.queryByRole('combobox', { name: 'Ends' })).toBeNull()
  expect(screen.getByLabelText('Rule').textContent).toBe('')
})
