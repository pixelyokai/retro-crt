import { Bezel } from './bezel'
import { parseColor, rgbCss } from './color'
import { capabilitiesSync, contentAnimates, deviceClass, downgrade, probeCapabilities, qualityFor, resolveTier, textureSource, type Capabilities } from './detect'
import { setVars } from './dom'
import { debounce, readEnvironment, warnOnce, watchEnvironment, type Environment } from './env'
import { EffectLayers, qualityScale } from './layers'
import { sampleFrames } from './monitor'
import { resolveOptions, type CRTOptions, type Quality, type Renderer, type ResolvedOptions } from './options'
import { attachMask, attachViewport, type Structure } from './structure'
import { SvgFilters } from './svg-filter'
import { displacementPull, displacementScale } from './textures'
import type { WebGLTier } from './webgl'
import { warnUnsupported } from './warnings'

const RANK: Record<Renderer, number> = { css: 0, svg: 1, webgl: 2 }
let webglModule: Promise<typeof import('./webgl')> | undefined

export type ScreenListener = (screen: CRTScreen) => void

export class CRTScreen {
  private input: CRTOptions = {}
  private opts: ResolvedOptions = resolveOptions()
  private dom!: Structure
  private layers: EffectLayers | null = null
  private bezel!: Bezel
  private filters: SvgFilters | null = null
  private gl: WebGLTier | null = null
  private glFailed = false
  private tier: Renderer = 'css'
  private quality: Quality = 'balanced'
  private qualityCap: Quality | null = null
  private tierCap: Renderer = 'webgl'
  private caps: Capabilities = capabilitiesSync() ?? { webgl: false, svg: false, svgStaticOnly: false }
  private readonly device = deviceClass()
  private size = { width: 0, height: 0 }
  private inView = true
  private listeners = new Set<ScreenListener>()
  private cleanups: (() => void)[] = []
  private stopSampling: (() => void) | undefined
  private destroyed = false
  private notified = ''
  private readonly settle = debounce(() => delete this.dom.host.dataset.rcrtTuning, 400)

  constructor(private readonly target: HTMLElement, options: CRTOptions = {}, private readonly fullPage = false) {
    this.input = options
    this.opts = resolveOptions(options)
    this.build()
    this.observe()
    this.render()
    probeCapabilities().then((caps) => {
      this.caps = caps
      this.render()
      this.sample()
    })
  }

  get activeRenderer(): Renderer {
    return this.tier
  }

  get activeQuality(): Quality {
    return this.quality
  }

  /** Deep-merges into the current options. */
  update(partial: CRTOptions): void {
    this.set(mergeOptions(this.input, partial))
  }

  /** Replaces the options wholesale — what adapters use, so removed props revert to defaults. */
  set(options: CRTOptions): void {
    if (this.destroyed) return
    this.input = options
    this.opts = resolveOptions(options)
    // will-change only while values are moving, never left on the shipped effect (§10).
    this.dom.host.dataset.rcrtTuning = ''
    this.settle()
    this.render()
  }

  subscribe(fn: ScreenListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.cleanups.forEach((fn) => fn())
    this.settle.cancel()
    this.stopSampling?.()
    this.teardown()
    this.listeners.clear()
  }

  private build(): void {
    this.dom = this.fullPage ? attachViewport() : attachMask(this.target)
    this.bezel = new Bezel(this.dom.host)
    this.resizeObserver?.observe(this.dom.host)
  }

  private teardown(): void {
    this.resizeObserver?.unobserve(this.dom.host)
    this.setTier(null)
    this.bezel.destroy()
    if (this.fullPage) document.documentElement.style.removeProperty('filter')
    this.dom.detach()
  }

  private resizeObserver: ResizeObserver | undefined

