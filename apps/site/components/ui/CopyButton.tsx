'use client'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { DRAW, INSTANT, SPRING_CROSSFADE } from '@/lib/motion'
import { CheckIcon, CloseIcon, CopyIcon } from './icons'
import { Pressable } from './Pressable'
import { Tooltip } from './Tooltip'
import { useReduceMotion } from './useReduceMotion'

type Status = 'idle' | 'copied' | 'failed'
const RESET_MS = 1600

const LABEL: Record<Status, string> = { idle: 'Copy', copied: 'Copied', failed: "Couldn't copy" }

/**
 * interior.dev's copy button: three icons stacked in one grid cell, each fading and scaling on the
 * same crossfade spring, so the glyph reads as morphing rather than swapping.
 */
export function CopyButton({ text, label = 'Copy', onResult }: { text: string; label?: string; onResult?: (ok: boolean) => void }) {
  const [status, setStatus] = useState<Status>('idle')
  const reduce = useReduceMotion()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      ok = false
    }
    setStatus(ok ? 'copied' : 'failed')
    onResult?.(ok)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus('idle'), RESET_MS)
  }

  const cell = (state: Status, children: React.ReactNode, tint = '') => (
    <motion.span
      aria-hidden
      className={`col-start-1 row-start-1 flex ${tint}`}
      initial={false}
      animate={{ opacity: status === state ? 1 : 0, scale: status === state ? 1 : 0.92 }}
      transition={reduce ? INSTANT : { ...SPRING_CROSSFADE, opacity: reduce ? INSTANT : DRAW }}
    >
      {children}
    </motion.span>
  )

  return (
    <Tooltip content={LABEL[status]} side="top">
      <Pressable
        aria-label={label}
        onClick={copy}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors duration-150 hover:bg-white/8 hover:text-neutral-50"
      >
        <span className="grid">
          {cell('idle', <CopyIcon />)}
          {cell('copied', <CheckIcon />, 'text-crt')}
          {cell('failed', <CloseIcon />, 'text-signal-red')}
        </span>
      </Pressable>
    </Tooltip>
  )
}
