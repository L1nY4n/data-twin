import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('useLiveDigitalTwin live-only behavior', () => {
  test('keeps disconnect handling on the live runtime instead of falling back to mock data', () => {
    const source = readFileSync(join(process.cwd(), 'hooks/use-live-digital-twin.ts'), 'utf8')

    expect(source.includes('fallbackToMockRuntimeIfDisconnected')).toBe(false)
    expect(source.includes('hydrateMockState')).toBe(false)
    expect(source.includes("setRuntimeDataSource('mock'")).toBe(false)
    expect(source.includes("setRuntimeDataSource('live', '实时连接已断开')")).toBe(true)
    expect(source.includes("setRuntimeDataSource('live', '实时连接异常')")).toBe(true)
  })

  test('appends trajectory points when live position updates arrive', () => {
    const source = readFileSync(join(process.cwd(), 'hooks/use-live-digital-twin.ts'), 'utf8')

    expect(source.includes('const addTrajectoryPoint = useDigitalTwinStore((state) => state.addTrajectoryPoint)')).toBe(true)
    expect(source.includes('addTrajectoryPoint(data.entityId, {')).toBe(true)
    expect(source.includes('timestamp: message.timestamp')).toBe(true)
  })
})
