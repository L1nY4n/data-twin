'use client'

import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  createInstancedInteractionBounds,
  type InstancedInteractionBounds,
} from '@/lib/digital-twin/renderer/instanced-bounds'
import {
  markInstancedMatrixRange,
  writeYawScaleMatrix,
} from '@/lib/digital-twin/renderer/instance-matrix-writer'
import { ensureInstancedColorBuffer } from '@/lib/digital-twin/renderer/instance-color-buffer'
import { createPersonProxyGeometry } from '@/lib/digital-twin/renderer/person-proxy-geometry'
import {
  attachWebGpuStorageRaycast,
  createWebGpuStorageInstancePipeline,
  detachWebGpuStorageRaycast,
  dispatchWebGpuStorageCompute,
  markWebGpuStorageColorRange,
  markWebGpuStorageTargetRange,
  resetWebGpuStorageMotion,
  writeWebGpuStorageColor,
  writeWebGpuStorageTargetTransform,
} from '@/lib/digital-twin/renderer/webgpu-storage-instances'
import {
  resolveEntitySimulationCadence,
  shouldSimulateEntityThisTick,
} from '@/lib/digital-twin/runtime-simulation-cadence'
import { runtimeVehiclePoseBuffer } from '@/lib/digital-twin/runtime-vehicle-pose-buffer'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import type { PersonEntity } from '@/lib/digital-twin/types'

interface PersonInstancesProps {
  entities: PersonEntity[]
}

const CAMERA_PROJECTION_MATRIX = new THREE.Matrix4()
const CAMERA_FRUSTUM = new THREE.Frustum()
const CAMERA_DIRECTION = new THREE.Vector3()

interface PersonRuntimeState {
  x: number
  y: number
  z: number
  yaw: number
  targetX: number
  targetY: number
  targetZ: number
  targetYaw: number
  status: PersonEntity['status']
}

const POSITION_EPSILON = 0.001
const ROTATION_EPSILON = 0.001
const GPU_MOTION_ACTIVE_FRAMES = 90

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

function hasTargetChanged(state: PersonRuntimeState, targetPosition: PersonEntity['position'], targetYaw: number) {
  return (
    Math.abs(targetPosition.x - state.targetX) > POSITION_EPSILON ||
    Math.abs(targetPosition.y - state.targetY) > POSITION_EPSILON ||
    Math.abs(targetPosition.z - state.targetZ) > POSITION_EPSILON ||
    Math.abs(normalizeRadians(targetYaw - state.targetYaw)) > ROTATION_EPSILON
  )
}

function isSettled(state: PersonRuntimeState) {
  return (
    Math.abs(state.targetX - state.x) <= POSITION_EPSILON &&
    Math.abs(state.targetY - state.y) <= POSITION_EPSILON &&
    Math.abs(state.targetZ - state.z) <= POSITION_EPSILON &&
    Math.abs(normalizeRadians(state.targetYaw - state.yaw)) <= ROTATION_EPSILON
  )
}

