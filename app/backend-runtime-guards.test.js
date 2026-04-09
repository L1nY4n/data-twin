import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('backend runtime guards', () => {
  test('main page should boot live backend runtime hook instead of local simulation', () => {
    const source = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8')

    expect(source.includes('useLiveDigitalTwin')).toBe(true)
    expect(source.includes('useSimulation')).toBe(false)
    expect(source.includes('useCitationRuntime')).toBe(false)
    expect(source.includes('正在连接后端数据')).toBe(true)
  })

  test('live runtime hook should hydrate bootstrap and react to config_changed events', () => {
    const source = readFileSync(join(process.cwd(), 'hooks/use-live-digital-twin.ts'), 'utf8')

    expect(source.includes('fetchBootstrap')).toBe(true)
    expect(source.includes('loadPublishedScenePackage')).toBe(true)
    expect(source.includes('withVersionedPublishedScenePackage')).toBe(true)
    expect(source.includes('payload.publishedScene')).toBe(true)
    expect(source.includes('configChanged.publishedScene')).toBe(true)
    expect(source.includes('getRealtimeWsUrl')).toBe(true)
    expect(source.includes("case 'config_changed'")) .toBe(true)
    expect(source.includes('hydrateBootstrapState')).toBe(true)
    expect(source.includes('fallbackToMockRuntimeIfDisconnected')).toBe(false)
    expect(source.includes('hydrateMockState')).toBe(false)
    expect(source.includes('needsBootstrapResyncRef')).toBe(true)
  })

  test('backend config helper should expose bootstrap and admin API base urls', () => {
    const source = readFileSync(join(process.cwd(), 'lib/digital-twin/backend-config.ts'), 'utf8')

    expect(source.includes('getBootstrapUrl')).toBe(true)
    expect(source.includes('getAdminApiBaseUrl')).toBe(true)
    expect(source.includes('NEXT_PUBLIC_BACKEND_HTTP_URL')).toBe(true)
  })
})
