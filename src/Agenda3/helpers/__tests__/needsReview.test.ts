import dayjs from 'dayjs'
import { describe, expect, test } from 'vitest'

import type { AgendaEntity } from '@/types/entity'

import { classifyNeedsReview } from '../needsReview'

const today = dayjs('2026-11-23T12:00:00')
const task = (id: string, overrides: Partial<AgendaEntity> = {}): AgendaEntity =>
  ({
    id,
    title: id,
    showTitle: id,
    status: 'todo',
    allDay: true,
    project: { id: 'page', originalName: 'Work' },
    rawBlock: {},
    ...overrides,
  } as AgendaEntity)
const ids = (result: ReturnType<typeof classifyNeedsReview>) => ({
  overdue: result.overdue.map(({ task }) => task.id),
  count: result.count,
})

describe('needs review', () => {
  test('includes all overdue history and deduplicates reasons; unscheduled and future-deadline tasks do not count', () => {
    const both = task('both', {
      start: today.subtract(2, 'day'),
      deadline: { value: today.subtract(1, 'day'), allDay: true },
    })
    const result = classifyNeedsReview(
      [
        both,
        both,
        task('old', { start: today.subtract(100, 'day') }),
        task('deadline-only', { deadline: { value: today.subtract(3, 'day'), allDay: true } }),
        task('future-deadline', { deadline: { value: today.add(1, 'day'), allDay: true } }),
        task('backlog'),
      ],
      today,
    )
    expect(ids(result)).toEqual({
      overdue: ['old', 'deadline-only', 'both'],
      count: 3,
    })
    expect(result.overdue[2].reasons).toEqual(['schedule', 'deadline'])
  })

  test('waits until the next local day, including exact midnight and timed deadlines', () => {
    const tasks = [
      task('today', { start: today.startOf('day'), allDay: false }),
      task('deadline', { deadline: { value: today.startOf('day'), allDay: false } }),
      task('future', { start: today.add(1, 'day') }),
    ]
    expect(ids(classifyNeedsReview(tasks, today))).toEqual({ overdue: [], count: 0 })
    expect(classifyNeedsReview(tasks, dayjs('2026-11-23T23:59:59')).overdue).toHaveLength(0)
    expect(classifyNeedsReview(tasks, dayjs('2026-11-24T00:00:00')).overdue.map(({ task }) => task.id)).toEqual([
      'deadline',
      'today',
    ])
  })

  test('uses the inclusive final day of multi-day tasks and timed durations spanning midnight', () => {
    const tasks = [
      task('ongoing', { start: today.subtract(20, 'day'), end: today }),
      task('range-overdue', { start: today.subtract(20, 'day'), end: today.subtract(1, 'day') }),
      task('overnight', { start: dayjs('2026-11-22T23:45:00'), allDay: false }),
      task('custom-duration', { start: dayjs('2026-11-22T23:00:00'), allDay: false, estimatedTime: 90 }),
    ]
    expect(ids(classifyNeedsReview(tasks, today)).overdue).toEqual(['range-overdue'])
    expect(classifyNeedsReview(tasks, today.add(1, 'day')).overdue).toHaveLength(4)
  })

  test('excludes completed, historical and objective records and does not expand recurrence', () => {
    const result = classifyNeedsReview(
      [
        task('done', { status: 'done' }),
        task('history', { recurringPast: true }),
        task('goal', { objective: { type: 'week', year: 2026, number: 48 } }),
        task('recurring', {
          start: today.subtract(30, 'day'),
          rrule: { freq: 'daily', interval: 1, dtstart: today.subtract(30, 'day').format() },
        }),
      ],
      today,
    )
    expect(ids(result)).toEqual({ overdue: ['recurring'], count: 1 })
  })

  test('rescheduling clears only the schedule reason; marking done clears the item', () => {
    const initial = task('task', {
      start: today.subtract(1, 'day'),
      deadline: { value: today.subtract(1, 'day'), allDay: true },
    })
    const moved = { ...initial, start: today.add(1, 'day') }
    expect(classifyNeedsReview([moved], today).overdue[0].reasons).toEqual(['deadline'])
    expect(classifyNeedsReview([{ ...moved, deadline: undefined }], today).count).toBe(0)
    expect(classifyNeedsReview([{ ...initial, status: 'done' }], today).count).toBe(0)
  })
})
