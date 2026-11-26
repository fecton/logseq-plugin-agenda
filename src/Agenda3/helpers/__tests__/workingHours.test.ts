import dayjs from 'dayjs'
import { expect, test } from 'vitest'

import { findConflictingOccurrence, getSessionOccurrences, type TaskRecurrence } from '../taskRecurrence'
import {
  DEFAULT_WORKING_HOURS,
  blockedActivityError,
  getWorkingHours,
  readWorkingHours,
  validateWorkingHours,
  workingHoursError,
  type BlockedActivity,
} from '../workingHours'

const splitHours = { ...DEFAULT_WORKING_HOURS, enabled: true }
const date = (day: number, time: string) => new Date(`2026-11-${day}T${time}`)
const sleep: BlockedActivity = { name: 'Sleep', preset: 'daily', customDays: [], start: '22:00', end: '06:00' }
const work: BlockedActivity = { name: 'Work', preset: 'workdays', customDays: [], start: '09:00', end: '17:00' }

test('split hours allow exact boundaries and block the gap and non-working days', () => {
  const { allows } = getWorkingHours(splitHours)!
  expect(allows(date(26, '08:00'), date(26, '10:00'))).toBe(true)
  expect(allows(date(26, '18:00'), date(26, '20:00'))).toBe(true)
  expect(allows(date(26, '09:45'), date(26, '10:15'))).toBe(false)
  expect(allows(date(26, '10:00'), date(26, '10:15'))).toBe(false)
  expect(allows(date(26, '09:00'), date(26, '19:00'))).toBe(false)
  expect(allows(date(28, '08:00'), date(28, '10:00'))).toBe(false)

  const weekend = getWorkingHours({ ...splitHours, preset: 'weekends' })!
  expect(weekend.allows(date(28, '08:00'), date(28, '10:00'))).toBe(true)
  expect(weekend.allows(date(26, '08:00'), date(26, '10:00'))).toBe(false)

  const custom = getWorkingHours({ ...splitHours, preset: 'custom', customDays: [4, 6] })!
  expect(custom.allows(date(26, '08:00'), date(26, '10:00'))).toBe(true)
  expect(custom.allows(date(27, '08:00'), date(27, '10:00'))).toBe(false)
  expect(custom.allows(date(28, '08:00'), date(28, '10:00'))).toBe(true)
})

test('settings round-trip while malformed settings and disabled schedules allow unrestricted Time Box use', () => {
  const disabled = { ...splitHours, enabled: false }
  expect(readWorkingHours(JSON.stringify(disabled))).toEqual(disabled)
  expect(getWorkingHours(readWorkingHours(JSON.stringify(disabled)))).toBeUndefined()
  expect(getWorkingHours(readWorkingHours('{"enabled": true}'))).toBeUndefined()
  expect(workingHoursError({ ...splitHours, preset: 'custom', customDays: [] })).toMatch(/working day/)
  expect(workingHoursError({ ...splitHours, ranges: [{ start: '10:00', end: '08:00' }] })).toMatch(/start time/)
  expect(
    workingHoursError({ ...splitHours, ranges: [...splitHours.ranges, { start: '09:59', end: '10:30' }] }),
  ).toMatch(/overlap/)
})

test('adjacent periods and midnight work as continuous time only where the next day is covered', () => {
  const hours = getWorkingHours({
    ...splitHours,
    ranges: [
      { start: '00:00', end: '02:00' },
      { start: '21:00', end: '22:00' },
      { start: '22:00', end: '24:00' },
    ],
  })!
  expect(hours.blockedPeriods.filter(({ day }) => day === 4)).toEqual([
    { day: 4, start: '02:00', end: '21:00', label: '' },
  ])
  expect(hours.allows(date(26, '21:30'), date(27, '01:30'))).toBe(true)
  expect(hours.allows(date(27, '22:00'), date(28, '00:00'))).toBe(true)
  expect(hours.allows(date(27, '22:00'), date(28, '00:01'))).toBe(false)
})

test('compiles daily overnight and workday activities into the same non-working schedule', () => {
  const hours = getWorkingHours({ ...DEFAULT_WORKING_HOURS, blockedActivities: [sleep, work] })!
  const thursday = hours.blockedPeriods.filter(({ day }) => day === 4)
  const saturday = hours.blockedPeriods.filter(({ day }) => day === 6)
  expect(thursday.map(({ start, end, label }) => [start, end, label])).toEqual([
    ['00:00', '06:00', 'Sleep'],
    ['09:00', '17:00', 'Work'],
    ['22:00', '24:00', 'Sleep'],
  ])
  expect(saturday.map(({ label }) => label)).toEqual(['Sleep', 'Sleep'])
  expect(hours.allows(date(27, '04:00'), date(27, '06:00'))).toBe(false)
  expect(hours.allows(date(27, '06:00'), date(27, '09:00'))).toBe(true)
  expect(hours.allows(date(27, '08:30'), date(27, '09:30'))).toBe(false)
  expect(hours.allows(date(28, '08:30'), date(28, '09:30'))).toBe(true)
})

test('merges overlapping blocks and honors the selected start day for an overnight activity', () => {
  const shift: BlockedActivity = {
    ...work,
    name: 'Shift',
    preset: 'custom',
    customDays: [5],
    start: '21:00',
    end: '01:00',
  }
  const hours = getWorkingHours({ ...DEFAULT_WORKING_HOURS, blockedActivities: [sleep, shift] })!
  expect(hours.blockedPeriods.filter(({ day }) => day === 6)).toMatchObject([
    { start: '00:00', end: '01:00', label: 'Sleep · Shift' },
    { start: '01:00', end: '06:00', label: 'Sleep' },
    { start: '22:00', end: '24:00', label: 'Sleep' },
  ])
  expect(hours.allows(date(27, '20:00'), date(27, '21:00'))).toBe(true)
  expect(hours.allows(date(26, '21:00'), date(26, '22:00'))).toBe(true)
  expect(hours.allows(date(27, '21:00'), date(27, '22:00'))).toBe(false)
})

