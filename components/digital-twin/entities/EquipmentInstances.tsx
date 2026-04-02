'use client'

import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CAMPUS_INTERACTION_HEIGHT, CAMPUS_INTERACTION_RADIUS } from '@/lib/digital-twin/campus-layout'
import {
  OVERLAY_RENDER_ORDER,
  STABLE_DOUBLE_SIDED_OVERLAY,
  STABLE_TRANSPARENT_OVERLAY,
} from '@/lib/digital-twin/renderer/material-stability'
import type { EquipmentEntity } from '@/lib/digital-twin/types'

interface EquipmentInstancesProps {
  entities: EquipmentEntity[]
  selectedEntityId: string | null
  hoveredEntityId: string | null
}

const BODY_TEMP = new THREE.Object3D()
const BASE_TEMP = new THREE.Object3D()
const PANEL_TEMP = new THREE.Object3D()
const GLOW_TEMP = new THREE.Object3D()
const HALO_TEMP = new THREE.Object3D()
const RING_TEMP = new THREE.Object3D()
const VENT_TEMP = new THREE.Object3D()
const INTERACTION_BOUNDS_SPHERE = new THREE.Sphere(
  new THREE.Vector3(0, 2, 0),
  CAMPUS_INTERACTION_RADIUS
)
const INTERACTION_BOUNDS_BOX = new THREE.Box3(
  new THREE.Vector3(-CAMPUS_INTERACTION_RADIUS, -2, -CAMPUS_INTERACTION_RADIUS),
  new THREE.Vector3(CAMPUS_INTERACTION_RADIUS, CAMPUS_INTERACTION_HEIGHT, CAMPUS_INTERACTION_RADIUS)
)
const VENT_OFFSETS = [1, 1.4, 1.8, 2.2] as const

function getStatusColor(status: EquipmentEntity['status']) {
  switch (status) {
    case 'active':
      return '#22c55e'
    case 'warning':
      return '#f59e0b'
    case 'error':
      return '#ef4444'
    default:
      return '#6b7280'
  }
}

function getBodyColor(
  isSelected: boolean,
  isHovered: boolean
) {
  if (isSelected) return '#60a5fa'
  if (isHovered) return '#64748b'
  return '#374151'
}

function applyInteractionBounds(mesh: THREE.InstancedMesh | null) {
  if (!mesh) return
  mesh.frustumCulled = false
  mesh.boundingSphere = INTERACTION_BOUNDS_SPHERE.clone()
  mesh.boundingBox = INTERACTION_BOUNDS_BOX.clone()
}

function ensureInstanceColor(mesh: THREE.InstancedMesh | null) {
  if (!mesh || mesh.instanceColor) return
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count * 3), 3)
}

function setVentMatrix(
  mesh: THREE.InstancedMesh,
  entity: EquipmentEntity,
  cosYaw: number,
  sinYaw: number,
  heightOffset: number,
  instanceIndex: number
) {
  const localX = 0.9
  const localZ = 1.01
  const worldX = entity.position.x + localX * cosYaw + localZ * sinYaw
  const worldZ = entity.position.z - localX * sinYaw + localZ * cosYaw

  VENT_TEMP.position.set(worldX, entity.position.y + heightOffset, worldZ)
  VENT_TEMP.rotation.set(0, entity.rotation.y, 0)
  VENT_TEMP.scale.set(0.15, 0.1, 0.05)
  VENT_TEMP.updateMatrix()
  mesh.setMatrixAt(instanceIndex, VENT_TEMP.matrix)
}

