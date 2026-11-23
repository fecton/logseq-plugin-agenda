import { act, renderHook } from '@testing-library/react'
import dayjs from 'dayjs'
import { useAtomValue } from 'jotai'
import { afterEach, expect, test, vi } from 'vitest'

import { reviewDayAtom } from '@/Agenda3/models/entities/needsReview'

import useReviewRefresh from './useReviewRefresh'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

test('refreshes at midnight, after sleep, on focus and debounced database changes; cleans up', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-23T23:59:59'))
  vi.stubEnv('VITE_MODE', 'plugin')
  let dbChanged: () => void = () => {}
  let uiChanged: (event: { visible: boolean }) => void = () => {}
  const offDB = vi.fn()
  const offGraph = vi.fn()
  const offUI = vi.fn()
  vi.stubGlobal('logseq', {
    DB: {
      onChanged: vi.fn((callback) => {
        dbChanged = callback
        return offDB
      }),
    },
    App: { onCurrentGraphChanged: vi.fn(() => offGraph) },
    on: vi.fn((_event, callback) => {
      uiChanged = callback
    }),
    off: offUI,
  })
  const refresh = vi.fn()
  const { result, unmount } = renderHook(() => {
    useReviewRefresh(refresh)
    return useAtomValue(reviewDayAtom)
  })
  expect(refresh).toHaveBeenCalledTimes(1)
  act(() => vi.advanceTimersByTime(1010))
  expect(result.current).toBe('2026-11-24')
  expect(refresh).toHaveBeenCalledTimes(2)
  act(() => {
    dbChanged()
    dbChanged()
    dbChanged()
    vi.advanceTimersByTime(299)
  })
  expect(refresh).toHaveBeenCalledTimes(2)
  act(() => vi.advanceTimersByTime(1))
  expect(refresh).toHaveBeenCalledTimes(3)
  act(() => {
    vi.setSystemTime(new Date('2026-11-26T10:00:00'))
    window.dispatchEvent(new Event('focus'))
  })
  expect(result.current).toBe('2026-11-26')
  act(() => uiChanged({ visible: true }))
  expect(refresh).toHaveBeenCalledTimes(5)
  act(() => {
    vi.setSystemTime(new Date('2026-11-27T10:00:00'))
    vi.advanceTimersByTime(60_000)
  })
  expect(result.current).toBe(dayjs().format('YYYY-MM-DD'))
  unmount()
  expect(offDB).toHaveBeenCalledOnce()
  expect(offGraph).toHaveBeenCalledOnce()
  expect(offUI).toHaveBeenCalledWith('ui:visible:changed', uiChanged)
  expect(vi.getTimerCount()).toBe(0)
})
