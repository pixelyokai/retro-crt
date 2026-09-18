export type Renderer = 'webgl' | 'svg' | 'css'
export type Quality = 'high' | 'balanced' | 'low'
export type TintPreset = 'default' | 'green' | 'amber' | 'blue' | 'violet' | 'lime' | 'pink' | 'red'

export interface CRTOptions {
  renderer?: 'auto' | Renderer
  /** The glass behind the content. Any CSS hex or rgb() string; anything else falls back to black. */
  background?: string
  curvature?: number
  vignette?: number
  scanlines?: { intensity?: number; gap?: number; flicker?: boolean }
  tint?: { preset?: TintPreset; strength?: number }
  bloom?: { enabled?: boolean; radius?: number; strength?: number; threshold?: number }
  chromaticAberration?: { intensity?: number }
  noise?: { enabled?: boolean; static?: number }
  persistence?: { strength?: number }
  bezel?: {
    enabled?: boolean
    thickness?: number
    radius?: { outer?: number; screen?: number }
    color?: string
    bevel?: number
    lightAngle?: number
    innerLip?: number
    screenSpill?: number
    glare?: number
    shadow?: boolean
  }
  quality?: 'auto' | Quality
  maxPixelRatio?: number
  pauseWhenOffscreen?: boolean
  respectReducedMotion?: boolean
  respectSaveData?: boolean
}

type DeepRequired<T> = { [K in keyof T]-?: T[K] extends object | undefined ? DeepRequired<NonNullable<T[K]>> : T[K] }
export type ResolvedOptions = DeepRequired<CRTOptions>

export const DEFAULTS: ResolvedOptions = {
  renderer: 'auto',
  background: '#000000',
  curvature: 0.3,
  vignette: 0.5,
  scanlines: { intensity: 0.5, gap: 3, flicker: false },
  tint: { preset: 'default', strength: 0.35 },
  bloom: { enabled: true, radius: 8, strength: 0.4, threshold: 0.6 },
  // Kept low: past ~1px the red/blue split is wider than a stem and body text stops being readable.
  chromaticAberration: { intensity: 0.6 },
  noise: { enabled: true, static: 0.04 },
  persistence: { strength: 0 },
  bezel: {
    enabled: false,
    thickness: 48,
    radius: { outer: 28, screen: 10 },
    color: '#6b5b4a',
    bevel: 0.6,
    lightAngle: 315,
    innerLip: 0.7,
    screenSpill: 0.35,
    glare: 0.2,
    shadow: true,
  },
  quality: 'auto',
  maxPixelRatio: 2,
  pauseWhenOffscreen: true,
  respectReducedMotion: true,
  respectSaveData: true,
}

/** `null` for `default`: a true pass-through, never a neutral grey (§4.2). */
export const TINT_COLORS: Record<TintPreset, readonly [number, number, number] | null> = {
  default: null,
  green: [51, 255, 102],
  amber: [255, 176, 0],
  blue: [190, 215, 255],
  violet: [186, 140, 255],
  lime: [190, 255, 80],
  pink: [255, 140, 200],
  red: [255, 90, 70],
}

// [min, max] per numeric path. Anything outside is clamped so `curvature: 1e9` can't hang a tab (§9.5).
const RANGES: Record<string, readonly [number, number]> = {
  curvature: [0, 1],
  vignette: [0, 1],
  'scanlines.intensity': [0, 1],
  'scanlines.gap': [1, 8],
  'tint.strength': [0, 1],
  'bloom.radius': [0, 40],
  'bloom.strength': [0, 1],
  'bloom.threshold': [0, 1],
  'chromaticAberration.intensity': [0, 6],
  'noise.static': [0, 0.3],
  'persistence.strength': [0, 0.5],
  'bezel.thickness': [0, 200],
  'bezel.radius.outer': [0, 200],
  'bezel.radius.screen': [0, 200],
  'bezel.bevel': [0, 1],
  'bezel.lightAngle': [0, 360],
  'bezel.innerLip': [0, 1],
  'bezel.screenSpill': [0, 1],
  'bezel.glare': [0, 1],
  maxPixelRatio: [0.5, 4],
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function merge(base: Record<string, unknown>, input: unknown, path: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const src = isRecord(input) ? input : {}
  for (const key of Object.keys(base)) {
    const def = base[key]
    const val = src[key]
    const p = path ? `${path}.${key}` : key
    if (isRecord(def)) out[key] = merge(def, val, p)
    else if (typeof def === 'number') {
      const range = RANGES[p]
      const n = typeof val === 'number' && Number.isFinite(val) ? val : def
      out[key] = range ? Math.min(range[1], Math.max(range[0], n)) : n
    } else if (typeof def === 'string' && typeof val === 'string') {
      const ok = COLOR_PATHS.has(p) ? isColor(val) : ENUMS[p]?.includes(val)
      out[key] = ok ? val : def
    } else out[key] = typeof val === typeof def ? val : def
  }
  return out
}

const ENUMS: Record<string, readonly string[]> = {
  renderer: ['auto', 'webgl', 'svg', 'css'],
  quality: ['auto', 'high', 'balanced', 'low'],
  'tint.preset': Object.keys(TINT_COLORS),
}

// Colour strings reach CSS custom properties, so only shapes parseColor understands get through.
const COLOR_PATHS = new Set(['background', 'bezel.color'])
const isColor = (v: string) => /^#([\da-f]{3}|[\da-f]{6})$/i.test(v.trim()) || /^rgba?\(\s*\d+[\s,]+\d+[\s,]+\d+/i.test(v.trim())

// Typed through `unknown` once, here, because the recursive merge is structurally generic.
export const resolveOptions = (input?: CRTOptions): ResolvedOptions =>
  merge(DEFAULTS as unknown as Record<string, unknown>, input, '') as unknown as ResolvedOptions

/**
 * Only the keys that differ from the defaults — the user's intent, not the schema (§8.1).
 * A disabled bezel contributes nothing at all (§4.3).
 */
export function minimalOptions(input: CRTOptions): CRTOptions {
  const resolved = resolveOptions(input) as unknown as Record<string, unknown>
  const diff = (a: Record<string, unknown>, b: Record<string, unknown>) => {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(a)) {
      if (isRecord(a[key])) {
        const sub = diff(a[key], b[key] as Record<string, unknown>)
        if (Object.keys(sub).length) out[key] = sub
      } else if (a[key] !== b[key]) out[key] = a[key]
    }
    return out
  }
  const out = diff(resolved, DEFAULTS as unknown as Record<string, unknown>)
  if (!(resolved.bezel as { enabled: boolean }).enabled) delete out.bezel
  return out as CRTOptions
}
