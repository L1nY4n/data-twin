import { describe, expect, test } from 'bun:test'
import {
  createFrontendAccessSession,
  resolveFrontendAccessCookieSecure,
  verifyFrontendAccessSession,
  verifyFrontendAccessToken,
} from './frontend-access-server'

function withFrontendAccessToken(token: string, callback: () => void) {
  const original = process.env.FRONTEND_ACCESS_TOKEN
  process.env.FRONTEND_ACCESS_TOKEN = token
  try {
    callback()
  } finally {
    if (original === undefined) {
      delete process.env.FRONTEND_ACCESS_TOKEN
    } else {
      process.env.FRONTEND_ACCESS_TOKEN = original
    }
  }
}

describe('frontend access sessions', () => {
  test('exchanges the configured token for an opaque signed session', () => {
    withFrontendAccessToken('test-frontend-access-token', () => {
      const session = createFrontendAccessSession(1_000)

      expect(session.includes('test-frontend-access-token')).toBe(false)
      expect(verifyFrontendAccessToken('test-frontend-access-token')).toBe(true)
      expect(verifyFrontendAccessSession(session, 2_000)).toBe(true)
    })
  })

  test('rejects expired or tampered sessions', () => {
    withFrontendAccessToken('test-frontend-access-token', () => {
      const session = createFrontendAccessSession(1_000)
      const tampered = session.replace(/.$/, session.endsWith('a') ? 'b' : 'a')

      expect(verifyFrontendAccessSession(session, 1_000 + 60 * 60 * 8 * 1000 + 1)).toBe(false)
      expect(verifyFrontendAccessSession(tampered, 2_000)).toBe(false)
    })
  })

  test('keeps local http self-hosted access cookies usable unless https is explicit', () => {
    expect(resolveFrontendAccessCookieSecure({ override: 'false' })).toBe(false)
    expect(resolveFrontendAccessCookieSecure({ forwardedProto: 'http' })).toBe(false)
    expect(resolveFrontendAccessCookieSecure({ forwardedProto: 'https' })).toBe(true)
    expect(resolveFrontendAccessCookieSecure({ forwarded: 'for=127.0.0.1;proto=https' })).toBe(true)
    expect(resolveFrontendAccessCookieSecure({ forwardedSsl: 'on' })).toBe(true)
  })
})
