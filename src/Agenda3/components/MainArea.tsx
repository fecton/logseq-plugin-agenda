import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { Button, Segmented } from 'antd'
import dayjs from 'dayjs'
import { useAtom, useAtomValue } from 'jotai'
import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FiSettings, FiXCircle } from 'react-icons/fi'
import { LuCalendarDays, LuKanbanSquare } from 'react-icons/lu'

import { navigateDateView, type DateView } from '@/Agenda3/helpers/dateViews'
import { track } from '@/Agenda3/helpers/umami'
import useSettings from '@/Agenda3/hooks/useSettings'
import { type App, appAtom } from '@/Agenda3/models/app'
import { dateViewAtom } from '@/Agenda3/models/dateView'
import { needsReviewAtom } from '@/Agenda3/models/entities/needsReview'
import { cn } from '@/util/util'

import Filter from './Filter'
import UploadIcs from './UploadIcs'
import Calendar from './calendar/Calendar'
import CalendarOperation from './calendar/CalendarAdvancedOperation'
import KanBan from './kanban/KanBan'
import SettingsModal from './modals/SettingsModal'

const MultipleView = ({ className }: { className?: string }) => {
  const { t } = useTranslation()
  const [app, setApp] = useAtom(appAtom)
  const { settings, setSettings } = useSettings()
  const dateView = useAtomValue(dateViewAtom)
  const { count: reviewCount } = useAtomValue(needsReviewAtom)

  const VIEWS = [
    {
      value: 'calendar',
      label: (
        <div className="flex items-center gap-1">
          <LuCalendarDays className="text-base" /> {t('Calendar')}
        </div>
      ),
    },
    {
      value: 'tasks',
      label: (
        <div className="flex items-center gap-1">
          <LuKanbanSquare className="text-base" /> {t('Tasks')}
        </div>
      ),
    },
  ]

  const navigate = useCallback(
    (direction: -1 | 1) => {
      setApp((state) => ({ ...state, anchorDate: navigateDateView(dateView.view, state.anchorDate, direction) }))
    },
    [dateView.view, setApp],
  )
  const onClickToday = () => {
    setApp((state) => ({ ...state, anchorDate: dayjs().format('YYYY-MM-DD') }))
    track('Today Button', { view: app.view })
  }
  const setDateView = useCallback(
    (view: DateView) => {
      setSettings('viewOptions.dateRange', view)
      track('Date Range Change', { range: view })
    },
    [setSettings],
  )
  const onClickAppViewChange = useCallback(
    (view: App['view']) => {
      const _view = view as App['view']
      setApp((_app) => {
        return { ..._app, view: _view }
      })
      track('View Change', { view: view })
    },
    [setApp],
  )
  useEffect(() => {
    let lastKeyDownTime = 0
    let lastKey = ''
    const handleKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null
      const dialogOpen = Array.from(document.querySelectorAll('[role="dialog"]')).some((dialog) => {
        let element: Element | null = dialog
        while (element) {
          if (element.getAttribute('aria-hidden') === 'true' || getComputedStyle(element).display === 'none')
            return false
          element = element.parentElement
        }
        return true
      })
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        dialogOpen ||
        active?.closest('input, textarea, select, [contenteditable="true"], [role="combobox"]')
      )
        return
      const now = Date.now()
      if (
        (event.code === 'BracketLeft' || event.code === 'BracketRight') &&
        lastKey === event.code &&
        now - lastKeyDownTime <= 500
      ) {
        event.preventDefault()
        navigate(event.code === 'BracketLeft' ? -1 : 1)
        lastKey = ''
        return
      }
      if (event.code === 'KeyW') {
        event.preventDefault()
        setDateView(dateView.view === 'month' ? 'week' : 'month')
      }
      if (event.code === 'KeyT') {
        event.preventDefault()
        onClickAppViewChange(app.view === 'calendar' ? 'tasks' : 'calendar')
      }
      lastKey = event.code
      lastKeyDownTime = now
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [dateView.view, app.view, navigate, setDateView, onClickAppViewChange])

  return (
    <div className={cn('relative z-0 flex w-0 flex-1 flex-col py-1 pl-2', className)}>
      {/* ========= View Actions ========= */}
      <div className="flex w-full flex-wrap items-center justify-between gap-2 border-b py-1 pr-2">
        <div className="flex items-center">
          <div className="mr-1 flex shrink-0 gap-1">
            <Button
              aria-label={t('Previous')}
              title={t('Previous')}
              icon={<LeftOutlined />}
              shape="circle"
              className="!bg-transparent"
              onClick={() => navigate(-1)}
            />
            <Button
              aria-label={t('Next')}
              title={t('Next')}
              icon={<RightOutlined />}
              shape="circle"
              className="!bg-transparent"
              onClick={() => navigate(1)}
            />
          </div>
          <Button className="!bg-transparent" shape="round" onClick={onClickToday}>
            {t('Today')}
          </Button>
          <h1 className="ml-3 text-lg font-medium" aria-live="polite">
            {dateView.title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type={app.sidebarType === 'review' && !app.rightSidebarFolded ? 'primary' : 'default'}
            onClick={() =>
              setApp((_app) => ({ ..._app, sidebarType: 'review', sidebarChosen: true, rightSidebarFolded: false }))
            }
          >
            {t('Needs review')} ({reviewCount})
          </Button>
          <CalendarOperation value={dateView.view} onChange={setDateView} />
          <Segmented
            value={app.view}
            className="!bg-gray-200 dark:!bg-zinc-700"
            options={VIEWS}
            onChange={(view) => onClickAppViewChange(view as App['view'])}
          />
          {settings.filters?.length ? <Filter /> : null}
          {settings.ics?.repo && settings.ics?.token ? <UploadIcs className="cursor-pointer text-lg" /> : null}
          <SettingsModal initialTab="general">
            <FiSettings className="cursor-pointer text-lg" onClick={() => track('Settings Button')} />
          </SettingsModal>
          {import.meta.env.VITE_MODE === 'plugin' ? (
            <FiXCircle className="cursor-pointer text-lg" onClick={() => logseq.hideMainUI()} />
          ) : null}
        </div>
      </div>
      <div className="h-0 flex-1">{app.view === 'tasks' ? <KanBan /> : <Calendar />}</div>
    </div>
  )
}

export default MultipleView
