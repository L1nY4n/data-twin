import { createVersionedPublishedStaticAssetUrl } from './static-assets'
import type { PublishedScenePackage } from './types'

export const PUBLISHED_SCENE_PACKAGE_URL =
  '/generated/published-static/published-scene-package.json'

const packageCache = new Map<string, Promise<PublishedScenePackage | null>>()

function isPublishedScenePackage(value: unknown): value is PublishedScenePackage {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<PublishedScenePackage>
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.sceneId === 'string' &&
    Array.isArray(candidate.sectors) &&
    Array.isArray(candidate.staticChunks) &&
    Array.isArray(candidate.dynamicLayers) &&
    Array.isArray(candidate.routingLayers) &&
    Array.isArray(candidate.cameraPresets)
  )
}

function withRuntimeVersion(
  pkg: PublishedScenePackage,
  version?: string | null
): PublishedScenePackage {
  if (!version) return pkg

  return {
    ...pkg,
    staticAssetManifestUrl: createVersionedPublishedStaticAssetUrl(
      pkg.staticAssetManifestUrl,
      version
    ),
  }
}

async function readPublishedScenePackage(url: string, version?: string | null) {
  const response = await fetch(createVersionedPublishedStaticAssetUrl(url, version), {
    cache: 'force-cache',
  })
  if (!response.ok) return null

  const payload = (await response.json()) as unknown
  return isPublishedScenePackage(payload) ? withRuntimeVersion(payload, version) : null
}

export function withVersionedPublishedScenePackage(
  pkg: PublishedScenePackage,
  version?: string | null
) {
  return withRuntimeVersion(pkg, version)
}

export function loadPublishedScenePackage(
  url = PUBLISHED_SCENE_PACKAGE_URL,
  version?: string | null
) {
  const cacheKey = version ? `${url}?v=${version}` : url
  const cached = packageCache.get(cacheKey)
  if (cached) return cached

  const next = readPublishedScenePackage(url, version)
    .then((pkg) => {
      if (!pkg) packageCache.delete(cacheKey)
      return pkg
    })
    .catch(() => {
      packageCache.delete(cacheKey)
      return null
    })
  packageCache.set(cacheKey, next)
  return next
}
