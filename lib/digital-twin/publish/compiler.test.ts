import { describe, expect, test } from 'bun:test'
import {
  CAMPUS_CAMERA_PRESETS,
  CAMPUS_LAYOUT_BLUEPRINTS,
  CAMPUS_SECTORS,
  DEFAULT_SCENE_COUNTS,
  PRODUCTION_SCENE_COUNTS,
} from '../campus-layout'
import { buildPublishedScenePackage } from './compiler'
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
})
