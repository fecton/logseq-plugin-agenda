import dayjs, { type Dayjs } from 'dayjs'

export const DATE_VIEWS = ['day', 'threeDays', 'workWeek', 'week', 'month'] as const
export type DateView = (typeof DATE_VIEWS)[number]
export const DATE_VIEW_LABELS: Record<DateView, string> = {
  day: '1 day',
  threeDays: '3 days',
  workWeek: '5 days',
  week: '1 week',
  month: '1 month',
}
export const CALENDAR_VIEW_IDS = {
  day: 'timeGridDay',
  threeDays: 'timeGridThreeDays',
  workWeek: 'timeGridWorkWeek',
  week: 'timeGridWeek',
  month: 'dayGridMonth',
} as const

export function normalizeDateView(value: unknown): DateView {
  return DATE_VIEWS.includes(value as DateView) ? (value as DateView) : 'workWeek'
}
export function normalizeWeekStart(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6 ? value : 1
}
const weekStart = (date: Dayjs, firstDay: number) => date.subtract((date.day() - firstDay + 7) % 7, 'day')

/** All ends are exclusive local dates. Month padding matches the Calendar's visible weeks. */
export function getDateView(view: DateView, anchorDate: string, firstDay = 1) {
  const anchor = dayjs(anchorDate).startOf('day')
  const first = normalizeWeekStart(firstDay)
  const start =
    view === 'month'
      ? anchor.startOf('month')
      : view === 'workWeek'
      ? weekStart(anchor, 1)
      : view === 'week'
      ? weekStart(anchor, first)
      : anchor
  const end =
    view === 'month'
      ? start.add(1, 'month')
      : start.add(view === 'day' ? 1 : view === 'threeDays' ? 3 : view === 'workWeek' ? 5 : 7, 'day')
  const visibleStart = view === 'month' ? weekStart(start, first) : start
  const visibleEnd = view === 'month' ? weekStart(end.subtract(1, 'day'), first).add(7, 'day') : end
  const days: Dayjs[] = []
  for (let day = visibleStart; day.isBefore(visibleEnd, 'day'); day = day.add(1, 'day')) days.push(day)
  const last = end.subtract(1, 'day')
  const title =
    view === 'month'
      ? start.format('MMMM YYYY')
      : view === 'day'
      ? start.format('D MMM YYYY')
      : `${start.format(start.year() === last.year() ? 'D MMM' : 'D MMM YYYY')} – ${last.format('D MMM YYYY')}`
  return { view, start, end, visibleStart, visibleEnd, days, title, firstDay: first }
}

export function navigateDateView(view: DateView, anchorDate: string, direction: -1 | 1) {
  const date = dayjs(anchorDate)
  return (
    view === 'month'
      ? date.add(direction, 'month')
      : date.add(direction * (view === 'day' ? 1 : view === 'threeDays' ? 3 : 7), 'day')
  ).format('YYYY-MM-DD')
}
