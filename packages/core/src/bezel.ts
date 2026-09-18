import { bezelPalette, rgbCss } from './color'
import { LayerSet, setVars } from './dom'
import type { ResolvedOptions } from './options'
import { TINT_COLORS } from './options'

const HOST_VARS = ['inset', 'outer-radius', 'housing', 'bezel-shadow'] as const
const NEUTRAL_SPILL = [200, 220, 255] as const

/**
 * Five stacked CSS layers (§4.3). Housing and drop shadow live on the host itself; bevel, spill,
 * lip and glare are nodes that only exist while the bezel is enabled.
 */
export class Bezel {
  private layers: LayerSet
  constructor(private host: HTMLElement) {
    this.layers = new LayerSet(host)
  }

  update(o: ResolvedOptions, reducedTransparency: boolean): void {
    const b = o.bezel
    this.host.toggleAttribute('data-rcrt-bezel', b.enabled)
    if (!b.enabled) return this.clear()

    const p = bezelPalette(b.color)
    const rad = ((b.lightAngle - 90) * Math.PI) / 180
    const [lx, ly] = [Math.cos(rad), Math.sin(rad)]
    const edge = Math.max(1, b.thickness * 0.04)
    const lipWidth = Math.max(2, b.thickness * 0.14) * b.innerLip
    const spill = reducedTransparency ? 0 : b.screenSpill
    const tint = TINT_COLORS[o.tint.preset] ?? NEUTRAL_SPILL

    this.layers.toggle('bevel', true)
    this.layers.toggle('spill', spill > 0)
    this.layers.toggle('lip', true)
    this.layers.toggle('glare', b.glare > 0)

    setVars(this.host, {
      inset: `${b.thickness}px`,
      'outer-radius': `${b.radius.outer}px`,
      'screen-radius': `${b.radius.screen}px`,
      housing: rgbCss(p.base),
      'bezel-shadow': b.shadow ? '0 18px 40px -12px rgb(0 0 0 / .55), 0 4px 10px rgb(0 0 0 / .3)' : 'none',
      'bevel-angle': `${b.lightAngle + 180}deg`,
      'bevel-hi': rgbCss(p.highlight, b.bevel),
      'bevel-lo': rgbCss(p.shade, b.bevel),
      'bevel-edge': [
        `inset ${-lx * edge}px ${-ly * edge}px ${edge}px ${rgbCss(p.highlight, b.bevel)}`,
        `inset ${lx * edge * 1.5}px ${ly * edge * 1.5}px ${edge * 2}px ${rgbCss(p.shade, b.bevel)}`,
      ].join(','),
      'lip-shadow': [
        `0 0 0 ${lipWidth}px ${rgbCss(p.lip)}`,
        // Light catches the far side of the recess: the opposite edge from the housing highlight.
        `${-lx * lipWidth * 0.5}px ${-ly * lipWidth * 0.5}px 0 ${lipWidth}px ${rgbCss(p.highlight, 0.5 * b.innerLip)}`,
        `inset ${-lx * 3}px ${-ly * 3}px ${10 * b.innerLip}px ${2 * b.innerLip}px rgb(0 0 0 / ${0.35 + b.innerLip * 0.5})`,
      ].join(','),
      spill: `0 0 ${b.thickness * 0.8}px ${b.thickness * 0.1}px ${rgbCss(tint, spill * 0.45)}`,
      glare: b.glare * 0.35,
    })
  }

  private clear(): void {
    this.layers.clear()
    HOST_VARS.forEach((v) => this.host.style.removeProperty(`--rcrt-${v}`))
  }

  destroy(): void {
    this.clear()
    this.host.removeAttribute('data-rcrt-bezel')
  }
}
