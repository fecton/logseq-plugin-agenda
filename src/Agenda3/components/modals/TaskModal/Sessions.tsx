import { Button, DatePicker, InputNumber } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { validateSessions, type PlannedSession } from '@/Agenda3/helpers/taskSessions'

export default function Sessions({
  value,
  onChange,
  duration = 30,
  disabled,
  selectedId,
  open,
}: {
  value: PlannedSession[]
  onChange: (value: PlannedSession[]) => void
  duration?: number
  disabled?: boolean
  selectedId?: string
  open?: boolean
}) {
  const { t } = useTranslation()
  const selected = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) selected.current?.scrollIntoView?.({ block: 'nearest' })
  }, [open, selectedId])
  let error: string | undefined
  try {
    validateSessions(value)
  } catch (err) {
    error = (err as Error).message
  }
  const change = (id: string, update: Partial<PlannedSession>) =>
    onChange(value.map((session) => (session.id === id ? { ...session, ...update } : session)))
  const add = () => {
    const last = [...value].sort((a, b) => b.start.valueOf() - a.start.valueOf())[0]
    const start = last
      ? last.end.add(1, 'hour')
      : dayjs()
          .second(0)
          .millisecond(0)
          .add(15 - (dayjs().minute() % 15), 'minute')
    const minutes = last ? last.end.diff(last.start, 'minute') : duration
    onChange([...value, { id: crypto.randomUUID(), start, end: start.add(minutes, 'minute') }])
  }
  return (
    <section className="my-3" aria-label={t('Sessions')}>
      <div className="mb-1 flex items-center justify-between">
        <span>{t('Sessions')}</span>
        <Button size="small" disabled={disabled} onClick={add}>
          {t('Add session')}
        </Button>
      </div>
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
        {t('Sessions manage this task’s schedule. Each box can be moved separately.')}
      </p>
      {value.map((session, index) => (
        <div
          key={session.id}
          ref={session.id === selectedId ? selected : undefined}
          className={`my-2 flex flex-wrap items-center gap-2 rounded p-1 ${
            session.id === selectedId ? 'ring-1 ring-blue-500' : ''
          }`}
        >
          <DatePicker
            aria-label={`${t('Session start')} ${index + 1}`}
            showTime={{ format: 'HH:mm' }}
            format="YYYY-MM-DD HH:mm"
            value={session.start}
            allowClear={false}
            disabled={disabled}
            onChange={(start) => {
              if (start)
                change(session.id, { start, end: start.add(session.end.diff(session.start, 'minute'), 'minute') })
            }}
          />
          <InputNumber
            aria-label={`${t('Session duration')} ${index + 1}`}
            className="w-[110px]"
            min={1}
            precision={0}
            addonAfter="min"
            value={session.end.diff(session.start, 'minute')}
            disabled={disabled}
            onChange={(minutes) => {
              if (minutes) change(session.id, { end: session.start.add(minutes, 'minute') })
            }}
          />
          <Button
            size="small"
            danger
            disabled={disabled}
            onClick={() => onChange(value.filter((entry) => entry.id !== session.id))}
          >
            {t('Remove session')}
          </Button>
          {!session.end.isSame(session.start, 'day') ? (
            <span className="text-xs text-gray-500">{session.end.format('→ MMM D HH:mm')}</span>
          ) : null}
        </div>
      ))}
      {error ? (
        <p role="alert" className="text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {value.length ? (
        <p className="text-xs text-gray-500">
          {t('Planned time')}: {value.reduce((total, session) => total + session.end.diff(session.start, 'minute'), 0)}{' '}
          min
        </p>
      ) : null}
    </section>
  )
}
