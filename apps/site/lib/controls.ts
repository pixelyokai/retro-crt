import { DEFAULTS, type ResolvedOptions, type TintPreset } from 'retro-crt'

/** Every tunable the sidebar owns. `quality` stays on `auto`: it is a measurement, not a taste. */
export type Settings = Omit<ResolvedOptions, 'quality'>

const { quality: _quality, ...TUNABLE } = DEFAULTS
export const INITIAL: Settings = structuredClone(TUNABLE)

export const TINTS: { value: TintPreset; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'green', label: 'Green' },
  { value: 'amber', label: 'Amber' },
  { value: 'blue', label: 'Blue' },
  { value: 'violet', label: 'Violet' },
  { value: 'lime', label: 'Lime' },
  { value: 'pink', label: 'Pink' },
  { value: 'red', label: 'Red' },
]

export const RENDERERS = [
  { value: 'auto', label: 'Auto', hint: 'Pick the best renderer this browser and this content can actually run.' },
  { value: 'webgl', label: 'WebGL', hint: 'A GPU shader: true curvature and the only renderer with persistence. Media only — content inside stops being interactive.' },
  { value: 'svg', label: 'SVG', hint: 'SVG filters: close to WebGL and keeps everything inside clickable. Unreliable in Safari over animating content.' },
  { value: 'css', label: 'CSS', hint: 'Gradients and blend modes only: cheapest and works everywhere, but no real curvature or chromatic aberration.' },
] as const

// Plastics that real monitors shipped in: beige, putty, charcoal, slate, walnut.
const HOUSINGS = ['#6b5b4a', '#d9d4c7', '#b8b0a0', '#2b2d31', '#3f4a5a', '#5a3e36', '#8a8f94']
// Phosphors that read as a screen rather than a colour wash.
const SCREENS = ['#000000', '#020a02', '#0a0400', '#00030a', '#050005']

const rand = (min: number, max: number, step: number) => Number((Math.round((min + Math.random() * (max - min)) / step) * step).toFixed(6))
const oneOf = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]

/**
 * A random but watchable look. Ranges are narrower than the controls': the extremes are valid but
 * rarely useful. The bezel toggle and everything under Performance are decisions, not looks, so
 * shuffle leaves them alone.
 */
export function randomSettings(current: Settings): Settings {
  return {
    ...current,
    background: oneOf(SCREENS),
    curvature: rand(0.05, 0.7, 0.01),
    vignette: rand(0.2, 0.9, 0.01),
    scanlines: { intensity: rand(0.2, 0.8, 0.01), gap: rand(2, 5, 0.5), flicker: Math.random() < 0.3 },
    tint: { preset: oneOf(TINTS).value, strength: rand(0.2, 0.7, 0.01) },
    bloom: { enabled: true, radius: rand(3, 18, 1), strength: rand(0.2, 0.8, 0.01), threshold: rand(0.3, 0.8, 0.01) },
    chromaticAberration: { intensity: rand(0, 3, 0.1) },
    noise: { enabled: true, static: rand(0.01, 0.12, 0.005) },
    persistence: { strength: rand(0, 0.3, 0.01) },
    bezel: { ...current.bezel, color: oneOf(HOUSINGS) },
  }
}
