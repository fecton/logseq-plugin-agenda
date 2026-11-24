import { act, renderHook } from '@testing-library/react'
import type { MessageInstance } from 'antd/es/message/interface'
import dayjs from 'dayjs'
import { expect, test, vi } from 'vitest'

import useCreate from './useCreate'

const { addNewEntity } = vi.hoisted(() => ({ addNewEntity: vi.fn() }))
vi.mock('@/Agenda3/hooks/useAgendaEntities', () => ({ default: () => ({ addNewEntity }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (value: string) => value }) }))

test('creates a sized task and resets size for the next task', async () => {
  const messages = { error: vi.fn() } as unknown as MessageInstance
  const { result } = renderHook(() => useCreate({ title: 'New task', startDateVal: dayjs('2026-11-24') }, messages))
  expect(result.current.formData.size).toBeUndefined()
  expect(result.current.formData.priority).toBe('medium')
  act(() => result.current.updateFormData({ size: 'XXL' }))
  await result.current.create()
  expect(addNewEntity).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'task',
      data: expect.objectContaining({ title: 'New task', size: 'XXL', priority: 'medium' }),
    }),
  )
  act(() => result.current.reset())
  expect(result.current.formData.size).toBeUndefined()
})

test('can clear the default priority and resets new tasks to Medium', async () => {
  const messages = { error: vi.fn() } as unknown as MessageInstance
  const { result } = renderHook(() => useCreate({ title: 'Task', startDateVal: dayjs('2026-11-24') }, messages))
  act(() => result.current.updateFormData({ priority: undefined }))
  await result.current.create()
  expect(addNewEntity.mock.lastCall?.[0].data).toHaveProperty('priority', undefined)
  act(() => result.current.reset())
  expect(result.current.formData.priority).toBe('medium')
})
