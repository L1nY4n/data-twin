'use client'

import { memo, useMemo } from 'react'
import { createAuthoredStaticAssetRenderRecipe } from '@/lib/digital-twin/publish'
import { resolveStaticAssetCatalogItem } from '@/lib/digital-twin/static-asset-catalog'
import type { StaticAssetInstance } from '@/lib/digital-twin/types'
import {
  PublishedStaticRecipeMount,
  type PublishedStaticPalette,
} from './PublishedStaticRecipeMount'

const HIGHLIGHT_PADDING = 0.8

const AuthoredStaticAssetMount = memo(function AuthoredStaticAssetMount({
  asset,
  palette,
  interactive = false,
  selected = false,
  hovered = false,
}: {
  asset: StaticAssetInstance
  palette: PublishedStaticPalette
  interactive?: boolean
  selected?: boolean
  hovered?: boolean
}) {
  const { assetKind, id, name, variant } = asset
  const recipe = useMemo(
    () => createAuthoredStaticAssetRenderRecipe({ assetKind, id, name, variant }),
    [assetKind, id, name, variant]
  )
  const catalogItem = useMemo(
    () => resolveStaticAssetCatalogItem(assetKind, variant),
    [assetKind, variant]
  )
  const showHighlight = selected || hovered

  if (!asset.visible) return null

  return (
    <group
      name={`authored-static-asset:${asset.id}`}
      position={[asset.position.x, asset.position.y, asset.position.z]}
      rotation={[asset.rotation.x, asset.rotation.y, asset.rotation.z]}
      scale={[asset.scale.x, asset.scale.y, asset.scale.z]}
      userData={interactive ? { pickable: true, staticAssetId: asset.id } : undefined}
    >
      <PublishedStaticRecipeMount recipe={recipe} palette={palette} />
      {showHighlight ? (
        <mesh
          position={[0, catalogItem.dimensions.height / 2, 0]}
          renderOrder={36}
        >
          <boxGeometry
            args={[
              catalogItem.dimensions.width + HIGHLIGHT_PADDING,
              catalogItem.dimensions.height + HIGHLIGHT_PADDING,
              catalogItem.dimensions.depth + HIGHLIGHT_PADDING,
            ]}
          />
          <meshStandardMaterial
            color={selected ? '#60a5fa' : '#93c5fd'}
            emissive={selected ? '#60a5fa' : '#93c5fd'}
            emissiveIntensity={selected ? 0.2 : 0.08}
            metalness={0}
            roughness={0.94}
            transparent
            opacity={selected ? 0.18 : 0.08}
            depthWrite={false}
            wireframe
          />
        </mesh>
      ) : null}
    </group>
  )
})

export const AuthoredStaticAssetLayer = memo(function AuthoredStaticAssetLayer({
  assets,
  palette,
  interactive = false,
  selectedAssetId = null,
  hoveredAssetId = null,
}: {
  assets: StaticAssetInstance[]
  palette: PublishedStaticPalette
  interactive?: boolean
  selectedAssetId?: string | null
  hoveredAssetId?: string | null
}) {
  return (
    <group name="authored-static-assets">
      {assets.map((asset) => (
        <AuthoredStaticAssetMount
          key={asset.id}
          asset={asset}
          palette={palette}
          interactive={interactive}
          selected={selectedAssetId === asset.id}
          hovered={hoveredAssetId === asset.id}
        />
      ))}
    </group>
  )
})
