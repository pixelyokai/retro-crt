'use client'
import { motion, useMotionValueEvent, useScroll, useSpring, useTransform } from 'motion/react'
import { useRef, useState, type ReactNode } from 'react'
import { SPRING_SMOOTH } from '@/lib/motion'
import { Panel } from './controls/Panel'
import { GitHubLogo, ResetIcon, ShuffleIcon, XLogo } from './ui/icons'
import { Pressable, PressableLink } from './ui/Pressable'
import { Tooltip } from './ui/Tooltip'
import type { CrtStore } from './useCrt'
import { useReduceMotion } from './ui/useReduceMotion'

const iconButton = 'flex size-7 items-center justify-center rounded-sm transition-colors duration-150 hover:bg-white/8'

/** How far the panel scrolls before the header is fully lifted off the content. */
const LIFT_RANGE = 48

interface Props {
  store: CrtStore
  action: ReactNode
}

/**
 * The control column. The header is sticky and lifts the way interior.dev's sticky header does:
 * scroll progress drives a spring, and that spring fades in the hairline and the shadow under it.
 */
export function Sidebar({ store, action }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll({ container: scroller })
  const reduce = useReduceMotion()
  const tracked = useTransform(scrollY, [0, LIFT_RANGE], [0, 1], { clamp: true })
  const sprung = useSpring(tracked, SPRING_SMOOTH)
  const progress = reduce ? tracked : sprung
  const lifted = useTransform(progress, [0, 0.12], [0, 1], { clamp: true })
  const [scrolled, setScrolled] = useState(false)
  useMotionValueEvent(lifted, 'change', (v) => setScrolled((was) => (was === v > 0.5 ? was : v > 0.5)))

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[3px] bg-[#141414] outline outline-1 -outline-offset-1 outline-white/6">
      <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* Opaque, because it sits over scrolling content: #141414 with the header's own white/2 baked in. */}
        <header data-lifted={scrolled || undefined} className="sticky top-0 z-10 bg-[#191919] p-3">
          <div className="flex min-h-[30px] items-center">
            <div className="flex flex-1 items-center gap-3">
              <Tooltip content="Reset every control to its default">
                <Pressable aria-label="Reset to defaults" onClick={store.reset} className={`${iconButton} text-neutral-400 hover:text-neutral-200`}>
                  <ResetIcon />
                </Pressable>
              </Tooltip>
              <Tooltip content="Roll a random look">
                <Pressable aria-label="Shuffle the look" onClick={store.shuffle} className={`${iconButton} text-neutral-400 hover:text-neutral-200`}>
                  <ShuffleIcon />
                </Pressable>
              </Tooltip>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Tooltip content="Retro-CRT on X">
                  <PressableLink href="https://x.com/pixelyokai" target="_blank" rel="noopener noreferrer" aria-label="Retro-CRT on X" className={`${iconButton} text-neutral-200`}>
                    <XLogo />
                  </PressableLink>
                </Tooltip>
                <Tooltip content="Source on GitHub">
                  <PressableLink href="https://github.com/pixelyokai" target="_blank" rel="noopener noreferrer" aria-label="Source on GitHub" className={`${iconButton} text-neutral-200`}>
                    <GitHubLogo />
                  </PressableLink>
                </Tooltip>
              </div>
              {action}
            </div>
          </div>
          <motion.span aria-hidden style={{ opacity: lifted }} className="pointer-events-none absolute inset-x-0 top-full h-5 bg-gradient-to-b from-black/40 to-transparent" />
          <motion.span aria-hidden style={{ opacity: lifted }} className="pointer-events-none absolute inset-x-0 top-full h-px bg-white/8" />
        </header>
        <Panel store={store} />
      </div>
    </div>
  )
}

/** The Paper primary action: a green pill that sits beside the social links. */
export function PrimaryAction({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-xs bg-crt px-2 py-1 text-xs font-semibold text-crt-ink shadow-[0_0_0_1px_var(--color-neutral-950)] transition-[filter,opacity] duration-150 hover:brightness-110 disabled:opacity-40"
    >
      {icon}
      {label}
    </Pressable>
  )
}
