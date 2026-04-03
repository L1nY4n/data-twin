import { describe, expect, test } from 'bun:test'
import { CAMPUS_SECTORS } from '../campus-layout'
import {
  createInterSectorStaticRenderRecipe,
  createSectorStaticRenderRecipe,
} from './static-recipes'
import type { PublishedStaticRenderNode } from './types'

function collectGeometryKinds(nodes: PublishedStaticRenderNode[], kinds = new Set<string>()) {
  for (const node of nodes) {
    if (node.kind === 'group') {
      collectGeometryKinds(node.children, kinds)
      continue
    }

    kinds.add(node.geometry.kind)
  }

  return kinds
}

describe('published static recipes', () => {
  test('sector recipes own world placement at their root groups', () => {
    CAMPUS_SECTORS.forEach((sector) => {
      const recipe = createSectorStaticRenderRecipe(sector)
      const detailedRoot = recipe.detailed[0]
      const proxyRoot = recipe.proxy?.[0]

      expect(detailedRoot?.kind).toBe('group')
      if (detailedRoot?.kind === 'group') {
        expect(detailedRoot.position).toEqual(sector.offset)
        expect(detailedRoot.children.length).toBeGreaterThan(0)
      }

      expect(proxyRoot?.kind).toBe('group')
      if (proxyRoot?.kind === 'group') {
        expect(proxyRoot.position).toEqual(sector.offset)
        expect(proxyRoot.children.length).toBeGreaterThan(0)
      }
    })
  })

  test('sector recipes cover all required primitive families for current campus geometry', () => {
    const kinds = collectGeometryKinds(createSectorStaticRenderRecipe(CAMPUS_SECTORS[0]!).detailed)

    expect(kinds.has('box')).toBe(true)
    expect(kinds.has('cylinder')).toBe(true)
    expect(kinds.has('sphere')).toBe(true)
    expect(kinds.has('torus')).toBe(true)
  })

  test('inter-sector recipe stays on detailed-only path', () => {
    const recipe = createInterSectorStaticRenderRecipe()

    expect(recipe.detailed.length).toBeGreaterThan(0)
    expect(recipe.proxy).toBeUndefined()
  })
})
