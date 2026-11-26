import { act, renderHook, waitFor } from '@testing-library/react'
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

function setup(settings: Settings = { isInitialized: true }) {
  const block = { uuid: 'task', marker: 'TODO', content: 'TODO Task', page: { id: 1 } }
  const updateBlock = vi.fn(async (_id: string, content: string) => {
    block.content = content
    block.marker = content.split(' ')[0]
  })
  vi.stubGlobal('logseqAppUserConfigs', { preferredWorkflow: 'todo' })
  vi.stubGlobal('logseq', {
    App: { getCurrentGraphFavorites: vi.fn(async () => []) },
    Editor: {
      getBlock: vi.fn(async () => ({ ...block })),
      getPage: vi.fn(async () => ({ uuid: 'page', originalName: 'Work' })),
      updateBlock,
    },
  })
  const task = { id: block.uuid, status: 'todo' } as AgendaEntity
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
    result.current.updateEntity({ type: 'task-status', id: task.id, data: 'done', completionSource: button })
  return { block, updateBlock, result, complete, button }
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
