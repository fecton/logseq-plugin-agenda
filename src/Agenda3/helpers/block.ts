import type { BlockEntity } from '@logseq/libs/dist/LSPlugin'
import { message } from 'antd'
import { format } from 'date-fns'
import dayjs, { type Dayjs } from 'dayjs'

import { type CreateObjectiveForm } from '@/Agenda3/components/modals/ObjectiveModal/CreateObjectiveModal'
import {
  AGENDA_DRAWER_REGEX,
  DATE_FORMATTER,
  LOGBOOK_CLOCK_FORMATTER,
  LOGBOOK_REGEX,
  SCHEDULED_DATETIME_FORMATTER,
  SCHEDULED_DATE_FORMATTER,
} from '@/constants/agenda'
import type { AgendaEntity, AgendaEntityDeadline } from '@/types/entity'
import type { AgendaObjective, AgendaEntityObjective } from '@/types/objective'
import type { AgendaTaskWithStartOrDeadline, CreateAgendaTask } from '@/types/task'
import { parseTaskPriority, type TaskPriority } from '@/types/taskPriority'
import { parseTaskSize, type TaskSize } from '@/types/taskSize'
import { updateBlock } from '@/util/logseq'

import { secondsToHHmmss } from './fullCalendar'
import type { BlockFromQuery } from './task'
import { parseTaskRecurrence, validateRecurringSchedule, type TaskRecurrence } from './taskRecurrence'
import {
  applySessionOperation,
  getTaskSessions,
  mergeSessionEdits,
  parseSessions,
  serializeSessions,
  validateSessions,
  type PlannedSession,
  type SessionOperation,
} from './taskSessions'
import { getTaskSchedule, type ScheduleValidator } from './workingHours'

/**
 * insert `<SCHEDULED: ...>` string into a block without any `<SCHEDULED: ...>` string
 */
const insertScheduled = (content: string, scheduled: string) => {
  if (/^SCHEDULED: </gm.test(content)) return content // make sure the task hasn't been scheduled yet (prevent duplicate)

  // Split the content into lines
  const [firstLine, ...restLines] = content.split('\n')

  // Insert the scheduled string as the second line of the content
  return [firstLine, scheduled, ...restLines].join('\n')
}

/**
 * Change scheduling only; estimates can only be changed through task editing.
 */
export const updateBlockDateInfo = async (
  dateInfo: { uuid: string; allDay: boolean; start: Dayjs; end?: Dayjs },
  validateSchedule?: ScheduleValidator,
) => {
  const { uuid, allDay, start } = dateInfo
  const originalBlock = await logseq.Editor.getBlock(uuid)
  if (!originalBlock) return Promise.reject(new Error('Block not found'))
  const existingDrawer = parseAgendaDrawer(originalBlock.content)
  if (existingDrawer?.sessionsError) throw new Error(existingDrawer.sessionsError)
  if (existingDrawer?.recurrenceError) throw new Error(existingDrawer.recurrenceError)
  if (existingDrawer?.recurrence) throw new Error('Use the task editor to change the recurring schedule.')
  if (existingDrawer?.sessions !== undefined) throw new Error('Use Sessions to change this task’s schedule.')

  const scheduledText = `SCHEDULED: <${start.format(allDay ? SCHEDULED_DATE_FORMATTER : SCHEDULED_DATETIME_FORMATTER)}>`
  // update SCHEDULED
  const newContent = originalBlock.scheduled
    ? originalBlock.content
        .split('\n')
        .map((line) => {
          if (line.startsWith('SCHEDULED:')) return scheduledText
          return line
        })
        .join('\n')
    : insertScheduled(originalBlock.content, scheduledText)
  // update end date
  const drawer: AgendaDrawer = {}
  if ('end' in dateInfo) {
    drawer.end = dateInfo.end
  } else {
    const previousEnd = parseAgendaDrawer(originalBlock.content)?.end
    const previousDate = /^SCHEDULED: <(\d{4}-\d{2}-\d{2})/m.exec(originalBlock.content)?.[1]
    if (previousEnd && previousDate) drawer.end = start.add(previousEnd.diff(dayjs(previousDate), 'day'), 'day')
  }
  const newContent2 = updateBlockAgendaDrawer(newContent, drawer)
  if (validateSchedule) await checkBlockSchedule(originalBlock, newContent2, validateSchedule)
  await logseq.Editor.updateBlock(uuid, newContent2)
  return logseq.Editor.getBlock(uuid)
}

