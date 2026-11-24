import { act, renderHook } from '@testing-library/react'
import dayjs from 'dayjs'
import { Provider, useAtomValue, useSetAtom } from 'jotai'
import type { ReactNode } from 'react'
import { expect, test } from 'vitest'

import '@/register/dayjs'
import type { AgendaEntity } from '@/types/entity'

import { agendaEntitiesAtom } from './entities'
import { calendarTasksAtom, recentTasksAtom } from './tasks'

test('recent and calendar projections retain a recent session with an old primary date, and follow filtered entities', () => {
  const now = dayjs().startOf('day').add(13, 'hour')
  const task = {
    id: 'task',
    start: now.subtract(60, 'day'),
    allDay: false,
    status: 'todo',
    rawBlock: {},
    sessions: [
      { id: 'old', start: now.subtract(60, 'day'), end: now.subtract(60, 'day').add(1, 'hour') },
      { id: 'new', start: now, end: now.add(1, 'hour') },
    ],
  } as AgendaEntity
  const onlyLog = {
    id: 'log-only',
    status: 'todo',
    sessions: [],
    timeLogs: [{ start: now, end: now.add(30, 'minute'), amount: 30 }],
  } as unknown as AgendaEntity
  const { result } = renderHook(
    () => ({
      recent: useAtomValue(recentTasksAtom),
      calendar: useAtomValue(calendarTasksAtom),
      set: useSetAtom(agendaEntitiesAtom),
    }),
    {
      wrapper: ({ children }: { children?: ReactNode }) => (
        <Provider initialValues={[[agendaEntitiesAtom, [task, onlyLog]]]}>{children}</Provider>
      ),
    },
  )
  expect(result.current.recent.map((entity) => entity.id)).toEqual(['task'])
  expect(result.current.calendar.map((entity) => entity.id)).toEqual(['task', 'log-only'])
  act(() => result.current.set([]))
  expect(result.current.recent).toEqual([])
  expect(result.current.calendar).toEqual([])
})
