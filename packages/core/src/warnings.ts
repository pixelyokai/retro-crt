import { warnOnce } from './env'
import type { CRTOptions, Renderer } from './options'

/**
 * Dev-only notices for combinations §4 marks unsupported. Keyed on what the consumer *set*, so
 * defaults that a tier can't honour (chromatic aberration on `css`, say) don't nag everyone.
 */
export function warnUnsupported(input: CRTOptions, tier: Renderer, fullPage: boolean): void {
  if (input.curvature && fullPage)
    warnOnce('page-curvature', 'curvature is ignored by mountFullPage: the root box spans the whole document, not the viewport.')
  if (input.persistence?.strength && tier !== 'webgl')
    warnOnce('persistence', `persistence needs frame history and is a no-op on the ${tier} renderer (webgl only).`)
  if (input.chromaticAberration?.intensity && tier === 'css')
    warnOnce('aberration', 'chromatic aberration needs per-channel filtering and is a no-op on the css renderer.')
}
