'use client'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { CRT, type CRTOptions, type CRTScreen as Screen, type Quality, type Renderer } from 'retro-crt'

export interface CRTScreenProps extends CRTOptions {
  children?: ReactNode
  className?: string
  style?: CSSProperties
  /** Fires when the resolved renderer or quality changes (auto-detection, runtime downgrade). */
  onRendererChange?: (renderer: Renderer, quality: Quality) => void
}

export function CRTScreen({ children, className, style, onRendererChange, ...options }: CRTScreenProps) {
  const host = useRef<HTMLDivElement>(null)
  const [screen, setScreen] = useState<Screen | null>(null)
  const key = JSON.stringify(options)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const s = CRT.mount(el, options)
    setScreen(s)
    return () => s.destroy()
    // Options flow through the update effect below; remounting on each change would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => screen?.set(JSON.parse(key)), [screen, key])

  useEffect(() => {
    if (!screen || !onRendererChange) return
    onRendererChange(screen.activeRenderer, screen.activeQuality)
    return screen.subscribe((s) => onRendererChange(s.activeRenderer, s.activeQuality))
  }, [screen, onRendererChange])

  return (
    <div ref={host} className={className} style={style}>
      <div data-rcrt-content="">{children}</div>
    </div>
  )
}

export type { CRTOptions, Quality, Renderer }