test('activities further restrict saved work periods and old settings still load', () => {
  const { enabled, preset, customDays, ranges } = splitHours
  const legacy = { enabled, preset, customDays, ranges }
  const stored = readWorkingHours(JSON.stringify(legacy))
  expect(stored).toEqual(splitHours)
  const hours = getWorkingHours({ ...stored, blockedActivities: [work] })!
  expect(hours.allows(date(26, '08:00'), date(26, '09:00'))).toBe(true)
  expect(hours.allows(date(26, '08:00'), date(26, '10:00'))).toBe(false)
  expect(hours.allows(date(28, '08:00'), date(28, '09:00'))).toBe(false)
  expect(readWorkingHours(JSON.stringify({ ...legacy, blockedActivities: [null, work] })).blockedActivities).toEqual([
    work,
  ])
  expect(blockedActivityError({ ...sleep, end: sleep.start })).toBeTruthy()
})

test('an activity on a later weekday blocks a repeating task even with work periods disabled', async () => {
  const hours = getWorkingHours({ ...DEFAULT_WORKING_HOURS, blockedActivities: [work] })!
  const validate = validateWorkingHours(hours, (start) => start.format('YYYY-MM-DD HH:mm'))
  const sessions = [{ id: 'sat', start: dayjs('2026-11-28T09:00'), end: dayjs('2026-11-28T10:00') }]
  await expect(
    validate({ sessions, recurrence: { frequency: 'day', interval: 1, end: { type: 'after', count: 3 } } }),
  ).rejects.toThrow('2026-11-30 09:00')
})
const springStart = new Date('2026-03-29T01:30:00+01:00')
const springEnd = new Date('2026-03-29T03:30:00+02:00')

test.skipIf(springStart.getHours() !== 1 || springEnd.getHours() !== 3 || springEnd.getTimezoneOffset() !== -120)(
  'daylight saving checks both sides of a clock change',
  () => {
    const hours = getWorkingHours({ ...splitHours, preset: 'weekends', ranges: [{ start: '01:30', end: '03:30' }] })!
    const fallStart = new Date('2026-10-25T01:30:00+02:00')
    const fallEnd = new Date('2026-10-25T03:30:00+01:00')
    expect(hours.allows(springStart, springEnd)).toBe(true)
    expect(hours.allows(fallStart, fallEnd)).toBe(true)
    expect(hours.allows(fallStart, new Date(fallEnd.getTime() + 15 * 60_000))).toBe(false)
    const beforeFallback = new Date('2026-10-25T02:45:00+02:00')
    const afterFallback = new Date('2026-10-25T02:45:00+01:00')
    const narrow = getWorkingHours({ ...splitHours, preset: 'weekends', ranges: [{ start: '02:30', end: '03:00' }] })!
    expect(narrow.allows(beforeFallback, afterFallback)).toBe(false)
  },
)

test('validates future repeats and allows a finite series ending before a conflict', async () => {
  const validate = validateWorkingHours(getWorkingHours(splitHours)!, (start) => start.format('YYYY-MM-DD HH:mm'))
  const sessions = [{ id: 'fri', start: dayjs('2026-11-27T08:00'), end: dayjs('2026-11-27T10:00') }]
  const recurrence: TaskRecurrence = { frequency: 'day', interval: 1, end: { type: 'never' } }
  await expect(validate({ sessions, recurrence })).rejects.toThrow('2026-11-28 08:00')
  const sunday = { id: 'sun', start: dayjs('2026-11-29T08:00'), end: dayjs('2026-11-29T10:00') }
  await expect(validate({ sessions: [...sessions, sunday], recurrence })).rejects.toThrow('2026-11-28 08:00')
  await expect(
    validate({ sessions, recurrence: { ...recurrence, end: { type: 'after', count: 1 } } }),
  ).resolves.toBeUndefined()
  await expect(
    validate({ sessions, recurrence: { ...recurrence, end: { type: 'on', date: '2026-11-27' } } }),
  ).resolves.toBeUndefined()
  await expect(validate({ sessions, recurrence }, { sessions, recurrence })).resolves.toBeUndefined()
})

test.each<Partial<TaskRecurrence>>([
  { frequency: 'day', interval: 2 },
  { frequency: 'week', interval: 2, weekdays: ['MO', 'TH'] },
  { frequency: 'month', interval: 2, monthPattern: 'date' },
  { frequency: 'month', interval: 1, monthPattern: 'weekday' },
  { frequency: 'year', interval: 2 },
])('batched validation matches rendered dates for %j', async (pattern) => {
  const recurrence: TaskRecurrence = { frequency: 'day', interval: 1, end: { type: 'after', count: 280 }, ...pattern }
  const start = dayjs('2026-11-26T09:00')
  const sessions = [{ id: 'a', start, end: start.add(1, 'hour') }]
  const rendered = getSessionOccurrences(sessions, recurrence, { start, end: start.add(600, 'year') })
  const checked: number[] = []
  const conflict = await findConflictingOccurrence(sessions, recurrence, (start) => {
    checked.push(start.valueOf())
    return true
  })
  expect(conflict).toBeUndefined()
  expect(checked).toHaveLength(280)
  expect(checked).toEqual(rendered.map(({ start }) => start.valueOf()))
})
