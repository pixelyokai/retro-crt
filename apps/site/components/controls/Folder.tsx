'use client'
import { AnimatePresence, motion } from 'motion/react'
import { useId, type ReactNode } from 'react'
import { EASE_OUT, INSTANT, SPRING_CELL } from '@/lib/motion'
import { CaretIcon } from '../ui/icons'
import { useReduceMotion } from '../ui/useReduceMotion'

interface Props {
  title: string
  icon: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}

/** One section of the sidebar: a header that turns its caret down, and a body that unrolls. */
export function Folder({ title, icon, open, onToggle, children }: Props) {
  const id = useId()
  const reduce = useReduceMotion()

  return (
    <section className="border-b border-white/8 px-3 py-3 last:border-b-0">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="group flex w-full items-center gap-4 rounded-xs py-1 pl-1 text-left"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex text-neutral-400 transition-colors group-hover:text-neutral-300">{icon}</span>
            <span className="truncate text-sm font-semibold text-neutral-300">{title}</span>
          </span>
          <motion.span
            aria-hidden
            animate={{ rotate: open ? 0 : -90 }}
            transition={reduce ? INSTANT : SPRING_CELL}
            className="flex size-5 shrink-0 items-center justify-center text-neutral-50"
          >
            <CaretIcon />
          </motion.span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduce ? INSTANT : { height: { duration: 0.24, ease: EASE_OUT }, opacity: { duration: 0.16, ease: EASE_OUT } }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 pt-3 pb-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
