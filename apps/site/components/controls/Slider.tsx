'use client'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { SPRING_BOUNCY, SPRING_GLIDE, SPRING_TOSS } from '@/lib/motion'
import { useReduceMotion } from '../ui/useReduceMotion'

const HANDLE_START = 8
const HANDLE_END_INSET = 12
const TEXT_INSET = 12
/** Half the handle's overlap ramp: how far from a label the caps start splitting apart. */
const SPLIT_RAMP = 6

export interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  format?: (value: number) => string
  disabled?: boolean
}

const snap = (v: number, min: number, max: number, step: number) => {
  const steps = Math.round((Math.min(max, Math.max(min, v)) - min) / step)
  return Number((min + steps * step).toFixed(6))
}

/**
 * beUI's inline range slider in the Paper row: label and readout sit on the track, the fill glides
 * on a spring behind them, and the handle's caps split apart as it passes either piece of text.
 */
export function Slider({ label, value, min, max, step, onChange, format = String, disabled }: SliderProps) {
  const reduce = useReduceMotion()
  const track = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const readoutRef = useRef<HTMLSpanElement>(null)
  const [box, setBox] = useState({ width: 402, labelWidth: 60, readoutWidth: 32 })
  const [dragging, setDragging] = useState(false)
  // `grabbed` is false while the handle is still travelling to a click made elsewhere on the track.
  const gesture = useRef<{ id: number; left: number; offset: number; grabbed: boolean } | null>(null)
  const latest = useRef(onChange)
  latest.current = onChange
  // Dragging fires far faster than the screen repaints, and each commit re-renders the whole
  // panel and the effect, so moves are coalesced to one value per frame.
  const frame = useRef<number | null>(null)
  const pending = useRef<number | null>(null)
  const commit = useCallback((next: number) => {
    pending.current = next
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      if (pending.current !== null) latest.current(pending.current)
      pending.current = null
    })
  }, [])
  const flush = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    if (pending.current !== null) latest.current(pending.current)
    pending.current = null
  }, [])

  useLayoutEffect(() => {
    const nodes = [track.current, labelRef.current, readoutRef.current]
    if (nodes.some((n) => !n)) return
    const measure = () => {
      const width = track.current!.getBoundingClientRect().width
      if (!width) return
      const next = { width, labelWidth: labelRef.current!.offsetWidth, readoutWidth: readoutRef.current!.offsetWidth }
      setBox((prev) => (prev.width === next.width && prev.labelWidth === next.labelWidth && prev.readoutWidth === next.readoutWidth ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    nodes.forEach((n) => observer.observe(n!))
    return () => observer.disconnect()
  }, [])

  const endX = Math.max(HANDLE_START, box.width - HANDLE_END_INSET)
  const travel = endX - HANDLE_START
  const toX = useCallback((v: number) => HANDLE_START + ((v - min) / (max - min || 1)) * travel, [min, max, travel])
  const toValue = (x: number) => snap(min + ((x - HANDLE_START) / (travel || 1)) * (max - min), min, max, step)

  const handleX = useMotionValue(toX(value))
  const resting = useRef(handleX.get())

  // Outside a drag the handle springs to whatever the value became (reset, shuffle, keyboard).
  useLayoutEffect(() => {
    const target = toX(value)
    if (gesture.current || resting.current === target) return
    resting.current = target
    if (reduce) handleX.jump(target)
    else animate(handleX, target, SPRING_GLIDE)
  }, [value, toX, handleX, reduce])
  useEffect(
    () => () => {
      handleX.stop()
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    [handleX],
  )

  const fillX = useTransform(handleX, (x) => (x >= endX ? 0 : Math.min(x + 8, box.width - 2) - box.width + 2))

  // 0 → whole stem, 1 → fully split around a label the handle is sitting on top of.
  const split = useTransform(handleX, (x) => {
    const over = (start: number, end: number) => Math.max(0, Math.min(1, (x + 4 - start) / SPLIT_RAMP, (end - x) / SPLIT_RAMP))
    return Math.max(
      over(TEXT_INSET, TEXT_INSET + box.labelWidth),
      over(box.width - TEXT_INSET - box.readoutWidth, box.width - TEXT_INSET),
    )
  })
  const stemOpacity = useTransform(split, (s) => 1 - s)
  const capTop = useTransform(split, (s) => -s * 2)
  const capBottom = useTransform(split, (s) => s * 2)

  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.id !== e.pointerId) return
    gesture.current = null
    setDragging(false)
    flush()
    // Forget where it rested so the next value sync always springs it onto the exact step.
    resting.current = NaN
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  const nudge = (delta: number) => latest.current(snap(value + delta, min, max, step))

  return (
    <div
      ref={track}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0 || gesture.current) return
        const rect = e.currentTarget.getBoundingClientRect()
        if (!rect.width) return
        e.preventDefault()
        const pointerX = e.clientX - rect.left
        const grabbed = Math.abs(pointerX - handleX.get() - 2) <= 12
        const offset = grabbed ? pointerX - handleX.get() : 2
        gesture.current = { id: e.pointerId, left: rect.left, offset, grabbed }
        setDragging(true)
        handleX.stop()
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.querySelector<HTMLElement>('[role=slider]')?.focus({ preventScroll: true })
        const x = Math.min(endX, Math.max(HANDLE_START, pointerX - offset))
        // Grabbing the handle tracks the finger; clicking elsewhere throws the handle over to it.
        if (grabbed || reduce) handleX.set(x)
        else animate(handleX, x, SPRING_TOSS)
        commit(toValue(x))
      }}
      onPointerMove={(e) => {
        const active = gesture.current
        if (!active || active.id !== e.pointerId || disabled) return
        const x = Math.min(endX, Math.max(HANDLE_START, e.clientX - active.left - active.offset))
        if (!active.grabbed) {
          active.grabbed = true
          handleX.stop()
        }
        handleX.set(x)
        commit(toValue(x))
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      className={`group relative h-9 w-full touch-none overflow-hidden rounded-sm bg-white/8 transition-colors duration-150 select-none ${
        disabled ? 'pointer-events-none opacity-40' : 'cursor-grab hover:bg-white/12 active:cursor-grabbing'
      }`}
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-[2px] inset-y-0 overflow-hidden rounded-sm">
        <motion.div className="absolute inset-0 rounded-sm bg-white/8" style={{ x: fillX }} />
      </div>

      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-between px-3 text-xs text-neutral-400 transition-colors duration-150 group-hover:text-neutral-300">
        <span ref={labelRef} className="truncate">
          {label}
        </span>
        <span ref={readoutRef} className="tabular-nums">
          {format(value)}
        </span>
      </div>

      <motion.div aria-hidden className="pointer-events-none absolute top-1.5 left-0 h-6 w-1 text-neutral-300 transition-colors duration-150 group-hover:text-neutral-50" style={{ x: handleX }} animate={reduce ? undefined : { scaleY: dragging ? 1.35 : 1 }} transition={SPRING_BOUNCY}>
        <motion.span className="absolute top-0 size-1 rounded-full bg-current" style={{ y: reduce ? 0 : capTop }} />
        <motion.span className="absolute inset-y-0 w-1 rounded-full bg-current" style={{ opacity: stemOpacity }} />
        <motion.span className="absolute bottom-0 size-1 rounded-full bg-current" style={{ y: reduce ? 0 : capBottom }} />
      </motion.div>

      <button
        type="button"
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        aria-disabled={disabled || undefined}
        onKeyDown={(e) => {
          const big = (max - min) / 10
          const map: Record<string, number | undefined> = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: big, PageDown: -big }
          if (e.key === 'Home') return (e.preventDefault(), latest.current(min))
          if (e.key === 'End') return (e.preventDefault(), latest.current(max))
          const delta = map[e.key]
          if (delta !== undefined) (e.preventDefault(), nudge(delta))
        }}
        className="absolute inset-0 cursor-[inherit] touch-none rounded-sm border-0 outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--color-crt)]"
      />
    </div>
  )
}
