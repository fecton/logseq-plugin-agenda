import dayjs from 'dayjs'
import { expect, test } from 'vitest'

import type { AgendaEntity } from '@/types/entity'

import { getDailyTimeTotals, getTaskTimeTotals } from '../taskTime'

const session = (id: string, start: string, minutes: number) => ({
  id,
  start: dayjs(start),
  end: dayjs(start).add(minutes, 'minute'),
})
const task: AgendaEntity = {
  id: 'task',
  title: 'Task',
  showTitle: 'Task',
  project: { id: 'page', originalName: 'Work', isJournal: false },
  status: 'todo',
  allDay: false,
  start: dayjs('2099-01-01T13:00'),
  estimatedTime: 120,
  sessions: [session('one', '2099-01-01T13:00', 60), session('two', '2099-01-02T15:00', 60)],
  timeLogs: [{ ...session('log', '2099-01-01T13:00', 15), amount: 15 }],
  rawBlock: {} as AgendaEntity['rawBlock'],
}

test('future sessions and overlapping manual logs are additive; completion and estimates do not alter Actual', () => {
  expect(getTaskTimeTotals(task)).toEqual({ sessionMinutes: 120, manualLogMinutes: 15, actualMinutes: 135 })
  expect(getTaskTimeTotals({ ...task, estimatedTime: undefined }).actualMinutes).toBe(135)
  expect(getTaskTimeTotals({ ...task, estimatedTime: 500, status: 'done' } as AgendaEntity).actualMinutes).toBe(135)
  expect(getTaskTimeTotals({ ...task, sessions: [], timeLogs: [] }).actualMinutes).toBe(0)
  expect(getTaskTimeTotals({ ...task, sessions: [] }).actualMinutes).toBe(15)
})

test('daily totals allocate the estimate once, deduplicate tasks and respect visible/completed inputs', () => {
  expect(getDailyTimeTotals([task, task], '2099-01-01')).toEqual({ estimatedMinutes: 120, actualMinutes: 75 })
  expect(getDailyTimeTotals([task], '2099-01-02')).toEqual({ estimatedMinutes: undefined, actualMinutes: 60 })
  expect(getDailyTimeTotals([{ ...task, status: 'done' }], '2099-01-01', true)).toEqual({
    estimatedMinutes: undefined,
    actualMinutes: 0,
  })
  expect(getDailyTimeTotals([], '2099-01-01').actualMinutes).toBe(0)
  expect(getDailyTimeTotals([{ ...task, recurringPast: true }, task], '2099-01-01').actualMinutes).toBe(75)
  expect(getDailyTimeTotals([{ ...task, objective: {} } as AgendaEntity], '2099-01-01').actualMinutes).toBe(0)
})

test('overnight boxes and logs belong wholly to their start day, including log-only tasks', () => {
  const overnight = {
    ...task,
    start: dayjs('2099-01-01T23:00'),
    sessions: [session('night', '2099-01-01T23:00', 120)],
    timeLogs: [{ ...session('log', '2099-01-02T23:30', 90), amount: 90 }],
  }
  expect(getDailyTimeTotals([overnight], '2099-01-01')).toEqual({ estimatedMinutes: 120, actualMinutes: 120 })
  expect(getDailyTimeTotals([overnight], '2099-01-02')).toEqual({ estimatedMinutes: undefined, actualMinutes: 90 })
  expect(getDailyTimeTotals([overnight], '2099-01-03').actualMinutes).toBe(0)
  expect(getDailyTimeTotals([{ ...overnight, start: undefined, sessions: [] }], '2099-01-02').actualMinutes).toBe(90)
})

test('all-day, range and recurring tasks gain no artificial Actual; malformed sessions remain unavailable', () => {
  const legacy = { ...task, sessions: undefined, timeLogs: [] }
  expect(getTaskTimeTotals(legacy).actualMinutes).toBe(120)
  expect(getTaskTimeTotals({ ...legacy, estimatedTime: undefined }).actualMinutes).toBe(30)
  expect(getTaskTimeTotals({ ...legacy, allDay: true }).actualMinutes).toBe(0)
  expect(getTaskTimeTotals({ ...legacy, end: dayjs('2099-01-03') }).actualMinutes).toBe(0)
  expect(getTaskTimeTotals({ ...legacy, rawBlock: { ...legacy.rawBlock, repeated: true } }).actualMinutes).toBe(0)
  expect(getTaskTimeTotals({ ...task, sessionsError: 'Invalid sessions' })).toEqual({ manualLogMinutes: 15 })
  expect(
    getDailyTimeTotals([{ ...task, sessionsError: 'Invalid sessions' }], '2099-01-01').actualMinutes,
  ).toBeUndefined()
})

test('an old first session keeps the estimate outside the current day; deadline-only estimates remain manual', () => {
  const old = { ...task, sessions: [session('old', '2020-01-01T10:00', 30), ...task.sessions!] }
  expect(getDailyTimeTotals([old], '2099-01-01')).toEqual({ estimatedMinutes: undefined, actualMinutes: 75 })
  const deadlineOnly = {
    ...task,
    start: undefined,
    sessions: [],
    timeLogs: [],
    deadline: { value: dayjs('2099-01-04'), allDay: true },
  }
  expect(getDailyTimeTotals([deadlineOnly], '2099-01-04')).toEqual({ estimatedMinutes: 120, actualMinutes: 0 })
  expect(
    getDailyTimeTotals([{ ...deadlineOnly, estimatedTime: undefined }], '2099-01-04').estimatedMinutes,
  ).toBeUndefined()
})
