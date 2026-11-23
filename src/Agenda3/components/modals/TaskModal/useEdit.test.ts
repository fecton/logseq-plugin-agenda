import { act, renderHook } from '@testing-library/react'
import type { MessageInstance } from 'antd/es/message/interface'
import dayjs from 'dayjs'
import { beforeEach, expect, test, vi } from 'vitest'

import type { AgendaEntity } from '@/types/entity'

import useEdit from './useEdit'

const { updateEntity } = vi.hoisted(() => ({ updateEntity: vi.fn() }))
vi.mock('@/Agenda3/hooks/useAgendaEntities', () => ({ default: () => ({ updateEntity }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (value: string) => value }) }))
const messages = { error: vi.fn() } as unknown as MessageInstance
const initial = {
  id: 'task',
  title: 'Task',
  status: 'todo',
  allDay: true,
  project: { id: 'page', originalName: 'Work' },
  rawBlock: {},
} as AgendaEntity
beforeEach(() => {
  vi.clearAllMocks()
  updateEntity.mockResolvedValue(initial)
})

test('an unscheduled task starts without invented dates/times and must get a date before saving', async () => {
  const { result } = renderHook(() => useEdit(initial, messages))
  expect(result.current.formData.startTime).toBeUndefined()
  expect(result.current.formData.deadlineTime).toBeUndefined()
  await expect(result.current.edit()).rejects.toThrow('Pleasse specify start or deadline')
  expect(updateEntity).not.toHaveBeenCalled()
  act(() => result.current.updateFormData({ startDateVal: dayjs('2026-11-24') }))
  await result.current.edit()
  expect(updateEntity.mock.calls[0][0]).toMatchObject({
    type: 'task',
    id: 'task',
    originalTask: initial,
    data: { allDay: true, deadline: undefined },
  })
  expect(updateEntity.mock.calls[0][0].data.start.format('YYYY-MM-DD')).toBe('2026-11-24')
})

test('moving a range preserves its span, duration and deadline; a failed save retains the form', async () => {
  const task = {
    ...initial,
    start: dayjs('2026-11-01'),
    end: dayjs('2026-11-03'),
    estimatedTime: 90,
    deadline: { value: dayjs('2026-11-05T17:00'), allDay: false },
  }
  const { result } = renderHook(() => useEdit(task, messages))
  act(() => result.current.updateFormData({ startDateVal: dayjs('2026-11-24') }))
  updateEntity.mockRejectedValueOnce(new Error('offline'))
  await expect(result.current.edit()).rejects.toThrow('offline')
  expect(result.current.formData.endDateVal?.format('YYYY-MM-DD')).toBe('2026-11-26')
  expect(task.start.format('YYYY-MM-DD')).toBe('2026-11-01')
  await result.current.edit()
  const { data } = updateEntity.mock.calls[1][0]
  expect(data.estimatedTime).toBe(90)
  expect(data.deadline.value.valueOf()).toBe(task.deadline.value.valueOf())
  expect(data.end.format('YYYY-MM-DD')).toBe('2026-11-26')
})

test('rejects reversed multi-day ranges', async () => {
  const { result } = renderHook(() =>
    useEdit({ ...initial, start: dayjs('2026-11-24'), end: dayjs('2026-11-25') }, messages),
  )
  act(() => result.current.updateFormData({ endDateVal: dayjs('2026-11-23') }))
  await expect(result.current.edit()).rejects.toThrow('End date must not precede start date')
  expect(updateEntity).not.toHaveBeenCalled()
})
