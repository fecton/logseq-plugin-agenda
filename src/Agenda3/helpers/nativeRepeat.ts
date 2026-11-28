import type { BlockEntity } from '@logseq/libs/dist/LSPlugin'
import dayjs, { type Dayjs } from 'dayjs'

import { LOGBOOK_CLOCK_FORMATTER, SCHEDULED_DATE_FORMATTER, SCHEDULED_DATETIME_FORMATTER } from '@/constants/agenda'
import type { AgendaEntity } from '@/types/entity'

const units = { h: 'hour', d: 'day', w: 'week', m: 'month', y: 'year' } as const
const logbookPattern = /^([ \t]*):LOGBOOK:[ \t]*\r?\n([\s\S]*?)^[ \t]*:END:[ \t]*(?=\r?$)/im
const completionPattern = /^\s*[*-] State "DONE" from "[A-Z-]+" \[(\d{4}-\d{2}-\d{2}) \S+ (\d{1,2}:\d{2})\]\s*$/

export type NativeOccurrence = { start: Dayjs; expectedContent: string }

function planningTimestamps(content: string) {
  const fields: { kind: string; text: string; index: number }[] = []
  for (const line of content.matchAll(/^[ \t]*(?:(?:SCHEDULED|DEADLINE):[ \t]*<[^>\r\n]*>[ \t]*)+/gm)) {
    for (const match of line[0].matchAll(/(SCHEDULED|DEADLINE):[ \t]*(<[^>]*>)/g)) {
      fields.push({
        kind: match[1],
        text: match[2],
        index: line.index! + match.index! + match[0].length - match[2].length,
      })
    }
  }
  return fields
}

function parseTimestamp(text: string) {
  const match =
    /^<(\d{4}-\d{2}-\d{2})(?:[ \t]+[^\s\d+<>]+)?(?:[ \t]+(\d{1,2}:\d{2}))?(?:[ \t]+((?:\.\+|\+\+|\+)(\d+)([hdwmy])))?>$/.exec(
      text,
    )
  if (!match) return undefined
  const [, date, time, repeater, amount, unit] = match
  if (dayjs(date).format('YYYY-MM-DD') !== date || (time && !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(time))) {
    return undefined
  }
  const start = dayjs(`${date}T${(time ?? '00:00').padStart(5, '0')}`)
  const interval = Number(amount)
  if (repeater && (!Number.isSafeInteger(interval) || interval <= 0)) return undefined
  return { start, allDay: !time, repeater, interval, unit: units[unit as keyof typeof units] }
}

export function readLogseqTimestamp(content: string, kind: 'SCHEDULED' | 'DEADLINE') {
  const field = planningTimestamps(content).find((timestamp) => timestamp.kind === kind)
  return field && parseTimestamp(field.text)
}

export function isLogseqRepeating(task: Pick<AgendaEntity, 'rawBlock' | 'rrule'>) {
  return Boolean(task.rrule || task.rawBlock?.repeated || task.rawBlock?.['repeated?'])
}

export function getNativeOccurrence(task: AgendaEntity, displayedStart: Dayjs | null | undefined) {
  if (!displayedStart || task.status !== 'todo' || task.recurringPast || !isLogseqRepeating(task)) return undefined
  const expectedContent = task.rawBlock?.content
  if (!expectedContent) return undefined
  const scheduled = readLogseqTimestamp(expectedContent, 'SCHEDULED')
  if (!scheduled?.repeater || !scheduled.start.isSame(displayedStart, scheduled.allDay ? 'day' : 'minute'))
    return undefined
  return { start: displayedStart, expectedContent }
}

// Logseq OG advances .+ repeatedly from the stored date. Month and year increments
// must be applied individually because they clamp the day at the end of a month.
function nextTimestamp(timestamp: NonNullable<ReturnType<typeof parseTimestamp>>, now: Dayjs) {
  const { start, allDay, repeater, interval, unit } = timestamp
  if (!repeater) throw new Error('Invalid Logseq repeat rule.')
  let next = start
  if (!repeater.startsWith('++') || !start.isAfter(now)) next = start.add(interval, unit)
  if (repeater.startsWith('.+')) {
    if ((unit === 'hour' || unit === 'day' || unit === 'week') && next.isBefore(now)) {
      next = next.add(Math.floor(now.diff(next, unit) / interval) * interval, unit)
    }
    while (next.isValid() && !next.isAfter(now)) {
      const following = next.add(interval, unit)
      if (following.isValid() && !following.isAfter(next)) throw new Error('Invalid Logseq repeat rule.')
      next = following
    }
  }
  if (!next.isValid() || next.year() > 9999) throw new Error('Invalid Logseq repeat rule.')
  const date = next.locale('en').format(allDay ? SCHEDULED_DATE_FORMATTER : SCHEDULED_DATETIME_FORMATTER)
  return `<${date} ${repeater}>`
}

