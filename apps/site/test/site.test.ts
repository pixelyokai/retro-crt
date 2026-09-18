import { describe, expect, it } from 'vitest'
import { TARGETS, literal, snippet } from '../lib/snippets'
import { standaloneHtml } from '../lib/standalone'
import { Rejection, checkDeclaredType, checkDuration, checkSignature, checkSize, displayName, imageDimensions, sniff } from '../lib/validate'

const png = (w: number, h: number) => {
  const b = new Uint8Array(64)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82])
  new DataView(b.buffer).setUint32(16, w)
  new DataView(b.buffer).setUint32(20, h)
  return b
}
const text = (s: string) => new TextEncoder().encode(s)

describe('upload validation', () => {
  it('rejects SVG by name, by MIME and by content', () => {
    expect(() => checkDeclaredType('a.svg', '')).toThrow(/SVG/)
    expect(() => checkDeclaredType('a.png', 'image/svg+xml')).toThrow(/SVG/)
    expect(() => checkSignature(text('﻿  <?xml version="1.0"?><svg/>'), 'png')).toThrow(/SVG/)
    expect(() => checkSignature(text('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'png')).toThrow(/SVG/)
    expect(() => checkSignature(new Uint8Array([0x1f, 0x8b, 8, 0]), 'png')).toThrow(/SVG/)
  })

  it('rejects a mislabelled file by magic bytes', () => {
    expect(sniff(png(1, 1))).toBe('png')
    expect(() => checkSignature(png(1, 1), 'jpeg')).toThrow(/really PNG/)
    expect(() => checkSignature(text('hello world, not an image'), 'webp')).toThrow(Rejection)
  })

  it('rejects mismatched MIME families and unknown types', () => {
    expect(() => checkDeclaredType('a.mp4', 'image/png')).toThrow(Rejection)
    expect(() => checkDeclaredType('a.gif', 'image/gif')).toThrow(/Unsupported/)
    expect(checkDeclaredType('A.JPG', 'image/jpeg')).toBe('jpeg')
  })

  it('enforces size and duration caps', () => {
    expect(() => checkSize(3 * 1024 * 1024, 'image')).toThrow(/2\.0 MB/)
    expect(() => checkSize(3 * 1024 * 1024, 'video')).not.toThrow()
    expect(() => checkDuration(45)).toThrow(/30s/)
    expect(() => checkDuration(NaN)).toThrow(Rejection)
  })

  it('reads dimensions from headers without decoding', () => {
    expect(imageDimensions(png(640, 480), 'png')).toEqual({ width: 640, height: 480 })
  })

  it('sanitises names for display', () => {
    expect(displayName('<img src=x onerror=alert(1)>.png')).not.toMatch(/[<>=()]/)
  })
})

describe('code export', () => {
  const opts = { curvature: 0.5, bezel: { enabled: false, color: '#ff0000' }, tint: { preset: 'amber' as const } }

  const code = TARGETS.filter((t) => t !== 'html') as Exclude<(typeof TARGETS)[number], 'html'>[]

  it('never emits bezel tokens when the bezel is off', () => {
    for (const t of code) expect(snippet(t, opts)).not.toMatch(/bezel/i)
    expect(standaloneHtml(opts)).not.toMatch(/bezel|crt-(bevel|lip|glare|spill|frame)/)
  })

  it('exports only what was changed', () => {
    for (const t of code) {
      expect(snippet(t, opts)).toContain('curvature: 0.5')
      expect(snippet(t, opts)).not.toMatch(/maxPixelRatio|respectSaveData/)
    }
  })

  it('emits bezel layers when on', () => {
    expect(standaloneHtml({ bezel: { enabled: true } })).toMatch(/crt-lip/)
  })

  it('keeps animated grain out of the static effect container', () => {
    const html = standaloneHtml({ noise: { static: 0.1 }, scanlines: { flicker: true } })
    const grain = html.slice(html.indexOf('crt-grain'))
    expect(grain).toMatch(/crt-noise[\s\S]*crt-flicker/)
    expect(html.slice(0, html.indexOf('crt-grain"'))).not.toMatch(/<div class="crt-(noise|flicker)"/)
  })

  it('drops colour strings it cannot parse instead of emitting them', () => {
    expect(literal({ bezel: { enabled: true, color: '"}; alert(1); //' } })).not.toContain('alert')
    expect(standaloneHtml({ bezel: { enabled: true, color: '</style><script>alert(1)</script>' } })).not.toMatch(/<script|alert/)
    expect(standaloneHtml({ background: 'red; } body { background: url(javascript:alert(1))' })).not.toMatch(/javascript:/)
  })

  it('carries the background colour into the standalone page', () => {
    expect(standaloneHtml({ background: '#112233' })).toContain('rgb(17 34 51 / 1)')
  })
})
