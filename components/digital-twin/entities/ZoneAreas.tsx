'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import type { ZoneEntity } from '@/lib/digital-twin/types'
import { calculatePolygonCenter } from '@/lib/digital-twin/spatial-utils'
import { SceneLine } from '@/components/digital-twin/scene/SceneLine'
import { SpriteInfoCard } from '@/components/digital-twin/scene/SpriteInfoCard'
import { SpriteTextLabel } from '@/components/digital-twin/scene/SpriteTextLabel'
import {
  OVERLAY_RENDER_ORDER,
  STABLE_DOUBLE_SIDED_OVERLAY,
} from '@/lib/digital-twin/renderer/material-stability'
import { usePickGroupRegistration } from '../scene/ViewerRuntimeBridge'

function zoneTypeLabel(zoneType: ZoneEntity['zoneType']) {
  return zoneType === 'work'
    ? '作业区'
    : zoneType === 'storage'
      ? '存储区'
      : zoneType === 'passage'
        ? '通道'
        : zoneType === 'restricted'
          ? '限制区'
          : zoneType === 'danger'
            ? '危险区'
            : zoneType
}

export function ZoneAreas() {
  const zones = useDigitalTwinStore((state) => state.entityBuckets.zones)
  const entityFilters = useDigitalTwinStore((state) => state.entityFilters)

  const visibleZones = useMemo(
    () => zones.filter((zone) => entityFilters.types.includes('zone') && zone.visible),
    [entityFilters.types, zones]
  )

  return (
    <group>
      {visibleZones.map((zone) => (
        <ZoneArea key={zone.id} zone={zone} />
      ))}
    </group>
  )
}

interface ZoneAreaProps {
  zone: ZoneEntity
}

function ZoneArea({ zone }: ZoneAreaProps) {
  const groupRef = useRef<THREE.Group>(null)
  const pickRefs = useMemo(() => [groupRef], [])
  const selectedEntityId = useDigitalTwinStore((state) => state.selectedEntityId)
  const hoveredEntityId = useDigitalTwinStore((state) => state.hoveredEntityId)

  const isSelected = selectedEntityId === zone.id
  const isHovered = hoveredEntityId === zone.id
  const showLabel = isSelected || isHovered

  // 创建区域形状
  const shape = useMemo(() => {
    if (zone.boundary.length < 3) return null

    const s = new THREE.Shape()
    s.moveTo(zone.boundary[0].x, zone.boundary[0].z)
    for (let i = 1; i < zone.boundary.length; i++) {
      s.lineTo(zone.boundary[i].x, zone.boundary[i].z)
    }
    s.closePath()
    return s
  }, [zone.boundary])
  const fillGeometry = useMemo(() => {
    if (!shape) return null
    const geometry = new THREE.ShapeGeometry(shape)
    if (!geometry.index) return geometry

    const nonIndexedGeometry = geometry.toNonIndexed()
    geometry.dispose()
    return nonIndexedGeometry
  }, [shape])

  useEffect(() => () => fillGeometry?.dispose(), [fillGeometry])

  // 区域中心点
  const center = useMemo(() => calculatePolygonCenter(zone.boundary), [zone.boundary])
  const pickBounds = useMemo(() => {
    let maxDistance = 1
    for (const point of zone.boundary) {
      const distance = Math.hypot(point.x - center.x, point.z - center.z)
      if (distance > maxDistance) maxDistance = distance
    }
    return new THREE.Sphere(new THREE.Vector3(center.x, 0.25, center.z), maxDistance + 1)
  }, [center.x, center.z, zone.boundary])

  usePickGroupRegistration({
    id: `zone:${zone.id}`,
    refs: pickRefs,
    bounds: pickBounds,
    priority: 'entity',
    enabled: Boolean(shape),
    dependencyKey: `${zone.id}:${zone.boundary.length}`,
  })

  // 边界线点
  const boundaryPoints = useMemo(() => {
    const points = zone.boundary.map((p) => new THREE.Vector3(p.x, 0.1, p.z))
    if (points.length > 0) {
      points.push(points[0].clone()) // 闭合
    }
    return points
  }, [zone.boundary])
  const boundaryPositionArray = useMemo(
    () => new Float32Array(boundaryPoints.flatMap((p) => [p.x, p.y, p.z])),
    [boundaryPoints]
  )
  const boundaryHighlightArray = useMemo(
    () => new Float32Array(boundaryPoints.flatMap((p) => [p.x, p.y + 0.02, p.z])),
    [boundaryPoints]
  )

  if (!shape) return null

  return (
    <group ref={groupRef} userData={{ pickable: true, entityId: zone.id }}>
      {/* 区域填充 */}
      {/* Selected zones rely on boundary/label overlays because WebGPU is unstable with
          the translucent shape fill on this interaction path. */}
      {!isSelected && fillGeometry && (
        <mesh 
          rotation={[-Math.PI / 2, 0, 0]} 
          position={[0, 0.05, 0]}
          renderOrder={OVERLAY_RENDER_ORDER.zoneFill}
        >
          <primitive object={fillGeometry} attach="geometry" />
          <meshBasicMaterial
            color={zone.color}
            opacity={0.18}
            {...STABLE_DOUBLE_SIDED_OVERLAY}
          />
        </mesh>
      )}

      {/* 边界线 */}
      <SceneLine
        positions={boundaryPositionArray}
        renderOrder={OVERLAY_RENDER_ORDER.zoneBoundary}
        color={zone.color}
        opacity={isSelected ? 1 : 0.7}
        depthWrite={false}
        depthTest={false}
      />

      {/* 边界高亮（选中时） */}
      {isSelected && (
        <SceneLine
          positions={boundaryHighlightArray}
          renderOrder={OVERLAY_RENDER_ORDER.zoneBoundary + 1}
          color="#ffffff"
          depthWrite={false}
          depthTest={false}
        />
      )}

      {/* 区域标签 */}
      {showLabel && (
        <SpriteInfoCard
          position={[center.x, 2, center.z]}
          title={zone.name}
          badges={[
            {
              text: zoneTypeLabel(zone.zoneType),
              backgroundColor: `${zone.color}1a`,
              borderColor: `${zone.color}aa`,
              textColor: zone.color,
            },
          ]}
          lines={
            zone.capacity
              ? [`容量: ${zone.currentOccupancy || 0}/${zone.capacity}`]
              : []
          }
          scale={0.95}
          minWidth={220}
        />
      )}

      {/* 区域名称（始终显示） */}
      {!showLabel && (
        <SpriteTextLabel
          position={[center.x, 0.9, center.z]}
          text={zone.name}
          color={zone.color}
          outlineColor="#0f172a"
          scale={0.95}
          opacity={0.72}
        />
      )}
    </group>
  )
}
