import type { PublishedStaticChunk, PublishedStaticMaterialRef } from './types'

export const PUBLISHED_STATIC_ASSET_SCHEMA_VERSION = 1 as const
export const PUBLISHED_STATIC_ASSET_BASE_URL = '/generated/published-static'
export const PUBLISHED_STATIC_ASSET_MANIFEST_URL = `${PUBLISHED_STATIC_ASSET_BASE_URL}/chunk-manifest.json`

export type PublishedStaticAssetCompression = 'none' | 'meshopt'

export interface PublishedStaticAssetVariant {
  url: string
  format: 'glb'
  compression: PublishedStaticAssetCompression
}

export interface PublishedStaticChunkAssetEntry {
  chunkId: string
  detailed: PublishedStaticAssetVariant
  proxy?: PublishedStaticAssetVariant
}

export interface PublishedStaticAssetManifest {
  schemaVersion: 1
  sceneId: string
  generatedAt: string
  chunks: Record<string, PublishedStaticChunkAssetEntry>
}

const VERSIONED_ASSET_URL_ORIGIN = 'http://published-scene.local'

function sanitizeChunkIdForFilename(chunkId: string) {
  return chunkId.replace(/[^a-zA-Z0-9_-]+/g, '-')
}

export function resolvePublishedStaticAssetManifestUrl(
  baseUrl = PUBLISHED_STATIC_ASSET_BASE_URL
) {
  return `${baseUrl}/chunk-manifest.json`
}

export function createVersionedPublishedStaticAssetUrl(
  url: string,
  version?: string | null
) {
  if (!version) return url

  const parsed = new URL(url, VERSIONED_ASSET_URL_ORIGIN)
  parsed.searchParams.set('v', version)

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(url)) {
    return parsed.toString()
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}

function createAssetVariant(
  chunkId: string,
  variant: 'detailed' | 'proxy',
  compression: PublishedStaticAssetCompression,
  baseUrl: string
): PublishedStaticAssetVariant {
  const safeChunkId = sanitizeChunkIdForFilename(chunkId)
  return {
    url: `${baseUrl}/${safeChunkId}.${variant}.glb`,
    format: 'glb',
    compression,
  }
}

export function createPublishedStaticChunkAssetEntry(
  chunk: Pick<PublishedStaticChunk, 'id' | 'renderRecipe'>,
  compression: PublishedStaticAssetCompression = 'none',
  baseUrl = PUBLISHED_STATIC_ASSET_BASE_URL
): PublishedStaticChunkAssetEntry {
  return {
    chunkId: chunk.id,
    detailed: createAssetVariant(chunk.id, 'detailed', compression, baseUrl),
    ...(chunk.renderRecipe.proxy
      ? { proxy: createAssetVariant(chunk.id, 'proxy', compression, baseUrl) }
      : {}),
  }
}

export function createPublishedStaticAssetManifest(
  sceneId: string,
  generatedAt: string,
  chunks: PublishedStaticChunk[],
  compression: PublishedStaticAssetCompression = 'none',
  baseUrl = PUBLISHED_STATIC_ASSET_BASE_URL
): PublishedStaticAssetManifest {
  return {
    schemaVersion: PUBLISHED_STATIC_ASSET_SCHEMA_VERSION,
    sceneId,
    generatedAt,
    chunks: Object.fromEntries(
      chunks.map((chunk) => [
        chunk.id,
        createPublishedStaticChunkAssetEntry(chunk, compression, baseUrl),
      ])
    ),
  }
}

export function encodePublishedStaticMaterialName(material: PublishedStaticMaterialRef) {
  return `dtmat:${encodeURIComponent(JSON.stringify(material))}`
}

export function decodePublishedStaticMaterialName(name: string) {
  if (!name.startsWith('dtmat:')) return null

  try {
    return JSON.parse(decodeURIComponent(name.slice('dtmat:'.length))) as PublishedStaticMaterialRef
  } catch {
    return null
  }
}

export function encodePublishedStaticMeshName(options: {
  castShadow: boolean
  receiveShadow: boolean
}) {
  return `dtmesh:${options.castShadow ? '1' : '0'}:${options.receiveShadow ? '1' : '0'}`
}

export function decodePublishedStaticMeshName(name: string) {
  if (!name.startsWith('dtmesh:')) return null

  const [, castShadow, receiveShadow] = name.split(':')
  return {
    castShadow: castShadow === '1',
    receiveShadow: receiveShadow === '1',
  }
}
