import { describe, expect, test } from 'bun:test'
import { DEFAULT_SCENE_COUNTS, PRODUCTION_SCENE_COUNTS } from '../campus-layout'
import { buildPublishedScenePackage } from './compiler'
import { hydratePublishedScenePackage } from './hydrate'

describe('published campus scene hydration', () => {
  test('hydrates default package back into runtime entities with expected counts', () => {
    const pkg = buildPublishedScenePackage({ generatedAt: '2026-04-03T06:26:12.000Z' })
    const scene = hydratePublishedScenePackage(pkg, { profile: 'default' })

    expect(scene.persons).toHaveLength(DEFAULT_SCENE_COUNTS.persons)
    expect(scene.vehicles).toHaveLength(DEFAULT_SCENE_COUNTS.vehicles)
    expect(scene.equipment).toHaveLength(DEFAULT_SCENE_COUNTS.equipment)
    expect(scene.zones.length).toBeGreaterThan(0)
  })

  test('hydrates production package with preserved scaling and standard repeatable equipment naming', () => {
    const pkg = buildPublishedScenePackage({ generatedAt: '2026-04-03T06:26:12.000Z' })
    const scene = hydratePublishedScenePackage(pkg, { profile: 'production' })

    expect(scene.persons).toHaveLength(PRODUCTION_SCENE_COUNTS.persons)
    expect(scene.vehicles).toHaveLength(PRODUCTION_SCENE_COUNTS.vehicles)
    expect(scene.equipment).toHaveLength(PRODUCTION_SCENE_COUNTS.equipment)
    expect(scene.equipment.some((entity: { name: string }) => /-\d{2}$/.test(entity.name))).toBe(true)
    expect(scene.equipment.some((entity: { name: string }) => entity.name.includes('#'))).toBe(false)
  })
})
