import { describe, expect, test } from 'bun:test'
import {
  resolveWallBaseSegments,
  resolveWallHostedOpenings,
  resolveWallSurfaceSegments,
} from './AuthoredStaticAssetLayer'
import type { StaticAssetInstance } from '@/lib/digital-twin/types'

function createAsset(
  overrides: Partial<StaticAssetInstance> & Pick<StaticAssetInstance, 'id' | 'assetKind' | 'name'>
): StaticAssetInstance {
  const now = Date.now()

  return {
    id: overrides.id,
    name: overrides.name,
    assetKind: overrides.assetKind,
    variant: overrides.variant,
    position: overrides.position ?? { x: 0, y: 0, z: 0 },
    rotation: overrides.rotation ?? { x: 0, y: 0, z: 0 },
    scale: overrides.scale ?? { x: 1, y: 1, z: 1 },
    visible: overrides.visible ?? true,
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

describe('authored static wall openings', () => {
  test('collects only door and window openings hosted by the wall', () => {
    const wall = createAsset({
      id: 'wall-1',
      name: '墙体',
      assetKind: 'wall-system',
      variant: 'solid-wall',
    })
    const door = createAsset({
      id: 'door-1',
      name: '门',
      assetKind: 'door-system',
      variant: 'single-swing',
      metadata: { hostStaticAssetId: 'wall-1' },
    })
    const window = createAsset({
      id: 'window-1',
      name: '窗',
      assetKind: 'window-system',
      variant: 'casement-window',
      position: { x: 1.5, y: 1.2, z: 0 },
      metadata: { hostStaticAssetId: 'wall-1' },
    })
    const reader = createAsset({
      id: 'reader-1',
      name: '门禁',
      assetKind: 'security-device',
      variant: 'access-reader',
      metadata: { hostStaticAssetId: 'wall-1' },
    })

    const openings = resolveWallHostedOpenings(wall, [wall, door, window, reader])

    expect(openings.map((opening) => opening.assetId)).toEqual(['door-1', 'window-1'])
    expect(openings[0]?.yStart).toBe(0)
    expect(openings[1]?.yStart).toBeGreaterThan(1)
  })

  test('splits wall surface segments around hosted openings', () => {
    const openings = [
      { assetId: 'door-1', xStart: -0.6, xEnd: 0.6, yStart: 0, yEnd: 2.3, kind: 'door-system' },
      {
        assetId: 'window-1',
        xStart: 1.1,
        xEnd: 2.3,
        yStart: 1.1,
        yEnd: 2.4,
        kind: 'window-system',
      },
    ] as const

    const segments = resolveWallSurfaceSegments(6, 3.2, [...openings], 0.08)

    expect(
      segments.some(
        (segment) =>
          Math.abs(segment.centerX) < 0.2 &&
          segment.centerY > 1 &&
          segment.centerY < 2
      )
    ).toBe(false)
    expect(
      segments.some(
        (segment) =>
          segment.centerX > 1.3 &&
          segment.centerX < 2.1 &&
          segment.centerY > 1.2 &&
          segment.centerY < 2.2
      )
    ).toBe(false)
    expect(segments.some((segment) => segment.centerX < -1.5)).toBe(true)
    expect(segments.some((segment) => segment.centerY > 2.6)).toBe(true)
  })

  test('removes base strips below hosted doors but keeps wall base elsewhere', () => {
    const baseSegments = resolveWallBaseSegments(6, [
      { assetId: 'door-1', xStart: -0.6, xEnd: 0.6, yStart: 0, yEnd: 2.3, kind: 'door-system' },
      {
        assetId: 'window-1',
        xStart: 1.1,
        xEnd: 2.3,
        yStart: 1.1,
        yEnd: 2.4,
        kind: 'window-system',
      },
    ])

    expect(baseSegments).toHaveLength(2)
    expect(baseSegments[0]?.centerX).toBeLessThan(0)
    expect(baseSegments[1]?.centerX).toBeGreaterThan(0)
    expect(baseSegments.every((segment) => segment.height === 0.08)).toBe(true)
  })
})
