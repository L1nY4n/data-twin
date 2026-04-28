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
  writeGroundRingMatrix,
  writeTranslationScaleMatrix,
  writeYawScaleMatrix,
} from '@/lib/digital-twin/renderer/instance-matrix-writer'
import { ensureInstancedColorBuffer } from '@/lib/digital-twin/renderer/instance-color-buffer'
import {
  resolveEntitySimulationCadence,
  shouldSimulateEntityThisTick,
} from '@/lib/digital-twin/runtime-simulation-cadence'
import {
  OVERLAY_RENDER_ORDER,
  STABLE_DOUBLE_SIDED_OVERLAY,
  STABLE_TRANSPARENT_OVERLAY,
} from '@/lib/digital-twin/renderer/material-stability'
import {
  attachWebGpuSharedMovingRaycast,
  detachWebGpuStorageRaycast,
  createWebGpuSharedMovingInstancePipeline,
  dispatchWebGpuSharedMovingCompute,
  getWebGpuSharedMovingPart,
  markWebGpuSharedMovingColorRange,
  markWebGpuSharedMovingPartTransformRange,
  markWebGpuSharedMovingTargetRange,
  resetWebGpuSharedMovingSlots,
  writeWebGpuSharedMovingColor,
  writeWebGpuSharedMovingPartTransform,
  writeWebGpuSharedMovingTarget,
} from '@/lib/digital-twin/renderer/webgpu-storage-instances'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { runtimeVehiclePoseBuffer } from '@/lib/digital-twin/runtime-vehicle-pose-buffer'
import type { DynamicEntity } from '@/lib/digital-twin/types'
import type { DynamicEntityPresentation } from '@/lib/digital-twin/entity-schema-registry'

export interface DynamicEntityRenderItem {
  entity: DynamicEntity
  presentation: DynamicEntityPresentation
}

interface DynamicEntityInstancesProps {
  items: DynamicEntityRenderItem[]
  selectedEntityId: string | null
  hoveredEntityId: string | null
  suppressedEntityIds?: ReadonlySet<string>
}

const CAMERA_PROJECTION_MATRIX = new THREE.Matrix4()
const CAMERA_FRUSTUM = new THREE.Frustum()
const CAMERA_DIRECTION = new THREE.Vector3()
const GPU_MOTION_ACTIVE_FRAMES = 90

