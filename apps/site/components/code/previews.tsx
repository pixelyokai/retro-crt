'use client'
import { useEffect, useRef } from 'react'
import { EXAMPLE_IMAGE, EXAMPLE_VIDEO } from '@/lib/examples'

export const PREVIEWS = [
  { value: 'text', label: 'Text UI' },
  { value: 'game', label: 'Game' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
] as const
export type Preview = (typeof PREVIEWS)[number]['value']

export function PreviewContent({ kind }: { kind: Preview }) {
  if (kind === 'game') return <GamePreview />
  if (kind === 'image') return <ImagePreview />
  if (kind === 'video') return <VideoPreview />
  return <TextPreview />
}

/**
 * Sized and coloured for legibility *through* the effect: scanlines eat every other row and bloom
 * spreads the strokes, so this leans on large type, open leading and a narrow, bright palette
 * rather than the greys a normal page would use.
 */
function TextPreview() {
  const rows = [
    ['ALPHA', '41%', '212d'],
    ['BRAVO', '67%', '98d'],
    ['CHARLIE', '12%', '301d'],
  ]
  return (
    // The type scales with the screen, not the viewport: the same component has to read at 190px
    // on a phone-shaped CRT and at 900px on a desktop one.
    <div className="h-full bg-[#05070a] [container-type:inline-size]">
    <article className="scrollbar-thin h-full overflow-auto p-[clamp(10px,4cqw,40px)] text-[clamp(11px,2.3cqw,22px)] leading-[1.75] text-[#e4fff0] [text-shadow:0_0_6px_rgb(120_255_180/0.25)]">
      <p className="tracking-[0.2em] text-crt">SYS/STATUS · NODE 7</p>
      <h2 className="mt-2 mb-4 text-[clamp(18px,5cqw,48px)] leading-[1.1] text-balance text-white">Mainframe uplink nominal</h2>
      <p className="max-w-[46ch] text-pretty">
        All four relay stations report green. Select this text, or follow{' '}
        <a href="#log" className="text-crt underline underline-offset-4">
          the maintenance log
        </a>{' '}
        — the SVG and CSS renderers keep the page fully interactive.
      </p>
      <table className="my-5 border-collapse tabular-nums">
        <thead>
          <tr className="text-crt/80">
            {['Station', 'Load', 'Uptime'].map((h) => (
              <th key={h} className="border-b border-crt/35 py-1.5 pr-[6cqw] text-left font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell) => (
                <td key={cell} className="border-b border-crt/15 py-1.5 pr-[6cqw]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ul id="log" className="list-inside list-['>_'] text-[#9fe8bd]">
        <li>02:14 tape library re-indexed</li>
        <li>04:40 cooling loop B flushed</li>
        <li>06:05 operator shift change</li>
      </ul>
    </article>
    </div>
  )
}

const COLS = 10
const ROWS = 5
const COLORS = ['#ff3d6e', '#ffd23d', '#3dff8b', '#3dc8ff', '#b63dff']

interface Game {
  ball: { x: number; y: number; vx: number; vy: number }
  paddle: number
  bricks: boolean[]
  score: number
}

// Positions are in unit space (0–1 on both axes) so the game is independent of canvas size.
const PADDLE_W = 0.18
const PADDLE_Y = 0.9
const PADDLE_H = 0.025
const BALL_R = 0.012
const SPEED = 0.62
const BRICK_TOP = 0.12
const BRICK_H = 0.045

function newGame(): Game {
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.9
  return { ball: { x: 0.5, y: 0.7, vx: Math.cos(angle) * SPEED, vy: Math.sin(angle) * SPEED }, paddle: 0.5, bricks: Array(COLS * ROWS).fill(true), score: 0 }
}

/** A self-playing breakout: the ball bounces off walls, bricks and a paddle that tracks it. */
function step(g: Game, dt: number) {
  const b = g.ball
  // The paddle chases where the ball will land, with a capped speed so it can occasionally miss.
  const target = b.vy > 0 ? b.x + (b.vx * (PADDLE_Y - b.y)) / b.vy : 0.5
  const clamped = Math.min(1 - PADDLE_W / 2, Math.max(PADDLE_W / 2, target))
  g.paddle += Math.max(-dt * 0.9, Math.min(dt * 0.9, clamped - g.paddle))

  b.x += b.vx * dt
  b.y += b.vy * dt
  if (b.x < BALL_R || b.x > 1 - BALL_R) {
    b.vx = Math.abs(b.vx) * (b.x < BALL_R ? 1 : -1)
    b.x = Math.min(1 - BALL_R, Math.max(BALL_R, b.x))
  }
  if (b.y < BALL_R) {
    b.vy = Math.abs(b.vy)
    b.y = BALL_R
  }

  const paddleTop = PADDLE_Y - PADDLE_H / 2
  if (b.vy > 0 && b.y + BALL_R >= paddleTop && b.y < PADDLE_Y && Math.abs(b.x - g.paddle) <= PADDLE_W / 2 + BALL_R) {
    // Where it lands on the paddle sets the rebound angle, like the arcade original.
    const hit = (b.x - g.paddle) / (PADDLE_W / 2)
    const angle = -Math.PI / 2 + hit * 1.05
    b.vx = Math.cos(angle) * SPEED
    b.vy = Math.sin(angle) * SPEED
    b.y = paddleTop - BALL_R
  }

  const col = Math.floor(b.x * COLS)
  const row = Math.floor((b.y - BRICK_TOP) / BRICK_H)
  if (row >= 0 && row < ROWS && col >= 0 && col < COLS && g.bricks[row * COLS + col]) {
    g.bricks[row * COLS + col] = false
    g.score += 10 * (ROWS - row)
    b.vy = -b.vy
  }

  if (b.y > 1 + BALL_R || g.bricks.every((alive) => !alive)) Object.assign(g, newGame(), { score: g.score })
}

function GamePreview() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const scoreEl = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const game = newGame()
    const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8 }))
    let frame = 0
    let last = 0
    let shown = -1

    const resize = () => {
      const dpr = Math.min(devicePixelRatio, 2)
      el.width = Math.round(el.clientWidth * dpr)
      el.height = Math.round(el.clientHeight * dpr)
    }
    const draw = (now: number) => {
      // Clamp the step so a backgrounded tab doesn't teleport the ball on return.
      const dt = last ? Math.min(0.033, (now - last) / 1000) : 0
      last = now
      step(game, dt)
      const { width: w, height: h } = el
      ctx.fillStyle = '#05060d'
      ctx.fillRect(0, 0, w, h)
      for (const s of stars) {
        ctx.fillStyle = `rgb(255 255 255 / ${s.z * 0.8})`
        const size = Math.max(1, 2 * s.z * (w / 700))
        ctx.fillRect(s.x * w, ((s.y + (now / 12000) * s.z) % 1) * h, size, size)
      }
      const cw = w / COLS
      game.bricks.forEach((alive, i) => {
        if (!alive) return
        ctx.fillStyle = COLORS[Math.floor(i / COLS)]
        ctx.fillRect((i % COLS) * cw + 2, (BRICK_TOP + Math.floor(i / COLS) * BRICK_H) * h + 2, cw - 4, BRICK_H * h - 4)
      })
      ctx.fillStyle = '#00ff00'
      ctx.fillRect((game.paddle - PADDLE_W / 2) * w, (PADDLE_Y - PADDLE_H / 2) * h, PADDLE_W * w, PADDLE_H * h)
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(game.ball.x * w, game.ball.y * h, BALL_R * Math.min(w, h) * 1.4, 0, Math.PI * 2)
      ctx.fill()
      if (shown !== game.score && scoreEl.current) {
        shown = game.score
        scoreEl.current.textContent = String(game.score).padStart(6, '0')
      }
      frame = requestAnimationFrame(draw)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(el)
    const sync = () => {
      cancelAnimationFrame(frame)
      last = 0
      if (!document.hidden) frame = requestAnimationFrame(draw)
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  return (
    <div className="relative h-full overflow-hidden bg-[#05060d]">
      <canvas ref={canvas} role="img" aria-label="A self-playing block-breaker game" className="block size-full" />
      <div aria-hidden className="absolute inset-x-4 top-2 flex justify-between text-lg text-white tabular-nums">
        <span>
          SCORE <span ref={scoreEl}>000000</span>
        </span>
        <span>HI 019850</span>
      </div>
    </div>
  )
}

function ImagePreview() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a plain, local, unoptimised asset is the point
    <img src={EXAMPLE_IMAGE} alt="The bundled example still" className="block size-full bg-black object-cover" />
  )
}

function VideoPreview() {
  return <video src={EXAMPLE_VIDEO} className="block size-full bg-black object-cover" autoPlay muted loop playsInline aria-label="The bundled example clip" />
}
