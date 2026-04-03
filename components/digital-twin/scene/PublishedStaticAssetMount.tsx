'use client'

import { Detailed, useGLTF } from '@react-three/drei'
import { memo, Suspense, useEffect, useMemo } from 'react'
import {
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
} from 'three'
import type {
  PublishedStaticChunkAssetEntry,
  PublishedStaticMaterialRef,
  PublishedStaticMaterialToken,
} from '@/lib/digital-twin/publish'
import {
  decodePublishedStaticMaterialName,
  decodePublishedStaticMeshName,
} from '@/lib/digital-twin/publish'

export type PublishedStaticPalette = Record<PublishedStaticMaterialToken, string>

interface PublishedStaticAssetMountProps {
  assets: PublishedStaticChunkAssetEntry
  palette: PublishedStaticPalette
  distances?: [number, number]
  chunkRef?: (node: Group | null) => void
}

function applyPaletteMaterial(
  material: Material,
  materialRef: PublishedStaticMaterialRef,
  palette: PublishedStaticPalette
) {
  if (!(material instanceof MeshStandardMaterial)) return

  material.color.set(palette[materialRef.token])
  material.metalness = materialRef.metalness
  material.roughness = materialRef.roughness

  if (materialRef.emissiveToken) {
    material.emissive.set(palette[materialRef.emissiveToken])
  } else {
    material.emissive.set('#000000')
  }

  material.emissiveIntensity = materialRef.emissiveIntensity ?? 0

  if (typeof materialRef.opacity === 'number') {
    material.opacity = materialRef.opacity
  } else {
    material.opacity = 1
  }

  material.transparent =
    typeof materialRef.transparent === 'boolean'
      ? materialRef.transparent
      : typeof materialRef.opacity === 'number' && materialRef.opacity < 1

  material.needsUpdate = true
}

function cloneSceneMaterials(root: Group) {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) => material.clone())
      return
    }
    object.material = object.material.clone()
  })
}

function disposeClonedMaterials(root: Group) {
  const materials = new Set<Material>()

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => materials.add(material))
      return
    }
    materials.add(object.material)
  })

  materials.forEach((material) => material.dispose())
}

function LoadedStaticAsset({
  url,
  palette,
}: {
  url: string
  palette: PublishedStaticPalette
}) {
  const { scene } = useGLTF(url, false, true)
  const preparedScene = useMemo(() => {
    const clone = scene.clone(true)
    cloneSceneMaterials(clone)

    clone.traverse((object) => {
      object.matrixAutoUpdate = false
      object.matrixWorldAutoUpdate = false

      if (object instanceof Mesh) {
        const renderFlags = decodePublishedStaticMeshName(object.name)
        object.castShadow = renderFlags?.castShadow ?? false
        object.receiveShadow = renderFlags?.receiveShadow ?? false

        if (Array.isArray(object.material)) {
          object.material.forEach((material) => {
            const materialRef = decodePublishedStaticMaterialName(material.name)
            if (materialRef) applyPaletteMaterial(material, materialRef, palette)
          })
        } else {
          const materialRef = decodePublishedStaticMaterialName(object.material.name)
          if (materialRef) applyPaletteMaterial(object.material, materialRef, palette)
        }
      }

      object.updateMatrix()
    })

    clone.updateMatrixWorld(true)
    return clone
  }, [palette, scene])

  useEffect(() => () => disposeClonedMaterials(preparedScene), [preparedScene])

  return <primitive object={preparedScene} />
}

function StaticAssetLevel({
  url,
  palette,
}: {
  url: string
  palette: PublishedStaticPalette
}) {
  return (
    <Suspense fallback={null}>
      <LoadedStaticAsset url={url} palette={palette} />
    </Suspense>
  )
}

export const PublishedStaticAssetMount = memo(function PublishedStaticAssetMount({
  assets,
  palette,
  distances,
  chunkRef,
}: PublishedStaticAssetMountProps) {
  if (distances && assets.proxy) {
    return (
      <group ref={chunkRef}>
        <Detailed distances={distances}>
          <group>
            <StaticAssetLevel url={assets.detailed.url} palette={palette} />
          </group>
          <group>
            <StaticAssetLevel url={assets.proxy.url} palette={palette} />
          </group>
        </Detailed>
      </group>
    )
  }

  return (
    <group ref={chunkRef}>
      <StaticAssetLevel url={assets.detailed.url} palette={palette} />
    </group>
  )
})
