import { NextResponse, type NextRequest } from 'next/server'

/**
 * Strict CSP (§9.2). Next.js inlines its bootstrap scripts, so `script-src 'self'` alone would
 * block the app; a per-request nonce is the only way to stay strict without 'unsafe-inline'.
 * The dev-only relaxations (React's eval-based stack traces, Agentation's MCP endpoint) are gated
 * on NODE_ENV and can never reach a production build.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const dev = process.env.NODE_ENV === 'development'
  const csp = [
    "default-src 'self'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // A nonce here would disable 'unsafe-inline', which style attributes (Motion's transforms, the
    // effect's CSS variables) need. Fonts are self-hosted, so default-src 'self' covers them.
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self'${dev ? ' ws: http://localhost:4747' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join('; ')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    {
      // Static assets need no nonce, so they skip this entirely.
      source: '/((?!_next/static|_next/image|favicon.ico|icon.png|brand/|example\\.).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
