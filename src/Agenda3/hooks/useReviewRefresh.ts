import dayjs from 'dayjs'
import { useSetAtom } from 'jotai'
import { useEffect } from 'react'

import { agendaEntitiesAtom, invalidateEntitiesAtom } from '@/Agenda3/models/entities/entities'
import { reviewDayAtom } from '@/Agenda3/models/entities/needsReview'

/** Keep the review queue current without querying the graph on every clock tick. */
export default function useReviewRefresh(refresh: () => void) {
  const setDay = useSetAtom(reviewDayAtom)
  const clearEntities = useSetAtom(agendaEntitiesAtom)
  const invalidate = useSetAtom(invalidateEntitiesAtom)
  useEffect(() => {
    let lastDay = ''
    let midnight: ReturnType<typeof setTimeout>
    let debounce: ReturnType<typeof setTimeout> | undefined
    const updateDay = () => {
      const now = dayjs()
      const day = now.format('YYYY-MM-DD')
      const changed = lastDay !== day
      lastDay = day
      setDay(day)
      clearTimeout(midnight)
      midnight = setTimeout(wake, now.add(1, 'day').startOf('day').diff(now) + 10)
      return changed
    }
    const wake = () => {
      updateDay()
      refresh()
    }
    const visible = () => {
      if (document.visibilityState === 'visible') wake()
    }
    const queueRefresh = () => {
      invalidate()
      clearTimeout(debounce)
      debounce = setTimeout(wake, 300)
    }
    const graphChanged = () => {
      invalidate()
      clearEntities([])
      wake()
    }
    window.addEventListener('focus', wake)
    document.addEventListener('visibilitychange', visible)
    // The minute check also catches a suspended computer resuming across midnight.
    const clock = setInterval(() => {
      if (updateDay()) refresh()
    }, 60_000)
    const plugin = import.meta.env.VITE_MODE === 'plugin'
    const offDB = plugin ? logseq.DB.onChanged(queueRefresh) : undefined
    const offGraph = plugin ? logseq.App.onCurrentGraphChanged(graphChanged) : undefined
    const onUIVisible = ({ visible }: { visible: boolean }) => {
      if (visible) wake()
    }
    if (plugin) logseq.on('ui:visible:changed', onUIVisible)
    wake()
    return () => {
      clearTimeout(midnight)
      clearTimeout(debounce)
      clearInterval(clock)
      window.removeEventListener('focus', wake)
      document.removeEventListener('visibilitychange', visible)
      offDB?.()
      offGraph?.()
      if (plugin) logseq.off('ui:visible:changed', onUIVisible)
      invalidate()
    }
  }, [refresh, setDay, clearEntities, invalidate])
}
