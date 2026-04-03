import { describe, expect, test } from 'bun:test'
import { createPublishedCampusScenePackage } from './compiler'
import {
  createPublishedStaticAssetManifest,
  decodePublishedStaticMaterialName,
  decodePublishedStaticMeshName,
  encodePublishedStaticMaterialName,
  encodePublishedStaticMeshName,
  PUBLISHED_STATIC_ASSET_MANIFEST_URL,
} from './static-assets'

describe('published static assets', () => {
  test('builds deterministic chunk urls for every published static chunk', () => {
    const pkg = createPublishedCampusScenePackage('default', {
      generatedAt: '2026-04-03T06:26:12.000Z',
    })
    const manifest = createPublishedStaticAssetManifest(
      pkg.sceneId,
      pkg.generatedAt,
      pkg.staticChunks
    )

    expect(pkg.staticAssetManifestUrl).toBe(PUBLISHED_STATIC_ASSET_MANIFEST_URL)
    expect(Object.keys(manifest.chunks)).toEqual(pkg.staticChunks.map((chunk) => chunk.id))
    expect(manifest.chunks['chunk:sector-core:static']?.detailed.url).toContain(
      'chunk-sector-core-static.detailed.glb'
    )
    expect(manifest.chunks['chunk:sector-core:static']?.proxy?.url).toContain(
      'chunk-sector-core-static.proxy.glb'
    )
    expect(manifest.chunks['chunk:campus:inter-sector']?.proxy).toBeUndefined()
  })

  test('encodes and decodes static material and mesh metadata for glb round-tripping', () => {
    const materialName = encodePublishedStaticMaterialName({
      token: 'steel',
      metalness: 0.67,
      roughness: 0.35,
      emissiveToken: 'warning',
      emissiveIntensity: 0.4,
      opacity: 0.8,
      transparent: true,
    })
    const meshName = encodePublishedStaticMeshName({
      castShadow: true,
      receiveShadow: false,
    })

    expect(decodePublishedStaticMaterialName(materialName)).toEqual({
      token: 'steel',
      metalness: 0.67,
      roughness: 0.35,
      emissiveToken: 'warning',
      emissiveIntensity: 0.4,
      opacity: 0.8,
      transparent: true,
    })
    expect(decodePublishedStaticMeshName(meshName)).toEqual({
      castShadow: true,
      receiveShadow: false,
    })
  })
})
