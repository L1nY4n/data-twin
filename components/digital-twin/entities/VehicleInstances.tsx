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
import {
  resolveEntitySimulationCadence,
  shouldSimulateEntityThisTick,
} from '@/lib/digital-twin/runtime-simulation-cadence'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import type { VehicleEntity } from '@/lib/digital-twin/types'
import {
  normalizeVehicleRouteLike,
  normalizeVehicleTrackLike,
  resolveVehicleRoutePose,
} from '@/lib/digital-twin/vehicle-route-motion'
import { runtimeVehiclePoseBuffer } from '@/lib/digital-twin/runtime-vehicle-pose-buffer'
import { createVehicleProxyShellGeometry } from '@/lib/digital-twin/renderer/vehicle-proxy-geometry'
import {
  attachWebGpuStorageRaycast,
  createWebGpuStorageInstancePipeline,
  detachWebGpuStorageRaycast,
  dispatchWebGpuStorageCompute,
  markWebGpuStorageColorRange,
  markWebGpuStorageTransformRange,
  writeWebGpuStorageColor,
  writeWebGpuStorageTransform,
} from '@/lib/digital-twin/renderer/webgpu-storage-instances'
import {
  reseedVehicleRuntimeState,
  type VehicleRuntimeState,
} from './vehicle-instance-runtime'

interface VehicleInstancesProps {
  entities: VehicleEntity[]
  suppressedEntityIds?: ReadonlySet<string>
}

const CAMERA_PROJECTION_MATRIX = new THREE.Matrix4()
const CAMERA_FRUSTUM = new THREE.Frustum()
const CAMERA_DIRECTION = new THREE.Vector3()

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

function setSuppressedInstanceMatrices(
  shellMatrixArray: THREE.InstancedMesh['instanceMatrix']['array'],
  state: VehicleRuntimeState,
  index: number
) {
  const hiddenY = state.y - 10000
  writeYawScaleMatrix(shellMatrixArray, index, state.x, hiddenY, state.z, state.yaw, 0.001, 0.001, 0.001)
}

