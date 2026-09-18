'use client'
import { useEffect, useState } from 'react'

/** Live frame rate while tuning, so cost is felt now rather than discovered in production (§8). */
export function useFps(): number | null {
  const [fps, setFps] = useState<number | null>(null)
  useEffect(() => {
    let frame = 0
    let frames = 0
    let since = performance.now()
    const tick = (now: number) => {
      frames++
      if (now - since >= 500) {
        setFps(Math.round((frames * 1000) / (now - since)))
        frames = 0
        since = now
      }
      frame = requestAnimationFrame(tick)
    }
    // No loop in a background tab (§6.3).
    const sync = () => {
      cancelAnimationFrame(frame)
      if (document.hidden) return
      frames = 0
      since = performance.now()
      frame = requestAnimationFrame(tick)
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])
  return fps
}
