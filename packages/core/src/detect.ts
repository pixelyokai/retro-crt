import { isBrowser } from './env'
import type { Quality, Renderer } from './options'

export interface Capabilities {
  webgl: boolean
  svg: boolean
  /** SVG filters render statically but drop out on composited (animating) content — WebKit #184601. */
  svgStaticOnly: boolean
}

type DeviceClass = 'low' | 'mid' | 'high'

let cached: Capabilities | undefined
let pending: Promise<Capabilities> | undefined

export const capabilitiesSync = () => cached

export function probeCapabilities(): Promise<Capabilities> {
  if (!isBrowser) return Promise.resolve({ webgl: false, svg: false, svgStaticOnly: false })
  pending ??= probeSvg().then((svg) => (cached = { webgl: probeWebgl(), svg, svgStaticOnly: svg && isWebKitCompositor() }))
  return pending
}

function probeWebgl(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    if (!gl) return false
    const shader = gl.createShader(gl.FRAGMENT_SHADER)
    if (!shader) return false
    gl.shaderSource(shader, 'precision mediump float;void main(){gl_FragColor=vec4(1.);}')
    gl.compileShader(shader)
    const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true
    gl.deleteShader(shader)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return ok
  } catch {
    return false
  }
}

// A red 2×2 rect through a filter that swaps red for green. If the readback is still red, the
// filter never ran. Rendering the SVG as an image is the only pixel-readable path the web exposes.
const PROBE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><filter id="p" color-interpolation-filters="sRGB">' +
  '<feColorMatrix color-interpolation-filters="sRGB" values="0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 0 1 0"/></filter>' +
  '<rect width="2" height="2" fill="#f00" filter="url(#p)"/></svg>'

function probeSvg(): Promise<boolean> {
  if (typeof CSS === 'undefined' || !CSS.supports('filter', 'url(#a)')) return Promise.resolve(false)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const ctx = Object.assign(document.createElement('canvas'), { width: 2, height: 2 }).getContext('2d')
        if (!ctx) return resolve(false)
        ctx.drawImage(img, 0, 0)
        const [r, g] = ctx.getImageData(1, 1, 1, 1).data
        resolve(g > 200 && r < 50)
      } catch {
        resolve(false)
      }
    }
    img.onerror = () => resolve(false)
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PROBE_SVG)}`
  })
}

/**
 * Composited pixels can't be read back from script, so the animated half of the probe can't be a
 * pixel test. Instead we key on a WebKit-only API surface (a feature, not the UA string): every
 * engine exposing it shares the compositing codepath that drops `url(#…)` filters.
 */
const isWebKitCompositor = () =>
  typeof (window as { GestureEvent?: unknown }).GestureEvent === 'function' ||
  'webkitSetPresentationMode' in HTMLVideoElement.prototype

export function deviceClass(): DeviceClass {
  if (!isBrowser) return 'mid'
  const cores = navigator.hardwareConcurrency || 4
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 4
  const coarse = matchMedia('(pointer: coarse)').matches
  if (memory <= 2 || (cores <= 4 && coarse && window.devicePixelRatio >= 3)) return 'low'
  if (coarse || cores <= 4) return 'mid'
  return 'high'
}

export const qualityFor = (device: DeviceClass): Quality =>
  device === 'high' ? 'high' : device === 'mid' ? 'balanced' : 'low'

/** Video, canvas, or img as the only child: nothing interactive to lose, so WebGL is safe (§3.2). */
export function textureSource(content: Element): HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | null {
  const only = content.childElementCount === 1 ? content.firstElementChild : null
  return only instanceof HTMLVideoElement || only instanceof HTMLCanvasElement || only instanceof HTMLImageElement
    ? only
    : null
}

export const contentAnimates = (content: Element) =>
  (content.getAnimations?.({ subtree: true }).length ?? 0) > 0 || content.querySelector('video, canvas, iframe') !== null

interface TierInput {
  requested: 'auto' | Renderer
  caps: Capabilities
  device: DeviceClass
  saveData: boolean
  hasTexture: boolean
  animates: boolean
}

export function resolveTier({ requested, caps, device, saveData, hasTexture, animates }: TierInput): Renderer {
  if (saveData) return 'css'
  const webglOk = caps.webgl && hasTexture
  const svgOk = caps.svg && !(caps.svgStaticOnly && animates)
  if (requested === 'webgl' && webglOk) return 'webgl'
  if (requested === 'svg' || requested === 'webgl') return svgOk ? 'svg' : 'css'
  if (requested === 'css') return 'css'
  if (webglOk) return 'webgl'
  return svgOk && device !== 'low' ? 'svg' : 'css'
}

/** One step down the §4.2 ladder: quality first, then tier. `null` means nothing left to drop. */
export function downgrade(quality: Quality, tier: Renderer, canDropQuality: boolean, canDropTier: boolean) {
  if (canDropQuality && quality !== 'low') return { quality: quality === 'high' ? 'balanced' : 'low', tier } as const
  if (canDropTier && tier !== 'css') return { quality, tier: tier === 'webgl' ? 'svg' : 'css' } as const
  return null
}
