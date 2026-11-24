import type { AgendaEntity } from '@/types/entity'
import { parseTaskPriority, TASK_PRIORITIES } from '@/types/taskPriority'

/** Keep completed tasks last and preserve source order for equal priorities. */
export function sortKanbanTasks<T extends Pick<AgendaEntity, 'status' | 'priority'>>(tasks: readonly T[]): T[] {
  const rank = (task: T) => TASK_PRIORITIES.indexOf(parseTaskPriority(task.priority) ?? 'medium')
  return [...tasks].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || rank(a) - rank(b))
}
