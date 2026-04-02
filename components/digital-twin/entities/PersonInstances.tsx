'use client'

import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CAMPUS_INTERACTION_HEIGHT, CAMPUS_INTERACTION_RADIUS } from '@/lib/digital-twin/campus-layout'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import type { PersonEntity } from '@/lib/digital-twin/types'

interface PersonInstancesProps {
  entities: PersonEntity[]
}

const BODY_TEMP = new THREE.Object3D()
const HEAD_TEMP = new THREE.Object3D()
const INTERACTION_BOUNDS_SPHERE = new THREE.Sphere(
  new THREE.Vector3(0, 2, 0),
  CAMPUS_INTERACTION_RADIUS
)
const INTERACTION_BOUNDS_BOX = new THREE.Box3(
  new THREE.Vector3(-CAMPUS_INTERACTION_RADIUS, -2, -CAMPUS_INTERACTION_RADIUS),
  new THREE.Vector3(CAMPUS_INTERACTION_RADIUS, CAMPUS_INTERACTION_HEIGHT, CAMPUS_INTERACTION_RADIUS)
)

interface PersonRuntimeState {
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

function getStatusColor(status: PersonEntity['status']) {
  switch (status) {
    case 'active':
      return '#64748b'
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

export const PersonInstances = memo(function PersonInstances({ entities }: PersonInstancesProps) {
  const bodyRef = useRef<THREE.InstancedMesh>(null)
  const headRef = useRef<THREE.InstancedMesh>(null)
  const runtimeRef = useRef<Map<string, PersonRuntimeState>>(new Map())
  const statusRef = useRef<Map<string, PersonEntity['status']>>(new Map())
  const forceColorSyncRef = useRef(true)
  const colorRef = useRef({
    body: new THREE.Color(),
    head: new THREE.Color(),
  })
  const entityIds = useMemo(() => entities.map((entity) => entity.id), [entities])

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
    if (headRef.current) {
      headRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      headRef.current.instanceColor?.setUsage(THREE.DynamicDrawUsage)
      applyInteractionBounds(headRef.current)
    }
  }, [entities.length])

  useFrame((_state, delta) => {
    if (!bodyRef.current || !headRef.current || entities.length === 0) return

    const store = useDigitalTwinStore.getState()
    const getSnapshotById = store.getEcsSnapshotById
    const runtimeStates = runtimeRef.current
    const statusStates = statusRef.current
    const bodyColor = colorRef.current.body
    const headColor = colorRef.current.head
    const dt = Math.min(delta, 0.05)
    const smoothing = 1 - Math.exp(-14 * dt)
    const forceColorSync = forceColorSyncRef.current
    let colorDirty = false

    for (let index = 0; index < entities.length; index += 1) {
      const entity = entities[index]
      const snapshot = getSnapshotById(entity.id)
      const targetPosition = snapshot?.position ?? entity.position
      const targetYaw = snapshot?.rotation.y ?? entity.rotation.y
      const targetStatus = (snapshot?.status as PersonEntity['status'] | undefined) ?? entity.status

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

      BODY_TEMP.position.set(state.x, state.y + 0.55, state.z)
      BODY_TEMP.rotation.set(0, state.yaw, 0)
      BODY_TEMP.scale.set(1, 1, 1)
      BODY_TEMP.updateMatrix()
      bodyRef.current.setMatrixAt(index, BODY_TEMP.matrix)

      HEAD_TEMP.position.set(state.x, state.y + 1.24, state.z)
      HEAD_TEMP.rotation.set(0, state.yaw, 0)
      HEAD_TEMP.scale.set(1, 1, 1)
      HEAD_TEMP.updateMatrix()
      headRef.current.setMatrixAt(index, HEAD_TEMP.matrix)

      const prevStatus = statusStates.get(entity.id)
      if (forceColorSync || prevStatus !== targetStatus) {
        statusStates.set(entity.id, targetStatus)
        bodyColor.set(getStatusColor(targetStatus))
        bodyRef.current.setColorAt(index, bodyColor)
        headColor.copy(bodyColor).offsetHSL(0, 0, 0.08)
        headRef.current.setColorAt(index, headColor)
        colorDirty = true
      }
    }

    bodyRef.current.instanceMatrix.needsUpdate = true
    headRef.current.instanceMatrix.needsUpdate = true
    if (colorDirty && bodyRef.current.instanceColor) bodyRef.current.instanceColor.needsUpdate = true
    if (colorDirty && headRef.current.instanceColor) headRef.current.instanceColor.needsUpdate = true
    if (forceColorSync) forceColorSyncRef.current = false
  })

  const bodyMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.2,
        roughness: 0.7,
      }),
    []
  )
  const headMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.15,
        roughness: 0.62,
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
        <capsuleGeometry args={[0.23, 0.72, 4, 10]} />
        <primitive object={bodyMaterial} attach="material" />
      </instancedMesh>

      <instancedMesh
        ref={headRef}
        args={[undefined, undefined, entities.length]}
        userData={{ pickable: true, entityIds }}
      >
        <sphereGeometry args={[0.22, 12, 12]} />
        <primitive object={headMaterial} attach="material" />
      </instancedMesh>
    </group>
  )
})

PersonInstances.displayName = 'PersonInstances'
