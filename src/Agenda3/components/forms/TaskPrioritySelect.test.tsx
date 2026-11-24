import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type TaskPriority } from '@/types/taskPriority'

import TaskPrioritySelect from './TaskPrioritySelect'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (value: string) => value }) }))
afterEach(cleanup)

function Form() {
  const [priority, setPriority] = useState<TaskPriority | undefined>('medium')
  return (
    <>
      <TaskPrioritySelect value={priority} onChange={setPriority} />
      <output aria-label="Selected priority">{priority ?? 'Not set'}</output>
    </>
  )
}

test('offers five labeled icons and supports choosing and clearing priority', async () => {
  render(<Form />)
  expect(screen.getByLabelText('Selected priority')).toHaveTextContent('medium')
  for (const priority of TASK_PRIORITIES) {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Priority' }))
    const option = await screen.findByRole('option', { name: `Priority: ${TASK_PRIORITY_LABELS[priority]}` })
    expect(option.querySelector('svg')).not.toBeNull()
    fireEvent.click(option)
    await waitFor(() => expect(screen.getByLabelText('Selected priority').textContent).toBe(priority))
  }
  fireEvent.mouseDown(screen.getByLabelText('close-circle'))
  await waitFor(() => expect(screen.getByLabelText('Selected priority')).toHaveTextContent('Not set'))
})

test('disables priority editing when the task is read-only or saving', () => {
  render(<TaskPrioritySelect value="high" onChange={vi.fn()} disabled />)
  expect(screen.getByRole('combobox', { name: 'Priority' })).toBeDisabled()
  expect(screen.queryByLabelText('close-circle')).not.toBeInTheDocument()
})
