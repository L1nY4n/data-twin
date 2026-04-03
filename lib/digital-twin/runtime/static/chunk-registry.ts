import {
  resolvePublishedStaticChunkMounts,
  type PublishedScenePackage,
  type PublishedSceneSector,
  type PublishedStaticChunk,
  type PublishedStaticChunkMountKind,
  type PublishedStaticChunkRendererId,
} from '../../publish'
import type { Vector3 } from '../../types'

export interface RuntimeStaticChunkBoundsSphere {
  center: Vector3
  radius: number
}

export interface RuntimeStaticChunkRegistration {
  id: string
  renderer: PublishedStaticChunkRendererId
  mountKind: PublishedStaticChunkMountKind
  chunk: PublishedStaticChunk
  sector: PublishedSceneSector | null
  lodDistance: number
  boundsSphere: RuntimeStaticChunkBoundsSphere
}

function createBoundsSphere(chunk: PublishedStaticChunk): RuntimeStaticChunkBoundsSphere {
  const center = {
    x: (chunk.bounds.min.x + chunk.bounds.max.x) / 2,
    y: (chunk.bounds.min.y + chunk.bounds.max.y) / 2,
    z: (chunk.bounds.min.z + chunk.bounds.max.z) / 2,
  }
  const halfWidth = (chunk.bounds.max.x - chunk.bounds.min.x) / 2
  const halfHeight = (chunk.bounds.max.y - chunk.bounds.min.y) / 2
  const halfDepth = (chunk.bounds.max.z - chunk.bounds.min.z) / 2

  return {
    center,
    radius: Math.hypot(halfWidth, halfHeight, halfDepth),
  }
}

export function createRuntimeStaticChunkRegistry(
  pkg: PublishedScenePackage
): RuntimeStaticChunkRegistration[] {
  return resolvePublishedStaticChunkMounts(pkg).map(({ chunk, sector }) => ({
    id: chunk.id,
    renderer: chunk.runtimeMount.renderer,
    mountKind: chunk.runtimeMount.kind,
    chunk,
    sector,
    lodDistance: chunk.proxy.lodDistance,
    boundsSphere: createBoundsSphere(chunk),
  }))
}
