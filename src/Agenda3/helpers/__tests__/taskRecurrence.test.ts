import dayjs from 'dayjs'
import { expect, test } from 'vitest'

import type { AgendaTaskWithStart } from '@/types/task'

import { transformAgendaTaskToCalendarEvent } from '../fullCalendar'
import { classifyNeedsReview } from '../needsReview'
import { transformTasksToKanbanTasks } from '../task'
import { getDueTaskEndNotifications } from '../taskEndNotifications'
import {
  getSessionOccurrences,
  parseTaskRecurrence,
  validateRecurringSchedule,
  type TaskRecurrence,
} from '../taskRecurrence'
import { getDailyTimeTotals, getTaskTimeTotals } from '../taskTime'

const session = (id: string, date: string, minutes = 60) => {
  const start = dayjs(date)
  return { id, start, end: start.add(minutes, 'minute') }
}
const range = (start: string, end: string) => ({ start: dayjs(start), end: dayjs(end) })
const never = { type: 'never' } as const
const weekdays: TaskRecurrence = {
  frequency: 'week',
  interval: 1,
  weekdays: ['MO', 'TU', 'WE', 'TH', 'FR'],
  end: never,
}

test.each<{ rule: TaskRecurrence; start: string; end: string; expected: string[] }>([
  {
    rule: { frequency: 'day', interval: 1, end: never },
    start: '2026-11-26',
    end: '2026-11-29',
    expected: ['2026-11-26', '2026-11-27', '2026-11-28'],
  },
  {
    rule: { frequency: 'week', interval: 1, end: never },
    start: '2026-11-26',
    end: '2026-12-10',
    expected: ['2026-11-26', '2026-12-03'],
  },
  {
    rule: { frequency: 'month', interval: 1, end: never },
    start: '2027-01-31',
    end: '2027-06-01',
    expected: ['2027-01-31', '2027-03-31', '2027-05-31'],
  },
  {
    rule: { frequency: 'month', interval: 1, monthPattern: 'weekday', end: never },
    start: '2027-01-11',
    end: '2027-04-01',
    expected: ['2027-01-11', '2027-02-08', '2027-03-08'],
  },
  {
    rule: { frequency: 'month', interval: 1, monthPattern: 'weekday', end: never },
    start: '2026-11-30',
    end: '2027-02-01',
    expected: ['2026-11-30', '2026-12-28', '2027-01-25'],
  },
  {
    rule: { frequency: 'year', interval: 1, end: never },
    start: '2028-02-29',
    end: '2033-01-01',
    expected: ['2028-02-29', '2032-02-29'],
  },
  {
    rule: weekdays,
    start: '2026-11-28',
    end: '2026-12-07',
    expected: ['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04'],
  },
])('generates the expected dates for $rule.frequency from $start', ({ rule, start, end, expected }) => {
  const sessions = [session('a', `${start}T09:00`)]
  const occurrences = getSessionOccurrences(sessions, rule, range(start, end))
  expect(occurrences.map((item) => item.occurrenceDate)).toEqual(expected)
  expect(occurrences.every((item) => item.start.format('HH:mm') === '09:00')).toBe(true)
})

test('custom weekdays skip to the first matching day and count each selected date in active weeks', () => {
  const sessions = [session('a', '2026-11-28T09:00'), session('b', '2026-11-29T17:00', 30)]
  const rule: TaskRecurrence = {
    frequency: 'week',
    interval: 2,
    weekdays: ['MO', 'WE'],
    end: { type: 'after', count: 3 },
  }
  expect(validateRecurringSchedule(sessions, rule).map((item) => item.start.format('YYYY-MM-DD HH:mm'))).toEqual([
    '2026-11-30 09:00',
    '2026-12-01 17:00',
  ])
  const occurrences = getSessionOccurrences(sessions, rule, range('2026-11-28', '2027-01-01'))
  expect(occurrences.map((item) => item.occurrenceDate)).toEqual([
    '2026-11-30',
    '2026-11-30',
    '2026-12-02',
    '2026-12-02',
    '2026-12-14',
    '2026-12-14',
  ])
  expect(occurrences.at(-1)?.start.format('YYYY-MM-DD HH:mm')).toBe('2026-12-15 17:00')
  expect(getSessionOccurrences(sessions, rule, range('2026-12-15', '2026-12-16'))).toHaveLength(1)
  expect(getSessionOccurrences(sessions, rule, range('2026-12-16', '2027-01-01'))).toEqual([])
})