/**
 * delete date info
 */
function readBlockSessionTask(block: BlockEntity): AgendaEntity {
  const drawer = parseAgendaDrawer(block.content)
  const scheduled = /^SCHEDULED: <(\d{4}-\d{2}-\d{2})\s+\w+(?:\s+(\d{2}:\d{2}))?/m.exec(block.content)
  return {
    id: block.uuid,
    rawBlock: {
      ...block,
      repeated: Boolean(block.repeated || block['repeated?'] || /^SCHEDULED:.*[.+]*\+\d+[hdwmy]/m.test(block.content)),
    },
    allDay: !scheduled?.[2],
    start: scheduled ? dayjs(`${scheduled[1]}T${scheduled[2] ?? '00:00'}`) : undefined,
    end: drawer?.end,
    estimatedTime: drawer?.estimated,
    sessions: drawer?.sessions,
    sessionsError: drawer?.sessionsError,
    recurrence: drawer?.recurrence,
    recurrenceError: drawer?.recurrenceError,
    objective: drawer?.objective,
  } as AgendaEntity
}

async function checkBlockSchedule(
  original: BlockEntity,
  content: string,
  validate: ScheduleValidator,
  previous = readBlockSessionTask(original),
) {
  const previousContent = original.content
  if (content === previousContent) return
  await validate(getTaskSchedule(readBlockSessionTask({ ...original, content })), getTaskSchedule(previous))
  const current = await logseq.Editor.getBlock(original.uuid)
  if (current?.content !== previousContent) throw new Error('This task changed elsewhere. Reopen it and try again.')
}

function writeSessionsContent(content: string, sessions: PlannedSession[]) {
  const sorted = validateSessions(sessions)
  return updateBlockAgendaDrawer(updateBlockScheduled(content, { start: sorted[0]?.start, allDay: false }), {
    sessions: sorted,
    end: undefined,
  })
}

function writeRecurringSchedule(content: string, sessions: PlannedSession[], recurrence?: TaskRecurrence) {
  const normalized = recurrence && sessions.length ? validateRecurringSchedule(sessions, recurrence) : sessions
  return updateBlockAgendaDrawer(writeSessionsContent(content, normalized), {
    recurrence: normalized.length ? recurrence : undefined,
  })
}

export async function updateBlockSessions(
  uuid: string,
  operation: SessionOperation,
  validateSchedule?: ScheduleValidator,
) {
  const block = await logseq.Editor.getBlock(uuid)
  if (!block) throw new Error('Block not found')
  const task = readBlockSessionTask(block)
  if (task.recurrenceError) throw new Error(task.recurrenceError)
  if (task.recurrence && operation.type !== 'remove')
    throw new Error('Use the task editor to change the recurring schedule.')
  const sessions = applySessionOperation(task, operation)
  const content = writeRecurringSchedule(block.content, sessions, task.recurrence)
  if (validateSchedule) await checkBlockSchedule(block, content, validateSchedule, task)
  await logseq.Editor.updateBlock(uuid, content)
  return logseq.Editor.getBlock(uuid)
}

export const deleteBlockDateInfo = async (uuid: string, day?: string) => {
  const originalBlock = await logseq.Editor.getBlock(uuid)
  if (!originalBlock) return Promise.reject(new Error('Block not found'))

  const { content, scheduled } = originalBlock
  const drawer = parseAgendaDrawer(content)
  if (drawer?.sessionsError) throw new Error(drawer.sessionsError)
  if (drawer?.recurrenceError) throw new Error(drawer.recurrenceError)
  if (drawer?.recurrence) throw new Error('Use the task editor to change the recurring schedule.')

  if (day) {
    if (originalBlock.marker === 'DONE') throw new Error('Only open tasks can be moved to Backlog.')
    const sessions = drawer?.sessions
    if (sessions !== undefined) {
      const remaining = sessions.filter((session) => session.start.format('YYYY-MM-DD') !== day)
      if (remaining.length === sessions.length) return originalBlock
      await logseq.Editor.updateBlock(uuid, writeSessionsContent(content, remaining))
    } else {
      if (scheduled !== Number(day.replaceAll('-', ''))) return originalBlock
      const unscheduled = updateBlockScheduled(content, {})
      await logseq.Editor.updateBlock(uuid, updateBlockAgendaDrawer(unscheduled, { end: undefined }))
    }
    return logseq.Editor.getBlock(uuid)
  }

  const newContent = originalBlock.scheduled
    ? originalBlock.content
        .split('\n')
        .map((line) => {
          if (line.startsWith('SCHEDULED:')) return ''
          return line
        })
        .filter(Boolean)
        .join('\n')
    : originalBlock.content
  await logseq.Editor.updateBlock(
    uuid,
    drawer?.sessions !== undefined ? writeSessionsContent(newContent, []) : newContent,
  )
  return logseq.Editor.getBlock(uuid)
}

