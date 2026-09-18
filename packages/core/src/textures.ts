import type { Quality } from './options'

const displacementCache = new Map<string, string>()
const noiseCache = new Map<Quality, string>()

function paint(size: number, fill: (data: Uint8ClampedArray, x: number, y: number, i: number) => void): string {
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size })
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const image = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) fill(image.data, x, y, (y * size + x) * 4)
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

/**
 * Barrel-distortion map for feDisplacementMap. Curvature is deliberately *not* baked in: it only
 * scales the displacement, so it's applied through the primitive's `scale` and the map is cached
 * per aspect bucket instead — dragging the curvature slider never regenerates anything (§5.3).
 */
export function displacementMap(aspect: number): string {
  const bucket = Math.round(Math.min(4, Math.max(0.25, aspect)) * 20) / 20
  const key = String(bucket)
  let url = displacementCache.get(key)
  if (url) return url
  const size = 256
  const wr = bucket >= 1 ? 1 : bucket
  const hr = bucket >= 1 ? 1 / bucket : 1
  url = paint(size, (d, x, y, i) => {
    const nx = ((x + 0.5) / size) * 2 - 1
    const ny = ((y + 0.5) / size) * 2 - 1
    const r2 = nx * nx + ny * ny
    d[i] = 255 * (0.5 + (nx * r2 * wr) / 4)
    d[i + 1] = 255 * (0.5 + (ny * r2 * hr) / 4)
    d[i + 3] = 255
  })
  displacementCache.set(key, url)
  return url
}

/** px of displacement for `curvature` over a box, matching the encoding in `displacementMap`. */
export const displacementScale = (curvature: number, width: number, height: number) =>
  2 * curvature * 0.12 * Math.max(width, height)

/**
 * How far the barrel pulls the picture in from each edge, in px. Unfiltered overlays (grain) have
 * to stop here, or they paint over the dark surround the distortion exposes.
 */
export function displacementPull(scale: number, width: number, height: number) {
  const aspect = width / Math.max(1, height)
  return { x: scale * 0.25 * Math.min(1, aspect), y: scale * 0.25 * Math.min(1, 1 / aspect) }
}

const NOISE_SIZE: Record<Quality, number> = { high: 256, balanced: 160, low: 96 }

/** One grain tile per quality level; the CSS cycles it through fixed offsets with steps() (§10). */
export function noiseTile(quality: Quality): string {
  let url = noiseCache.get(quality)
  if (url) return url
  url = paint(NOISE_SIZE[quality], (d, _x, _y, i) => {
    d[i] = d[i + 1] = d[i + 2] = Math.random() * 255
    d[i + 3] = 255
  })
  noiseCache.set(quality, url)
  return url
}
