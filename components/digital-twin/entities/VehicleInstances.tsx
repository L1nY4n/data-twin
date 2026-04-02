'use client'

import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CAMPUS_INTERACTION_HEIGHT, CAMPUS_INTERACTION_RADIUS } from '@/lib/digital-twin/campus-layout'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import type { VehicleEntity } from '@/lib/digital-twin/types'

interface VehicleInstancesProps {
  entities: VehicleEntity[]
}

const BODY_TEMP = new THREE.Object3D()
const CABIN_TEMP = new THREE.Object3D()
const ARROW_TEMP = new THREE.Object3D()
const WHEEL_TEMP = new THREE.Object3D()
const INTERACTION_BOUNDS_SPHERE = new THREE.Sphere(
  new THREE.Vector3(0, 3, 0),
  CAMPUS_INTERACTION_RADIUS
)
const INTERACTION_BOUNDS_BOX = new THREE.Box3(
  new THREE.Vector3(-CAMPUS_INTERACTION_RADIUS, -2, -CAMPUS_INTERACTION_RADIUS),
  new THREE.Vector3(CAMPUS_INTERACTION_RADIUS, CAMPUS_INTERACTION_HEIGHT, CAMPUS_INTERACTION_RADIUS)
)

interface VehicleRuntimeState {
  x: number
  y: number
  z: number
  yaw: number
}

function normalizeRadians(value: number): number {
  let angle = value
  const twoPi = Math.PI * 2
  while (angle <= -Math.PI) angle += twoPi
  while (angle > Math.PI) angle -= twoPi
  return angle
}

function lerpAngle(current: number, target: number, alpha: number): number {
  return current + normalizeRadians(target - current) * alpha
}

const VEHICLE_SIZES: Record<VehicleEntity['vehicleType'], { width: number; height: number; depth: number }> = {
  car: { width: 1.8, height: 1, depth: 3.8 },
  truck: { width: 2.3, height: 1.9, depth: 6.9 },
  forklift: { width: 1.3, height: 1.7, depth: 2.5 },
  agv: { width: 1, height: 0.45, depth: 1.5 },
  other: { width: 1.5, height: 0.9, depth: 2.8 },
}

function getBodyColor(type: VehicleEntity['vehicleType'], status: VehicleEntity['status']) {
  if (status === 'error') return '#ef4444'
  if (status === 'warning') return '#f59e0b'
  switch (type) {
    case 'car':
      return '#4f7dc8'
    case 'truck':
      return '#6b7280'
    case 'forklift':
      return '#3d9c6e'
    case 'agv':
      return '#6366f1'
    default:
      return '#64748b'
  }
}

