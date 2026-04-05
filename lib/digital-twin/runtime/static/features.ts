import { DEFAULT_PUBLISHED_SCENE_PACKAGE } from '../../publish'
import type {
  PublishedScenePackage,
  PublishedSceneSector,
  PublishedStaticChunk,
  PublishedStaticFeature,
} from '../../publish'

export interface RuntimePublishedStaticFeature {
  feature: PublishedStaticFeature
  chunk: PublishedStaticChunk
  sector: PublishedSceneSector | null
}

export interface RuntimePublishedStaticFeatureRegistry {
  entries: RuntimePublishedStaticFeature[]
  byId: Map<string, RuntimePublishedStaticFeature>
}

export function createRuntimePublishedStaticFeatureRegistry(
  pkg: PublishedScenePackage
): RuntimePublishedStaticFeatureRegistry {
  const entries = pkg.staticChunks.flatMap((chunk) => {
    const sector =
      chunk.sectorId === null
        ? null
        : pkg.sectors.find((item) => item.id === chunk.sectorId) ?? null

    return chunk.features.map((feature) => ({
      feature,
      chunk,
      sector,
    }))
  })

  return {
    entries,
    byId: new Map(entries.map((entry) => [entry.feature.id, entry])),
  }
}

const DEFAULT_RUNTIME_STATIC_FEATURE_REGISTRY = createRuntimePublishedStaticFeatureRegistry(
  DEFAULT_PUBLISHED_SCENE_PACKAGE
)

export function getRuntimePublishedStaticFeature(
  id: string,
  registry: RuntimePublishedStaticFeatureRegistry = DEFAULT_RUNTIME_STATIC_FEATURE_REGISTRY
) {
  return registry.byId.get(id) ?? null
}

export function getRuntimePublishedStaticFeatures(
  registry: RuntimePublishedStaticFeatureRegistry = DEFAULT_RUNTIME_STATIC_FEATURE_REGISTRY
) {
  return registry.entries
}
