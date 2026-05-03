import { describe, expect, test } from 'bun:test'
import { getBackendHttpBaseUrl, getBackendWsBaseUrl } from './backend-config'

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalHttpUrl = process.env.NEXT_PUBLIC_BACKEND_HTTP_URL
const originalWsUrl = process.env.NEXT_PUBLIC_BACKEND_WS_URL
const originalInternalUrl = process.env.BACKEND_HTTP_URL_INTERNAL

function setBrowserLocation({
  hostname,
  host = hostname,
  origin,
  protocol = 'http:',
  port = '',
}: {
  hostname: string
  host?: string
  origin: string
  protocol?: string
  port?: string
}) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        hostname,
        host,
        origin,
        protocol,
        port,
      },
    },
  })
}

function restoreEnv(name: 'NEXT_PUBLIC_BACKEND_HTTP_URL' | 'NEXT_PUBLIC_BACKEND_WS_URL' | 'BACKEND_HTTP_URL_INTERNAL', value: string | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name)
  } else {
    process.env[name] = value
  }
}

function restoreRuntime() {
  if (originalWindow) {
    Object.defineProperty(globalThis, 'window', originalWindow)
  } else {
    Reflect.deleteProperty(globalThis, 'window')
  }
  restoreEnv('NEXT_PUBLIC_BACKEND_HTTP_URL', originalHttpUrl)
  restoreEnv('NEXT_PUBLIC_BACKEND_WS_URL', originalWsUrl)
  restoreEnv('BACKEND_HTTP_URL_INTERNAL', originalInternalUrl)
}

function withRestoredRuntime(callback: () => void) {
  try {
    callback()
  } finally {
    restoreRuntime()
  }
}

describe('backend runtime URL resolution', () => {
  test('uses internal backend URL on the server', () => {
    withRestoredRuntime(() => {
      process.env.BACKEND_HTTP_URL_INTERNAL = 'http://127.0.0.1:4100/'
      process.env.NEXT_PUBLIC_BACKEND_HTTP_URL = 'http://8.136.225.27'

      expect(getBackendHttpBaseUrl()).toBe('http://127.0.0.1:4100')
    })
  })

  test('keeps localhost backend URLs for localhost browser development', () => {
    withRestoredRuntime(() => {
      setBrowserLocation({
        hostname: 'localhost',
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
      })
      process.env.NEXT_PUBLIC_BACKEND_HTTP_URL = 'http://localhost:4000'
      process.env.NEXT_PUBLIC_BACKEND_WS_URL = 'ws://localhost:4000'

      expect(getBackendHttpBaseUrl()).toBe('http://localhost:4000')
      expect(getBackendWsBaseUrl()).toBe('ws://localhost:4000')
    })
  })

  test('falls back to public page origin when a deployed browser bundle contains localhost backend URLs', () => {
    withRestoredRuntime(() => {
      setBrowserLocation({
        hostname: '8.136.225.27',
        origin: 'http://8.136.225.27',
      })
      process.env.NEXT_PUBLIC_BACKEND_HTTP_URL = 'http://localhost:4000'
      process.env.NEXT_PUBLIC_BACKEND_WS_URL = 'ws://localhost:4000'

      expect(getBackendHttpBaseUrl()).toBe('http://8.136.225.27')
      expect(getBackendWsBaseUrl()).toBe('ws://8.136.225.27')
    })
  })

  test('uses wss for https public page origin fallback', () => {
    withRestoredRuntime(() => {
      setBrowserLocation({
        hostname: 'demo.example.com',
        host: 'demo.example.com',
        origin: 'https://demo.example.com',
        protocol: 'https:',
      })
      process.env.NEXT_PUBLIC_BACKEND_WS_URL = 'ws://127.0.0.1:4000'

      expect(getBackendWsBaseUrl()).toBe('wss://demo.example.com')
    })
  })

  test('uses the public site root when a deployed bundle is opened on the standalone frontend port', () => {
    withRestoredRuntime(() => {
      setBrowserLocation({
        hostname: '8.136.225.27',
        host: '8.136.225.27:5000',
        origin: 'http://8.136.225.27:5000',
        port: '5000',
      })
      process.env.NEXT_PUBLIC_BACKEND_HTTP_URL = 'http://localhost:4000'
      process.env.NEXT_PUBLIC_BACKEND_WS_URL = 'ws://localhost:4000'

      expect(getBackendHttpBaseUrl()).toBe('http://8.136.225.27')
      expect(getBackendWsBaseUrl()).toBe('ws://8.136.225.27')
    })
  })
})
