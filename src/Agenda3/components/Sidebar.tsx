import { Select } from 'antd'
import { useAtom, useAtomValue } from 'jotai'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AiOutlineLeft, AiOutlineRight } from 'react-icons/ai'

import { type App, appAtom } from '@/Agenda3/models/app'
import { needsReviewAtom } from '@/Agenda3/models/entities/needsReview'
import { cn } from '@/util/util'

import Backlog from './Backlog'
import NeedsReview from './NeedsReview'
import ObjectiveBoard from './objectiveBoard/ObjectiveBoard'
import TimeBox from './timebox/TimeBox'

const Sidebar = () => {
  const [app, setApp] = useAtom(appAtom)
  const { count } = useAtomValue(needsReviewAtom)
  const { t } = useTranslation()
  useEffect(() => {
    if (count > 0 && !app.sidebarChosen) {
      setApp((state) => ({ ...state, sidebarType: 'review', sidebarChosen: true, rightSidebarFolded: false }))
    }
  }, [count, app.sidebarChosen, setApp])

  return (
    <div className={cn('group/sidebar relative transition-all', app.rightSidebarFolded ? 'w-0' : 'w-[290px]')}>
      <div className="flex h-full flex-col overflow-hidden border-l dark:border-zinc-700">
        <Select
          aria-label={t('Sidebar')}
          className="m-2 min-w-[270px]"
          value={app.sidebarType}
          onChange={(sidebarType) => setApp((state) => ({ ...state, sidebarType, sidebarChosen: true }))}
          options={[
            { value: 'review', label: `${t('Needs review')} (${count})` },
            { value: 'timebox', label: t('Time Box') },
            { value: 'backlog', label: t('Backlog') },
            ...(app.sidebarType === 'objective' ? [{ value: 'objective', label: t('Objectives') }] : []),
          ]}
        />
        <div className="min-h-0 flex-1">
          <SidebarContent sidebarType={app.sidebarType} />
        </div>
      </div>
      {/* folded option bar */}
      <div
        className="absolute -left-[16px] top-0 z-10 flex h-full w-[16px] items-center opacity-0 transition-opacity
          group-hover/sidebar:opacity-100"
      >
        <div
          className="flex h-[50px] w-full cursor-pointer items-center rounded-bl rounded-tl border-b border-l border-t bg-[#f0f0f0]
            text-gray-400 hover:bg-gray-200 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
          onClick={() =>
            setApp((_app) => ({ ..._app, sidebarChosen: true, rightSidebarFolded: !_app.rightSidebarFolded }))
          }
        >
          {app.rightSidebarFolded ? <AiOutlineLeft /> : <AiOutlineRight />}
        </div>
      </div>
    </div>
  )
}

function SidebarContent({ sidebarType }: { sidebarType: App['sidebarType'] }) {
  switch (sidebarType) {
    case 'review':
      return <NeedsReview />
    case 'backlog':
      return <Backlog />
    case 'timebox':
      return <TimeBox onChangeType={() => {}} />
    case 'objective':
      return <ObjectiveBoard />
    default:
      return null
  }
}

export default Sidebar
