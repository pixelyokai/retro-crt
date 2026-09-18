'use client'
import { AnimatePresence, motion } from 'motion/react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EASE_LEAVE, SPRING_SURFACE } from '@/lib/motion'
import { AlertIcon, CloseIcon, SuccessIcon } from './icons'
import { useMounted } from './useMounted'
import { useReduceMotion } from './useReduceMotion'

type Tone = 'success' | 'error'
interface ToastItem {
  id: number
  tone: Tone
  message: string
}

const ToastContext = createContext<((tone: Tone, message: string) => void) | null>(null)

export function useToast() {
  const push = useContext(ToastContext)
  if (!push) throw new Error('useToast must be used inside <ToastProvider>')
  return push
}

const DURATION_MS = 4000
const LIMIT = 3

const TONE = {
  success: { surface: 'bg-toast-success', text: 'text-crt', Icon: SuccessIcon },
  error: { surface: 'bg-toast-error', text: 'text-signal-red', Icon: AlertIcon },
} as const

/** The Paper toasts on interior.dev's surface spring. Swipe sideways or press × to dismiss. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const mounted = useMounted()
  const nextId = useRef(0)
  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), [])
  const push = useCallback((tone: Tone, message: string) => {
    setItems((all) => [{ id: nextId.current++, tone, message }, ...all].slice(0, LIMIT))
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      {mounted &&
        createPortal(
          <ol aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 left-4 z-[130] flex flex-col items-center gap-4 sm:left-auto sm:w-[440px]">
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((t) => (
                <ToastRow key={t.id} toast={t} onDismiss={dismiss} />
              ))}
            </AnimatePresence>
          </ol>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}

function ToastRow({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const reduce = useReduceMotion()
  const [hovered, setHovered] = useState(false)
  const { surface, text, Icon } = TONE[toast.tone]

  // Hovering pauses the timer so a message can be read to the end.
  useEffect(() => {
    if (hovered) return
    const t = setTimeout(() => onDismiss(toast.id), DURATION_MS)
    return () => clearTimeout(t)
  }, [hovered, onDismiss, toast.id])

  return (
    <motion.li
      layout
      role={toast.tone === 'error' ? 'alert' : 'status'}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96, filter: 'blur(8px)' }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 32, scale: 0.96, filter: 'blur(6px)', transition: { duration: 0.15, ease: EASE_LEAVE } }}
      transition={SPRING_SURFACE}
      drag={reduce ? false : 'x'}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.18}
      onDragEnd={(_, info) => (Math.abs(info.offset.x) > 72 || Math.abs(info.velocity.x) > 520) && onDismiss(toast.id)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={`pointer-events-auto flex w-full items-center gap-2 overflow-hidden rounded-md border border-white/16 p-3 will-change-transform ${surface}`}
    >
      <span className={`flex size-5 shrink-0 items-center justify-center ${text}`}>
        <Icon />
      </span>
      <p className={`min-w-0 flex-1 text-xs ${text}`}>{toast.message}</p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss(toast.id)}
        className="flex items-center justify-center rounded-md p-0.5 text-neutral-400 transition-colors hover:bg-white/8 hover:text-neutral-50"
      >
        <CloseIcon />
      </button>
    </motion.li>
  )
}
