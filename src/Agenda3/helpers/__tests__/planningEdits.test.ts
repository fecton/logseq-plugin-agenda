import dayjs from 'dayjs'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { AgendaEntity } from '@/types/entity'
import type { AgendaTaskWithStartOrDeadline } from '@/types/task'

import { updateBlockAgendaDrawer, updateBlockDateInfo, updateBlockTaskStatus, updateTaskBlock } from '../block'

function mockBlock(content: string) {
  const block = {
    uuid: 'task',
    marker: 'DOING',
    content,
    scheduled: 20261001,
    page: { id: 1 },
    propertiesTextValues: {},
  }
  const update = vi.fn(async (_id, newContent) => {
    block.content = newContent
  })
  const move = vi.fn()
  vi.stubGlobal('logseq', {
    Editor: {
      getBlock: vi.fn(async () => block),
      updateBlock: update,
      getPage: vi.fn(async () => ({ uuid: 'page' })),
      moveBlock: move,
    },
  })
  return { block, update, move }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('planning edits preserve task data', () => {
  test('patches only supplied drawer keys, preserving unknown values and bindings', () => {
    const content =
      'DOING Test\n:AGENDA:\nestimated: 45m\nbindObjectiveId: goal\ncustom: https://host:42/a\n:END:\nnotes:: stay'
    expect(updateBlockAgendaDrawer(content, { estimated: 60 })).toBe(content.replace('estimated: 45m', 'estimated: 1h'))
    expect(updateBlockAgendaDrawer(content, {})).toBe(content)
    expect(updateBlockAgendaDrawer(content, { estimated: undefined })).toBe(content.replace('estimated: 45m\n', ''))
  })

  test('date-only rescheduling preserves duration, deadline and multi-day span', async () => {
    const content =
      'DOING Test\nSCHEDULED: <2026-10-01 Thu>\nDEADLINE: <2026-10-08 Thu>\n:AGENDA:\nestimated: 45m\nend: 2026-10-03\nbindObjectiveId: goal\ncustom: leave me\n:END:\nSome notes'
    const { block } = mockBlock(content)
    await updateBlockDateInfo({ uuid: 'task', start: dayjs('2026-11-23'), allDay: true })
    expect(block.content).toBe(
      content
        .replace('SCHEDULED: <2026-10-01 Thu>', 'SCHEDULED: <2026-11-23 Mon>')
        .replace('end: 2026-10-03', 'end: 2026-11-25'),
    )
  })

  test('task editor changes only requested fields on the latest block', async () => {
    const content =
      'DOING Updated outside Agenda\nSCHEDULED: <2026-10-01 Thu 09:00>\nDEADLINE: <2026-12-01 Tue +1m>\n:AGENDA:\nestimated: 45m\ncustom: keep:all\n:END:\n:LOGBOOK:\nCLOCK: [2026-10-01 Thu 09:00:00]--[2026-10-01 Thu 09:15:00] =>  00:15:00\n:END:\nnotes:: preserved'
    const { block, move } = mockBlock(content)
    const initial = {
      id: 'task',
      title: 'Old title',
      status: 'todo',
      start: dayjs('2026-10-01T09:00'),
      allDay: false,
      deadline: { value: dayjs('2026-12-01'), allDay: true },
      estimatedTime: 45,
      project: { id: 'page' },
    } as AgendaEntity
    await updateTaskBlock(
      { ...initial, start: dayjs('2026-11-23T09:00'), projectId: 'page' } as AgendaTaskWithStartOrDeadline,
      initial,
    )
    expect(block.content).toBe(
      content.replace('SCHEDULED: <2026-10-01 Thu 09:00>', 'SCHEDULED: <2026-11-23 Mon 09:00>'),
    )
    expect(move).not.toHaveBeenCalled()
  })

  test('scheduling a backlog task preserves blank lines in its notes', async () => {
    const content = 'DOING Task\n\nParagraph one\n\nParagraph two'
    const { block } = mockBlock(content)
    const initial = { id: 'task', title: 'Task', status: 'todo', allDay: true, project: { id: 'page' } } as AgendaEntity
    await updateTaskBlock({ ...initial, start: dayjs('2026-11-24'), projectId: 'page' }, initial)
    expect(block.content).toBe(content + '\nSCHEDULED: <2026-11-24 Tue>')
    await updateTaskBlock(
      { ...initial, start: dayjs('2026-11-25'), projectId: 'page' },
      { ...initial, start: dayjs('2026-11-24') },
    )
    expect(block.content).toBe(content + '\nSCHEDULED: <2026-11-25 Wed>')
  })

  test('completing reads the latest block and a failed write rejects without changing it', async () => {
    const { block, update } = mockBlock('DOING Latest title\nnotes:: new')
    const task = { id: 'task', rawBlock: { content: 'TODO Stale title', marker: 'TODO' } } as AgendaEntity
    update.mockRejectedValueOnce(new Error('offline'))
    await expect(updateBlockTaskStatus(task, 'done')).rejects.toThrow('offline')
    expect(block.content).toBe('DOING Latest title\nnotes:: new')
    await updateBlockTaskStatus(task, 'done')
    expect(block.content).toBe('DONE Latest title\nnotes:: new')
  })
})
