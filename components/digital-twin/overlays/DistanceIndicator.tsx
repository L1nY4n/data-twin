'use client'

import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { calculateDistance, formatDistance } from '@/lib/digital-twin/spatial-utils'
import type { Entity } from '@/lib/digital-twin/types'
import { SceneLine } from '@/components/digital-twin/scene/SceneLine'
import {
  OVERLAY_RENDER_ORDER,
  STABLE_TRANSPARENT_OVERLAY,
} from '@/lib/digital-twin/renderer/material-stability'

interface DistanceIndicatorProps {
  entityA: Entity
  entityB: Entity
  color?: string
  showLabel?: boolean
}

export function DistanceIndicator({
  entityA,
  entityB,
  color = '#f59e0b',
  showLabel = true,
}: DistanceIndicatorProps) {
  const distance = useMemo(() => 
    calculateDistance(entityA.position, entityB.position),
    [entityA.position, entityB.position]
  )

  const midpoint = useMemo(() => new THREE.Vector3(
    (entityA.position.x + entityB.position.x) / 2,
    Math.max(entityA.position.y, entityB.position.y) + 1,
    (entityA.position.z + entityB.position.z) / 2,
  ), [entityA.position, entityB.position])

  const points = useMemo(() => [
    new THREE.Vector3(entityA.position.x, entityA.position.y + 0.5, entityA.position.z),
    new THREE.Vector3(entityB.position.x, entityB.position.y + 0.5, entityB.position.z),
  ], [entityA.position, entityB.position])
  const linePositionArray = useMemo(
    () => new Float32Array(points.flatMap((p) => [p.x, p.y, p.z])),
    [points]
  )

  return (
    <group>
      <SceneLine
        positions={linePositionArray}
        renderOrder={OVERLAY_RENDER_ORDER.distance}
        color={color}
        opacity={0.9}
        depthWrite={STABLE_TRANSPARENT_OVERLAY.depthWrite}
        depthTest={STABLE_TRANSPARENT_OVERLAY.depthTest}
        toneMapped={STABLE_TRANSPARENT_OVERLAY.toneMapped}
      />
      {showLabel && (
        <Html position={midpoint} center style={{ pointerEvents: 'none' }}>
          <div className="rounded-md bg-background/90 px-2 py-1 text-xs font-medium shadow-lg">
            {formatDistance(distance)}
          </div>
        </Html>
      )}
    </group>
  )
}

// 显示选中实体到最近实体的距离
export function NearbyDistanceOverlay() {
  const selectedEntityId = useDigitalTwinStore((state) => state.selectedEntityId)
  const entities = useDigitalTwinStore((state) => state.entities)

  const nearbyConnections = useMemo(() => {
    if (!selectedEntityId) return []

    const selectedEntity = entities.get(selectedEntityId)
    if (!selectedEntity || selectedEntity.type === 'zone') return []

    const connections: { entity: Entity; distance: number }[] = []

    entities.forEach((entity) => {
      if (entity.id === selectedEntityId) return
      if (entity.type === 'zone') return

      const distance = calculateDistance(selectedEntity.position, entity.position)
      if (distance < 15) { // 只显示15米内的
        connections.push({ entity, distance })
      }
    })

    // 按距离排序，取最近的3个
    return connections.sort((a, b) => a.distance - b.distance).slice(0, 3)
  }, [selectedEntityId, entities])

  const selectedEntity = selectedEntityId ? entities.get(selectedEntityId) : null

  if (!selectedEntity || nearbyConnections.length === 0) return null

  return (
    <group>
      {nearbyConnections.map(({ entity }) => (
        <DistanceIndicator
          key={entity.id}
          entityA={selectedEntity}
          entityB={entity}
          color="#60a5fa"
        />
      ))}
    </group>
  )
}
