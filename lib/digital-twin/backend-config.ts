const DEFAULT_HTTP = 'http://localhost:4000'
const DEFAULT_INTERNAL_HTTP = 'http://127.0.0.1:4000'
const BACKEND_PROXY_PREFIX = '/api/backend'

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, '')
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]'
}

function configuredUrlUsesLoopbackHost(url: string): boolean {
  try {
    return isLoopbackHostname(new URL(url).hostname)
  } catch {
    return false
  }
}

function browserLocation(): Location | null {
  return typeof window === 'undefined' ? null : window.location
}

function resolveBrowserHttpBaseUrl(configuredUrl: string): string {
  const location = browserLocation()
  if (!location) return configuredUrl

  if (configuredUrlUsesLoopbackHost(configuredUrl) && !isLoopbackHostname(location.hostname)) {
    return location.origin
  }

  return configuredUrl
}

function resolveBrowserWsBaseUrl(configuredUrl: string): string {
  const location = browserLocation()
  if (!location) return configuredUrl

  if (configuredUrlUsesLoopbackHost(configuredUrl) && !isLoopbackHostname(location.hostname)) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${location.host}`
  }

  return configuredUrl
}

export function getBackendHttpBaseUrl(): string {
  const publicUrl = process.env.NEXT_PUBLIC_BACKEND_HTTP_URL || DEFAULT_HTTP
  const internalUrl = process.env.BACKEND_HTTP_URL_INTERNAL || DEFAULT_INTERNAL_HTTP
  const raw = typeof window === 'undefined' ? internalUrl : resolveBrowserHttpBaseUrl(publicUrl)
  return trimTrailingSlash(raw)
}

export function getBackendWsBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BACKEND_WS_URL
  if (configured && configured.length > 0) {
    return trimTrailingSlash(resolveBrowserWsBaseUrl(configured))
  }

  return getBackendHttpBaseUrl().replace(/^http/i, 'ws')
}

export function getBootstrapUrl(workspaceId: string): string {
  return `${getBackendHttpBaseUrl()}/api/v1/workspaces/${encodeURIComponent(workspaceId)}/runtime/bootstrap`
}

export function getRealtimeWsUrl(workspaceId: string): string {
  return `${getBackendWsBaseUrl()}/ws/workspaces/${encodeURIComponent(workspaceId)}/realtime`
}

export function getAdminApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return `${BACKEND_PROXY_PREFIX}/api/v1/admin`
  }
  return `${getBackendHttpBaseUrl()}/api/v1/admin`
}

export function getWorkspaceApiBaseUrl(workspaceId: string): string {
  if (typeof window !== 'undefined') {
    return `${BACKEND_PROXY_PREFIX}/api/v1/workspaces/${encodeURIComponent(workspaceId)}`
  }
  return `${getBackendHttpBaseUrl()}/api/v1/workspaces/${encodeURIComponent(workspaceId)}`
}

export function getWorkspaceModuleApiBaseUrl(
  workspaceId: string,
  moduleKey: string
): string {
  return `${getWorkspaceApiBaseUrl(workspaceId)}/modules/${encodeURIComponent(moduleKey)}`
}
