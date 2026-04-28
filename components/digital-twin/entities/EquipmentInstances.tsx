'use client'

import { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  createInstancedInteractionBounds,
  type InstancedInteractionBounds,
} from '@/lib/digital-twin/renderer/instanced-bounds'
import {
  OVERLAY_RENDER_ORDER,
  STABLE_DOUBLE_SIDED_OVERLAY,
  STABLE_TRANSPARENT_OVERLAY,
} from '@/lib/digital-twin/renderer/material-stability'
import type { EquipmentEntity } from '@/lib/digital-twin/types'
import {
  DigitalTwinRaySpherePickGrid,
} from '@/lib/digital-twin/viewer-runtime/pick-index'
import { usePickGroupRegistration } from '../scene/ViewerRuntimeBridge'

interface EquipmentInstancesProps {
  entities: EquipmentEntity[]
  selectedEntityId: string | null
  hoveredEntityId: string | null
}

interface EquipmentTransformState {
  x: number
  y: number
  z: number
  yaw: number
}

interface EquipmentAppearanceState {
  bodyState: 'selected' | 'hovered' | 'idle'
  status: EquipmentEntity['status']
}

const BODY_TEMP = new THREE.Object3D()
const BASE_TEMP = new THREE.Object3D()
const PANEL_TEMP = new THREE.Object3D()
const GLOW_TEMP = new THREE.Object3D()
const HALO_TEMP = new THREE.Object3D()
const RING_TEMP = new THREE.Object3D()
const VENT_TEMP = new THREE.Object3D()
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

function ensureInstanceColor(mesh: THREE.InstancedMesh | null) {
  if (!mesh || mesh.instanceColor) return
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count * 3), 3)
}

