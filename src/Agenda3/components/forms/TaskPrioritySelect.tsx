import { Select } from 'antd'
import { useTranslation } from 'react-i18next'

import { TASK_PRIORITIES, type TaskPriority } from '@/types/taskPriority'

import TaskPriorityBadge from '../TaskPriorityBadge'

export default function TaskPrioritySelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string
  value?: TaskPriority
  onChange: (priority: TaskPriority | undefined) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Select<TaskPriority>
      id={id}
      aria-label={t('Priority')}
      className="w-[140px]"
      allowClear
      virtual={false}
      bordered={false}
      placeholder={t('Not set')}
      value={value}
      disabled={disabled}
      onChange={onChange}
      options={TASK_PRIORITIES.map((priority) => ({
        value: priority,
        label: <TaskPriorityBadge priority={priority} className="bg-transparent text-sm dark:bg-transparent" />,
      }))}
    />
  )
}
