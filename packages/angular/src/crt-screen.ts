import { afterNextRender, Component, computed, DestroyRef, Directive, effect, ElementRef, inject, input, output } from '@angular/core'
import { CRT, type CRTOptions, type CRTScreen as Screen, type Quality, type Renderer } from 'retro-crt'

type O = CRTOptions

/**
 * `[crtScreen]` turns its host into the screen. Children are moved inside the effect on mount, so
 * content Angular re-renders later should sit in a `<div data-rcrt-content>` child of the host.
 */
@Directive({ selector: '[crtScreen]' })
export class CRTScreenDirective {
  readonly crtScreen = input<O | ''>('')
  readonly renderer = input<O['renderer']>()
  readonly background = input<O['background']>()
  readonly curvature = input<O['curvature']>()
  readonly vignette = input<O['vignette']>()
  readonly scanlines = input<O['scanlines']>()
  readonly tint = input<O['tint']>()
  readonly bloom = input<O['bloom']>()
  readonly chromaticAberration = input<O['chromaticAberration']>()
  readonly noise = input<O['noise']>()
  readonly persistence = input<O['persistence']>()
  readonly bezel = input<O['bezel']>()
  readonly quality = input<O['quality']>()
  readonly maxPixelRatio = input<O['maxPixelRatio']>()
  readonly pauseWhenOffscreen = input<O['pauseWhenOffscreen']>()
  readonly respectReducedMotion = input<O['respectReducedMotion']>()
  readonly respectSaveData = input<O['respectSaveData']>()
  readonly rendererChange = output<{ renderer: Renderer; quality: Quality }>()

  private readonly options = computed<O>(() => {
    const props: O = {
      renderer: this.renderer(), background: this.background(), curvature: this.curvature(), vignette: this.vignette(),
      scanlines: this.scanlines(), tint: this.tint(), bloom: this.bloom(), chromaticAberration: this.chromaticAberration(), noise: this.noise(),
      persistence: this.persistence(), bezel: this.bezel(), quality: this.quality(), maxPixelRatio: this.maxPixelRatio(),
      pauseWhenOffscreen: this.pauseWhenOffscreen(), respectReducedMotion: this.respectReducedMotion(), respectSaveData: this.respectSaveData(),
    }
    return { ...(this.crtScreen() || {}), ...Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined)) }
  })

  constructor() {
    const host: HTMLElement = inject(ElementRef).nativeElement
    let screen: Screen | undefined
    // afterNextRender never runs on the server, which keeps SSR free of DOM access.
    afterNextRender(() => {
      screen = CRT.mount(host, this.options())
      const notify = (s: Screen) => this.rendererChange.emit({ renderer: s.activeRenderer, quality: s.activeQuality })
      screen.subscribe(notify)
      notify(screen)
    })
    effect(() => {
      const next = this.options()
      screen?.set(next)
    })
    inject(DestroyRef).onDestroy(() => screen?.destroy())
  }
}

const INPUTS = ['renderer', 'background', 'curvature', 'vignette', 'scanlines', 'tint', 'bloom', 'chromaticAberration', 'noise', 'persistence', 'bezel', 'quality', 'maxPixelRatio', 'pauseWhenOffscreen', 'respectReducedMotion', 'respectSaveData']

@Component({
  selector: 'crt-screen',
  template: '<div data-rcrt-content><ng-content /></div>',
  host: { style: 'display: block' },
  hostDirectives: [{ directive: CRTScreenDirective, inputs: ['crtScreen: options', ...INPUTS], outputs: ['rendererChange'] }],
})
export class CRTScreenComponent {}
