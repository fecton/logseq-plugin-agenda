import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import { TASK_SIZES, type TaskSize } from '@/types/taskSize'

import TaskSizeSelect from './TaskSizeSelect'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (value: string) => value }) }))
afterEach(cleanup)

function Form() {
  const [size, setSize] = useState<TaskSize>()
  return (
    <>
      <TaskSizeSelect value={size} onChange={setSize} />
      <output aria-label="Selected size">{size ?? 'Not set'}</output>
    </>
  )
}

test('offers all five labeled icons and supports choosing and clearing size', async () => {
  render(<Form />)
  expect(screen.getByLabelText('Selected size')).toHaveTextContent('Not set')
  for (const size of TASK_SIZES) {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Size' }))
    const option = await screen.findByRole('option', { name: `Size: ${size}` })
    expect(option.querySelector('svg')).not.toBeNull()
    fireEvent.click(option)
    await waitFor(() => expect(screen.getByLabelText('Selected size').textContent).toBe(size))
  }
  fireEvent.mouseDown(screen.getByLabelText('close-circle'))
  await waitFor(() => expect(screen.getByLabelText('Selected size')).toHaveTextContent('Not set'))
})

test('disables size editing when the task cannot be edited', () => {
  render(<TaskSizeSelect value="L" onChange={vi.fn()} disabled />)
  expect(screen.getByRole('combobox', { name: 'Size' })).toBeDisabled()
  expect(screen.queryByLabelText('close-circle')).not.toBeInTheDocument()
})