  private observe(): void {
    const onResize = debounce(() => this.render(), 100)
    this.resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const first = this.size.width === 0
      this.size = { width, height }
      // Never rebuild on each intermediate frame of a drag-resize (§6.1); the first size is immediate.
      if (first) return this.render()
      // The GL buffer is the exception: it has to track the box every frame or the picture skews.
      this.gl?.resize(width, height)
      onResize()
    })
    this.resizeObserver.observe(this.dom.host)
    const io = new IntersectionObserver(([entry]) => {
      this.inView = entry.isIntersecting
      this.syncRunning()
    })
    io.observe(this.target)
    const onVisibility = () => this.syncRunning()
    document.addEventListener('visibilitychange', onVisibility)
    // Content that starts animating must leave svg where WebKit would silently drop the filter (§5.2).
    const onAnimation = () => this.tier === 'svg' && this.caps.svgStaticOnly && this.render()
    this.target.addEventListener('animationstart', onAnimation)
    this.target.addEventListener('transitionstart', onAnimation)
    const unwatch = watchEnvironment(() => this.render())
    this.cleanups.push(
      () => this.resizeObserver?.disconnect(),
      () => io.disconnect(),
      onResize.cancel,
      () => document.removeEventListener('visibilitychange', onVisibility),
      () => this.target.removeEventListener('animationstart', onAnimation),
      () => this.target.removeEventListener('transitionstart', onAnimation),
      unwatch,
    )
  }

  private get running(): boolean {
    return !document.hidden && (this.inView || !this.opts.pauseWhenOffscreen)
  }

  private syncRunning(): void {
    this.dom.host.toggleAttribute('data-rcrt-paused', !this.running)
    this.gl?.setRunning(this.running)
  }

  private pickTier(env: Environment): Renderer {
    const content = this.dom.content
    const input = {
      caps: { ...this.caps, webgl: this.caps.webgl && !this.glFailed },
      device: this.device,
      saveData: env.saveData && this.opts.respectSaveData,
      hasTexture: !!content && !!textureSource(content),
      // A whole page is assumed to animate: it's the case WebKit gets wrong.
      animates: content ? contentAnimates(content) : true,
    }
    const tier = resolveTier({ ...input, requested: this.opts.renderer })
    return RANK[tier] > RANK[this.tierCap] ? resolveTier({ ...input, requested: this.tierCap }) : tier
  }

  private render(): void {
    if (this.destroyed) return
    const env = readEnvironment(this.opts.maxPixelRatio)
    const o = effectiveOptions(this.opts, env)
    const base = this.opts.quality === 'auto' ? qualityFor(this.device) : this.opts.quality
    this.quality = this.qualityCap && qualityScale(this.qualityCap) < qualityScale(base) ? this.qualityCap : base
    const wanted = this.pickTier(env)
    this.setTier(wanted)
    const host = this.dom.host
    host.toggleAttribute('data-rcrt-still', env.reducedMotion && o.respectReducedMotion)
    this.syncRunning()
    warnUnsupported(this.input, this.tier, this.fullPage)

    const curvature = !this.fullPage && o.curvature > 0
    setVars(host, { background: rgbCss(parseColor(o.background)) })
    if (!o.bezel.enabled) setVars(host, { 'screen-radius': curvature ? `${Math.round(o.curvature * 28)}px` : '0px' })
    this.bezel.update(o, env.reducedTransparency)
    const { width, height } = this.size
    // Only the svg tier actually displaces DOM layers; css fakes the curve and webgl has no layers.
    const pull = curvature && this.tier === 'svg' ? displacementPull(displacementScale(o.curvature, width, height), width, height) : { x: 0, y: 0 }
    const ctx = { tier: this.tier, quality: this.quality, dpr: env.dpr, viewport: this.fullPage, pull }
    this.layers?.update(o, ctx)
    if (this.filters) {
      this.filters.update({ opts: o, width, height, bloomScale: qualityScale(this.quality), curvature })
      const filterTarget = this.fullPage ? document.documentElement : null
      if (filterTarget) filterTarget.style.filter = `url(#${this.filters.contentId})`
      else if (this.dom.content) {
        this.dom.content.dataset.rcrtFiltered = ''
        setVars(host, { 'content-filter': `url(#${this.filters.contentId})`, 'fx-filter': `url(#${this.filters.geometryId})` })
        this.layers?.root.toggleAttribute('data-rcrt-filtered', curvature)
      }
    }
    this.gl?.update({ opts: o, quality: this.quality, scale: env.dpr * qualityScale(this.quality), motion: !host.hasAttribute('data-rcrt-still') }, width, height)
    // Diffed against what listeners last saw: a rebuild resets the tier before this render runs.
    const state = [this.tier, this.quality].join()
    if (state !== this.notified) {
      this.notified = state
      this.listeners.forEach((fn) => fn(this))
    }
  }

  /** Builds exactly the parts a tier needs and removes the rest; `null` removes everything. */
  private setTier(next: Renderer | null): void {
    const host = this.dom.host
    const needsLayers = next === 'svg' || next === 'css' || (next === 'webgl' && !this.gl)
    if (needsLayers && !this.layers) this.layers = new EffectLayers(host)
    if (!needsLayers && this.layers) this.layers = (this.layers.destroy(), null)
    if (next === 'svg' && !this.filters) this.filters = new SvgFilters(host)
    if (next !== 'svg' && this.filters) {
      this.filters = (this.filters.destroy(), null)
      if (this.dom.content) delete this.dom.content.dataset.rcrtFiltered
      if (this.fullPage) document.documentElement.style.removeProperty('filter')
    }
    if (next !== 'webgl' && this.gl) this.gl = (this.gl.destroy(), null)
    if (next === 'webgl' && !this.gl) this.loadWebgl()
    // Until the WebGL chunk arrives, the css layers stand in so the first frame is never blank.
    this.tier = next === 'webgl' && !this.gl ? 'css' : (next ?? 'css')
    if (next) host.dataset.rcrtTier = this.tier
  }

  private loadWebgl(): void {
    const source = this.dom.content && textureSource(this.dom.content)
    if (!source) return
    webglModule ??= import('./webgl')
    webglModule.then(({ WebGLTier }) => {
      if (this.destroyed || this.gl || this.pickTier(readEnvironment(this.opts.maxPixelRatio)) !== 'webgl') return
      try {
        this.gl = new WebGLTier(this.dom.host, source)
      } catch {
        this.glFailed = true
      }
      this.render()
    })
  }

  /** Runtime downgrade: quality first, then tier, one way only, until the budget holds (§4.2). */
  private sample(): void {
    const autoQuality = this.opts.quality === 'auto'
    const autoTier = this.opts.renderer === 'auto'
    if ((!autoQuality && !autoTier) || !this.running || this.destroyed) return
    this.stopSampling = sampleFrames((over) => {
      if (!over || this.destroyed) return
      const step = downgrade(this.quality, this.tier, autoQuality, autoTier)
      if (!step) return
      if (step.tier !== this.tier) {
        this.tierCap = step.tier
        warnOnce(`downgrade-${step.tier}`, `frame budget missed; dropping to the ${step.tier} renderer.`)
      }
      this.qualityCap = step.quality
      this.render()
      this.sample()
    })
  }
}

function effectiveOptions(o: ResolvedOptions, env: Environment): ResolvedOptions {
  const still = env.reducedMotion && o.respectReducedMotion
  const dim = env.reducedTransparency ? 0.5 : 1
  return {
    ...o,
    scanlines: { ...o.scanlines, flicker: o.scanlines.flicker && !still },
    persistence: { strength: still ? 0 : o.persistence.strength },
    tint: { ...o.tint, strength: o.tint.strength * dim },
    bloom: { ...o.bloom, strength: o.bloom.strength * dim },
  }
}

const mergeOptions = (a: CRTOptions, b: CRTOptions): CRTOptions => ({
  ...a,
  ...b,
  scanlines: { ...a.scanlines, ...b.scanlines },
  tint: { ...a.tint, ...b.tint },
  bloom: { ...a.bloom, ...b.bloom },
  chromaticAberration: { ...a.chromaticAberration, ...b.chromaticAberration },
  noise: { ...a.noise, ...b.noise },
  persistence: { ...a.persistence, ...b.persistence },
  bezel: { ...a.bezel, ...b.bezel, radius: { ...a.bezel?.radius, ...b.bezel?.radius } },
})
