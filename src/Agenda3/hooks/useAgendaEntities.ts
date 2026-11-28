import type { BlockEntity } from '@logseq/libs/dist/LSPlugin.user'
import { message, notification } from 'antd'
import { type Dayjs } from 'dayjs'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useCallback } from 'react'

import type { NativeOccurrence } from '@/Agenda3/helpers/nativeRepeat'
import { projectCompletionHistory, transformBlockToAgendaEntity } from '@/Agenda3/helpers/task'
import { serializeTaskWrite, type SessionOperation } from '@/Agenda3/helpers/taskSessions'
import type { ScheduleValidator } from '@/Agenda3/helpers/workingHours'
import { settingsAtom } from '@/Agenda3/models/settings'
import type { AgendaEntity } from '@/types/entity'
import type { AgendaObjective } from '@/types/objective'
import type { AgendaTaskWithStart, AgendaTaskWithStartOrDeadline, CreateAgendaTask } from '@/types/task'

import type { CreateObjectiveForm } from '../components/modals/ObjectiveModal/CreateObjectiveModal'
import type { EditObjectiveForm } from '../components/modals/ObjectiveModal/EditObjectiveModal'
import {
  createObjectiveBlock,
  createTaskBlock,
  deleteBlockDateInfo,
  deleteEntityBlock,
  transformBlockToBlockFromQuery,
  updateBlockDateInfo,
  updateBlockTaskStatus,
  updateObjectiveBlock,
  updateTaskBlock,
  updateBlockSessions,
} from '../helpers/block'
import { prepareCompletionFeedback } from '../helpers/completionFeedback'
import { agendaEntitiesAtom, invalidateEntitiesAtom, refreshEntitiesAtom } from '../models/entities/entities'

