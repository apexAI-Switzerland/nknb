import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const res = NextResponse.next()

  // Security headers
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'no-referrer')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // Note: because layout injects an inline script for window.ENV, allow 'unsafe-inline'.
  // In development, Next.js dev runtime uses eval; relax CSP with 'unsafe-eval' and ws:.
  const isDev = process.env.NODE_ENV !== 'production' || req.nextUrl.hostname === 'localhost'
  const scriptSrc = ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])]
  const connectSrc = ["'self'", 'https://*.supabase.co', 'https://*.supabase.in', ...(isDev ? ['ws:', 'wss:'] : [])]
  const cspParts = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src ${connectSrc.join(' ')}`,
    "font-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]
  res.headers.set('Content-Security-Policy', cspParts.join('; '))

  // HSTS (enable only on HTTPS/prod)
  if (req.headers.get('x-forwarded-proto') === 'https') {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}


