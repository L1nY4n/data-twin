'use client'

import { memo, useEffect, useMemo, useState } from 'react'
import type { PublishedScenePackage } from '@/lib/digital-twin/publish'
import { loadPublishedStaticAssetManifest } from '@/lib/digital-twin/runtime/static/asset-manifest'
import { createRuntimeStaticChunkRegistry } from '@/lib/digital-twin/runtime/static/chunk-registry'
import { PublishedStaticAssetMount } from '@/components/digital-twin/scene/PublishedStaticAssetMount'
import { createPublishedStaticPalette } from '@/components/digital-twin/scene/palette'
import {
  PublishedStaticRecipeMount,
} from '@/components/digital-twin/scene/PublishedStaticRecipeMount'

export const EditorStaticEnvironment = memo(function EditorStaticEnvironment({
  isDark,
  publishedScenePackage,
}: {
  isDark: boolean
  publishedScenePackage: PublishedScenePackage
}) {
  const palette = useMemo(() => createPublishedStaticPalette(isDark), [isDark])
  const staticChunkRegistry = useMemo(
    () => createRuntimeStaticChunkRegistry(publishedScenePackage),
    [publishedScenePackage]
  )
  const [assetManifest, setAssetManifest] = useState<
    Awaited<ReturnType<typeof loadPublishedStaticAssetManifest>> | undefined
  >(undefined)
  const lodDistances: [number, number] = [0, 420]

  useEffect(() => {
    if (staticChunkRegistry.length === 0) {
      setAssetManifest(null)
      return
    }

    let cancelled = false
    setAssetManifest(undefined)

    loadPublishedStaticAssetManifest(publishedScenePackage.staticAssetManifestUrl).then(
      (manifest) => {
        if (cancelled) return
        setAssetManifest(manifest)
      }
    )

    return () => {
      cancelled = true
    }
  }, [publishedScenePackage.staticAssetManifestUrl, staticChunkRegistry.length])

  return (
    <group name="editor-static-environment">
      {staticChunkRegistry.map((entry) => {
        const assetEntry = assetManifest?.chunks[entry.id]

        if (assetEntry) {
          return (
            <PublishedStaticAssetMount
              key={entry.id}
              assets={assetEntry}
              palette={palette}
              distances={
                entry.renderer === 'campus-sector-cluster' ? lodDistances : undefined
              }
            />
          )
        }

        if (assetManifest === undefined) {
          return null
        }

        return (
          <PublishedStaticRecipeMount
            key={entry.id}
            recipe={entry.chunk.renderRecipe}
            palette={palette}
            distances={
              entry.renderer === 'campus-sector-cluster' ? lodDistances : undefined
            }
          />
        )
      })}
    </group>
  )
})
