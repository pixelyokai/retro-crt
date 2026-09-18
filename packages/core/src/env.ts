declare const process: { env: { NODE_ENV?: string } } | undefined

export const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

// Bundlers replace process.env.NODE_ENV; the typeof guard keeps unbundled ESM from throwing.
export const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'

const warned = new Set<string>()
export function warnOnce(key: string, message: string): void {
  if (!isDev || warned.has(key)) return
  warned.add(key)
  console.warn(`[retro-crt] ${message}`)
}

const query = (q: string) => isBrowser && typeof matchMedia === 'function' && matchMedia(q).matches

export interface Environment {
  reducedMotion: boolean
  reducedTransparency: boolean
  saveData: boolean
  dpr: number
}

export function readEnvironment(maxPixelRatio: number): Environment {
  const connection = isBrowser ? (navigator as { connection?: { saveData?: boolean } }).connection : undefined
  return {
    reducedMotion: query('(prefers-reduced-motion: reduce)'),
    reducedTransparency: query('(prefers-reduced-transparency: reduce)'),
    saveData: connection?.saveData === true,
    dpr: Math.min(isBrowser ? window.devicePixelRatio || 1 : 1, maxPixelRatio),
  }
}

/** Fires `cb` when any preference that shapes the effect changes. Returns an unsubscribe. */
export function watchEnvironment(cb: () => void): () => void {
  if (!isBrowser || typeof matchMedia !== 'function') return () => {}
  const lists = ['(prefers-reduced-motion: reduce)', '(prefers-reduced-transparency: reduce)'].map((q) => matchMedia(q))
  lists.forEach((l) => l.addEventListener('change', cb))
  return () => lists.forEach((l) => l.removeEventListener('change', cb))
}

export function debounce(fn: () => void, ms: number): { (): void; cancel(): void } {
  let t: ReturnType<typeof setTimeout> | undefined
  const run = () => {
    clearTimeout(t)
    t = setTimeout(fn, ms)
  }
  run.cancel = () => clearTimeout(t)
  return run
}
