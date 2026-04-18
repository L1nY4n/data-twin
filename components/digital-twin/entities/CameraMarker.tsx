'use client'

import { memo } from 'react'
import type { CameraEntity } from '@/lib/digital-twin/types'
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
import { resolveRenderablePosition, resolveRenderableRotation } from './render-transform'

interface CameraMarkerProps {
  entity: CameraEntity
  isSelected: boolean
  isHovered: boolean
  fullTransform?: boolean
}

const STATUS_COLORS = {
  active: '#22c55e',
  inactive: '#6b7280',
  warning: '#f59e0b',
  error: '#ef4444',
}

const CAMERA_COLORS: Record<CameraEntity['cameraType'], string> = {
  fixed: '#ef4444',
  dome: '#f97316',
  ptz: '#8b5cf6',
  thermal: '#eab308',
}

const CAMERA_TYPE_LABELS: Record<CameraEntity['cameraType'], string> = {
  fixed: '固定枪机',
  dome: '半球',
  ptz: '云台',
  thermal: '热成像',
}

export const CameraMarker = memo(function CameraMarker({
  entity,
  isSelected,
  isHovered,
  fullTransform = false,
}: CameraMarkerProps) {
  const statusColor = STATUS_COLORS[entity.status]
  const bodyColor = CAMERA_COLORS[entity.cameraType]
  const labelMode = entity.labelMode ?? 'html'
  const showLabel = isSelected || isHovered || labelMode !== 'hidden'
  const range = entity.range ?? 18

  return (
    <group
      position={resolveRenderablePosition(entity.position, { fullTransform })}
      userData={{ pickable: true, entityId: entity.id }}
    >
      <group rotation={resolveRenderableRotation(entity.rotation, { fullTransform })}>
        <mesh position={[0, 1, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.08, 2, 12]} />
          <meshStandardMaterial color="#475569" metalness={0.4} roughness={0.65} />
        </mesh>

        <mesh position={[0, 2.05, 0]} castShadow>
          <boxGeometry args={[0.32, 0.18, 0.32]} />
          <meshStandardMaterial
            color={isSelected ? '#60a5fa' : isHovered ? '#cbd5e1' : '#0f172a'}
            metalness={0.45}
            roughness={0.45}
          />
        </mesh>

        <mesh position={[0, 2.03, 0.32]} castShadow>
          <boxGeometry args={[0.24, 0.2, 0.58]} />
          <meshStandardMaterial
            color={isSelected ? '#60a5fa' : isHovered ? '#cbd5e1' : bodyColor}
            metalness={0.35}
            roughness={0.45}
          />
        </mesh>

        <mesh position={[0, 2.03, 0.64]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial
            color={statusColor}
            emissive={statusColor}
            emissiveIntensity={0.8}
            opacity={0.95}
            {...STABLE_TRANSPARENT_OVERLAY}
          />
        </mesh>

        <mesh position={[0, 1.96, range * 0.34]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[Math.max(1.6, range * 0.16), range * 0.7, 24, 1, true]} />
          <meshStandardMaterial
            color={bodyColor}
            emissive={bodyColor}
            emissiveIntensity={isSelected ? 0.28 : 0.14}
            opacity={isSelected ? 0.18 : 0.08}
            {...STABLE_DOUBLE_SIDED_OVERLAY}
          />
        </mesh>
      </group>

      <mesh
        position={[0, 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={OVERLAY_RENDER_ORDER.entityRing}
      >
        <ringGeometry args={[0.45, 0.58, 32]} />
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
          <ringGeometry args={[0.66, 0.74, 32]} />
          <meshStandardMaterial
            color="#3b82f6"
            emissive="#3b82f6"
            emissiveIntensity={0.24}
            metalness={0}
            roughness={0.95}
            opacity={0.82}
            {...STABLE_DOUBLE_SIDED_OVERLAY}
          />
        </mesh>
      )}

      {showLabel && labelMode === 'html' && (
        <SpriteInfoCard
          position={[0, 2.9, 0]}
          title={entity.name}
          badges={[
            createMutedSpriteInfoBadge(CAMERA_TYPE_LABELS[entity.cameraType]),
            createStatusSpriteInfoBadge(entity.recording ? '录制中' : entity.status, statusColor),
          ]}
          lines={[`FOV ${entity.fov.toFixed(0)}°`, `${range.toFixed(0)}m`]}
          scale={0.92}
          minWidth={230}
        />
      )}

      {showLabel && labelMode === 'sprite' && (
        <SpriteTextLabel
          position={[0, 2.7, 0]}
          text={entity.name}
          color="#fecaca"
          outlineColor="#0f172a"
          scale={0.9}
        />
      )}
    </group>
  )
})

CameraMarker.displayName = 'CameraMarker'
