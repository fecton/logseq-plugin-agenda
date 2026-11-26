import { Button, DatePicker, InputNumber, Select } from 'antd'
import dayjs from 'dayjs'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  nextMatchingStart,
  ordinalWeek,
  RECURRENCE_WEEKDAYS,
  recurrenceWeekday,
  validateRecurringSchedule,
  type RecurrenceFrequency,
  type RecurrenceWeekday,
  type TaskRecurrence,
} from '@/Agenda3/helpers/taskRecurrence'
import type { PlannedSession } from '@/Agenda3/helpers/taskSessions'

type Preset = 'none' | 'daily' | 'weekly' | 'monthly-date' | 'monthly-weekday' | 'annual' | 'weekdays' | 'custom'
const weekdays = RECURRENCE_WEEKDAYS.slice(0, 5)
const frequencies: RecurrenceFrequency[] = ['day', 'week', 'month', 'year']
const dayFormat = 'YYYY-MM-DD'
const ordinalLabels: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', '-1': 'last' }

function getPreset(rule?: TaskRecurrence): Preset {
  if (!rule) return 'none'
  if (rule.interval !== 1 || rule.end.type !== 'never') return 'custom'
  switch (rule.frequency) {
    case 'day':
      return 'daily'
    case 'week':
      if (!rule.weekdays) return 'weekly'
      return rule.weekdays.length === weekdays.length && weekdays.every((day) => rule.weekdays?.includes(day))
        ? 'weekdays'
        : 'custom'
    case 'month':
      return rule.monthPattern === 'weekday' ? 'monthly-weekday' : 'monthly-date'
    case 'year':
      return 'annual'
  }
}

const presets: Record<
  Exclude<Preset, 'none' | 'custom'>,
  Partial<TaskRecurrence> & { frequency: RecurrenceFrequency }
> = {
  daily: { frequency: 'day' },
  weekly: { frequency: 'week' },
  'monthly-date': { frequency: 'month', monthPattern: 'date' },
  'monthly-weekday': { frequency: 'month', monthPattern: 'weekday' },
  annual: { frequency: 'year' },
  weekdays: { frequency: 'week', weekdays },
}

