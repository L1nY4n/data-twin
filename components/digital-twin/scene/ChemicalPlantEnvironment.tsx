'use client'

import { Component, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Frustum, Matrix4, Quaternion, Sphere, Vector3 as ThreeVector3 } from 'three'
import type * as THREE from 'three'
import type { PublishedStaticAssetManifest } from '@/lib/digital-twin/publish'
import { loadPublishedStaticAssetManifest } from '@/lib/digital-twin/runtime/static/asset-manifest'
import {
  hasRuntimeStaticViewChanged,
  isRuntimeStaticChunkVisible,
} from '@/lib/digital-twin/runtime/static/visibility'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { AuthoredStaticAssetLayer } from './AuthoredStaticAssetLayer'
import { createPublishedStaticPalette } from './palette'
import { PublishedStaticAssetMount } from './PublishedStaticAssetMount'
import { PublishedFloorPlanBasemapLayer } from './PublishedFloorPlanBasemapLayer'
import {
  PublishedStaticRecipeMount,
} from './PublishedStaticRecipeMount'

interface ChemicalPlantEnvironmentProps {
  isDark: boolean
}

interface StaticChunkAssetBoundaryProps {
  children: ReactNode
  fallback: ReactNode
}

interface StaticChunkAssetBoundaryState {
  hasError: boolean
}
const STATIC_CHUNK_POSITION_EPSILON = 0.25
const STATIC_CHUNK_ROTATION_EPSILON = 0.00005

class StaticChunkAssetBoundary extends Component<
  StaticChunkAssetBoundaryProps,
  StaticChunkAssetBoundaryState
> {
  override state: StaticChunkAssetBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError() {
    return {
      hasError: true,
    }
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback
    }

    return this.props.children
  }
}

export const ChemicalPlantEnvironment = memo(function ChemicalPlantEnvironment({
  isDark,
}: ChemicalPlantEnvironmentProps) {
  const qualityProfile = useDigitalTwinStore((state) => state.qualityProfile)
  const publishedScenePackage = useDigitalTwinStore((state) => state.publishedScenePackage)
  const staticChunkRegistry = useDigitalTwinStore((state) => state.staticChunkRegistry)
  const authoredStaticAssetsMap = useDigitalTwinStore((state) => state.authoredStaticAssets)
  const palette = useMemo(() => createPublishedStaticPalette(isDark), [isDark])
  const authoredStaticAssets = useMemo(
    () => [...authoredStaticAssetsMap.values()],
    [authoredStaticAssetsMap]
  )
  const lodDistances: [number, number] = qualityProfile === 'performance' ? [0, 280] : [0, 420]
  const [assetManifest, setAssetManifest] = useState<PublishedStaticAssetManifest | null | undefined>(
    undefined
  )
  const rootRef = useRef<THREE.Group>(null)
  const chunkGroupRefs = useRef(new Map<string, THREE.Group>())
  const lastCameraPositionRef = useRef(new ThreeVector3(Number.POSITIVE_INFINITY, 0, 0))
  const lastCameraQuaternionRef = useRef(new Quaternion())
  const lastProjectionMatrixRef = useRef(new Matrix4())
  const frustumRef = useRef(new Frustum())
  const projectionMatrixRef = useRef(new Matrix4())
  const sphereRef = useRef(new Sphere())

  function setChunkGroupRef(id: string, node: THREE.Group | null) {
    if (node) {
      chunkGroupRefs.current.set(id, node)
      return
    }

    chunkGroupRefs.current.delete(id)
  }

  useEffect(() => {
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
  }, [publishedScenePackage.staticAssetManifestUrl])

  useEffect(() => {
    lastCameraPositionRef.current.set(Number.POSITIVE_INFINITY, 0, 0)
    lastCameraQuaternionRef.current.identity()
    lastProjectionMatrixRef.current.identity()
  }, [assetManifest, staticChunkRegistry.length])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    // Freeze immutable scene transforms so the renderer stops recomputing them every frame.
    root.traverse((object) => {
      if (object.type === 'Instance') return
      object.matrixAutoUpdate = false
      object.matrixWorldAutoUpdate = false
      object.updateMatrix()
    })
    root.updateMatrixWorld(true)
  }, [assetManifest, authoredStaticAssets, staticChunkRegistry.length])

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
    <group ref={rootRef} name="chemical-plant-campus">
      <PublishedFloorPlanBasemapLayer
        basemaps={publishedScenePackage.floorPlanBasemaps ?? []}
      />
      {staticChunkRegistry.map((entry) => {
        const assetEntry = assetManifest?.chunks[entry.id]

        if (assetEntry) {
          const fallback = (
            <PublishedStaticRecipeMount
              key={`${entry.id}:fallback`}
              recipe={entry.chunk.renderRecipe}
              palette={palette}
              distances={entry.renderer === 'campus-sector-cluster' ? lodDistances : undefined}
              chunkRef={(node) => setChunkGroupRef(entry.id, node)}
            />
          )

          return (
            <StaticChunkAssetBoundary key={entry.id} fallback={fallback}>
              <PublishedStaticAssetMount
                assets={assetEntry}
                palette={palette}
                distances={entry.renderer === 'campus-sector-cluster' ? lodDistances : undefined}
                chunkRef={(node) => setChunkGroupRef(entry.id, node)}
              />
            </StaticChunkAssetBoundary>
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
            distances={entry.renderer === 'campus-sector-cluster' ? lodDistances : undefined}
            chunkRef={(node) => setChunkGroupRef(entry.id, node)}
          />
        )
      })}
      <AuthoredStaticAssetLayer assets={authoredStaticAssets} palette={palette} />
    </group>
  )
})
