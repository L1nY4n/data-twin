'use client'

import { memo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import type { PersonEntity } from '@/lib/digital-twin/types'
import {
  OVERLAY_RENDER_ORDER,
  STABLE_DOUBLE_SIDED_OVERLAY,
} from '@/lib/digital-twin/renderer/material-stability'
import {
  createMutedSpriteInfoBadge,
  createStatusSpriteInfoBadge,
  SpriteInfoCard,
} from '@/components/digital-twin/scene/SpriteInfoCard'
import { SpriteTextLabel } from '@/components/digital-twin/scene/SpriteTextLabel'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'

interface PersonMarkerProps {
  entity: PersonEntity
  isSelected: boolean
  isHovered: boolean
  showModel?: boolean
}

const STATUS_COLORS = {
  active: '#22c55e',
  inactive: '#6b7280',
  warning: '#f59e0b',
  error: '#ef4444',
}

export const PersonMarker = memo(function PersonMarker({
  entity,
  isSelected,
  isHovered,
  showModel = true,
}: PersonMarkerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const statusColor = STATUS_COLORS[entity.status]
  const labelMode = entity.labelMode ?? 'html'
  const showLabel = isSelected || isHovered || labelMode !== 'hidden'

  useFrame(() => {
    if (!groupRef.current || (!isSelected && !isHovered)) return
    const snapshot = useDigitalTwinStore.getState().getEcsSnapshotById(entity.id)
    const position = snapshot?.position ?? entity.position
    groupRef.current.position.set(position.x, position.y, position.z)
  })

  return (
    <group
      ref={groupRef}
      position={[entity.position.x, entity.position.y, entity.position.z]}
      userData={{ pickable: true, entityId: entity.id }}
    >
      {showModel && (
        <group rotation={[0, entity.rotation.y, 0]}>
          <mesh position={[0, 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.25, 0.3, 1, 16]} />
            <meshStandardMaterial
              color={isSelected ? '#60a5fa' : isHovered ? '#94a3b8' : '#64748b'}
              metalness={0.3}
              roughness={0.7}
            />
          </mesh>

          <mesh position={[0, 1.3, 0]} castShadow>
            <sphereGeometry args={[0.25, 16, 16]} />
            <meshStandardMaterial
              color={isSelected ? '#60a5fa' : isHovered ? '#94a3b8' : '#94a3b8'}
              metalness={0.3}
              roughness={0.7}
            />
          </mesh>

          <mesh position={[0.35, 0.8, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.1, 0.2, 8]} />
            <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={0.5} />
          </mesh>
        </group>
      )}

      {/* 状态光环 */}
      <mesh
        position={[0, 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={OVERLAY_RENDER_ORDER.entityRing}
      >
        <ringGeometry
          args={[0.4, 0.5, 32]}
          onUpdate={(geometry) => {
            if (geometry.index) geometry.setDrawRange(0, geometry.index.count)
          }}
        />
        <meshStandardMaterial
          color={statusColor} 
          emissive={statusColor}
          emissiveIntensity={0.2}
          metalness={0}
          roughness={0.95}
          opacity={isSelected ? 0.8 : 0.4}
          {...STABLE_DOUBLE_SIDED_OVERLAY}
        />
      </mesh>

      {/* 选中高亮环 */}
      {isSelected && (
        <mesh
          position={[0, 0.03, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={OVERLAY_RENDER_ORDER.entitySelectionRing}
        >
          <ringGeometry
            args={[0.6, 0.65, 32]}
            onUpdate={(geometry) => {
              if (geometry.index) geometry.setDrawRange(0, geometry.index.count)
            }}
          />
          <meshStandardMaterial
            color="#3b82f6"
            emissive="#3b82f6"
            emissiveIntensity={0.24}
            metalness={0}
            roughness={0.95}
            opacity={0.8}
            {...STABLE_DOUBLE_SIDED_OVERLAY}
          />
        </mesh>
      )}

      {/* 标签 */}
      {showLabel && labelMode === 'html' && (
        <SpriteInfoCard
          position={[0, 2.05, 0]}
          title={entity.name}
          badges={[
            createMutedSpriteInfoBadge(entity.role),
            createStatusSpriteInfoBadge(entity.currentActivity || entity.status, statusColor),
          ]}
          lines={[entity.department]}
          scale={0.95}
          minWidth={210}
        />
      )}

      {showLabel && labelMode === 'sprite' && (
        <SpriteTextLabel
          position={[0, 1.9, 0]}
          text={entity.name}
          color="#dbeafe"
          outlineColor="#0f172a"
          scale={0.9}
        />
      )}
    </group>
  )
})

PersonMarker.displayName = 'PersonMarker'
