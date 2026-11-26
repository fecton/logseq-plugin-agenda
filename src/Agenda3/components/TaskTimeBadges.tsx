import { useTranslation } from 'react-i18next'

import { minutesToHHmm } from '@/Agenda3/helpers/fullCalendar'

export default function TaskTimeBadges({
  estimatedTime,
  actualTime,
  repeating,
}: {
  estimatedTime?: number
  actualTime?: number
  repeating?: boolean
}) {
  const { t } = useTranslation()
  return (
    <span
      className="flex flex-wrap gap-x-2 gap-y-1 rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-600 dark:bg-zinc-800
        dark:text-gray-300"
    >
      <span title={t('Estimated Time')} aria-label={t('Estimated Time')}>
        {t('Est')}: {estimatedTime === undefined ? '—' : minutesToHHmm(estimatedTime)}
      </span>
      <span
        title={t(
          repeating
            ? 'Actual Time counts each base session once. Manual logs are added even when they overlap a time box.'
            : 'Actual Time includes future time boxes in full. Manual logs are added even when they overlap a time box.',
        )}
        aria-label={t('Actual Time')}
      >
        {t('Actual')}: {actualTime === undefined ? '—' : minutesToHHmm(actualTime)}
      </span>
    </span>
  )
}