function closeRunningClock(line: string, now: Dayjs) {
  const clock = /^([ \t]*CLOCK: )\[(\d{4}-\d{2}-\d{2}) \S+ (\d{1,2}:\d{2})(:\d{2})?\][ \t]*$/.exec(line)
  if (!clock) return line
  const [, prefix, date, time, seconds] = clock
  const startText = `${date}T${time.padStart(5, '0')}${seconds ?? ''}`
  const start = dayjs(startText)
  const startFormat = seconds ? 'YYYY-MM-DDTHH:mm:ss' : 'YYYY-MM-DDTHH:mm'
  if (start.format(startFormat) !== startText || now.isBefore(start)) return line
  const endFormat = seconds ? LOGBOOK_CLOCK_FORMATTER : SCHEDULED_DATETIME_FORMATTER
  const durationSeconds = now.diff(start, 'second')
  const duration = [Math.floor(durationSeconds / 3600), Math.floor((durationSeconds % 3600) / 60)]
  if (seconds) duration.push(durationSeconds % 60)
  const span = duration.map((part) => String(part).padStart(2, '0')).join(':')
  return `${prefix}[${line.trim().slice(8, -1)}]--[${now.locale('en').format(endFormat)}] =>  ${span}`
}

export function readNativeCompletionHistory(content: string) {
  return (logbookPattern.exec(content)?.[2] ?? '').split(/\r?\n/).flatMap((line) => {
    const date = completionPattern.exec(line)
    if (!date) return []
    const completed = dayjs(`${date[1]}T${date[2].padStart(5, '0')}`)
    return completed.isValid() ? [completed] : []
  })
}

export function buildNativeCompletion(block: BlockEntity, occurrence: NativeOccurrence, now: Dayjs) {
  const { content, marker } = block
  if (content !== occurrence.expectedContent)
    throw new Error('This occurrence changed in Logseq. Reopen it and try again.')

  const fields = planningTimestamps(content)
  const scheduled = fields.filter(({ kind }) => kind === 'SCHEDULED')
  const deadline = fields.filter(({ kind }) => kind === 'DEADLINE')
  const timestamp = scheduled.length === 1 ? parseTimestamp(scheduled[0].text) : undefined
  if (
    !timestamp?.repeater ||
    deadline.length > 1 ||
    (block.deadline && !deadline.length) ||
    !timestamp.start.isSame(occurrence.start, timestamp.allDay ? 'day' : 'minute')
  ) {
    throw new Error('This Logseq occurrence could not be completed. Check its schedule and repeat rule.')
  }

  const heading = /^([ \t]*(?:(?:#+|\*+)[ \t]+)?)(TODO|DOING|NOW|LATER|WAITING)(?=\s|$)/.exec(content)
  if (!heading || heading[2] !== marker) throw new Error('This Logseq task is no longer open.')
  const nextMarker = marker === 'DOING' ? 'TODO' : marker === 'NOW' ? 'LATER' : marker
  let updated = content
  for (const field of fields.reverse()) {
    const parsed = parseTimestamp(field.text)
    if (!parsed) throw new Error('Invalid Logseq planning timestamp.')
    if (!parsed.repeater) continue
    const next = nextTimestamp(parsed, now)
    updated = updated.slice(0, field.index) + next + updated.slice(field.index + field.text.length)
  }
  updated = heading[1] + nextMarker + updated.slice(heading[0].length)

  const state = `${block.format === 'org' ? '-' : '*'} State "DONE" from "${marker}" [${now
    .locale('en')
    .format(SCHEDULED_DATETIME_FORMATTER)}]`
  const logbook = logbookPattern.exec(updated)
  const newline = updated.includes('\r\n') ? '\r\n' : '\n'
  if (logbook) {
    const [, indent, body] = logbook
    if (/^[ \t]*:[A-Z][\w-]*:[ \t]*\r?$/im.test(body)) throw new Error('Invalid Logseq logbook.')
    const entries = body.split(/\r?\n/)
    // Logseq deduplicates identical entries, which have minute precision.
    const hasState = entries.some((line) => line.trim() === state)
    if (hasState && updated === content) throw new Error('This completion is already recorded in Logseq.')
    const lastEntry = entries.findLastIndex((entry) => Boolean(entry.trim()))
    if (lastEntry >= 0) entries[lastEntry] = closeRunningClock(entries[lastEntry], now)
    if (!hasState) entries.splice(entries.length - 1, 0, indent + state)
    const bodyStart = logbook[0].indexOf('\n') + 1
    const newLogbook =
      logbook[0].slice(0, bodyStart) + entries.join(newline) + logbook[0].slice(bodyStart + body.length)
    updated = updated.slice(0, logbook.index) + newLogbook + updated.slice(logbook.index + logbook[0].length)
  } else {
    if (/^[ \t]*:LOGBOOK:/im.test(updated)) throw new Error('Invalid Logseq logbook.')
    updated += newline + [':LOGBOOK:', state, ':END:'].join(newline)
  }
  return { content: updated, marker: nextMarker, state }
}

export function verifyNativeCompletion(block: BlockEntity | null, expected: ReturnType<typeof buildNativeCompletion>) {
  if (!block || block.marker !== expected.marker) return false
  const logbook = logbookPattern.exec(block.content)?.[2]
  if (!logbook?.split(/\r?\n/).some((line) => line.trim() === expected.state)) return false
  const timestamps = (content: string) =>
    planningTimestamps(content)
      .map(({ kind, text }) => kind + text)
      .sort()
  return JSON.stringify(timestamps(block.content)) === JSON.stringify(timestamps(expected.content))
}
