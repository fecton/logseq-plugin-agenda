import type { EventContentArg } from '@fullcalendar/core'
import { Dropdown, message } from 'antd'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { IoIosCheckmarkCircle } from 'react-icons/io'
import { RiDeleteBin4Line, RiInboxUnarchiveLine } from 'react-icons/ri'

import useAgendaEntities from '@/Agenda3/hooks/useAgendaEntities'
import type { CalendarEvent } from '@/types/fullcalendar'
import { cn } from '@/util/util'

import TaskPriorityBadge from '../TaskPriorityBadge'
import TaskSizeBadge from '../TaskSizeBadge'
import TaskModal from '../modals/TaskModal'

const TheCalendarEvent = ({ info }: { info: EventContentArg }) => {
  const { t } = useTranslation()
  const { updateEntity, deleteEntity, entities } = useAgendaEntities()
  const onDeleteTask = async (taskId: string) => {
    deleteEntity(taskId)
  }
  const onRemoveTime = async () => {
    try {
      await updateEntity({ type: 'task-session', id: savedTask.id, data: { type: 'remove', id: savedTask.sessionId! } })
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Could not remove session.')
    }
  }
  const savedTask = info.event.extendedProps as CalendarEvent['extendedProps']
  // External drops render before the scheduled task is saved and reloaded.
  // Use the loaded entity for badges, but wait for full event data before editing.
  const taskData = savedTask.rawBlock ? savedTask : entities?.find((task) => task.id === info.event.id)
  const showTitle = `${savedTask.eventKind === 'time-log' ? 'Actual · ' : ''}${taskData?.showTitle ?? info.event.title}`
  const isShowTimeText = info.event.allDay === false && dayjs(info.event.end).diff(info.event.start, 'minute') > 20
  const isSmallHeight = info.event.allDay === false && dayjs(info.event.end).diff(info.event.start, 'minute') <= 10
  const isDone = taskData?.status === 'done'
  const content = (
    <div className={cn('h-full', { 'opacity-60': isDone })}>
      <div
        className={cn('flex items-center gap-1', {
          'line-through': isDone,
          'font-semibold': !isDone,
          'text-[10px]': isSmallHeight,
        })}
        title={showTitle}
      >
        <span className="min-w-0 flex-1 truncate">{showTitle}</span>
        <TaskPriorityBadge priority={taskData?.priority} compact showEmpty />
        <TaskSizeBadge size={taskData?.size} showEmpty className="rounded bg-black/20 px-1 text-white" />
        {isDone ? <IoIosCheckmarkCircle className="shrink-0 text-white" /> : null}
      </div>
      {isShowTimeText ? <div className="text-xs text-gray-100">{info.timeText}</div> : null}
    </div>
  )
  if (!savedTask.rawBlock) return content
  return (
    <TaskModal
      info={{
        type: 'edit',
        initialTaskData: savedTask,
        sessionId: savedTask.sessionId,
      }}
    >
      <Dropdown
        trigger={['contextMenu']}
        menu={{
          items: [
            savedTask.eventKind === 'session'
              ? {
                  key: 'remove',
                  label: t(savedTask.recurrence ? 'Remove session from series' : 'Remove session'),
                  icon: <RiInboxUnarchiveLine className="!text-base" />,
                }
              : null,
            {
              key: 'delete',
              label: 'Delete task',
              danger: true,
              icon: <RiDeleteBin4Line className="!text-base" />,
            },
          ],
          onClick: ({ key }) => {
            if (key === 'delete') onDeleteTask(savedTask.id)
            if (key === 'remove') void onRemoveTime()
          },
        }}
      >
        {content}
      </Dropdown>
    </TaskModal>
  )
}

export default TheCalendarEvent
