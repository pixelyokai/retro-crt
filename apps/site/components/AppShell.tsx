'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { Segmented } from './ui/Segmented'
import { useFps } from './useFps'

type Route = '/' | '/image'
const MODES = [
  { value: '/' as const, label: 'Code' },
  { value: '/image' as const, label: 'Image/Video' },
]

interface Props {
  stage: ReactNode
  /** The left half of the bar under the stage: preview tabs, or aspect ratios and Replace. */
  controls: ReactNode
  sidebar: ReactNode
}

/**
 * The Paper frame: a black page with a 6px gutter around one neutral-950 surface, the stage on the
 * left and a 440px control column on the right. Below `lg` the column drops under the stage, as in
 * the mobile artboards.
 */
export function AppShell({ stage, controls, sidebar }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const current: Route = pathname === '/image' ? '/image' : '/'

  return (
    <div className="flex h-dvh bg-black p-1.5">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-sm bg-neutral-950 shadow-[0_0_0_1px_rgb(255_255_255/0.12)] lg:flex-row">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col p-1.5 max-lg:h-[58dvh] max-lg:flex-none">
          <header className="flex shrink-0 items-center justify-between gap-3 p-4">
            <Link href="/" aria-label="Retro-CRT home" className="shrink-0 rounded-xs">
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size pixel art; optimisation would only soften it */}
              <img src="/brand/logo.png" alt="Retro-CRT" width={112} height={24} className="h-6 w-28 [image-rendering:pixelated]" />
            </Link>
            <nav aria-label="Mode">
              <Segmented label="Mode" value={current} options={MODES} onChange={(href) => router.push(href)} />
            </nav>
          </header>
          <section aria-label="Preview" className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4">
            {stage}
          </section>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4">
            {controls}
            <Fps />
          </div>
        </main>
        <aside aria-label="Effect controls" className="flex min-h-0 w-full p-1.5 max-lg:min-h-[260px] max-lg:flex-1 lg:w-[440px] lg:shrink-0">
          {sidebar}
        </aside>
      </div>
    </div>
  )
}

function Fps() {
  const fps = useFps()
  return (
    <span role="status" aria-live="off" className={`ml-auto shrink-0 text-xs tabular-nums ${fps !== null && fps < 50 ? 'text-amber-400' : 'text-neutral-400'}`}>
      {fps ?? '--'} FPS
    </span>
  )
}
