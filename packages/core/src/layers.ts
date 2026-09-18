import { LayerSet, setVars } from './dom'
import type { Quality, Renderer, ResolvedOptions } from './options'
import { TINT_COLORS } from './options'
import { noiseTile } from './textures'

interface LayerContext {
  tier: Renderer
  quality: Quality
  dpr: number
  /** The whole viewport (mountFullPage): no screen box to curve. */
  viewport: boolean
  /** px the barrel pulls the picture in from each edge; zero when nothing is displaced. */
  pull: { x: number; y: number }
}

const QUALITY_SCALE: Record<Quality, number> = { high: 1, balanced: 0.75, low: 0.5 }
export const qualityScale = (q: Quality) => QUALITY_SCALE[q]

/** Snaps the gap to whole device pixels, never below 2, so it can't alias on a 3× screen (§6.2). */
export function scanlineGeometry(gap: number, dpr: number) {
  const device = Math.max(2, Math.round(gap * dpr))
  const line = Math.max(1, Math.round(device / 2))
  return { gap: device / dpr, line: line / dpr }
}

const container = (host: HTMLElement, className: string) => {
  const el = document.createElement('div')
  el.className = className
  el.setAttribute('aria-hidden', 'true')
  host.appendChild(el)
  return el
}

/**
 * The DOM-tier effect stack: every layer is additive and composited on opacity/transform only.
 *
 * `root` is curved by the svg tier's displacement filter and holds what has to follow the picture:
 * tint, bloom and the edge feather. `motion` is never filtered — animating inside a filter forces a
 * full re-rasterisation every step, which Chrome paints as flickering black tiles — so it carries
 * the grain, the flicker and the scanlines, none of which gain anything from being distorted. It is
 * inset to where the barrel leaves the picture instead.
 */
export class EffectLayers {
  readonly root: HTMLElement
  private readonly motion: HTMLElement
  private layers: LayerSet
  private motionLayers: LayerSet

  constructor(host: HTMLElement) {
    this.root = container(host, 'rcrt-fx')
    this.motion = container(host, 'rcrt-fx rcrt-fx-motion')
    this.layers = new LayerSet(this.root)
    this.motionLayers = new LayerSet(this.motion)
  }

  update(o: ResolvedOptions, { tier, quality, dpr, viewport, pull }: LayerContext): void {
    const tint = TINT_COLORS[o.tint.preset]
    const scan = scanlineGeometry(o.scanlines.gap, dpr)
    const noiseOn = o.noise.enabled && o.noise.static > 0
    // svg does real bloom in the filter; the backdrop blur stands in for css (§4 "approx.").
    const bloomOn = tier === 'css' && o.bloom.enabled && o.bloom.strength > 0
    const radius = o.bloom.radius * QUALITY_SCALE[quality]

    this.layers.toggle('tint', tint !== null && o.tint.strength > 0)
    // Scanlines live with the unfiltered layers so the displacement can't beat against their
    // period into moire. Against a black source, overlay and normal blending are identical.
    this.motionLayers.toggle('scanlines', o.scanlines.intensity > 0)
    this.motionLayers.toggle('flicker', o.scanlines.flicker && quality !== 'low')
    this.layers.toggle('vignette', o.vignette > 0)
    this.layers.toggle('bloom', bloomOn)
    // The edge feather also hides the stair-stepping feDisplacementMap leaves on the picture's edge,
    // so it is drawn for every DOM tier, not just css where it stands in for real curvature.
    this.layers.toggle('curve', !viewport && o.curvature > 0)
    const noise = this.motionLayers.toggle('noise', noiseOn)
    if (noise) noise.dataset.frames = quality === 'high' ? '8' : quality === 'balanced' ? '6' : '4'

    const vars = {
      tint: tint ? `rgb(${tint.join(' ')})` : 'transparent',
      'tint-alpha': o.tint.strength * 0.85,
      'scan-alpha': o.scanlines.intensity * 0.75,
      'scan-gap': `${scan.gap}px`,
      'scan-line': `${scan.line}px`,
      'noise-url': noiseOn ? `url("${noiseTile(quality)}")` : 'none',
      'noise-alpha': o.noise.static * 2.5,
      vignette: o.vignette * 0.85,
      'bloom-filter': `contrast(${1 + o.bloom.threshold * 1.5}) brightness(${1 + o.bloom.strength}) blur(${radius}px)`,
      'bloom-alpha': o.bloom.strength * 0.55,
      // css fakes the curve with edge shading, so it needs a much wider feather than the tiers
      // that only have to soften a real displaced edge.
      'edge-blur': `${tier === 'css' ? o.curvature * 60 : pull.x * 1.4 + 6}px`,
      'edge-spread': `${tier === 'css' ? o.curvature * 12 : pull.x * 0.25}px`,
      'curve-x': `${pull.x}px`,
      'curve-y': `${pull.y}px`,
    }
    setVars(this.root, vars)
    setVars(this.motion, vars)
  }

  destroy(): void {
    this.layers.clear()
    this.motionLayers.clear()
    this.root.remove()
    this.motion.remove()
  }
}
