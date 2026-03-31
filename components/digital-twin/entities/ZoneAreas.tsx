'use client'

import { useMemo, useState } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import type { ZoneEntity } from '@/lib/digital-twin/types'
import { calculatePolygonCenter } from '@/lib/digital-twin/spatial-utils'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

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
  const [isHovered, setIsHovered] = useState(false)
  const selectedEntityId = useDigitalTwinStore((state) => state.selectedEntityId)
  const setSelectedEntity = useDigitalTwinStore((state) => state.setSelectedEntity)
  const setHoveredEntity = useDigitalTwinStore((state) => state.setHoveredEntity)

  const isSelected = selectedEntityId === zone.id
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

  if (!shape) return null

  const color = new THREE.Color(zone.color)

  return (
    <group>
      {/* 区域填充 */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, 0.05, 0]}
        onPointerEnter={(e) => {
          e.stopPropagation()
          setIsHovered(true)
          setHoveredEntity(zone.id)
        }}
        onPointerLeave={() => {
          setIsHovered(false)
          setHoveredEntity(null)
        }}
        onClick={(e) => {
          e.stopPropagation()
          setSelectedEntity(isSelected ? null : zone.id)
        }}
      >
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial 
          color={zone.color} 
          transparent 
          opacity={isSelected ? 0.4 : isHovered ? 0.3 : 0.15}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 边界线 */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={boundaryPoints.length}
            array={new Float32Array(boundaryPoints.flatMap((p) => [p.x, p.y, p.z]))}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial 
          color={zone.color} 
          linewidth={2}
          transparent
          opacity={isSelected ? 1 : 0.7}
        />
      </line>

      {/* 边界高亮（选中时） */}
      {isSelected && (
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={boundaryPoints.length}
              array={new Float32Array(boundaryPoints.flatMap((p) => [p.x, p.y + 0.02, p.z]))}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#ffffff" linewidth={1} />
        </line>
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
        <Html
          position={[center.x, 0.5, center.z]}
          center
          distanceFactor={40}
          occlude={false}
          style={{ pointerEvents: 'none' }}
        >
          <span 
            className="text-[10px] font-medium opacity-60"
            style={{ color: zone.color }}
          >
            {zone.name}
          </span>
        </Html>
      )}
    </group>
  )
}
