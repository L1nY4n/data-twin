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
const WALL_BASE_HEIGHT = 0.08
const WALL_TOP_CAP_HEIGHT = 0.12
const WALL_OPENING_MARGIN = 0.04
const WALL_SEGMENT_EPSILON = 0.01

export interface AuthoredWallOpening {
  assetId: string
  xStart: number
  xEnd: number
  yStart: number
  yEnd: number
  kind: 'door-system' | 'window-system'
}

export interface AuthoredWallSegment {
  centerX: number
  centerY: number
  width: number
  height: number
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getHostStaticAssetId(asset: StaticAssetInstance) {
  const hostId = asset.metadata?.hostStaticAssetId
  return typeof hostId === 'string' && hostId.length > 0 ? hostId : null
}

function isOpeningAsset(
  asset: StaticAssetInstance
): asset is StaticAssetInstance & { assetKind: 'door-system' | 'window-system' } {
  return asset.assetKind === 'door-system' || asset.assetKind === 'window-system'
}

function rotateLocalXAxis(rotationY: number) {
  return { x: Math.cos(rotationY), z: -Math.sin(rotationY) }
}

export function resolveWallHostedOpenings(
  wallAsset: StaticAssetInstance,
  assets: StaticAssetInstance[]
): AuthoredWallOpening[] {
  if (wallAsset.assetKind !== 'wall-system') return []

  const wallCatalogItem = resolveStaticAssetCatalogItem(wallAsset.assetKind, wallAsset.variant)
  const safeScaleX = Math.max(wallAsset.scale.x, WALL_SEGMENT_EPSILON)
  const safeScaleY = Math.max(wallAsset.scale.y, WALL_SEGMENT_EPSILON)
  const wallWidth = wallCatalogItem.dimensions.width
  const wallHeight = wallCatalogItem.dimensions.height
  const halfWallWidth = wallWidth / 2
  const tangent = rotateLocalXAxis(wallAsset.rotation.y)

  return assets
    .filter(isOpeningAsset)
    .filter((asset) => asset.visible && getHostStaticAssetId(asset) === wallAsset.id)
    .map((asset) => {
      const catalogItem = resolveStaticAssetCatalogItem(asset.assetKind, asset.variant)
      const deltaX = asset.position.x - wallAsset.position.x
      const deltaZ = asset.position.z - wallAsset.position.z
      const centerX = (deltaX * tangent.x + deltaZ * tangent.z) / safeScaleX
      const openingWidth =
        (catalogItem.dimensions.width * asset.scale.x + WALL_OPENING_MARGIN * 2) / safeScaleX
      const openingHeight =
        (catalogItem.dimensions.height * asset.scale.y + WALL_OPENING_MARGIN * 2) / safeScaleY
      const xStart = clampNumber(centerX - openingWidth / 2, -halfWallWidth, halfWallWidth)
      const xEnd = clampNumber(centerX + openingWidth / 2, -halfWallWidth, halfWallWidth)
      const openingBottom =
        (asset.position.y - wallAsset.position.y - WALL_OPENING_MARGIN) / safeScaleY
      const yStart = clampNumber(openingBottom, 0, wallHeight)
      const yEnd = clampNumber(openingBottom + openingHeight, 0, wallHeight)

      return {
        assetId: asset.id,
        xStart,
        xEnd,
        yStart,
        yEnd,
        kind: asset.assetKind,
      } satisfies AuthoredWallOpening
    })
    .filter(
      (opening) =>
        opening.xEnd - opening.xStart > WALL_SEGMENT_EPSILON &&
        opening.yEnd - opening.yStart > WALL_SEGMENT_EPSILON
    )
    .sort((left, right) => left.xStart - right.xStart || left.yStart - right.yStart)
}

function uniqueSortedCuts(values: number[]) {
  return values
    .sort((left, right) => left - right)
    .filter((value, index, list) => index === 0 || Math.abs(value - list[index - 1]) > WALL_SEGMENT_EPSILON)
}

export function resolveWallSurfaceSegments(
  wallWidth: number,
  wallHeight: number,
  openings: AuthoredWallOpening[],
  minY = 0
): AuthoredWallSegment[] {
  const halfWallWidth = wallWidth / 2
  const clampedMinY = clampNumber(minY, 0, wallHeight)

  if (openings.length === 0) {
    const segmentHeight = wallHeight - clampedMinY
    return segmentHeight > WALL_SEGMENT_EPSILON
      ? [
          {
            centerX: 0,
            centerY: clampedMinY + segmentHeight / 2,
            width: wallWidth,
            height: segmentHeight,
          },
        ]
      : []
  }

  const xCuts = uniqueSortedCuts([
    -halfWallWidth,
    ...openings.flatMap((opening) => [opening.xStart, opening.xEnd]),
    halfWallWidth,
  ])
  const yCuts = uniqueSortedCuts([
    clampedMinY,
    ...openings.flatMap((opening) => [
      clampNumber(opening.yStart, clampedMinY, wallHeight),
      clampNumber(opening.yEnd, clampedMinY, wallHeight),
    ]),
    wallHeight,
  ])

  const segments: AuthoredWallSegment[] = []

  for (let xIndex = 0; xIndex < xCuts.length - 1; xIndex += 1) {
    const xStart = xCuts[xIndex]
    const xEnd = xCuts[xIndex + 1]
    const width = xEnd - xStart
    if (width <= WALL_SEGMENT_EPSILON) continue

    for (let yIndex = 0; yIndex < yCuts.length - 1; yIndex += 1) {
      const yStart = yCuts[yIndex]
      const yEnd = yCuts[yIndex + 1]
      const height = yEnd - yStart
      if (height <= WALL_SEGMENT_EPSILON) continue

      const centerX = (xStart + xEnd) / 2
      const centerY = (yStart + yEnd) / 2
      const hiddenByOpening = openings.some(
        (opening) =>
          centerX > opening.xStart + WALL_SEGMENT_EPSILON &&
          centerX < opening.xEnd - WALL_SEGMENT_EPSILON &&
          centerY > opening.yStart + WALL_SEGMENT_EPSILON &&
          centerY < opening.yEnd - WALL_SEGMENT_EPSILON
      )
      if (hiddenByOpening) continue

      segments.push({
        centerX,
        centerY,
        width,
        height,
      })
    }
  }

  return segments
}

export function resolveWallBaseSegments(
  wallWidth: number,
  openings: AuthoredWallOpening[]
): AuthoredWallSegment[] {
  const doorOpenings = openings
    .filter((opening) => opening.kind === 'door-system' && opening.yStart <= WALL_BASE_HEIGHT)
    .sort((left, right) => left.xStart - right.xStart)
  const halfWallWidth = wallWidth / 2

  if (doorOpenings.length === 0) {
    return [
      {
        centerX: 0,
        centerY: WALL_BASE_HEIGHT / 2,
        width: wallWidth,
        height: WALL_BASE_HEIGHT,
      },
    ]
  }

  const segments: AuthoredWallSegment[] = []
  let cursor = -halfWallWidth

  for (const opening of doorOpenings) {
    if (opening.xStart > cursor + WALL_SEGMENT_EPSILON) {
      const width = opening.xStart - cursor
      segments.push({
        centerX: cursor + width / 2,
        centerY: WALL_BASE_HEIGHT / 2,
        width,
        height: WALL_BASE_HEIGHT,
      })
    }

    cursor = Math.max(cursor, opening.xEnd)
  }

  if (cursor < halfWallWidth - WALL_SEGMENT_EPSILON) {
    const width = halfWallWidth - cursor
    segments.push({
      centerX: cursor + width / 2,
      centerY: WALL_BASE_HEIGHT / 2,
      width,
      height: WALL_BASE_HEIGHT,
    })
  }

  return segments
}

function AssetHighlight({
  asset,
  selected,
  hovered,
}: {
  asset: StaticAssetInstance
  selected: boolean
  hovered: boolean
}) {
  const catalogItem = useMemo(
    () => resolveStaticAssetCatalogItem(asset.assetKind, asset.variant),
    [asset.assetKind, asset.variant]
  )

  if (!selected && !hovered) return null

  return (
    <mesh position={[0, catalogItem.dimensions.height / 2, 0]} renderOrder={36}>
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
  )
}

const AuthoredWallSystemMount = memo(function AuthoredWallSystemMount({
  asset,
  assets,
  palette,
  interactive = false,
  selected = false,
  hovered = false,
}: {
  asset: StaticAssetInstance
  assets: StaticAssetInstance[]
  palette: PublishedStaticPalette
  interactive?: boolean
  selected?: boolean
  hovered?: boolean
}) {
  const catalogItem = useMemo(
    () => resolveStaticAssetCatalogItem(asset.assetKind, asset.variant),
    [asset.assetKind, asset.variant]
  )
  const openings = useMemo(() => resolveWallHostedOpenings(asset, assets), [asset, assets])
  const wallWidth = catalogItem.dimensions.width
  const wallHeight = catalogItem.dimensions.height
  const wallDepth = catalogItem.dimensions.depth
  const baseSegments = useMemo(
    () => resolveWallBaseSegments(wallWidth, openings),
    [openings, wallWidth]
  )
  const bodySegments = useMemo(
    () => resolveWallSurfaceSegments(wallWidth, wallHeight, openings, WALL_BASE_HEIGHT),
    [openings, wallHeight, wallWidth]
  )
  const isGlassPartition = asset.variant === 'glass-partition'

  if (!asset.visible) return null

  return (
    <group
      name={`authored-static-asset:${asset.id}`}
      position={[asset.position.x, asset.position.y, asset.position.z]}
      rotation={[asset.rotation.x, asset.rotation.y, asset.rotation.z]}
      scale={[asset.scale.x, asset.scale.y, asset.scale.z]}
      userData={interactive ? { pickable: true, staticAssetId: asset.id } : undefined}
    >
      {baseSegments.map((segment, index) => (
        <mesh key={`base:${index}`} position={[segment.centerX, segment.centerY, 0]} castShadow receiveShadow>
          <boxGeometry args={[segment.width, segment.height, wallDepth + 0.08]} />
          <meshStandardMaterial
            color={palette.curb}
            metalness={0.06}
            roughness={0.88}
            transparent={false}
          />
        </mesh>
      ))}
      {bodySegments.map((segment, index) => (
        <mesh key={`body:${index}`} position={[segment.centerX, segment.centerY, 0]} castShadow receiveShadow>
          <boxGeometry args={[segment.width, segment.height, wallDepth]} />
          <meshStandardMaterial
            color={isGlassPartition ? palette.water : palette.building}
            metalness={isGlassPartition ? 0.12 : 0.18}
            roughness={isGlassPartition ? 0.08 : 0.74}
            transparent={isGlassPartition}
            opacity={isGlassPartition ? 0.42 : 1}
          />
        </mesh>
      ))}
      <mesh
        position={[0, wallHeight + WALL_TOP_CAP_HEIGHT / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[wallWidth + 0.08, WALL_TOP_CAP_HEIGHT, wallDepth + 0.08]} />
        <meshStandardMaterial
          color={palette.steelDark}
          metalness={0.4}
          roughness={0.42}
          transparent={false}
        />
      </mesh>
      <AssetHighlight asset={asset} selected={selected} hovered={hovered} />
    </group>
  )
})

export const AuthoredStaticAssetMount = memo(function AuthoredStaticAssetMount({
  asset,
  assets,
  palette,
  interactive = false,
  selected = false,
  hovered = false,
}: {
  asset: StaticAssetInstance
  assets: StaticAssetInstance[]
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

  if (!asset.visible) return null

  if (asset.assetKind === 'wall-system') {
    return (
      <AuthoredWallSystemMount
        asset={asset}
        assets={assets}
        palette={palette}
        interactive={interactive}
        selected={selected}
        hovered={hovered}
      />
    )
  }

  return (
    <group
      name={`authored-static-asset:${asset.id}`}
      position={[asset.position.x, asset.position.y, asset.position.z]}
      rotation={[asset.rotation.x, asset.rotation.y, asset.rotation.z]}
      scale={[asset.scale.x, asset.scale.y, asset.scale.z]}
      userData={interactive ? { pickable: true, staticAssetId: asset.id } : undefined}
    >
      <PublishedStaticRecipeMount recipe={recipe} palette={palette} />
      <AssetHighlight asset={asset} selected={selected} hovered={hovered} />
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
          assets={assets}
          palette={palette}
          interactive={interactive}
          selected={selectedAssetId === asset.id}
          hovered={hoveredAssetId === asset.id}
        />
      ))}
    </group>
  )
})
