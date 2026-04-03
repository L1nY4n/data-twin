import { describe, expect, test } from 'bun:test'
import { buildPublishedScenePackage } from '../../publish/compiler'
import { createRuntimeStaticChunkRegistry } from './chunk-registry'

describe('runtime static chunk registry', () => {
  test('keeps published static chunk order and preserves proxy lod distances', () => {
    const pkg = buildPublishedScenePackage({
      generatedAt: '2026-04-03T06:26:12.000Z',
    })

    const registry = createRuntimeStaticChunkRegistry(pkg)

    expect(registry).toHaveLength(pkg.staticChunks.length)
    expect(registry.map((entry) => entry.id)).toEqual(pkg.staticChunks.map((chunk) => chunk.id))
    expect(registry.map((entry) => entry.lodDistance)).toEqual(
      pkg.staticChunks.map((chunk) => chunk.proxy.lodDistance)
    )
    expect(registry.every((entry) => entry.boundsSphere.radius > 0)).toBe(true)
  })

  test('turns package chunk mounts into runtime renderer registrations', () => {
    const pkg = buildPublishedScenePackage({
      generatedAt: '2026-04-03T06:26:12.000Z',
    })

    const registry = createRuntimeStaticChunkRegistry(pkg)
    const sectorEntries = registry.filter((entry) => entry.renderer === 'campus-sector-cluster')
    const linkEntry = registry.find((entry) => entry.renderer === 'campus-inter-sector-links')

    expect(sectorEntries).toHaveLength(pkg.sectors.length)
    expect(sectorEntries.every((entry) => entry.mountKind === 'sector-cluster')).toBe(true)
    expect(sectorEntries.every((entry) => entry.sector?.staticChunkId === entry.chunk.id)).toBe(true)
    expect(linkEntry?.mountKind).toBe('inter-sector-links')
    expect(linkEntry?.sector).toBeNull()
  })
})
