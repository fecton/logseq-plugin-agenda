import { Button, Checkbox, Modal, Select } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { minutesToHHmm } from '@/Agenda3/helpers/fullCalendar'
import { WORKING_HOURS_PRESETS, workingHoursError, type WorkingHoursSettings } from '@/Agenda3/helpers/workingHours'

const presetLabels = { workdays: 'Workdays', weekends: 'Weekends', custom: 'Custom' } as const
const weekdays = [1, 2, 3, 4, 5, 6, 0]
const times = Array.from({ length: 97 }, (_, index) => {
  const time = minutesToHHmm(index * 15)
  return { value: time, label: time }
})
const startTimes = times.slice(0, -1)
const endTimes = times.slice(1)

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
  const error = draft.enabled ? workingHoursError(draft) : undefined
  const weekdayFormat = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', timeZone: 'UTC' })
  const updateRange = (index: number, field: 'start' | 'end', value: string) =>
    setDraft((current) => ({
      ...current,
      ranges: current.ranges.map((range, row) => (row === index ? { ...range, [field]: value } : range)),
    }))

  return (
    <Modal
      open
      title={t('Working hours')}
      cancelText={t('Cancel')}
      okText={t('Save')}
      onCancel={onClose}
      onOk={() => {
        setSubmitted(true)
        if (!error) onSave(draft.enabled ? draft : { ...initial, enabled: false })
      }}
    >
      <Checkbox checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}>
        {t('Restrict Time Box to working hours')}
      </Checkbox>
      {draft.enabled && (
        <div className="mt-4 space-y-4">
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
                options={weekdays.map((value, index) => ({
                  label: weekdayFormat.format(new Date(Date.UTC(2024, 0, index + 1))),
                  value,
                }))}
                onChange={(days) => setDraft({ ...draft, customDays: days.map(Number) })}
              />
            )}
          </div>
          <div className="space-y-2">
            {draft.ranges.map(({ start, end }, index) => (
              <div className="flex items-center gap-2" key={index}>
                <Select
                  showSearch
                  aria-label={t('Start of work period {{position}}', { position: index + 1 })}
                  className="w-28"
                  placeholder={t('Start time')}
                  value={start || undefined}
                  options={startTimes}
                  onChange={(value) => updateRange(index, 'start', value)}
                />
                <span aria-hidden>–</span>
                <Select
                  showSearch
                  aria-label={t('End of work period {{position}}', { position: index + 1 })}
                  className="w-28"
                  placeholder={t('End time')}
                  value={end || undefined}
                  options={endTimes}
                  onChange={(value) => updateRange(index, 'end', value)}
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
        </div>
      )}
      {submitted && error && (
        <p role="alert" className="mt-2 text-red-600 dark:text-red-400">
          {t(error)}
        </p>
      )}
    </Modal>
  )
}
