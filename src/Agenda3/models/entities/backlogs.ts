import { atom } from 'jotai'

import type { AgendaBacklog } from '@/types/backlog'

import { agendaEntitiesAtom } from './entities'
import { overdueTasksAtom } from './tasks'

// backlog
export const backlogsAtom = atom<AgendaBacklog[]>((get) => {
  const allTasks = get(agendaEntitiesAtom)
  return allTasks.filter((task) => task.status === 'todo' && !task.start && !task.objective)
})

export const plannerBacklogsAtom = atom((get) => {
  const overdueIds = new Set(get(overdueTasksAtom).map((task) => task.id))
  return get(backlogsAtom).filter((task) => !overdueIds.has(task.id))
})