function applyInteractionBounds(
  mesh: THREE.InstancedMesh | null,
  interactionBounds: InstancedInteractionBounds
) {
  if (!mesh) return
  mesh.frustumCulled = true
  mesh.boundingSphere = interactionBounds.sphere.clone()
  mesh.boundingBox = interactionBounds.box.clone()
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
  const transformRef = useRef<Map<string, EquipmentTransformState>>(new Map())
  const appearanceRef = useRef<Map<string, EquipmentAppearanceState>>(new Map())
  const forceMatrixSyncRef = useRef(true)
  const forceColorSyncRef = useRef(true)
  const colorRef = useRef({
    body: new THREE.Color(),
    status: new THREE.Color(),
  })
  const pickRefs = useMemo(
    () => [bodyRef, baseRef, panelRef, glowRef, haloRef, ringRef, ventRef],
    []
  )
  const entityIds = useMemo(() => entities.map((entity) => entity.id), [entities])
  const entityIdSignature = useMemo(() => entityIds.join('|'), [entityIds])
  const interactionBounds = useMemo(
    () =>
      createInstancedInteractionBounds(
        entities.map((entity) => entity.position),
        {
          paddingXz: 18,
          paddingTop: 7,
          paddingBottom: 2,
        }
      ),
    [entities]
  )
  const bodyInstanceColors = useMemo(() => new Float32Array(entities.length * 3), [entities.length])
  const glowInstanceColors = useMemo(() => new Float32Array(entities.length * 3), [entities.length])
  const haloInstanceColors = useMemo(() => new Float32Array(entities.length * 3), [entities.length])
  const ringInstanceColors = useMemo(() => new Float32Array(entities.length * 3), [entities.length])
  const ventEntityIds = useMemo(
    () => entities.flatMap((entity) => [entity.id, entity.id, entity.id, entity.id]),
    [entities]
  )
  const pickGrid = useMemo(() => {
    const grid = new DigitalTwinRaySpherePickGrid({ cellSize: 6 })
    for (const entity of entities) {
      grid.upsertEntity(entity.id, entity.position.x, entity.position.y + 1.65, entity.position.z, 2.25)
    }
    return grid
  }, [entities])
  const collectPickCandidates = useCallback(
    (raycaster: THREE.Raycaster) => pickGrid.collect(raycaster),
    [pickGrid]
  )

  usePickGroupRegistration({
    id: `equipment:${entityIdSignature}`,
    refs: pickRefs,
    bounds: interactionBounds.sphere,
    priority: 'entity',
    enabled: entities.length > 0,
    dependencyKey: `${entityIdSignature}:${selectedEntityId ?? ''}:${hoveredEntityId ?? ''}`,
    pickCandidates: collectPickCandidates,
    exactRaycast: false,
  })

  useLayoutEffect(() => {
    const nextIds = new Set(entityIdSignature ? entityIdSignature.split('|') : [])
    transformRef.current.forEach((_value, id) => {
      if (!nextIds.has(id)) transformRef.current.delete(id)
    })
    appearanceRef.current.forEach((_value, id) => {
      if (!nextIds.has(id)) appearanceRef.current.delete(id)
    })
    forceMatrixSyncRef.current = true
    forceColorSyncRef.current = true
  }, [entityIdSignature])

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
      applyInteractionBounds(mesh, interactionBounds)
    })

    ensureInstanceColor(bodyRef.current)
    ensureInstanceColor(glowRef.current)
    ensureInstanceColor(haloRef.current)
    ensureInstanceColor(ringRef.current)

    bodyRef.current?.instanceColor?.setUsage(THREE.DynamicDrawUsage)
    glowRef.current?.instanceColor?.setUsage(THREE.DynamicDrawUsage)
    haloRef.current?.instanceColor?.setUsage(THREE.DynamicDrawUsage)
    ringRef.current?.instanceColor?.setUsage(THREE.DynamicDrawUsage)
  }, [entities, interactionBounds])

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

    const transformStates = transformRef.current
    const forceMatrixSync = forceMatrixSyncRef.current
    let matrixDirty = false

    for (let index = 0; index < entities.length; index += 1) {
      const entity = entities[index]
      const yaw = entity.rotation.y
      const cosYaw = Math.cos(yaw)
      const sinYaw = Math.sin(yaw)
      const previous = transformStates.get(entity.id)
      const transformChanged =
        forceMatrixSync ||
        !previous ||
        previous.x !== entity.position.x ||
        previous.y !== entity.position.y ||
        previous.z !== entity.position.z ||
        previous.yaw !== yaw

      if (!transformChanged) continue

      transformStates.set(entity.id, {
        x: entity.position.x,
        y: entity.position.y,
        z: entity.position.z,
        yaw,
      })

      BODY_TEMP.position.set(entity.position.x, entity.position.y + 1.5, entity.position.z)
      BODY_TEMP.rotation.set(0, yaw, 0)
      BODY_TEMP.scale.set(2, 3, 2)
      BODY_TEMP.updateMatrix()
      bodyRef.current.setMatrixAt(index, BODY_TEMP.matrix)

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

      matrixDirty = true
    }

    if (matrixDirty) {
      bodyRef.current.instanceMatrix.needsUpdate = true
      baseRef.current.instanceMatrix.needsUpdate = true
      panelRef.current.instanceMatrix.needsUpdate = true
      glowRef.current.instanceMatrix.needsUpdate = true
      haloRef.current.instanceMatrix.needsUpdate = true
      ringRef.current.instanceMatrix.needsUpdate = true
      ventRef.current.instanceMatrix.needsUpdate = true
    }

    if (forceMatrixSync) forceMatrixSyncRef.current = false
  }, [entities])

  useLayoutEffect(() => {
    if (!bodyRef.current || !glowRef.current || !haloRef.current || !ringRef.current) {
      return
    }

    const appearanceStates = appearanceRef.current
    const bodyColor = colorRef.current.body
    const statusColor = colorRef.current.status
    const forceColorSync = forceColorSyncRef.current
    let bodyColorDirty = false
    let statusColorDirty = false

    for (let index = 0; index < entities.length; index += 1) {
      const entity = entities[index]
      const bodyState =
        entity.id === selectedEntityId ? 'selected' : entity.id === hoveredEntityId ? 'hovered' : 'idle'
      const previous = appearanceStates.get(entity.id)

      if (forceColorSync || !previous || previous.bodyState !== bodyState) {
        bodyColor.set(getBodyColor(bodyState === 'selected', bodyState === 'hovered'))
        bodyRef.current.setColorAt(index, bodyColor)
        bodyColorDirty = true
      }

      if (forceColorSync || !previous || previous.status !== entity.status) {
        statusColor.set(getStatusColor(entity.status))
        glowRef.current.setColorAt(index, statusColor)
        haloRef.current.setColorAt(index, statusColor)
        ringRef.current.setColorAt(index, statusColor)
        statusColorDirty = true
      }

      if (forceColorSync || !previous || previous.bodyState !== bodyState || previous.status !== entity.status) {
        appearanceStates.set(entity.id, {
          bodyState,
          status: entity.status,
        })
      }
    }

    if (bodyColorDirty && bodyRef.current.instanceColor) {
      bodyRef.current.instanceColor.needsUpdate = true
    }
    if (statusColorDirty && glowRef.current.instanceColor) {
      glowRef.current.instanceColor.needsUpdate = true
    }
    if (statusColorDirty && haloRef.current.instanceColor) {
      haloRef.current.instanceColor.needsUpdate = true
    }
    if (statusColorDirty && ringRef.current.instanceColor) {
      ringRef.current.instanceColor.needsUpdate = true
    }
    if (forceColorSync) forceColorSyncRef.current = false
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
