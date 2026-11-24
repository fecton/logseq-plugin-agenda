export const TASK_PRIORITIES = ['blocker', 'highest', 'high', 'medium', 'low', 'lowest'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  blocker: 'Blocker',
  highest: 'Highest',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  lowest: 'Lowest',
}

export const parseTaskPriority = (value: unknown): TaskPriority | undefined => {
  if (typeof value !== 'string') return undefined
  const priority = value.trim().toLowerCase()
  return TASK_PRIORITIES.find((option) => option === priority)
}