test('an inclusive end date limits cycle starts and leaves overnight sessions visible', () => {
  const sessions = [session('overnight', '2026-11-28T23:30', 120)]
  const rule: TaskRecurrence = { frequency: 'day', interval: 2, end: { type: 'on', date: '2026-11-30' } }
  const occurrences = getSessionOccurrences(sessions, rule, range('2026-12-01', '2026-12-02'))
  expect(occurrences.map((item) => [item.occurrenceDate, item.end.format('YYYY-MM-DD HH:mm')])).toEqual([
    ['2026-11-30', '2026-12-01 01:30'],
  ])
})

test.each(['2026-03-28', '2026-10-24'])('a series keeps its wall-clock start and elapsed duration from %s', (date) => {
  const rule: TaskRecurrence = { frequency: 'day', interval: 1, end: { type: 'after', count: 3 } }
  const occurrences = getSessionOccurrences([session('a', `${date}T09:00`, 90)], rule, {
    start: dayjs(date),
    end: dayjs(date).add(3, 'day'),
  })
  expect(occurrences.map((item) => [item.start.format('HH:mm'), item.end.diff(item.start, 'minute')])).toEqual([
    ['09:00', 90],
    ['09:00', 90],
    ['09:00', 90],
  ])
})

test('rule validation rejects malformed rules and endings before the first matching day', () => {
  for (const rule of [
    { ...weekdays, interval: 0 },
    { ...weekdays, weekdays: [] },
    { ...weekdays, frequency: 'day' },
    { ...weekdays, end: { type: 'after', count: 0 } },
    { ...weekdays, end: { type: 'on', date: '2026-02-30' } },
  ])
    expect(() => parseTaskRecurrence(JSON.stringify(rule))).toThrow('Invalid recurrence')
  expect(() =>
    validateRecurringSchedule([session('a', '2026-11-28T09:00')], {
      ...weekdays,
      end: { type: 'on', date: '2026-11-29' },
    }),
  ).toThrow('first occurrence')
})

test('calendar, Kanban, accounting and notifications use the same task series', () => {
  const sessions = [session('a', '2026-11-30T09:00'), session('b', '2026-12-01T23:30', 120)]
  const task: AgendaTaskWithStart = {
    id: 'task',
    title: 'Focus',
    showTitle: 'Focus',
    status: 'todo',
    allDay: false,
    start: sessions[0].start,
    sessions,
    recurrence: weekdays,
    estimatedTime: 60,
    deadline: { value: dayjs('2026-12-04'), allDay: true },
    project: { id: 'page', originalName: 'Work', isJournal: false, bgColor: '#2196f3' },
    rawBlock: {} as AgendaTaskWithStart['rawBlock'],
    timeLogs: [{ ...session('log', '2026-12-07T13:00', 15), amount: 15 }],
  }
  const visible = range('2026-12-07', '2026-12-08')
  const events = transformAgendaTaskToCalendarEvent(task, { groupType: 'page', range: visible, showTimeLog: true })
  expect(events.map((event) => event.id)).toEqual(['task:session:a:2026-12-07', 'task:log:0'])
  expect(events[0]).toMatchObject({
    editable: false,
    extendedProps: { id: task.id, sessionId: 'a', sessions, deadline: task.deadline },
  })
  expect(
    transformAgendaTaskToCalendarEvent(task, { groupType: 'page', range: visible, showFirstEventInCycleOnly: true }),
  ).toEqual([])
  const first = transformAgendaTaskToCalendarEvent(task, {
    groupType: 'page',
    range: range('2026-11-30', '2026-12-03'),
    showFirstEventInCycleOnly: true,
  })
  expect(first.map(({ id }) => id)).toEqual(['task:session:a:2026-11-30', 'task:session:b:2026-11-30'])
  const cards = transformTasksToKanbanTasks([task], { range: visible })
  expect(cards).toHaveLength(1)
  expect(cards[0]).toMatchObject({ sessionDay: '2026-12-07', daySessionCount: 1, dayPlannedMinutes: 60, sessions })
  expect(cards[0].daySessionStart?.format('YYYY-MM-DD HH:mm')).toBe('2026-12-07 09:00')
  expect(getTaskTimeTotals(task).actualMinutes).toBe(195)
  expect(getDailyTimeTotals([task], '2026-12-07')).toEqual({ estimatedMinutes: undefined, actualMinutes: 75 })
  expect(getDailyTimeTotals([task], '2026-12-08').actualMinutes).toBe(180)
  expect(classifyNeedsReview([task], dayjs('2026-12-07')).overdue[0].reasons).toEqual(['deadline'])
  const since = dayjs('2026-12-09T01:29').valueOf()
  const now = dayjs('2026-12-09T01:30').valueOf()
  expect(getDueTaskEndNotifications([task], since, now)).toEqual([
    { id: 'task', title: 'Focus', end: now, sessionId: 'b' },
  ])
  expect(getDueTaskEndNotifications([{ ...task, status: 'done' }], since, now)).toEqual([])
})
