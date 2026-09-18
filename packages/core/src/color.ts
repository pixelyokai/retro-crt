export type RGB = readonly [number, number, number]

/** Parses #rgb / #rrggbb / rgb(a) strings. Anything unparseable falls back to the default housing colour. */
export function parseColor(input: string): RGB {
  const hex = input.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1]
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
    const channel = (i: number) => parseInt(full.slice(i, i + 2), 16)
    return [channel(0), channel(2), channel(4)]
  }
  const rgb = input.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i)
  return rgb ? [+rgb[1], +rgb[2], +rgb[3]] : [107, 91, 74]
}

const toLinear = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function toOklch([r, g, b]: RGB): [number, number, number] {
  const [lr, lg, lb] = [r, g, b].map(toLinear)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(A, B), Math.atan2(B, A)]
}

function fromOklch(L: number, C: number, h: number): RGB {
  const A = C * Math.cos(h)
  const B = C * Math.sin(h)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const [r, g, b] = rgb.map((c) => Math.round(Math.min(255, Math.max(0, fromLinear(c)))))
  return [r, g, b]
}

export const rgbCss = ([r, g, b]: RGB, alpha = 1) => `rgb(${r} ${g} ${b} / ${+alpha.toFixed(3)})`

export interface BezelPalette {
  base: RGB
  highlight: RGB
  shade: RGB
  lip: RGB
}

/**
 * Lightness steps in OKLCH so any hue gets a plausible moulded housing from one swatch (§4.3).
 * Chroma is eased toward the extremes because saturated highlights read as paint, not plastic.
 */
export function bezelPalette(color: string): BezelPalette {
  const base = parseColor(color)
  const [L, C, h] = toOklch(base)
  const step = (dL: number, cScale: number) => fromOklch(Math.min(0.97, Math.max(0.04, L + dL)), C * cScale, h)
  return { base, highlight: step(0.14, 0.8), shade: step(-0.16, 0.9), lip: step(-L * 0.78, 0.5) }
}
