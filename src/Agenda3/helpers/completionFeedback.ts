const burstSize = 200
const burstDuration = 1000
const colors = ['#e7798e', '#9cfc64', '#64cafa']

// Adapted from https://github.com/sawhney17/logseq-todo-exploder/blob/main/exploder.ts.
// The original credits Daniel Vargas (RoamJS) for the confetti renderer.
function showBurst(x: number, y: number) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return

  const ratio = window.devicePixelRatio || 1
  const center = burstSize / 2
  canvas.width = burstSize * ratio
  canvas.height = burstSize * ratio
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, {
    position: 'fixed',
    left: `${x - center}px`,
    top: `${y - center}px`,
    width: `${burstSize}px`,
    height: `${burstSize}px`,
    pointerEvents: 'none',
    zIndex: '10000',
  })
  context.scale(ratio, ratio)

  const particles = Array.from({ length: 25 }, () => {
    const angle = Math.random() * 2 * Math.PI
    const speed = 8 + Math.random() * 4
    return {
      velocityX: speed * Math.cos(angle),
      velocityY: speed * Math.sin(angle),
      radius: 20 + Math.random() * 10,
      opacity: Math.random() * 0.5,
      color: colors[Math.floor(Math.random() * colors.length)],
    }
  })
  const startedAt = window.performance.now()
  let frame: number
  const draw = (now: number) => {
    // Match the original particle motion at 60 Hz across different refresh rates.
    const elapsedFrames = Math.max(0, ((now - startedAt) * 60) / 1000)
    const friction = 0.9 ** elapsedFrames
    const travel = (1 - friction) / 0.1
    const fall = 0.05 * elapsedFrames * (elapsedFrames + 1)
    context.clearRect(0, 0, burstSize, burstSize)
    for (const particle of particles) {
      const opacity = particle.opacity - 0.01 * elapsedFrames
      if (opacity <= 0) continue
      context.globalAlpha = opacity
      context.fillStyle = particle.color
      context.beginPath()
      context.arc(
        center + particle.velocityX * travel,
        center + particle.velocityY * travel + fall,
        particle.radius * friction,
        0,
        2 * Math.PI,
      )
      context.fill()
    }
    frame = window.requestAnimationFrame(draw)
  }

  document.body.append(canvas)
  window.setTimeout(() => {
    window.cancelAnimationFrame(frame)
    canvas.remove()
  }, burstDuration)
  frame = window.requestAnimationFrame(draw)
}

let audioContext: AudioContext | undefined

function playChime(context: AudioContext) {
  const now = context.currentTime
  for (const [index, frequency] of [523.25, 659.25].entries()) {
    const start = now + index * 0.095
    const end = start + 0.15
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.075, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.001, end - 0.012)
    gain.gain.linearRampToValueAtTime(0, end)
    oscillator.connect(gain).connect(context.destination)
    oscillator.onended = () => {
      oscillator.disconnect()
      gain.disconnect()
    }
    oscillator.start(start)
    oscillator.stop(end)
  }
}

function prepareChime() {
  if (!window.AudioContext) return
  try {
    if (!audioContext || audioContext.state === 'closed') audioContext = new window.AudioContext()
    const context = audioContext
    const ready = context.state === 'running' ? Promise.resolve() : context.resume().catch(() => undefined)
    return () => {
      const confirmedAt = window.performance.now()
      void ready
        .then(() => {
          // A blocked context can resume on a later gesture. Skip old chimes in that case.
          if (context.state === 'running' && window.performance.now() - confirmedAt <= 250) playChime(context)
        })
        .catch(() => undefined)
    }
  } catch {
    // Audio availability does not affect the visual feedback or task save.
  }
}

export function prepareCompletionFeedback(source: HTMLElement) {
  const bounds = source.getBoundingClientRect()
  const x = bounds.left + bounds.width / 2
  const y = bounds.top + bounds.height / 2
  const chime = prepareChime()

  return () => {
    try {
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) showBurst(x, y)
    } catch {
      // Canvas availability does not affect the chime or task save.
    }
    chime?.()
  }
}
