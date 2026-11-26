import { Button, Checkbox, Input, Modal, Select } from 'antd'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { minutesToHHmm } from '@/Agenda3/helpers/fullCalendar'
import {
  ACTIVITY_PRESETS,
  WORKING_HOURS_PRESETS,
  blockedActivityError,
  workingHoursError,
  type BlockedActivity,
  type WorkingHoursSettings,
} from '@/Agenda3/helpers/workingHours'

const presetLabels = { daily: 'Daily', workdays: 'Workdays', weekends: 'Weekends', custom: 'Custom' } as const
const weekdays = [1, 2, 3, 4, 5, 6, 0]
const times = Array.from({ length: 97 }, (_, index) => {
  const time = minutesToHHmm(index * 15)
  return { value: time, label: time }
})
const startTimes = times.slice(0, -1)

function PeriodTimes({
  start,
  end,
  startLabel,
  endLabel,
  onChange,
}: {
  start: string
  end: string
  startLabel: string
  endLabel: string
  onChange: (field: 'start' | 'end', value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Select
        showSearch
        aria-label={startLabel}
        className="w-28"
        placeholder={t('Start time')}
        value={start || undefined}
        options={startTimes}
        onChange={(value) => onChange('start', value)}
      />
      <span aria-hidden>–</span>
      <Select
        showSearch
        aria-label={endLabel}
        className="w-28"
        placeholder={t('End time')}
        value={end || undefined}
        options={times}
        onChange={(value) => onChange('end', value)}
      />
      {end && end < start && <span className="text-xs text-gray-500 dark:text-gray-400">{t('Ends next day')}</span>}
    </>
  )
}

export default function WorkingHoursModal({
  initial,
  onSave,
  onClose,
}: {
  initial: WorkingHoursSettings
  onSave: (settings: WorkingHoursSettings) => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const [draft, setDraft] = useState(initial)
  const [submitted, setSubmitted] = useState(false)
  const workError = draft.enabled ? workingHoursError(draft) : undefined
  const activityErrors = draft.blockedActivities.map(blockedActivityError)
  const firstInvalidActivity = activityErrors.findIndex(Boolean)
  const workPeriods = useRef<HTMLElement>(null)
  const invalidActivity = useRef<HTMLDivElement>(null)
  const weekdayFormat = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', timeZone: 'UTC' })
  const weekdayOptions = weekdays.map((value, index) => ({
    label: weekdayFormat.format(new Date(Date.UTC(2024, 0, index + 1))),
    value,
  }))
  const updateRange = (index: number, field: 'start' | 'end', value: string) =>
    setDraft((current) => ({
      ...current,
      ranges: current.ranges.map((range, row) => (row === index ? { ...range, [field]: value } : range)),
    }))
  const updateActivity = (index: number, update: Partial<BlockedActivity>) =>
    setDraft((current) => ({
      ...current,
      blockedActivities: current.blockedActivities.map((activity, row) =>
        row === index ? { ...activity, ...update } : activity,
      ),
    }))

  return (
    <Modal
      open
      title={t('Working hours')}
      width={580}
      cancelText={t('Cancel')}
      okText={t('Save')}
      onCancel={onClose}
      onOk={() => {
        setSubmitted(true)
        if (workError || firstInvalidActivity !== -1) {
          const section = workError ? workPeriods.current : invalidActivity.current
          section?.scrollIntoView?.({ block: 'nearest' })
          return
        }
        onSave({
          ...(draft.enabled ? draft : initial),
          enabled: draft.enabled,
          blockedActivities: draft.blockedActivities.map((activity) => ({ ...activity, name: activity.name.trim() })),
        })
      }}
    >
      <div className="max-h-[64vh] overflow-y-auto px-1">
        <Checkbox checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}>
          {t('Limit scheduling to work periods')}
        </Checkbox>
        {draft.enabled && (
          <section ref={workPeriods} aria-label={t('Work periods')} className="mt-4 space-y-4">
            {submitted && workError && (
              <p role="alert" className="text-red-600 dark:text-red-400">
                {t(workError)}
              </p>
            )}
            <div>
              <Select
                aria-label={t('Working days')}
                className="w-full"
                value={draft.preset}
                options={WORKING_HOURS_PRESETS.map((value) => ({ value, label: t(presetLabels[value]) }))}
                onChange={(preset) => setDraft({ ...draft, preset })}
              />
              {draft.preset === 'custom' && (
                <Checkbox.Group
                  className="mt-3"
                  aria-label={t('Working days')}
                  value={draft.customDays}
                  options={weekdayOptions}
                  onChange={(days) => setDraft({ ...draft, customDays: days.map(Number) })}
                />
              )}
            </div>
            <div className="space-y-2">
              {draft.ranges.map(({ start, end }, index) => (
                <div className="flex flex-wrap items-center gap-2" key={index}>
                  <PeriodTimes
                    start={start}
                    end={end}
                    startLabel={t('Start of work period {{position}}', { position: index + 1 })}
                    endLabel={t('End of work period {{position}}', { position: index + 1 })}
                    onChange={(field, value) => updateRange(index, field, value)}
                  />
                  <Button
                    type="text"
                    disabled={draft.ranges.length === 1}
                    aria-label={t('Remove work period {{position}}', { position: index + 1 })}
                    onClick={() => setDraft({ ...draft, ranges: draft.ranges.filter((_, row) => row !== index) })}
                  >
                    {t('Remove')}
                  </Button>
                </div>
              ))}
              <Button onClick={() => setDraft({ ...draft, ranges: [...draft.ranges, { start: '', end: '' }] })}>
                {t('Add work period')}
              </Button>
            </div>
          </section>
        )}
        <section
          className="mt-4 space-y-3 border-t border-gray-200 pt-3 dark:border-zinc-700"
          aria-label={t('Blocked activities')}
        >
          <h3 className="font-medium">{t('Blocked activities')}</h3>
          {draft.blockedActivities.map((activity, index) => (
            <div
              key={index}
              ref={index === firstInvalidActivity ? invalidActivity : undefined}
              className="space-y-2 rounded-md border border-gray-200 p-2 dark:border-zinc-700"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="min-w-36 flex-1"
                  aria-label={t('Activity {{position}} name', { position: index + 1 })}
                  placeholder={t('Activity name')}
                  value={activity.name}
                  onChange={(event) => updateActivity(index, { name: event.target.value })}
                />
                <Select
                  aria-label={t('Activity {{position}} repeat days', { position: index + 1 })}
                  className="w-36"
                  value={activity.preset}
                  options={ACTIVITY_PRESETS.map((value) => ({ value, label: t(presetLabels[value]) }))}
                  onChange={(preset) => updateActivity(index, { preset })}
                />
                <Button
                  type="text"
                  aria-label={t('Remove activity {{position}}', { position: index + 1 })}
                  onClick={() =>
                    setDraft({ ...draft, blockedActivities: draft.blockedActivities.filter((_, row) => row !== index) })
                  }
                >
                  {t('Remove')}
                </Button>
              </div>
              {activity.preset === 'custom' && (
                <Checkbox.Group
                  aria-label={t('Activity {{position}} repeat days', { position: index + 1 })}
                  value={activity.customDays}
                  options={weekdayOptions}
                  onChange={(days) => updateActivity(index, { customDays: days.map(Number) })}
                />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <PeriodTimes
                  start={activity.start}
                  end={activity.end}
                  startLabel={t('Activity {{position}} start', { position: index + 1 })}
                  endLabel={t('Activity {{position}} end', { position: index + 1 })}
                  onChange={(field, value) => updateActivity(index, { [field]: value })}
                />
              </div>
              {submitted && activityErrors[index] && (
                <p role="alert" className="text-red-600 dark:text-red-400">
                  {t(activityErrors[index]!)}
                </p>
              )}
            </div>
          ))}
          <Button
            onClick={() =>
              setDraft({
                ...draft,
                blockedActivities: [
                  ...draft.blockedActivities,
                  { name: '', preset: 'daily', customDays: [], start: '', end: '' },
                ],
              })
            }
          >
            {t('Add blocked activity')}
          </Button>
        </section>
      </div>
    </Modal>
  )
}
