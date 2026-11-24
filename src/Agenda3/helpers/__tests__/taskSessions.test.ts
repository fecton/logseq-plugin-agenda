import dayjs from 'dayjs'
import { afterEach, expect, test, vi } from 'vitest'

import type { AgendaEntity } from '@/types/entity'
import type { AgendaTaskWithStart } from '@/types/task'

import { parseAgendaDrawer, updateBlockSessions, updateTaskBlock } from '../block'
import { transformAgendaTaskToCalendarEvent } from '../fullCalendar'
import { classifyNeedsReview } from '../needsReview'
import {
  separateTasksInDay,
  transformBlockToAgendaEntity,
  transformTasksToKanbanTasks,
  type BlockFromQuery,
} from '../task'
import { getDueTaskEndNotifications } from '../taskEndNotifications'
import {
  applySessionOperation,
  getTaskSessions,
  mergeSessionEdits,
  parseSessions,
  serializeSessions,
  serializeTaskWrite,
  validateSessions,
  type PlannedSession,
} from '../taskSessions'

const session = (id: string, start: string, minutes = 60): PlannedSession => ({
  id,
  start: dayjs(start),
  end: dayjs(start).add(minutes, 'minute'),
})
const legacy = {
  id: 'task',
  title: '[#A] Work',
  showTitle: 'Work',
  status: 'todo',
  allDay: false,
  start: dayjs('2026-11-24T13:00'),
  estimatedTime: 60,
  size: 'XL',
  priority: 'blocker',
  project: { id: 'page', originalName: 'Work', bgColor: '#2196f3' },
  rawBlock: {},
} as AgendaTaskWithStart
const originalContent =
  'DOING [#A] Work\nSCHEDULED: <2026-11-24 Tue 13:00>\nDEADLINE: <2026-12-01 Tue>\n:AGENDA:\nestimated: 1h\nsize: XL\npriority: blocker\ncustom: https://host:42/path\n:END:\n:LOGBOOK:\nCLOCK: [2026-11-24 Tue 13:00:00]--[2026-11-24 Tue 14:00:00] => 01:00:00\n:END:\nnotes:: keep'

function mockBlock(content = originalContent) {
  const block = {
    uuid: 'task',
    marker: 'DOING',
    content,
    scheduled: 20261124,
    deadline: 20261201,
    format: 'markdown',
    page: { id: 1, uuid: 'page', originalName: 'Work' },
    propertiesTextValues: {},
  } as unknown as BlockFromQuery
  const update = vi.fn(async (_id: string, next: string) => {
    block.content = next
  })
  vi.stubGlobal('logseq', {
    Editor: { getBlock: vi.fn(async () => block), updateBlock: update, getPage: vi.fn(async () => ({ uuid: 'page' })) },
    App: { getCurrentGraphFavorites: vi.fn(async () => []) },
  })
  return { block, update }
}
afterEach(() => {
  vi.unstubAllGlobals()
})

test('legacy schedules are read as one session without changing the task', () => {
  expect(getTaskSessions(legacy)).toEqual([session('scheduled', '2026-11-24T13:00')])
  expect(legacy.sessions).toBeUndefined()
  expect(getTaskSessions({ ...legacy, allDay: true })).toEqual([])
  expect(getTaskSessions({ ...legacy, sessions: [] })).toEqual([])
  expect(getTaskSessions({ ...legacy, end: legacy.start.add(2, 'day') })).toEqual([])
  expect(getTaskSessions({ ...legacy, rawBlock: { ...legacy.rawBlock, repeated: true } })).toEqual([])
})

test('adding, moving, resizing and removing sessions preserves the block and reloads', async () => {
  const { block } = mockBlock()
  await updateBlockSessions('task', { type: 'add', id: 'second', start: dayjs('2026-11-24T15:00') })
  await updateBlockSessions('task', { type: 'add', id: 'third', start: dayjs('2026-11-25T10:00') })
  const loaded = await transformBlockToAgendaEntity(block, { isInitialized: true }, [])
  expect(loaded.sessions).toHaveLength(3)
  expect(loaded).toMatchObject({ size: 'XL', priority: 'blocker', estimatedTime: 60 })
  await updateBlockSessions('task', {
    type: 'update',
    id: 'second',
    start: dayjs('2026-11-24T17:00'),
    end: dayjs('2026-11-24T17:30'),
  })
  const saved = parseAgendaDrawer(block.content)!.sessions!
  expect(saved.map((s) => s.start.format('DD HH:mm'))).toEqual(['24 13:00', '24 17:00', '25 10:00'])
  expect(saved[1].end.diff(saved[1].start, 'minute')).toBe(30)
  await updateBlockSessions('task', { type: 'remove', id: 'scheduled' })
  expect(block.content).toContain('SCHEDULED: <2026-11-24 Tue 17:00>')
  for (const text of [
    'DOING [#A] Work',
    'DEADLINE: <2026-12-01 Tue>',
    'estimated: 1h',
    'size: XL',
    'priority: blocker',
    'custom: https://host:42/path',
    'CLOCK:',
    'notes:: keep',
  ])
    expect(block.content).toContain(text)
  await updateBlockSessions('task', { type: 'remove', id: 'second' })
  await updateBlockSessions('task', { type: 'remove', id: 'third' })
  expect(block.content).not.toContain('SCHEDULED:')
  expect(parseAgendaDrawer(block.content)?.sessions).toEqual([])
  expect((await transformBlockToAgendaEntity(block, { isInitialized: true }, [])).start).toBeUndefined()
})

