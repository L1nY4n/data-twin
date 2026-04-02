'use client'

import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import type { ZoneEntity } from '@/lib/digital-twin/types'
import { calculatePolygonCenter } from '@/lib/digital-twin/spatial-utils'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { SceneLine } from '@/components/digital-twin/scene/SceneLine'
import { SpriteTextLabel } from '@/components/digital-twin/scene/SpriteTextLabel'
import {
  OVERLAY_RENDER_ORDER,
  STABLE_DOUBLE_SIDED_OVERLAY,
} from '@/lib/digital-twin/renderer/material-stability'

export function ZoneAreas() {
  const entities = useDigitalTwinStore((state) => state.entities)
  const entityFilters = useDigitalTwinStore((state) => state.entityFilters)

  const zones = useMemo(() => {
    const result: ZoneEntity[] = []
    entities.forEach((entity) => {
      if (entity.type === 'zone' && entityFilters.types.includes('zone') && entity.visible) {
        result.push(entity as ZoneEntity)
      }
    })
    return result
  }, [entities, entityFilters])

  return (
    <group>
      {zones.map((zone) => (
        <ZoneArea key={zone.id} zone={zone} />
      ))}
    </group>
  )
}

interface ZoneAreaProps {
  zone: ZoneEntity
}

function ZoneArea({ zone }: ZoneAreaProps) {
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

  // 区域中心点
  const center = useMemo(() => calculatePolygonCenter(zone.boundary), [zone.boundary])

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
    <group userData={{ pickable: true, entityId: zone.id }}>
      {/* 区域填充 */}
      {/* Selected zones rely on boundary/label overlays because WebGPU is unstable with
          the translucent shape fill on this interaction path. */}
      {!isSelected && (
        <mesh 
          rotation={[-Math.PI / 2, 0, 0]} 
          position={[0, 0.05, 0]}
          renderOrder={OVERLAY_RENDER_ORDER.zoneFill}
        >
          <shapeGeometry
            args={[shape]}
            onUpdate={(geometry) => {
              if (geometry.index) geometry.setDrawRange(0, geometry.index.count)
            }}
          />
          <meshStandardMaterial
            color={zone.color}
            emissive={zone.color}
            emissiveIntensity={0.05}
            metalness={0.02}
            roughness={0.96}
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
        <Html
          position={[center.x, 2, center.z]}
          center
          distanceFactor={30}
          occlude={false}
          style={{ pointerEvents: 'none' }}
        >
          <div className={cn(
            "flex flex-col items-center gap-1 rounded-lg border bg-background/95 p-2 shadow-lg backdrop-blur-sm",
            "min-w-[120px] text-center"
          )}>
            <span className="text-xs font-medium text-foreground">{zone.name}</span>
            <Badge 
              variant="outline" 
              className="text-[10px] px-1.5 py-0"
              style={{ borderColor: zone.color, color: zone.color }}
            >
              {zone.zoneType === 'work' ? '作业区' :
               zone.zoneType === 'storage' ? '存储区' :
               zone.zoneType === 'passage' ? '通道' :
               zone.zoneType === 'restricted' ? '限制区' :
               zone.zoneType === 'danger' ? '危险区' : zone.zoneType}
            </Badge>
            {zone.capacity && (
              <span className="text-[10px] text-muted-foreground">
                容量: {zone.currentOccupancy || 0}/{zone.capacity}
              </span>
            )}
          </div>
        </Html>
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
