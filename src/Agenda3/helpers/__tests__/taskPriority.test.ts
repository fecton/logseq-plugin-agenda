import dayjs from 'dayjs'
import { afterEach, expect, test, vi } from 'vitest'

import type { AgendaTaskWithStart } from '@/types/task'
import { TASK_PRIORITIES } from '@/types/taskPriority'

import { createTaskBlock, parseAgendaDrawer, updateTaskBlock } from '../block'
import { transformBlockToAgendaEntity, type BlockFromQuery } from '../task'
import { sortKanbanTasks } from '../taskPriority'

afterEach(() => {
  vi.unstubAllGlobals()
})

test.each(TASK_PRIORITIES)('creates and reloads priority %s independently of native A/B/C', async (priority) => {
  let saved: BlockFromQuery
  vi.stubGlobal('logseq', {
    Editor: {
      insertBlock: vi.fn(async (_page, content) => {
        saved = {
          uuid: 'task',
          marker: 'TODO',
          priority: 'A',
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
  await createTaskBlock({
    title: '[#A] Task',
    start: dayjs('2026-11-24'),
    allDay: true,
    projectId: 'page',
    size: 'XL',
    priority,
  })
  expect(saved!.content).toContain(`priority: ${priority}`)
  const loaded = await transformBlockToAgendaEntity(saved!, { isInitialized: true }, [])
  expect(loaded).toMatchObject({ priority, size: 'XL', title: '[#A] Task' })
})

test.each([
  ['TODO [#A] Old task', undefined],
  ['TODO [#B] Old task\n:AGENDA:\nsize: L\n:END:', undefined],
  ['TODO Task\n:AGENDA:\npriority: critical\n:END:', undefined],
  ['TODO Task\n:AGENDA:\npriority: \n:END:', undefined],
  ['TODO Task\n:AGENDA:\npriority: HIGH\n:END:', 'high'],
])('reads optional priority safely from %s', (content, expected) => {
  expect(parseAgendaDrawer(content)?.priority).toBe(expected)
})

test.each(['A', 'B', 'C'])(
  'editing priority preserves native #%s, size, dates and metadata',
  async (nativePriority) => {
    const content = `DOING [#${nativePriority}] Task\nSCHEDULED: <2026-11-24 Tue 13:00>\nDEADLINE: <2026-12-01 Tue +1m>\n:AGENDA:\nsize: XL\nestimated: 1h\ncustom: https://host:42/a\n:END:\n:LOGBOOK:\nCLOCK: [2026-11-24 Tue 13:00:00]\n:END:\n\nnotes:: keep`
    const block = { uuid: 'task', marker: 'DOING', content, page: { id: 1 }, propertiesTextValues: {} }
    const update = vi.fn(async (_id, next) => {
      block.content = next
    })
    vi.stubGlobal('logseq', {
      Editor: {
        getBlock: vi.fn(async () => block),
        updateBlock: update,
        getPage: vi.fn(async () => ({ uuid: 'page' })),
      },
    })
    const initial = {
      id: 'task',
      title: `[#${nativePriority}] Task`,
      status: 'todo',
      allDay: false,
      start: dayjs('2026-11-24T13:00'),
      deadline: { value: dayjs('2026-12-01'), allDay: true },
      estimatedTime: 60,
      size: 'XL',
      project: { id: 'page' },
    } as AgendaTaskWithStart
    const high = { ...initial, projectId: 'page', priority: 'high' as const }
    await updateTaskBlock(high, initial)
    const highContent = content.replace(
      'custom: https://host:42/a\n:END:',
      'custom: https://host:42/a\npriority: high\n:END:',
    )
    expect(block.content).toBe(highContent)
    // A caller that omits the field must not erase it.
    await updateTaskBlock({ ...initial, projectId: 'page' }, high)
    expect(block.content).toBe(highContent)
    // Unchanged forms must preserve a newer priority written outside Agenda.
    block.content = highContent.replace('priority: high', 'priority: highest')
    await updateTaskBlock(high, high)
    expect(block.content).toBe(highContent.replace('priority: high', 'priority: highest'))
    update.mockRejectedValueOnce(new Error('offline'))
    await expect(updateTaskBlock({ ...high, priority: 'low' }, high)).rejects.toThrow('offline')
    expect(block.content).toContain('priority: highest')
    await updateTaskBlock({ ...high, priority: 'low' }, high)
    expect(block.content).toBe(highContent.replace('priority: high', 'priority: low'))
    await updateTaskBlock({ ...high, priority: undefined }, { ...high, priority: 'low' })
    expect(block.content).toBe(content)
  },
)

test('sorts unfinished first and ranks unset with Medium, preserving ties and the input', () => {
  const tasks = [
    { id: 'done-highest', status: 'done', priority: 'highest' },
    { id: 'low', status: 'todo', priority: 'low' },
    { id: 'unset-1', status: 'todo' },
    { id: 'medium', status: 'todo', priority: 'medium' },
    { id: 'highest', status: 'todo', priority: 'highest' },
    { id: 'unset-2', status: 'todo' },
    { id: 'high', status: 'todo', priority: 'high' },
    { id: 'lowest', status: 'todo', priority: 'lowest' },
    { id: 'done-low', status: 'done', priority: 'low' },
  ] as AgendaTaskWithStart[]
  const original = [...tasks]
  expect(sortKanbanTasks(tasks).map((task) => task.id)).toEqual([
    'highest',
    'high',
    'unset-1',
    'medium',
    'unset-2',
    'low',
    'lowest',
    'done-highest',
    'done-low',
  ])
  expect(tasks).toEqual(original)
  expect(sortKanbanTasks([])).toEqual([])
})
