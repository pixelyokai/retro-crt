'use client'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { SPRING_CELL } from '@/lib/motion'
import { Tooltip } from './Tooltip'
import { useReduceMotion } from './useReduceMotion'

export interface Segment<T extends string> {
  value: T
  label: string
  hint?: ReactNode
  disabled?: boolean
}

interface Props<T extends string> {
  label: string
  value: T
  options: readonly Segment<T>[]
  onChange: (value: T) => void
  /** `track` draws the recessed well from the Paper header; `bare` is the flat in-row variant. */
  variant?: 'track' | 'bare'
  className?: string
}

const CELL = 'px-3 py-0.5 text-center text-xs whitespace-nowrap'

/**
 * interior.dev's segmented control: the thumb slides on a spring while a second, inverted copy of
 * the labels rides inside it, so the selected label is revealed rather than cross-faded.
 */
export function Segmented<T extends string>({ label, value, options, onChange, variant = 'track', className = '' }: Props<T>) {
  const count = Math.max(1, options.length)
  const template = `repeat(${count}, minmax(0, 1fr))`
  const found = options.findIndex((o) => o.value === value)
  const index = found < 0 ? 0 : found
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const [hovered, setHovered] = useState(-1)
  const reduce = useReduceMotion()

  const pos = useMotionValue(index)
  const thumbX = useTransform(pos, (v) => `${v * 100}%`)
  const maskX = useTransform(pos, (v) => `${v * -100}%`)

  useEffect(() => {
    if (reduce) return void pos.set(index)
    const controls = animate(pos, index, SPRING_CELL)
    return () => controls.stop()
  }, [index, reduce, pos])

  const seek = useCallback(
    (from: number, dir: number) => {
      let i = from
      for (let k = 0; k < count; k++) {
        i = (i + dir + count) % count
        if (!options[i]?.disabled) return i
      }
      return from
    },
    [count, options],
  )

  const go = (i: number) => {
    const option = options[i]
    if (!option || option.disabled) return
    buttons.current[i]?.focus()
    onChange(option.value)
  }

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step) (e.preventDefault(), go(seek(i, step)))
    else if (e.key === 'Home') (e.preventDefault(), go(seek(count - 1, 1)))
    else if (e.key === 'End') (e.preventDefault(), go(seek(0, -1)))
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`relative inline-block select-none ${variant === 'track' ? 'rounded-sm border border-white/10 bg-black p-1 shadow-[0_0_0_2px_#000]' : ''} ${className}`}
    >
      <div className="relative grid" style={{ gridTemplateColumns: template, touchAction: 'manipulation' }}>
        {options.map((o, i) => (
          <span
            key={o.value}
            aria-hidden
            className={`${CELL} pointer-events-none transition-colors duration-150 ${
              o.disabled ? 'text-white/24' : hovered === i && i !== index ? 'text-white/88' : 'text-white/64'
            }`}
          >
            {o.label}
          </span>
        ))}

        <motion.div
          aria-hidden
          initial={false}
          style={{ width: `${100 / count}%`, x: thumbX }}
          className="chip-raised pointer-events-none absolute inset-y-0 left-0 overflow-hidden rounded-xs bg-neutral-700"
        >
          <motion.div initial={false} style={{ x: maskX }} className="absolute inset-0">
            <div className="absolute inset-y-0 left-0 grid" style={{ width: `${count * 100}%`, gridTemplateColumns: template }}>
              {options.map((o) => (
                <span key={o.value} className={`${CELL} text-white/88`}>
                  {o.label}
                </span>
              ))}
            </div>
          </motion.div>
        </motion.div>

        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: template }} onPointerLeave={() => setHovered(-1)}>
          {options.map((o, i) => (
            <Tooltip key={o.value} content={o.hint} side="top">
              <button
                ref={(node) => void (buttons.current[i] = node)}
                type="button"
                role="radio"
                aria-checked={i === index}
                aria-disabled={o.disabled || undefined}
                tabIndex={i === index ? 0 : -1}
                onClick={() => !o.disabled && onChange(o.value)}
                onKeyDown={(e) => onKeyDown(e, i)}
                onPointerEnter={() => !o.disabled && setHovered(i)}
                className="rounded-xs outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--color-crt)]"
              >
                <span className="sr-only">{o.label}</span>
              </button>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  )
}
