import type { ArchetypeModelAsset, DynamicEntity, EntityArchetype, EntityCategory } from './types'

// This registry is a derived runtime index over the authoritative
// category/archetype data that already exists in platform state.
export interface EntitySchemaDefinition {
  archetype: EntityArchetype
  category: EntityCategory | null
  categoryKey: string
  displayName: string
}

export interface DynamicEntityPresentation {
  schema: EntitySchemaDefinition | null
  categoryLabel: string
  archetypeLabel: string
  accentColor: string
  movable: boolean
  modelAsset?: ArchetypeModelAsset
}

export interface EntitySchemaRegistry {
  categoriesByKey: Map<string, EntityCategory>
  archetypesById: Map<string, EntityArchetype>
  archetypesByKey: Map<string, EntityArchetype>
  schemasByArchetypeId: Map<string, EntitySchemaDefinition>
  schemasByCategoryKey: Map<string, EntitySchemaDefinition[]>
}

export function createEntitySchemaRegistry(input: {
  categories?: Iterable<EntityCategory>
  archetypes?: Iterable<EntityArchetype>
}): EntitySchemaRegistry {
  const categoriesByKey = new Map<string, EntityCategory>()
  const archetypesById = new Map<string, EntityArchetype>()
  const archetypesByKey = new Map<string, EntityArchetype>()
  const schemasByArchetypeId = new Map<string, EntitySchemaDefinition>()
  const schemasByCategoryKey = new Map<string, EntitySchemaDefinition[]>()

  for (const category of input.categories ?? []) {
    categoriesByKey.set(category.key, category)
  }

  for (const archetype of input.archetypes ?? []) {
    archetypesById.set(archetype.id, archetype)
    archetypesByKey.set(archetype.key, archetype)

    const category = categoriesByKey.get(archetype.categoryKey) ?? null
    const definition: EntitySchemaDefinition = {
      archetype,
      category,
      categoryKey: archetype.categoryKey,
      displayName: archetype.displayName,
    }

    schemasByArchetypeId.set(archetype.id, definition)

    const categoryDefinitions = schemasByCategoryKey.get(archetype.categoryKey) ?? []
    categoryDefinitions.push(definition)
    schemasByCategoryKey.set(archetype.categoryKey, categoryDefinitions)
  }

  for (const definitions of schemasByCategoryKey.values()) {
    definitions.sort((left, right) => left.displayName.localeCompare(right.displayName, 'zh-CN'))
  }

  return {
    categoriesByKey,
    archetypesById,
    archetypesByKey,
    schemasByArchetypeId,
    schemasByCategoryKey,
  }
}

export function getEntitySchemaByArchetypeId(
  archetypeId: string,
  registry: EntitySchemaRegistry
): EntitySchemaDefinition | null {
  return registry.schemasByArchetypeId.get(archetypeId) ?? null
}

export function getEntitySchemaForDynamicEntity(
  entity: Pick<DynamicEntity, 'archetypeId'>,
  registry: EntitySchemaRegistry
): EntitySchemaDefinition | null {
  return getEntitySchemaByArchetypeId(entity.archetypeId, registry)
}

export function getDynamicEntityPresentation(
  entity: Pick<DynamicEntity, 'archetypeId' | 'categoryKey'>,
  registry: EntitySchemaRegistry
): DynamicEntityPresentation {
  const schema = getEntitySchemaForDynamicEntity(entity, registry)
  return {
    schema,
    categoryLabel: schema?.category?.displayName ?? entity.categoryKey,
    archetypeLabel: schema?.archetype?.displayName ?? entity.archetypeId,
    accentColor: schema?.category?.color ?? '#38bdf8',
    movable: schema?.archetype?.capabilities.movable ?? true,
    ...(schema?.archetype?.model ? { modelAsset: schema.archetype.model } : {}),
  }
}
