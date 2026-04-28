import { describe, expect, test } from 'bun:test'
import {
  createEntitySchemaRegistry,
  getDynamicEntityPresentation,
  getEntitySchemaByArchetypeId,
  getEntitySchemaForDynamicEntity,
} from './entity-schema-registry'
import type { DynamicEntity, EntityArchetype, EntityCategory } from './types'

const CATEGORIES: EntityCategory[] = [
  {
    id: 'category-robot',
    key: 'robot',
    displayName: '机器人',
    sortOrder: 1,
    createdAt: 1,
    updatedAt: 1,
  },
]

const ARCHETYPES: EntityArchetype[] = [
  {
    id: 'archetype-inspection-robot',
    key: 'inspection-robot',
    categoryId: 'category-robot',
    categoryKey: 'robot',
    displayName: '巡检机器人',
    capabilities: {
      hasModel: false,
      movable: true,
      bindable: true,
      statusBearing: true,
      detailFieldsVisible: true,
    },
    metadata: {},
    createdAt: 1,
    updatedAt: 1,
  },
]

const DYNAMIC_ENTITY: DynamicEntity = {
  id: 'dynamic-robot-1',
  type: 'dynamic',
  name: 'Robot 1',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  status: 'active',
  visible: true,
  metadata: {},
  createdAt: 1,
  updatedAt: 1,
  archetypeId: 'archetype-inspection-robot',
  categoryKey: 'robot',
  attributes: {},
  displayAttributes: {},
}

describe('entity schema registry', () => {
  test('indexes categories and archetypes into schema definitions', () => {
    const registry = createEntitySchemaRegistry({
      categories: CATEGORIES,
      archetypes: ARCHETYPES,
    })

    expect(registry.categoriesByKey.get('robot')?.displayName).toBe('机器人')
    expect(registry.archetypesById.get('archetype-inspection-robot')?.key).toBe('inspection-robot')
    expect(registry.schemasByCategoryKey.get('robot')?.[0]?.displayName).toBe('巡检机器人')
  })

  test('resolves dynamic entities through the registry abstraction', () => {
    const registry = createEntitySchemaRegistry({
      categories: CATEGORIES,
      archetypes: ARCHETYPES,
    })

    expect(getEntitySchemaByArchetypeId('archetype-inspection-robot', registry)?.categoryKey).toBe(
      'robot'
    )
    expect(getEntitySchemaForDynamicEntity(DYNAMIC_ENTITY, registry)?.displayName).toBe('巡检机器人')
    const presentation = getDynamicEntityPresentation(DYNAMIC_ENTITY, registry)
    expect(presentation.movable).toBe(true)
    expect(presentation.modelAsset).toBeUndefined()
  })

  test('falls back to raw ids when schema metadata is missing', () => {
    const registry = createEntitySchemaRegistry({})
    const unresolvedEntity: DynamicEntity = {
      ...DYNAMIC_ENTITY,
      archetypeId: 'missing-archetype',
      categoryKey: 'missing-category',
    }

    const presentation = getDynamicEntityPresentation(unresolvedEntity, registry)

    expect(presentation.schema).toBeNull()
    expect(presentation.categoryLabel).toBe('missing-category')
    expect(presentation.archetypeLabel).toBe('missing-archetype')
    expect(presentation.accentColor).toBe('#38bdf8')
    expect(presentation.movable).toBe(true)
    expect(presentation.modelAsset).toBeUndefined()
  })
})
