import { GLRenderer, type FrameParams } from './gl-renderer'

export { GLRenderer, type FrameParams }

// `play` matters: playback starts outside our control and the loop must resume with it.
const SOURCE_EVENTS = ['seeked', 'pause', 'play']
const SIZE_EVENTS = ['load', 'loadedmetadata', 'loadeddata', 'resize']

type Source = HTMLVideoElement | HTMLCanvasElement | HTMLImageElement

const ready = (s: Source) =>
  s instanceof HTMLVideoElement ? s.readyState >= 2 : s instanceof HTMLImageElement ? s.complete && s.naturalWidth > 0 : s.width > 0

/**
 * Drives a GLRenderer over a live source inside a mounted screen. The source stays in the DOM
 * (transparent) so layout, media playback and resize observation behave exactly as unwrapped.
 */
export class WebGLTier {
  readonly canvas = document.createElement('canvas')
  private renderer: GLRenderer
  private frame = 0
  private params: FrameParams | null = null
  private running = false
  private readonly start = performance.now()
  private readonly redraw = () => this.draw()
  private readonly refit = () => (this.fit(), this.draw())

  constructor(host: HTMLElement, private source: Source) {
    this.canvas.className = 'rcrt-gl'
    this.canvas.setAttribute('aria-hidden', 'true')
    this.renderer = new GLRenderer(this.canvas)
    host.appendChild(this.canvas)
    for (const ev of SOURCE_EVENTS) source.addEventListener(ev, this.redraw)
    for (const ev of SIZE_EVENTS) source.addEventListener(ev, this.refit)
  }

  /** Continuous animation is needed only if something on screen changes without our input. */
  private get animated(): boolean {
    const p = this.params
    if (!p) return false
    const o = p.opts
    const media = this.source instanceof HTMLCanvasElement || (this.source instanceof HTMLVideoElement && !this.source.paused)
    return media || (p.motion && (o.persistence.strength > 0 || (o.noise.enabled && o.noise.static > 0) || o.scanlines.flicker))
  }

  update(params: FrameParams, width: number, height: number): void {
    this.params = params
    this.renderer.resize(width * params.scale, height * params.scale)
    this.renderer.configure(params)
    this.fit()
    this.draw()
  }

  /**
   * Buffer-only resize, cheap enough to run on every frame of an animating box. Without it the
   * drawing buffer keeps the old aspect ratio while CSS stretches it, and the picture visibly
   * skews until the debounced full render catches up.
   */
  resize(width: number, height: number): void {
    if (!this.params) return
    this.renderer.resize(width * this.params.scale, height * this.params.scale)
    this.fit()
    this.draw()
  }

  private fit(): void {
    const s = this.source
    const [w, h] = s instanceof HTMLVideoElement ? [s.videoWidth, s.videoHeight] : s instanceof HTMLImageElement ? [s.naturalWidth, s.naturalHeight] : [s.width, s.height]
    const fit = getComputedStyle(s).objectFit
    this.renderer.setFit(fit === 'cover' || fit === 'contain' ? fit : 'fill', w, h)
  }

  setRunning(running: boolean): void {
    this.running = running
    this.draw()
  }

  private draw(): void {
    cancelAnimationFrame(this.frame)
    if (!this.params) return
    if (ready(this.source)) this.renderer.render(this.source, this.params.motion ? (performance.now() - this.start) / 1000 : 0)
    if (this.running && this.animated) this.frame = requestAnimationFrame(this.redraw)
  }

  destroy(): void {
    cancelAnimationFrame(this.frame)
    for (const ev of SOURCE_EVENTS) this.source.removeEventListener(ev, this.redraw)
    for (const ev of SIZE_EVENTS) this.source.removeEventListener(ev, this.refit)
    this.renderer.destroy()
    this.canvas.remove()
  }
}
