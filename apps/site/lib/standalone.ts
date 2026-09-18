import { TINT_COLORS, bezelPalette, parseColor, resolveOptions, rgbCss, type CRTOptions } from 'retro-crt'

// Static grain as an SVG *image* (not a filter on content), so this stays a pure css-tier effect.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 1.4 -.2'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E\")"

const n = (v: number) => +v.toFixed(3)
const EFFECT_LAYERS = ['bloom', 'tint', 'scanlines', 'noise', 'curve', 'vignette', 'flicker']
const NL = '\n'
const div = (layer: string) => `${NL}      <div class="crt-${layer}"></div>`

/**
 * A dependency-free HTML+CSS page reproducing the `css` tier. Every interpolated value is a
 * number or a colour re-serialised from parsed channels, so the output is inert by construction.
 */
export function standaloneHtml(input: CRTOptions): string {
  const o = resolveOptions(input)
  const tint = TINT_COLORS[o.tint.preset]
  const b = o.bezel
  const background = rgbCss(parseColor(o.background))
  const gap = Math.max(2, o.scanlines.gap)
  const layers = [
    o.bloom.enabled && o.bloom.strength > 0 && 'bloom',
    tint && o.tint.strength > 0 && 'tint',
    o.scanlines.intensity > 0 && 'scanlines',
    o.curvature > 0 && 'curve',
    o.vignette > 0 && 'vignette',
  ].filter((l): l is string => !!l)
  // Animated layers get their own container, blended as one group against the picture.
  const grain = [o.noise.enabled && o.noise.static > 0 && 'noise', o.scanlines.flicker && 'flicker'].filter((l): l is string => !!l)

  const css: string[] = [
    `.crt { position: relative; isolation: isolate; box-sizing: border-box; height: 100%; }`,
    `.crt-content { position: relative; z-index: 1; height: 100%; overflow: hidden; background: ${background}; border-radius: ${b.enabled ? b.radius.screen : Math.round(o.curvature * 28)}px; }`,
    `.crt-fx, .crt-fx > * { position: absolute; inset: 0; pointer-events: none; }`,
    `.crt-fx { z-index: 2; overflow: hidden; border-radius: inherit; }`,
    `.crt-grain { mix-blend-mode: overlay; }`,
    `.crt-bloom { -webkit-backdrop-filter: contrast(${n(1 + o.bloom.threshold * 1.5)}) brightness(${n(1 + o.bloom.strength)}) blur(${n(o.bloom.radius)}px); backdrop-filter: contrast(${n(1 + o.bloom.threshold * 1.5)}) brightness(${n(1 + o.bloom.strength)}) blur(${n(o.bloom.radius)}px); opacity: ${n(o.bloom.strength * 0.55)}; }`,
    tint ? `.crt-tint { background: rgb(${tint.join(' ')}); mix-blend-mode: color; opacity: ${n(o.tint.strength * 0.85)}; }` : '',
    `.crt-scanlines { background: repeating-linear-gradient(to bottom, rgb(0 0 0 / ${n(o.scanlines.intensity * 0.75)}) 0, transparent ${n(gap / 2)}px, transparent ${n(gap / 2)}px, rgb(0 0 0 / ${n(o.scanlines.intensity * 0.75)}) ${n(gap)}px); }`,
    `.crt-noise { inset: -50%; background-image: ${GRAIN}; opacity: ${n(o.noise.static * 2.5)}; animation: crt-noise .4s steps(1) infinite; }`,
    `.crt-curve { border-radius: inherit; box-shadow: inset 0 0 ${n(o.curvature * 60)}px ${n(o.curvature * 12)}px rgb(0 0 0 / .7); }`,
    `.crt-vignette { background: radial-gradient(ellipse at center, transparent 45%, rgb(0 0 0 / ${n(o.vignette * 0.85)}) 100%); }`,
    `.crt-flicker { background: #000; opacity: 0; animation: crt-flicker 3.1s steps(1) infinite; }`,
    // Offsets stay within ±25% of the 200% grain layer so it always covers the screen.
    `@keyframes crt-noise { 0% { transform: translate(0, 0) } 25% { transform: translate(-17%, 10%) } 50% { transform: translate(14%, -22%) } 75% { transform: translate(-22%, -9%) } }`,
    `@keyframes crt-flicker { 0%, 8%, 33%, 61%, 86% { opacity: 0 } 7% { opacity: .06 } 31% { opacity: .03 } 58% { opacity: .08 } 84% { opacity: .04 } }`,
    `@media (prefers-reduced-motion: reduce) { .crt-noise, .crt-flicker { animation: none; } }`,
  ]

  let bezelMarkup = ''
  if (b.enabled) {
    const p = bezelPalette(b.color)
    const rad = ((b.lightAngle - 90) * Math.PI) / 180
    const [lx, ly] = [n(Math.cos(rad)), n(Math.sin(rad))]
    const edge = n(Math.max(1, b.thickness * 0.04))
    const lip = n(Math.max(2, b.thickness * 0.14) * b.innerLip)
    const spillColor = tint ?? [200, 220, 255]
    const screenBox = `position: absolute; inset: ${b.thickness}px; border-radius: ${b.radius.screen}px; pointer-events: none;`
    css.push(
      `.crt { padding: ${b.thickness}px; border-radius: ${b.radius.outer}px; background: ${rgbCss(p.base)};${b.shadow ? ' box-shadow: 0 18px 40px -12px rgb(0 0 0 / .55), 0 4px 10px rgb(0 0 0 / .3);' : ''} }`,
      `.crt-fx { inset: ${b.thickness}px; border-radius: ${b.radius.screen}px; }`,
      `.crt-bevel { position: absolute; inset: 0; z-index: 0; pointer-events: none; border-radius: ${b.radius.outer}px; background: linear-gradient(${b.lightAngle + 180}deg, ${rgbCss(p.highlight, b.bevel)}, transparent 45%, transparent 55%, ${rgbCss(p.shade, b.bevel)}); box-shadow: inset ${n(-lx * edge)}px ${n(-ly * edge)}px ${edge}px ${rgbCss(p.highlight, b.bevel)}, inset ${n(lx * edge * 1.5)}px ${n(ly * edge * 1.5)}px ${n(edge * 2)}px ${rgbCss(p.shade, b.bevel)}; }`,
      b.screenSpill > 0 ? `.crt-spill { ${screenBox} z-index: 0; box-shadow: 0 0 ${n(b.thickness * 0.8)}px ${n(b.thickness * 0.1)}px ${rgbCss(spillColor, b.screenSpill * 0.45)}; }` : '',
      `.crt-lip { ${screenBox} z-index: 3; box-shadow: 0 0 0 ${lip}px ${rgbCss(p.lip)}, ${n(-lx * lip * 0.5)}px ${n(-ly * lip * 0.5)}px 0 ${lip}px ${rgbCss(p.highlight, 0.5 * b.innerLip)}, inset ${n(-lx * 3)}px ${n(-ly * 3)}px ${n(10 * b.innerLip)}px ${n(2 * b.innerLip)}px rgb(0 0 0 / ${n(0.35 + b.innerLip * 0.5)}); }`,
      b.glare > 0 ? `.crt-glare { ${screenBox} z-index: 4; background: linear-gradient(135deg, rgb(255 255 255 / ${n(b.glare * 0.35)}), rgb(255 255 255 / ${n(b.glare * 0.1)}) 22%, transparent 42%); }` : '',
      `@media (prefers-reduced-transparency: reduce) { .crt-spill { display: none; } }`,
    )
    bezelMarkup = ['bevel', b.screenSpill > 0 && 'spill', 'lip', b.glare > 0 && 'glare']
      .filter(Boolean)
      .map((l) => `${NL}    <div class="crt-${l}" aria-hidden="true"></div>`)
      .join('')
  }

  const present = [...layers, ...grain]
  const used = css.filter((rule) => {
    const layer = rule.match(/^\.crt-(\w+) /)?.[1]
    return rule && (!layer || !EFFECT_LAYERS.includes(layer) || present.includes(layer))
  })
  const grainMarkup = grain.length ? `${NL}    <div class="crt-fx crt-grain" aria-hidden="true">${grain.map(div).join('')}${NL}    </div>` : ''

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CRT</title>
    <style>
      html, body { margin: 0; height: 100%; background: #111; }
      ${used.join(`${NL}      `)}
    </style>
  </head>
  <body>
    <div class="crt">
    <div class="crt-content">
      <!-- your content -->
    </div>
    <div class="crt-fx" aria-hidden="true">${layers.map(div).join('')}
    </div>${grainMarkup}${bezelMarkup}
    </div>
  </body>
</html>
`
}
