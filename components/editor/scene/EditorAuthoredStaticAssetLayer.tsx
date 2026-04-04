'use client'

import { memo, useMemo } from 'react'
import { AuthoredStaticAssetLayer } from '@/components/digital-twin/scene/AuthoredStaticAssetLayer'
import type { PublishedStaticPalette } from '@/components/digital-twin/scene/PublishedStaticRecipeMount'
import { useEditorDigitalTwinStore } from '@/lib/digital-twin/editor-store'

export const EditorAuthoredStaticAssetLayer = memo(function EditorAuthoredStaticAssetLayer({
  palette,
}: {
  palette: PublishedStaticPalette
}) {
  const staticAssets = useEditorDigitalTwinStore((state) => state.staticAssets)
  const draftStaticAsset = useEditorDigitalTwinStore((state) => state.draftStaticAsset)
  const savedStaticAsset = useEditorDigitalTwinStore((state) => state.savedStaticAsset)
  const selectedStaticAssetId = useEditorDigitalTwinStore(
    (state) => state.selectedStaticAssetId
  )
  const hoveredStaticAssetId = useEditorDigitalTwinStore(
    (state) => state.hoveredStaticAssetId
  )

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
