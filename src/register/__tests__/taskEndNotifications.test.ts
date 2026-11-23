import dayjs from 'dayjs'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { getAgendaEntities } from '@/Agenda3/helpers/task'
import type { Settings } from '@/Agenda3/models/settings'
import type { AgendaEntity } from '@/types/entity'

import { initializeTaskEndNotifications, testTaskEndNotification } from '../taskEndNotifications'

vi.mock('@/Agenda3/helpers/task', async () => ({
  ...(await vi.importActual<typeof import('@/Agenda3/helpers/task')>('@/Agenda3/helpers/task')),
  getAgendaEntities: vi.fn(),
}))

const start = dayjs('2026-11-23T10:00:00')
const task = {
  id: 'task-1',
  title: 'Task',
  showTitle: 'Task',
  status: 'todo',
  start,
  allDay: false,
  estimatedTime: 30,
  project: {},
} as AgendaEntity
const end = start.add(30, 'minute').valueOf()
let stop: (() => void) | undefined
let graphChanged: () => void
let notification: ReturnType<typeof vi.fn>
let unsubscribe: ReturnType<typeof vi.fn>
let unsubscribeSettings: ReturnType<typeof vi.fn>
let settingsChanged: (settings: Settings, previous: Settings) => void
let openAgenda: ReturnType<typeof vi.fn<[], Promise<void>>>
let focus: ReturnType<typeof vi.spyOn>
let callWin: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(end - 10_000)
  openAgenda = vi.fn<[], Promise<void>>().mockResolvedValue(undefined)
  focus = vi.spyOn(window, 'focus').mockImplementation(() => {})
  callWin = vi.fn().mockResolvedValue(false)
  notification = vi.fn(function () {
    return { close: vi.fn() }
  })
  Object.assign(notification, { permission: 'granted', requestPermission: vi.fn().mockResolvedValue('granted') })
  vi.stubGlobal('Notification', notification)
  unsubscribe = vi.fn()
  unsubscribeSettings = vi.fn()
  vi.stubGlobal('logseq', {
    settings: { isInitialized: true, general: { notifyOnTaskEnd: true }, selectedFilters: ['hidden'] },
    onSettingsChanged: vi.fn((handler) => {
      settingsChanged = handler
      return unsubscribeSettings
    }),
    App: {
      getCurrentGraph: vi.fn().mockResolvedValue({ url: 'graph-a' }),
      onCurrentGraphChanged: vi.fn((handler) => {
        graphChanged = handler
        return unsubscribe
      }),
      pushState: vi.fn(),
    },
    UI: { showMsg: vi.fn() },
    hideMainUI: vi.fn(),
    _callWin: callWin,
  })
  vi.mocked(getAgendaEntities).mockReset().mockResolvedValue([task])
})

