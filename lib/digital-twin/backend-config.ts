const DEFAULT_HTTP = 'http://localhost:4000'

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, '')
}

export function getBackendHttpBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_BACKEND_HTTP_URL || DEFAULT_HTTP
  return trimTrailingSlash(raw)
}

export function getBackendWsBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BACKEND_WS_URL
  if (configured && configured.length > 0) {
    return trimTrailingSlash(configured)
  }

  return getBackendHttpBaseUrl().replace(/^http/i, 'ws')
}

export function getBootstrapUrl(): string {
  return `${getBackendHttpBaseUrl()}/api/v1/site/bootstrap`
}

export function getRealtimeWsUrl(): string {
  return `${getBackendWsBaseUrl()}/ws/realtime`
}

export function getAdminApiBaseUrl(): string {
  return `${getBackendHttpBaseUrl()}/api/v1/admin`
}
