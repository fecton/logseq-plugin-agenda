import type { BlockEntity } from '@logseq/libs/dist/LSPlugin'
import dayjs from 'dayjs'
import { describe, expect, test } from 'vitest'

import type { AgendaEntity } from '@/types/entity'

import { buildNativeCompletion, getNativeOccurrence, readNativeCompletionHistory } from '../nativeRepeat'

function block(content: string, data: Partial<BlockEntity> = {}) {
  return { content, marker: 'TODO', format: 'markdown', ...data } as BlockEntity
}

const now = dayjs('2026-11-28T12:15:30')

describe('Logseq OG repeating task completion', () => {
  test.each([
    ['2026-11-25 Wed +1d', '2026-11-26 Thu +1d'],
    ['2026-11-25 Wed .+1d', '2026-11-29 Sun .+1d'],
    ['2026-11-25 Wed ++1d', '2026-11-26 Thu ++1d'],
    ['2026-11-29 Sun ++1d', '2026-11-29 Sun ++1d'],
    ['2026-11-25 Wed 9:00 .+1d', '2026-11-29 Sun 09:00 .+1d'],
    ['2026-11-28 Sat 10:00 .+1h', '2026-11-28 Sat 13:00 .+1h'],
    ['2026-01-31 Sat .+1m', '2026-12-28 Mon .+1m'],
    ['2024-02-29 Thu +1y', '2025-02-28 Fri +1y'],
  ])('advances <%s> to <%s>', (scheduled, next) => {
    const content = `TODO Task\nSCHEDULED: <${scheduled}>`
    const start = dayjs(
      scheduled.split(' ')[0] + 'T' + (scheduled.match(/\d{1,2}:\d{2}/)?.[0] ?? '00:00').padStart(5, '0'),
    )
    const result = buildNativeCompletion(block(content), { start, expectedContent: content }, now)
    expect(result.content).toBe(
      `TODO Task\nSCHEDULED: <${next}>\n:LOGBOOK:\n* State "DONE" from "TODO" [2026-11-28 Sat 12:15]\n:END:`,
    )
    expect(result.marker).toBe('TODO')
  })

  test('resets DOING, preserves the ordinary deadline and metadata, and closes only the running clock', () => {
    const content = [
      '## DOING [#A] Work',
      'SCHEDULED: <2026-11-25 Wed 09:00 .+1d>',
      'DEADLINE: <2026-12-01 Tue 13:00>',
      'notes:: Keep this property',
      ':AGENDA:',
      'estimated: 1h',
      'custom: keep: this',
      ':END:',
      ':LOGBOOK:',
      '* State "DONE" from "DOING" [2026-11-24 Tue 15:00]',
      'CLOCK: [2026-11-28 Sat 12:00:00]',
      ':END:',
      'Leave this note alone.',
    ].join('\n')
    const result = buildNativeCompletion(
      block(content, { marker: 'DOING', deadline: 20261201 }),
      { start: dayjs('2026-11-25T09:00'), expectedContent: content },
      now,
    )
    expect(result.content).toBe(
      content
        .replace('## DOING', '## TODO')
        .replace('25 Wed 09:00', '29 Sun 09:00')
        .replace(
          'CLOCK: [2026-11-28 Sat 12:00:00]',
          'CLOCK: [2026-11-28 Sat 12:00:00]--[2026-11-28 Sat 12:15:30] =>  00:15:30\n' +
            '* State "DONE" from "DOING" [2026-11-28 Sat 12:15]',
        ),
    )
    expect(readNativeCompletionHistory(result.content).map((date) => date.format('YYYY-MM-DD HH:mm'))).toEqual([
      '2026-11-24 15:00',
      '2026-11-28 12:15',
    ])
  })

  test('updates both Org planning timestamps on the same line and records Org history', () => {
    const content = 'NOW Work\r\nSCHEDULED: <2026-11-27 Fri +1d> DEADLINE: <2026-11-29 Sun ++1w>\r\n:LOGBOOK:\r\n:END:'
    const result = buildNativeCompletion(
      block(content, { marker: 'NOW', format: 'org', deadline: 20261129 }),
      { start: dayjs('2026-11-27'), expectedContent: content },
      now,
    )
    expect(result.content).toBe(
      'LATER Work\r\nSCHEDULED: <2026-11-28 Sat +1d> DEADLINE: <2026-11-29 Sun ++1w>\r\n:LOGBOOK:\r\n' +
        '- State "DONE" from "NOW" [2026-11-28 Sat 12:15]\r\n:END:',
    )
    expect(readNativeCompletionHistory(result.content)).toHaveLength(1)
    expect(result.marker).toBe('LATER')
  })

  test('allows a distinct occurrence to advance when Logseq already has the same minute-level log entry', () => {
    const start = dayjs('2026-11-25')
    const content = 'TODO Work\nSCHEDULED: <2026-11-25 Wed +1d>'
    const first = buildNativeCompletion(block(content), { start, expectedContent: content }, now)
    const second = buildNativeCompletion(
      block(first.content),
      { start: start.add(1, 'day'), expectedContent: first.content },
      now,
    )
    expect(second.content).toBe(first.content.replace('2026-11-26 Thu', '2026-11-27 Fri'))
    expect(readNativeCompletionHistory(second.content)).toHaveLength(1)
  })

  test('rejects stale, projected, and invalid occurrences before producing a write', () => {
    const content = 'TODO Work\nSCHEDULED: <2026-11-28 Sat 09:00 +1d>'
    const start = dayjs('2026-11-28T09:00')
    const task = { status: 'todo', rawBlock: { repeated: true, content } } as AgendaEntity
    expect(getNativeOccurrence(task, start)).toEqual({ start, expectedContent: content })
    expect(getNativeOccurrence(task, start.add(1, 'day'))).toBeUndefined()
    expect(getNativeOccurrence({ ...task, status: 'done', recurringPast: true }, start)).toBeUndefined()
    expect(() =>
      buildNativeCompletion(block(content + '\nNew note'), { start, expectedContent: content }, now),
    ).toThrow('changed in Logseq')
    expect(() =>
      buildNativeCompletion(block(content), { start: start.add(1, 'day'), expectedContent: content }, now),
    ).toThrow('Check its schedule')
    const invalid = content.replace('+1d', '+0d')
    expect(() => buildNativeCompletion(block(invalid), { start, expectedContent: invalid }, now)).toThrow('repeat rule')
  })
})
