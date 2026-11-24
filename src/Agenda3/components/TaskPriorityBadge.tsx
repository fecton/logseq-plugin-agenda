import { Ban, ChevronDown, ChevronUp, ChevronsDown, ChevronsUp, Equal, Minus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { parseTaskPriority, TASK_PRIORITY_LABELS, type TaskPriority } from '@/types/taskPriority'
import { cn } from '@/util/util'

const PRIORITY_ICONS = {
  blocker: { icon: Ban, color: 'text-red-700 dark:text-red-400' },
  highest: { icon: ChevronsUp, color: 'text-red-700 dark:text-red-400' },
  high: { icon: ChevronUp, color: 'text-red-600 dark:text-red-400' },
  medium: { icon: Equal, color: 'text-amber-700 dark:text-amber-400' },
  low: { icon: ChevronDown, color: 'text-blue-600 dark:text-blue-400' },
  lowest: { icon: ChevronsDown, color: 'text-blue-700 dark:text-blue-400' },
}

export default function TaskPriorityBadge({
  priority,
  compact = false,
  showEmpty = false,
  className,
}: {
  priority?: TaskPriority
  compact?: boolean
  showEmpty?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const value = parseTaskPriority(priority)
  if (!value && !showEmpty) return null
  const { icon: Icon, color } = value
    ? PRIORITY_ICONS[value]
    : { icon: Minus, color: 'text-gray-500 dark:text-gray-400' }
  const label = value ? t(TASK_PRIORITY_LABELS[value]) : t('Not set')
  return (
    <span
      className={cn(
        `inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium
        text-gray-700 dark:bg-zinc-800 dark:text-gray-200`,
        className,
      )}
      aria-label={`${t('Priority')}: ${label}`}
      title={`${t('Priority')}: ${label}`}
    >
      <Icon size={14} strokeWidth={2.5} className={color} aria-hidden="true" focusable="false" />
      {compact ? null : value ? label : `${t('Priority')}: —`}
    </span>
  )
}
