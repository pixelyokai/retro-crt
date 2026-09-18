'use client'
import type { ReactNode } from 'react'
import { ToastProvider } from './ui/Toast'
import { TooltipGroup } from './ui/Tooltip'

/** Toasts and the shared tooltip surface live above the routes so both modes share one of each. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <TooltipGroup>{children}</TooltipGroup>
    </ToastProvider>
  )
}
