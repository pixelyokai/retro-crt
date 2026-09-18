'use client'
import { useReducedMotion } from 'motion/react'
import { useMounted } from './useMounted'

/**
 * `prefers-reduced-motion`, but false until after hydration. Motion's own hook reads the media
 * query on the first client render, which would disagree with the server and tear the tree.
 */
export function useReduceMotion(): boolean {
  const reduce = useReducedMotion()
  return useMounted() && !!reduce
}
