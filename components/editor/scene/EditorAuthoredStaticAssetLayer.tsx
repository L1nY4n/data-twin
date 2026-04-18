'use client'

import { memo, useEffect, useMemo } from 'react'
import { AuthoredStaticAssetLayer } from '@/components/digital-twin/scene/AuthoredStaticAssetLayer'
import type { PublishedStaticPalette } from '@/components/digital-twin/scene/PublishedStaticRecipeMount'
import {
  useEditorSceneStore,
  useEditorUiStore,
  useEditorViewerStore,
} from '@/lib/digital-twin/editor-store'
import { setEditorDragCheckRenderedTargetProvider } from './editor-drag-check-bridge'

export const EditorAuthoredStaticAssetLayer = memo(function EditorAuthoredStaticAssetLayer({
  palette,
}: {
  palette: PublishedStaticPalette
}) {
  const staticAssets = useEditorSceneStore((state) => state.staticAssets)
  const draftStaticAsset = useEditorSceneStore((state) => state.draftStaticAsset)
  const savedStaticAsset = useEditorSceneStore((state) => state.savedStaticAsset)
  const transformPreview = useEditorUiStore((state) => state.transformPreview)
  const isTransformDragging = useEditorUiStore((state) => state.isTransformDragging)
  const selectedStaticAssetId = useEditorViewerStore((state) => state.selectedStaticAssetId)
  const hoveredStaticAssetId = useEditorViewerStore((state) => state.hoveredStaticAssetId)

  const renderedAssets = useMemo(() => {
    const assets = [...staticAssets.values()]

    if (draftStaticAsset) {
      const renderedDraftStaticAsset =
        isTransformDragging && transformPreview
          ? {
              ...draftStaticAsset,
              position: transformPreview.position,
              rotation: transformPreview.rotation,
              scale: transformPreview.scale,
            }
          : draftStaticAsset
      const existingIndex = assets.findIndex((asset) => asset.id === draftStaticAsset.id)
      if (existingIndex >= 0) {
        assets[existingIndex] = renderedDraftStaticAsset
      } else {
        assets.push(renderedDraftStaticAsset)
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
  }, [draftStaticAsset, isTransformDragging, savedStaticAsset, staticAssets, transformPreview])

  useEffect(() => {
    setEditorDragCheckRenderedTargetProvider(() => {
      if (!selectedStaticAssetId) {
        return {
          position: null,
        }
      }

      const renderedAsset =
        renderedAssets.find((asset) => asset.id === selectedStaticAssetId) ?? null
      return {
        position: renderedAsset
          ? {
              x: renderedAsset.position.x,
              y: renderedAsset.position.y,
              z: renderedAsset.position.z,
            }
          : null,
      }
    })

    return () => {
      setEditorDragCheckRenderedTargetProvider(null)
    }
  }, [renderedAssets, selectedStaticAssetId])

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