const useAgendaEntities = () => {
  const settings = useAtomValue(settingsAtom)
  const [entities, setEntities] = useAtom(agendaEntitiesAtom)
  const refresh = useSetAtom(refreshEntitiesAtom)
  const invalidate = useSetAtom(invalidateEntitiesAtom)

  const refreshEntities = useCallback(() => {
    if (!settings.isInitialized) return Promise.resolve()
    return refresh()
  }, [settings, refresh])

  const updateEntity = async (
    params: (
      | {
          type: 'task'
          id: string
          data: AgendaEntity & { projectId?: string }
          originalTask?: AgendaEntity
        }
      | { type: 'task-session'; id: string; data: SessionOperation }
      | {
          type: 'task-date'
          id: string
          data: { allDay: boolean; start: Dayjs; end?: Dayjs }
        }
      | {
          type: 'task-status'
          id: string
          data: AgendaTaskWithStart['status']
          completionSource?: HTMLElement
          nativeOccurrence?: NativeOccurrence
        }
      | {
          type: 'task-remove-date'
          id: string
          data: { day: string } | null
        }
      | {
          type: 'objective'
          id: string
          data: Partial<EditObjectiveForm>
        }
      | {
          type: 'objective-status'
          id: string
          data: AgendaObjective['status']
        }
    ) & { validateSchedule?: ScheduleValidator },
  ) => {
    const celebrate =
      params.type === 'task-status' && params.data === 'done' && params.completionSource
        ? prepareCompletionFeedback(params.completionSource)
        : undefined

    return serializeTaskWrite(params.id, async () => {
      const { type, id, data, validateSchedule } = params
      const task = entities.find((task) => task.id === id)
      if (!task) {
        message.error('Entity not found')
        throw new Error('Entity not found')
      }
      let rawBlock: BlockEntity | null = null
      let previousMarker: string | undefined
      let completedOccurrence = false
      invalidate()
      switch (type) {
        case 'task-session':
          rawBlock = await updateBlockSessions(id, data, validateSchedule)
          break
        case 'task':
          rawBlock = await updateTaskBlock(data, params.originalTask, validateSchedule)
          break
        case 'task-date':
          rawBlock = await updateBlockDateInfo({ ...data, uuid: id }, validateSchedule)
          break
        case 'task-status':
        case 'objective-status': {
          const statusUpdate = await updateBlockTaskStatus(
            task,
            data,
            type === 'task-status' ? params.nativeOccurrence : undefined,
          )
          rawBlock = statusUpdate?.block ?? null
          previousMarker = statusUpdate?.previousMarker
          completedOccurrence = statusUpdate?.completedOccurrence === true
          break
        }
        case 'task-remove-date':
          rawBlock = await deleteBlockDateInfo(id, data?.day)
          break
        case 'objective':
          // 如果执行到这个分支，说明 task.objective 一定存在
          rawBlock = await updateObjectiveBlock({
            ...task,
            ...data,
          } as AgendaObjective)
          break
        default:
          break
      }
      const block = await transformBlockToBlockFromQuery(rawBlock)
      if (!block) {
        message.error('Failed to edit block')
        throw new Error('Failed to edit block')
      }

      const newTask = await transformBlockToAgendaEntity(block, settings)
      if (completedOccurrence || (previousMarker && previousMarker !== 'DONE' && newTask.status === 'done')) {
        celebrate?.()
      }
      invalidate()
      const isReplacedHistory = (entity: AgendaEntity) =>
        completedOccurrence && entity.recurringPast && entity.rawBlock.uuid === id
      const isFilterMode = (settings.selectedFilters || [])?.length > 0
      if (isFilterMode && (newTask.filters ?? []).length === 0) {
        const message = type.startsWith('task')
          ? 'Edit task successful but task is hidden'
          : 'Edit objective successful but objective is hidden'
        const description = type.startsWith('task')
          ? 'Task was hidden because it dose not match any of your filters.'
          : 'Objective was hidden because it dose not match any of your filters.'
        notification.info({
          message,
          description,
          duration: 0,
        })
        setEntities((_tasks) => _tasks.filter((task) => task.id !== id && !isReplacedHistory(task)))
        return newTask
      }
      const history = completedOccurrence ? projectCompletionHistory(newTask) : []
      setEntities((_tasks) =>
        _tasks.flatMap((task) => {
          if (isReplacedHistory(task)) return []
          return task.id === id ? [{ ...task, ...newTask }, ...history] : [task]
        }),
      )
      return newTask
    })
  }

  const deleteEntity = (id: string) => {
    deleteEntityBlock(id)
    setEntities((_tasks) => _tasks.filter((task) => task.id !== id))
  }

  const addNewEntity = async (
    params:
      | { type: 'task'; data: CreateAgendaTask; validateSchedule?: ScheduleValidator }
      | {
          type: 'objective'
          data: CreateObjectiveForm
        },
  ) => {
    const { type, data } = params
    const block = await transformBlockToBlockFromQuery(
      type === 'task' ? await createTaskBlock(data, params.validateSchedule) : await createObjectiveBlock(data),
    )
    if (!block) {
      message.error('Failed to create block')
      throw new Error('Failed to create block')
    }
    const newTask = await transformBlockToAgendaEntity(block, settings)
    const isFilterMode = (settings.selectedFilters || [])?.length > 0
    if (isFilterMode && (newTask.filters ?? []).length === 0) {
      const message =
        type === 'task'
          ? 'Create task successful but task is hidden'
          : 'Create objective successful but objective is hidden'
      const description =
        type === 'task'
          ? 'Task was hidden because it dose not match any of your filters.'
          : 'Objective was hidden because it dose not match any of your filters.'
      notification.info({
        message,
        description,
        duration: 0,
      })
      return false
    }
    console.log('[faiz:] === newTask', newTask)
    setEntities((_tasks) => _tasks.concat(newTask))
    return newTask
  }

  return {
    entities,
    refreshEntities,
    updateEntity,
    addNewEntity,
    deleteEntity,
  }
}

export default useAgendaEntities
