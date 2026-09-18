import { CRTScreen } from './screen'
import type { CRTOptions } from './options'

const resolveTarget = (target: string | HTMLElement) => {
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target
  if (!el) throw new Error(`[retro-crt] mount target not found: ${String(target)}`)
  return el
}

export const CRT = {
  mount: (target: string | HTMLElement, options?: CRTOptions) => new CRTScreen(resolveTarget(target), options),
  /**
   * The whole page as a CRT. The spec exempts the root element from the filter containing-block
   * rule, so `position: fixed` keeps anchoring to the viewport here (§5.1).
   */
  mountFullPage: (options?: CRTOptions) => new CRTScreen(document.documentElement, options, true),
}

export { CRTScreen, type ScreenListener } from './screen'
export { DEFAULTS, TINT_COLORS, minimalOptions, resolveOptions } from './options'
export type { CRTOptions, Quality, Renderer, ResolvedOptions, TintPreset } from './options'
export { probeCapabilities, type Capabilities } from './detect'
export { bezelPalette, parseColor, rgbCss, type BezelPalette, type RGB } from './color'
export { scanlineGeometry } from './layers'
