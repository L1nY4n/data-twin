'use client'

import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import { Box3, InstancedMesh, Object3D, Sphere, Vector3 } from 'three'
import { useDigitalTwinStore, useSelectedStaticFeature } from '@/lib/digital-twin/store'
import {
  getRuntimePublishedStaticFeature,
  type RuntimePublishedStaticFeature,
} from '@/lib/digital-twin/runtime/static/features'

const FEATURE_PROXY_TEMP = new Object3D()
const FEATURE_PROXY_MIN = new Vector3()
const FEATURE_PROXY_MAX = new Vector3()
const FEATURE_PROXY_LOWER = new Vector3()
const FEATURE_PROXY_UPPER = new Vector3()
const FEATURE_PROXY_CENTER = new Vector3()
const FEATURE_PROXY_SIZE = new Vector3()

interface StaticFeatureChunkBatch {
  chunkId: string
  featureIds: string[]
  transforms: Array<{
    position: [number, number, number]
    scale: [number, number, number]
  }>
}

function createChunkBatches(features: RuntimePublishedStaticFeature[]): StaticFeatureChunkBatch[] {
  const byChunk = new Map<string, StaticFeatureChunkBatch>()

  for (const entry of features) {
    const batch = byChunk.get(entry.chunk.id) ?? {
      chunkId: entry.chunk.id,
      featureIds: [],
      transforms: [],
    }

    batch.featureIds.push(entry.feature.id)
    batch.transforms.push({
      position: [entry.feature.center.x, entry.feature.center.y, entry.feature.center.z],
      scale: [
        Math.max(entry.feature.width, 0.5),
        Math.max(entry.feature.height, 0.5),
        Math.max(entry.feature.depth, 0.5),
      ],
    })

    byChunk.set(entry.chunk.id, batch)
  }

  return [...byChunk.values()]
}

function applyBounds(mesh: InstancedMesh, transforms: StaticFeatureChunkBatch['transforms']) {
  if (transforms.length === 0) return

  FEATURE_PROXY_MIN.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
  FEATURE_PROXY_MAX.set(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)

  transforms.forEach((transform) => {
    const [x, y, z] = transform.position
    const [sx, sy, sz] = transform.scale
    FEATURE_PROXY_LOWER.set(x - sx / 2, y - sy / 2, z - sz / 2)
    FEATURE_PROXY_UPPER.set(x + sx / 2, y + sy / 2, z + sz / 2)
    FEATURE_PROXY_MIN.min(FEATURE_PROXY_LOWER)
    FEATURE_PROXY_MAX.max(FEATURE_PROXY_UPPER)
  })

  const box = new Box3().set(FEATURE_PROXY_MIN, FEATURE_PROXY_MAX)
  mesh.boundingBox = box
  mesh.boundingSphere = new Sphere(
    box.getCenter(FEATURE_PROXY_CENTER).clone(),
    box.getSize(FEATURE_PROXY_SIZE).length() / 2
  )
}

const StaticFeatureChunkProxy = memo(function StaticFeatureChunkProxy({
  batch,
}: {
  batch: StaticFeatureChunkBatch
}) {
  const meshRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    if (!meshRef.current) return

    batch.transforms.forEach((transform, index) => {
      FEATURE_PROXY_TEMP.position.set(...transform.position)
      FEATURE_PROXY_TEMP.scale.set(...transform.scale)
      FEATURE_PROXY_TEMP.rotation.set(0, 0, 0)
      FEATURE_PROXY_TEMP.updateMatrix()
      meshRef.current!.setMatrixAt(index, FEATURE_PROXY_TEMP.matrix)
    })

    meshRef.current.instanceMatrix.needsUpdate = true
    meshRef.current.frustumCulled = true
    applyBounds(meshRef.current, batch.transforms)
  }, [batch])

  if (batch.featureIds.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, batch.featureIds.length]}
      userData={{ pickable: true, staticFeatureIds: batch.featureIds }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </instancedMesh>
  )
})

function StaticFeatureSelectionOverlay() {
  const selectedFeature = useSelectedStaticFeature()
  const hoveredFeatureId = useDigitalTwinStore((state) => state.hoveredStaticFeatureId)
  const staticFeatureRegistry = useDigitalTwinStore((state) => state.staticFeatureRegistry)
  const hoveredFeature = useMemo(
    () =>
      hoveredFeatureId && selectedFeature?.feature.id !== hoveredFeatureId
        ? getRuntimePublishedStaticFeature(hoveredFeatureId, staticFeatureRegistry)
        : null,
    [hoveredFeatureId, selectedFeature?.feature.id, staticFeatureRegistry]
  )

  const overlayFeatures = [selectedFeature, hoveredFeature].filter(Boolean)
  if (overlayFeatures.length === 0) return null

  return (
    <group>
      {overlayFeatures.map((entry, index) => {
        if (!entry) return null
        const isSelected = entry.feature.id === selectedFeature?.feature.id
        return (
          <mesh
            key={`${entry.feature.id}:${index}`}
            position={[entry.feature.center.x, entry.feature.center.y, entry.feature.center.z]}
            renderOrder={34}
          >
            <boxGeometry
              args={[
                entry.feature.width + 0.8,
                entry.feature.height + 0.8,
                entry.feature.depth + 0.8,
              ]}
            />
            <meshStandardMaterial
              color={isSelected ? '#60a5fa' : '#93c5fd'}
              emissive={isSelected ? '#60a5fa' : '#93c5fd'}
              emissiveIntensity={isSelected ? 0.2 : 0.08}
              metalness={0}
              roughness={0.9}
              transparent
              opacity={isSelected ? 0.2 : 0.08}
              depthWrite={false}
              wireframe
            />
          </mesh>
        )
      })}
    </group>
  )
}

export const PublishedStaticFeaturePickingLayer = memo(function PublishedStaticFeaturePickingLayer() {
  const staticFeatureRegistry = useDigitalTwinStore((state) => state.staticFeatureRegistry)
  const chunkBatches = useMemo(
    () => createChunkBatches(staticFeatureRegistry.entries),
    [staticFeatureRegistry]
  )

  return (
    <group name="published-static-feature-picking-layer">
      {chunkBatches.map((batch) => (
        <StaticFeatureChunkProxy key={batch.chunkId} batch={batch} />
      ))}
      <StaticFeatureSelectionOverlay />
    </group>
  )
})
