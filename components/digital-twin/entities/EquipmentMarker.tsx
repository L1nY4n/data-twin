'use client'

import { memo } from 'react'
import type { EquipmentEntity } from '@/lib/digital-twin/types'
import {
  OVERLAY_RENDER_ORDER,
  STABLE_DOUBLE_SIDED_OVERLAY,
  STABLE_TRANSPARENT_OVERLAY,
} from '@/lib/digital-twin/renderer/material-stability'
import { createStatusSpriteInfoBadge, SpriteInfoCard } from '@/components/digital-twin/scene/SpriteInfoCard'
import { SpriteTextLabel } from '@/components/digital-twin/scene/SpriteTextLabel'
import { resolveRenderablePosition, resolveRenderableRotation } from './render-transform'

interface EquipmentMarkerProps {
  entity: EquipmentEntity
  isSelected: boolean
  isHovered: boolean
  showModel?: boolean
  showStatusRing?: boolean
  fullTransform?: boolean
}

const STATUS_COLORS = {
  active: '#22c55e',
  inactive: '#6b7280',
  warning: '#f59e0b',
  error: '#ef4444',
}

export const EquipmentMarker = memo(function EquipmentMarker({
  entity,
  isSelected,
  isHovered,
  showModel = true,
  showStatusRing = true,
  fullTransform = false,
}: EquipmentMarkerProps) {
  const statusColor = STATUS_COLORS[entity.status]
  const labelMode = entity.labelMode ?? 'html'
  const showLabel = isSelected || isHovered || labelMode !== 'hidden'

  return (
    <group
      position={resolveRenderablePosition(entity.position, {
        fullTransform,
        clampYToGround: true,
      })}
      userData={{ pickable: true, entityId: entity.id }}
    >
      {showModel && (
        <group rotation={resolveRenderableRotation(entity.rotation, { fullTransform })}>
          {/* 设备主体 - 工业风格 */}
          <mesh position={[0, 1.5, 0]} castShadow>
            <boxGeometry args={[2, 3, 2]} />
            <meshStandardMaterial
              color={isSelected ? '#60a5fa' : isHovered ? '#64748b' : '#374151'}
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
          <mesh position={[0, 3.2, 0]}>
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshStandardMaterial
              color={statusColor}
              emissive={statusColor}
              emissiveIntensity={entity.status === 'warning' || entity.status === 'error' ? 0.7 : 0.95}
              metalness={0}
              roughness={0.9}
              opacity={entity.status === 'warning' || entity.status === 'error' ? 0.65 : 0.85}
              {...STABLE_TRANSPARENT_OVERLAY}
            />
          </mesh>

          {/* 状态光环 */}
          <mesh position={[0, 3.2, 0]}>
            <sphereGeometry args={[0.25, 16, 16]} />
            <meshStandardMaterial
              color={statusColor}
              emissive={statusColor}
              emissiveIntensity={0.18}
              metalness={0}
              roughness={0.95}
              opacity={0.3}
              {...STABLE_TRANSPARENT_OVERLAY}
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
      )}

      {/* 地面投影 */}
      {showStatusRing && (
        <mesh
          position={[0, 0.02, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={OVERLAY_RENDER_ORDER.entityRing}
        >
          <ringGeometry
            args={[1.5, 1.7, 32]}
            onUpdate={(geometry) => {
              if (geometry.index) geometry.setDrawRange(0, geometry.index.count)
            }}
          />
          <meshStandardMaterial
            color={statusColor}
            emissive={statusColor}
            emissiveIntensity={0.16}
            metalness={0}
            roughness={0.95}
            opacity={isSelected ? 0.6 : 0.25}
            {...STABLE_DOUBLE_SIDED_OVERLAY}
          />
        </mesh>
      )}

      {/* 选中高亮环 */}
      {isSelected && (
        <mesh
          position={[0, 0.03, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={OVERLAY_RENDER_ORDER.entitySelectionRing}
        >
          <ringGeometry
            args={[1.8, 1.9, 32]}
            onUpdate={(geometry) => {
              if (geometry.index) geometry.setDrawRange(0, geometry.index.count)
            }}
          />
          <meshStandardMaterial
            color="#3b82f6"
            emissive="#3b82f6"
            emissiveIntensity={0.22}
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
          position={[0, 4, 0]}
          title={entity.name}
          badges={[
            createStatusSpriteInfoBadge(
              entity.status === 'active'
                ? '运行中'
                : entity.status === 'warning'
                  ? '告警'
                  : entity.status === 'error'
                    ? '故障'
                    : '停机',
              statusColor
            ),
          ]}
          lines={Object.entries(entity.parameters)
            .slice(0, 3)
            .map(([key, value]) => `${key}: ${typeof value === 'number' ? value.toFixed(1) : String(value)}`)}
          scale={1}
          minWidth={250}
        />
      )}

      {showLabel && labelMode === 'sprite' && (
        <SpriteTextLabel
          position={[0, 3.8, 0]}
          text={entity.name}
          color="#bfdbfe"
          outlineColor="#0f172a"
          scale={1.05}
        />
      )}
    </group>
  )
})

EquipmentMarker.displayName = 'EquipmentMarker'