/**
 * update task time log
 */
export const updateBlockTimeLog = async (
  uuid: string,
  info: {
    start: Dayjs
    end: Dayjs
    index: number
  },
) => {
  const originalBlock = await logseq.Editor.getBlock(uuid)
  if (!originalBlock) return Promise.reject(new Error('Block not found'))

  const timeLogTexts = originalBlock.content
    .split('\n')
    .filter((line) => line.startsWith('CLOCK: ['))
    .map((log, i) => {
      if (i === info.index) {
        // CLOCK: [2023-09-16 Sat 15:35:51]--[2023-09-16 Sat 16:37:57] =>  01:02:06
        return `CLOCK: [${info.start.format(LOGBOOK_CLOCK_FORMATTER)}]--[${info.end.format(
          LOGBOOK_CLOCK_FORMATTER,
        )}] =>  ${secondsToHHmmss(info.end.diff(info.start, 'second'))}`
      }
      return log
    })
  const newContent = originalBlock.content
    .split('\n')
    .filter((line) => !(line.startsWith('CLOCK: [') || line.startsWith(':LOGBOOK:') || line.startsWith(':END:')))
    .filter(Boolean)
    .concat(':LOGBOOK:')
    .concat(timeLogTexts)
    .concat(':END:')
    .join('\n')
  return logseq.Editor.updateBlock(uuid, newContent)
}

/**
 * add task time log
 */
export const addBlockTimeLog = async (
  uuid: string,
  info: {
    start: Dayjs
    end: Dayjs
  },
) => {
  const originalBlock = await logseq.Editor.getBlock(uuid)
  if (!originalBlock) return Promise.reject(new Error('Block not found'))

  const timeLogTexts = (originalBlock.content.split('\n').filter((line) => line.startsWith('CLOCK: [')) || []).concat(
    `CLOCK: [${info.start.format(LOGBOOK_CLOCK_FORMATTER)}]--[${info.end.format(
      LOGBOOK_CLOCK_FORMATTER,
    )}] =>  ${secondsToHHmmss(info.end.diff(info.start, 'second'))}`,
  )
  const newContent = originalBlock.content
    .split('\n')
    .filter((line) => !(line.startsWith('CLOCK: [') || line.startsWith(':LOGBOOK:') || line.startsWith(':END:')))
    .filter(Boolean)
    .concat(':LOGBOOK:')
    .concat(timeLogTexts)
    .concat(':END:')
    .join('\n')
  return logseq.Editor.updateBlock(uuid, newContent)
}

/**
 * delete task time log
 */
export const deleteBlogTimeLog = async (uuid: string, index: number) => {
  const originalBlock = await logseq.Editor.getBlock(uuid)
  if (!originalBlock) return Promise.reject(new Error('Block not found'))

  const timeLogTexts = originalBlock.content
    .split('\n')
    .filter((line) => line.startsWith('CLOCK: ['))
    .filter((log, i) => i !== index)
  const newContent = originalBlock.content
    .split('\n')
    .filter((line) => !(line.startsWith('CLOCK: [') || line.startsWith(':LOGBOOK:') || line.startsWith(':END:')))
    .filter(Boolean)
    .concat(':LOGBOOK:')
    .concat(timeLogTexts)
    .concat(':END:')
    .join('\n')
  return logseq.Editor.updateBlock(uuid, newContent)
}

/**
 * create task
 */
