import type { NextConfig } from 'next'

// CSP is per-request (it carries a nonce), so it lives in proxy.ts. Everything static lives here.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-Frame-Options', value: 'DENY' },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  headers: async () => [{ source: '/:path*', headers: securityHeaders }],
  // The app used to live under /code and /upload; keep old links working.
  redirects: async () => [
    { source: '/code', destination: '/', permanent: true },
    { source: '/upload', destination: '/image', permanent: true },
  ],
}

export default nextConfig
