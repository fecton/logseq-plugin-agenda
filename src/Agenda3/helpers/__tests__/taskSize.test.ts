import dayjs from 'dayjs'
import { afterEach, expect, test, vi } from 'vitest'

import { TASK_SIZES } from '@/types/taskSize'

import { createTaskBlock, parseAgendaDrawer } from '../block'
import { transformBlockToAgendaEntity, type BlockFromQuery } from '../task'

afterEach(() => {
  vi.unstubAllGlobals()
})

test.each(TASK_SIZES)('creates and reloads a task with size %s', async (size) => {
  let saved: BlockFromQuery
  vi.stubGlobal('logseq', {
    Editor: {
      insertBlock: vi.fn(async (_page, content) => {
        saved = {
          uuid: 'task',
          marker: 'TODO',
          content,
          scheduled: 20261124,
          format: 'markdown',
          page: { uuid: 'page', originalName: 'Work' },
        } as unknown as BlockFromQuery
        return saved
      }),
      getBlock: vi.fn(async () => saved),
    },
  })
  const block = await createTaskBlock({
    title: 'Sized task',
    projectId: 'page',
    start: dayjs('2026-11-24'),
    allDay: true,
    size,
  })
  expect(block?.content).toContain(`size: ${size}`)
  const loaded = await transformBlockToAgendaEntity(saved!, { isInitialized: true }, [])
  expect(loaded.size).toBe(size)
  expect(loaded.title).toBe('Sized task')
})

test.each([
  ['TODO No drawer', undefined],
  ['TODO Old task\n:AGENDA:\nestimated: 30m\n:END:', undefined],
  ['TODO Task\n:AGENDA:\nsize: huge\n:END:', undefined],
  ['TODO Task\n:AGENDA:\nsize: \n:END:', undefined],
  ['TODO Task\n:AGENDA:\nsize: xl\n:END:', 'XL'],
])('reads optional size safely from %s', (content, expected) => {
  expect(parseAgendaDrawer(content)?.size).toBe(expected)
})
