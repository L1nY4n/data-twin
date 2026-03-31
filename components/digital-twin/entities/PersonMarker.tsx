'use client'

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import type { PersonEntity } from '@/lib/digital-twin/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface PersonMarkerProps {
  entity: PersonEntity
  isSelected: boolean
  isHovered: boolean
}

const STATUS_COLORS = {
  active: '#22c55e',
  inactive: '#6b7280',
  warning: '#f59e0b',
  error: '#ef4444',
}

export function PersonMarker({ entity, isSelected, isHovered }: PersonMarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [localHover, setLocalHover] = useState(false)
  const setSelectedEntity = useDigitalTwinStore((state) => state.setSelectedEntity)
  const setHoveredEntity = useDigitalTwinStore((state) => state.setHoveredEntity)

  const statusColor = STATUS_COLORS[entity.status]
  const showLabel = isSelected || isHovered || localHover

  // 悬浮动画
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.y = 
        entity.position.y + 0.8 + Math.sin(state.clock.elapsedTime * 2 + entity.id.charCodeAt(0)) * 0.05
    }
  })

  return (
    <group position={[entity.position.x, 0, entity.position.z]}>
      {/* 人员模型 - 简化的圆柱体+球体表示 */}
      <group rotation={[0, entity.rotation.y, 0]}>
        {/* 身体 */}
        <mesh position={[0, 0.5, 0]} castShadow>
          <cylinderGeometry args={[0.25, 0.3, 1, 16]} />
          <meshStandardMaterial 
            color={isSelected ? '#60a5fa' : isHovered || localHover ? '#94a3b8' : '#64748b'}
            metalness={0.3}
            roughness={0.7}
          />
        </mesh>

        {/* 头部 */}
        <mesh 
          ref={meshRef}
          position={[0, 1.3, 0]} 
          castShadow
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
          <sphereGeometry args={[0.25, 16, 16]} />
          <meshStandardMaterial 
            color={isSelected ? '#60a5fa' : isHovered || localHover ? '#94a3b8' : '#94a3b8'}
            metalness={0.3}
            roughness={0.7}
          />
        </mesh>

        {/* 方向指示器 */}
        <mesh position={[0.35, 0.8, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.1, 0.2, 8]} />
          <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={0.5} />
        </mesh>
      </group>

      {/* 状态光环 */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.5, 32]} />
        <meshBasicMaterial 
          color={statusColor} 
          transparent 
          opacity={isSelected ? 0.8 : 0.4}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 选中高亮环 */}
      {isSelected && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.6, 0.65, 32]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* 标签 */}
      {showLabel && (
        <Html
          position={[0, 2, 0]}
          center
          distanceFactor={20}
          occlude={false}
          style={{ pointerEvents: 'none' }}
        >
          <div className={cn(
            "flex flex-col items-center gap-1 rounded-lg border bg-background/95 p-2 shadow-lg backdrop-blur-sm",
            "min-w-[120px] text-center"
          )}>
            <span className="text-xs font-medium text-foreground">{entity.name}</span>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {entity.role}
              </Badge>
              <Badge 
                variant="outline" 
                className="text-[10px] px-1.5 py-0"
                style={{ borderColor: statusColor, color: statusColor }}
              >
                {entity.currentActivity || entity.status}
              </Badge>
            </div>
            <span className="text-[10px] text-muted-foreground">{entity.department}</span>
          </div>
        </Html>
      )}
    </group>
  )
}
