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

test('session edits preserve estimate, support cancel/retry and removing the last schedule', async () => {
  const first = { id: 'one', start: dayjs('2026-11-24T13:00'), end: dayjs('2026-11-24T14:00') }
  const task = { ...initial, allDay: false, start: first.start, sessions: [first], estimatedTime: 90 }
  const { result } = renderHook(() => useEdit(task, messages))
  act(() =>
    result.current.updateFormData({
      sessions: [...task.sessions, { id: 'two', start: dayjs('2026-11-24T15:00'), end: dayjs('2026-11-24T16:00') }],
    }),
  )
  expect(updateEntity).not.toHaveBeenCalled()
  expect(result.current.timeTotals.actualMinutes).toBe(120)
  act(() => result.current.reset())
  expect(result.current.formData.sessions).toEqual([first])
  expect(result.current.timeTotals.actualMinutes).toBe(60)
  act(() => result.current.updateFormData({ sessions: [] }))
  updateEntity.mockRejectedValueOnce(new Error('offline'))
  await expect(result.current.edit()).rejects.toThrow('offline')
  expect(result.current.formData.sessions).toEqual([])
  expect(result.current.timeTotals.actualMinutes).toBe(0)
  await result.current.edit()
  expect(updateEntity.mock.calls[1][0].data).toMatchObject({ sessions: [], estimatedTime: 90 })
  expect(task.sessions).toEqual([first])
})

test('draft estimates do not resize legacy boxes and logs add to Actual before saving', async () => {
  const task = { ...initial, allDay: false, start: dayjs('2026-11-24T13:00'), estimatedTime: 60 }
  const { result } = renderHook(() => useEdit(task, messages))
  act(() => result.current.updateFormData({ estimatedTime: '2h' }))
  expect(result.current.timeTotals.actualMinutes).toBe(60)
  act(() =>
    result.current.updateFormData({ timeLogs: [{ start: task.start, end: task.start.add(15, 'minute'), amount: 15 }] }),
  )
  expect(result.current.timeTotals).toEqual({ sessionMinutes: 60, manualLogMinutes: 15, actualMinutes: 75 })
  expect(updateEntity).not.toHaveBeenCalled()
  act(() => result.current.reset())
  expect(result.current.timeTotals.actualMinutes).toBe(60)
  act(() => result.current.updateFormData({ estimatedTime: undefined }))
  await result.current.edit()
  expect(updateEntity.mock.lastCall?.[0].data.estimatedTime).toBeUndefined()
  expect(result.current.timeTotals.actualMinutes).toBe(60)
})

test('session form rejects overlaps before saving', async () => {
  const first = { id: 'one', start: dayjs('2026-11-24T13:00'), end: dayjs('2026-11-24T14:00') }
  const { result } = renderHook(() =>
    useEdit({ ...initial, start: first.start, allDay: false, sessions: [first] }, messages),
  )
  act(() => result.current.updateFormData({ sessions: [first, { ...first, id: 'two' }] }))
  await expect(result.current.edit()).rejects.toThrow('overlap')
  expect(updateEntity).not.toHaveBeenCalled()
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

test('loads size, retains failed edits, resets cancelled changes and allows clearing it', async () => {
  const task = { ...initial, start: dayjs('2026-11-24'), size: 'XL' as const }
  const { result } = renderHook(() => useEdit(task, messages))
  expect(result.current.formData.size).toBe('XL')
  act(() => result.current.updateFormData({ size: 'M' }))
  updateEntity.mockRejectedValueOnce(new Error('offline'))
  await expect(result.current.edit()).rejects.toThrow('offline')
  expect(result.current.formData.size).toBe('M')
  expect(task.size).toBe('XL')
  act(() => result.current.reset())
  expect(result.current.formData.size).toBe('XL')
  act(() => result.current.updateFormData({ size: undefined }))
  await result.current.edit()
  expect(updateEntity.mock.calls[1][0].data).toHaveProperty('size', undefined)
})

test('existing tasks stay unset; failed priority edits are retained and can be retried or cancelled', async () => {
  const task = { ...initial, start: dayjs('2026-11-24'), priority: undefined }
  const { result } = renderHook(() => useEdit(task, messages))
  expect(result.current.formData.priority).toBeUndefined()
  await result.current.edit()
  expect(updateEntity.mock.lastCall?.[0].data).toHaveProperty('priority', undefined)
  act(() => result.current.updateFormData({ priority: 'highest' }))
  updateEntity.mockRejectedValueOnce(new Error('offline'))
  await expect(result.current.edit()).rejects.toThrow('offline')
  expect(result.current.formData.priority).toBe('highest')
  expect(task.priority).toBeUndefined()
  await result.current.edit()
  expect(updateEntity.mock.lastCall?.[0].data.priority).toBe('highest')
  act(() => result.current.reset())
  expect(result.current.formData.priority).toBeUndefined()
})

test('loads an existing priority and persists an explicit clear', async () => {
  const task = { ...initial, start: dayjs('2026-11-24'), priority: 'low' as const }
  const { result } = renderHook(() => useEdit(task, messages))
  expect(result.current.formData.priority).toBe('low')
  act(() => result.current.updateFormData({ priority: undefined }))
  await result.current.edit()
  expect(updateEntity.mock.lastCall?.[0].data).toHaveProperty('priority', undefined)
  expect(task.priority).toBe('low')
})
