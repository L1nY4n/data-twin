import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { StaticAssetInstance } from './types'

const OUTPUT_DIR = resolve(process.cwd(), 'public/generated/floorplans/jiazhuang-office')

function readJsonFile<T>(fileName: string): T {
  return JSON.parse(readFileSync(resolve(OUTPUT_DIR, fileName), 'utf-8')) as T
}

function computeOpeningPerpendicularDistance(
  opening: StaticAssetInstance,
  wall: StaticAssetInstance
) {
  const start = wall.metadata.wallStart as { x: number; z: number }
  const end = wall.metadata.wallEnd as { x: number; z: number }
  const deltaX = end.x - start.x
  const deltaZ = end.z - start.z
  const length = Math.hypot(deltaX, deltaZ)
  const normalX = -deltaZ / length
  const normalZ = deltaX / length
  const centerX = (start.x + end.x) / 2
  const centerZ = (start.z + end.z) / 2
  const offsetX = opening.position.x - centerX
  const offsetZ = opening.position.z - centerZ
  return Math.abs(offsetX * normalX + offsetZ * normalZ)
}

describe('DXF building-shell import output', () => {
  test('keeps authored asset counts in sync with the generated summary', () => {
    const assets = readJsonFile<StaticAssetInstance[]>('static-assets.json')
    const summary = readJsonFile<{
      assetCounts: { wall: number; door: number; window: number; total: number }
    }>('import-summary.json')

    const walls = assets.filter((asset) => asset.assetKind === 'wall-system')
    const doors = assets.filter((asset) => asset.assetKind === 'door-system')
    const windows = assets.filter((asset) => asset.assetKind === 'window-system')

    expect(walls.length).toBe(summary.assetCounts.wall)
    expect(doors.length).toBe(summary.assetCounts.door)
    expect(windows.length).toBe(summary.assetCounts.window)
    expect(assets.length).toBe(summary.assetCounts.total)
  })

  test('hosts every opening on an imported wall and keeps the host error bounded', () => {
    const assets = readJsonFile<StaticAssetInstance[]>('static-assets.json')
    const wallById = new Map(
      assets.filter((asset) => asset.assetKind === 'wall-system').map((asset) => [asset.id, asset])
    )
    const openings = assets.filter(
      (asset) => asset.assetKind === 'door-system' || asset.assetKind === 'window-system'
    )

    expect(openings.length).toBeGreaterThan(0)

    for (const opening of openings) {
      const hostId = opening.metadata.hostStaticAssetId
      expect(typeof hostId).toBe('string')
      const hostWall = wallById.get(hostId as string)
      expect(hostWall).toBeDefined()
      expect(opening.metadata.hostSurface).toBe('opening-center')
      expect(computeOpeningPerpendicularDistance(opening, hostWall!)).toBeLessThanOrEqual(0.5)
    }
  })

  test('preserves grounded GLB output for preview artifacts', () => {
    const sceneMetadata = readJsonFile<{
      final_bbox: { min_y: number }
      counts: { door_count: number; window_count: number }
    }>('scene-metadata.json')

    expect(sceneMetadata.final_bbox.min_y).toBe(0)
    expect(sceneMetadata.counts.door_count).toBeGreaterThan(0)
    expect(sceneMetadata.counts.window_count).toBeGreaterThan(0)
  })
})
