import type {
  PublishedScenePackage,
  PublishedSceneSector,
  PublishedStaticChunk,
} from './types'

export interface ResolvedPublishedStaticChunkMount {
  chunk: PublishedStaticChunk
  sector: PublishedSceneSector | null
}

export function resolveSectorForStaticChunk(
  pkg: PublishedScenePackage,
  chunk: PublishedStaticChunk
) {
  if (chunk.sectorId) {
    return pkg.sectors.find((sector) => sector.id === chunk.sectorId) ?? null
  }

  return pkg.sectors.find((sector) => sector.staticChunkId === chunk.id) ?? null
}

export function resolvePublishedStaticChunkMounts(
  pkg: PublishedScenePackage
): ResolvedPublishedStaticChunkMount[] {
  return pkg.staticChunks.map((chunk) => ({
    chunk,
    sector: resolveSectorForStaticChunk(pkg, chunk),
  }))
}
