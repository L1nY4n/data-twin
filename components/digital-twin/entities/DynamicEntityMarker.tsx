'use client'

import { memo, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { Group, Mesh } from 'three'
import type * as THREE from 'three'
import type {
  ArchetypeModelAsset,
  ArchetypeModelCalibration,
  DynamicEntity,
} from '@/lib/digital-twin/types'
import type { DynamicEntityPresentation } from '@/lib/digital-twin/entity-schema-registry'
import {
  OVERLAY_RENDER_ORDER,
  STABLE_DOUBLE_SIDED_OVERLAY,
  STABLE_TRANSPARENT_OVERLAY,
} from '@/lib/digital-twin/renderer/material-stability'
import {
  SpriteInfoCard,
  createStatusSpriteInfoBadge,
} from '@/components/digital-twin/scene/SpriteInfoCard'
import { SpriteTextLabel } from '@/components/digital-twin/scene/SpriteTextLabel'
import { runtimeVehiclePoseBuffer } from '@/lib/digital-twin/runtime-vehicle-pose-buffer'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'

const STATUS_COLORS = {
  active: '#22c55e',
  inactive: '#6b7280',
  warning: '#f59e0b',
  error: '#ef4444',
}

function applyCalibration(scene: Group, calibration: ArchetypeModelCalibration) {
  const clone = scene.clone(true)
  clone.position.set(
    calibration.translation.x,
    calibration.translation.y + calibration.floorOffset,
    calibration.translation.z
  )
  clone.rotation.set(
    calibration.rotation.x,
    calibration.rotation.y,
    calibration.rotation.z
  )
  clone.scale.set(
    calibration.scale.x,
    calibration.scale.y,
    calibration.scale.z
  )
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return
    object.castShadow = true
    object.receiveShadow = true
  })
  return clone
}

function DynamicModel({
  asset,
}: {
  asset: ArchetypeModelAsset
}) {
  if (asset.fileType === 'fbx') {
    return <FbxDynamicModel asset={asset} />
  }

  return <GltfDynamicModel asset={asset} />
}

function GltfDynamicModel({ asset }: { asset: ArchetypeModelAsset }) {
  const { scene } = useGLTF(asset.assetUrl)
  const prepared = useMemo(
    () => applyCalibration(scene, asset.calibration),
    [asset.calibration, scene]
  )

  return <primitive object={prepared} />
}

function FbxDynamicModel({ asset }: { asset: ArchetypeModelAsset }) {
  const scene = useLoader(FBXLoader, asset.assetUrl)
  const prepared = useMemo(
    () => applyCalibration(scene, asset.calibration),
    [asset.calibration, scene]
  )

  return <primitive object={prepared} />
}

export const DynamicEntityMarker = memo(function DynamicEntityMarker({
  entity,
  presentation,
  isSelected,
  isHovered,
  showModel = true,
  showBaseProxy = true,
  showStatusRing = true,
}: {
  entity: DynamicEntity
  presentation: DynamicEntityPresentation
  isSelected: boolean
  isHovered: boolean
  showModel?: boolean
  showBaseProxy?: boolean
  showStatusRing?: boolean
}) {
  const groupRef = useRef<THREE.Group>(null)
  const statusColor = STATUS_COLORS[entity.status]
  const accentColor = presentation.accentColor
  const labelMode = entity.labelMode ?? 'html'
  const showLabel = isSelected || isHovered || labelMode !== 'hidden'
  const detailLines = [
    ...Object.entries(entity.displayAttributes),
    ...Object.entries(entity.attributes).filter(
      ([key]) => !(key in entity.displayAttributes)
    ),
  ]
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`)
  const shouldTrackLivePose = isSelected || isHovered || showModel

  useFrame(() => {
    if (!groupRef.current || !shouldTrackLivePose) return
    const pose = runtimeVehiclePoseBuffer.get(entity.id)
    const snapshot = useDigitalTwinStore.getState().getEcsSnapshotById(entity.id)
    const position = pose
      ? { x: pose.x, y: pose.y, z: pose.z }
      : snapshot?.position ?? entity.position
    const yaw = pose?.yaw ?? snapshot?.rotation.y ?? entity.rotation.y

    groupRef.current.position.set(position.x, position.y, position.z)
    groupRef.current.rotation.set(entity.rotation.x, yaw, entity.rotation.z)
  })

  return (
    <group
      ref={groupRef}
      position={[entity.position.x, entity.position.y, entity.position.z]}
      rotation={[entity.rotation.x, entity.rotation.y, entity.rotation.z]}
      scale={[entity.scale.x, entity.scale.y, entity.scale.z]}
      userData={{ pickable: true, entityId: entity.id }}
    >
      {showModel && presentation.modelAsset ? (
        <group>
          <DynamicModel asset={presentation.modelAsset} />
        </group>
      ) : showBaseProxy ? (
        <group>
          <mesh position={[0, 0.9, 0]} castShadow>
            <capsuleGeometry args={[0.45, 1.4, 8, 16]} />
            <meshStandardMaterial
              color={isSelected ? '#93c5fd' : accentColor}
              metalness={0.25}
              roughness={0.55}
            />
          </mesh>
          <mesh position={[0, 1.95, 0]}>
            <sphereGeometry args={[0.16, 18, 18]} />
            <meshStandardMaterial
              color={statusColor}
              emissive={statusColor}
              emissiveIntensity={0.7}
              opacity={0.85}
              {...STABLE_TRANSPARENT_OVERLAY}
            />
          </mesh>
        </group>
      ) : null}

      {showStatusRing ? (
        <mesh
          position={[0, 0.03, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={OVERLAY_RENDER_ORDER.entityRing}
        >
          <ringGeometry args={[1.05, 1.16, 32]} />
          <meshStandardMaterial
            color={accentColor}
            emissive={accentColor}
            emissiveIntensity={0.14}
            opacity={isSelected ? 0.55 : 0.26}
            {...STABLE_DOUBLE_SIDED_OVERLAY}
          />
        </mesh>
      ) : null}

      {showStatusRing && isSelected ? (
        <mesh
          position={[0, 0.04, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={OVERLAY_RENDER_ORDER.entitySelectionRing}
        >
          <ringGeometry args={[1.22, 1.3, 32]} />
          <meshStandardMaterial
            color="#3b82f6"
            emissive="#3b82f6"
            emissiveIntensity={0.22}
            opacity={0.8}
            {...STABLE_DOUBLE_SIDED_OVERLAY}
          />
        </mesh>
      ) : null}

      {showLabel && labelMode === 'html' ? (
        <SpriteInfoCard
          position={[0, 2.8, 0]}
          title={entity.name}
          badges={[
            createStatusSpriteInfoBadge(presentation.categoryLabel, accentColor),
            createStatusSpriteInfoBadge(presentation.archetypeLabel, statusColor),
          ]}
          lines={detailLines}
          scale={0.95}
          minWidth={240}
        />
      ) : null}

      {showLabel && labelMode === 'sprite' ? (
        <SpriteTextLabel
          position={[0, 2.7, 0]}
          text={entity.name}
          color="#dbeafe"
          outlineColor="#0f172a"
          scale={1}
        />
      ) : null}
    </group>
  )
})

DynamicEntityMarker.displayName = 'DynamicEntityMarker'