afterEach(() => {
  stop?.()
  stop = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const launch = async () => {
  stop = initializeTaskEndNotifications(openAgenda)
  await vi.advanceTimersByTimeAsync(0)
}

describe('background task-end notifications', () => {
  test('works without mounting Agenda, emits sound, and does not repeat', async () => {
    await launch()
    expect(notification).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(notification).toHaveBeenCalledWith(
      'Agenda — scheduled time ended',
      expect.objectContaining({
        body: 'Task',
        silent: false,
        requireInteraction: true,
      }),
    )
    expect(getAgendaEntities).toHaveBeenCalledWith(expect.objectContaining({ selectedFilters: [] }), {
      scheduledIncompleteOnly: true,
    })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(notification).toHaveBeenCalledTimes(1)
  })

  test('does not replay overdue tasks on startup or reload', async () => {
    vi.setSystemTime(end + 1)
    await launch()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(notification).not.toHaveBeenCalled()
  })

  test('refreshes completion, deletion and rescheduling before alerting', async () => {
    await launch()
    vi.mocked(getAgendaEntities).mockResolvedValue([{ ...task, status: 'done' }])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(notification).not.toHaveBeenCalled()
    vi.mocked(getAgendaEntities).mockResolvedValue([{ ...task, estimatedTime: 31 }])
    await vi.advanceTimersByTimeAsync(60_000)
    expect(notification).toHaveBeenCalledTimes(1)
    vi.mocked(getAgendaEntities).mockResolvedValue([])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(notification).toHaveBeenCalledTimes(1)
  })

  test('respects disable and notification permission', async () => {
    logseq.settings!.general = { notifyOnTaskEnd: false }
    await launch()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(getAgendaEntities).not.toHaveBeenCalled()
    expect(notification).not.toHaveBeenCalled()
    await testTaskEndNotification()
    expect(notification).toHaveBeenCalledTimes(1)
    Object.assign(notification, { permission: 'denied' })
    await testTaskEndNotification()
    expect(logseq.UI.showMsg).toHaveBeenCalledWith(expect.stringContaining('Allow notifications'), 'warning')
  })

  test('requires opt-in and does not replay tasks that ended before enabling', async () => {
    logseq.settings!.general = {}
    await launch()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(getAgendaEntities).not.toHaveBeenCalled()
    const previous = logseq.settings as unknown as Settings
    logseq.settings = { ...logseq.settings!, general: { notifyOnTaskEnd: true } }
    settingsChanged(logseq.settings as unknown as Settings, previous)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(getAgendaEntities).toHaveBeenCalled()
    expect(notification).not.toHaveBeenCalled()
  })

  test('does not query tasks when desktop notifications are unavailable or denied', async () => {
    Object.assign(notification, { permission: 'denied' })
    await launch()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(getAgendaEntities).not.toHaveBeenCalled()
    expect(notification).not.toHaveBeenCalled()
    vi.stubGlobal('Notification', undefined)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(getAgendaEntities).not.toHaveBeenCalled()
  })

  test('focuses Logseq and opens Agenda instead of navigating to the block', async () => {
    await launch()
    await vi.advanceTimersByTimeAsync(10_000)
    const toast = notification.mock.results[0].value
    await toast.onclick()
    expect(toast.close).toHaveBeenCalledOnce()
    expect(callWin).toHaveBeenNthCalledWith(1, 'isMinimized')
    expect(callWin).toHaveBeenNthCalledWith(2, 'show')
    expect(callWin).toHaveBeenNthCalledWith(3, 'focus')
    expect(callWin).not.toHaveBeenCalledWith('restore')
    expect(focus).not.toHaveBeenCalled()
    expect(openAgenda).toHaveBeenCalledOnce()
    expect(logseq.hideMainUI).not.toHaveBeenCalled()
    expect(logseq.App.pushState).not.toHaveBeenCalled()
  })

  test('restores a minimized native window before showing and focusing it', async () => {
    callWin.mockResolvedValueOnce(true)
    await launch()
    await testTaskEndNotification()
    await notification.mock.results[0].value.onclick()
    expect(callWin.mock.calls).toEqual([['isMinimized'], ['restore'], ['show'], ['focus']])
    expect(openAgenda).toHaveBeenCalledOnce()
  })

  test('opens Agenda without waiting for the window bridge to respond', async () => {
    let resolve!: (minimized: boolean) => void
    callWin.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    await launch()
    await testTaskEndNotification()
    const click = notification.mock.results[0].value.onclick()
    expect(openAgenda).toHaveBeenCalledOnce()
    resolve(false)
    await click
  })

  test('a rejected native focus request does not prevent Agenda opening', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    callWin.mockRejectedValueOnce(new Error('Bridge unavailable'))
    await launch()
    await testTaskEndNotification()
    await expect(notification.mock.results[0].value.onclick()).resolves.toBeUndefined()
    expect(openAgenda).toHaveBeenCalledOnce()
    expect(logseq.UI.showMsg).not.toHaveBeenCalled()
  })

  test('falls back to DOM focus on hosts without the desktop window bridge', async () => {
    Object.assign(logseq, { _callWin: undefined })
    await launch()
    await testTaskEndNotification()
    await notification.mock.results[0].value.onclick()
    expect(focus).toHaveBeenCalledOnce()
    expect(openAgenda).toHaveBeenCalledOnce()
  })

  test('a throwing DOM focus fallback does not prevent Agenda opening', async () => {
    Object.assign(logseq, { _callWin: undefined })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    focus.mockImplementation(() => {
      throw new Error('Focus denied')
    })
    await launch()
    await testTaskEndNotification()
    await expect(notification.mock.results[0].value.onclick()).resolves.toBeUndefined()
    expect(openAgenda).toHaveBeenCalledOnce()
    expect(logseq.UI.showMsg).not.toHaveBeenCalled()
  })

  test('opens the current Agenda after switching graphs without following a stale task ID', async () => {
    await launch()
    await vi.advanceTimersByTimeAsync(10_000)
    const toast = notification.mock.results[0].value
    vi.mocked(logseq.App.getCurrentGraph).mockResolvedValue({ url: 'graph-b' } as never)
    graphChanged()
    await toast.onclick()
    expect(openAgenda).toHaveBeenCalledOnce()
    expect(logseq.App.pushState).not.toHaveBeenCalled()
  })

  test('the test notification uses the same opener even without a task ID', async () => {
    await launch()
    await testTaskEndNotification()
    await notification.mock.results[0].value.onclick()
    expect(openAgenda).toHaveBeenCalledOnce()
    expect(callWin).toHaveBeenCalledWith('focus')
  })

  test('waits for the Agenda opener and reports failures without an unhandled rejection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await launch()
    await testTaskEndNotification()
    openAgenda.mockRejectedValueOnce(new Error('Mount failed'))
    await expect(notification.mock.results[0].value.onclick()).resolves.toBeUndefined()
    expect(logseq.UI.showMsg).toHaveBeenCalledWith(expect.stringContaining('Could not open Agenda'), 'error')
  })

  test('unloading detaches the opener from notifications that are still visible', async () => {
    await launch()
    await testTaskEndNotification()
    stop!()
    stop = undefined
    await notification.mock.results[0].value.onclick()
    expect(openAgenda).not.toHaveBeenCalled()
  })

  test('does not deliver an in-flight result after being disabled', async () => {
    let resolve!: (tasks: AgendaEntity[]) => void
    vi.mocked(getAgendaEntities).mockReturnValueOnce(
      new Promise((r) => {
        resolve = r
      }),
    )
    await launch()
    vi.setSystemTime(end)
    const previous = logseq.settings as unknown as Settings
    logseq.settings = { ...logseq.settings!, general: { notifyOnTaskEnd: false } }
    settingsChanged(logseq.settings as unknown as Settings, previous)
    resolve([task])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(notification).not.toHaveBeenCalled()
  })

  test('discards an in-flight response from a previous graph', async () => {
    let resolve!: (tasks: AgendaEntity[]) => void
    vi.mocked(getAgendaEntities).mockReturnValueOnce(
      new Promise((r) => {
        resolve = r
      }),
    )
    await launch()
    vi.setSystemTime(end)
    graphChanged()
    vi.mocked(logseq.App.getCurrentGraph).mockResolvedValue({ url: 'graph-b' } as never)
    resolve([task])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(notification).not.toHaveBeenCalled()
  })

  test('recovers from transient failures and ignores a long sleep backlog', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await launch()
    vi.mocked(getAgendaEntities).mockRejectedValueOnce(new Error('Graph busy'))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(notification).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(notification).toHaveBeenCalledTimes(1)
    stop!()
    vi.setSystemTime(end - 10_000)
    await launch()
    vi.setSystemTime(end + 60 * 60_000)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(notification).toHaveBeenCalledTimes(1)
  })

  test('unloading cancels polling and unsubscribes', async () => {
    await launch()
    stop!()
    stop = undefined
    await vi.advanceTimersByTimeAsync(60_000)
    expect(notification).not.toHaveBeenCalled()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(unsubscribeSettings).toHaveBeenCalledTimes(1)
  })
})
