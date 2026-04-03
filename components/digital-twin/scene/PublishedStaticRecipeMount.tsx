'use client'

import { memo, useEffect, useMemo } from 'react'
import { Detailed } from '@react-three/drei'
import { MeshStandardMaterial, type Group } from 'three'
import type {
  PublishedStaticChunkRenderRecipe,
  PublishedStaticMaterialRef,
  PublishedStaticMaterialToken,
} from '@/lib/digital-twin/publish'
import {
  buildPublishedStaticRenderBatches,
  disposePublishedStaticRenderBatches,
} from '@/lib/digital-twin/runtime/static/render-batches'

export type PublishedStaticPalette = Record<PublishedStaticMaterialToken, string>

interface PublishedStaticRecipeMountProps {
  recipe: PublishedStaticChunkRenderRecipe
  palette: PublishedStaticPalette
  distances?: [number, number]
  chunkRef?: (node: Group | null) => void
}

function materialProps(material: PublishedStaticMaterialRef, palette: PublishedStaticPalette) {
  return {
    color: palette[material.token],
    metalness: material.metalness,
    roughness: material.roughness,
    ...(material.emissiveToken ? { emissive: palette[material.emissiveToken] } : {}),
    ...(typeof material.emissiveIntensity === 'number'
      ? { emissiveIntensity: material.emissiveIntensity }
      : {}),
    ...(typeof material.opacity === 'number' ? { opacity: material.opacity } : {}),
    ...(typeof material.transparent === 'boolean'
      ? { transparent: material.transparent }
      : typeof material.opacity === 'number' && material.opacity < 1
        ? { transparent: true }
        : {}),
  }
}

function getMaterialKey(material: PublishedStaticMaterialRef) {
  return JSON.stringify({
    token: material.token,
    metalness: material.metalness,
    roughness: material.roughness,
    emissiveToken: material.emissiveToken ?? null,
    emissiveIntensity: material.emissiveIntensity ?? null,
    opacity: material.opacity ?? null,
    transparent: material.transparent ?? null,
  })
}

const PublishedStaticMergedBatches = memo(function PublishedStaticMergedBatches({
  nodes,
  palette,
}: {
  nodes: PublishedStaticChunkRenderRecipe['detailed']
  palette: PublishedStaticPalette
}) {
  const batches = useMemo(() => buildPublishedStaticRenderBatches(nodes), [nodes])
  const materials = useMemo(() => {
    const next = new Map<string, MeshStandardMaterial>()

    for (const batch of batches) {
      const key = getMaterialKey(batch.material)
      if (next.has(key)) continue
      next.set(key, new MeshStandardMaterial(materialProps(batch.material, palette)))
    }

    return next
  }, [batches, palette])

  useEffect(() => {
    return () => {
      disposePublishedStaticRenderBatches(batches)
      materials.forEach((material) => material.dispose())
    }
  }, [batches, materials])

  return (
    <>
      {batches.map((batch) => (
        <mesh
          key={batch.key}
          geometry={batch.geometry}
          material={materials.get(getMaterialKey(batch.material))}
          castShadow={batch.castShadow}
          receiveShadow={batch.receiveShadow}
        />
      ))}
    </>
  )
})

export const PublishedStaticRecipeMount = memo(function PublishedStaticRecipeMount({
  recipe,
  palette,
  distances,
  chunkRef,
}: PublishedStaticRecipeMountProps) {
  if (distances) {
    return (
      <group ref={chunkRef}>
        <Detailed distances={distances}>
          <group>
            <PublishedStaticMergedBatches nodes={recipe.detailed} palette={palette} />
          </group>
          <group>
            <PublishedStaticMergedBatches nodes={recipe.proxy ?? recipe.detailed} palette={palette} />
          </group>
        </Detailed>
      </group>
    )
  }

  return (
    <group ref={chunkRef}>
      <PublishedStaticMergedBatches nodes={recipe.detailed} palette={palette} />
    </group>
  )
})
