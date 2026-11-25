import dayjs from 'dayjs'
import { describe, expect, test } from 'vitest'

import '@/register/dayjs'
import type { AgendaTaskWithStartOrDeadline } from '@/types/task'

import { getDateView, navigateDateView, normalizeDateView, type DateView } from '../dateViews'
import { separateTasksInDay, transformTasksToKanbanTasks } from '../task'

const dates = (view: DateView, anchor: string, firstDay = 1) =>
  getDateView(view, anchor, firstDay).days.map((day) => day.format('YYYY-MM-DD'))

test('defaults invalid and missing preferences to workweek', () => {
  for (const value of [undefined, null, '', 'timeGridWeek', 5]) expect(normalizeDateView(value)).toBe('workWeek')
  expect(normalizeDateView('threeDays')).toBe('threeDays')
})

test('short ranges retain the anchor and weekends; workweek stays Monday–Friday even on Sunday', () => {
  expect(dates('day', '2026-11-28')).toEqual(['2026-11-28'])
  expect(dates('threeDays', '2026-11-28')).toEqual(['2026-11-28', '2026-11-29', '2026-11-30'])
  expect(dates('workWeek', '2026-11-29', 0)).toEqual([
    '2026-11-23',
    '2026-11-24',
    '2026-11-25',
    '2026-11-26',
    '2026-11-27',
  ])
})

test('full weeks respect any configured week start', () => {
  expect(dates('week', '2026-11-25', 0)[0]).toBe('2026-11-22')
  expect(dates('week', '2026-11-25', 1)[0]).toBe('2026-11-23')
  expect(dates('week', '2026-11-25', 6)).toEqual([
    '2026-11-21',
    '2026-11-22',
    '2026-11-23',
    '2026-11-24',
    '2026-11-25',
    '2026-11-26',
    '2026-11-27',
  ])
})

test('month padding uses whole weeks, including leap February and year boundaries', () => {
  expect(dates('month', '2024-02-29')).toHaveLength(35)
  expect(dates('month', '2024-02-29')).toContain('2024-02-29')
  expect(dates('month', '2021-02-10')).toHaveLength(28)
  expect(dates('month', '2026-11-25')).toHaveLength(42)
  const january = dates('month', '2027-01-31', 0)
  expect(january[0]).toBe('2026-12-27')
  expect(january.at(-1)).toBe('2027-02-06')
})

test('navigation advances the selected date by the range and clamps month-end safely', () => {
  expect(navigateDateView('day', '2026-12-31', 1)).toBe('2027-01-01')
  expect(navigateDateView('threeDays', '2026-12-31', 1)).toBe('2027-01-03')
  for (const view of ['week', 'workWeek'] as const) expect(navigateDateView(view, '2026-01-01', -1)).toBe('2025-12-25')
  expect(navigateDateView('month', '2024-01-31', 1)).toBe('2024-02-29')
  expect(navigateDateView('month', '2026-12-15', 1)).toBe('2027-01-15')
  expect(getDateView('threeDays', '2026-12-31').title).toBe('31 Dec 2026 – 2 Jan 2027')
})

test('visible dates remain local midnights across both daylight-saving changes', () => {
  for (const date of ['2026-03-28', '2026-10-24']) {
    const range = getDateView('threeDays', date)
    expect(range.days.map((day) => day.format('HH:mm'))).toEqual(['00:00', '00:00', '00:00'])
    expect(new Set(range.days.map((day) => day.format('YYYY-MM-DD'))).size).toBe(3)
    expect(range.end.format('YYYY-MM-DD')).toBe(navigateDateView('threeDays', date, 1))
  }
})

describe('bounded board projections', () => {
  const task = (data: Partial<AgendaTaskWithStartOrDeadline>) =>
    ({
      id: 'task',
      title: 'Task',
      status: 'todo',
      allDay: true,
      start: dayjs('2020-01-01'),
      ...data,
    } as AgendaTaskWithStartOrDeadline)
  const range = { start: dayjs('2027-02-01'), end: dayjs('2027-02-04') }

  test('recurring occurrences and multi-day spans use explicit dates beyond the old window', () => {
    const repeating = task({ rrule: { freq: 'daily', interval: 1, dtstart: '2020-01-01' } })
    const spanning = task({ id: 'span', end: dayjs('2030-01-01') })
    const results = transformTasksToKanbanTasks([repeating, spanning], { range })
    expect(results).toHaveLength(6)
    expect([...separateTasksInDay(results).keys()]).toEqual(['20270201', '20270202', '20270203'])
    expect(transformTasksToKanbanTasks([repeating], { range, showFirstEventInCycleOnly: true })).toEqual([])
    expect(transformTasksToKanbanTasks([task({ end: dayjs('2020-01-02') })], { range })).toEqual([])
  })

  test('recent sessions on an old task appear once per start day, retaining full task accounting', () => {
    const sessions = [
      { id: 'old', start: dayjs('2020-01-01T09:00'), end: dayjs('2020-01-01T10:00') },
      { id: 'overnight', start: dayjs('2027-02-02T23:00'), end: dayjs('2027-02-03T01:00') },
      { id: 'earlier', start: dayjs('2027-02-02T14:00'), end: dayjs('2027-02-02T15:00') },
      { id: 'exclusive-end', start: dayjs('2027-02-04T00:00'), end: dayjs('2027-02-04T01:00') },
    ]
    const results = transformTasksToKanbanTasks([task({ allDay: false, sessions })], { range })
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ sessionDay: '2027-02-02', daySessionCount: 2, dayPlannedMinutes: 180 })
    expect(results[0].sessions).toBe(sessions)
  })

  test('deadline-only and ordinary tasks are bounded without mutating the source', () => {
    const input = [
      task({ id: 'deadline', start: undefined, deadline: { value: dayjs('2027-02-03'), allDay: true } }),
      task({ id: 'old' }),
      task({ id: 'end', start: range.end }),
    ]
    expect(transformTasksToKanbanTasks(input, { range }).map((task) => task.id)).toEqual(['deadline'])
    expect(input[1].start?.format('YYYY-MM-DD')).toBe('2020-01-01')
  })
})
