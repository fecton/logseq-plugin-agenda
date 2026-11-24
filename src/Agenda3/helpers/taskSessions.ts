import dayjs, { type Dayjs } from 'dayjs'

import { DEFAULT_ESTIMATED_TIME } from '@/constants/agenda'
import type { AgendaEntity } from '@/types/entity'

export type PlannedSession = { id: string; start: Dayjs; end: Dayjs }
export type SessionOperation =
  | { type: 'add'; start: Dayjs; id: string; duration?: number }
  | { type: 'update'; id: string; start: Dayjs; end: Dayjs }
  | { type: 'remove'; id: string }
  | { type: 'move-day'; from: string; to: string }

export function validateSessions(sessions: readonly PlannedSession[]): PlannedSession[] {
  const ids = new Set<string>()
  const sorted = [...sessions].sort((a, b) => a.start.valueOf() - b.start.valueOf())
  for (const [index, session] of sorted.entries()) {
    if (
      !session.id ||
      ids.has(session.id) ||
      !session.start.isValid() ||
      !session.end.isValid() ||
      !session.end.isAfter(session.start)
    ) {
      throw new Error('Sessions require unique IDs, valid times and a positive duration.')
    }
    if (index && session.start.isBefore(sorted[index - 1].end))
      throw new Error('Sessions of the same task cannot overlap.')
    ids.add(session.id)
  }
  return sorted
}

export function parseSessions(value: string): PlannedSession[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed)) throw new Error('Invalid sessions data. Edit the sessions field in Logseq to repair it.')
  return validateSessions(
    parsed.map((entry) => {
      if (!entry || typeof entry !== 'object') throw new Error('Invalid sessions data.')
      const session = entry as Record<string, unknown>
      if (typeof session?.id !== 'string' || typeof session?.start !== 'string' || typeof session?.end !== 'string')
        throw new Error('Invalid sessions data.')
      return { id: session.id, start: dayjs(session.start), end: dayjs(session.end) }
    }),
  )
}

export function serializeSessions(sessions: readonly PlannedSession[]) {
  return JSON.stringify(
    validateSessions(sessions).map(({ id, start, end }) => ({ id, start: start.format(), end: end.format() })),
  )
}

export function supportsSessions(
  task: Partial<Pick<AgendaEntity, 'rrule' | 'recurringPast' | 'rawBlock' | 'allDay' | 'end' | 'objective'>>,
) {
  return !task.rrule && !task.recurringPast && !task.rawBlock?.repeated && !task.objective && !task.end
}

export function getTaskSessions(
  task: Partial<
    Pick<
      AgendaEntity,
      | 'sessions'
      | 'sessionsError'
      | 'start'
      | 'allDay'
      | 'end'
      | 'estimatedTime'
      | 'rrule'
      | 'recurringPast'
      | 'rawBlock'
      | 'objective'
    >
  >,
): PlannedSession[] {
  if (task.sessionsError || !supportsSessions(task)) return []
  if (task.sessions !== undefined) return task.sessions
  return task.start && !task.allDay
    ? [
        {
          id: 'scheduled',
          start: task.start,
          end: task.start.add(task.estimatedTime ?? DEFAULT_ESTIMATED_TIME, 'minute'),
        },
      ]
    : []
}

export function nextSessionDuration(task: AgendaEntity) {
  const sessions = getTaskSessions(task)
  const last = [...sessions].sort((a, b) => b.start.valueOf() - a.start.valueOf())[0]
  return last ? last.end.diff(last.start, 'minute') : task.estimatedTime ?? DEFAULT_ESTIMATED_TIME
}

export function applySessionOperation(task: AgendaEntity, operation: SessionOperation) {
  if (task.sessionsError) throw new Error(task.sessionsError)
  if (!supportsSessions(task)) throw new Error('Sessions are unavailable for recurring tasks or date ranges.')
  const sessions = getTaskSessions(task)
  if (operation.type === 'add') {
    return validateSessions([
      ...sessions,
      {
        id: operation.id,
        start: operation.start,
        end: operation.start.add(operation.duration ?? nextSessionDuration(task), 'minute'),
      },
    ])
  }
  if (operation.type === 'move-day') {
    const delta = dayjs(operation.to).diff(dayjs(operation.from), 'day')
    return validateSessions(
      sessions.map((session) =>
        session.start.format('YYYY-MM-DD') === operation.from
          ? { ...session, start: session.start.add(delta, 'day'), end: session.end.add(delta, 'day') }
          : session,
      ),
    )
  }
  if (!sessions.some((session) => session.id === operation.id))
    throw new Error('This session no longer exists. Reopen the task.')
  return validateSessions(
    operation.type === 'remove'
      ? sessions.filter((session) => session.id !== operation.id)
      : sessions.map((session) =>
          session.id === operation.id ? { id: session.id, start: operation.start, end: operation.end } : session,
        ),
  )
}

const sameSession = (a?: PlannedSession, b?: PlannedSession) =>
  a?.id === b?.id && a?.start.valueOf() === b?.start.valueOf() && a?.end.valueOf() === b?.end.valueOf()

/** Merge only edited sessions, preserving unrelated sessions added while the editor was open. */
export function mergeSessionEdits(current: PlannedSession[], original: PlannedSession[], edited: PlannedSession[]) {
  const result = new Map(current.map((session) => [session.id, session]))
  for (const previous of original) {
    const next = edited.find((session) => session.id === previous.id)
    if (sameSession(previous, next)) continue
    if (!sameSession(result.get(previous.id), previous))
      throw new Error('This session changed elsewhere. Reopen the task and try again.')
    if (next) result.set(next.id, next)
    else result.delete(previous.id)
  }
  for (const session of edited.filter((entry) => !original.some((old) => old.id === entry.id))) {
    if (result.has(session.id)) throw new Error('This session already exists. Reopen the task.')
    result.set(session.id, session)
  }
  return validateSessions([...result.values()])
}

const writes = new Map<string, Promise<unknown>>()
export function serializeTaskWrite<T>(id: string, write: () => Promise<T>): Promise<T> {
  const previous = writes.get(id) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(write)
  writes.set(id, next)
  void next
    .finally(() => {
      if (writes.get(id) === next) writes.delete(id)
    })
    .catch(() => undefined)
  return next
}