const STATUS_COLORS: Record<DynamicEntity['status'], string> = {
  active: '#22c55e',
  inactive: '#6b7280',
  warning: '#f59e0b',
  error: '#ef4444',
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

interface DynamicRuntimeState {
  x: number
  y: number
  z: number
  yaw: number
  scaleX: number
  scaleY: number
  scaleZ: number
  targetX: number
  targetY: number
  targetZ: number
  targetYaw: number
  status: DynamicEntity['status']
}

const POSITION_EPSILON = 0.001
const ROTATION_EPSILON = 0.001

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

function hasTargetChanged(
  state: DynamicRuntimeState,
  targetPosition: DynamicEntity['position'],
  targetYaw: number
) {
  return (
    Math.abs(targetPosition.x - state.targetX) > POSITION_EPSILON ||
    Math.abs(targetPosition.y - state.targetY) > POSITION_EPSILON ||
    Math.abs(targetPosition.z - state.targetZ) > POSITION_EPSILON ||
    Math.abs(normalizeRadians(targetYaw - state.targetYaw)) > ROTATION_EPSILON
  )
}

function hasScaleChanged(state: DynamicRuntimeState, targetScale: DynamicEntity['scale']) {
  return (
    Math.abs(targetScale.x - state.scaleX) > POSITION_EPSILON ||
    Math.abs(targetScale.y - state.scaleY) > POSITION_EPSILON ||
    Math.abs(targetScale.z - state.scaleZ) > POSITION_EPSILON
  )
}

function isSettled(state: DynamicRuntimeState) {
  return (
    Math.abs(state.targetX - state.x) <= POSITION_EPSILON &&
    Math.abs(state.targetY - state.y) <= POSITION_EPSILON &&
    Math.abs(state.targetZ - state.z) <= POSITION_EPSILON &&
    Math.abs(normalizeRadians(state.targetYaw - state.yaw)) <= ROTATION_EPSILON
  )
}

function stepRuntimeState(state: DynamicRuntimeState, smoothing: number) {
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

export const DynamicEntityInstances = memo(function DynamicEntityInstances({
  items,
  selectedEntityId,
  hoveredEntityId,
  suppressedEntityIds,
}: DynamicEntityInstancesProps) {
  const bodyRef = useRef<THREE.InstancedMesh>(null)
  const statusRef = useRef<THREE.InstancedMesh>(null)
  const ringRef = useRef<THREE.InstancedMesh>(null)
  const runtimeRef = useRef<Map<string, DynamicRuntimeState>>(new Map())
  const statusStateRef = useRef<Map<string, DynamicEntity['status']>>(new Map())
  const forceMatrixSyncRef = useRef(true)
  const forceColorSyncRef = useRef(true)
  const batchVisibleRef = useRef(true)
  const frameTickRef = useRef(0)
  const gpuMotionFramesRef = useRef(0)
  const colorRef = useRef({
    body: new THREE.Color(),
    status: new THREE.Color(),
    ring: new THREE.Color(),
  })
  const rendererBackend = useDigitalTwinStore((state) => state.rendererBackend)
  const useWebGpuStorage = rendererBackend === 'webgpu'
  const sharedMovingPipeline = useMemo(
    () =>
      useWebGpuStorage
        ? createWebGpuSharedMovingInstancePipeline({
            count: items.length,
            parts: [
              {
                id: 'body',
                transformKind: 'yaw',
                material: {
                  vertexColors: true,
                  metalness: 0.25,
                  roughness: 0.55,
                },
              },
              {
                id: 'status',
                transformKind: 'translation',
                material: {
                  vertexColors: true,
                  emissive: '#111827',
                  emissiveIntensity: 0.7,
                  opacity: 0.85,
                  ...STABLE_TRANSPARENT_OVERLAY,
                },
              },
              {
                id: 'ring',
                transformKind: 'ground-ring',
                material: {
                  vertexColors: true,
                  emissive: '#111827',
                  emissiveIntensity: 0.14,
                  opacity: 0.32,
                  ...STABLE_DOUBLE_SIDED_OVERLAY,
                },
              },
            ],
          })
        : null,
    [items.length, useWebGpuStorage]
  )
  const entityIds = useMemo(() => items.map((item) => item.entity.id), [items])
  const entityIdSignature = useMemo(() => entityIds.join('|'), [entityIds])
  const slotState = useMemo(
    () => sharedMovingPipeline?.slotAllocator.sync(entityIds) ?? null,
    [entityIds, sharedMovingPipeline]
  )
  const renderEntityIds = useMemo(
    () => slotState?.slotEntityIds ?? entityIds,
    [entityIds, slotState]
  )
  const entityIdSet = useMemo(() => new Set(entityIds), [entityIds])
  const suppressedEntityIdSignature = useMemo(
    () => (suppressedEntityIds ? [...suppressedEntityIds].sort().join('|') : ''),
    [suppressedEntityIds]
  )
  const interactionBounds = useMemo(
    () =>
      createInstancedInteractionBounds(
        items.map((item) => item.entity.position),
        {
          paddingXz: 20,
          paddingTop: 6,
          paddingBottom: 2,
        }
      ),
    [items]
  )
  useEffect(() => {
    const nextIds = new Set(entityIdSignature ? entityIdSignature.split('|') : [])
    runtimeRef.current.forEach((_state, id) => {
      if (!nextIds.has(id)) runtimeRef.current.delete(id)
    })
    statusStateRef.current.forEach((_status, id) => {
      if (!nextIds.has(id)) statusStateRef.current.delete(id)
    })
  }, [entityIdSignature])

  useEffect(() => {
    forceMatrixSyncRef.current = true
    forceColorSyncRef.current = true
  }, [entityIdSignature, suppressedEntityIdSignature])

  useLayoutEffect(() => {
    if (!sharedMovingPipeline || !slotState) return
    resetWebGpuSharedMovingSlots(sharedMovingPipeline, [
      ...slotState.releasedSlots,
      ...slotState.newlyAssignedSlots,
    ])
  }, [sharedMovingPipeline, slotState])

  useEffect(() => {
    forceColorSyncRef.current = true
  }, [hoveredEntityId, selectedEntityId])

  useEffect(
    () => () => {
      sharedMovingPipeline?.dispose()
    },
    [sharedMovingPipeline]
  )

  useLayoutEffect(() => {
    const bodyMesh = bodyRef.current
    const statusMesh = statusRef.current
    const ringMesh = ringRef.current
    if (!bodyMesh || !statusMesh || !ringMesh) return

    if (sharedMovingPipeline) {
      bodyMesh.instanceColor = null
      statusMesh.instanceColor = null
      ringMesh.instanceColor = null
      bodyMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
      statusMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
      ringMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
      attachWebGpuSharedMovingRaycast(bodyMesh, sharedMovingPipeline, 'body')
      attachWebGpuSharedMovingRaycast(statusMesh, sharedMovingPipeline, 'status')
      attachWebGpuSharedMovingRaycast(ringMesh, sharedMovingPipeline, 'ring')
    } else {
      detachWebGpuStorageRaycast(bodyMesh)
      detachWebGpuStorageRaycast(statusMesh)
      detachWebGpuStorageRaycast(ringMesh)
      ensureInstancedColorBuffer(bodyMesh)
      ensureInstancedColorBuffer(statusMesh)
      ensureInstancedColorBuffer(ringMesh)
      bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      bodyMesh.instanceColor?.setUsage(THREE.DynamicDrawUsage)
      statusMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      statusMesh.instanceColor?.setUsage(THREE.DynamicDrawUsage)
      ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      ringMesh.instanceColor?.setUsage(THREE.DynamicDrawUsage)
    }
    applyInteractionBounds(bodyMesh, interactionBounds)
    applyInteractionBounds(statusMesh, interactionBounds)
    applyInteractionBounds(ringMesh, interactionBounds)

    forceMatrixSyncRef.current = true
    forceColorSyncRef.current = true
  }, [interactionBounds, sharedMovingPipeline])

  useFrame(({ camera, gl }, delta) => {
    const bodyMesh = bodyRef.current
    const statusMesh = statusRef.current
    const ringMesh = ringRef.current
    if (!bodyMesh || !statusMesh || !ringMesh || items.length === 0) return
    if (!isInteractionBoundsVisible(camera, interactionBounds.sphere)) {
      batchVisibleRef.current = false
      return
    }

    const store = useDigitalTwinStore.getState()
    const getSnapshotById = store.getEcsSnapshotById
    const runtimeStates = runtimeRef.current
    const statusStates = statusStateRef.current
    if (!batchVisibleRef.current) {
      runtimeStates.clear()
      statusStates.clear()
      forceMatrixSyncRef.current = true
      forceColorSyncRef.current = true
      batchVisibleRef.current = true
    }
    const bodyColor = colorRef.current.body
    const statusColor = colorRef.current.status
    const ringColor = colorRef.current.ring
    const forceMatrixSync = forceMatrixSyncRef.current
    const forceColorSync = forceColorSyncRef.current
    const dt = Math.min(delta, 0.05)
    const smoothing = 1 - Math.exp(-14 * dt)
    const usingWebGpuStorage = sharedMovingPipeline !== null
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
          dispatchWebGpuSharedMovingCompute(gl, sharedMovingPipeline, smoothing)
          gpuMotionFramesRef.current -= 1
        }
        return
      }
    }
    const bodyMatrixArray = usingWebGpuStorage ? null : bodyMesh.instanceMatrix.array
    const statusMatrixArray = usingWebGpuStorage ? null : statusMesh.instanceMatrix.array
    const ringMatrixArray = usingWebGpuStorage ? null : ringMesh.instanceMatrix.array

    let firstDirtyIndex = Number.POSITIVE_INFINITY
    let lastDirtyIndex = -1
    let firstDirtyPartIndex = Number.POSITIVE_INFINITY
    let lastDirtyPartIndex = -1
    let firstDirtyColorIndex = Number.POSITIVE_INFINITY
    let lastDirtyColorIndex = -1
    let colorDirty = false

    for (let index = 0; index < items.length; index += 1) {
      const { entity, presentation } = items[index]
      const slot = slotState?.slotById.get(entity.id) ?? index
      const snapshot = getSnapshotById(entity.id)
      const hasDynamicSnapshot = snapshot?.type === 'dynamic'
      const targetPosition = hasDynamicSnapshot ? snapshot.position : entity.position
      const targetRotation = hasDynamicSnapshot ? snapshot.rotation : entity.rotation
      const targetScale = hasDynamicSnapshot ? snapshot.scale : entity.scale
      const targetStatus = hasDynamicSnapshot
        ? (snapshot.status as DynamicEntity['status'])
        : entity.status

      let runtime = runtimeStates.get(entity.id)
      let shouldSyncMatrix = forceMatrixSync
      let shouldSyncPartTransform = forceMatrixSync
      if (!runtime) {
        runtime = {
          x: targetPosition.x,
          y: targetPosition.y,
          z: targetPosition.z,
          yaw: targetRotation.y,
          scaleX: targetScale.x,
          scaleY: targetScale.y,
          scaleZ: targetScale.z,
          targetX: targetPosition.x,
          targetY: targetPosition.y,
          targetZ: targetPosition.z,
          targetYaw: targetRotation.y,
          status: targetStatus,
        }
        runtimeStates.set(entity.id, runtime)
        shouldSyncMatrix = true
        shouldSyncPartTransform = true
      }

      const poseResult = runtimeVehiclePoseBuffer.populate(entity.id, runtime)
      if (poseResult !== 'missing') {
        if (poseResult === 'changed') {
          runtime.targetX = runtime.x
          runtime.targetY = runtime.y
          runtime.targetZ = runtime.z
          runtime.targetYaw = runtime.yaw
          shouldSyncMatrix = true
        } else {
          runtime.status = targetStatus
        }
      } else {
        runtime.status = targetStatus
        if (hasTargetChanged(runtime, targetPosition, targetRotation.y)) {
          runtime.targetX = targetPosition.x
          runtime.targetY = targetPosition.y
          runtime.targetZ = targetPosition.z
          runtime.targetYaw = targetRotation.y
          shouldSyncMatrix = true
        }
      }
      if (hasScaleChanged(runtime, targetScale)) {
        runtime.scaleX = targetScale.x
        runtime.scaleY = targetScale.y
        runtime.scaleZ = targetScale.z
        shouldSyncMatrix = true
        shouldSyncPartTransform = true
      }

      if (!usingWebGpuStorage && !isSettled(runtime)) {
        stepRuntimeState(runtime, smoothing)
        shouldSyncMatrix = true
      }

      if (suppressedEntityIds?.has(entity.id)) {
        if (shouldSyncMatrix) {
          const renderX = usingWebGpuStorage ? runtime.targetX : runtime.x
          const renderY = usingWebGpuStorage ? runtime.targetY : runtime.y
          const renderZ = usingWebGpuStorage ? runtime.targetZ : runtime.z
          const renderYaw = usingWebGpuStorage ? runtime.targetYaw : runtime.yaw
          const hiddenY = renderY - 10000
          if (usingWebGpuStorage) {
            writeWebGpuSharedMovingTarget(sharedMovingPipeline, slot, renderX, hiddenY, renderZ, renderYaw)
            if (shouldSyncPartTransform) {
              writeWebGpuSharedMovingPartTransform(sharedMovingPipeline, 'body', slot, 0.001, 0.001, 0.001, 0)
              writeWebGpuSharedMovingPartTransform(sharedMovingPipeline, 'status', slot, 0.001, 0.001, 0.001, 0)
              writeWebGpuSharedMovingPartTransform(sharedMovingPipeline, 'ring', slot, 0.001, 1, 0.001, 0)
            }
          } else {
            writeTranslationScaleMatrix(bodyMatrixArray!, index, runtime.x, hiddenY, runtime.z, 0.001, 0.001, 0.001)
            writeTranslationScaleMatrix(statusMatrixArray!, index, runtime.x, hiddenY, runtime.z, 0.001, 0.001, 0.001)
            writeGroundRingMatrix(ringMatrixArray!, index, runtime.x, hiddenY, runtime.z, 0.001, 0.001)
          }
          firstDirtyIndex = Math.min(firstDirtyIndex, usingWebGpuStorage ? slot : index)
          lastDirtyIndex = Math.max(lastDirtyIndex, usingWebGpuStorage ? slot : index)
          if (usingWebGpuStorage && shouldSyncPartTransform) {
            firstDirtyPartIndex = Math.min(firstDirtyPartIndex, slot)
            lastDirtyPartIndex = Math.max(lastDirtyPartIndex, slot)
          }
        }
        continue
      }

      if (shouldSyncMatrix) {
        const renderX = usingWebGpuStorage ? runtime.targetX : runtime.x
        const renderY = usingWebGpuStorage ? runtime.targetY : runtime.y
        const renderZ = usingWebGpuStorage ? runtime.targetZ : runtime.z
        const renderYaw = usingWebGpuStorage ? runtime.targetYaw : runtime.yaw
        if (usingWebGpuStorage) {
          writeWebGpuSharedMovingTarget(sharedMovingPipeline, slot, renderX, renderY, renderZ, renderYaw)
          if (shouldSyncPartTransform) {
            writeWebGpuSharedMovingPartTransform(
              sharedMovingPipeline,
              'body',
              slot,
              Math.max(0.65, targetScale.x),
              Math.max(0.85, targetScale.y),
              Math.max(0.65, targetScale.z),
              targetScale.y * 0.9
            )
            writeWebGpuSharedMovingPartTransform(
              sharedMovingPipeline,
              'status',
              slot,
              1,
              1,
              1,
              Math.max(1.4, targetScale.y * 1.95)
            )
            writeWebGpuSharedMovingPartTransform(
              sharedMovingPipeline,
              'ring',
              slot,
              Math.max(0.75, targetScale.x),
              1,
              Math.max(0.75, targetScale.z),
              0.03
            )
          }
        } else {
          writeYawScaleMatrix(
            bodyMatrixArray!,
            index,
            runtime.x,
            runtime.y + targetScale.y * 0.9,
            runtime.z,
            runtime.yaw,
            Math.max(0.65, targetScale.x),
            Math.max(0.85, targetScale.y),
            Math.max(0.65, targetScale.z)
          )
          writeTranslationScaleMatrix(
            statusMatrixArray!,
            index,
            runtime.x,
            runtime.y + Math.max(1.4, targetScale.y * 1.95),
            runtime.z,
            1,
            1,
            1
          )
          writeGroundRingMatrix(
            ringMatrixArray!,
            index,
            runtime.x,
            runtime.y + 0.03,
            runtime.z,
            Math.max(0.75, targetScale.x),
            Math.max(0.75, targetScale.z)
          )
        }
        firstDirtyIndex = Math.min(firstDirtyIndex, usingWebGpuStorage ? slot : index)
        lastDirtyIndex = Math.max(lastDirtyIndex, usingWebGpuStorage ? slot : index)
        if (usingWebGpuStorage && shouldSyncPartTransform) {
          firstDirtyPartIndex = Math.min(firstDirtyPartIndex, slot)
          lastDirtyPartIndex = Math.max(lastDirtyPartIndex, slot)
        }
      }

      const prevStatus = statusStates.get(entity.id)
      const renderStatus = runtime.status
      const statusChanged = forceColorSync || prevStatus !== renderStatus
      const focusChanged =
        forceColorSync || entity.id === selectedEntityId || entity.id === hoveredEntityId
      if (statusChanged || focusChanged) {
        statusStates.set(entity.id, renderStatus)
        bodyColor.set(entity.id === selectedEntityId ? '#93c5fd' : presentation.accentColor)
        statusColor.set(STATUS_COLORS[renderStatus])
        ringColor.set(entity.id === selectedEntityId || entity.id === hoveredEntityId ? '#3b82f6' : presentation.accentColor)
        if (usingWebGpuStorage) {
          writeWebGpuSharedMovingColor(sharedMovingPipeline, 'body', slot, bodyColor)
          writeWebGpuSharedMovingColor(sharedMovingPipeline, 'status', slot, statusColor)
          writeWebGpuSharedMovingColor(sharedMovingPipeline, 'ring', slot, ringColor)
        } else {
          bodyMesh.setColorAt(index, bodyColor)
          statusMesh.setColorAt(index, statusColor)
          ringMesh.setColorAt(index, ringColor)
        }
        firstDirtyColorIndex = Math.min(firstDirtyColorIndex, usingWebGpuStorage ? slot : index)
        lastDirtyColorIndex = Math.max(lastDirtyColorIndex, usingWebGpuStorage ? slot : index)
        colorDirty = true
      }
    }

    if (firstDirtyIndex <= lastDirtyIndex) {
      if (usingWebGpuStorage) {
        markWebGpuSharedMovingTargetRange(sharedMovingPipeline, firstDirtyIndex, lastDirtyIndex)
      } else {
        markInstancedMatrixRange(bodyMesh, firstDirtyIndex, lastDirtyIndex)
        markInstancedMatrixRange(statusMesh, firstDirtyIndex, lastDirtyIndex)
        markInstancedMatrixRange(ringMesh, firstDirtyIndex, lastDirtyIndex)
      }
    }
    if (usingWebGpuStorage && firstDirtyPartIndex <= lastDirtyPartIndex) {
      markWebGpuSharedMovingPartTransformRange(sharedMovingPipeline, firstDirtyPartIndex, lastDirtyPartIndex)
    }
    if (usingWebGpuStorage && (firstDirtyIndex <= lastDirtyIndex || firstDirtyPartIndex <= lastDirtyPartIndex)) {
      dispatchWebGpuSharedMovingCompute(gl, sharedMovingPipeline, smoothing)
      gpuMotionFramesRef.current = GPU_MOTION_ACTIVE_FRAMES
    } else if (usingWebGpuStorage && gpuMotionFramesRef.current > 0) {
      dispatchWebGpuSharedMovingCompute(gl, sharedMovingPipeline, smoothing)
      gpuMotionFramesRef.current -= 1
    }
    if (colorDirty) {
      if (usingWebGpuStorage) {
        markWebGpuSharedMovingColorRange(sharedMovingPipeline, 'body', firstDirtyColorIndex, lastDirtyColorIndex)
        markWebGpuSharedMovingColorRange(sharedMovingPipeline, 'status', firstDirtyColorIndex, lastDirtyColorIndex)
        markWebGpuSharedMovingColorRange(sharedMovingPipeline, 'ring', firstDirtyColorIndex, lastDirtyColorIndex)
      } else {
        if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true
        if (statusMesh.instanceColor) statusMesh.instanceColor.needsUpdate = true
        if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true
      }
    }
    if (forceMatrixSync) forceMatrixSyncRef.current = false
    if (forceColorSync) forceColorSyncRef.current = false
  })

  const cpuBodyMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.25,
        roughness: 0.55,
      }),
    []
  )
  const cpuStatusMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: '#111827',
        emissiveIntensity: 0.7,
        opacity: 0.85,
        ...STABLE_TRANSPARENT_OVERLAY,
      }),
    []
  )
  const cpuRingMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: '#111827',
        emissiveIntensity: 0.14,
        opacity: 0.32,
        ...STABLE_DOUBLE_SIDED_OVERLAY,
      }),
    []
  )
  const bodyMaterial = sharedMovingPipeline
    ? getWebGpuSharedMovingPart(sharedMovingPipeline, 'body').material
    : cpuBodyMaterial
  const statusMaterial = sharedMovingPipeline
    ? getWebGpuSharedMovingPart(sharedMovingPipeline, 'status').material
    : cpuStatusMaterial
  const ringMaterial = sharedMovingPipeline
    ? getWebGpuSharedMovingPart(sharedMovingPipeline, 'ring').material
    : cpuRingMaterial

  if (items.length === 0) return null

  return (
    <group>
      <instancedMesh
        ref={bodyRef}
        args={[undefined, undefined, items.length]}
        userData={{ pickable: true, entityIds: renderEntityIds }}
      >
        <capsuleGeometry args={[0.45, 1.4, 8, 16]} />
        <primitive object={bodyMaterial} attach="material" />
      </instancedMesh>
      <instancedMesh
        ref={statusRef}
        args={[undefined, undefined, items.length]}
        userData={{ pickable: true, entityIds: renderEntityIds }}
      >
        <sphereGeometry args={[0.16, 18, 18]} />
        <primitive object={statusMaterial} attach="material" />
      </instancedMesh>
      <instancedMesh
        ref={ringRef}
        args={[undefined, undefined, items.length]}
        renderOrder={OVERLAY_RENDER_ORDER.entityRing}
        userData={{ pickable: true, entityIds: renderEntityIds }}
      >
        <ringGeometry args={[1.05, 1.16, 32]} />
        <primitive object={ringMaterial} attach="material" />
      </instancedMesh>
    </group>
  )
})

DynamicEntityInstances.displayName = 'DynamicEntityInstances'
