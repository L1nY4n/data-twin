import { describe, expect, test } from 'bun:test'
import { createStaticAssetsFromFloorPlanDetection } from './floor-plan-import'

describe('floor plan import', () => {
  test('maps wall and hosted opening detections into static assets', () => {
    const assets = createStaticAssetsFromFloorPlanDetection(
      {
        imageWidth: 100,
        imageHeight: 50,
        walls: [
          {
            start: { x: 10, y: 20 },
            end: { x: 90, y: 20 },
            orientation: 'horizontal',
            length: 80,
            thickness: 4,
          },
        ],
        doors: [
          {
            type: 'door',
            position: { x: 50, y: 20 },
            span: 10,
            orientation: 'horizontal',
            bounds: { minX: 45, minY: 18, maxX: 55, maxY: 22 },
          },
        ],
        windows: [
          {
            type: 'window',
            position: { x: 25, y: 20 },
            span: 12,
            orientation: 'horizontal',
            bounds: { minX: 19, minY: 18, maxX: 31, maxY: 22 },
          },
        ],
      },
      {
        position: { x: 0, y: 0, z: 0 },
        scaleMeters: 10,
      }
    )

    const wall = assets.find((asset) => asset.assetKind === 'wall-system')
    const door = assets.find((asset) => asset.assetKind === 'door-system')
    const window = assets.find((asset) => asset.assetKind === 'window-system')

    expect(wall).toBeDefined()
    expect(door?.metadata.hostStaticAssetId).toBe(wall?.id)
    expect(window?.metadata.hostStaticAssetId).toBe(wall?.id)
    expect(door?.metadata.hostSurface).toBe('opening-center')
    expect(window?.metadata.hostSurface).toBe('opening-center')
    expect(window?.position.y).toBe(1.2)
  })

  test('leaves openings unhosted when they are not close enough to a wall', () => {
    const assets = createStaticAssetsFromFloorPlanDetection(
      {
        imageWidth: 100,
        imageHeight: 50,
        walls: [
          {
            start: { x: 10, y: 20 },
            end: { x: 90, y: 20 },
            orientation: 'horizontal',
            length: 80,
            thickness: 4,
          },
        ],
        doors: [
          {
            type: 'door',
            position: { x: 50, y: 42 },
            span: 10,
            orientation: 'horizontal',
            bounds: { minX: 45, minY: 40, maxX: 55, maxY: 44 },
          },
        ],
        windows: [],
      },
      {
        position: { x: 0, y: 0, z: 0 },
        scaleMeters: 10,
      }
    )

    const door = assets.find((asset) => asset.assetKind === 'door-system')
    expect(door?.metadata.hostStaticAssetId).toBeNull()
    expect(door?.metadata.hostSurface).toBe('ground')
  })
})
