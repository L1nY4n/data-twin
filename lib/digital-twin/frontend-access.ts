const FRONTEND_ACCESS_COOKIE = 'dt_frontend_access'

export function getFrontendAccessToken(): string {
  return process.env.FRONTEND_ACCESS_TOKEN?.trim() || ''
}

export function getFrontendAccessCookieName(): string {
  return FRONTEND_ACCESS_COOKIE
}

export function isFrontendAccessConfigured(): boolean {
  return getFrontendAccessToken().length > 0
}
