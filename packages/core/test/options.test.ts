import { describe, expect, it } from 'vitest'
import { DEFAULTS, minimalOptions, resolveOptions } from '../src/options'

describe('resolveOptions', () => {
  it('fills defaults', () => {
    expect(resolveOptions()).toEqual(DEFAULTS)
  })

  it('clamps out-of-range values instead of passing them through', () => {
    const o = resolveOptions({ curvature: 1e9, scanlines: { gap: -4 }, noise: { static: 5 }, bloom: { radius: Infinity } })
    expect(o.curvature).toBe(1)
    expect(o.scanlines.gap).toBe(1)
    expect(o.noise.static).toBe(0.3)
    expect(o.bloom.radius).toBe(DEFAULTS.bloom.radius)
  })

  it('rejects unknown enum values and wrong types', () => {
    const input = JSON.parse('{"renderer":"canvas","tint":{"preset":"purple"},"scanlines":{"flicker":"yes"}}')
    const o = resolveOptions(input)
    expect(o.renderer).toBe('auto')
    expect(o.tint.preset).toBe('default')
    expect(o.scanlines.flicker).toBe(false)
  })

  it('only accepts colour strings it can parse, so nothing else reaches CSS', () => {
    expect(resolveOptions({ background: '#123', bezel: { color: 'rgb(1, 2, 3)' } })).toMatchObject({
      background: '#123',
      bezel: { color: 'rgb(1, 2, 3)' },
    })
    const bad = resolveOptions({ background: 'red; --x: url(javascript:alert(1))', bezel: { color: 'var(--anything)' } })
    expect(bad.background).toBe(DEFAULTS.background)
    expect(bad.bezel.color).toBe(DEFAULTS.bezel.color)
  })
})

describe('minimalOptions', () => {
  it('exports only what differs from defaults', () => {
    expect(minimalOptions({ curvature: 0.3, vignette: 0.8, scanlines: { gap: 3, flicker: true } })).toEqual({
      vignette: 0.8,
      scanlines: { flicker: true },
    })
  })

  it('drops every bezel key when the bezel is disabled', () => {
    const out = minimalOptions({ bezel: { enabled: false, color: '#ff0000', thickness: 80 } })
    expect(JSON.stringify(out)).not.toMatch(/bezel/)
  })

  it('keeps bezel tuning when enabled', () => {
    expect(minimalOptions({ bezel: { enabled: true, radius: { outer: 40 } } })).toEqual({
      bezel: { enabled: true, radius: { outer: 40 } },
    })
  })
})
