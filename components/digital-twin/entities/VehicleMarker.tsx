'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
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
import { TruckRuntimeModel } from './TruckRuntimeModel'
import { ForkliftRuntimeModel } from './ForkliftRuntimeModel'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { runtimeVehiclePoseBuffer } from '@/lib/digital-twin/runtime-vehicle-pose-buffer'
import { VEHICLE_DETAIL_DIMENSIONS } from '@/lib/digital-twin/vehicle-footprint'
import {
  normalizeVehicleRouteLike,
  normalizeVehicleTrackLike,
  resolveVehicleRoutePose,
} from '@/lib/digital-twin/vehicle-route-motion'
import { resolveRenderablePosition, resolveRenderableRotation } from './render-transform'
import {
  resolveRaySpherePickHit,
  type DigitalTwinPickCandidateHit,
} from '@/lib/digital-twin/viewer-runtime/pick-index'
import { usePickGroupRegistration } from '../scene/ViewerRuntimeBridge'

interface VehicleMarkerProps {
  entity: VehicleEntity
  isSelected: boolean
  isHovered: boolean
  showModel?: boolean
  fullTransform?: boolean
}

const STATUS_COLORS = {
  active: '#22c55e',
  inactive: '#6b7280',
  warning: '#f59e0b',
  error: '#ef4444',
}

const VEHICLE_COLORS = {
  car: '#3b82f6',
  truck: '#f59e0b',
  forklift: '#22c55e',
  agv: '#8b5cf6',
  other: '#6b7280',
}

const VEHICLE_PICK_WORLD_POSITION = new THREE.Vector3()

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360
}

function yawToHeading(yaw: number) {
  return normalizeDegrees((yaw * 180) / Math.PI)
}

type VehiclePoseLike = Pick<VehicleEntity, 'position' | 'rotation' | 'routeTrack' | 'trackPosition'>

function resolveVehiclePoseFromEntity(entity: VehiclePoseLike) {
  if (entity.routeTrack && entity.trackPosition) {
    const pose = resolveVehicleRoutePose(
      normalizeVehicleTrackLike(entity.routeTrack),
      normalizeVehicleRouteLike(entity.trackPosition)
    )
    return {
      x: pose.position.x,
      y: pose.position.y,
      z: pose.position.z,
      yaw: pose.yaw,
    }
  }

  return {
    x: entity.position.x,
    y: entity.position.y,
    z: entity.position.z,
    yaw: entity.rotation.y,
  }
}