export const EquipmentInstances = memo(function EquipmentInstances({
  entities,
  selectedEntityId,
  hoveredEntityId,
}: EquipmentInstancesProps) {
  const bodyRef = useRef<THREE.InstancedMesh>(null)
  const baseRef = useRef<THREE.InstancedMesh>(null)
  const panelRef = useRef<THREE.InstancedMesh>(null)
  const glowRef = useRef<THREE.InstancedMesh>(null)
  const haloRef = useRef<THREE.InstancedMesh>(null)
  const ringRef = useRef<THREE.InstancedMesh>(null)
  const ventRef = useRef<THREE.InstancedMesh>(null)
  const colorRef = useRef({
    body: new THREE.Color(),
    status: new THREE.Color(),
  })
  const entityIds = useMemo(() => entities.map((entity) => entity.id), [entities])
  const bodyInstanceColors = useMemo(() => new Float32Array(entities.length * 3), [entities.length])
  const glowInstanceColors = useMemo(() => new Float32Array(entities.length * 3), [entities.length])
  const haloInstanceColors = useMemo(() => new Float32Array(entities.length * 3), [entities.length])
  const ringInstanceColors = useMemo(() => new Float32Array(entities.length * 3), [entities.length])
  const ventEntityIds = useMemo(
    () => entities.flatMap((entity) => [entity.id, entity.id, entity.id, entity.id]),
    [entities]
  )

  useLayoutEffect(() => {
    ;[
      bodyRef.current,
      baseRef.current,
      panelRef.current,
      glowRef.current,
      haloRef.current,
      ringRef.current,
      ventRef.current,
    ].forEach((mesh) => {
      if (!mesh) return
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage)
      applyInteractionBounds(mesh)
    })

    ensureInstanceColor(bodyRef.current)
    ensureInstanceColor(glowRef.current)
    ensureInstanceColor(haloRef.current)
    ensureInstanceColor(ringRef.current)

    bodyRef.current?.instanceColor?.setUsage(THREE.DynamicDrawUsage)
    glowRef.current?.instanceColor?.setUsage(THREE.DynamicDrawUsage)
    haloRef.current?.instanceColor?.setUsage(THREE.DynamicDrawUsage)
    ringRef.current?.instanceColor?.setUsage(THREE.DynamicDrawUsage)
  }, [entities.length])

  useLayoutEffect(() => {
    if (
      !bodyRef.current ||
      !baseRef.current ||
      !panelRef.current ||
      !glowRef.current ||
      !haloRef.current ||
      !ringRef.current ||
      !ventRef.current
    ) {
      return
    }

    const bodyColor = colorRef.current.body
    const statusColor = colorRef.current.status

    for (let index = 0; index < entities.length; index += 1) {
      const entity = entities[index]
      const isSelected = entity.id === selectedEntityId
      const isHovered = entity.id === hoveredEntityId
      const yaw = entity.rotation.y
      const cosYaw = Math.cos(yaw)
      const sinYaw = Math.sin(yaw)

      BODY_TEMP.position.set(entity.position.x, entity.position.y + 1.5, entity.position.z)
      BODY_TEMP.rotation.set(0, yaw, 0)
      BODY_TEMP.scale.set(2, 3, 2)
      BODY_TEMP.updateMatrix()
      bodyRef.current.setMatrixAt(index, BODY_TEMP.matrix)
      bodyColor.set(getBodyColor(isSelected, isHovered))
      bodyRef.current.setColorAt(index, bodyColor)

      BASE_TEMP.position.set(entity.position.x, entity.position.y + 0.15, entity.position.z)
      BASE_TEMP.rotation.set(0, yaw, 0)
      BASE_TEMP.scale.set(2.4, 0.3, 2.4)
      BASE_TEMP.updateMatrix()
      baseRef.current.setMatrixAt(index, BASE_TEMP.matrix)

      PANEL_TEMP.position.set(entity.position.x, entity.position.y + 2, entity.position.z)
      PANEL_TEMP.position.x += 1.01 * sinYaw
      PANEL_TEMP.position.z += 1.01 * cosYaw
      PANEL_TEMP.rotation.set(0, yaw, 0)
      PANEL_TEMP.scale.set(1.2, 0.8, 0.05)
      PANEL_TEMP.updateMatrix()
      panelRef.current.setMatrixAt(index, PANEL_TEMP.matrix)

      GLOW_TEMP.position.set(entity.position.x, entity.position.y + 3.2, entity.position.z)
      GLOW_TEMP.rotation.set(0, yaw, 0)
      GLOW_TEMP.scale.set(0.15, 0.15, 0.15)
      GLOW_TEMP.updateMatrix()
      glowRef.current.setMatrixAt(index, GLOW_TEMP.matrix)

      HALO_TEMP.position.set(entity.position.x, entity.position.y + 3.2, entity.position.z)
      HALO_TEMP.rotation.set(0, yaw, 0)
      HALO_TEMP.scale.set(0.25, 0.25, 0.25)
      HALO_TEMP.updateMatrix()
      haloRef.current.setMatrixAt(index, HALO_TEMP.matrix)

      RING_TEMP.position.set(entity.position.x, entity.position.y + 0.02, entity.position.z)
      RING_TEMP.rotation.set(-Math.PI / 2, 0, 0)
      RING_TEMP.scale.set(1.6, 1.6, 1)
      RING_TEMP.updateMatrix()
      ringRef.current.setMatrixAt(index, RING_TEMP.matrix)

      statusColor.set(getStatusColor(entity.status))
      glowRef.current.setColorAt(index, statusColor)
      haloRef.current.setColorAt(index, statusColor)
      ringRef.current.setColorAt(index, statusColor)

      const ventBaseIndex = index * VENT_OFFSETS.length
      for (let ventIndex = 0; ventIndex < VENT_OFFSETS.length; ventIndex += 1) {
        setVentMatrix(
          ventRef.current,
          entity,
          cosYaw,
          sinYaw,
          VENT_OFFSETS[ventIndex],
          ventBaseIndex + ventIndex
        )
      }
    }

    bodyRef.current.instanceMatrix.needsUpdate = true
    baseRef.current.instanceMatrix.needsUpdate = true
    panelRef.current.instanceMatrix.needsUpdate = true
    glowRef.current.instanceMatrix.needsUpdate = true
    haloRef.current.instanceMatrix.needsUpdate = true
    ringRef.current.instanceMatrix.needsUpdate = true
    ventRef.current.instanceMatrix.needsUpdate = true

    if (bodyRef.current.instanceColor) bodyRef.current.instanceColor.needsUpdate = true
    if (glowRef.current.instanceColor) glowRef.current.instanceColor.needsUpdate = true
    if (haloRef.current.instanceColor) haloRef.current.instanceColor.needsUpdate = true
    if (ringRef.current.instanceColor) ringRef.current.instanceColor.needsUpdate = true
  }, [entities, hoveredEntityId, selectedEntityId])

  const bodyMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.8,
        roughness: 0.3,
      }),
    []
  )
  const baseMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1f2937',
        metalness: 0.9,
        roughness: 0.2,
      }),
    []
  )
  const panelMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#111827',
        metalness: 0.5,
        roughness: 0.5,
      }),
    []
  )
  const glowMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0,
        roughness: 0.9,
        opacity: 0.85,
        ...STABLE_TRANSPARENT_OVERLAY,
      }),
    []
  )
  const haloMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0,
        roughness: 0.95,
        opacity: 0.3,
        ...STABLE_TRANSPARENT_OVERLAY,
      }),
    []
  )
  const ringMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0,
        roughness: 0.95,
        opacity: 0.25,
        ...STABLE_DOUBLE_SIDED_OVERLAY,
      }),
    []
  )
  const ventMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#0f172a',
      }),
    []
  )

  if (entities.length === 0) return null

  return (
    <group>
      <instancedMesh
        ref={bodyRef}
        args={[undefined, undefined, entities.length]}
        userData={{ pickable: true, entityIds }}
        castShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <instancedBufferAttribute attach="instanceColor" args={[bodyInstanceColors, 3]} />
        <primitive object={bodyMaterial} attach="material" />
      </instancedMesh>

      <instancedMesh
        ref={baseRef}
        args={[undefined, undefined, entities.length]}
        userData={{ pickable: true, entityIds }}
        castShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={baseMaterial} attach="material" />
      </instancedMesh>

      <instancedMesh
        ref={panelRef}
        args={[undefined, undefined, entities.length]}
        userData={{ pickable: true, entityIds }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={panelMaterial} attach="material" />
      </instancedMesh>

      <instancedMesh
        ref={glowRef}
        args={[undefined, undefined, entities.length]}
        userData={{ pickable: true, entityIds }}
        renderOrder={OVERLAY_RENDER_ORDER.entityRing}
      >
        <sphereGeometry args={[1, 16, 16]} />
        <instancedBufferAttribute attach="instanceColor" args={[glowInstanceColors, 3]} />
        <primitive object={glowMaterial} attach="material" />
      </instancedMesh>

      <instancedMesh
        ref={haloRef}
        args={[undefined, undefined, entities.length]}
        userData={{ pickable: true, entityIds }}
        renderOrder={OVERLAY_RENDER_ORDER.entityRing}
      >
        <sphereGeometry args={[1, 16, 16]} />
        <instancedBufferAttribute attach="instanceColor" args={[haloInstanceColors, 3]} />
        <primitive object={haloMaterial} attach="material" />
      </instancedMesh>

      <instancedMesh
        ref={ventRef}
        args={[undefined, undefined, entities.length * VENT_OFFSETS.length]}
        userData={{ pickable: true, entityIds: ventEntityIds }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={ventMaterial} attach="material" />
      </instancedMesh>

      <instancedMesh
        ref={ringRef}
        args={[undefined, undefined, entities.length]}
        userData={{ pickable: true, entityIds }}
        renderOrder={OVERLAY_RENDER_ORDER.entityRing}
      >
        <ringGeometry args={[1, 1.12, 32]} />
        <instancedBufferAttribute attach="instanceColor" args={[ringInstanceColors, 3]} />
        <primitive object={ringMaterial} attach="material" />
      </instancedMesh>
    </group>
  )
})

EquipmentInstances.displayName = 'EquipmentInstances'