export const createTaskBlock = async (taskInfo: CreateAgendaTask, validateSchedule?: ScheduleValidator) => {
  if (taskInfo.sessions === undefined && taskInfo.start && !taskInfo.allDay && !taskInfo.end) {
    taskInfo = { ...taskInfo, sessions: getTaskSessions(taskInfo) }
  }
  if (taskInfo.recurrence && taskInfo.end) throw new Error('Add a timed session to repeat this task.')
  if (taskInfo.sessions !== undefined || taskInfo.recurrence) {
    let sessions = validateSessions(taskInfo.sessions ?? [])
    if (taskInfo.recurrence) sessions = validateSessions(validateRecurringSchedule(sessions, taskInfo.recurrence))
    taskInfo = { ...taskInfo, sessions, start: sessions[0]?.start, allDay: false, end: undefined }
  }
  if (validateSchedule) await validateSchedule(getTaskSchedule(taskInfo))
  const { title, allDay, start, deadline, end, estimatedTime, projectId, bindObjectiveId, size, priority } = taskInfo

  const AGENDA_DRAWER = genAgendaDrawerText({
    estimated: estimatedTime,
    end,
    bindObjectiveId,
    size,
    priority,
    sessions: taskInfo.sessions,
    recurrence: taskInfo.recurrence,
  })
  // const
  const content = [
    `${getTodoTag()} ${title}`,
    start ? `SCHEDULED: <${start.format(allDay ? SCHEDULED_DATE_FORMATTER : SCHEDULED_DATETIME_FORMATTER)}>` : null,
    deadline
      ? `DEADLINE: <${deadline.value.format(
          deadline.allDay ? SCHEDULED_DATE_FORMATTER : SCHEDULED_DATETIME_FORMATTER,
        )}>`
      : null,
    AGENDA_DRAWER,
  ]
    .filter(Boolean)
    .join('\n')

  const targetProjectId = projectId ? projectId : (await createTodayJournalPage()).uuid

  const block = await logseq.Editor.insertBlock(targetProjectId, content, {
    isPageBlock: true,
  })
  if (!block) return Promise.reject(new Error('Failed to create task block'))
  return logseq.Editor.getBlock(block.uuid)
}

export function generateTimeLogText({ start, end }: { start: Dayjs; end: Dayjs }) {
  return `CLOCK: [${start.format(LOGBOOK_CLOCK_FORMATTER)}]--[${end.format(
    LOGBOOK_CLOCK_FORMATTER,
  )}] =>  ${secondsToHHmmss(end.diff(start, 'second'))}`
}
// function generateTimeLogsText(timeLogs?: { start: Dayjs; end: Dayjs }[]) {
//   if (!Array.isArray(timeLogs)) return ''
//   // 若返回为空，则不会更新原有的 logbook
//   if (timeLogs.length === 0) return [':LOGBOOK:', ':END:'].join('\n')
//   return [':LOGBOOK:', ...timeLogs.map(generateTimeLogText), ':END:'].join('\n')
// }

/**
 * update task
 */