export const VehicleMarker = memo(function VehicleMarker({
  entity,
  isSelected,
  isHovered,
  showModel = true,
  fullTransform = false,
}: VehicleMarkerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const meshRef = useRef<THREE.Group>(null)
  const pickRefs = useMemo(() => [groupRef], [])
  const initialPose = resolveVehiclePoseFromEntity(entity)
  const telemetrySampleRef = useRef<{
    x: number
    y: number
    z: number
    speed: number
    lastPublishAt: number
  } | null>(null)
  const [renderTelemetry, setRenderTelemetry] = useState(() => ({
    speed: entity.speed,
    heading: yawToHeading(initialPose.yaw),
  }))

  const statusColor = STATUS_COLORS[entity.status]
  const vehicleColor = VEHICLE_COLORS[entity.vehicleType]
  const size = VEHICLE_DETAIL_DIMENSIONS[entity.vehicleType]
  const pickRadius = Math.hypot(size.width, size.height, size.depth) / 2 + 0.65
  const labelMode = entity.labelMode ?? 'html'
  const showLabel = isSelected || isHovered || labelMode !== 'hidden'
  const shouldRenderTelemetryCard = showLabel && labelMode === 'html'
  const usesDetailedVehicleModel =
    showModel && (entity.vehicleType === 'truck' || entity.vehicleType === 'forklift')
  const shouldTrackLivePose = !fullTransform && (isSelected || isHovered || usesDetailedVehicleModel || showLabel)
  const collectPickCandidates = useCallback(
    (raycaster: THREE.Raycaster) => {
      const group = groupRef.current
      if (!group) return []

      group.getWorldPosition(VEHICLE_PICK_WORLD_POSITION)
      VEHICLE_PICK_WORLD_POSITION.y += size.height / 2

      const hit = resolveRaySpherePickHit(
        raycaster,
        VEHICLE_PICK_WORLD_POSITION,
        pickRadius,
        { kind: 'entity', id: entity.id }
      )

      const hits: DigitalTwinPickCandidateHit[] = hit ? [hit] : []
      return hits
    },
    [entity.id, pickRadius, size.height]
  )

  usePickGroupRegistration({
    id: `vehicle-marker:${entity.id}`,
    refs: pickRefs,
    priority: 'entity',
    dependencyKey: `${entity.id}:${showModel}:${fullTransform}`,
    pickCandidates: collectPickCandidates,
    exactRaycast: false,
  })

  useEffect(() => {
    if (shouldTrackLivePose) return
    telemetrySampleRef.current = null
    const seededPose = resolveVehiclePoseFromEntity(entity)
    setRenderTelemetry({
      speed: entity.speed,
      heading: yawToHeading(seededPose.yaw),
    })
  }, [entity, shouldTrackLivePose])

  useFrame((_state, delta) => {
    if (!groupRef.current || !shouldTrackLivePose) return

    const pose = runtimeVehiclePoseBuffer.get(entity.id)
    const snapshot = useDigitalTwinStore.getState().getEcsSnapshotById(entity.id)
    const fallbackPose =
      snapshot?.type === 'vehicle'
        ? resolveVehiclePoseFromEntity(snapshot)
        : resolveVehiclePoseFromEntity(entity)
    const x = pose?.x ?? fallbackPose.x
    const y = pose?.y ?? fallbackPose.y
    const z = pose?.z ?? fallbackPose.z
    const yaw = pose?.yaw ?? fallbackPose.yaw
    const heading = yawToHeading(yaw)
    groupRef.current.position.set(x, y, z)
    meshRef.current?.rotation.set(0, yaw, 0)

    const previousSample = telemetrySampleRef.current
    const baseSpeed = snapshot?.speed ?? entity.speed
    const nextSample = previousSample ?? {
      x,
      y,
      z,
      speed: baseSpeed,
      lastPublishAt: 0,
    }

    nextSample.x = x
    nextSample.y = y
    nextSample.z = z

    if (!shouldRenderTelemetryCard) {
      nextSample.speed = baseSpeed
      nextSample.lastPublishAt = 0
      telemetrySampleRef.current = nextSample
      return
    }

    const rawSpeed =
      previousSample
        ? Math.hypot(x - previousSample.x, y - previousSample.y, z - previousSample.z) /
          Math.max(delta, 1 / 240)
        : baseSpeed
    const speed = previousSample
      ? previousSample.speed + (rawSpeed - previousSample.speed) * 0.22
      : rawSpeed
    const now = performance.now()

    nextSample.speed = speed
    telemetrySampleRef.current = nextSample

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
      position={
        fullTransform
          ? resolveRenderablePosition(entity.position, { fullTransform: true })
          : [initialPose.x, initialPose.y, initialPose.z]
      }
      userData={{ pickable: true, entityId: entity.id }}
    >
      {showModel && (
        <group
          ref={meshRef}
          rotation={
            fullTransform
              ? resolveRenderableRotation(entity.rotation, { fullTransform: true })
              : [0, initialPose.yaw, 0]
          }
        >
          {entity.vehicleType === 'truck' ? (
            <TruckRuntimeModel />
          ) : entity.vehicleType === 'forklift' ? (
            <ForkliftRuntimeModel />
          ) : (
            <>
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
            </>
          )}
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
      {shouldRenderTelemetryCard && (
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
