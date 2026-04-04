import {
  createVersionedPublishedStaticAssetUrl,
  type PublishedStaticAssetManifest,
} from '../../publish'

const manifestCache = new Map<string, Promise<PublishedStaticAssetManifest | null>>()

function withVersionedChunkAssets(manifest: PublishedStaticAssetManifest) {
  return {
    ...manifest,
    chunks: Object.fromEntries(
      Object.entries(manifest.chunks).map(([chunkId, entry]) => [
        chunkId,
        {
          ...entry,
          detailed: {
            ...entry.detailed,
            url: createVersionedPublishedStaticAssetUrl(entry.detailed.url, manifest.generatedAt),
          },
          ...(entry.proxy
            ? {
                proxy: {
                  ...entry.proxy,
                  url: createVersionedPublishedStaticAssetUrl(entry.proxy.url, manifest.generatedAt),
                },
              }
            : {}),
        },
      ])
    ),
  } satisfies PublishedStaticAssetManifest
}

async function readPublishedStaticAssetManifest(url: string) {
  const response = await fetch(url, { cache: 'force-cache' })
  if (!response.ok) return null

  const manifest = (await response.json()) as PublishedStaticAssetManifest
  if (manifest.schemaVersion !== 1) return null
  return withVersionedChunkAssets(manifest)
}

export function loadPublishedStaticAssetManifest(url: string) {
  const cached = manifestCache.get(url)
  if (cached) return cached

  const next = readPublishedStaticAssetManifest(url)
    .then((manifest) => {
      if (!manifest) manifestCache.delete(url)
      return manifest
    })
    .catch(() => {
      manifestCache.delete(url)
      return null
    })
  manifestCache.set(url, next)
  return next
}
