import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { IoAddCircleOutline } from 'react-icons/io5'

import { track } from '@/Agenda3/helpers/umami'
import { cn } from '@/util/util'

import TaskTimeBadges from '../TaskTimeBadges'
import TaskModal from '../modals/TaskModal'

const AddTaskCard = ({
  day,
  actualTime,
  estimatedTime,
  isGray,
}: {
  day: Dayjs
  isGray: boolean
  actualTime?: number
  estimatedTime?: number
}) => {
  const { t } = useTranslation()
  const isToday = day.isSame(dayjs(), 'day')

  return (
    <TaskModal info={{ type: 'create', initialData: { startDateVal: day } }}>
      <div
        onClick={() => track('KanBan: Add Task Button', { today: String(isToday) })}
        className={cn(
          `group my-2 flex cursor-pointer items-center justify-between rounded-md bg-white p-2 text-sm text-gray-400 hover:shadow
          dark:bg-zinc-700`,
          {
            'bg-[#edeef0] dark:bg-[#2f2f33]': isGray,
          },
        )}
      >
        <div className="flex items-center gap-1">
          <IoAddCircleOutline />
          <span className={cn('transition-opacity group-hover:opacity-100', { 'opacity-0': !isToday })}>
            {t('Add a task')}
          </span>
        </div>
        <TaskTimeBadges estimatedTime={estimatedTime} actualTime={actualTime} />
      </div>
    </TaskModal>
  )
}

export default AddTaskCard
