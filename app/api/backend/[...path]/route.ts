import { NextRequest } from 'next/server'
import { hasFrontendAccess } from '@/lib/digital-twin/frontend-access-server'

const DEFAULT_INTERNAL_HTTP = 'http://127.0.0.1:4000'

type RouteContext = {
  params: Promise<{ path?: string[] }>
}

function backendBaseUrl() {
  return (process.env.BACKEND_HTTP_URL_INTERNAL || DEFAULT_INTERNAL_HTTP).replace(/\/$/, '')
}

function hasUnsafePathSegment(segments: string[]) {
  return segments.some(
    (segment) =>
      segment === '.' ||
      segment === '..' ||
      segment.includes('/') ||
      segment.includes('\\') ||
      /%2f|%5c/i.test(segment)
  )
}

const WORKSPACE_ADMIN_PROXY_ALLOWLIST = [
  /^\/api\/v1\/workspaces\/[^/]+\/editor\/bootstrap$/,
  /^\/api\/v1\/workspaces\/[^/]+\/scene$/,
  /^\/api\/v1\/workspaces\/[^/]+\/admin\/overview$/,
  /^\/api\/v1\/workspaces\/[^/]+\/publish$/,
  /^\/api\/v1\/workspaces\/[^/]+\/editor-save$/,
  /^\/api\/v1\/workspaces\/[^/]+\/entities(?:\/[^/]+)?(?:\/bindings)?$/,
  /^\/api\/v1\/workspaces\/[^/]+\/static-assets(?:\/[^/]+)?$/,
  /^\/api\/v1\/workspaces\/[^/]+\/data-sources(?:\/[^/]+)?$/,
  /^\/api\/v1\/workspaces\/[^/]+\/alarms$/,
  /^\/api\/v1\/workspaces\/[^/]+\/audit$/,
  /^\/api\/v1\/workspaces\/[^/]+\/rules(?:\/[^/]+)?(?:\/validate)?$/,
  /^\/api\/v1\/workspaces\/[^/]+\/modules(?:\/[^/]+)?$/,
]

function isAllowedProxyPath(pathname: string) {
  return (
    /^\/api\/v1\/admin(?:\/|$)/.test(pathname) ||
    WORKSPACE_ADMIN_PROXY_ALLOWLIST.some((pattern) => pattern.test(pathname))
  )
}

function responseHeaders(headers: Headers) {
  const nextHeaders = new Headers(headers)
  nextHeaders.delete('content-encoding')
  nextHeaders.delete('content-length')
  nextHeaders.delete('transfer-encoding')
  return nextHeaders
}

async function proxyBackendRequest(request: NextRequest, context: RouteContext) {
  if (!(await hasFrontendAccess())) {
    return Response.json({ error: 'frontend access is required' }, { status: 401 })
  }

  const params = await context.params
  const pathSegments = params.path ?? []
  if (hasUnsafePathSegment(pathSegments)) {
    return Response.json({ error: 'backend proxy path is not allowed' }, { status: 404 })
  }

  const adminToken = process.env.BACKEND_ADMIN_API_TOKEN?.trim()
  if (!adminToken) {
    return Response.json(
      { error: 'admin API proxy is disabled until BACKEND_ADMIN_API_TOKEN is configured' },
      { status: 503 }
    )
  }

  const targetUrl = new URL(`${backendBaseUrl()}/${pathSegments.join('/')}`)
  targetUrl.search = request.nextUrl.search
  if (!isAllowedProxyPath(targetUrl.pathname)) {
    return Response.json({ error: 'backend proxy path is not allowed' }, { status: 404 })
  }

  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.delete('content-length')
  headers.set('x-admin-api-token', adminToken)

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: 'manual',
    cache: 'no-store',
  })

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders(response.headers),
  })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyBackendRequest(request, context)
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyBackendRequest(request, context)
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyBackendRequest(request, context)
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyBackendRequest(request, context)
}