export default function Repeat({
  sessions,
  value,
  disabled,
  onChange,
}: {
  sessions: PlannedSession[]
  value?: TaskRecurrence
  disabled?: boolean
  onChange: (rule?: TaskRecurrence) => void
}) {
  const { t, i18n } = useTranslation()
  const [showCustom, setShowCustom] = useState(false)
  const sorted = [...sessions].sort((a, b) => a.start.valueOf() - b.start.valueOf())
  const anchor = sorted[0].start.locale(i18n?.language === 'zh-CN' ? 'zh-cn' : 'en')
  const anchorWeekday = recurrenceWeekday(anchor)
  const first = value ? nextMatchingStart(anchor, value) : anchor
  const ordinal = t(ordinalLabels[ordinalWeek(anchor)])
  const monthlyWeekday = t('Monthly on the {{position}} {{weekday}}', {
    position: ordinal,
    weekday: anchor.format('dddd'),
  })
  const monthlyDate = t('Monthly on day {{day}}', { day: anchor.date() })
  const preset = showCustom && value ? 'custom' : getPreset(value)
  let error: string | undefined
  if (value) {
    try {
      validateRecurringSchedule(sorted, value)
    } catch (err) {
      error = (err as Error).message
    }
  }

  const selectPreset = (selection: Preset) => {
    setShowCustom(selection === 'custom')
    if (selection === 'none') return onChange(undefined)
    if (selection === 'custom')
      return onChange(value ?? { frequency: 'week', interval: 1, weekdays: [anchorWeekday], end: { type: 'never' } })
    onChange({ ...presets[selection], interval: 1, end: { type: 'never' } })
  }
  const toggleWeekday = (day: RecurrenceWeekday) => {
    if (!value) return
    const selected = value.weekdays ?? [anchorWeekday]
    const next = RECURRENCE_WEEKDAYS.filter((weekday) => selected.includes(weekday) !== (weekday === day))
    onChange({ ...value, weekdays: next })
  }

  return (
    <section className="my-3 space-y-2" aria-label={t('Recurrence')}>
      <div className="flex items-center gap-3">
        <span>{t('Repeat')}</span>
        <Select<Preset>
          aria-label={t('Repeat')}
          className="min-w-[230px]"
          disabled={disabled}
          value={preset}
          onChange={selectPreset}
          options={[
            { value: 'none', label: t('Does not repeat') },
            { value: 'daily', label: t('Daily') },
            { value: 'weekly', label: t('Weekly on {{weekday}}', { weekday: anchor.format('dddd') }) },
            { value: 'monthly-date', label: monthlyDate },
            { value: 'monthly-weekday', label: monthlyWeekday },
            { value: 'annual', label: t('Annually on {{date}}', { date: anchor.format('MMMM D') }) },
            { value: 'weekdays', label: t('Every weekday (Monday to Friday)') },
            { value: 'custom', label: t('Custom') },
          ]}
        />
      </div>
      {preset === 'custom' && value ? (
        <div className="space-y-2 rounded border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span>{t('Repeat every')}</span>
            <InputNumber
              aria-label={t('Repeat interval')}
              className="w-20"
              min={1}
              precision={0}
              disabled={disabled}
              value={value.interval || null}
              onChange={(interval) => onChange({ ...value, interval: interval ?? 0 })}
            />
            <Select<RecurrenceFrequency>
              aria-label={t('Repeat unit')}
              className="w-24"
              value={value.frequency}
              disabled={disabled}
              options={frequencies.map((frequency) => ({
                value: frequency,
                label: t(`Repeat unit ${frequency}`, { count: value.interval }),
              }))}
              onChange={(frequency) =>
                onChange({
                  frequency,
                  interval: value.interval,
                  end: value.end,
                  ...(frequency === 'week' ? { weekdays: [anchorWeekday] } : {}),
                })
              }
            />
          </div>
          {value.frequency === 'week' ? (
            <div role="group" aria-label={t('Repeat on')} className="flex flex-wrap items-center gap-2">
              <span>{t('Repeat on')}</span>
              {RECURRENCE_WEEKDAYS.map((day, index) => {
                const weekday = anchor.day((index + 1) % 7)
                const selected = (value.weekdays ?? [anchorWeekday]).includes(day)
                return (
                  <Button
                    key={day}
                    shape="circle"
                    type={selected ? 'primary' : 'default'}
                    aria-label={weekday.format('dddd')}
                    aria-pressed={selected}
                    disabled={disabled}
                    onClick={() => toggleWeekday(day)}
                  >
                    {weekday.format('dd').slice(0, 1)}
                  </Button>
                )
              })}
            </div>
          ) : null}
          {value.frequency === 'month' ? (
            <Select<'date' | 'weekday'>
              aria-label={t('Monthly pattern')}
              className="min-w-[230px]"
              value={value.monthPattern ?? 'date'}
              disabled={disabled}
              options={[
                { value: 'date', label: monthlyDate },
                { value: 'weekday', label: monthlyWeekday },
              ]}
              onChange={(monthPattern) => onChange({ ...value, monthPattern })}
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <span>{t('Ends')}</span>
            <Select<TaskRecurrence['end']['type']>
              aria-label={t('Ends')}
              className="w-24"
              value={value.end.type}
              disabled={disabled}
              options={[
                { value: 'never', label: t('Never') },
                { value: 'on', label: t('On') },
                { value: 'after', label: t('After') },
              ]}
              onChange={(type) => {
                const end: TaskRecurrence['end'] =
                  type === 'on'
                    ? { type, date: first.format(dayFormat) }
                    : type === 'after'
                    ? { type, count: 1 }
                    : { type }
                onChange({ ...value, end })
              }}
            />
            {value.end.type === 'on' ? (
              <DatePicker
                aria-label={t('Repeat end date')}
                value={value.end.date ? dayjs(value.end.date) : null}
                disabled={disabled}
                disabledDate={(date) => date.isBefore(first, 'day')}
                onChange={(date) => onChange({ ...value, end: { type: 'on', date: date?.format(dayFormat) ?? '' } })}
              />
            ) : null}
            {value.end.type === 'after' ? (
              <InputNumber
                aria-label={t('Number of occurrences')}
                className="w-[150px]"
                min={1}
                precision={0}
                addonAfter={t('occurrences')}
                disabled={disabled}
                value={value.end.count || null}
                onChange={(count) => onChange({ ...value, end: { type: 'after', count: count ?? 0 } })}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-red-600 dark:text-red-400">
          {t(error)}
        </p>
      ) : null}
      {value ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('Changes apply to the entire series.')}
          {!first.isSame(anchor, 'day')
            ? ` ${t('First occurrence moves to {{date}}.', { date: first.format(dayFormat) })}`
            : ''}
        </p>
      ) : null}
    </section>
  )
}
