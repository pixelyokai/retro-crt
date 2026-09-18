'use client'
import dynamic from 'next/dynamic'

// The NODE_ENV comparison is inlined at build time, so production drops the import entirely.
// Copy-paste mode (no `endpoint`) makes no network requests.
export const DevTools =
  process.env.NODE_ENV === 'development'
    ? dynamic(() => import('agentation').then((m) => m.Agentation), { ssr: false })
    : () => null
