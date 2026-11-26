import { Dropdown, message } from 'antd'
import { useAtomValue } from 'jotai'
import { useState } from 'react'
import { BsArchive } from 'react-icons/bs'
import { RiDeleteBin4Line } from 'react-icons/ri'
import { VscDebugConsole } from 'react-icons/vsc'

import { minutesToHHmm } from '@/Agenda3/helpers/fullCalendar'
import { navToLogseqBlock } from '@/Agenda3/helpers/logseq'
import { nextSessionDuration } from '@/Agenda3/helpers/taskSessions'
import useAgendaEntities from '@/Agenda3/hooks/useAgendaEntities'
import { logseqAtom } from '@/Agenda3/models/logseq'
import { settingsAtom } from '@/Agenda3/models/settings'
import type { AgendaEntity } from '@/types/entity'
import type { AgendaTaskWithStartOrDeadline } from '@/types/task'
import { cn } from '@/util/util'

import Group from '../../Group'
import TaskModal from '../../modals/TaskModal'
import Toolbar from './Toolbar'

const TaskCard = ({ task, compact = false }: { task: AgendaTaskWithStartOrDeadline; compact?: boolean }) => {
  const currentGraph = useAtomValue(logseqAtom).currentGraph
  const settings = useAtomValue(settingsAtom)
  const groupType = settings.selectedFilters?.length ? 'filter' : 'page'

  const [editTaskModal, setEditTaskModal] = useState<{
    open: boolean
    task?: AgendaTaskWithStartOrDeadline
  }>({
    open: false,
  })

  const canMove = !task.rrule && !task.recurringPast && !task.recurrence && !task.recurrenceError
  const isMultipleDays = task.allDay && task.end
  const noStart = !task.start
  const estimatedTime = nextSessionDuration(task)

  const { updateEntity, deleteEntity } = useAgendaEntities()

  const onClickTaskMark = async (
    event: React.MouseEvent<HTMLButtonElement>,
    task: AgendaEntity,
    status: AgendaEntity['status'],
  ) => {
    event.stopPropagation()
    if (task.rrule) return message.error('Please modify the status of the recurring task in logseq.')
    try {
      await updateEntity({ type: 'task-status', id: task.id, data: status, completionSource: event.currentTarget })
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Could not update task. Please try again.')
    }
  }
  const onDeleteTask = async (taskId: string) => {
    deleteEntity(taskId)
  }
  const onRemoveDate = async (taskId: string) => {
    updateEntity({ type: 'task-remove-date', id: taskId, data: null })
  }
  const onClickTask = (e: React.MouseEvent, task: AgendaTaskWithStartOrDeadline) => {
    if (e.ctrlKey) {
      navToLogseqBlock(task, currentGraph)
      console.log(task)
    } else {
      setEditTaskModal({ open: true, task })
    }
    e.stopPropagation()
  }

  return (
    <div
      className={cn(
        'group/card cursor-pointer whitespace-pre-wrap rounded-md bg-white p-2 hover:shadow dark:bg-zinc-700',
        {
          'bg-[#edeef0] opacity-80 dark:bg-[#2f2f33]': task.status === 'done',
          'p-1.5 text-xs': compact,
          // 循环任务及多天任务不能拖拽
          'droppable-task-element': canMove && !isMultipleDays && !noStart,
        },
      )}
      data-event={JSON.stringify({
        id: task.id,
        title: task.showTitle,
        duration: minutesToHHmm(estimatedTime),
        color: groupType === 'page' ? task.project.bgColor : task?.filters?.[0]?.color,
      })}
      data-id={task.id}
      data-session-day={task.sessionDay}
    >
      <Dropdown
        trigger={['contextMenu']}
        menu={{
          items: [
            import.meta.env.DEV
              ? {
                  key: 'console',
                  label: 'Console task',
                  icon: <VscDebugConsole className="!text-base" />,
                }
              : null,
            !canMove || task.project.isJournal
              ? null
              : {
                  key: 'backlog',
                  label: 'Move to backlog',
                  icon: <BsArchive className="!text-sm" />,
                },
            {
              key: 'delete',
              label: 'Delete task',
              danger: true,
              icon: <RiDeleteBin4Line className="!text-base" />,
            },
          ],
          onClick: ({ key }) => {
            if (key === 'delete') onDeleteTask(task.id)
            if (key === 'backlog') onRemoveDate(task.id)
            if (key === 'console') console.log(task)
          },
        }}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={task.title}
          onKeyDown={(event) => {
            if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault()
              setEditTaskModal({ open: true, task })
            }
          }}
          onClick={(e) => {
            onClickTask(e, task)
          }}
        >
          {/* ========= Toolbar ========= */}
          <Toolbar task={task} groupType={groupType} onClickMark={onClickTaskMark} compact={compact} />

          {/* ========= Title ========= */}
          <div
            className={cn('my-0.5 select-none break-words text-gray-600 dark:text-gray-100', {
              'line-through': task.status === 'done',
              'line-clamp-2': compact,
            })}
          >
            {task.showTitle}
          </div>

          {/* ========= Group(page or filter) Name ========= */}
          {!compact && <Group task={task} type={groupType} />}
        </div>
      </Dropdown>
      {/* ========== Edit Task Modal ========== */}
      {editTaskModal.task ? (
        <TaskModal
          key={editTaskModal.task.id}
          open={editTaskModal.open}
          info={{ type: 'edit', initialTaskData: editTaskModal.task }}
          onOk={() => {
            setEditTaskModal({ open: false })
          }}
          onCancel={() => setEditTaskModal({ open: false })}
          onDelete={() => {
            setEditTaskModal({ open: false })
          }}
        />
      ) : null}
    </div>
  )
}

export default TaskCard