export const updateTaskBlock = async (
  taskInfo: AgendaEntity & { projectId?: string },
  originalTask?: AgendaEntity,
  validateSchedule?: ScheduleValidator,
) => {
  const {
    id,
    title,
    allDay,
    start,
    end,
    estimatedTime,
    deadline,
    status,
    timeLogs,
    projectId,
    bindObjectiveId,
    size,
    priority,
  } = taskInfo
  const originalBlock = await logseq.Editor.getBlock(id)
  if (!originalBlock) return Promise.reject(new Error('Block not found'))

  // Apply only edited fields to the latest block. A date edit must not rewrite notes,
  // workflow markers, repeating deadlines, logs or metadata changed outside Agenda.
  const changed = (a: unknown, b: unknown) => !originalTask || JSON.stringify(a) !== JSON.stringify(b)
  const startChanged = changed(start, originalTask?.start)
  const startDetailsChanged = startChanged || changed(allDay, originalTask?.allDay)
  const endChanged = changed(end, originalTask?.end)
  let content = originalBlock.content
  if (changed(title, originalTask?.title) || changed(status, originalTask?.status)) {
    content = updateBlockTaskTitle(content, title, status)
  }
  if (startDetailsChanged) {
    content = updateBlockScheduled(content, { start, allDay })
  }
  if (changed(deadline, originalTask?.deadline)) content = updateBlockDeadline(content, deadline)
  const drawer: AgendaDrawer = {}
  // Freeze a legacy timed box before changing the estimate that used to define its length.
  // Read the latest block so a concurrent scheduling change is not overwritten.
  const latest = readBlockSessionTask(originalBlock)
  const recurrenceChanged = 'recurrence' in taskInfo && changed(taskInfo.recurrence, originalTask?.recurrence)
  const editedSessions = taskInfo.sessions
  const sessionsChanged = editedSessions !== undefined && changed(editedSessions, originalTask?.sessions)
  const scheduleChanged = startDetailsChanged || endChanged
  if ((recurrenceChanged || sessionsChanged || scheduleChanged) && latest.recurrenceError)
    throw new Error(latest.recurrenceError)
  if (latest.recurrence && scheduleChanged && !sessionsChanged && !recurrenceChanged)
    throw new Error('Use the task editor to change the recurring schedule.')
  if (
    recurrenceChanged &&
    originalTask &&
    changed(latest.recurrence, originalTask.recurrence) &&
    changed(latest.recurrence, taskInfo.recurrence)
  ) {
    throw new Error('The repeat rule changed elsewhere. Reopen the task and try again.')
  }
  const frozenSessions =
    taskInfo.sessions === undefined &&
    !recurrenceChanged &&
    start &&
    !allDay &&
    !end &&
    latest.sessions === undefined &&
    changed(estimatedTime, originalTask?.estimatedTime) &&
    !latest.sessionsError
      ? getTaskSessions(latest)
      : []
  if (changed(estimatedTime, originalTask?.estimatedTime)) drawer.estimated = estimatedTime
  if (endChanged) drawer.end = end
  if (changed(bindObjectiveId, originalTask?.bindObjectiveId)) drawer.bindObjectiveId = bindObjectiveId
  if ('size' in taskInfo && changed(size, originalTask?.size)) drawer.size = size
  if ('priority' in taskInfo && changed(priority, originalTask?.priority)) drawer.priority = priority
  content = updateBlockAgendaDrawer(content, drawer)
  if (frozenSessions.length) {
    const shift = start && latest.start && startChanged ? start.diff(latest.start, 'minute') : 0
    content = writeSessionsContent(
      content,
      frozenSessions.map((session) => ({
        ...session,
        start: session.start.add(shift, 'minute'),
        end: session.end.add(shift, 'minute'),
      })),
    )
  }
  if (recurrenceChanged || sessionsChanged) {
    if (latest.sessionsError) throw new Error(latest.sessionsError)
    const currentSessions = getTaskSessions(latest)
    const sessions =
      sessionsChanged && editedSessions
        ? mergeSessionEdits(
            currentSessions,
            originalTask ? getTaskSessions(originalTask) : currentSessions,
            editedSessions,
          )
        : currentSessions
    const recurrence = recurrenceChanged ? taskInfo.recurrence : latest.recurrence
    if (recurrence && (latest.rawBlock.repeated || latest.objective || end || (recurrenceChanged && !sessions.length)))
      throw new Error('Add a timed session to repeat this task.')
    content = writeRecurringSchedule(content, sessions, recurrence)
  }
  if (changed(timeLogs ?? [], originalTask?.timeLogs ?? [])) content = updateBlockTimeLogText(content, timeLogs)
  if (validateSchedule) await checkBlockSchedule(originalBlock, content, validateSchedule, latest)
  await updateBlock(id, content)

  const page = await logseq.Editor.getPage(originalBlock.page.id)
  if (!page) return Promise.reject(new Error('Page not found'))
  if (changed(projectId, originalTask?.project.id) && page.uuid !== projectId) {
    // move task to new page's bottom
    const targetPageId = projectId ? projectId : (await createTodayJournalPage()).uuid
    const blocks = await logseq.Editor.getPageBlocksTree(targetPageId)
    const targetBlockId = blocks.length > 0 ? blocks[blocks.length - 1].uuid : targetPageId
    await logseq.Editor.moveBlock(id, targetBlockId, {
      children: false,
    })
  }

  return logseq.Editor.getBlock(id)
}

/**
 * toggle task status
 */
