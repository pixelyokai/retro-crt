'use client'
import { useCallback, useMemo, useState } from 'react'
import type { Quality, Renderer } from 'retro-crt'
import { INITIAL, randomSettings, type Settings } from '@/lib/controls'

type ActiveRenderer = { renderer: Renderer; quality: Quality } | null

/** The single source of truth for a page: the tuned settings plus what the library resolved to. */
export function useCrt() {
  const [settings, setSettings] = useState<Settings>(INITIAL)
  const [active, setActive] = useState<ActiveRenderer>(null)

  const patch = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => ({ ...s, [key]: value })), [])
  type Grouped = { [K in keyof Settings]: Settings[K] extends object ? K : never }[keyof Settings]
  const patchIn = useCallback(
    <K extends Grouped, F extends keyof Settings[K]>(key: K, field: F, value: Settings[K][F]) =>
      setSettings((s) => ({ ...s, [key]: { ...s[key], [field]: value } })),
    [],
  )
  const reset = useCallback(() => setSettings(INITIAL), [])
  const shuffle = useCallback(() => setSettings(randomSettings), [])
  const onRendererChange = useCallback((renderer: Renderer, quality: Quality) => setActive({ renderer, quality }), [])

  // A stable object so adapters don't re-set the screen on unrelated renders.
  const options = useMemo(() => settings, [settings])

  return { settings, options, active, patch, patchIn, reset, shuffle, onRendererChange }
}

export type CrtStore = ReturnType<typeof useCrt>
