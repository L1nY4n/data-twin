'use client'

import { memo, useEffect, useMemo } from 'react'
import {
  AuthoredStaticAssetLayer,
  AuthoredStaticAssetMount,
} from '@/components/digital-twin/scene/AuthoredStaticAssetLayer'
import type { PublishedStaticPalette } from '@/components/digital-twin/scene/PublishedStaticRecipeMount'
import { useEditorPreviewStore } from '@/lib/digital-twin/editor-preview-store'
import {
  useEditorSceneStore,
  useEditorUiStore,
  useEditorViewerStore,
} from '@/lib/digital-twin/editor-store'
import type { StaticAssetInstance } from '@/lib/digital-twin/types'
import { setEditorDragCheckRenderedTargetProvider } from './editor-drag-check-bridge'

function buildRenderedAssets(
  staticAssets: Map<string, StaticAssetInstance>,
  draftStaticAsset: StaticAssetInstance | null,
  savedStaticAsset: StaticAssetInstance | null
) {
  const assets = [...staticAssets.values()]

  if (draftStaticAsset) {
    const existingIndex = assets.findIndex((asset) => asset.id === draftStaticAsset.id)
    if (existingIndex >= 0) {
      assets[existingIndex] = draftStaticAsset
    } else {
      assets.push(draftStaticAsset)
    }
  } else if (savedStaticAsset && !assets.some((asset) => asset.id === savedStaticAsset.id)) {
    assets.push(savedStaticAsset)
  }

  return assets
    .filter((asset) => asset.visible)
    .sort((left, right) => left.createdAt - right.createdAt)
}

export const EditorAuthoredStaticAssetLayer = memo(function EditorAuthoredStaticAssetLayer({
  palette,
}: {
  palette: PublishedStaticPalette
}) {
  const staticAssets = useEditorSceneStore((state) => state.staticAssets)
  const draftStaticAsset = useEditorSceneStore((state) => state.draftStaticAsset)
  const savedStaticAsset = useEditorSceneStore((state) => state.savedStaticAsset)
  const isTransformDragging = useEditorUiStore((state) => state.isTransformDragging)
  const selectedStaticAssetId = useEditorViewerStore((state) => state.selectedStaticAssetId)
  const hoveredStaticAssetId = useEditorViewerStore((state) => state.hoveredStaticAssetId)
  const transformPreview = useEditorPreviewStore((state) => state.transformPreview)

  const renderedAssets = useMemo(
    () => buildRenderedAssets(staticAssets, draftStaticAsset, savedStaticAsset),
    [draftStaticAsset, savedStaticAsset, staticAssets]
  )

  const previewAsset = useMemo(() => {
    if (
      !draftStaticAsset ||
      !isTransformDragging ||
      !transformPreview ||
      selectedStaticAssetId !== draftStaticAsset.id
    ) {
      return null
    }

    return {
      ...draftStaticAsset,
      position: transformPreview.position,
      rotation: transformPreview.rotation,
      scale: transformPreview.scale,
    }
  }, [draftStaticAsset, isTransformDragging, selectedStaticAssetId, transformPreview])

  const isPreviewingSelectedAsset = Boolean(previewAsset)

  const previewContextAssets = useMemo(() => {
    if (!previewAsset) return renderedAssets

    const existingIndex = renderedAssets.findIndex((asset) => asset.id === previewAsset.id)
    if (existingIndex >= 0) {
      return renderedAssets.map((asset) => (asset.id === previewAsset.id ? previewAsset : asset))
    }

    return [...renderedAssets, previewAsset]
  }, [previewAsset, renderedAssets])

  const stableAssets = useMemo(() => {
    if (!isPreviewingSelectedAsset || !selectedStaticAssetId) return renderedAssets
    return renderedAssets.filter((asset) => asset.id !== selectedStaticAssetId)
  }, [isPreviewingSelectedAsset, renderedAssets, selectedStaticAssetId])

  useEffect(() => {
    setEditorDragCheckRenderedTargetProvider(() => {
      if (!selectedStaticAssetId) {
        return {
          position: null,
        }
      }

      const renderedAsset =
        (previewAsset && previewAsset.id === selectedStaticAssetId
          ? previewAsset
          : renderedAssets.find((asset) => asset.id === selectedStaticAssetId)) ?? null

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
  }, [previewAsset, renderedAssets, selectedStaticAssetId])

  if (stableAssets.length === 0 && !previewAsset) return null

  return (
    <group name="editor-authored-static-assets">
      {stableAssets.length > 0 ? (
        <AuthoredStaticAssetLayer
          assets={stableAssets}
          palette={palette}
          interactive
          selectedAssetId={isPreviewingSelectedAsset ? null : selectedStaticAssetId}
          hoveredAssetId={hoveredStaticAssetId}
        />
      ) : null}
      {previewAsset ? (
        <AuthoredStaticAssetMount
          key={previewAsset.id}
          asset={previewAsset}
          assets={previewContextAssets}
          palette={palette}
          selected
          hovered={hoveredStaticAssetId === previewAsset.id}
        />
      ) : null}
    </group>
  )
})
