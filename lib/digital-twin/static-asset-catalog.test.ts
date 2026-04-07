import { describe, expect, test } from 'bun:test'
import {
  createStaticAssetTemplateFromCatalog,
  getStaticAssetCatalogItem,
  listStaticAssetCatalog,
  matchesStaticAssetCatalogDomain,
} from './static-asset-catalog'

describe('static asset catalog', () => {
  test('includes first-wave building, IBMS, and smart-home catalog entries', () => {
    const catalog = listStaticAssetCatalog()

    expect(catalog.some((item) => item.id === 'wall-system-solid-wall')).toBe(true)
    expect(catalog.some((item) => item.id === 'door-system-single-swing')).toBe(true)
    expect(catalog.some((item) => item.id === 'window-system-casement-window')).toBe(true)
    expect(catalog.some((item) => item.id === 'security-device-dome-camera')).toBe(true)
    expect(catalog.some((item) => item.id === 'smart-sensor-occupancy-sensor')).toBe(true)
    expect(catalog.some((item) => item.id === 'smart-control-smart-lock')).toBe(true)
  })

  test('supports domain filtering for compact catalog chips', () => {
    const item = getStaticAssetCatalogItem('security-device-dome-camera')

    expect(item).not.toBeNull()
    expect(matchesStaticAssetCatalogDomain(item!, 'ibms-device')).toBe(true)
    expect(matchesStaticAssetCatalogDomain(item!, 'building-shell')).toBe(false)
  })

  test('hydrates placement metadata and sensible default elevation from catalog items', () => {
    const wallMountedAsset = createStaticAssetTemplateFromCatalog('security-device-access-reader', {
      x: 2,
      y: 0,
      z: 4,
    })
    const ceilingMountedAsset = createStaticAssetTemplateFromCatalog(
      'smart-sensor-occupancy-sensor',
      {
        x: 6,
        y: 0,
        z: 8,
      }
    )
    const windowAsset = createStaticAssetTemplateFromCatalog('window-system-casement-window', {
      x: 10,
      y: 0,
      z: 12,
    })

    expect(wallMountedAsset.position.y).toBe(1.4)
    expect(ceilingMountedAsset.position.y).toBe(2.6)
    expect(windowAsset.position.y).toBe(1.2)
    expect(wallMountedAsset.metadata.domain).toBe('ibms-device')
    expect(wallMountedAsset.metadata.subcategory).toBe('access-control')
    expect(wallMountedAsset.metadata.placementMode).toBe('wall-mounted')
    expect(Array.isArray(wallMountedAsset.metadata.tags)).toBe(true)
  })

  test('preserves hosted placement rotation and metadata overrides', () => {
    const hostedDoor = createStaticAssetTemplateFromCatalog('door-system-single-swing', {
      position: { x: 4, y: 1.72, z: 6 },
      rotation: { x: 0, y: Math.PI / 2, z: 0 },
      elevationLocked: true,
      metadata: {
        hostStaticAssetId: 'static-asset-wall-1',
        hostSurface: 'opening-center',
      },
    })

    expect(hostedDoor.position.y).toBe(1.72)
    expect(hostedDoor.rotation.y).toBe(Math.PI / 2)
    expect(hostedDoor.metadata.hostStaticAssetId).toBe('static-asset-wall-1')
    expect(hostedDoor.metadata.hostSurface).toBe('opening-center')
  })

  test('preserves door-hosted smart-lock metadata overrides', () => {
    const hostedLock = createStaticAssetTemplateFromCatalog('smart-control-smart-lock', {
      position: { x: 3.32, y: 1.05, z: 6.14 },
      rotation: { x: 0, y: 0, z: 0 },
      elevationLocked: true,
      metadata: {
        hostStaticAssetId: 'door-1',
        hostSurface: 'door-face',
        hostDoorSide: 'right',
      },
    })

    expect(hostedLock.position.y).toBe(1.05)
    expect(hostedLock.metadata.hostStaticAssetId).toBe('door-1')
    expect(hostedLock.metadata.hostSurface).toBe('door-face')
    expect(hostedLock.metadata.hostDoorSide).toBe('right')
  })
})
