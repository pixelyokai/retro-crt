'use client'
import { useId, type ReactNode } from 'react'
import { Segmented } from '../ui/Segmented'

/** The Paper control row: a 36px outlined box with the label left and the control right. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-4 overflow-hidden rounded-sm px-3 outline outline-1 -outline-offset-1 outline-white/8">
      <span className="truncate text-xs text-neutral-400">{label}</span>
      {children}
    </div>
  )
}

const ON_OFF = [
  { value: 'on' as const, label: 'On' },
  { value: 'off' as const, label: 'Off' },
]

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={label}>
      <Segmented label={label} variant="bare" value={value ? 'on' : 'off'} options={ON_OFF} onChange={(v) => onChange(v === 'on')} className="-mr-1" />
    </Row>
  )
}

/**
 * The swatch chip from the Paper file. A native colour input sits on top of it at zero opacity, so
 * the OS picker does the work and there is no colour-picker dependency.
 */
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId()
  return (
    <Row label={label}>
      <label
        htmlFor={id}
        className="chip-inset relative flex items-center gap-1 rounded-xs bg-neutral-800 px-1.5 py-0.5 transition-colors hover:bg-neutral-700 focus-within:shadow-[inset_0_0_0_1px_var(--color-crt)]"
      >
        <span className="size-4 shrink-0 rounded-xs border border-white/10" style={{ background: value }} />
        <span className="px-0.5 text-xs text-neutral-300 uppercase">{value}</span>
        <input
          id={id}
          type="color"
          value={value}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </Row>
  )
}
