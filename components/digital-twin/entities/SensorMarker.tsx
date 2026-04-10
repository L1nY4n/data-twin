'use client'

import { memo } from 'react'
import type { SensorEntity } from '@/lib/digital-twin/types'
import {
  OVERLAY_RENDER_ORDER,
  STABLE_DOUBLE_SIDED_OVERLAY,
  STABLE_TRANSPARENT_OVERLAY,
} from '@/lib/digital-twin/renderer/material-stability'
import {
  createMutedSpriteInfoBadge,
  createStatusSpriteInfoBadge,
  SpriteInfoCard,
} from '@/components/digital-twin/scene/SpriteInfoCard'
import { SpriteTextLabel } from '@/components/digital-twin/scene/SpriteTextLabel'

interface SensorMarkerProps {
  entity: SensorEntity
  isSelected: boolean
  isHovered: boolean
}

const STATUS_COLORS = {
  active: '#22c55e',
  inactive: '#6b7280',
  warning: '#f59e0b',
  error: '#ef4444',
}

const SENSOR_COLORS: Record<SensorEntity['sensorType'], string> = {
  temperature: '#f97316',
  pressure: '#0ea5e9',
  flow: '#14b8a6',
  gas: '#84cc16',
  level: '#a855f7',
  humidity: '#06b6d4',
  other: '#94a3b8',
}

const SENSOR_TYPE_LABELS: Record<SensorEntity['sensorType'], string> = {
  temperature: '温度',
  pressure: '压力',
  flow: '流量',
  gas: '气体',
  level: '液位',
  humidity: '湿度',
  other: '其他',
}

export const SensorMarker = memo(function SensorMarker({
  entity,
  isSelected,
  isHovered,
}: SensorMarkerProps) {
  const statusColor = STATUS_COLORS[entity.status]
  const bodyColor = SENSOR_COLORS[entity.sensorType]
  const labelMode = entity.labelMode ?? 'html'
  const showLabel = isSelected || isHovered || labelMode !== 'hidden'

  return (
    <group
      position={[entity.position.x, entity.position.y, entity.position.z]}
      userData={{ pickable: true, entityId: entity.id }}
    >
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 1.2, 12]} />
        <meshStandardMaterial color="#64748b" metalness={0.3} roughness={0.7} />
      </mesh>

      <mesh position={[0, 1.3, 0]} castShadow>
        <boxGeometry args={[0.42, 0.32, 0.24]} />
        <meshStandardMaterial
          color={isSelected ? '#60a5fa' : isHovered ? '#cbd5e1' : bodyColor}
          metalness={0.25}
          roughness={0.55}
        />
      </mesh>

      <mesh position={[0, 1.3, 0.14]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial
          color={statusColor}
          emissive={statusColor}
          emissiveIntensity={0.8}
          opacity={0.9}
          {...STABLE_TRANSPARENT_OVERLAY}
        />
      </mesh>

      <mesh
        position={[0, 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={OVERLAY_RENDER_ORDER.entityRing}
      >
        <ringGeometry args={[0.35, 0.45, 32]} />
        <meshStandardMaterial
          color={statusColor}
          emissive={statusColor}
          emissiveIntensity={0.18}
          metalness={0}
          roughness={0.95}
          opacity={isSelected ? 0.7 : 0.3}
          {...STABLE_DOUBLE_SIDED_OVERLAY}
        />
      </mesh>

      {isSelected && (
        <mesh
          position={[0, 0.03, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={OVERLAY_RENDER_ORDER.entitySelectionRing}
        >
          <ringGeometry args={[0.52, 0.58, 32]} />
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

      {showLabel && labelMode === 'html' && (
        <SpriteInfoCard
          position={[0, 1.95, 0]}
          title={entity.name}
          badges={[
            createMutedSpriteInfoBadge(SENSOR_TYPE_LABELS[entity.sensorType]),
            createStatusSpriteInfoBadge(entity.status, statusColor),
          ]}
          lines={[`${entity.reading.toFixed(2)} ${entity.unit}`]}
          scale={0.86}
          minWidth={220}
        />
      )}

      {showLabel && labelMode === 'sprite' && (
        <SpriteTextLabel
          position={[0, 1.8, 0]}
          text={entity.name}
          color="#ccfbf1"
          outlineColor="#0f172a"
          scale={0.85}
        />
      )}
    </group>
  )
})

SensorMarker.displayName = 'SensorMarker'
