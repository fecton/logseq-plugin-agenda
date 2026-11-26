import { LeftOutlined, RightOutlined, SettingOutlined } from '@ant-design/icons'
import type { CalendarOptions } from '@fullcalendar/core'
import interactionPlugin from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
import rrulePlugin from '@fullcalendar/rrule'
import timeGridPlugin from '@fullcalendar/timegrid'
import { Button } from 'antd'
import dayjs from 'dayjs'
import { useAtomValue } from 'jotai'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MdSchedule } from 'react-icons/md'

// import useTheme from '@/hooks/useTheme'
import { useTheme } from '@/Agenda3/components/ThemeProvider'
import { transformAgendaTaskToCalendarEvent } from '@/Agenda3/helpers/fullCalendar'
import { nextSessionDuration } from '@/Agenda3/helpers/taskSessions'
import { track } from '@/Agenda3/helpers/umami'
import { getWorkingHours, readWorkingHours, validateWorkingHours } from '@/Agenda3/helpers/workingHours'
import useSessionScheduling, { captureSessionLeave } from '@/Agenda3/hooks/useSessionScheduling'
import useSettings from '@/Agenda3/hooks/useSettings'
import { agendaEntitiesAtom } from '@/Agenda3/models/entities/entities'
import { calendarTasksAtom } from '@/Agenda3/models/entities/tasks'
import { cn } from '@/util/util'

import TaskModal from '../modals/TaskModal'
import { type CreateTaskForm } from '../modals/TaskModal/useCreate'
import TheCalendarEvent from './TheCalendarEvent'
import WorkingHoursModal from './WorkingHoursModal'
import s from './timebox.module.less'

