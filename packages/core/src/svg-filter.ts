import type { ResolvedOptions } from './options'
import { displacementMap, displacementScale } from './textures'

const NS = 'http://www.w3.org/2000/svg'
let counter = 0

function el(name: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
  const node = document.createElementNS(NS, name)
  // Engines disagree on the default (w3c #11015), so every primitive pins sRGB explicitly (§2.1).
  node.setAttribute('color-interpolation-filters', 'sRGB')
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  parent.appendChild(node)
  return node
}

const channel = (parent: Element, input: string, result: string, row: 0 | 1 | 2) => {
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0]
  m[row * 6] = 1
  el('feColorMatrix', { in: input, values: m.join(' '), result }, parent)
}

interface FilterParams {
  opts: ResolvedOptions
  width: number
  height: number
  bloomScale: number
  curvature: boolean
}

/**
 * Two filters: `content` carries geometry + chromatic aberration + bloom; `geometry` is displacement only, for
 * the scanline/tint layers so they curve with the picture without being bloomed themselves.
 */
export class SvgFilters {
  readonly root: SVGSVGElement
  readonly contentId = `rcrt-f${++counter}`
  readonly geometryId = `rcrt-g${counter}`
  private key = ''

  constructor(host: Element) {
    this.root = document.createElementNS(NS, 'svg')
    for (const [k, v] of Object.entries({ width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' }))
      this.root.setAttribute(k, String(v))
    this.root.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none'
    host.appendChild(this.root)
  }

  update({ opts, width, height, bloomScale, curvature }: FilterParams): void {
    const scale = curvature ? displacementScale(opts.curvature, width, height) : 0
    const map = scale > 0 ? displacementMap(width / Math.max(1, height)) : ''
    const bloom = opts.bloom.enabled && opts.bloom.strength > 0 ? opts.bloom : null
    const key = JSON.stringify([map, Math.round(scale), Math.round(width), Math.round(height), opts.chromaticAberration.intensity, bloom, bloomScale])
    if (key === this.key) return
    this.key = key
    this.root.replaceChildren()
    const box = { width: Math.max(1, width), height: Math.max(1, height) }
    this.build(this.contentId, box, map, scale, opts.chromaticAberration.intensity, bloom && { ...bloom, radius: bloom.radius * bloomScale })
    this.build(this.geometryId, box, map, scale, 0, null)
  }

  private build(id: string, box: { width: number; height: number }, map: string, scale: number, aberration: number, bloom: ResolvedOptions['bloom'] | null) {
    const f = el('filter', { id, x: 0, y: 0, width: 1, height: 1 }, this.root)
    let last = 'SourceGraphic'
    if (map) {
      // Explicit user-space size: left to default, Chrome sizes the map wrongly at DPR > 1, and every
      // uncovered pixel reads as a full-strength displacement.
      el('feImage', { href: map, x: 0, y: 0, ...box, preserveAspectRatio: 'none', result: 'map' }, f)
      el('feDisplacementMap', { in: last, in2: 'map', scale, xChannelSelector: 'R', yChannelSelector: 'G', result: 'geo' }, f)
      last = 'geo'
    }
    if (aberration > 0) {
      channel(f, last, 'r', 0)
      channel(f, last, 'g', 1)
      channel(f, last, 'b', 2)
      el('feOffset', { in: 'r', dx: aberration, result: 'ro' }, f)
      el('feOffset', { in: 'b', dx: -aberration, result: 'bo' }, f)
      el('feComposite', { in: 'ro', in2: 'g', operator: 'arithmetic', k2: 1, k3: 1, result: 'rg' }, f)
      el('feComposite', { in: 'rg', in2: 'bo', operator: 'arithmetic', k2: 1, k3: 1, result: 'ca' }, f)
      last = 'ca'
    }
    if (bloom) {
      // Threshold first: without it a dark UI glows uniformly, which reads as a bug (§4.2).
      const t = Math.min(bloom.threshold, 0.98)
      const slope = 1 / (1 - t)
      const bright = el('feComponentTransfer', { in: last, result: 'bright' }, f)
      for (const fn of ['feFuncR', 'feFuncG', 'feFuncB'])
        el(fn, { type: 'linear', slope, intercept: -t * slope }, bright)
      el('feGaussianBlur', { in: 'bright', stdDeviation: Math.max(0.5, bloom.radius / 2), result: 'glow' }, f)
      el('feComposite', { in: last, in2: 'glow', operator: 'arithmetic', k2: 1, k3: bloom.strength * 1.6 }, f)
    }
    // An empty filter still forces rasterisation; a no-op merge keeps the output well-defined.
    if (!f.childElementCount) el('feMerge', {}, f).appendChild(document.createElementNS(NS, 'feMergeNode'))
  }

  destroy(): void {
    this.root.remove()
  }
}