export const updateBlockTaskStatus = async (taskInfo: AgendaEntity, status: AgendaEntity['status']) => {
  const todoTag = status === 'done' ? 'DONE' : getTodoTag()
  const block = await logseq.Editor.getBlock(taskInfo.id)
  if (!block) throw new Error('Block not found')
  const rawTodoTag = block.marker
  if (!rawTodoTag) {
    message.error('This is not a todo block')
    return null
  }
  const reg = new RegExp(`^${rawTodoTag}`)
  const newContent = block.content.replace(reg, todoTag)
  await logseq.Editor.updateBlock(block.uuid, newContent)
  return logseq.Editor.getBlock(block.uuid)
}

/**
 * delete task
 */
export const deleteEntityBlock = async (uuid: string) => {
  return logseq.Editor.removeBlock(uuid)
}

/**
 * parse estimated duration string
 * @param durationString string example: 1h30m
 * @returns number value unit: minute
 * @example parseDurationString('1h30m') -> 90
 * @example parseDurationString('1h') -> 60
 * @example parseDurationString('30m') -> 30
 */
export function parseDurationString(durationString: string): number
export function parseDurationString(durationString: undefined): undefined
export function parseDurationString(durationString: string | undefined): number | undefined {
  if (!durationString) return undefined

  let totalMinutes = 0

  // Extract hours
  const hoursMatch = durationString.match(/(\d+)(?=[hH])/)
  if (hoursMatch) {
    totalMinutes += Number(hoursMatch[0]) * 60
  }

  // Extract minutes
  const minutesMatch = durationString.match(/(\d+)(?=[mM])/)
  if (minutesMatch) {
    totalMinutes += Number(minutesMatch[0])
  }

  return totalMinutes
}

/**
 * generate duration string
 * @param minutes number
 * @returns string
 * @example genDurationString(90) -> '1h30m'
 * @example genDurationString(60) -> '1h'
 * @example genDurationString(30) -> '30m'
 */
export function genDurationString(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  let durationString = ''

  if (hours > 0) {
    durationString += hours + 'h'
  }

  if (remainingMinutes > 0) {
    durationString += remainingMinutes + 'm'
  }

  return durationString
}

type AgendaDrawer = {
  sessions?: PlannedSession[]
  sessionsError?: string
  recurrence?: TaskRecurrence
  recurrenceError?: string
  estimated?: number
  end?: Dayjs
  objective?: AgendaEntityObjective
  bindObjectiveId?: string
  size?: TaskSize
  priority?: TaskPriority
}
/**
 * parse agenda drawer
 */
export function parseAgendaDrawer(blockContent: string): AgendaDrawer | null {
  const regex = AGENDA_DRAWER_REGEX
  const matches = blockContent.match(regex)
  const extractedText = matches ? matches[1].trim() : ''
  /**
   * estimated: 1h30m
   * other: aaa
   */
  const properties = extractedText
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(':')
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
    })
  if (!properties.length) return null
  const drawer = properties.reduce((acc, cur) => {
    if (cur[0] === 'sessions') {
      try {
        return { ...acc, sessions: parseSessions(cur[1]) }
      } catch {
        return {
          ...acc,
          sessionsError: 'Invalid sessions data. Repair the sessions field in Logseq before changing the schedule.',
        }
      }
    }
    if (cur[0] === 'recurrence') {
      try {
        return { ...acc, recurrence: parseTaskRecurrence(cur[1]) }
      } catch {
        return { ...acc, recurrenceError: 'Invalid recurrence data. Repair the recurrence field in Logseq.' }
      }
    }
    if (cur[0] === 'estimated') return { ...acc, estimated: parseDurationString(cur[1]) }
    if (cur[0] === 'end') return { ...acc, end: dayjs(cur[1], DATE_FORMATTER) }
    if (cur[0] === 'objective') {
      // week-2023-46
      const [type, year, number] = cur[1].split('-')
      return {
        ...acc,
        objective: {
          type: type as AgendaEntityObjective['type'],
          year: Number(year),
          number: Number(number),
        },
      }
    }
    if (cur[0] === 'bindObjectiveId') return { ...acc, bindObjectiveId: cur[1] }
    if (cur[0] === 'size') return { ...acc, size: parseTaskSize(cur[1]) }
    if (cur[0] === 'priority') return { ...acc, priority: parseTaskPriority(cur[1]) }
    return { ...acc, [cur[0]]: cur[1] }
  }, {} as AgendaDrawer)
  if (drawer.recurrence) {
    try {
      if (drawer.end || drawer.objective) throw new Error('Recurring schedules require timed sessions.')
      validateRecurringSchedule(drawer.sessions ?? [], drawer.recurrence)
    } catch {
      drawer.recurrence = undefined
      drawer.recurrenceError = 'Invalid recurrence data. Repair the recurrence field in Logseq.'
    }
  }
  return drawer
}
/**
 * generate agenda drawer text
 */