function stepRuntimeState(state: PersonRuntimeState, smoothing: number) {
  state.x += (state.targetX - state.x) * smoothing
  state.y += (state.targetY - state.y) * smoothing
  state.z += (state.targetZ - state.z) * smoothing
  state.yaw = lerpAngle(state.yaw, state.targetYaw, smoothing)

  if (Math.abs(state.targetX - state.x) <= POSITION_EPSILON) state.x = state.targetX
  if (Math.abs(state.targetY - state.y) <= POSITION_EPSILON) state.y = state.targetY
  if (Math.abs(state.targetZ - state.z) <= POSITION_EPSILON) state.z = state.targetZ
  if (Math.abs(normalizeRadians(state.targetYaw - state.yaw)) <= ROTATION_EPSILON) {
    state.yaw = state.targetYaw
  }
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

function applyInteractionBounds(
  mesh: THREE.InstancedMesh | null,
  interactionBounds: InstancedInteractionBounds
) {
  if (!mesh) return
  mesh.frustumCulled = true
  mesh.boundingSphere = interactionBounds.sphere.clone()
  mesh.boundingBox = interactionBounds.box.clone()
}

function isInteractionBoundsVisible(camera: THREE.Camera, sphere: THREE.Sphere) {
  CAMERA_PROJECTION_MATRIX.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  CAMERA_FRUSTUM.setFromProjectionMatrix(CAMERA_PROJECTION_MATRIX)
  return CAMERA_FRUSTUM.intersectsSphere(sphere)
}

export const PersonInstances = memo(function PersonInstances({ entities }: PersonInstancesProps) {
  const personRef = useRef<THREE.InstancedMesh>(null)
  const runtimeRef = useRef<Map<string, PersonRuntimeState>>(new Map())
  const statusRef = useRef<Map<string, PersonEntity['status']>>(new Map())
  const forceMatrixSyncRef = useRef(true)
  const forceColorSyncRef = useRef(true)
  const batchVisibleRef = useRef(true)
  const frameTickRef = useRef(0)
  const gpuMotionFramesRef = useRef(0)
  const colorRef = useRef(new THREE.Color())
  const rendererBackend = useDigitalTwinStore((state) => state.rendererBackend)
  const useWebGpuStorage = rendererBackend === 'webgpu'
  const personProxyGeometry = useMemo(() => createPersonProxyGeometry(), [])
  const personStoragePipeline = useMemo(
    () =>
      useWebGpuStorage
        ? createWebGpuStorageInstancePipeline({
            count: entities.length,
            transformKind: 'yaw',
            motionMode: 'gpu-damped',
            material: {
              vertexColors: true,
              metalness: 0.2,
              roughness: 0.68,
            },
          })
        : null,
    [entities.length, useWebGpuStorage]
  )
  const entityIds = useMemo(() => entities.map((entity) => entity.id), [entities])
  const entityIdSignature = useMemo(() => entityIds.join('|'), [entityIds])
  const entityIdSet = useMemo(() => new Set(entityIds), [entityIds])
  const interactionBounds = useMemo(
    () =>
      createInstancedInteractionBounds(
        entities.map((entity) => entity.position),
        {
          paddingXz: 28,
          paddingTop: 6,
          paddingBottom: 2,
        }
      ),
    [entities]
  )

  useEffect(() => () => personProxyGeometry.dispose(), [personProxyGeometry])
  useEffect(() => () => personStoragePipeline?.dispose(), [personStoragePipeline])

  useEffect(() => {
    const nextIds = new Set(entityIdSignature ? entityIdSignature.split('|') : [])
    runtimeRef.current.forEach((_state, id) => {
      if (!nextIds.has(id)) runtimeRef.current.delete(id)
    })
    statusRef.current.forEach((_status, id) => {
      if (!nextIds.has(id)) statusRef.current.delete(id)
    })
  }, [entityIdSignature])

  useEffect(() => {
    forceMatrixSyncRef.current = true
    forceColorSyncRef.current = true
    if (personStoragePipeline) {
      resetWebGpuStorageMotion(personStoragePipeline)
    }
  }, [entityIdSignature, personStoragePipeline])

  useLayoutEffect(() => {
    if (personRef.current) {
      if (personStoragePipeline) {
        personRef.current.instanceColor = null
        personRef.current.instanceMatrix.setUsage(THREE.StaticDrawUsage)
        attachWebGpuStorageRaycast(personRef.current, personStoragePipeline)
      } else {
        detachWebGpuStorageRaycast(personRef.current)
        ensureInstancedColorBuffer(personRef.current)
        personRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        personRef.current.instanceColor?.setUsage(THREE.DynamicDrawUsage)
      }
      applyInteractionBounds(personRef.current, interactionBounds)
    }
  }, [interactionBounds, personStoragePipeline])

  useFrame(({ camera, gl }, delta) => {
    if (!personRef.current || entities.length === 0) return
    if (!isInteractionBoundsVisible(camera, interactionBounds.sphere)) {
      batchVisibleRef.current = false
      return
    }

    const store = useDigitalTwinStore.getState()
    const getSnapshotById = store.getEcsSnapshotById
    const runtimeStates = runtimeRef.current
    const statusStates = statusRef.current
    if (!batchVisibleRef.current) {
      runtimeStates.clear()
      statusStates.clear()
      forceMatrixSyncRef.current = true
      forceColorSyncRef.current = true
      batchVisibleRef.current = true
    }
    const personColor = colorRef.current
    const dt = Math.min(delta, 0.05)
    const smoothing = 1 - Math.exp(-14 * dt)
    const forceMatrixSync = forceMatrixSyncRef.current
    const forceColorSync = forceColorSyncRef.current
    const usingWebGpuStorage = personStoragePipeline !== null
    const selectedEntityId = store.selectedEntityId
    const hoveredEntityId = store.hoveredEntityId
    const batchHasFocusedEntity =
      (!!selectedEntityId && entityIdSet.has(selectedEntityId)) ||
      (!!hoveredEntityId && entityIdSet.has(hoveredEntityId))
    frameTickRef.current += 1

    if (!forceMatrixSync && !forceColorSync && !batchHasFocusedEntity) {
      camera.getWorldDirection(CAMERA_DIRECTION)
      const cadence = resolveEntitySimulationCadence({
        entityPosition: interactionBounds.sphere.center,
        cameraPosition: camera.position,
        cameraTarget: {
          x: camera.position.x + CAMERA_DIRECTION.x * 12,
          y: camera.position.y + CAMERA_DIRECTION.y * 12,
          z: camera.position.z + CAMERA_DIRECTION.z * 12,
        },
      })

      if (!shouldSimulateEntityThisTick(frameTickRef.current, cadence)) {
        if (usingWebGpuStorage && gpuMotionFramesRef.current > 0) {
          dispatchWebGpuStorageCompute(gl, personStoragePipeline, smoothing)
          gpuMotionFramesRef.current -= 1
        }
        return
      }
    }

    let firstDirtyIndex = Number.POSITIVE_INFINITY
    let lastDirtyIndex = -1
    let firstDirtyColorIndex = Number.POSITIVE_INFINITY
    let lastDirtyColorIndex = -1
    let colorDirty = false
    const personMatrixArray = usingWebGpuStorage ? null : personRef.current.instanceMatrix.array

    for (let index = 0; index < entities.length; index += 1) {
      const entity = entities[index]
      const snapshot = getSnapshotById(entity.id)
      const targetPosition = snapshot?.position ?? entity.position
      const targetYaw = snapshot?.rotation.y ?? entity.rotation.y
      let targetStatus = (snapshot?.status as PersonEntity['status'] | undefined) ?? entity.status

      let state = runtimeStates.get(entity.id)
      let shouldSyncMatrix = forceMatrixSync
      if (!state) {
        state = {
          x: targetPosition.x,
          y: targetPosition.y,
          z: targetPosition.z,
          yaw: targetYaw,
          targetX: targetPosition.x,
          targetY: targetPosition.y,
          targetZ: targetPosition.z,
          targetYaw,
          status: targetStatus,
        }
        runtimeStates.set(entity.id, state)
        shouldSyncMatrix = true
      }

      const poseResult = runtimeVehiclePoseBuffer.populate(entity.id, state)
      if (poseResult !== 'missing') {
        if (poseResult === 'changed') {
          state.targetX = state.x
          state.targetY = state.y
          state.targetZ = state.z
          state.targetYaw = state.yaw
          targetStatus = state.status
          shouldSyncMatrix = true
        } else {
          state.status = targetStatus
        }
      } else if (hasTargetChanged(state, targetPosition, targetYaw)) {
        state.targetX = targetPosition.x
        state.targetY = targetPosition.y
        state.targetZ = targetPosition.z
        state.targetYaw = targetYaw
        shouldSyncMatrix = true
      }

      if (!usingWebGpuStorage && !isSettled(state)) {
        stepRuntimeState(state, smoothing)
        shouldSyncMatrix = true
      }

      if (shouldSyncMatrix) {
        if (usingWebGpuStorage) {
          writeWebGpuStorageTargetTransform(
            personStoragePipeline,
            index,
            state.targetX,
            state.targetY,
            state.targetZ,
            state.targetYaw,
            1,
            1,
            1
          )
        } else {
          writeYawScaleMatrix(personMatrixArray!, index, state.x, state.y, state.z, state.yaw, 1, 1, 1)
        }
        firstDirtyIndex = Math.min(firstDirtyIndex, index)
        lastDirtyIndex = Math.max(lastDirtyIndex, index)
      }

      const prevStatus = statusStates.get(entity.id)
      if (forceColorSync || prevStatus !== targetStatus) {
        statusStates.set(entity.id, targetStatus)
        personColor.set(getStatusColor(targetStatus))
        if (usingWebGpuStorage) {
          writeWebGpuStorageColor(personStoragePipeline, index, personColor)
        } else {
          personRef.current.setColorAt(index, personColor)
        }
        firstDirtyColorIndex = Math.min(firstDirtyColorIndex, index)
        lastDirtyColorIndex = Math.max(lastDirtyColorIndex, index)
        colorDirty = true
      }
    }

    if (firstDirtyIndex <= lastDirtyIndex) {
      if (usingWebGpuStorage) {
        markWebGpuStorageTargetRange(personStoragePipeline, firstDirtyIndex, lastDirtyIndex)
        dispatchWebGpuStorageCompute(gl, personStoragePipeline, smoothing)
        gpuMotionFramesRef.current = GPU_MOTION_ACTIVE_FRAMES
      } else {
        markInstancedMatrixRange(personRef.current, firstDirtyIndex, lastDirtyIndex)
      }
    } else if (usingWebGpuStorage && gpuMotionFramesRef.current > 0) {
      dispatchWebGpuStorageCompute(gl, personStoragePipeline, smoothing)
      gpuMotionFramesRef.current -= 1
    }
    if (colorDirty) {
      if (usingWebGpuStorage) {
        markWebGpuStorageColorRange(personStoragePipeline, firstDirtyColorIndex, lastDirtyColorIndex)
      } else if (personRef.current.instanceColor) {
        personRef.current.instanceColor.needsUpdate = true
      }
    }
    if (forceMatrixSync) forceMatrixSyncRef.current = false
    if (forceColorSync) forceColorSyncRef.current = false
  })

  const cpuPersonMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.2,
        roughness: 0.68,
      }),
    []
  )
  const personMaterial = personStoragePipeline?.material ?? cpuPersonMaterial

  if (entities.length === 0) return null

  return (
    <group>
      <instancedMesh
        ref={personRef}
        args={[undefined, undefined, entities.length]}
        userData={{ pickable: true, entityIds }}
      >
        <primitive object={personProxyGeometry} attach="geometry" />
        <primitive object={personMaterial} attach="material" />
      </instancedMesh>
    </group>
  )
})

PersonInstances.displayName = 'PersonInstances'
