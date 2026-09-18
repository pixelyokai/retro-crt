import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { connection } from 'next/server'
import type { ReactNode } from 'react'
import { DevTools } from '@/components/DevTools'
import { Providers } from '@/components/Providers'
import 'retro-crt/styles.css'
import './globals.css'

// Both are the variable builds, so one file covers every weight the UI uses.
const cascadiaMono = localFont({
  src: './fonts/CascadiaMono.woff2',
  variable: '--font-cascadia-mono',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['ui-monospace', 'monospace'],
})

// Only code panels use it, so it stays out of the critical path.
const cascadiaCode = localFont({
  src: './fonts/CascadiaCode.woff2',
  variable: '--font-cascadia-code',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  fallback: ['ui-monospace', 'monospace'],
})

const DESCRIPTION = 'A CRT monitor effect your content renders inside. Tune it and export code, or apply it to your own image or video.'

/**
 * Open Graph images have to be absolute. Vercel exposes the production domain at build time, so a
 * deploy needs no configuration; NEXT_PUBLIC_SITE_URL overrides it for a custom domain.
 */
function siteUrl(): URL | undefined {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  const href = explicit ?? (vercel && `https://${vercel}`)
  try {
    return href ? new URL(href) : undefined
  } catch {
    return undefined
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: 'Retro-CRT', template: '%s · Retro-CRT' },
  description: DESCRIPTION,
  openGraph: { title: 'Retro-CRT', description: DESCRIPTION, type: 'website', images: [{ url: '/brand/og.png', width: 1200, height: 630, alt: 'Retro-CRT' }] },
  twitter: { card: 'summary_large_image', title: 'Retro-CRT', description: DESCRIPTION, creator: '@pixelyokai', images: ['/brand/og.png'] },
}

export const viewport: Viewport = { themeColor: '#000000', colorScheme: 'dark' }

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The CSP nonce is per request (proxy.ts), so every page renders dynamically.
  await connection()
  return (
    <html lang="en" className={`${cascadiaMono.variable} ${cascadiaCode.variable}`}>
      <body className="bg-black">
        <Providers>{children}</Providers>
        <DevTools />
      </body>
    </html>
  )
}
