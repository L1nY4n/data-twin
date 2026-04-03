import { DEFAULT_PUBLISHED_SCENE_PACKAGE } from '../../publish'
import type {
  PublishedSceneSector,
  PublishedStaticChunk,
  PublishedStaticFeature,
} from '../../publish'

export interface RuntimePublishedStaticFeature {
  feature: PublishedStaticFeature
  chunk: PublishedStaticChunk
  sector: PublishedSceneSector | null
}

const RUNTIME_STATIC_FEATURES = DEFAULT_PUBLISHED_SCENE_PACKAGE.staticChunks.flatMap((chunk) => {
  const sector =
    chunk.sectorId === null
      ? null
      : DEFAULT_PUBLISHED_SCENE_PACKAGE.sectors.find((item) => item.id === chunk.sectorId) ?? null

  return chunk.features.map((feature) => ({
    feature,
    chunk,
    sector,
  }))
})

const RUNTIME_STATIC_FEATURE_MAP = new Map<string, RuntimePublishedStaticFeature>(
  RUNTIME_STATIC_FEATURES.map((entry) => [entry.feature.id, entry])
)

export function getRuntimePublishedStaticFeature(id: string) {
  return RUNTIME_STATIC_FEATURE_MAP.get(id) ?? null
}

export function getRuntimePublishedStaticFeatures() {
  return RUNTIME_STATIC_FEATURES
}