export function genAgendaDrawerText(drawer: AgendaDrawer): string {
  const keys = Object.keys(drawer)
  if (keys.length <= 0) return ''
  const content = keys
    .map((key) => {
      const originalVal = drawer[key]
      if (!originalVal) return null

      let valueText = ''
      if (key === 'estimated') {
        valueText = genDurationString(originalVal)
      } else if (key === 'end') {
        valueText = originalVal.format(DATE_FORMATTER)
      } else if (key === 'objective') {
        valueText = `${originalVal.type}-${originalVal.year}-${originalVal.number}`
      } else if (key === 'bindObjectiveId') {
        valueText = originalVal
      } else if (key === 'size') {
        valueText = parseTaskSize(originalVal) ?? ''
        if (!valueText) return null
      } else if (key === 'priority') {
        valueText = parseTaskPriority(originalVal) ?? ''
        if (!valueText) return null
      } else if (key === 'sessions') {
        valueText = serializeSessions(originalVal)
      } else if (key === 'recurrence') {
        valueText = JSON.stringify(originalVal)
      }
      return `${key}: ${valueText}`
    })
    .filter(Boolean)
  if (content.length <= 0) return ''
  return [':AGENDA:', ...content, ':END:'].join('\n')
}

/**
 * update agenda drawer
 */
export function updateBlockAgendaDrawer(blockContent: string, drawer: AgendaDrawer) {
  const keys = Object.keys(drawer)
  if (!keys.length) return blockContent
  const existing = blockContent.match(AGENDA_DRAWER_REGEX)
  if (!existing) {
    const text = genAgendaDrawerText(drawer)
    return text ? blockContent + '\n' + text : blockContent
  }
  const remaining = new Set(keys)
  const lines = existing[1]
    .split('\n')
    .slice(1)
    .flatMap((line) => {
      const key = line.split(':', 1)[0].trim()
      if (!keys.includes(key)) return [line]
      remaining.delete(key)
      const replacement = genAgendaDrawerText({ [key]: drawer[key] })
        .split('\n')
        .slice(1, -1)
      return replacement
    })
  for (const key of remaining)
    lines.push(
      ...genAgendaDrawerText({ [key]: drawer[key] })
        .split('\n')
        .slice(1, -1),
    )
  return blockContent.replace(AGENDA_DRAWER_REGEX, lines.length ? '\n:AGENDA:\n' + lines.join('\n') + '\n:END:' : '')
}
/**
 * updateScheduled
 */
export function updateBlockScheduled(blockContent: string, { start, allDay }: { start?: Dayjs; allDay?: boolean }) {
  const scheduleText = start
    ? `SCHEDULED: <${start.format(allDay ? SCHEDULED_DATE_FORMATTER : SCHEDULED_DATETIME_FORMATTER)}>`
    : null
  if (!/^SCHEDULED: </gm.test(blockContent) && scheduleText) {
    return blockContent + '\n' + scheduleText
  }
  return blockContent
    .split('\n')
    .flatMap((line) => {
      if (line.startsWith('SCHEDULED: <')) {
        return scheduleText ? [scheduleText] : []
      }
      return [line]
    })
    .join('\n')
}
/**
 * update deadline
 */
export function updateBlockDeadline(blockContent: string, deadline?: AgendaEntityDeadline) {
  const deadlineText = deadline?.value
    ? `DEADLINE: <${deadline.value.format(deadline.allDay ? SCHEDULED_DATE_FORMATTER : SCHEDULED_DATETIME_FORMATTER)}>`
    : null
  if (!/^DEADLINE: </gm.test(blockContent) && deadlineText) {
    return blockContent + '\n' + deadlineText
  }
  return blockContent
    .split('\n')
    .flatMap((line) => {
      if (line.startsWith('DEADLINE: <')) {
        return deadlineText ? [deadlineText] : []
      }
      return [line]
    })
    .join('\n')
}
/**
 * update title
 */
