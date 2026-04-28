import { describe, expect, test } from 'bun:test'
import { createRuntimePublishedStaticFeatureRegistry } from '@/lib/digital-twin/runtime/static/features'
import { createPublishedCampusScenePackage } from '@/lib/digital-twin/publish/compiler'
import {
  createChunkBatches,
  createStaticFeaturePickTransform,
  isPickableStaticFeatureEntry,
} from './PublishedStaticFeaturePickingLayer'

describe('published static feature picking layer', () => {
  test('centers picking boxes on the vertical blueprint envelope instead of the ground plane', () => {
    const registry = createRuntimePublishedStaticFeatureRegistry(
      createPublishedCampusScenePackage('production', {
        generatedAt: '2026-04-28T08:00:00.000Z',
      })
    )
    const entries = registry.entries.filter(
      (entry) => entry.feature.kind === 'flare-stack' || entry.feature.kind === 'rail-spur'
    )

    expect(entries.length).toBeGreaterThanOrEqual(2)

    for (const entry of entries) {
      const transform = createStaticFeaturePickTransform(entry)
      const lowerY = transform.position[1] - transform.scale[1] / 2
      const upperY = transform.position[1] + transform.scale[1] / 2

      expect(lowerY).toBeCloseTo(entry.feature.center.y, 6)
      expect(upperY).toBeCloseTo(entry.feature.center.y + Math.max(entry.feature.height, 0.5), 6)
    }

    const batches = createChunkBatches(entries)
    expect(batches.flatMap((batch) => batch.transforms).map((transform) => transform.position[1])).toEqual(
      entries.map((entry) => entry.feature.center.y + Math.max(entry.feature.height, 0.5) / 2)
    )
  })

  test('omits the campus-wide inter-sector corridor descriptor from pick proxies', () => {
    const registry = createRuntimePublishedStaticFeatureRegistry(
      createPublishedCampusScenePackage('production', {
        generatedAt: '2026-04-28T08:00:00.000Z',
      })
    )
    const interSectorEntries = registry.entries.filter((entry) => entry.chunk.kind === 'inter-sector')

    expect(interSectorEntries.map((entry) => entry.feature.id)).toEqual([
      'campus:inter-sector-corridor',
    ])
    expect(interSectorEntries.every((entry) => !isPickableStaticFeatureEntry(entry))).toBe(true)
    expect(
      createChunkBatches(registry.entries).some((batch) =>
        batch.featureIds.includes('campus:inter-sector-corridor')
      )
    ).toBe(false)
  })
})
