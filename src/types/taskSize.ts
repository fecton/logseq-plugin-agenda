export const TASK_SIZES = ['XXL', 'XL', 'L', 'M', 'S'] as const
export type TaskSize = (typeof TASK_SIZES)[number]

export const parseTaskSize = (value: unknown): TaskSize | undefined => {
  if (typeof value !== 'string') return undefined
  const size = value.trim().toUpperCase()
  return TASK_SIZES.find((option) => option === size)
}
