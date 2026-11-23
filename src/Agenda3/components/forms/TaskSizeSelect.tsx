import { Select } from 'antd'
import { useTranslation } from 'react-i18next'

import { TASK_SIZES, type TaskSize } from '@/types/taskSize'

import TaskSizeBadge from '../TaskSizeBadge'

export default function TaskSizeSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string
  value?: TaskSize
  onChange: (size: TaskSize | undefined) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Select<TaskSize>
      id={id}
      aria-label={t('Size')}
      className="w-[140px]"
      allowClear
      virtual={false}
      bordered={false}
      placeholder={t('Not set')}
      value={value}
      disabled={disabled}
      onChange={onChange}
      options={TASK_SIZES.map((size) => ({ value: size, label: <TaskSizeBadge size={size} className="text-sm" /> }))}
    />
  )
}
