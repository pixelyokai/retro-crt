'use client'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { EASE_LEAVE, EASE_OUT, INSTANT, SPRING_CELL, SPRING_SLIDE, SPRING_SURFACE } from '@/lib/motion'
import { useMounted } from '../ui/useMounted'
import { CaretIcon, CheckIcon } from '../ui/icons'
import { useReduceMotion } from '../ui/useReduceMotion'

const ROW_H = 32
const MENU_W = 190
const GAP = 4

export interface SelectOption<T extends string> {
  value: T
  label: string
}

/**
 * The Paper select. The open menu carries interior.dev's dropdown highlight: one shared bar slides
 * between rows on a stiff spring instead of each row lighting up on its own.
 */
export function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly SelectOption<T>[]; onChange: (v: T) => void }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()
  const reduce = useReduceMotion()
  const mounted = useMounted()
  const selected = options.findIndex((o) => o.value === value)

  useLayoutEffect(() => {
    if (!open) return
    setRect(trigger.current?.getBoundingClientRect() ?? null)
    setActive(selected < 0 ? 0 : selected)
  }, [open, selected])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onPointerDown = (e: globalThis.PointerEvent) => {
      const target = e.target as Node
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  const pick = (i: number) => {
    const option = options[i]
    if (option) onChange(option.value)
    setOpen(false)
    trigger.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) (e.preventDefault(), setOpen(true))
      return
    }
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (step) return (e.preventDefault(), setActive((i) => (i + step + options.length) % options.length))
    if (e.key === 'Home') return (e.preventDefault(), setActive(0))
    if (e.key === 'End') return (e.preventDefault(), setActive(options.length - 1))
    if (e.key === 'Enter' || e.key === ' ') return (e.preventDefault(), pick(active))
    if (e.key === 'Escape' || e.key === 'Tab') (setOpen(false), trigger.current?.focus())
  }

  // Below the trigger, flipped above when there isn't room, and never past the right edge.
  const height = options.length * ROW_H + 8
  const below = rect ? rect.bottom + GAP : 0
  const top = rect && below + height > window.innerHeight - GAP ? Math.max(GAP, rect.top - GAP - height) : below
  const left = rect ? Math.max(GAP, Math.min(rect.right - MENU_W, window.innerWidth - MENU_W - GAP)) : 0

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className="chip-inset flex items-center gap-1 rounded-xs bg-neutral-800 py-0.5 pr-1.5 pl-2 text-xs text-neutral-300 transition-colors hover:bg-neutral-700"
      >
        <span className="px-0.5">{options.find((o) => o.value === value)?.label ?? value}</span>
        <motion.span animate={{ rotate: open ? -180 : 0 }} transition={reduce ? INSTANT : SPRING_CELL} className="flex">
          <CaretIcon />
        </motion.span>
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && rect && (
              <motion.div
                ref={menu}
                role="listbox"
                id={id}
                aria-label={label}
                tabIndex={-1}
                onKeyDown={onKeyDown}
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
                animate={reduce ? { opacity: 1, transition: INSTANT } : { opacity: 1, scale: 1, y: 0, transition: { ...SPRING_SURFACE, opacity: { duration: 0.14, ease: EASE_OUT } } }}
                exit={reduce ? { opacity: 0, transition: INSTANT } : { opacity: 0, scale: 0.98, transition: { duration: 0.12, ease: EASE_LEAVE } }}
                style={{ top, left, width: MENU_W, transformOrigin: 'top right' }}
                className="fixed z-[140] overflow-hidden rounded-sm bg-neutral-800 py-1 shadow-[0_12px_12px_-6px_#0000000a,0_0_0_1px_#ffffff14]"
                onPointerLeave={() => setActive(selected)}
              >
                <div className="relative px-1">
                  <motion.span
                    aria-hidden
                    initial={false}
                    animate={{ y: active < 0 ? 0 : active * ROW_H, opacity: active < 0 ? 0 : 1 }}
                    transition={reduce ? INSTANT : { ...SPRING_SLIDE, opacity: { duration: 0.1, ease: EASE_OUT } }}
                    className="pointer-events-none absolute inset-x-1 top-0 h-8 rounded-xs bg-white/6"
                  />
                  {options.map((o, i) => (
                    <button
                      key={o.value}
                      type="button"
                      role="option"
                      aria-selected={o.value === value}
                      onPointerEnter={() => setActive(i)}
                      onClick={() => pick(i)}
                      className="relative flex h-8 w-full items-center gap-1.5 rounded-xs px-1.5 text-left outline-none"
                    >
                      <span className="min-w-0 flex-1 truncate pr-1 pl-2 text-sm text-neutral-300">{o.label}</span>
                      <motion.span
                        aria-hidden
                        initial={false}
                        animate={{ opacity: o.value === value ? 1 : 0, scale: o.value === value ? 1 : 0.7 }}
                        transition={reduce ? INSTANT : SPRING_CELL}
                        className="flex size-5 shrink-0 items-center justify-center text-crt"
                      >
                        <CheckIcon />
                      </motion.span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}
