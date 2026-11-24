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

test('creates sessions even when the separate start date is cleared', async () => {
  const messages = { error: vi.fn() } as unknown as MessageInstance
  const { result } = renderHook(() => useCreate({ title: 'Sessions task' }, messages))
  const sessions = [{ id: 'one', start: dayjs('2026-11-24T13:00'), end: dayjs('2026-11-24T14:00') }]
  act(() => result.current.updateFormData({ startDateVal: undefined, sessions }))
  await result.current.create()
  expect(messages.error).not.toHaveBeenCalled()
  expect(addNewEntity.mock.lastCall?.[0].data.sessions).toEqual(sessions)
  expect(addNewEntity.mock.lastCall?.[0].data.estimatedTime).toBeUndefined()
  expect(result.current.timeTotals.actualMinutes).toBe(60)
})

test('a selected time range starts with an unset estimate and an independent session duration', async () => {
  const messages = { error: vi.fn() } as unknown as MessageInstance
  const sessions = [{ id: 'range', start: dayjs('2026-11-24T13:00'), end: dayjs('2026-11-24T14:00') }]
  const { result } = renderHook(() => useCreate({ title: 'Selected range', sessions }, messages))
  expect(result.current.formData.estimatedTime).toBeUndefined()
  act(() => result.current.updateFormData({ estimatedTime: '2h' }))
  expect(result.current.timeTotals.actualMinutes).toBe(60)
  await result.current.create()
  expect(addNewEntity.mock.lastCall?.[0].data).toMatchObject({ estimatedTime: 120, sessions })
})