function resolveVehiclePoseFromEntity(entity: VehicleEntity) {
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

export const VehicleInstances = memo(function VehicleInstances({
  entities,
  suppressedEntityIds,
}: VehicleInstancesProps) {
  const shellRef = useRef<THREE.InstancedMesh>(null)
  const runtimeRef = useRef<Map<string, VehicleRuntimeState>>(new Map())
  const statusRef = useRef<Map<string, VehicleEntity['status']>>(new Map())
  const forceMatrixSyncRef = useRef(true)
  const forceColorSyncRef = useRef(true)
  const batchVisibleRef = useRef(true)
  const frameTickRef = useRef(0)
  const colorRef = useRef(new THREE.Color())
  const rendererBackend = useDigitalTwinStore((state) => state.rendererBackend)
  const useWebGpuStorage = rendererBackend === 'webgpu'
  const vehicleProxyGeometry = useMemo(() => createVehicleProxyShellGeometry(), [])
  const vehicleStoragePipeline = useMemo(
    () =>
      useWebGpuStorage
        ? createWebGpuStorageInstancePipeline({
            count: entities.length,
            transformKind: 'yaw',
            material: {
              vertexColors: true,
              metalness: 0.42,
              roughness: 0.52,
            },
          })
        : null,
    [entities.length, useWebGpuStorage]
  )
  const entityIds = useMemo(() => entities.map((entity) => entity.id), [entities])
  const entityIdSignature = useMemo(() => entityIds.join('|'), [entityIds])
  const entityIdSet = useMemo(() => new Set(entityIds), [entityIds])
  const suppressedEntityIdSignature = useMemo(
    () => (suppressedEntityIds ? [...suppressedEntityIds].sort().join('|') : ''),
    [suppressedEntityIds]
  )
  const interactionBounds = useMemo(
    () =>
      createInstancedInteractionBounds(
        entities.map((entity) => entity.position),
        {
          paddingXz: 44,
          paddingTop: 8,
          paddingBottom: 2,
        }
      ),
    [entities]
  )

  useEffect(() => () => vehicleProxyGeometry.dispose(), [vehicleProxyGeometry])
  useEffect(() => () => vehicleStoragePipeline?.dispose(), [vehicleStoragePipeline])

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
  }, [entityIdSignature, suppressedEntityIdSignature])

  useLayoutEffect(() => {
    if (shellRef.current) {
      if (vehicleStoragePipeline) {
        shellRef.current.instanceColor = null
        shellRef.current.instanceMatrix.setUsage(THREE.StaticDrawUsage)
        attachWebGpuStorageRaycast(shellRef.current, vehicleStoragePipeline)
      } else {
        detachWebGpuStorageRaycast(shellRef.current)
        ensureInstancedColorBuffer(shellRef.current)
        shellRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        shellRef.current.instanceColor?.setUsage(THREE.DynamicDrawUsage)
      }
      applyInteractionBounds(shellRef.current, interactionBounds)
    }
  }, [interactionBounds, vehicleStoragePipeline])

  useFrame(({ camera, gl }) => {
    if (!shellRef.current || entities.length === 0) return
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
    const shellColor = colorRef.current
    const forceMatrixSync = forceMatrixSyncRef.current
    const forceColorSync = forceColorSyncRef.current
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
        return
      }
    }

    let firstDirtyIndex = Number.POSITIVE_INFINITY
    let lastDirtyIndex = -1
    let firstDirtyColorIndex = Number.POSITIVE_INFINITY
    let lastDirtyColorIndex = -1
    let colorDirty = false
    const usingWebGpuStorage = vehicleStoragePipeline !== null
    const shellMatrixArray = usingWebGpuStorage ? null : shellRef.current.instanceMatrix.array

    for (let index = 0; index < entities.length; index += 1) {
      const entity = entities[index]
      const size = VEHICLE_SIZES[entity.vehicleType]
      const snapshot = getSnapshotById(entity.id)
      const targetStatus = (snapshot?.status as VehicleEntity['status'] | undefined) ?? entity.status

      let state = runtimeStates.get(entity.id)
      let shouldSyncMatrix = forceMatrixSync
      if (!state) {
        const initialPose = resolveVehiclePoseFromEntity(entity)
        state = {
          x: initialPose.x,
          y: initialPose.y,
          z: initialPose.z,
          yaw: initialPose.yaw,
          status: targetStatus,
        }
        runtimeStates.set(entity.id, state)
        shouldSyncMatrix = true
      }

      const poseResult = runtimeVehiclePoseBuffer.populate(entity.id, state)
      if (poseResult !== 'missing') {
        if (poseResult === 'changed') {
          shouldSyncMatrix = true
        }
      } else {
        shouldSyncMatrix =
          reseedVehicleRuntimeState(state, entity, snapshot) || shouldSyncMatrix
      }
      state.status = targetStatus

      const prevStatus = statusStates.get(entity.id)
      const renderStatus = state.status
      const statusChanged = forceColorSync || prevStatus !== renderStatus
      if (statusChanged) {
        statusStates.set(entity.id, renderStatus)
        shellColor.set(getBodyColor(entity.vehicleType, renderStatus))
        if (usingWebGpuStorage) {
          writeWebGpuStorageColor(vehicleStoragePipeline, index, shellColor)
        }
        firstDirtyColorIndex = Math.min(firstDirtyColorIndex, index)
        lastDirtyColorIndex = Math.max(lastDirtyColorIndex, index)
        colorDirty = true
      }

      if (suppressedEntityIds?.has(entity.id)) {
        if (shouldSyncMatrix) {
          if (usingWebGpuStorage) {
            writeWebGpuStorageTransform(
              vehicleStoragePipeline,
              index,
              state.x,
              state.y - 10000,
              state.z,
              state.yaw,
              0.001,
              0.001,
              0.001
            )
          } else {
            setSuppressedInstanceMatrices(
              shellMatrixArray!,
              state,
              index
            )
          }
          firstDirtyIndex = Math.min(firstDirtyIndex, index)
          lastDirtyIndex = Math.max(lastDirtyIndex, index)
        }
        continue
      }

      if (shouldSyncMatrix) {
        if (usingWebGpuStorage) {
          writeWebGpuStorageTransform(
            vehicleStoragePipeline,
            index,
            state.x,
            state.y,
            state.z,
            state.yaw,
            size.width,
            size.height,
            size.depth
          )
        } else {
          writeYawScaleMatrix(
            shellMatrixArray!,
            index,
            state.x,
            state.y,
            state.z,
            state.yaw,
            size.width,
            size.height,
            size.depth
          )
        }
        firstDirtyIndex = Math.min(firstDirtyIndex, index)
        lastDirtyIndex = Math.max(lastDirtyIndex, index)
      }

      if (statusChanged && !usingWebGpuStorage) {
        shellRef.current.setColorAt(index, shellColor)
      }
    }

    if (firstDirtyIndex <= lastDirtyIndex) {
      if (usingWebGpuStorage) {
        markWebGpuStorageTransformRange(vehicleStoragePipeline, firstDirtyIndex, lastDirtyIndex)
        dispatchWebGpuStorageCompute(gl, vehicleStoragePipeline)
      } else {
        markInstancedMatrixRange(shellRef.current, firstDirtyIndex, lastDirtyIndex)
      }
    }
    if (colorDirty) {
      if (usingWebGpuStorage) {
        markWebGpuStorageColorRange(vehicleStoragePipeline, firstDirtyColorIndex, lastDirtyColorIndex)
      } else if (shellRef.current.instanceColor) {
        shellRef.current.instanceColor.needsUpdate = true
      }
    }
    if (forceMatrixSync) forceMatrixSyncRef.current = false
    if (forceColorSync) forceColorSyncRef.current = false
  })

  const cpuShellMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.42,
        roughness: 0.52,
      }),
    []
  )
  const shellMaterial = vehicleStoragePipeline?.material ?? cpuShellMaterial

  if (entities.length === 0) return null

  return (
    <group>
      <instancedMesh
        ref={shellRef}
        args={[undefined, undefined, entities.length]}
        userData={{ pickable: true, entityIds }}
      >
        <primitive object={vehicleProxyGeometry} attach="geometry" />
        <primitive object={shellMaterial} attach="material" />
      </instancedMesh>
    </group>
  )
})

VehicleInstances.displayName = 'VehicleInstances'
