import { describe, expect, test } from 'bun:test'
import { Vector3 } from 'three'
import { CAMPUS_SECTORS } from '../../campus-layout'
import { createSectorStaticRenderRecipe } from '../../publish/static-recipes'
import type { PublishedStaticRenderNode } from '../../publish/types'
import {
  buildPublishedStaticRenderBatches,
  disposePublishedStaticRenderBatches,
} from './render-batches'

function countDrawNodes(nodes: PublishedStaticRenderNode[]): number {
  let count = 0

  for (const node of nodes) {
    if (node.kind === 'group') {
      count += countDrawNodes(node.children)
      continue
    }

    count += 1
  }

  return count
}

describe('runtime static render batches', () => {
  test('merges token-equivalent materials even when source roughness and metalness vary slightly', () => {
    const batches = buildPublishedStaticRenderBatches([
      {
        id: 'slab-a',
        kind: 'mesh',
        geometry: { kind: 'box', args: [2, 0.5, 2] },
        material: {
          token: 'slabAlt',
          metalness: 0.02,
          roughness: 0.98,
        },
        position: { x: -2, y: 0, z: 0 },
        receiveShadow: true,
      },
      {
        id: 'slab-b',
        kind: 'mesh',
        geometry: { kind: 'box', args: [2, 0.5, 2] },
        material: {
          token: 'slabAlt',
          metalness: 0.1,
          roughness: 0.9,
        },
        position: { x: 2, y: 0, z: 0 },
        receiveShadow: true,
      },
    ])

    expect(batches).toHaveLength(1)
    expect(batches[0]!.material).toMatchObject({
      token: 'slabAlt',
      metalness: 0.05,
      roughness: 0.95,
    })

    disposePublishedStaticRenderBatches(batches)
  })

  test('flattens nested group transforms into world-space merged geometry', () => {
    const batches = buildPublishedStaticRenderBatches([
      {
        id: 'root',
        kind: 'group',
        position: { x: 10, y: 0, z: 0 },
        children: [
          {
            id: 'child-box',
            kind: 'mesh',
            geometry: { kind: 'box', args: [2, 2, 2] },
            material: {
              token: 'slab',
              metalness: 0.1,
              roughness: 0.9,
            },
            position: { x: 1, y: 0, z: 0 },
          },
        ],
      },
    ])

    expect(batches).toHaveLength(1)
    batches[0]!.geometry.computeBoundingBox()
    const center = batches[0]!.geometry.boundingBox!.getCenter(new Vector3())

    expect(center.x).toBeCloseTo(11, 5)
    expect(center.y).toBeCloseTo(0, 5)
    expect(center.z).toBeCloseTo(0, 5)

    disposePublishedStaticRenderBatches(batches)
  })

  test('collapses a sector recipe into fewer runtime draw batches than raw draw nodes', () => {
    const recipe = createSectorStaticRenderRecipe(CAMPUS_SECTORS[0]!)
    const rawDrawNodes = countDrawNodes(recipe.detailed)
    const batches = buildPublishedStaticRenderBatches(recipe.detailed)

    expect(rawDrawNodes).toBeGreaterThan(0)
    expect(batches.length).toBeLessThan(rawDrawNodes)
    expect(batches.length).toBeLessThanOrEqual(24)

    disposePublishedStaticRenderBatches(batches)
  })
})
