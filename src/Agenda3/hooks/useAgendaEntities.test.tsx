import { act, renderHook, waitFor } from '@testing-library/react'
import dayjs from 'dayjs'
import { Provider } from 'jotai'
import type { ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import type { AgendaEntity } from '@/types/entity'

import { agendaEntitiesAtom } from '../models/entities/entities'
import { settingsAtom, type Settings } from '../models/settings'
import useAgendaEntities from './useAgendaEntities'

const { prepareCompletionFeedback, celebrate } = vi.hoisted(() => {
  const celebrate = vi.fn()
  return { celebrate, prepareCompletionFeedback: vi.fn(() => celebrate) }
})
vi.mock('../helpers/completionFeedback', () => ({ prepareCompletionFeedback }))

function setup(settings: Settings = { isInitialized: true }, repeatingContent?: string) {
  const block = {
    uuid: 'task',
    marker: 'TODO',
    content: repeatingContent ?? 'TODO Task',
    page: { id: 1 },
    format: 'markdown',
    scheduled: repeatingContent ? 20261127 : undefined,
    'repeated?': Boolean(repeatingContent),
  }
  const updateBlock = vi.fn(async (_id: string, content: string) => {
    block.content = content
    block.marker = content.split(' ')[0]
    const scheduled = /^SCHEDULED: <(\d{4}-\d{2}-\d{2})/m.exec(content)?.[1]
    if (scheduled) block.scheduled = Number(scheduled.replaceAll('-', ''))
  })
  const checkEditing = vi.fn(async (): Promise<boolean | string> => false)
  vi.stubGlobal('logseqAppUserConfigs', { preferredWorkflow: 'todo' })
  vi.stubGlobal('logseq', {
    App: { getCurrentGraphFavorites: vi.fn(async () => []) },
    Editor: {
      getBlock: vi.fn(async () => ({ ...block })),
      getPage: vi.fn(async () => ({ uuid: 'page', originalName: 'Work' })),
      checkEditing,
      updateBlock,
    },
  })
  const task = {
    id: block.uuid,
    status: 'todo',
    ...(repeatingContent && { rawBlock: { ...block, repeated: true } }),
  } as unknown as AgendaEntity
  const { result } = renderHook(useAgendaEntities, {
    wrapper: ({ children }: { children?: ReactNode }) => (
      <Provider
        initialValues={[
          [agendaEntitiesAtom, [task]],
          [settingsAtom, settings],
        ]}
      >
        {children}
      </Provider>
    ),
  })
  const button = document.createElement('button')
  const complete = () =>
    result.current.updateEntity({
      type: 'task-status',
      id: task.id,
      data: 'done',
      completionSource: button,
      ...(repeatingContent && {
        nativeOccurrence: { start: dayjs('2026-11-27'), expectedContent: repeatingContent },
      }),
    })
  return { block, updateBlock, checkEditing, result, complete, button }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

test('prepares feedback synchronously and celebrates once after the serialized save', async () => {
  const { block, button, complete, result, updateBlock } = setup()
  let finishSave!: () => void
  updateBlock.mockImplementationOnce(
    (_id, content) =>
      new Promise<void>((resolve) => {
        finishSave = () => {
          block.marker = 'DONE'
          block.content = content
          resolve()
        }
      }),
  )

  await act(async () => {
    const first = complete()
    const second = complete()
    expect(prepareCompletionFeedback).toHaveBeenCalledWith(button)
    expect(updateBlock).not.toHaveBeenCalled()
    await waitFor(() => expect(updateBlock).toHaveBeenCalledTimes(1))
    expect(celebrate).not.toHaveBeenCalled()
    finishSave()
    await Promise.all([first, second])
  })

  expect(result.current.entities[0].status).toBe('done')
  expect(updateBlock).toHaveBeenCalledTimes(1)
  expect(celebrate).toHaveBeenCalledTimes(1)
})

test('keeps failed saves, already-done tasks, reopening, and objective updates quiet', async () => {
  const { block, button, complete, result, updateBlock } = setup()
  updateBlock.mockRejectedValueOnce(new Error('offline'))
  await expect(complete()).rejects.toThrow('offline')
  expect(block.marker).toBe('TODO')

  block.marker = 'DONE'
  block.content = 'DONE Task'
  await act(async () => {
    await complete()
    await result.current.updateEntity({ type: 'task-status', id: 'task', data: 'todo', completionSource: button })
    await result.current.updateEntity({ type: 'objective-status', id: 'task', data: 'done' })
  })

  expect(prepareCompletionFeedback).toHaveBeenCalledTimes(2)
  expect(celebrate).not.toHaveBeenCalled()
})

test('celebrates when the completed task is removed by an active filter', async () => {
  const { complete, result } = setup({ isInitialized: true, selectedFilters: ['work'] })
  await act(async () => {
    await complete()
  })
  expect(result.current.entities).toEqual([])
  expect(celebrate).toHaveBeenCalledTimes(1)
})

const repeating = 'TODO Task\nSCHEDULED: <2026-11-27 Fri +1d>'

test('a double-click advances the original block once and shows the open series and completed occurrence', async () => {
  const agendaDrawer =
    ':AGENDA:\nend: 2026-12-03\nsessions: [{"id":"old","start":"2026-12-01T10:00","end":"2026-12-01T11:00"}]\n:END:'
  const { block, complete, result, updateBlock } = setup({ isInitialized: true }, repeating + '\n' + agendaDrawer)

  await act(async () => {
    const [first, second] = await Promise.allSettled([complete(), complete()])
    expect(first.status).toBe('fulfilled')
    expect(second.status).toBe('rejected')
  })

  expect(updateBlock).toHaveBeenCalledTimes(1)
  expect(block.content).toContain('SCHEDULED: <2026-11-28 Sat +1d>')
  expect(block.content).toContain(agendaDrawer)
  const [series, history] = result.current.entities
  expect(series).toMatchObject({
    id: 'task',
    status: 'todo',
    allDay: true,
    end: undefined,
    rawBlock: { repeated: true },
    rrule: { interval: 1 },
  })
  expect(series.start?.format('YYYY-MM-DD')).toBe('2026-11-28')
  expect(history).toMatchObject({ status: 'done', recurringPast: true })
  await expect(result.current.updateEntity({ type: 'task-status', id: history.id, data: 'todo' })).rejects.toThrow(
    'already complete',
  )
  expect(celebrate).toHaveBeenCalledTimes(1)
})

test('leaves a repeating task open when editing, saving fails, or the write cannot be verified', async () => {
  const { block, checkEditing, complete, result, updateBlock } = setup({ isInitialized: true }, repeating)
  checkEditing.mockResolvedValueOnce('task')
  await expect(complete()).rejects.toThrow('Finish editing')
  expect(updateBlock).not.toHaveBeenCalled()

  updateBlock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
  await expect(complete()).rejects.toThrow('offline')
  await expect(complete()).rejects.toThrow('Could not verify')
  expect(block.content).toBe(repeating)
  expect(result.current.entities).toHaveLength(1)
  expect(celebrate).not.toHaveBeenCalled()
})
