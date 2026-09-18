import { describe, expect, it } from 'vitest'
import { bezelPalette } from '../src/color'
import { scanlineGeometry } from '../src/layers'

describe('scanlineGeometry', () => {
  it('never renders a gap under 2 device pixels', () => {
    expect(scanlineGeometry(1, 1).gap * 1).toBe(2)
    expect(scanlineGeometry(1, 3).gap * 3).toBe(3)
  })

  it('snaps to whole device pixels', () => {
    for (const dpr of [1, 1.5, 2, 3]) {
      const { gap, line } = scanlineGeometry(3, dpr)
      expect(Number.isInteger(Math.round(gap * dpr * 1000) / 1000)).toBe(true)
      expect(Number.isInteger(Math.round(line * dpr * 1000) / 1000)).toBe(true)
    }
  })
})

describe('bezelPalette', () => {
  const lum = ([r, g, b]: readonly number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

  it.each(['#6b5b4a', '#1f3a93', '#d9d4c7', '#c0392b', '#222222'])('derives ordered lightness for %s', (color) => {
    const p = bezelPalette(color)
    expect(lum(p.highlight)).toBeGreaterThan(lum(p.base))
    expect(lum(p.shade)).toBeLessThan(lum(p.base))
    expect(lum(p.lip)).toBeLessThan(lum(p.shade))
  })

  it('falls back on unparseable colours', () => {
    expect(bezelPalette('url(javascript:alert(1))').base).toEqual([107, 91, 74])
  })
})
