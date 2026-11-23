import { Button, Empty, message } from 'antd'
import { useAtomValue } from 'jotai'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { navToLogseqBlock } from '@/Agenda3/helpers/logseq'
import type { OverdueTask } from '@/Agenda3/helpers/needsReview'
import useAgendaEntities from '@/Agenda3/hooks/useAgendaEntities'
import { needsReviewAtom } from '@/Agenda3/models/entities/needsReview'
import { logseqAtom } from '@/Agenda3/models/logseq'
import { settingsAtom } from '@/Agenda3/models/settings'
import type { AgendaEntity } from '@/types/entity'

import TaskSizeBadge from './TaskSizeBadge'
import TaskModal from './modals/TaskModal'

export function ReviewTask({ task, reasons = [] }: { task: AgendaEntity; reasons?: OverdueTask['reasons'] }) {
  const { t } = useTranslation()
  const { currentGraph } = useAtomValue(logseqAtom)
  const { updateEntity } = useAgendaEntities()
  const [editing, setEditing] = useState<AgendaEntity>()
  const [saving, setSaving] = useState(false)
  const recurring = Boolean(task.rrule || task.rawBlock.repeated)
  const openInLogseq = () => navToLogseqBlock(task, currentGraph)
  const complete = async () => {
    setSaving(true)
    try {
      await updateEntity({ type: 'task-status', id: task.id, data: 'done' })
    } catch (error) {
      message.error(t('Could not save task. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="rounded border border-gray-200 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="break-words font-medium">{task.showTitle || task.title}</div>
      <TaskSizeBadge size={task.size} className="mt-1 text-gray-500 dark:text-gray-300" />
      <div className="mt-1 break-words text-xs text-gray-500">{task.project.originalName}</div>
      <div className="my-2 space-y-1 text-xs">
        {task.start ? (
          <div>
            {t('Scheduled')}: {task.start.format(task.allDay ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm')}
            {task.end ? ` – ${task.end.format('YYYY-MM-DD')}` : ''}
          </div>
        ) : (
          <div>{t('No scheduled date')}</div>
        )}
        {task.deadline ? (
          <div>
            {t('Deadline')}: {task.deadline.value.format(task.deadline.allDay ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm')}
          </div>
        ) : null}
        {reasons.length ? (
          <div className="text-amber-700 dark:text-amber-400">
            {reasons
              .map((reason) => t(reason === 'schedule' ? 'Scheduled period ended' : 'Deadline passed'))
              .join(' · ')}
          </div>
        ) : null}
        {recurring ? <div className="text-gray-500">{t('Edit recurring tasks in Logseq')}</div> : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {!recurring ? (
          <>
            <Button size="small" onClick={() => setEditing(task)} disabled={saving}>
              {t(task.start ? 'Reschedule' : 'Schedule')}
            </Button>
            <Button size="small" onClick={complete} loading={saving}>
              {t('Mark done')}
            </Button>
          </>
        ) : null}
        <Button size="small" type="link" className="!px-0" onClick={openInLogseq}>
          {t('Open in Logseq')}
        </Button>
      </div>
      {editing ? (
        <TaskModal
          open
          info={{ type: 'edit', initialTaskData: editing }}
          onOk={() => setEditing(undefined)}
          onCancel={() => setEditing(undefined)}
          onDelete={() => setEditing(undefined)}
        />
      ) : null}
    </article>
  )
}

export default function NeedsReview() {
  const { t } = useTranslation()
  const { overdue, count } = useAtomValue(needsReviewAtom)
  const settings = useAtomValue(settingsAtom)
  return (
    <section aria-label={t('Needs review')} className="h-full overflow-y-auto bg-gray-50 p-2 dark:bg-zinc-900">
      {settings.selectedFilters?.length ? (
        <p className="mb-2 text-xs text-gray-500">{t('Active Agenda filters apply')}</p>
      ) : null}
      {count === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No tasks need review')} />
      ) : (
        <>
          <details open className="mb-3">
            <summary className="mb-2 cursor-pointer font-medium">
              {t('Overdue')} ({overdue.length})
            </summary>
            <div className="space-y-2">
              {overdue.map(({ task, reasons }) => (
                <ReviewTask key={task.id} task={task} reasons={reasons} />
              ))}
            </div>
          </details>
        </>
      )}
    </section>
  )
}
