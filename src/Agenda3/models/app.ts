import dayjs from 'dayjs'
import { atom } from 'jotai'

import type { AgendaEntityObjective } from '@/types/objective'

export type App = {
  view: 'tasks' | 'calendar'
  rightSidebarFolded: boolean
  anchorDate: string
  sidebarType: 'timebox' | 'backlog' | 'objective' | 'review'
  sidebarChosen?: boolean
  objectivePeriod?: AgendaEntityObjective
}
export const appAtom = atom<App>({
  view: 'tasks',
  rightSidebarFolded: false,
  anchorDate: dayjs().format('YYYY-MM-DD'),
  sidebarType: 'timebox',
})