test('validates duration, IDs, overlaps, adjacent and overnight sessions', () => {
  expect(() => validateSessions([session('a', '2026-11-24T13:00', 0)])).toThrow('positive duration')
  expect(() => validateSessions([session('a', 'invalid')])).toThrow()
  expect(() => validateSessions([session('a', '2026-11-24T13:00'), session('a', '2026-11-24T15:00')])).toThrow(
    'unique IDs',
  )
  expect(() => validateSessions([session('a', '2026-11-24T13:00'), session('b', '2026-11-24T13:30')])).toThrow(
    'overlap',
  )
  const sessions = [session('a', '2026-11-24T23:30'), session('b', '2026-11-25T00:30')]
  expect(parseSessions(serializeSessions(sessions))).toEqual(sessions)
})

test('malformed data is reported and never silently replaced, including metadata edits', async () => {
  const { block, update } = mockBlock(originalContent.replace('estimated: 1h', 'estimated: 1h\nsessions: [{invalid]'))
  expect(parseAgendaDrawer(block.content)?.sessionsError).toBeTruthy()
  await expect(
    updateBlockSessions('task', { type: 'add', id: 'new', start: dayjs('2026-11-25T10:00') }),
  ).rejects.toThrow('Invalid sessions')
  expect(update).not.toHaveBeenCalled()
  await updateTaskBlock({ ...legacy, priority: 'high', projectId: 'page' }, legacy)
  expect(block.content).toContain('sessions: [{invalid]')
  expect(block.content).toContain('priority: high')
  expect(parseAgendaDrawer(block.content)?.['custom']).toBe('https://host:42/path')
})

test('rapid writes use the latest block and a failed save does not block the next write', async () => {
  const { block, update } = mockBlock()
  update.mockRejectedValueOnce(new Error('offline'))
  const write = (id: string, start: string) =>
    serializeTaskWrite('task', () => updateBlockSessions('task', { type: 'add', id, start: dayjs(start) }))
  const results = await Promise.allSettled([
    write('fail', '2026-11-24T15:00'),
    write('two', '2026-11-24T16:00'),
    write('three', '2026-11-24T18:00'),
  ])
  expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled', 'fulfilled'])
  expect(parseAgendaDrawer(block.content)?.sessions?.map((s) => s.id)).toEqual(['scheduled', 'two', 'three'])
})

test('editor merges unrelated added sessions and rejects conflicting edits', () => {
  const original = [session('a', '2026-11-24T13:00')]
  const current = [...original, session('b', '2026-11-24T15:00')]
  const edited = [session('a', '2026-11-24T17:00')]
  expect(mergeSessionEdits(current, original, edited).map((s) => s.id)).toEqual(['b', 'a'])
  expect(() => mergeSessionEdits([session('a', '2026-11-24T16:00')], original, edited)).toThrow('changed elsewhere')
})

test('calendar keeps all planned sessions and unfinished actual logs with distinct event identities', () => {
  const first = session('a', '2026-10-01T13:00')
  const task = { ...legacy, sessions: [first, session('b', '2026-11-24T15:00')], timeLogs: [{ ...first, amount: 60 }] }
  const events = transformAgendaTaskToCalendarEvent(task, { groupType: 'page', showTimeLog: true })
  expect(events.map((event) => event.id)).toEqual(['task:session:a', 'task:session:b', 'task:log:0'])
  expect(events[2]).toMatchObject({ editable: false, extendedProps: { id: 'task', eventKind: 'time-log' } })
  expect(transformAgendaTaskToCalendarEvent(task)).toHaveLength(2)
  expect(transformAgendaTaskToCalendarEvent({ ...task, status: 'done' })).toHaveLength(2)
})

test('Kanban groups per start day and moving a day leaves other sessions unchanged', () => {
  const task = {
    ...legacy,
    sessions: [
      session('a', '2026-11-24T13:00'),
      session('b', '2026-11-24T15:00', 30),
      session('c', '2026-11-25T10:00'),
    ],
  }
  const cards = transformTasksToKanbanTasks([task])
  expect(cards.map((card) => [card.sessionDay, card.daySessionCount, card.dayPlannedMinutes])).toEqual([
    ['2026-11-24', 2, 90],
    ['2026-11-25', 1, 60],
  ])
  expect([...separateTasksInDay(cards).keys()]).toEqual(['20261124', '20261125'])
  expect(
    applySessionOperation(task, { type: 'move-day', from: '2026-11-24', to: '2026-11-26' }).map((s) =>
      s.start.format('DD HH:mm'),
    ),
  ).toEqual(['25 10:00', '26 13:00', '26 15:00'])
  expect(task.sessions[0].start.format('DD HH:mm')).toBe('24 13:00')
})

test('future sessions prevent schedule overdue; deadlines still count once; each session notifies', () => {
  const task: AgendaEntity = {
    ...legacy,
    sessions: [session('a', '2026-11-20T13:00'), session('b', '2026-11-24T15:00')],
  }
  expect(classifyNeedsReview([task], dayjs('2026-11-24')).count).toBe(0)
  expect(
    classifyNeedsReview([{ ...task, deadline: { value: dayjs('2026-11-21'), allDay: true } }], dayjs('2026-11-24'))
      .overdue[0].reasons,
  ).toEqual(['deadline'])
  expect(classifyNeedsReview([task], dayjs('2026-11-25')).count).toBe(1)
  expect(
    getDueTaskEndNotifications([task], dayjs('2026-11-20').valueOf(), dayjs('2026-11-25').valueOf()).map(
      (n) => n.sessionId,
    ),
  ).toEqual(['a', 'b'])
  expect(getDueTaskEndNotifications([{ ...task, status: 'done' }], 0, dayjs('2026-11-25').valueOf())).toEqual([])
})
