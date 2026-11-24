import type { EventApi } from '@fullcalendar/core'
import { renderHook } from '@testing-library/react'
import dayjs from 'dayjs'
import { beforeEach, expect, test, vi } from 'vitest'

import type { AgendaEntity } from '@/types/entity'

import useSessionScheduling, { captureSessionLeave } from './useSessionScheduling'

const { update, state, error } = vi.hoisted(() => ({
  update: vi.fn(),
  state: { entities: [] as AgendaEntity[] },
  error: vi.fn(),
}))
vi.mock('./useAgendaEntities', () => ({ default: () => ({ updateEntity: update, entities: state.entities }) }))
vi.mock('antd', () => ({ message: { error } }))
beforeEach(() => {
  vi.clearAllMocks()
  update.mockResolvedValue({})
  state.entities = [
    { id: 'task', start: dayjs('2026-11-24T13:00'), allDay: false, estimatedTime: 60, rawBlock: {} } as AgendaEntity,
  ]
})
function drop(session = false) {
  return {
    revert: vi.fn(),
    event: {
      id: session ? 'task:session:scheduled' : 'task',
      start: new Date('2026-11-24T15:00'),
      end: new Date('2026-11-24T16:00'),
      allDay: false,
      extendedProps: session ? { id: 'task', eventKind: 'session', sessionId: 'scheduled' } : {},
      remove: vi.fn(),
    } as unknown as EventApi,
  }
}
test('card drops add a session; moving a time box updates only its session', async () => {
  const { result } = renderHook(() => useSessionScheduling())
  const received = drop()
  await result.current(received, true)
  expect(update).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: 'task-session',
      id: 'task',
      data: expect.objectContaining({ type: 'add', id: expect.any(String) }),
    }),
  )
  expect(received.event.remove).toHaveBeenCalledOnce()
  const moved = drop(true)
  await result.current(moved)
  expect(update).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: 'task-session',
      id: 'task',
      data: expect.objectContaining({ type: 'update', id: 'scheduled' }),
    }),
  )
  expect(moved.event.remove).not.toHaveBeenCalled()
  expect(moved.revert).not.toHaveBeenCalled()
  const transferred = drop(true)
  await result.current(transferred, true)
  expect(update).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: 'task-session',
      id: 'task',
      data: expect.objectContaining({ type: 'update', id: 'scheduled' }),
    }),
  )
})
test('waits for the save and reverts rejected received/moved sessions', async () => {
  const { result } = renderHook(() => useSessionScheduling())
  let reject: (reason: Error) => void = () => {}
  update.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail
      }),
  )
  const received = drop()
  const pending = result.current(received, true)
  expect(received.event.remove).not.toHaveBeenCalled()
  reject(new Error('offline'))
  await pending
  expect(received.revert).toHaveBeenCalledOnce()
  expect(received.event.remove).not.toHaveBeenCalled()
  update.mockRejectedValueOnce(new Error('overlap'))
  const moved = drop(true)
  await result.current(moved)
  expect(moved.revert).toHaveBeenCalledOnce()
  expect(error).toHaveBeenLastCalledWith('overlap')
})

test('calendar-to-calendar moves preserve clock time on month drops and restore the source while saving', async () => {
  const { result } = renderHook(() => useSessionScheduling())
  const info = drop(true)
  Object.assign(info.event, { allDay: true, start: new Date('2026-11-25T00:00'), end: new Date('2026-11-26T00:00') })
  const sourceRevert = vi.fn()
  captureSessionLeave({ event: info.event, revert: sourceRevert })
  await result.current(info, true)
  expect(sourceRevert).toHaveBeenCalledOnce()
  expect(update.mock.lastCall?.[0].data.start.format('DD HH:mm')).toBe('25 13:00')
  expect(update.mock.lastCall?.[0].data.end.format('DD HH:mm')).toBe('25 14:00')
  captureSessionLeave({ event: info.event, revert: sourceRevert })
  update.mockRejectedValueOnce(new Error('offline'))
  await result.current(info, true)
  expect(sourceRevert).toHaveBeenCalledTimes(2)
  expect(info.revert).toHaveBeenCalledOnce()
  Object.assign(info.event, { allDay: false, start: new Date('2026-11-24T18:15'), end: null })
  await result.current(info, true)
  expect(update.mock.lastCall?.[0].data.end.format('DD HH:mm')).toBe('24 19:15')
})
