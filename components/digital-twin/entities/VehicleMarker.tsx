'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import type { VehicleEntity } from '@/lib/digital-twin/types'
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
import { runtimeVehicleSnapshotRegistry } from '@/lib/digital-twin/runtime-vehicle-snapshot-registry'
import { resolveVehiclePoseFromSnapshots } from '@/lib/digital-twin/vehicle-snapshot-interpolation'

interface VehicleMarkerProps {
  entity: VehicleEntity
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

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360
}

function yawToHeading(yaw: number) {
  return normalizeDegrees((yaw * 180) / Math.PI)
}

export const VehicleMarker = memo(function VehicleMarker({
  entity,
  isSelected,
  isHovered,
  showModel = true,
}: VehicleMarkerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const meshRef = useRef<THREE.Group>(null)
  const telemetrySampleRef = useRef<{
    x: number
    y: number
    z: number
    speed: number
    lastPublishAt: number
  } | null>(null)
  const [renderTelemetry, setRenderTelemetry] = useState(() => ({
    speed: entity.speed,
    heading: entity.heading,
  }))

  const statusColor = STATUS_COLORS[entity.status]
  const vehicleColor = VEHICLE_COLORS[entity.vehicleType]
  const size = VEHICLE_SIZES[entity.vehicleType]
  const labelMode = entity.labelMode ?? 'html'
  const showLabel = isSelected || isHovered || labelMode !== 'hidden'

  useEffect(() => {
    if (isSelected || isHovered) return
    telemetrySampleRef.current = null
    setRenderTelemetry({
      speed: entity.speed,
      heading: entity.heading,
    })
  }, [entity.heading, entity.id, entity.speed, isHovered, isSelected])

  useFrame((_state, delta) => {
    if (!groupRef.current || (!isSelected && !isHovered)) return

    const pose = resolveVehiclePoseFromSnapshots(
      runtimeVehicleSnapshotRegistry.get(entity.id),
      Date.now(),
      120,
      220
    )
    const snapshot = useDigitalTwinStore.getState().getEcsSnapshotById(entity.id)
    const x = pose?.x ?? snapshot?.position.x ?? entity.position.x
    const y = pose?.y ?? snapshot?.position.y ?? entity.position.y
    const z = pose?.z ?? snapshot?.position.z ?? entity.position.z
    const heading = yawToHeading(pose?.yaw ?? snapshot?.rotation.y ?? entity.rotation.y)
    groupRef.current.position.set(x, y, z)

    const previousSample = telemetrySampleRef.current
    const baseSpeed = snapshot?.speed ?? entity.speed
    const rawSpeed =
      previousSample
        ? Math.hypot(x - previousSample.x, y - previousSample.y, z - previousSample.z) /
          Math.max(delta, 1 / 240)
        : baseSpeed
    const speed = previousSample
      ? previousSample.speed + (rawSpeed - previousSample.speed) * 0.22
      : rawSpeed
    const now = performance.now()

    telemetrySampleRef.current = {
      x,
      y,
      z,
      speed,
      lastPublishAt: previousSample?.lastPublishAt ?? 0,
    }

    if (
      !previousSample ||
      now - previousSample.lastPublishAt >= 100 &&
        (Math.abs(renderTelemetry.speed - speed) >= 0.05 ||
          Math.abs(renderTelemetry.heading - heading) >= 0.5)
    ) {
      telemetrySampleRef.current.lastPublishAt = now
      setRenderTelemetry({ speed, heading })
    }
  })

  return (
    <group
      ref={groupRef}
      position={[entity.position.x, entity.position.y, entity.position.z]}
      userData={{ pickable: true, entityId: entity.id }}
    >
      {showModel && (
        <group
          ref={meshRef}
          rotation={[0, entity.rotation.y, 0]}
        >
          <mesh position={[0, size.height / 2, 0]} castShadow>
            <boxGeometry args={[size.width, size.height, size.depth]} />
            <meshStandardMaterial
              color={isSelected ? '#60a5fa' : isHovered ? '#94a3b8' : vehicleColor}
              metalness={0.6}
              roughness={0.4}
            />
          </mesh>

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

          <mesh position={[0, size.height / 2, size.depth / 2 + 0.2]}>
            <coneGeometry args={[0.2, 0.4, 8]} />
            <meshStandardMaterial
              color={statusColor}
              emissive={statusColor}
              emissiveIntensity={0.5}
            />
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
          args={[Math.max(size.width, size.depth) / 2 + 0.3, Math.max(size.width, size.depth) / 2 + 0.5, 32]}
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
          opacity={isSelected ? 0.6 : 0.3}
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
            args={[Math.max(size.width, size.depth) / 2 + 0.6, Math.max(size.width, size.depth) / 2 + 0.7, 32]}
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
          position={[0, size.height + 1.6, 0]}
          title={entity.name}
          badges={[
            createMutedSpriteInfoBadge(entity.plateNumber),
            createStatusSpriteInfoBadge(entity.status, statusColor),
          ]}
          lines={[
            `速度 ${renderTelemetry.speed.toFixed(1)} m/s`,
            `方向 ${renderTelemetry.heading.toFixed(0)}°`,
          ]}
          scale={1}
          minWidth={230}
        />
      )}

      {showLabel && labelMode === 'sprite' && (
        <SpriteTextLabel
          position={[0, size.height + 1.1, 0]}
          text={entity.name}
          color="#dbeafe"
          outlineColor="#0f172a"
          scale={1}
        />
      )}
    </group>
  )
})

VehicleMarker.displayName = 'VehicleMarker'
