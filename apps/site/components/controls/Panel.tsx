'use client'
import { useState } from 'react'
import { RENDERERS, TINTS } from '@/lib/controls'
import type { CrtStore } from '../useCrt'
import { AberrationIcon, BezelIcon, BloomIcon, NoiseIcon, PerformanceIcon, PersistenceIcon, ScanlinesIcon, ScreenIcon, TintIcon } from '../ui/icons'
import { Segmented } from '../ui/Segmented'
import { ColorField, Row, Toggle } from './Fields'
import { Folder } from './Folder'
import { Slider } from './Slider'
import { Select } from './Select'

const SECTIONS = ['screen', 'scanlines', 'tint', 'bloom', 'aberration', 'noise', 'persistence', 'bezel', 'performance'] as const
type Section = (typeof SECTIONS)[number]

const decimals = (step: number) => (String(step).split('.')[1] ?? '').length
const fixed = (step: number) => (v: number) => v.toFixed(decimals(step))
const px = (v: number) => `${v}px`

/** Every control in the Paper sidebar, in the Paper order. */
export function Panel({ store }: { store: CrtStore }) {
  const { settings: s, active, patch, patchIn } = store
  // Auto's tooltip doubles as the readout: it names whichever renderer the library settled on.
  const renderers = RENDERERS.map((r) =>
    r.value === 'auto' && active ? { ...r, hint: `${r.hint} Right now: ${active.renderer.toUpperCase()}, ${active.quality} quality.` } : r,
  )
  const [open, setOpen] = useState<Set<Section>>(() => new Set<Section>(SECTIONS))
  const toggle = (id: Section) =>
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  const folder = (id: Section) => ({ open: open.has(id), onToggle: () => toggle(id) })

  return (
    <div>
      <Folder title="Screen" icon={<ScreenIcon />} {...folder('screen')}>
        <ColorField label="Background color" value={s.background} onChange={(v) => patch('background', v)} />
        <Slider label="Curvature" value={s.curvature} min={0} max={1} step={0.01} format={fixed(0.01)} onChange={(v) => patch('curvature', v)} />
        <Slider label="Vignette" value={s.vignette} min={0} max={1} step={0.01} format={fixed(0.01)} onChange={(v) => patch('vignette', v)} />
      </Folder>

      <Folder title="Scanlines" icon={<ScanlinesIcon />} {...folder('scanlines')}>
        <Slider label="Intensity" value={s.scanlines.intensity} min={0} max={1} step={0.01} format={fixed(0.01)} onChange={(v) => patchIn('scanlines', 'intensity', v)} />
        <Slider label="Gap" value={s.scanlines.gap} min={1} max={8} step={0.5} format={(v) => px(v)} onChange={(v) => patchIn('scanlines', 'gap', v)} />
        <Toggle label="Flicker" value={s.scanlines.flicker} onChange={(v) => patchIn('scanlines', 'flicker', v)} />
      </Folder>

      <Folder title="Tint" icon={<TintIcon />} {...folder('tint')}>
        <Row label="Preset">
          <Select label="Tint preset" value={s.tint.preset} options={TINTS} onChange={(v) => patchIn('tint', 'preset', v)} />
        </Row>
        <Slider
          label="Strength"
          value={s.tint.strength}
          min={0}
          max={1}
          step={0.01}
          format={fixed(0.01)}
          disabled={s.tint.preset === 'default'}
          onChange={(v) => patchIn('tint', 'strength', v)}
        />
      </Folder>

      <Folder title="Bloom" icon={<BloomIcon />} {...folder('bloom')}>
        <Toggle label="Bloom" value={s.bloom.enabled} onChange={(v) => patchIn('bloom', 'enabled', v)} />
        <Slider label="Radius" value={s.bloom.radius} min={0} max={40} step={1} format={px} disabled={!s.bloom.enabled} onChange={(v) => patchIn('bloom', 'radius', v)} />
        <Slider label="Strength" value={s.bloom.strength} min={0} max={1} step={0.01} format={fixed(0.01)} disabled={!s.bloom.enabled} onChange={(v) => patchIn('bloom', 'strength', v)} />
        <Slider label="Threshold" value={s.bloom.threshold} min={0} max={1} step={0.01} format={fixed(0.01)} disabled={!s.bloom.enabled} onChange={(v) => patchIn('bloom', 'threshold', v)} />
      </Folder>

      <Folder title="Chromatic Aberration" icon={<AberrationIcon />} {...folder('aberration')}>
        <Slider
          label="Intensity"
          value={s.chromaticAberration.intensity}
          min={0}
          max={6}
          step={0.1}
          format={(v) => `${v.toFixed(1)}px`}
          onChange={(v) => patchIn('chromaticAberration', 'intensity', v)}
        />
      </Folder>

      <Folder title="Noise" icon={<NoiseIcon />} {...folder('noise')}>
        <Toggle label="Noise" value={s.noise.enabled} onChange={(v) => patchIn('noise', 'enabled', v)} />
        <Slider label="Static" value={s.noise.static} min={0} max={0.3} step={0.005} format={fixed(0.005)} disabled={!s.noise.enabled} onChange={(v) => patchIn('noise', 'static', v)} />
      </Folder>

      <Folder title="Persistence" icon={<PersistenceIcon />} {...folder('persistence')}>
        <Slider label="Strength" value={s.persistence.strength} min={0} max={0.5} step={0.01} format={fixed(0.01)} onChange={(v) => patchIn('persistence', 'strength', v)} />
      </Folder>

      <Folder title="Bezel" icon={<BezelIcon />} {...folder('bezel')}>
        <Toggle label="Bezel" value={s.bezel.enabled} onChange={(v) => patchIn('bezel', 'enabled', v)} />
        <ColorField label="Housing color" value={s.bezel.color} onChange={(v) => patchIn('bezel', 'color', v)} />
        <Slider label="Thickness" value={s.bezel.thickness} min={8} max={120} step={1} format={px} disabled={!s.bezel.enabled} onChange={(v) => patchIn('bezel', 'thickness', v)} />
        <Slider
          label="Outer radius"
          value={s.bezel.radius.outer}
          min={0}
          max={80}
          step={1}
          format={px}
          disabled={!s.bezel.enabled}
          onChange={(v) => patchIn('bezel', 'radius', { ...s.bezel.radius, outer: v })}
        />
        <Slider
          label="Screen radius"
          value={s.bezel.radius.screen}
          min={0}
          max={60}
          step={1}
          format={px}
          disabled={!s.bezel.enabled}
          onChange={(v) => patchIn('bezel', 'radius', { ...s.bezel.radius, screen: v })}
        />
        <Slider label="Bevel" value={s.bezel.bevel} min={0} max={1} step={0.01} format={fixed(0.01)} disabled={!s.bezel.enabled} onChange={(v) => patchIn('bezel', 'bevel', v)} />
        <Slider label="Light angle" value={s.bezel.lightAngle} min={0} max={360} step={1} format={(v) => `${v}°`} disabled={!s.bezel.enabled} onChange={(v) => patchIn('bezel', 'lightAngle', v)} />
        <Slider label="Inner lip" value={s.bezel.innerLip} min={0} max={1} step={0.01} format={fixed(0.01)} disabled={!s.bezel.enabled} onChange={(v) => patchIn('bezel', 'innerLip', v)} />
        <Slider label="Screen spill" value={s.bezel.screenSpill} min={0} max={1} step={0.01} format={fixed(0.01)} disabled={!s.bezel.enabled} onChange={(v) => patchIn('bezel', 'screenSpill', v)} />
        <Slider label="Glare" value={s.bezel.glare} min={0} max={1} step={0.01} format={fixed(0.01)} disabled={!s.bezel.enabled} onChange={(v) => patchIn('bezel', 'glare', v)} />
        <Toggle label="Drop shadow" value={s.bezel.shadow} onChange={(v) => patchIn('bezel', 'shadow', v)} />
      </Folder>

      <Folder title="Performance" icon={<PerformanceIcon />} {...folder('performance')}>
        <Segmented label="Renderer" value={s.renderer} options={renderers} onChange={(v) => patch('renderer', v)} className="w-full" />
        <Slider label="Max pixel ratio" value={s.maxPixelRatio} min={1} max={3} step={0.25} format={(v) => `${v}×`} onChange={(v) => patch('maxPixelRatio', v)} />
        <Toggle label="Pause when offscreen" value={s.pauseWhenOffscreen} onChange={(v) => patch('pauseWhenOffscreen', v)} />
        <Toggle label="Respect reduced motion" value={s.respectReducedMotion} onChange={(v) => patch('respectReducedMotion', v)} />
        <Toggle label="Respect Save-Data" value={s.respectSaveData} onChange={(v) => patch('respectSaveData', v)} />
      </Folder>
    </div>
  )
}
