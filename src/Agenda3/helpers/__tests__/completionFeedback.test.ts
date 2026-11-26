import { waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

const createSource = () => {
  const button = document.createElement('button')
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 300, 60, 20))
  return button
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.resetModules()
  document.querySelectorAll('canvas[aria-hidden="true"]').forEach((canvas) => canvas.remove())
})

test('draws at the captured button center and cleans up overlapping bursts independently without audio', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('AudioContext', undefined)
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  )
  vi.stubGlobal('devicePixelRatio', 2)
  const drawing = { scale: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn() }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(drawing as unknown as CanvasRenderingContext2D)
  const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame')
  const { prepareCompletionFeedback } = await import('../completionFeedback')
  const button = createSource()
  const first = prepareCompletionFeedback(button)
  vi.mocked(button.getBoundingClientRect).mockReturnValue(new DOMRect(350, 400, 40, 20))

  first()
  const firstCanvas = document.querySelector('canvas')!
  expect(firstCanvas).toHaveStyle({ left: '130px', top: '210px', pointerEvents: 'none' })
  expect(firstCanvas.width).toBe(400)
  expect(firstCanvas).toHaveAttribute('aria-hidden', 'true')
  vi.advanceTimersByTime(500)
  expect(drawing.fill).toHaveBeenCalled()

  prepareCompletionFeedback(button)()
  const secondCanvas = document.querySelectorAll('canvas')[1]
  expect(secondCanvas).toHaveStyle({ left: '270px', top: '310px' })
  vi.advanceTimersByTime(500)
  expect(firstCanvas).not.toBeInTheDocument()
  expect(secondCanvas).toBeInTheDocument()
  expect(cancelFrame).toHaveBeenCalledTimes(1)
  const framesDrawn = drawing.clearRect.mock.calls.length
  vi.advanceTimersByTime(100)
  expect(drawing.clearRect.mock.calls.length).toBeGreaterThan(framesDrawn)

  vi.advanceTimersByTime(400)
  expect(secondCanvas).not.toBeInTheDocument()
  expect(cancelFrame).toHaveBeenCalledTimes(2)
})

test('unlocks audio during the gesture and plays two rising notes after confirmation with reduced motion', async () => {
  const oscillators = Array.from({ length: 2 }, () => ({
    frequency: { value: 0 },
    connect: vi.fn((gain) => gain),
    start: vi.fn(),
    stop: vi.fn(),
  }))
  const gain = {
    gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  }
  const context = {
    state: 'suspended',
    currentTime: 1,
    createOscillator: vi.fn().mockReturnValueOnce(oscillators[0]).mockReturnValueOnce(oscillators[1]),
    createGain: vi.fn(() => gain),
    resume: vi.fn(async () => {
      context.state = 'running'
    }),
  }
  vi.stubGlobal(
    'AudioContext',
    vi.fn(() => context),
  )
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true })),
  )
  const { prepareCompletionFeedback } = await import('../completionFeedback')

  const celebrate = prepareCompletionFeedback(createSource())
  expect(context.resume).toHaveBeenCalledOnce()
  expect(context.createOscillator).not.toHaveBeenCalled()
  celebrate()
  await waitFor(() => expect(context.createOscillator).toHaveBeenCalledTimes(2))

  expect(document.querySelector('canvas')).toBeNull()
  expect(oscillators.map(({ frequency }) => frequency.value)).toEqual([523.25, 659.25])
  expect(oscillators[0].start).toHaveBeenCalledWith(1)
  expect(oscillators[1].start).toHaveBeenCalledWith(1.095)
})
