import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import dayjs from 'dayjs'
import { Provider } from 'jotai'
import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import { agendaEntitiesAtom } from '@/Agenda3/models/entities/entities'
import { reviewDayAtom } from '@/Agenda3/models/entities/needsReview'
import { settingsAtom } from '@/Agenda3/models/settings'
import type { AgendaEntity } from '@/types/entity'

import NeedsReview from './NeedsReview'

const { updateEntity } = vi.hoisted(() => ({ updateEntity: vi.fn() }))
vi.mock('@/Agenda3/hooks/useAgendaEntities', () => ({ default: () => ({ updateEntity }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (value: string) => value }) }))
vi.mock('./modals/TaskModal', () => ({ default: ({ onCancel }) => <button onClick={onCancel}>Cancel editor</button> }))
afterEach(() => {
  vi.clearAllMocks()
})

test('shows only overdue tasks once, routes recurring edits to Logseq, and retains failed saves', async () => {
  const task = (id: string, props: Partial<AgendaEntity> = {}) =>
    ({
      id,
      title: id,
      showTitle: id,
      status: 'todo',
      allDay: true,
      project: { id: 'work', originalName: 'Work' },
      rawBlock: {},
      ...props,
    } as AgendaEntity)
  const tasks = [
    task('Old task', { start: dayjs('2025-01-01'), deadline: { value: dayjs('2025-01-02'), allDay: true } }),
    task('Unscheduled task'),
    task('Deadline task', { deadline: { value: dayjs('2026-11-01'), allDay: true } }),
    task('Recurring task', {
      start: dayjs('2026-10-01'),
      rawBlock: {
        repeated: true,
        content: 'TODO Recurring task\nSCHEDULED: <2026-10-01 Thu +1d>',
      } as AgendaEntity['rawBlock'],
    }),
    task('Done task', { status: 'done' }),
  ]
  render(
    <Provider
      initialValues={[
        [agendaEntitiesAtom, tasks],
        [reviewDayAtom, '2026-11-23'],
        [settingsAtom, { isInitialized: true, selectedFilters: ['work'] }],
      ]}
    >
      <NeedsReview />
    </Provider>,
  )
  expect(screen.getByRole('region', { name: 'Needs review' })).toBeVisible()
  expect(screen.getByText('Overdue (3)')).toBeVisible()
  expect(screen.queryByText('Unscheduled task')).toBeNull()
  expect(screen.queryByText(/Unscheduled \(/)).toBeNull()
  expect(screen.getAllByText('Old task')).toHaveLength(1)
  expect(screen.queryByText('Done task')).toBeNull()
  expect(screen.getByText('Active Agenda filters apply')).toBeVisible()
  const recurring = screen.getByText('Recurring task').closest('article')!
  expect(within(recurring).queryByRole('button', { name: 'Reschedule' })).toBeNull()
  expect(within(recurring).getByRole('button', { name: 'Open in Logseq' })).toBeVisible()

  fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel editor' }))
  expect(updateEntity).not.toHaveBeenCalled()
  let rejectSave: (reason: Error) => void = () => {}
  updateEntity.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectSave = reject
      }),
  )
  const completeButton = within(screen.getByText('Old task').closest('article')!).getByRole('button', {
    name: 'Mark done',
  })
  fireEvent.click(completeButton)
  expect(updateEntity).toHaveBeenCalledWith({
    type: 'task-status',
    id: 'Old task',
    data: 'done',
    completionSource: completeButton,
  })
  expect(screen.getByText('Old task')).toBeVisible()
  await act(async () => rejectSave(new Error('offline')))
  await waitFor(() => expect(screen.getByText('Could not save task. Please try again.')).toBeVisible())
  expect(screen.getByText('Old task')).toBeVisible()
  expect(screen.getByText('Overdue (3)')).toBeVisible()

  const completeOccurrence = within(recurring).getByRole('button', { name: 'Complete occurrence' })
  await act(async () => fireEvent.click(completeOccurrence))
  expect(updateEntity).toHaveBeenLastCalledWith({
    type: 'task-status',
    id: 'Recurring task',
    data: 'done',
    completionSource: completeOccurrence,
    nativeOccurrence: {
      start: dayjs('2026-10-01'),
      expectedContent: 'TODO Recurring task\nSCHEDULED: <2026-10-01 Thu +1d>',
    },
  })
})
