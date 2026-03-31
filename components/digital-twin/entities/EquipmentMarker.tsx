'use client'

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import type { EquipmentEntity } from '@/lib/digital-twin/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface EquipmentMarkerProps {
  entity: EquipmentEntity
  isSelected: boolean
  isHovered: boolean
}

const STATUS_COLORS = {
  active: '#22c55e',
  inactive: '#6b7280',
  warning: '#f59e0b',
  error: '#ef4444',
}

export function EquipmentMarker({ entity, isSelected, isHovered }: EquipmentMarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const [localHover, setLocalHover] = useState(false)
  const setSelectedEntity = useDigitalTwinStore((state) => state.setSelectedEntity)
  const setHoveredEntity = useDigitalTwinStore((state) => state.setHoveredEntity)

  const statusColor = STATUS_COLORS[entity.status]
  const showLabel = isSelected || isHovered || localHover

  // 状态指示灯闪烁动画
  useFrame((state) => {
    if (glowRef.current) {
      const intensity = entity.status === 'warning' || entity.status === 'error'
        ? 0.5 + Math.sin(state.clock.elapsedTime * 4) * 0.5
        : 0.8
      const material = glowRef.current.material as THREE.MeshBasicMaterial
      material.opacity = intensity
    }
  })

  return (
    <group position={[entity.position.x, 0, entity.position.z]}>
      <group 
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
        {/* 设备主体 - 工业风格 */}
        <mesh ref={meshRef} position={[0, 1.5, 0]} castShadow>
          <boxGeometry args={[2, 3, 2]} />
          <meshStandardMaterial 
            color={isSelected ? '#60a5fa' : isHovered || localHover ? '#64748b' : '#374151'}
            metalness={0.8}
            roughness={0.3}
          />
        </mesh>

        {/* 设备底座 */}
        <mesh position={[0, 0.15, 0]} castShadow>
          <boxGeometry args={[2.4, 0.3, 2.4]} />
          <meshStandardMaterial color="#1f2937" metalness={0.9} roughness={0.2} />
        </mesh>

        {/* 控制面板 */}
        <mesh position={[0, 2, 1.01]}>
          <boxGeometry args={[1.2, 0.8, 0.05]} />
          <meshStandardMaterial color="#111827" metalness={0.5} roughness={0.5} />
        </mesh>

        {/* 状态指示灯 */}
        <mesh ref={glowRef} position={[0, 3.2, 0]}>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshBasicMaterial 
            color={statusColor} 
            transparent 
            opacity={0.8}
          />
        </mesh>

        {/* 状态光环 */}
        <mesh position={[0, 3.2, 0]}>
          <sphereGeometry args={[0.25, 16, 16]} />
          <meshBasicMaterial 
            color={statusColor} 
            transparent 
            opacity={0.3}
          />
        </mesh>

        {/* 散热口模拟 */}
        {Array.from({ length: 4 }, (_, i) => (
          <mesh key={i} position={[0.9, 1 + i * 0.4, 1.01]}>
            <boxGeometry args={[0.15, 0.1, 0.05]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
        ))}
      </group>

      {/* 地面投影 */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.5, 1.7, 32]} />
        <meshBasicMaterial 
          color={statusColor} 
          transparent 
          opacity={isSelected ? 0.6 : 0.25}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 选中高亮环 */}
      {isSelected && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.8, 1.9, 32]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* 标签 */}
      {showLabel && (
        <Html
          position={[0, 4, 0]}
          center
          distanceFactor={20}
          occlude={false}
          style={{ pointerEvents: 'none' }}
        >
          <div className={cn(
            "flex flex-col items-center gap-1.5 rounded-lg border bg-background/95 p-2.5 shadow-lg backdrop-blur-sm",
            "min-w-[160px] text-center"
          )}>
            <span className="text-xs font-medium text-foreground">{entity.name}</span>
            <Badge 
              variant="outline" 
              className="text-[10px] px-1.5 py-0"
              style={{ borderColor: statusColor, color: statusColor }}
            >
              {entity.status === 'active' ? '运行中' : 
               entity.status === 'warning' ? '告警' : 
               entity.status === 'error' ? '故障' : '停机'}
            </Badge>
            
            {/* 参数显示 */}
            <div className="flex flex-wrap justify-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
              {Object.entries(entity.parameters).slice(0, 3).map(([key, value]) => (
                <span key={key}>
                  {key}: {typeof value === 'number' ? value.toFixed(1) : String(value)}
                </span>
              ))}
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}
