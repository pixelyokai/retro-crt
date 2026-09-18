'use client'
import { AnimatePresence, motion } from 'motion/react'
import { cloneElement, createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EASE_LEAVE, EASE_OUT, SPRING_RISE, SPRING_TIP_GLIDE, SPRING_WARM, TOOLTIP_CLOSE_MS, TOOLTIP_OPEN_MS, TOOLTIP_SKIP_MS } from '@/lib/motion'
import { useMounted } from './useMounted'
import { useReduceMotion } from './useReduceMotion'

type Side = 'top' | 'bottom'
const GAP = 8

interface Open {
  id: string
  content: ReactNode
  rect: DOMRect
  side: Side
  /** True when another tooltip in the group was open moments ago: no rise, just a glide. */
  warm: boolean
}

interface GroupApi {
  open: (entry: Omit<Open, 'warm'>) => void
  close: (id: string) => void
}

// Two contexts, because the API must stay referentially stable: if it changed as tooltips opened,
// every trigger's effects would re-run, including the cleanup that closes the tooltip again.
const GroupContext = createContext<GroupApi | null>(null)
const OpenIdContext = createContext<string | null>(null)

/**
 * interior.dev's tooltip group. One surface exists at a time: the first tooltip waits out the open
 * delay, and a neighbour hovered within the skip window inherits it, gliding across instead of
 * fading in again.
 */
export function TooltipGroup({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const warmUntil = useRef(0)
  const reduce = useReduceMotion()
  const mounted = useMounted()
  const surface = useRef<HTMLDivElement>(null)
  const [left, setLeft] = useState(0)

  useEffect(() => () => clearTimeout(timer.current), [])

  const api = useMemo<GroupApi>(
    () => ({
      open: (entry) => {
        clearTimeout(timer.current)
        const warm = Date.now() < warmUntil.current
        const show = () => setOpen({ ...entry, warm })
        if (warm) show()
        else timer.current = setTimeout(show, TOOLTIP_OPEN_MS)
      },
      close: (id) => {
        clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          setOpen((prev) => {
            if (prev && prev.id !== id) return prev
            if (prev) warmUntil.current = Date.now() + TOOLTIP_SKIP_MS
            return null
          })
        }, TOOLTIP_CLOSE_MS)
      },
    }),
    [],
  )

  // Centred on the trigger, then nudged so the surface never leaves the viewport.
  useLayoutEffect(() => {
    if (!open) return
    const width = surface.current?.offsetWidth ?? 0
    const centre = open.rect.left + open.rect.width / 2
    setLeft(Math.round(Math.max(GAP + width / 2, Math.min(centre, window.innerWidth - GAP - width / 2))))
  }, [open])

  const lift = open?.side === 'top' ? 6 : -6
  return (
    <GroupContext.Provider value={api}>
      <OpenIdContext.Provider value={open?.id ?? null}>{children}</OpenIdContext.Provider>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              // The surface is never keyed, so moving between triggers keeps the same element and
              // only this wrapper animates: that is the glide.
              <motion.div
                className="pointer-events-none fixed top-0 left-0 z-[120]"
                initial={false}
                animate={{ x: left, y: open.side === 'top' ? open.rect.top - GAP : open.rect.bottom + GAP }}
                transition={reduce || !open.warm ? { duration: 0 } : SPRING_TIP_GLIDE}
              >
                <div style={{ transform: open.side === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)' }}>
                  <motion.div
                    ref={surface}
                    id={open.id}
                    role="tooltip"
                    initial={reduce || open.warm ? { opacity: 0, scale: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, scale: 0.9, y: lift, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, scale: 0.96, y: lift * 0.35, filter: 'blur(2px)', transition: { duration: 0.12, ease: EASE_LEAVE } }}
                    transition={{ ...(open.warm ? SPRING_WARM : SPRING_RISE), opacity: { duration: 0.14, ease: EASE_OUT }, filter: { duration: 0.18, ease: EASE_OUT } }}
                    style={{ transformOrigin: open.side === 'top' ? 'center bottom' : 'center top' }}
                    className="max-w-64 rounded-md bg-neutral-700 px-2 py-1 text-xxs text-neutral-200 shadow-[0_1px_1px_-0.5px_#0000000a,0_3px_3px_-1.5px_#0000000a,0_6px_6px_-3px_#0000000a,0_12px_12px_-6px_#0000000a] outline outline-1 -outline-offset-1 outline-white/8"
                  >
                    {open.content}
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </GroupContext.Provider>
  )
}

interface TriggerProps {
  'aria-describedby'?: string
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  onFocus?: () => void
  onBlur?: () => void
}

/** Wraps one trigger. Without a `TooltipGroup` above it, or without content, it changes nothing. */
export function Tooltip({ content, side = 'bottom', children }: { content: ReactNode; side?: Side; children: ReactElement<TriggerProps> }) {
  const group = useContext(GroupContext)
  const openId = useContext(OpenIdContext)
  const id = useId()
  const anchor = useRef<HTMLSpanElement>(null)

  // The anchor span is `display: contents`, so the trigger itself carries the box to measure.
  const show = useCallback(() => {
    const rect = anchor.current?.firstElementChild?.getBoundingClientRect()
    if (rect && group) group.open({ id, content, rect, side })
  }, [group, id, content, side])
  const hide = useCallback(() => group?.close(id), [group, id])

  useEffect(() => hide, [hide])

  if (!group || !content) return children
  return (
    <span ref={anchor} className="contents">
      {cloneElement(children, {
        'aria-describedby': openId === id ? id : undefined,
        onPointerEnter: show,
        onPointerLeave: hide,
        onFocus: show,
        onBlur: hide,
      })}
    </span>
  )
}