export function updateBlockTaskTitle(blockContent: string, title: string, status: 'done' | 'todo') {
  const marker = /^(TODO|DOING|NOW|LATER|WAITING)\b/.exec(blockContent)?.[1]
  const todoTag = status === 'done' ? 'DONE' : marker ?? getTodoTag()
  return blockContent
    .split('\n')
    .map((line, index) => {
      if (index === 0) return `${todoTag} ${title}`
      return line
    })
    .join('\n')
}
/**
 * update time log
 */
export function updateBlockTimeLogText(blockContent: string, timeLogs: { start: Dayjs; end: Dayjs }[] = []) {
  const matches = blockContent.match(LOGBOOK_REGEX)
  const extractedText = matches ? matches[1].trim() : ''
  const otherLog = extractedText
    .split('\n')
    .filter((line) => !line.startsWith('CLOCK: ['))
    ?.filter(Boolean)
  const isHasLogs = otherLog?.length > 0 || timeLogs?.length > 0
  const logbookText = isHasLogs
    ? ['\n:LOGBOOK:', ...otherLog, ...(timeLogs?.map(generateTimeLogText) ?? []), ':END:'].filter(Boolean).join('\n')
    : '\n:LOGBOOK:\n:END:' // 如果为空字符串，则不会更新原有的 logbook

  /**
   * 1. 原来有 log，现在没有，则 replace （注意不能使用空字符串，如果为空字符串，则不会更新原有的 logbook）
   * 2. 原来有 log，现在有，则 replace
   * 3. 原来没有 log，现在有 log，直接拼接
   * 4. 原来没有 log，现在没有 log，什么也不做
   */
  if (!matches && isHasLogs) return blockContent + logbookText
  return blockContent.replace(LOGBOOK_REGEX, logbookText)
}

export async function createTodayJournalPage() {
  const { preferredDateFormat } = await logseq.App.getUserConfigs()
  const journalName = format(dayjs().valueOf(), preferredDateFormat)
  const journalPage = await logseq.Editor.createPage(journalName, {}, { journal: true })
  if (!journalPage) return Promise.reject(new Error('Failed to create journal page'))
  return journalPage
}

/**
 * transform normal block to BlockFromQuery
 */
export const transformBlockToBlockFromQuery = async (block: BlockEntity | null): Promise<BlockFromQuery | null> => {
  if (!block) return null
  const page = await logseq.Editor.getPage(block?.page?.id ?? block?.page)
  if (!page) return null

  return {
    ...block,
    marker: block.marker,
    page: {
      ...page,
      originalName: page.originalName,
      journalDay: page.journalDay,
      isJournal: page?.['journal?'],
    },
  }
}

/**
 * create objective block
 */
export const createObjectiveBlock = async (objective: CreateObjectiveForm) => {
  const { title, objective: objectiveInfo } = objective
  const AGENDA_DRAWER = genAgendaDrawerText({
    objective: objectiveInfo,
  })
  const content = [`${getTodoTag()} ${title}`, AGENDA_DRAWER].filter(Boolean).join('\n')
  const block = await logseq.Editor.insertBlock((await createTodayJournalPage()).uuid, content, {
    isPageBlock: true,
    customUUID: await logseq.Editor.newBlockUUID(),
  })
  if (!block) return Promise.reject(new Error('Failed to create objective block'))
  return logseq.Editor.getBlock(block.uuid)
}
/**
 * update objective block
 */
export const updateObjectiveBlock = async (objective: AgendaObjective) => {
  const { id, title, objective: objectiveInfo, status } = objective
  const originalBlock = await logseq.Editor.getBlock(id)
  if (!originalBlock) return Promise.reject(new Error('Block not found'))

  const content1 = updateBlockTaskTitle(originalBlock.content, title, status)
  const content2 = updateBlockAgendaDrawer(content1, { objective: objectiveInfo })
  await updateBlock(id, content2)
  return logseq.Editor.getBlock(id)
}

/** get todo tag */
export function getTodoTag() {
  return window.logseqAppUserConfigs?.preferredWorkflow === 'now' ? 'LATER' : 'TODO'
}
