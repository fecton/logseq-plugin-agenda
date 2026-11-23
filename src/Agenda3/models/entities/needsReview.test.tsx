import { act, renderHook } from '@testing-library/react'
import dayjs from 'dayjs'
import { Provider, useAtomValue, useSetAtom } from 'jotai'
import React from 'react'
import { expect, test, vi } from 'vitest'

import type { AgendaEntity } from '@/types/entity'

import { settingsAtom } from '../settings'
import { invalidateEntitiesAtom, refreshEntitiesAtom } from './entities'
import { needsReviewAtom } from './needsReview'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('@/Agenda3/helpers/task', () => ({ getAgendaEntities: query }))
const task = {
  id: 'one',
  title: 'Task',
  status: 'todo',
  start: dayjs('2025-01-01'),
  project: { id: 'page', originalName: 'Work' },
} as AgendaEntity

test('refresh uses active filters and discards obsolete query results', async () => {
  const initialSettings = { isInitialized: true, selectedFilters: ['work'] }
  const { result } = renderHook(
    () => ({
      planning: useAtomValue(needsReviewAtom),
      refresh: useSetAtom(refreshEntitiesAtom),
      setSettings: useSetAtom(settingsAtom),
      invalidate: useSetAtom(invalidateEntitiesAtom),
    }),
    { wrapper: ({ children }) => <Provider initialValues={[[settingsAtom, initialSettings]]}>{children}</Provider> },
  )
  let oldResult: (tasks: AgendaEntity[]) => void = () => {}
  query.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        oldResult = resolve
      }),
  )
  let oldRequest: Promise<void>
  act(() => {
    oldRequest = result.current.refresh()
  })
  expect(query).toHaveBeenLastCalledWith(initialSettings)
  act(() => result.current.setSettings({ isInitialized: true, selectedFilters: ['personal'] }))
  query.mockResolvedValueOnce([])
  await act(async () => {
    await result.current.refresh()
  })
  expect(query).toHaveBeenLastCalledWith({ isInitialized: true, selectedFilters: ['personal'] })
  await act(async () => {
    oldResult([task])
    await oldRequest
  })
  expect(result.current.planning.count).toBe(0)

  query.mockResolvedValueOnce([task])
  await act(async () => {
    await result.current.refresh()
  })
  expect(result.current.planning.count).toBe(1)
  query.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        oldResult = resolve
      }),
  )
  act(() => {
    oldRequest = result.current.refresh()
    result.current.invalidate()
  })
  await act(async () => {
    oldResult([])
    await oldRequest
  })
  expect(result.current.planning.count).toBe(1)
})
