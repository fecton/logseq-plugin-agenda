import type { MessageInstance } from 'antd/es/message/interface'
import { isDayjs, type Dayjs } from 'dayjs'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { object, string, optional, special, type Output, safeParse, array, number, union, picklist } from 'valibot'

import { genDurationString, parseDurationString } from '@/Agenda3/helpers/block'
import { getTaskSessions, serializeSessions, validateSessions } from '@/Agenda3/helpers/taskSessions'
import { getTaskTimeTotals } from '@/Agenda3/helpers/taskTime'
import useAgendaEntities from '@/Agenda3/hooks/useAgendaEntities'
import type { AgendaEntity, AgendaEntityDeadline } from '@/types/entity'
import type { AgendaTaskWithStartOrDeadline } from '@/types/task'
import { TASK_PRIORITIES } from '@/types/taskPriority'
import { TASK_SIZES } from '@/types/taskSize'

import { genStart } from './useCreate'

const DayjsSchema = special<Dayjs>((input) => isDayjs(input) && input.isValid())
const SessionsSchema = array(object({ id: string(), start: DayjsSchema, end: DayjsSchema }))
const BaseFormSchema = object({
  title: string(),
  endDateVal: optional(DayjsSchema),
  startTime: optional(string()),
  deadlineTime: optional(string()),
  estimatedTime: optional(string()),
  timeLogs: optional(
    array(
      object({
        start: DayjsSchema,
        end: DayjsSchema,
        amount: number(),
      }),
    ),
  ),
  projectId: optional(string()),
  bindObjectiveId: optional(string()),
  size: optional(picklist(TASK_SIZES)),
  priority: optional(picklist(TASK_PRIORITIES)),
  sessions: optional(SessionsSchema),
})
const StartFormSchema = object({
  ...BaseFormSchema.entries,
  startDateVal: DayjsSchema,
  deadlineDateVal: optional(DayjsSchema),
})
const DeadlineFormSchema = object({
  ...BaseFormSchema.entries,
  startDateVal: optional(DayjsSchema),
  deadlineDateVal: DayjsSchema,
})
const SessionFormSchema = object({
  ...BaseFormSchema.entries,
  sessions: SessionsSchema,
  startDateVal: optional(DayjsSchema),
  deadlineDateVal: optional(DayjsSchema),
})
const EditFormSchema = union([StartFormSchema, DeadlineFormSchema, SessionFormSchema])
type EditTaskForm = Output<typeof EditFormSchema>
type EditTaskFormNoValidation = Partial<EditTaskForm>
const useEdit = (initialTask: AgendaEntity | null, messageApi: MessageInstance) => {
  const { t } = useTranslation()
  const { updateEntity } = useAgendaEntities()
  const initialFormData = {
    title: initialTask?.title || '',
    startDateVal: initialTask?.start,
    endDateVal: initialTask?.end,
    deadlineDateVal: initialTask?.deadline?.value,
    deadlineTime:
      initialTask?.deadline && !initialTask.deadline.allDay ? initialTask.deadline.value.format('HH:mm') : undefined,
    startTime: initialTask?.start && !initialTask.allDay ? initialTask.start.format('HH:mm') : undefined,
    estimatedTime: initialTask?.estimatedTime ? genDurationString(initialTask.estimatedTime) : undefined,
    timeLogs: initialTask?.timeLogs || [],
    projectId: initialTask?.project?.id,
    bindObjectiveId: initialTask?.bindObjectiveId,
    size: initialTask?.size,
    priority: initialTask?.priority,
    sessions:
      initialTask && (getTaskSessions(initialTask).length || initialTask.sessions !== undefined)
        ? getTaskSessions(initialTask)
        : undefined,
  }
  const [formData, setFormData] = useState<EditTaskFormNoValidation>(initialFormData)

  const allDay = !formData.startTime
  const start = formData.startDateVal ? genStart(allDay, formData.startDateVal, formData.startTime) : undefined
  const deadline = formData.deadlineDateVal
    ? ({
        value: genStart(!formData.deadlineTime, formData.deadlineDateVal, formData.deadlineTime),
        allDay: !formData.deadlineTime,
      } satisfies AgendaEntityDeadline)
    : undefined

  const updateFormData = (data: EditTaskFormNoValidation) => {
    setFormData((_data) => {
      const newData = {
        ..._data,
        ...data,
      }
      // Moving just the start of a range keeps its original span.
      if (data.startDateVal && !('endDateVal' in data) && _data.startDateVal && _data.endDateVal) {
        newData.endDateVal = data.startDateVal.add(_data.endDateVal.diff(_data.startDateVal, 'day'), 'day')
      }
      return newData
    })
  }
  const reset = () => {
    setFormData(initialFormData)
  }
  const edit = async () => {
    // start 与 deadline 不能同时为空
    if (!start && !deadline && formData.sessions === undefined) {
      const message = t('Pleasse specify start or deadline')
      messageApi.error(message)
      throw new Error(message)
    }
    if (formData.title?.trim()?.length === 0) {
      const message = t('Title cannot be empty')
      messageApi.error(message)
      throw new Error(message)
    }
    const result = safeParse(EditFormSchema, formData)
    if (!result.success || !initialTask) {
      messageApi.error('Failed to edit task block')
      console.error('Failed to edit task block', result)
      throw new Error('Failed to edit task block')
    }
    if (formData.endDateVal && (!start || formData.endDateVal.isBefore(start, 'day'))) {
      const message = t('End date must not precede start date')
      messageApi.error(message)
      throw new Error(message)
    }
    const estimatedTime = result.output.estimatedTime
    if (formData.sessions !== undefined) validateSessions(formData.sessions)
    const sessionsChanged =
      formData.sessions !== undefined &&
      serializeSessions(formData.sessions) !== serializeSessions(getTaskSessions(initialTask))
    return updateEntity({
      type: 'task',
      id: initialTask.id,
      originalTask: initialTask,
      data: {
        ...initialTask,
        ...result.output,
        sessions: sessionsChanged ? formData.sessions : initialTask.sessions,
        allDay,
        // start 与 deadline 不能同时为空
        start,
        deadline: deadline as AgendaEntityDeadline,
        end: result.output.endDateVal,
        estimatedTime: estimatedTime ? parseDurationString(estimatedTime) : undefined,
        // Actual is derived again after saving, never stored in the block.
        actualTime: undefined,
        projectId: result.output.projectId,
      },
    }) as Promise<AgendaTaskWithStartOrDeadline>
  }

  return {
    timeTotals: getTaskTimeTotals({
      ...initialTask,
      allDay,
      start,
      end: formData.endDateVal,
      estimatedTime: formData.estimatedTime ? parseDurationString(formData.estimatedTime) : undefined,
      sessions: formData.sessions,
      timeLogs: formData.timeLogs,
    }),
    formData,
    updateFormData,
    reset,
    edit,
    allDay,
    start,
    deadline,
  }
}

export default useEdit
