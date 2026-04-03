import type { PublishedStaticAssetManifest } from '../../publish'

const manifestCache = new Map<string, Promise<PublishedStaticAssetManifest | null>>()

async function readPublishedStaticAssetManifest(url: string) {
  const response = await fetch(url, { cache: 'force-cache' })
  if (!response.ok) return null

  const manifest = (await response.json()) as PublishedStaticAssetManifest
  if (manifest.schemaVersion !== 1) return null
  return manifest
}

export function loadPublishedStaticAssetManifest(url: string) {
  const cached = manifestCache.get(url)
  if (cached) return cached

  const next = readPublishedStaticAssetManifest(url).catch(() => null)
  manifestCache.set(url, next)
  return next
}
