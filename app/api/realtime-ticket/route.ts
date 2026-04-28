import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { getFrontendAccessCookieName } from '@/lib/digital-twin/frontend-access'

const DEFAULT_INTERNAL_HTTP = 'http://127.0.0.1:4000'
const TICKET_REQUEST_WINDOW_MS = 10_000
const MAX_TICKET_REQUESTS_PER_WINDOW = 60
const ticketRequestsByScope = new Map<string, number[]>()

function backendBaseUrl() {
  return (process.env.BACKEND_HTTP_URL_INTERNAL || DEFAULT_INTERNAL_HTTP).replace(/\/$/, '')
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function hashTicketScope(session: string | undefined) {
  return createHash('sha256')
    .update(session || 'anonymous-runtime-viewer')
    .digest('base64url')
    .slice(0, 32)
}

function firstHeaderValue(value: string | null) {
  return value?.split(',')[0]?.trim() || ''
}

function resolvePublicRuntimeTicketScope(request: NextRequest, session: string | undefined) {
  if (session) return `session:${session}`

  const forwardedFor = firstHeaderValue(request.headers.get('x-forwarded-for'))
  const realIp = firstHeaderValue(request.headers.get('x-real-ip'))
  const origin = request.headers.get('origin')?.trim() || ''
  const referer = request.headers.get('referer')?.trim() || ''
  const userAgent = request.headers.get('user-agent')?.trim() || ''
  return `public:${forwardedFor || realIp || origin || referer || 'anonymous'}:${userAgent.slice(0, 120)}`
}

function recordTicketRequest(scope: string, now = Date.now()) {
  const windowStart = now - TICKET_REQUEST_WINDOW_MS
  for (const [key, requests] of ticketRequestsByScope) {
    const retained = requests.filter((recordedAt) => recordedAt >= windowStart)
    if (retained.length === 0) {
      ticketRequestsByScope.delete(key)
    } else if (retained.length !== requests.length) {
      ticketRequestsByScope.set(key, retained)
    }
  }

  const requests = ticketRequestsByScope.get(scope) ?? []
  if (requests.length >= MAX_TICKET_REQUESTS_PER_WINDOW) {
    return false
  }
  requests.push(now)
  ticketRequestsByScope.set(scope, requests)
  return true
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const session = cookieStore.get(getFrontendAccessCookieName())?.value
  const ticketScope = hashTicketScope(resolvePublicRuntimeTicketScope(request, session))
  if (!recordTicketRequest(ticketScope)) {
    return Response.json({ error: 'realtime ticket rate limit exceeded' }, { status: 429 })
  }

  const realtimeToken = process.env.BACKEND_REALTIME_ACCESS_TOKEN?.trim()
  if (!realtimeToken) {
    return Response.json(
      { error: 'realtime ticket minting is disabled until BACKEND_REALTIME_ACCESS_TOKEN is configured' },
      { status: 503 }
    )
  }

  const response = await fetch(`${backendBaseUrl()}/api/v1/realtime/ticket`, {
    method: 'POST',
    headers: {
      'x-realtime-access-token': realtimeToken,
      'x-realtime-ticket-scope': ticketScope,
    },
    cache: 'no-store',
  })

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    statusText: response.statusText,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
    },
  })
}
