export type Format = 'jpeg' | 'png' | 'webp' | 'mp4' | 'webm'
export type Kind = 'image' | 'video'

const LIMITS = {
  imageBytes: 2 * 1024 * 1024,
  videoBytes: 5 * 1024 * 1024,
  videoSeconds: 30,
  // A 2 MB file can decode to a multi-gigabyte bitmap; refuse before any canvas is allocated.
  maxPixels: 36_000_000,
  maxSide: 8192,
  videoMaxSide: 4096,
}

const EXTENSIONS: Record<string, Format> = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp', mp4: 'mp4', m4v: 'mp4', webm: 'webm' }
export const kindOf = (f: Format): Kind => (f === 'mp4' || f === 'webm' ? 'video' : 'image')
export const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.webm'

export class Rejection extends Error {}

const SVG_MESSAGE = 'SVG files aren’t accepted: they can carry scripts. Export it as PNG or WebP first.'
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** Step 1: the cheap reject, on the name and the MIME the browser reported. */
export function checkDeclaredType(name: string, mime: string): Format {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  if (ext === 'svg' || ext === 'svgz' || /svg/i.test(mime)) throw new Rejection(SVG_MESSAGE)
  const format = EXTENSIONS[ext]
  if (!format) throw new Rejection('Unsupported file type. Use JPG, PNG or WebP for images, MP4 or WebM for video.')
  if (mime && !mime.startsWith(`${kindOf(format)}/`))
    throw new Rejection(`The file is named .${ext} but reports itself as ${mime.slice(0, 40)}. Re-export it and try again.`)
  return format
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v)
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to))

/** Step 2: what the bytes actually are, regardless of name or MIME. */
export function sniff(bytes: Uint8Array): Format | 'svg' | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp'
  if (ascii(bytes, 4, 8) === 'ftyp') return 'mp4'
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'webm'
  // SVG is text: sniff for markup after an optional BOM and whitespace, including gzipped .svgz.
  if (startsWith(bytes, [0x1f, 0x8b])) return 'svg'
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).replace(/^﻿/, '').trimStart().toLowerCase()
  if (head.startsWith('<') && /<svg|<\?xml|<!doctype svg/.test(head)) return 'svg'
  return null
}

export function checkSignature(bytes: Uint8Array, declared: Format): void {
  const actual = sniff(bytes)
  if (actual === 'svg') throw new Rejection(SVG_MESSAGE)
  if (actual !== declared)
    throw new Rejection(
      actual
        ? `This file is really ${actual.toUpperCase()} data with a .${declared} name. Rename or re-export it.`
        : `The file’s contents aren’t valid ${declared.toUpperCase()} data. It may be corrupted or mislabelled.`,
    )
}

/** Step 3. */
export function checkSize(bytes: number, kind: Kind): void {
  const limit = kind === 'image' ? LIMITS.imageBytes : LIMITS.videoBytes
  if (bytes > limit) throw new Rejection(`This ${kind} is ${mb(bytes)}; the limit is ${mb(limit)}. Compress or trim it and try again.`)
}

export function checkDuration(seconds: number): void {
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Rejection('Couldn’t read the video’s duration. Re-export it as MP4 (H.264) or WebM.')
  if (seconds > LIMITS.videoSeconds + 0.05)
    throw new Rejection(
      `This video is ${Math.round(seconds)}s; the limit is ${LIMITS.videoSeconds}s, because export can run in real time. Trim it and try again.`,
    )
}

/** Step 4: pixel dimensions from the header alone, so nothing is decoded before the check. */
export function checkDimensions(width: number, height: number, kind: Kind): void {
  const side = kind === 'image' ? LIMITS.maxSide : LIMITS.videoMaxSide
  if (!width || !height) throw new Rejection('Couldn’t read the dimensions. The file may be corrupted.')
  if (width > side || height > side || width * height > LIMITS.maxPixels)
    throw new Rejection(`${width}×${height} is too large to process safely here. Resize it to at most ${side}px per side.`)
}

export function imageDimensions(b: Uint8Array, format: Format): { width: number; height: number } | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (b.length < 30) return null
  if (format === 'png') return { width: view.getUint32(16), height: view.getUint32(20) }
  if (format === 'webp') {
    const chunk = ascii(b, 12, 16)
    if (chunk === 'VP8X') return { width: 1 + (view.getUint32(24, true) & 0xffffff), height: 1 + (view.getUint32(27, true) & 0xffffff) }
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true)
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }
    }
    if (chunk === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
    return null
  }
  if (format === 'jpeg') {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null
      const marker = b[i + 1]
      const length = view.getUint16(i + 2)
      // SOF0–SOF15 carry the frame size; C4, C8 and CC share the range but are other segments.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) }
      i += 2 + length
    }
  }
  return null
}

/** For display only. The uploaded name never reaches a download attribute (§8.2). */
export const displayName = (name: string) => name.replace(/[^\w.\- ]+/g, '_').slice(0, 48)
