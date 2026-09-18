'use client'
import { LayoutGroup, motion } from 'motion/react'
import { useId, type KeyboardEvent } from 'react'
import { SPRING_TABS } from '@/lib/motion'
import { useReduceMotion } from './useReduceMotion'

interface Props<T extends string> {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  controls?: string
}

/** beUI's underline tabs: one shared `layoutId` carries the rule from tab to tab. */
export function Tabs<T extends string>({ label, value, options, onChange, controls }: Props<T>) {
  const group = useId()
  const reduce = useReduceMotion()

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = options[(options.findIndex((o) => o.value === value) + step + options.length) % options.length]
    onChange(next.value)
    e.currentTarget.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus()
  }

  return (
    <LayoutGroup id={group}>
      {/* Wraps rather than scrolls: a hidden tab is a tab nobody finds. */}
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3">
        {options.map((o) => {
          const active = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              role="tab"
              data-value={o.value}
              data-autofocus={active ? '' : undefined}
              aria-selected={active}
              aria-controls={controls}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(o.value)}
              className={`relative isolate flex h-9 shrink-0 items-center px-0.5 text-sm transition-colors duration-150 ${active ? 'text-crt' : 'text-neutral-400 hover:text-neutral-200'}`}
            >
              {o.label}
              {active && <motion.span layoutId="rule" layout="position" transition={reduce ? { duration: 0 } : SPRING_TABS} className="absolute inset-x-0 -bottom-px h-0.5 bg-crt" />}
            </button>
          )
        })}
      </div>
    </LayoutGroup>
  )
}
