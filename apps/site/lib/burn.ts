import { TINT_COLORS, bezelPalette, parseColor, resolveOptions, rgbCss, scanlineGeometry, type CRTOptions, type ResolvedOptions } from 'retro-crt'
import { GLRenderer } from 'retro-crt/webgl'

export type Engine = 'webgl' | 'canvas'

export interface BurnConfig {
  options: CRTOptions
  engine: Engine
  width: number
  height: number
  /** Output px per preview CSS px, so the export is a scaled copy of what the user tuned. */
  scale: number
}

type Source = CanvasImageSource & TexImageSource

const canvas = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h })

function context(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable — the device may be out of memory.')
  return ctx
}

/** Paints the tuned effect — and the bezel, if enabled — into a canvas, frame by frame. */
export class Burner {
  readonly output: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private o: ResolvedOptions
  private screen: { x: number; y: number; w: number; h: number; r: number }
  private gl: GLRenderer | null = null
  private work: HTMLCanvasElement
  private workCtx: CanvasRenderingContext2D
  private scanPattern: CanvasPattern | null = null
  private noisePattern: CanvasPattern | null = null

  constructor(private cfg: BurnConfig) {
    this.o = resolveOptions(cfg.options)
    const s = cfg.scale
    const b = this.o.bezel
    const inset = b.enabled ? Math.round(b.thickness * s) : 0
    const w = cfg.width - inset * 2
    const h = cfg.height - inset * 2
    this.screen = { x: inset, y: inset, w, h, r: (b.enabled ? b.radius.screen : Math.round(this.o.curvature * 28)) * s }
    this.output = canvas(cfg.width, cfg.height)
    this.ctx = context(this.output)
    this.work = canvas(w, h)
    this.workCtx = context(this.work)
    if (cfg.engine === 'webgl') {
      this.gl = new GLRenderer(canvas(w, h), true)
      this.gl.resize(w, h)
      this.gl.configure({ opts: this.o, quality: 'high', scale: s, motion: true })
    } else this.buildPatterns()
  }

