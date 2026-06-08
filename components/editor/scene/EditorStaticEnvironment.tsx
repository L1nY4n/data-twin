'use client'

import { useFrame } from '@react-three/fiber'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Frustum,
  Matrix4,
  Quaternion,
  Sphere,
  Vector3 as ThreeVector3,
  type Group,
} from 'three'
import type * as THREE from 'three'
import { PublishedStaticAssetMount } from '@/components/digital-twin/scene/PublishedStaticAssetMount'
import { PublishedFloorPlanBasemapLayer } from '@/components/digital-twin/scene/PublishedFloorPlanBasemapLayer'
import { createPublishedStaticPalette } from '@/components/digital-twin/scene/palette'
import {
  PublishedStaticRecipeMount,
} from '@/components/digital-twin/scene/PublishedStaticRecipeMount'
import type { PublishedScenePackage } from '@/lib/digital-twin/publish'
import { loadPublishedStaticAssetManifest } from '@/lib/digital-twin/runtime/static/asset-manifest'
import { createRuntimeStaticChunkRegistry } from '@/lib/digital-twin/runtime/static/chunk-registry'
import {
  hasRuntimeStaticViewChanged,
  isRuntimeStaticChunkVisible,
} from '@/lib/digital-twin/runtime/static/visibility'

const STATIC_CHUNK_POSITION_EPSILON = 0.25
const STATIC_CHUNK_ROTATION_EPSILON = 0.00005

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
  const rootRef = useRef<THREE.Group>(null)
  const chunkGroupRefs = useRef(new Map<string, Group>())
  const lastCameraPositionRef = useRef(new ThreeVector3(Number.POSITIVE_INFINITY, 0, 0))
  const lastCameraQuaternionRef = useRef(new Quaternion())
  const lastProjectionMatrixRef = useRef(new Matrix4())
  const frustumRef = useRef(new Frustum())
  const projectionMatrixRef = useRef(new Matrix4())
  const sphereRef = useRef(new Sphere())

  function setChunkGroupRef(id: string, node: Group | null) {
    if (node) {
      chunkGroupRefs.current.set(id, node)
      return
    }

    chunkGroupRefs.current.delete(id)
  }

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

  useEffect(() => {
    lastCameraPositionRef.current.set(Number.POSITIVE_INFINITY, 0, 0)
    lastCameraQuaternionRef.current.identity()
    lastProjectionMatrixRef.current.identity()
  }, [assetManifest, staticChunkRegistry.length])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    root.traverse((object) => {
      if (object.type === 'Instance') return
      object.matrixAutoUpdate = false
      object.matrixWorldAutoUpdate = false
      object.updateMatrix()
    })
    root.updateMatrixWorld(true)
  }, [assetManifest, staticChunkRegistry.length])

  useFrame(({ camera }) => {
    if (staticChunkRegistry.length === 0) return

    const lastCameraPosition = lastCameraPositionRef.current
    const lastCameraQuaternion = lastCameraQuaternionRef.current
    const lastProjectionMatrix = lastProjectionMatrixRef.current

    if (
      !hasRuntimeStaticViewChanged(
        lastCameraPosition,
        lastCameraQuaternion,
        lastProjectionMatrix,
        camera.position,
        camera.quaternion,
        camera.projectionMatrix,
        STATIC_CHUNK_POSITION_EPSILON,
        STATIC_CHUNK_ROTATION_EPSILON
      )
    ) {
      return
    }

    lastCameraPosition.copy(camera.position)
    lastCameraQuaternion.copy(camera.quaternion)
    lastProjectionMatrix.copy(camera.projectionMatrix)

    const projectionMatrix = projectionMatrixRef.current
    projectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustumRef.current.setFromProjectionMatrix(projectionMatrix)

    for (const entry of staticChunkRegistry) {
      const node = chunkGroupRefs.current.get(entry.id)
      if (!node) continue

      const visible = isRuntimeStaticChunkVisible(entry, frustumRef.current, sphereRef.current)
      if (node.visible !== visible) {
        node.visible = visible
      }
    }
  })

  return (
    <group ref={rootRef} name="editor-static-environment">
      <PublishedFloorPlanBasemapLayer
        basemaps={publishedScenePackage.floorPlanBasemaps ?? []}
      />
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
              chunkRef={(node) => setChunkGroupRef(entry.id, node)}
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
            chunkRef={(node) => setChunkGroupRef(entry.id, node)}
          />
        )
      })}
    </group>
  )
})
