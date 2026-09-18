import { describe, expect, it } from 'vitest'
import { downgrade, resolveTier } from '../src/detect'

const caps = { webgl: true, svg: true, svgStaticOnly: false }
const base = { requested: 'auto' as const, caps, device: 'high' as const, saveData: false, hasTexture: false, animates: false }

describe('resolveTier', () => {
  it('keeps DOM content on a DOM tier', () => {
    expect(resolveTier(base)).toBe('svg')
  })

  it('prefers webgl for a lone media element', () => {
    expect(resolveTier({ ...base, hasTexture: true })).toBe('webgl')
  })

  it('never resolves svg for animating content on a static-only engine', () => {
    expect(resolveTier({ ...base, caps: { ...caps, svgStaticOnly: true }, animates: true })).toBe('css')
    expect(resolveTier({ ...base, requested: 'svg', caps: { ...caps, svgStaticOnly: true }, animates: true })).toBe('css')
    expect(resolveTier({ ...base, caps: { ...caps, svgStaticOnly: true } })).toBe('svg')
  })

  it('forces css for save-data and low-end devices', () => {
    expect(resolveTier({ ...base, saveData: true, hasTexture: true })).toBe('css')
    expect(resolveTier({ ...base, device: 'low' })).toBe('css')
  })

  it('falls back when an explicit tier is unavailable', () => {
    expect(resolveTier({ ...base, requested: 'webgl' })).toBe('svg')
    expect(resolveTier({ ...base, requested: 'svg', caps: { ...caps, svg: false } })).toBe('css')
  })
})

describe('downgrade', () => {
  it('exhausts quality before dropping a tier', () => {
    expect(downgrade('high', 'webgl', true, true)).toEqual({ quality: 'balanced', tier: 'webgl' })
    expect(downgrade('balanced', 'webgl', true, true)).toEqual({ quality: 'low', tier: 'webgl' })
    expect(downgrade('low', 'webgl', true, true)).toEqual({ quality: 'low', tier: 'svg' })
    expect(downgrade('low', 'svg', true, true)).toEqual({ quality: 'low', tier: 'css' })
    expect(downgrade('low', 'css', true, true)).toBeNull()
  })

  it('respects fixed quality or fixed tier', () => {
    expect(downgrade('high', 'svg', false, true)).toEqual({ quality: 'high', tier: 'css' })
    expect(downgrade('low', 'svg', true, false)).toBeNull()
  })
})