  private buildPatterns(): void {
    const s = this.cfg.scale
    const scan = scanlineGeometry(this.o.scanlines.gap, s)
    const gap = Math.max(2, Math.round(scan.gap * s))
    const tile = canvas(1, gap)
    const t = context(tile)
    // A ramp, matching the preview: hard bands beat against the output grid into moire.
    const ramp = t.createLinearGradient(0, 0, 0, gap)
    const dark = `rgb(0 0 0 / ${this.o.scanlines.intensity * 0.75})`
    ramp.addColorStop(0, dark)
    ramp.addColorStop(0.5, 'rgb(0 0 0 / 0)')
    ramp.addColorStop(1, dark)
    t.fillStyle = ramp
    t.fillRect(0, 0, 1, gap)
    this.scanPattern = this.workCtx.createPattern(tile, 'repeat')

    const noise = canvas(160, 160)
    const n = context(noise)
    const img = n.createImageData(160, 160)
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.random() * 255
      img.data[i + 3] = 255
    }
    n.putImageData(img, 0, 0)
    this.noisePattern = this.workCtx.createPattern(noise, 'repeat')
  }

  draw(source: Source, sourceW: number, sourceH: number, time: number): void {
    const { ctx, screen: sc } = this
    ctx.clearRect(0, 0, this.output.width, this.output.height)
    if (this.o.bezel.enabled) this.housing()
    if (this.gl) {
      this.gl.setFit('cover', sourceW, sourceH)
      this.gl.render(source, time)
    } else this.canvasEffect(source, sourceW, sourceH, time)

    ctx.save()
    ctx.beginPath()
    ctx.roundRect(sc.x, sc.y, sc.w, sc.h, sc.r)
    ctx.clip()
    ctx.fillStyle = rgbCss(parseColor(this.o.background))
    ctx.fillRect(sc.x, sc.y, sc.w, sc.h)
    ctx.drawImage(this.gl ? this.gl.canvas : this.work, sc.x, sc.y)
    ctx.restore()
    if (this.o.bezel.enabled) this.lipAndGlare()
  }

  /** The css-tier look, for browsers where the preview didn't resolve to WebGL. */
  private canvasEffect(source: Source, sw: number, sh: number, time: number): void {
    const o = this.o
    const c = this.workCtx
    const { w, h } = this.screen
    const s = this.cfg.scale
    const scale = Math.max(w / sw, h / sh)
    c.globalCompositeOperation = 'source-over'
    c.globalAlpha = 1
    c.filter = 'none'
    c.drawImage(source, (w - sw * scale) / 2, (h - sh * scale) / 2, sw * scale, sh * scale)

    if (o.bloom.enabled && o.bloom.strength > 0 && supportsFilter(c)) {
      c.globalCompositeOperation = 'screen'
      c.globalAlpha = o.bloom.strength * 0.55
      c.filter = `contrast(${1 + o.bloom.threshold * 1.5}) brightness(${1 + o.bloom.strength}) blur(${o.bloom.radius * s}px)`
      c.drawImage(this.work, 0, 0)
      c.filter = 'none'
    }
    const tint = TINT_COLORS[o.tint.preset]
    if (tint && o.tint.strength > 0) this.fill('color', o.tint.strength * 0.85, `rgb(${tint.join(' ')})`)
    if (this.scanPattern && o.scanlines.intensity > 0) this.fill('source-over', 1, this.scanPattern)
    if (this.noisePattern && o.noise.enabled && o.noise.static > 0) {
      c.save()
      c.translate(Math.floor(Math.random() * 160), Math.floor(Math.random() * 160))
      c.globalCompositeOperation = 'overlay'
      c.globalAlpha = Math.min(1, o.noise.static * 2.5)
      c.fillStyle = this.noisePattern
      c.fillRect(-160, -160, w + 160, h + 160)
      c.restore()
    }
    if (o.curvature > 0) insetShadow(c, w, h, 0, 0, o.curvature * 60 * s, `rgb(0 0 0 / .7)`)
    if (o.vignette > 0) {
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2)
      g.addColorStop(0.45, 'rgb(0 0 0 / 0)')
      g.addColorStop(1, `rgb(0 0 0 / ${o.vignette * 0.85})`)
      this.fill('source-over', 1, g)
    }
    if (o.scanlines.flicker && Math.sin(time * 37) > 0.93) this.fill('source-over', 0.06, '#000')
  }

  private fill(op: GlobalCompositeOperation, alpha: number, style: string | CanvasPattern | CanvasGradient): void {
    const c = this.workCtx
    c.globalCompositeOperation = op
    c.globalAlpha = alpha
    c.fillStyle = style
    c.fillRect(0, 0, this.screen.w, this.screen.h)
  }

  private housing(): void {
    const { ctx, o, output } = this
    const b = o.bezel
    const s = this.cfg.scale
    const p = bezelPalette(b.color)
    const [W, H] = [output.width, output.height]
    const rad = ((b.lightAngle - 90) * Math.PI) / 180
    const [lx, ly] = [Math.cos(rad), Math.sin(rad)]
    const edge = Math.max(1, b.thickness * 0.04) * s
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(0, 0, W, H, b.radius.outer * s)
    ctx.clip()
    ctx.fillStyle = rgbCss(p.base)
    ctx.fillRect(0, 0, W, H)
    const half = Math.hypot(W, H) / 2
    const g = ctx.createLinearGradient(W / 2 + lx * half, H / 2 + ly * half, W / 2 - lx * half, H / 2 - ly * half)
    g.addColorStop(0, rgbCss(p.highlight, b.bevel))
    g.addColorStop(0.45, rgbCss(p.highlight, 0))
    g.addColorStop(0.55, rgbCss(p.shade, 0))
    g.addColorStop(1, rgbCss(p.shade, b.bevel))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    insetShadow(ctx, W, H, -lx * edge, -ly * edge, edge, rgbCss(p.highlight, b.bevel), b.radius.outer * s)
    insetShadow(ctx, W, H, lx * edge * 1.5, ly * edge * 1.5, edge * 2, rgbCss(p.shade, b.bevel), b.radius.outer * s)
    ctx.restore()

    const tint = TINT_COLORS[o.tint.preset] ?? [200, 220, 255]
    if (b.screenSpill > 0) {
      const sc = this.screen
      ctx.save()
      ctx.shadowColor = rgbCss(tint, b.screenSpill * 0.45)
      ctx.shadowBlur = b.thickness * 0.8 * s
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.roundRect(sc.x, sc.y, sc.w, sc.h, sc.r)
      ctx.fill()
      ctx.restore()
    }
  }

  private lipAndGlare(): void {
    const { ctx, o, screen: sc } = this
    const b = o.bezel
    const s = this.cfg.scale
    const p = bezelPalette(b.color)
    const rad = ((b.lightAngle - 90) * Math.PI) / 180
    const [lx, ly] = [Math.cos(rad), Math.sin(rad)]
    const lip = Math.max(2, b.thickness * 0.14) * b.innerLip * s
    const ring = (dx: number, dy: number, color: string) => {
      ctx.beginPath()
      ctx.roundRect(sc.x - lip + dx, sc.y - lip + dy, sc.w + lip * 2, sc.h + lip * 2, sc.r + lip)
      ctx.roundRect(sc.x, sc.y, sc.w, sc.h, sc.r)
      ctx.fillStyle = color
      ctx.fill('evenodd')
    }
    ring(-lx * lip * 0.5, -ly * lip * 0.5, rgbCss(p.highlight, 0.5 * b.innerLip))
    ring(0, 0, rgbCss(p.lip))

    ctx.save()
    ctx.translate(sc.x, sc.y)
    ctx.beginPath()
    ctx.roundRect(0, 0, sc.w, sc.h, sc.r)
    ctx.clip()
    insetShadow(ctx, sc.w, sc.h, -lx * 3 * s, -ly * 3 * s, 10 * b.innerLip * s, `rgb(0 0 0 / ${0.35 + b.innerLip * 0.5})`, sc.r)
    if (b.glare > 0) {
      const d = Math.max(sc.w, sc.h)
      const g = ctx.createLinearGradient(0, 0, d, d)
      g.addColorStop(0, `rgb(255 255 255 / ${b.glare * 0.35})`)
      g.addColorStop(0.22, `rgb(255 255 255 / ${b.glare * 0.1})`)
      g.addColorStop(0.42, 'rgb(255 255 255 / 0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, sc.w, sc.h)
    }
    ctx.restore()
  }

  destroy(): void {
    this.gl?.destroy()
    // Zero-size canvases release their backing store immediately on Safari, which is strict about canvas memory.
    for (const c of [this.work, this.output]) Object.assign(c, { width: 0, height: 0 })
  }
}

// Safari before 18 accepts ctx.filter assignments silently and ignores them; unfiltered, "bloom"
// would just brighten everything, so skip it there.
let filterSupport: boolean | undefined
function supportsFilter(c: CanvasRenderingContext2D): boolean {
  if (filterSupport === undefined) {
    c.filter = 'blur(1px)'
    filterSupport = c.filter === 'blur(1px)'
    c.filter = 'none'
  }
  return filterSupport
}

/** CSS `inset` box-shadow for canvas: shadow a frame surrounding the box, clipped to the box. */
function insetShadow(ctx: CanvasRenderingContext2D, w: number, h: number, dx: number, dy: number, blur: number, color: string, radius = 0): void {
  const pad = blur * 2 + Math.abs(dx) + Math.abs(dy) + 10
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, radius)
  ctx.clip()
  ctx.shadowColor = color
  ctx.shadowBlur = blur
  ctx.shadowOffsetX = dx
  ctx.shadowOffsetY = dy
  ctx.beginPath()
  ctx.rect(-pad, -pad, w + pad * 2, h + pad * 2)
  ctx.roundRect(0, 0, w, h, radius)
  ctx.fillStyle = '#000'
  ctx.fill('evenodd')
  ctx.restore()
}
