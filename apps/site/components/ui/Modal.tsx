'use client'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EASE_LEAVE, EASE_OUT, INSTANT, SPRING_SURFACE } from '@/lib/motion'
import { CloseIcon } from './icons'
import { Pressable } from './Pressable'
import { useMounted } from './useMounted'
import { useReduceMotion } from './useReduceMotion'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  description: ReactNode
  children: ReactNode
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])'

/**
 * The Paper export dialog, animated exactly like interior.dev's modal: the backdrop fades on a
 * tween while the panel rises 12px and settles on a surface spring. Focus is trapped and restored.
 */
export function Modal({ open, onClose, title, description, children }: Props) {
  const reduce = useReduceMotion()
  const mounted = useMounted()
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      if (e.key !== 'Tab' || !panel.current) return
      const nodes = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last?.focus())
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first?.focus())
    }
    document.addEventListener('keydown', onKey)
    const frame = requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus())
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [open, onClose])

  if (!mounted) return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-2 sm:items-center sm:p-4">
          <motion.div
            aria-hidden
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_LEAVE } }}
            className="absolute inset-0 bg-black/40 backdrop-blur-[14px] backdrop-saturate-[1.4]"
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
            animate={
              reduce
                ? { opacity: 1, transition: INSTANT }
                : { opacity: 1, scale: 1, y: 0, transition: { ...SPRING_SURFACE, opacity: { duration: 0.16, ease: EASE_OUT } } }
            }
            exit={reduce ? { opacity: 0, transition: INSTANT } : { opacity: 0, scale: 0.98, y: 6, transition: { duration: 0.15, ease: EASE_LEAVE } }}
            className="relative flex max-h-[calc(100dvh-16px)] w-full max-w-[480px] flex-col rounded-md bg-neutral-900 outline outline-1 -outline-offset-1 outline-white/10 will-change-transform"
          >
            <header className="relative flex flex-col gap-1 border-b border-white/10 p-4 pr-14">
              <h2 id={titleId} className="font-sans text-base font-medium text-neutral-50">
                {title}
              </h2>
              <p id={descId} className="text-sm text-neutral-400">
                {description}
              </p>
              <Pressable
                aria-label="Close"
                onClick={onClose}
                className="absolute top-3.5 right-3.5 flex size-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/8 hover:text-neutral-50"
              >
                <CloseIcon />
              </Pressable>
            </header>
            <div className="flex min-h-0 flex-col gap-4 p-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