const FULL_CALENDAR_24HOUR_FORMAT = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
} as const
const TimeBox = ({ onChangeType }: { onChangeType?: () => void }) => {
  const { t } = useTranslation()
  const { currentTheme: theme } = useTheme()
  const { settings, setSettings } = useSettings()
  const [editingHours, setEditingHours] = useState(false)
  const savedHours = useMemo(() => readWorkingHours(settings.timeBoxWorkingHours), [settings.timeBoxWorkingHours])
  const hours = useMemo(() => getWorkingHours(savedHours), [savedHours])
  const validateSchedule = useMemo(
    () =>
      hours &&
      validateWorkingHours(hours, (start) =>
        t('Session at {{date}} falls outside Time Box working hours.', { date: start.format('YYYY-MM-DD HH:mm') }),
      ),
    [hours, t],
  )
  const groupType = settings.selectedFilters?.length ? 'filter' : 'page'
  const calendarRef = useRef<FullCalendar>(null)
  const onEventScheduleUpdate = useSessionScheduling(validateSchedule)
  const recentTasks = useAtomValue(calendarTasksAtom)
  const entities = useAtomValue(agendaEntitiesAtom)
  const eventAllow: CalendarOptions['eventAllow'] =
    hours &&
    (({ start, end, allDay }, event) => {
      if (allDay) return false
      // External cards can have a preview duration that differs from the next saved session.
      const cardTask =
        event && !event.start && !event.extendedProps.rawBlock && !event.extendedProps.eventKind
          ? entities.find(({ id }) => id === event.id)
          : undefined
      return hours.allows(start, cardTask ? dayjs(start).add(nextSessionDuration(cardTask), 'minute').toDate() : end)
    })
  const now = dayjs()
  const [visibleDate, setVisibleDate] = useState(() => now.format('YYYY-MM-DD'))
  const visibleStart = dayjs(visibleDate)
  const calendarEvents = recentTasks
    // TODO: 补充 deadline 任务的处理后移除次过滤器
    .filter((task) => !settings.viewOptions?.hideCompleted || task.status !== 'done')
    .map((task) =>
      transformAgendaTaskToCalendarEvent(task, {
        showFirstEventInCycleOnly: settings.viewOptions?.showFirstEventInCycleOnly,
        showTimeLog: settings.viewOptions?.showTimeLog,
        groupType,
        range: { start: visibleStart, end: visibleStart.add(1, 'day') },
      }),
    )
    .flat()

  // const [editTaskModal, setEditTaskModal] = useState<{
  //   open: boolean
  //   task?: AgendaTask
  // }>({
  //   open: false,
  // })
  const [createTaskModal, setCreateTaskModal] = useState<
    | { open: false }
    | {
        open: true
        initialData: Partial<CreateTaskForm>
      }
  >({
    open: false,
  })

  // const onEventClick = (info: unknown) => {
  //   const _info = info as FullCalendarEventInfo
  //   setEditTaskModal({
  //     open: true,
  //     task: _info.event.extendedProps,
  //   })
  // }

  const onClickNav = (action: 'prev' | 'next' | 'today') => {
    const calendarApi = calendarRef.current?.getApi()
    if (action === 'today') {
      calendarApi?.today()
    } else if (action === 'prev') {
      calendarApi?.prev()
    } else if (action === 'next') {
      calendarApi?.next()
    }
    track('TimeBox: Click Nav Button', { action })
  }

  return (
    <div
      className={cn(
        'group/root flex h-full w-[290px] flex-col border-l bg-gray-50 pl-2 shadow-md dark:bg-zinc-900',
        s.fullCalendarTimeBox,
      )}
      style={{
        // @ts-expect-error define fullcalendar css variables
        '--fc-border-color': theme === 'dark' ? '#444' : '#ebebeb',
        '--fc-highlight-color': theme === 'dark' ? 'rgba(188,232,241,.1)' : 'rgba(188,232,241,.3)',
        '--fc-page-bg-color': theme === 'dark' ? '#444' : '#fff',
      }}
    >
      <div className="group flex h-[44px] items-center justify-between">
        <div className="flex cursor-default items-center gap-1.5 px-2 py-1">
          <MdSchedule className="text-lg" /> {t('Time Box')}
        </div>
        <div className="mr-2 flex items-center">
          <Button
            size="small"
            type="text"
            title={t('Working hours')}
            aria-label={t('Working hours')}
            icon={<SettingOutlined />}
            onClick={() => setEditingHours(true)}
          />
          <div className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover/root:opacity-100">
            <Button
              size="small"
              type="text"
              aria-label={t('Previous Time Box day')}
              icon={<LeftOutlined />}
              onClick={() => onClickNav('prev')}
            />
            <Button size="small" type="text" onClick={() => onClickNav('today')}>
              {t('Today')}
            </Button>
            <Button
              size="small"
              type="text"
              aria-label={t('Next Time Box day')}
              icon={<RightOutlined />}
              onClick={() => onClickNav('next')}
            />
          </div>
        </div>
      </div>
      <FullCalendar
        slotEventOverlap={false}
        eventLeave={captureSessionLeave}
        droppable
        editable
        selectable
        businessHours={hours?.businessHours ?? false}
        selectAllow={hours && (({ start, end, allDay }) => !allDay && hours.allows(start, end))}
        eventAllow={eventAllow}
        ref={calendarRef}
        events={calendarEvents}
        headerToolbar={false}
        initialView="timeGridOneDay"
        datesSet={({ start }) => setVisibleDate(dayjs(start).format('YYYY-MM-DD'))}
        defaultTimedEventDuration="00:30"
        plugins={[timeGridPlugin, interactionPlugin, rrulePlugin]}
        eventTimeFormat={FULL_CALENDAR_24HOUR_FORMAT}
        slotLabelFormat={FULL_CALENDAR_24HOUR_FORMAT}
        // drag external kanban element to calendar
        eventReceive={(info) => {
          void onEventScheduleUpdate(info, true)
          track('Time Box: Receive Event')
        }}
        // resize duration
        eventResize={(info) => {
          void onEventScheduleUpdate(info)
          track('Time Box: Resize Event')
        }}
        // drag move
        eventDrop={(info) => {
          void onEventScheduleUpdate(info)
          track('Time Box: Move Event')
        }}
        // click
        // eventClick={onEventClick}
        select={(info) => {
          setCreateTaskModal({
            open: true,
            initialData: {
              startDateVal: dayjs(info.start),
              startTime: dayjs(info.start).format('HH:mm'),
              sessions: [{ id: crypto.randomUUID(), start: dayjs(info.start), end: dayjs(info.end) }],
            },
          })
          track('Time Box: Select Event')
        }}
        eventContent={(info) => <TheCalendarEvent info={info} validateSchedule={validateSchedule} />}
        views={{
          timeGridOneDay: {
            type: 'timeGrid',
            duration: { days: 1 },
            allDaySlot: false,
            nowIndicator: true,
            slotDuration: '00:15:00',
            slotLabelInterval: '01:00',
            scrollTime: now.subtract(1, 'hour').format('HH:mm:ss'),
            dayHeaderContent: (date) => {
              const day = dayjs(date.date)
              const isToday = day.isSame(now, 'day')
              return (
                <div className="flex gap-1 text-gray-500 dark:text-gray-300">
                  {day.format('ddd')}
                  <span
                    className={cn('h-6 w-6 rounded ', {
                      'bg-blue-400 text-white dark:bg-blue-600 dark:text-gray-100': isToday,
                    })}
                  >
                    {day.format('DD')}
                  </span>
                </div>
              )
            },
          },
        }}
      />
      {editingHours && (
        <WorkingHoursModal
          initial={savedHours}
          onClose={() => setEditingHours(false)}
          onSave={(draft) => {
            setSettings('timeBoxWorkingHours', JSON.stringify(draft))
            setEditingHours(false)
          }}
        />
      )}
      {createTaskModal.open ? (
        <TaskModal
          open={createTaskModal.open}
          validateSchedule={validateSchedule}
          onOk={() => {
            setCreateTaskModal({ open: false })
          }}
          onCancel={() => setCreateTaskModal({ open: false })}
          info={{ type: 'create', initialData: createTaskModal.initialData }}
        />
      ) : null}
    </div>
  )
}

export default TimeBox
