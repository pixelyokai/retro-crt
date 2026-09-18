'use client'
import { motion, type HTMLMotionProps } from 'motion/react'
import { forwardRef, useSyncExternalStore } from 'react'
import { SPRING_PRESS } from '@/lib/motion'
import { useReduceMotion } from './useReduceMotion'

const HOVER_QUERY = '(hover: hover) and (pointer: fine)'
const subscribe = (cb: () => void) => {
  const mq = matchMedia(HOVER_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** Hover lift only where a real pointer can hover; touch devices would get it stuck on tap. */
function useCanHover(): boolean {
  return useSyncExternalStore(subscribe, () => matchMedia(HOVER_QUERY).matches, () => false)
}

type Props = HTMLMotionProps<'button'> & { pressScale?: number }

/** beUI's spring-pressed button: 0.93 on press, 1.02 on hover, one stiff spring for both. */
export const Pressable = forwardRef<HTMLButtonElement, Props>(function Pressable({ pressScale = 0.93, type = 'button', ...props }, ref) {
  const reduce = useReduceMotion()
  const canHover = useCanHover()
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={reduce ? undefined : { scale: pressScale }}
      whileHover={reduce || !canHover ? undefined : { scale: 1.02 }}
      transition={SPRING_PRESS}
      {...props}
    />
  )
})

type LinkProps = HTMLMotionProps<'a'>

export const PressableLink = forwardRef<HTMLAnchorElement, LinkProps>(function PressableLink(props, ref) {
  const reduce = useReduceMotion()
  const canHover = useCanHover()
  return (
    <motion.a
      ref={ref}
      whileTap={reduce ? undefined : { scale: 0.93 }}
      whileHover={reduce || !canHover ? undefined : { scale: 1.02 }}
      transition={SPRING_PRESS}
      {...props}
    />
  )
})
