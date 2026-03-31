'use client'

import { useRef, useState } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import type { VehicleEntity } from '@/lib/digital-twin/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface VehicleMarkerProps {
  entity: VehicleEntity
  isSelected: boolean
  isHovered: boolean
}

const STATUS_COLORS = {
  active: '#22c55e',
  inactive: '#6b7280',
  warning: '#f59e0b',
  error: '#ef4444',
}

const VEHICLE_SIZES = {
  car: { width: 1.8, height: 1.2, depth: 4 },
  truck: { width: 2.4, height: 2.5, depth: 8 },
  forklift: { width: 1.2, height: 2, depth: 2.5 },
  agv: { width: 1, height: 0.4, depth: 1.5 },
  other: { width: 1.5, height: 1, depth: 3 },
}

const VEHICLE_COLORS = {
  car: '#3b82f6',
  truck: '#f59e0b',
  forklift: '#22c55e',
  agv: '#8b5cf6',
  other: '#6b7280',
}

export function VehicleMarker({ entity, isSelected, isHovered }: VehicleMarkerProps) {
  const meshRef = useRef<THREE.Group>(null)
  const [localHover, setLocalHover] = useState(false)
  const setSelectedEntity = useDigitalTwinStore((state) => state.setSelectedEntity)
  const setHoveredEntity = useDigitalTwinStore((state) => state.setHoveredEntity)

  const statusColor = STATUS_COLORS[entity.status]
  const vehicleColor = VEHICLE_COLORS[entity.vehicleType]
  const size = VEHICLE_SIZES[entity.vehicleType]
  const showLabel = isSelected || isHovered || localHover

  return (
    <group position={[entity.position.x, 0, entity.position.z]}>
      <group 
        ref={meshRef}
        rotation={[0, entity.rotation.y, 0]}
        onPointerEnter={(e) => {
          e.stopPropagation()
          setLocalHover(true)
          setHoveredEntity(entity.id)
          document.body.style.cursor = 'pointer'
        }}
        onPointerLeave={() => {
          setLocalHover(false)
          setHoveredEntity(null)
          document.body.style.cursor = 'auto'
        }}
        onClick={(e) => {
          e.stopPropagation()
          setSelectedEntity(isSelected ? null : entity.id)
        }}
      >
        {/* 车身 */}
        <mesh position={[0, size.height / 2, 0]} castShadow>
          <boxGeometry args={[size.width, size.height, size.depth]} />
          <meshStandardMaterial 
            color={isSelected ? '#60a5fa' : isHovered || localHover ? '#94a3b8' : vehicleColor}
            metalness={0.6}
            roughness={0.4}
          />
        </mesh>

        {/* 车轮 - 简化表示 */}
        {entity.vehicleType !== 'agv' && (
          <>
            <mesh position={[-size.width / 2 - 0.1, 0.3, size.depth / 3]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.3, 0.3, 0.2, 16]} />
              <meshStandardMaterial color="#1f2937" />
            </mesh>
            <mesh position={[size.width / 2 + 0.1, 0.3, size.depth / 3]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.3, 0.3, 0.2, 16]} />
              <meshStandardMaterial color="#1f2937" />
            </mesh>
            <mesh position={[-size.width / 2 - 0.1, 0.3, -size.depth / 3]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.3, 0.3, 0.2, 16]} />
              <meshStandardMaterial color="#1f2937" />
            </mesh>
            <mesh position={[size.width / 2 + 0.1, 0.3, -size.depth / 3]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.3, 0.3, 0.2, 16]} />
              <meshStandardMaterial color="#1f2937" />
            </mesh>
          </>
        )}

        {/* AGV特殊标记 */}
        {entity.vehicleType === 'agv' && (
          <mesh position={[0, size.height + 0.1, 0]}>
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshStandardMaterial 
              color={statusColor} 
              emissive={statusColor} 
              emissiveIntensity={0.8}
            />
          </mesh>
        )}

        {/* 前方向指示 */}
        <mesh position={[0, size.height / 2, size.depth / 2 + 0.2]}>
          <coneGeometry args={[0.2, 0.4, 8]} />
          <meshStandardMaterial 
            color={statusColor} 
            emissive={statusColor} 
            emissiveIntensity={0.5}
          />
        </mesh>
      </group>

      {/* 状态光环 */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[Math.max(size.width, size.depth) / 2 + 0.3, Math.max(size.width, size.depth) / 2 + 0.5, 32]} />
        <meshBasicMaterial 
          color={statusColor} 
          transparent 
          opacity={isSelected ? 0.6 : 0.3}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 选中高亮环 */}
      {isSelected && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(size.width, size.depth) / 2 + 0.6, Math.max(size.width, size.depth) / 2 + 0.7, 32]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* 标签 */}
      {showLabel && (
        <Html
          position={[0, size.height + 1.5, 0]}
          center
          distanceFactor={20}
          occlude={false}
          style={{ pointerEvents: 'none' }}
        >
          <div className={cn(
            "flex flex-col items-center gap-1 rounded-lg border bg-background/95 p-2 shadow-lg backdrop-blur-sm",
            "min-w-[140px] text-center"
          )}>
            <span className="text-xs font-medium text-foreground">{entity.name}</span>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {entity.plateNumber}
              </Badge>
              <Badge 
                variant="outline" 
                className="text-[10px] px-1.5 py-0"
                style={{ borderColor: statusColor, color: statusColor }}
              >
                {entity.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>速度: {entity.speed.toFixed(1)} m/s</span>
              <span>方向: {entity.heading.toFixed(0)}°</span>
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}
