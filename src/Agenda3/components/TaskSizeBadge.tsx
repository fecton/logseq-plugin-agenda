import { useTranslation } from 'react-i18next'

import { parseTaskSize, TASK_SIZES, type TaskSize } from '@/types/taskSize'
import { cn } from '@/util/util'

export default function TaskSizeBadge({ size, className }: { size?: TaskSize; className?: string }) {
  const { t } = useTranslation()
  const value = parseTaskSize(size)
  if (!value) return null
  const level = TASK_SIZES.length - TASK_SIZES.indexOf(value)
  const label = `${t('Size')}: ${value}`
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] font-medium', className)}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 20 16" width="20" height="16" fill="currentColor" aria-hidden="true" focusable="false">
        {[0, 1, 2, 3, 4].map((bar) => (
          <rect
            key={bar}
            x={bar * 4}
            y={13 - bar * 3}
            width="3"
            height={3 + bar * 3}
            rx="0.7"
            opacity={bar < level ? 1 : 0.15}
          />
        ))}
      </svg>
      {value}
    </span>
  )
}
