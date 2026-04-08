'use client'

import { memo, useMemo } from 'react'
import { AuthoredStaticAssetLayer } from '@/components/digital-twin/scene/AuthoredStaticAssetLayer'
import type { PublishedStaticPalette } from '@/components/digital-twin/scene/PublishedStaticRecipeMount'
import { useEditorSceneStore, useEditorViewerStore } from '@/lib/digital-twin/editor-store'

export const EditorAuthoredStaticAssetLayer = memo(function EditorAuthoredStaticAssetLayer({
  palette,
}: {
  palette: PublishedStaticPalette
}) {
  const staticAssets = useEditorSceneStore((state) => state.staticAssets)
  const draftStaticAsset = useEditorSceneStore((state) => state.draftStaticAsset)
  const savedStaticAsset = useEditorSceneStore((state) => state.savedStaticAsset)
  const selectedStaticAssetId = useEditorViewerStore((state) => state.selectedStaticAssetId)
  const hoveredStaticAssetId = useEditorViewerStore((state) => state.hoveredStaticAssetId)

  const renderedAssets = useMemo(() => {
    const assets = [...staticAssets.values()]

    if (draftStaticAsset) {
      const existingIndex = assets.findIndex((asset) => asset.id === draftStaticAsset.id)
      if (existingIndex >= 0) {
        assets[existingIndex] = draftStaticAsset
      } else {
        assets.push(draftStaticAsset)
      }
    } else if (
      savedStaticAsset &&
      !assets.some((asset) => asset.id === savedStaticAsset.id)
    ) {
      assets.push(savedStaticAsset)
    }

    return assets
      .filter((asset) => asset.visible)
      .sort((left, right) => left.createdAt - right.createdAt)
  }, [draftStaticAsset, savedStaticAsset, staticAssets])

  if (renderedAssets.length === 0) return null

  return (
    <AuthoredStaticAssetLayer
      assets={renderedAssets}
      palette={palette}
      interactive
      selectedAssetId={selectedStaticAssetId}
      hoveredAssetId={hoveredStaticAssetId}
    />
  )
})