function getStatusColor(status: VehicleEntity['status']) {
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

function applyInteractionBounds(mesh: THREE.InstancedMesh | null) {
  if (!mesh) return
  mesh.frustumCulled = false
  mesh.boundingSphere = INTERACTION_BOUNDS_SPHERE.clone()
  mesh.boundingBox = INTERACTION_BOUNDS_BOX.clone()
}

function setWheelMatrix(
  mesh: THREE.InstancedMesh,
  state: VehicleRuntimeState,
  cosYaw: number,
  sinYaw: number,
  localX: number,
  localZ: number,
  wheelY: number,
  wheelRadius: number,
  wheelThickness: number,
  wheelScale: number,
  instanceIndex: number
) {
  const worldX = state.x + localX * cosYaw + localZ * sinYaw
  const worldZ = state.z - localX * sinYaw + localZ * cosYaw
  WHEEL_TEMP.position.set(worldX, wheelY, worldZ)
  WHEEL_TEMP.rotation.set(0, state.yaw, Math.PI / 2)
  WHEEL_TEMP.scale.set(wheelRadius * wheelScale, wheelThickness * wheelScale, wheelRadius * wheelScale)
  WHEEL_TEMP.updateMatrix()
  mesh.setMatrixAt(instanceIndex, WHEEL_TEMP.matrix)
}

export const VehicleInstances = memo(function VehicleInstances({ entities }: VehicleInstancesProps) {
  const bodyRef = useRef<THREE.InstancedMesh>(null)
  const cabinRef = useRef<THREE.InstancedMesh>(null)
  const arrowRef = useRef<THREE.InstancedMesh>(null)
  const wheelRef = useRef<THREE.InstancedMesh>(null)
  const runtimeRef = useRef<Map<string, VehicleRuntimeState>>(new Map())
  const statusRef = useRef<Map<string, VehicleEntity['status']>>(new Map())
  const forceColorSyncRef = useRef(true)
  const colorRef = useRef({
    body: new THREE.Color(),
    cabin: new THREE.Color(),
    status: new THREE.Color(),
    wheel: new THREE.Color('#111827'),
  })
  const entityIds = useMemo(() => entities.map((entity) => entity.id), [entities])
  const wheelEntityIds = useMemo(
    () => entities.flatMap((entity) => [entity.id, entity.id, entity.id, entity.id]),
    [entities]
  )

  useEffect(() => {
    const nextIds = new Set(entities.map((entity) => entity.id))
    runtimeRef.current.forEach((_state, id) => {
      if (!nextIds.has(id)) runtimeRef.current.delete(id)
    })
    statusRef.current.forEach((_status, id) => {
      if (!nextIds.has(id)) statusRef.current.delete(id)
    })
  }, [entities])

  useEffect(() => {
    forceColorSyncRef.current = true
  }, [entityIds])

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      bodyRef.current.instanceColor?.setUsage(THREE.DynamicDrawUsage)
      applyInteractionBounds(bodyRef.current)
    }
    if (cabinRef.current) {
      cabinRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      cabinRef.current.instanceColor?.setUsage(THREE.DynamicDrawUsage)
      applyInteractionBounds(cabinRef.current)
    }
    if (arrowRef.current) {
      arrowRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      arrowRef.current.instanceColor?.setUsage(THREE.DynamicDrawUsage)
      applyInteractionBounds(arrowRef.current)
    }
    if (wheelRef.current) {
      wheelRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      wheelRef.current.instanceColor?.setUsage(THREE.DynamicDrawUsage)
      applyInteractionBounds(wheelRef.current)
    }
  }, [entities.length])

  useFrame((_state, delta) => {
    if (
      !bodyRef.current ||
      !cabinRef.current ||
      !arrowRef.current ||
      !wheelRef.current ||
      entities.length === 0
    ) {
      return
    }

    const store = useDigitalTwinStore.getState()
    const getSnapshotById = store.getEcsSnapshotById
    const runtimeStates = runtimeRef.current
    const statusStates = statusRef.current
    const bodyColor = colorRef.current.body
    const cabinColor = colorRef.current.cabin
    const statusColor = colorRef.current.status
    const dt = Math.min(delta, 0.05)
    const smoothing = 1 - Math.exp(-14 * dt)
    const forceColorSync = forceColorSyncRef.current
    let colorDirty = false

    for (let index = 0; index < entities.length; index += 1) {
      const entity = entities[index]
      const size = VEHICLE_SIZES[entity.vehicleType]
      const snapshot = getSnapshotById(entity.id)
      const targetPosition = snapshot?.position ?? entity.position
      const targetYaw = snapshot?.rotation.y ?? entity.rotation.y
      const targetStatus = (snapshot?.status as VehicleEntity['status'] | undefined) ?? entity.status

      let state = runtimeStates.get(entity.id)
      if (!state) {
        state = {
          x: targetPosition.x,
          y: targetPosition.y,
          z: targetPosition.z,
          yaw: targetYaw,
        }
        runtimeStates.set(entity.id, state)
      } else {
        state.x += (targetPosition.x - state.x) * smoothing
        state.y += (targetPosition.y - state.y) * smoothing
        state.z += (targetPosition.z - state.z) * smoothing
        state.yaw = lerpAngle(state.yaw, targetYaw, smoothing)
      }

      const prevStatus = statusStates.get(entity.id)
      const statusChanged = forceColorSync || prevStatus !== targetStatus
      if (statusChanged) {
        statusStates.set(entity.id, targetStatus)
        bodyColor.set(getBodyColor(entity.vehicleType, targetStatus))
        statusColor.set(getStatusColor(targetStatus))
        colorDirty = true
      }

      BODY_TEMP.position.set(state.x, state.y + size.height * 0.5, state.z)
      BODY_TEMP.rotation.set(0, state.yaw, 0)
      BODY_TEMP.scale.set(size.width, size.height, size.depth)
      BODY_TEMP.updateMatrix()
      bodyRef.current.setMatrixAt(index, BODY_TEMP.matrix)
      if (statusChanged) {
        bodyRef.current.setColorAt(index, bodyColor)
      }

      CABIN_TEMP.position.set(state.x, state.y + size.height * 0.92, state.z - size.depth * 0.12)
      CABIN_TEMP.rotation.set(0, state.yaw, 0)
      CABIN_TEMP.scale.set(size.width * 0.58, size.height * 0.5, size.depth * 0.45)
      CABIN_TEMP.updateMatrix()
      cabinRef.current.setMatrixAt(index, CABIN_TEMP.matrix)
      if (statusChanged) {
        cabinColor.copy(bodyColor).offsetHSL(0, -0.02, 0.12)
        cabinRef.current.setColorAt(index, cabinColor)
      }

      ARROW_TEMP.position.set(state.x, state.y + size.height * 0.68, state.z + size.depth * 0.52)
      ARROW_TEMP.rotation.set(0, state.yaw, 0)
      ARROW_TEMP.scale.set(0.22, 0.22, 0.38)
      ARROW_TEMP.updateMatrix()
      arrowRef.current.setMatrixAt(index, ARROW_TEMP.matrix)
      if (statusChanged) {
        arrowRef.current.setColorAt(index, statusColor)
      }

      const wheelRadius =
        entity.vehicleType === 'truck'
          ? 0.28
          : entity.vehicleType === 'forklift'
            ? 0.24
            : entity.vehicleType === 'agv'
              ? 0.001
              : 0.22
      const wheelThickness = entity.vehicleType === 'truck' ? 0.2 : 0.16
      const wheelY = state.y + Math.max(0.24, size.height * 0.24)
      const sideX = size.width * 0.56
      const frontZ = size.depth * 0.34
      const rearZ = -size.depth * 0.34
      const cosYaw = Math.cos(state.yaw)
      const sinYaw = Math.sin(state.yaw)
      const wheelScale = entity.vehicleType === 'agv' ? 0.001 : 1

      const wheelBaseIndex = index * 4
      setWheelMatrix(
        wheelRef.current,
        state,
        cosYaw,
        sinYaw,
        -sideX,
        frontZ,
        wheelY,
        wheelRadius,
        wheelThickness,
        wheelScale,
        wheelBaseIndex
      )
      setWheelMatrix(
        wheelRef.current,
        state,
        cosYaw,
        sinYaw,
        sideX,
        frontZ,
        wheelY,
        wheelRadius,
        wheelThickness,
        wheelScale,
        wheelBaseIndex + 1
      )
      setWheelMatrix(
        wheelRef.current,
        state,
        cosYaw,
        sinYaw,
        -sideX,
        rearZ,
        wheelY,
        wheelRadius,
        wheelThickness,
        wheelScale,
        wheelBaseIndex + 2
      )
      setWheelMatrix(
        wheelRef.current,
        state,
        cosYaw,
        sinYaw,
        sideX,
        rearZ,
        wheelY,
        wheelRadius,
        wheelThickness,
        wheelScale,
        wheelBaseIndex + 3
      )
    }

    bodyRef.current.instanceMatrix.needsUpdate = true
    cabinRef.current.instanceMatrix.needsUpdate = true
    arrowRef.current.instanceMatrix.needsUpdate = true
    wheelRef.current.instanceMatrix.needsUpdate = true
    if (colorDirty && bodyRef.current.instanceColor) bodyRef.current.instanceColor.needsUpdate = true
    if (colorDirty && cabinRef.current.instanceColor) cabinRef.current.instanceColor.needsUpdate = true
    if (colorDirty && arrowRef.current.instanceColor) arrowRef.current.instanceColor.needsUpdate = true
    if (forceColorSync) forceColorSyncRef.current = false
  })

  useEffect(() => {
    if (!wheelRef.current || !wheelRef.current.instanceColor) return
    const wheelColor = colorRef.current.wheel
    for (let index = 0; index < entities.length * 4; index += 1) {
      wheelRef.current.setColorAt(index, wheelColor)
    }
    wheelRef.current.instanceColor.needsUpdate = true
  }, [entityIds, entities.length])

  const bodyMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.45,
        roughness: 0.5,
      }),
    []
  )
  const cabinMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.35,
        roughness: 0.55,
      }),
    []
  )
  const arrowMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: '#1f2937',
        emissiveIntensity: 0.35,
        roughness: 0.4,
      }),
    []
  )
  const wheelMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.2,
        roughness: 0.82,
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
      >
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={bodyMaterial} attach="material" />
      </instancedMesh>

      <instancedMesh
        ref={cabinRef}
        args={[undefined, undefined, entities.length]}
        userData={{ pickable: true, entityIds }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={cabinMaterial} attach="material" />
      </instancedMesh>

      <instancedMesh
        ref={arrowRef}
        args={[undefined, undefined, entities.length]}
        userData={{ pickable: true, entityIds }}
      >
        <coneGeometry args={[0.45, 1, 8]} />
        <primitive object={arrowMaterial} attach="material" />
      </instancedMesh>

      <instancedMesh
        ref={wheelRef}
        args={[undefined, undefined, entities.length * 4]}
        userData={{ pickable: true, entityIds: wheelEntityIds }}
      >
        <cylinderGeometry args={[1, 1, 1, 14]} />
        <primitive object={wheelMaterial} attach="material" />
      </instancedMesh>
    </group>
  )
})

VehicleInstances.displayName = 'VehicleInstances'
