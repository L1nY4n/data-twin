import { describe, expect, test } from 'bun:test'
import {
  CAMPUS_BOUNDS,
  CAMPUS_CAMERA_PRESETS,
  CAMPUS_DISTRICTS,
  CAMPUS_LAYOUT_BLUEPRINTS,
  CAMPUS_SECTORS,
  DEFAULT_SCENE_COUNTS,
  PRODUCTION_SCENE_COUNTS,
} from '../campus-layout'
import {
  buildPublishedCampusScenePackageFromSnapshot,
  buildPublishedScenePackageForScope,
  buildPublishedScenePackage,
  buildPublishedScenePackageFromSnapshot,
} from './compiler'
import { PUBLISHED_STATIC_ASSET_MANIFEST_URL } from './static-assets'
import type { PublishedSceneBounds } from './types'

function boundsContainXZ(outer: PublishedSceneBounds, inner: PublishedSceneBounds) {
  return (
    inner.min.x >= outer.min.x &&
    inner.max.x <= outer.max.x &&
    inner.min.z >= outer.min.z &&
    inner.max.z <= outer.max.z
  )
}

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

    expect(CAMPUS_SECTORS.length).toBeGreaterThanOrEqual(24)
    expect(
      published.staticChunks
        .filter((chunk) => chunk.kind === 'sector')
        .every((chunk) => chunk.featureCount === CAMPUS_LAYOUT_BLUEPRINTS.length)
    ).toBe(true)
    expect(CAMPUS_SECTORS.length * CAMPUS_LAYOUT_BLUEPRINTS.length).toBeGreaterThanOrEqual(960)
    expect(published.cameraPresets.map((preset) => preset.id)).toEqual(
      CAMPUS_CAMERA_PRESETS.map((preset) => preset.id)
    )
    expect(published.cameraPresets.map((preset) => preset.id)).toEqual(
      expect.arrayContaining(['energy-north', 'rail-logistics', 'southeast-rd'])
    )
    const topPreset = published.cameraPresets.find((preset) => preset.id === 'top')
    const campusExtent = Math.max(
      CAMPUS_BOUNDS.max.x - CAMPUS_BOUNDS.min.x,
      CAMPUS_BOUNDS.max.z - CAMPUS_BOUNDS.min.z
    )
    expect(topPreset?.position.y).toBeGreaterThanOrEqual(campusExtent * 0.85)
    expect(topPreset?.target).toEqual({
      x: (CAMPUS_BOUNDS.min.x + CAMPUS_BOUNDS.max.x) / 2,
      y: 0,
      z: (CAMPUS_BOUNDS.min.z + CAMPUS_BOUNDS.max.z) / 2,
    })
    expect(published.staticAssetManifestUrl).toBe(PUBLISHED_STATIC_ASSET_MANIFEST_URL)
    expect(published.entityCounts.default).toEqual(DEFAULT_SCENE_COUNTS)
    expect(published.entityCounts.production).toEqual(PRODUCTION_SCENE_COUNTS)
  })

  test('publishes campus bounds that cover every sector and the inter-sector chunk', () => {
    const published = buildPublishedScenePackage({
      generatedAt: '2026-04-03T06:26:12.000Z',
    })
    const interSectorChunk = published.staticChunks.find((chunk) => chunk.kind === 'inter-sector')

    expect(published.bounds.min.x).toBe(CAMPUS_BOUNDS.min.x)
    expect(published.bounds.min.z).toBe(CAMPUS_BOUNDS.min.z)
    expect(published.bounds.max.x).toBe(CAMPUS_BOUNDS.max.x)
    expect(published.bounds.max.z).toBe(CAMPUS_BOUNDS.max.z)
    for (const sector of published.sectors) {
      expect(boundsContainXZ(published.bounds, sector.bounds)).toBe(true)
    }

    if (!interSectorChunk) throw new Error('inter-sector chunk missing')
    expect(boundsContainXZ(published.bounds, interSectorChunk.bounds)).toBe(true)
    expect(interSectorChunk.features[0]?.center.y).toBe(0)
    expect(interSectorChunk.features[0]?.districtName).toBe('园区互联')
    expect(interSectorChunk.features[0]?.width).toBe(
      CAMPUS_BOUNDS.max.x - CAMPUS_BOUNDS.min.x
    )
    expect(interSectorChunk.features[0]?.depth).toBe(
      CAMPUS_BOUNDS.max.z - CAMPUS_BOUNDS.min.z
    )
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

    const districtNameById = new Map(CAMPUS_DISTRICTS.map((district) => [district.id, district.name]))
    const sectorFeature = published.staticChunks.find((chunk) => chunk.kind === 'sector')?.features[0]
    expect(sectorFeature?.districtName).toBe(districtNameById.get(sectorFeature?.districtId ?? ''))
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

  test('can compile a campus-based published package from a backend snapshot without shrinking the large map', () => {
    const published = buildPublishedCampusScenePackageFromSnapshot(
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
          cameraPosition: { x: 318, y: 14, z: 22 },
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
            id: 'vehicle-truck-1',
            type: 'vehicle',
            name: '槽车 01',
            position: { x: 12, y: 0, z: 60 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            status: 'active',
            visible: true,
            metadata: {},
            plateNumber: '沪A00001',
            vehicleType: 'truck',
            speed: 0,
            heading: 0,
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: 'zone-1',
            type: 'zone',
            name: '装车区',
            position: { x: 0, y: 0, z: 60 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            status: 'active',
            visible: true,
            metadata: {},
            boundary: [
              { x: -20, y: 0, z: 48 },
              { x: 20, y: 0, z: 48 },
              { x: 20, y: 0, z: 72 },
              { x: -20, y: 0, z: 72 },
            ],
            zoneType: 'work',
            color: '#22c55e',
            accessRules: [],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        staticAssets: [],
      },
      {
        staticAssetManifestUrl: '/generated/published-static/versions/build-99/chunk-manifest.json',
      }
    )

    expect(published.sceneId).toBe('ibms-demo-scene')
    expect(published.source).toBe('working-snapshot')
    expect(published.sectors.length).toBeGreaterThan(1)
    expect(published.staticChunks.length).toBeGreaterThan(1)
    expect(published.routingLayers.length).toBeGreaterThan(0)
    expect(published.entityCounts.default.vehicles).toBe(1)
    expect(published.entityCounts.default.persons).toBe(1)
    expect(
      published.interactionLayers.some((layer) =>
        layer.kind === 'zones' && layer.zones.some((zone) => zone.id === 'zone-1')
      )
    ).toBe(true)
  })

  test('workspace-scope snapshot exports do not inherit campus sectors or campus dynamic layers', () => {
    const published = buildPublishedScenePackageForScope(
      {
        sceneVersion: 3,
        sceneConfig: {
          id: 'workspace-jiazhuang',
          name: '加庄办公室',
          gridSize: 60,
          gridDivisions: 30,
          backgroundColor: '#0a0a0f',
          ambientLightIntensity: 0.52,
          showAxes: false,
          showGrid: true,
          cameraPosition: { x: 16, y: 20, z: 22 },
          cameraTarget: { x: 0, y: 0, z: 0 },
        },
        entities: [],
        staticAssets: [],
      },
      {
        scope: 'workspace',
        staticAssetManifestUrl:
          '/generated/published-static/workspaces/jiazhuang-office/versions/build-1/chunk-manifest.json',
      }
    )

    expect(published.sceneId).toBe('workspace-jiazhuang')
    expect(published.source).toBe('working-snapshot')
    expect(published.sectors).toHaveLength(1)
    expect(published.sectors[0]?.name).toBe('加庄办公室')
    expect(published.staticChunks).toHaveLength(1)
    expect(published.dynamicLayers).toHaveLength(3)
    expect(published.sectors.some((sector) => sector.id === 'sector-east')).toBe(false)
    expect(published.dynamicLayers.some((layer) => layer.id.includes('sector-east'))).toBe(false)
  })
})
