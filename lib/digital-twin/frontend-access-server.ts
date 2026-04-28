import { cookies } from 'next/headers'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  getFrontendAccessCookieName,
  getFrontendAccessToken,
  isFrontendAccessConfigured,
} from './frontend-access'

const FRONTEND_ACCESS_SESSION_VERSION = 'v1'
const FRONTEND_ACCESS_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8

function signFrontendAccessSession(payload: string, secret: string) {
  return createHmac('sha256', `frontend-access:${secret}`).update(payload).digest('base64url')
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer)
}

export function getFrontendAccessSessionMaxAgeSeconds() {
  return FRONTEND_ACCESS_SESSION_MAX_AGE_SECONDS
}

export function resolveFrontendAccessCookieSecure({
  override = process.env.FRONTEND_ACCESS_COOKIE_SECURE,
  forwardedProto,
  forwarded,
  forwardedSsl,
}: {
  override?: string | null
  forwardedProto?: string | null
  forwarded?: string | null
  forwardedSsl?: string | null
} = {}): boolean {
  const normalizedOverride = override?.trim().toLowerCase()
  if (normalizedOverride === '1' || normalizedOverride === 'true') return true
  if (normalizedOverride === '0' || normalizedOverride === 'false') return false

  const firstProto = forwardedProto?.split(',')[0]?.trim().toLowerCase()
  if (firstProto === 'https') return true
  if (forwardedSsl?.trim().toLowerCase() === 'on') return true

  return /(?:^|[;,]\s*)proto=https(?:[;,]|$)/i.test(forwarded ?? '')
}

export function verifyFrontendAccessToken(candidate: unknown): boolean {
  const expectedToken = getFrontendAccessToken()
  if (!expectedToken || typeof candidate !== 'string') return false
  return safeEqual(candidate, expectedToken)
}

export function createFrontendAccessSession(now = Date.now()): string {
  const token = getFrontendAccessToken()
  if (!token) {
    throw new Error('FRONTEND_ACCESS_TOKEN is required for frontend access sessions')
  }

  const expiresAt = now + FRONTEND_ACCESS_SESSION_MAX_AGE_SECONDS * 1000
  const nonce = randomBytes(16).toString('base64url')
  const payload = `${FRONTEND_ACCESS_SESSION_VERSION}.${expiresAt}.${nonce}`
  const signature = signFrontendAccessSession(payload, token)
  return `${payload}.${signature}`
}

export function verifyFrontendAccessSession(session: string | undefined, now = Date.now()) {
  const token = getFrontendAccessToken()
  if (!token || !session) return false

  const [version, expiresAtRaw, nonce, signature, ...extra] = session.split('.')
  if (
    extra.length > 0 ||
    version !== FRONTEND_ACCESS_SESSION_VERSION ||
    !expiresAtRaw ||
    !nonce ||
    !signature
  ) {
    return false
  }

  const expiresAt = Number(expiresAtRaw)
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false

  const payload = `${version}.${expiresAtRaw}.${nonce}`
  return safeEqual(signature, signFrontendAccessSession(payload, token))
}

export async function hasFrontendAccess(): Promise<boolean> {
  if (!isFrontendAccessConfigured()) return false

  const cookieStore = await cookies()
  return verifyFrontendAccessSession(cookieStore.get(getFrontendAccessCookieName())?.value)
}

export function assertFrontendAccessConfigured() {
  if (!isFrontendAccessConfigured()) {
    throw new Error('FRONTEND_ACCESS_TOKEN is required for admin and realtime proxy access')
  }
}
