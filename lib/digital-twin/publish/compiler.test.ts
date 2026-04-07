import { describe, expect, test } from 'bun:test'
import {
  CAMPUS_CAMERA_PRESETS,
  CAMPUS_LAYOUT_BLUEPRINTS,
  CAMPUS_SECTORS,
  DEFAULT_SCENE_COUNTS,
  PRODUCTION_SCENE_COUNTS,
} from '../campus-layout'
import { buildPublishedScenePackage, buildPublishedScenePackageFromSnapshot } from './compiler'
import { PUBLISHED_STATIC_ASSET_MANIFEST_URL } from './static-assets'

describe('buildPublishedScenePackage', () => {
  test('produces deterministic output for a fixed timestamp', () => {
    const generatedAt = '2026-04-03T06:26:12.000Z'

    expect(buildPublishedScenePackage({ generatedAt })).toEqual(
      buildPublishedScenePackage({ generatedAt })
    )
  })

  test('emits the expected layer families for each sector', () => {
    const published = buildPublishedScenePackage({
      generatedAt: '2026-04-03T06:26:12.000Z',
    })

    expect(published.sectors).toHaveLength(CAMPUS_SECTORS.length)
    expect(published.staticChunks.filter((chunk) => chunk.kind === 'sector')).toHaveLength(
      CAMPUS_SECTORS.length
    )
    expect(published.staticChunks.some((chunk) => chunk.kind === 'inter-sector')).toBe(true)
    expect(published.interactionLayers).toHaveLength(CAMPUS_SECTORS.length)
    expect(published.zoneOverlays).toEqual(published.interactionLayers)
    expect(published.dynamicLayers).toHaveLength(CAMPUS_SECTORS.length * 3)
    expect(published.routingLayers).toHaveLength(2)
  })

  test('preserves feature counts, camera presets, and scene count presets', () => {
    const published = buildPublishedScenePackage({
      generatedAt: '2026-04-03T06:26:12.000Z',
    })

    expect(
      published.staticChunks
        .filter((chunk) => chunk.kind === 'sector')
        .every((chunk) => chunk.featureCount === CAMPUS_LAYOUT_BLUEPRINTS.length)
    ).toBe(true)
    expect(published.cameraPresets.map((preset) => preset.id)).toEqual(
      CAMPUS_CAMERA_PRESETS.map((preset) => preset.id)
    )
    expect(published.staticAssetManifestUrl).toBe(PUBLISHED_STATIC_ASSET_MANIFEST_URL)
    expect(published.entityCounts.default).toEqual(DEFAULT_SCENE_COUNTS)
    expect(published.entityCounts.production).toEqual(PRODUCTION_SCENE_COUNTS)
  })

  test('allows the publish contract to point at a versioned static asset manifest', () => {
    const published = buildPublishedScenePackage({
      generatedAt: '2026-04-03T06:26:12.000Z',
      staticAssetManifestUrl: '/generated/published-static/versions/build-42/chunk-manifest.json',
    })

    expect(published.staticAssetManifestUrl).toBe(
      '/generated/published-static/versions/build-42/chunk-manifest.json'
    )
  })

  test('links each sector to one static chunk, one interaction layer, and three dynamic layers', () => {
    const published = buildPublishedScenePackage({
      generatedAt: '2026-04-03T06:26:12.000Z',
    })

    published.sectors.forEach((sector) => {
      expect(sector.staticChunkId).toBe(`chunk:${sector.id}:static`)
      expect(sector.interactionLayerIds).toEqual([`layer:${sector.id}:zones`])
      expect(sector.dynamicLayerIds).toEqual([
        `layer:${sector.id}:persons`,
        `layer:${sector.id}:vehicles`,
        `layer:${sector.id}:equipment`,
      ])
      expect(published.staticChunks.find((chunk) => chunk.id === sector.staticChunkId)).toBeDefined()
      expect(
        published.staticChunks.find((chunk) => chunk.id === sector.staticChunkId)?.runtimeMount.kind
      ).toBe('sector-cluster')
      expect(
        published.staticChunks.find((chunk) => chunk.id === sector.staticChunkId)?.runtimeMount.renderer
      ).toBe('campus-sector-cluster')
      expect(
        published.staticChunks.find((chunk) => chunk.id === sector.staticChunkId)?.renderRecipe.detailed
          .length
      ).toBeGreaterThan(0)
      expect(
        published.staticChunks.find((chunk) => chunk.id === sector.staticChunkId)?.renderRecipe.proxy
          ?.length
      ).toBeGreaterThan(0)
    })

    expect(
      published.staticChunks.find((chunk) => chunk.kind === 'inter-sector')?.runtimeMount.kind
    ).toBe('inter-sector-links')
    expect(
      published.staticChunks.find((chunk) => chunk.kind === 'inter-sector')?.runtimeMount.renderer
    ).toBe('campus-inter-sector-links')
    expect(
      published.staticChunks.find((chunk) => chunk.kind === 'inter-sector')?.renderRecipe.detailed
        .length
    ).toBeGreaterThan(0)
    expect(
      published.staticChunks.find((chunk) => chunk.kind === 'inter-sector')?.renderRecipe.proxy
    ).toBeUndefined()
  })

  test('can compile a published package directly from a backend working snapshot', () => {
    const published = buildPublishedScenePackageFromSnapshot(
      {
        sceneVersion: 7,
        sceneConfig: {
          id: 'ibms-demo-scene',
          name: 'IBMS 楼宇示例',
          gridSize: 80,
          gridDivisions: 80,
          backgroundColor: '#10151d',
          ambientLightIntensity: 0.6,
          showAxes: false,
          showGrid: true,
          cameraPosition: { x: 18, y: 14, z: 22 },
          cameraTarget: { x: 2, y: 0, z: -1 },
        },
        entities: [
          {
            id: 'person-1',
            type: 'person',
            name: '巡检员',
            position: { x: 4, y: 0, z: -2 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            status: 'active',
            visible: true,
            metadata: {},
            role: '巡检',
            department: '运维',
            schedule: [],
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: 'vehicle-1',
            type: 'vehicle',
            name: 'AGV 01',
            position: { x: 12, y: 0, z: 3 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            status: 'active',
            visible: true,
            metadata: {},
            plateNumber: '沪A00001',
            vehicleType: 'agv',
            speed: 0,
            heading: 0,
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: 'equipment-1',
            type: 'equipment',
            name: 'AHU 01',
            position: { x: -6, y: 0, z: 8 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            status: 'active',
            visible: true,
            metadata: {},
            parameters: {},
            alarms: [],
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: 'zone-1',
            type: 'zone',
            name: '大堂',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            status: 'active',
            visible: true,
            metadata: {},
            boundary: [
              { x: -10, y: 0, z: -6 },
              { x: 10, y: 0, z: -6 },
              { x: 10, y: 0, z: 6 },
              { x: -10, y: 0, z: 6 },
            ],
            zoneType: 'work',
            color: '#22c55e',
            accessRules: [],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        staticAssets: [
          {
            id: 'wall-1',
            name: '南墙',
            assetKind: 'wall-system',
            position: { x: 0, y: 0, z: -8 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            visible: true,
            metadata: {},
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      {
        generatedAt: '2026-04-07T01:02:03.000Z',
        staticAssetManifestUrl: '/generated/published-static/versions/build-7/chunk-manifest.json',
      }
    )

    expect(published.sceneId).toBe('ibms-demo-scene')
    expect(published.source).toBe('working-snapshot')
    expect(published.sceneConfig.name).toBe('IBMS 楼宇示例')
    expect(published.staticChunks).toHaveLength(1)
    expect(published.dynamicLayers).toHaveLength(3)
    expect(published.zoneOverlays).toHaveLength(1)
    expect(published.cameraPresets.map((preset) => preset.id)).toEqual([
      'snapshot-current',
      'top',
    ])
    expect(published.entityCounts.default).toEqual({
      persons: 1,
      vehicles: 1,
      equipment: 1,
    })
    expect(published.staticAssetManifestUrl).toBe(
      '/generated/published-static/versions/build-7/chunk-manifest.json'
    )
  })
})
