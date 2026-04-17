'use client'

import { TransformControls } from '@react-three/drei'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { TransformControls as TransformControlsImpl } from 'three-stdlib'
import type { OrbitControls as OrbitControlsType } from 'three-stdlib'
import * as THREE from 'three'
import { useEditorSceneStore, useEditorUiStore } from '@/lib/digital-twin/editor-store'
import type { EntityType } from '@/lib/digital-twin/types'
import {
  setEditorDragCheckDragMetaProvider,
  installEditorDragCheckBridge,
  setEditorDragCheckGizmoProvider,
  setEditorDragCheckTargetTransformProvider,
} from './editor-drag-check-bridge'

export type EditorTransformTargetKind = EntityType | 'static-asset'

const TRANSLATE_DRAG_DEADZONE_PIXELS = 4
const TRANSFORM_HANDLE_HIT_PATCH_VERSION = 3

type ScreenPointerSnapshot = {
  x: number
  y: number
}

type EditorTransformSnapshot = {
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: { x: number; y: number; z: number }
}

type EditorCanvasControls = {
  enabled?: boolean
} | null | undefined

export function setEditorCanvasControlsEnabled(
  controls: EditorCanvasControls,
  enabled: boolean
) {
  if (!controls || typeof controls.enabled !== 'boolean') return
  controls.enabled = enabled
}

export function resolveEditorTransformAxisConfig(
  targetKind: EditorTransformTargetKind | undefined,
  transformMode: 'select' | 'translate' | 'rotate' | 'scale'
) {
  const allowVerticalTranslation = targetKind === 'sensor' || targetKind === 'camera'

  if (transformMode === 'scale') {
    return {
      showX: true,
      showY: allowVerticalTranslation,
      showZ: true,
    }
  }

  if (transformMode === 'rotate') {
    return {
      showX: false,
      showY: true,
      showZ: false,
    }
  }

  return {
    showX: true,
    showY: allowVerticalTranslation,
    showZ: true,
  }
}

function toVectorSnapshot(value: { x: number; y: number; z: number } | null | undefined) {
  if (!value) return null
  return {
    x: value.x,
    y: value.y,
    z: value.z,
  }
}

function resolveWorldScreenPoint(
  worldPosition: THREE.Vector3,
  camera: THREE.Camera,
  domElement: HTMLCanvasElement
) {
  const rect = domElement.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  const projected = worldPosition.clone().project(camera)
  if (
    !Number.isFinite(projected.x) ||
    !Number.isFinite(projected.y) ||
    !Number.isFinite(projected.z)
  ) {
    return null
  }

  return {
    x: rect.left + ((projected.x + 1) / 2) * rect.width,
    y: rect.top + ((-projected.y + 1) / 2) * rect.height,
  }
}

function resolveObjectScreenPoint(
  object: THREE.Object3D,
  camera: THREE.Camera,
  domElement: HTMLCanvasElement
) {
  const worldPosition = new THREE.Vector3()
  const maybeMesh = object as THREE.Mesh
  const geometry = maybeMesh.geometry

  if (geometry && 'computeBoundingBox' in geometry) {
    geometry.computeBoundingBox()
    const boundsCenter = geometry.boundingBox?.getCenter(new THREE.Vector3())
    if (boundsCenter) {
      object.localToWorld(worldPosition.copy(boundsCenter))
    } else {
      object.getWorldPosition(worldPosition)
    }
  } else {
    object.getWorldPosition(worldPosition)
  }

  return resolveWorldScreenPoint(worldPosition, camera, domElement)
}

function resolveNamedGizmoHandleScreenPoint(
  controls: TransformControlsImpl,
  camera: THREE.Camera,
  domElement: HTMLCanvasElement,
  collectionKey: 'gizmo' | 'picker',
  handleName: string
) {
  const controlCollections = controls as unknown as {
    gizmo?: {
      translate?: THREE.Object3D
    }
    picker?: {
      translate?: THREE.Object3D
    }
  }
  const collection = controlCollections[collectionKey]?.translate
  const handle =
    collection?.children.find(
      (child) => child.name === handleName && (child as { tag?: string }).tag !== 'helper'
    ) ?? controls.getObjectByName(handleName)
  if (!handle) return null
  return resolveObjectScreenPoint(handle, camera, domElement)
}

function resolveTransformControlsActiveAxis(controls: TransformControlsImpl) {
  const activeAxis = (controls as unknown as { axis?: string | null }).axis
  return typeof activeAxis === 'string' ? activeAxis : null
}

function hasEditorTransformSnapshotChanged(
  left: EditorTransformSnapshot,
  right: EditorTransformSnapshot
) {
  return (
    left.position.x !== right.position.x ||
    left.position.y !== right.position.y ||
    left.position.z !== right.position.z ||
    left.rotation.x !== right.rotation.x ||
    left.rotation.y !== right.rotation.y ||
    left.rotation.z !== right.rotation.z ||
    left.scale.x !== right.scale.x ||
    left.scale.y !== right.scale.y ||
    left.scale.z !== right.scale.z
  )
}

function patchTransformControlsPointerDown(
  controls: TransformControlsImpl,
  camera: THREE.Camera,
  domElement: HTMLCanvasElement,
  pointerDownDebugRef: RefObject<{
    pointer: ScreenPointerSnapshot | null
    handlePoint: ScreenPointerSnapshot | null
    handleName: string | null
    handleType: string | null
    maxDistance: number | null
    blocked: boolean
  } | null>
) {
  const patchedControls = controls as unknown as {
    __editorVisibleHitPatchVersion?: number
    pointerHover?: (pointer: { x: number; y: number; button: number }) => void
    pointerDown?: (pointer: { x: number; y: number; button: number }) => void
    raycaster: THREE.Raycaster
    gizmo: {
      [mode: string]: THREE.Object3D
    }
    mode: 'translate' | 'rotate' | 'scale'
    axis: string | null
    intersectObjectWithRay: (
      object: THREE.Object3D,
      raycaster: THREE.Raycaster,
      includeInvisible?: boolean
    ) => THREE.Intersection<THREE.Object3D> | false
  }

  if (
    patchedControls.__editorVisibleHitPatchVersion === TRANSFORM_HANDLE_HIT_PATCH_VERSION ||
    !patchedControls.pointerDown ||
    !patchedControls.pointerHover
  ) {
    return
  }

  const originalPointerHover = patchedControls.pointerHover.bind(patchedControls)
  const originalPointerDown = patchedControls.pointerDown.bind(patchedControls)

  const resolveVisibleHandleHit = (pointer: {
    x: number
    y: number
    button: number
  }) => {
    patchedControls.raycaster.setFromCamera(
      new THREE.Vector2(pointer.x, pointer.y),
      camera
    )
    const rect = domElement.getBoundingClientRect()
    const pointerScreenPoint = {
      x: rect.left + ((pointer.x + 1) / 2) * rect.width,
      y: rect.top + ((-pointer.y + 1) / 2) * rect.height,
    }
    const visibleIntersect = patchedControls.intersectObjectWithRay(
      patchedControls.gizmo[patchedControls.mode],
      patchedControls.raycaster,
      false
    )

    if (!visibleIntersect) {
      return {
        blocked: true,
        pointerScreenPoint,
        handleScreenPoint: null,
        axisName: null,
        handleType: null,
        maxDistance: null,
      }
    }

    const handleScreenPoint = resolveObjectScreenPoint(
      visibleIntersect.object,
      camera,
      domElement
    )
    const axisName = visibleIntersect.object.name
    const maxDistance =
      axisName === 'XYZ'
        ? 18
        : axisName === 'XY' || axisName === 'YZ' || axisName === 'XZ'
          ? 22
          : 12

    const pointerToHandleDistance = handleScreenPoint
      ? Math.hypot(
          handleScreenPoint.x - pointerScreenPoint.x,
          handleScreenPoint.y - pointerScreenPoint.y
        )
      : Number.POSITIVE_INFINITY
    const blocked = pointerToHandleDistance > maxDistance

    return {
      blocked,
      pointerScreenPoint,
      handleScreenPoint,
      axisName,
      handleType: visibleIntersect.object.constructor.name,
      maxDistance,
    }
  }

  patchedControls.pointerHover = (pointer) => {
    const hit = resolveVisibleHandleHit(pointer)
    pointerDownDebugRef.current = {
      pointer: hit.pointerScreenPoint,
      handlePoint: hit.handleScreenPoint,
      handleName: hit.axisName,
      handleType: hit.handleType,
      maxDistance: hit.maxDistance,
      blocked: hit.blocked,
    }

    if (hit.blocked || !hit.axisName) {
      patchedControls.axis = null
      return
    }

    originalPointerHover(pointer)
    patchedControls.axis = hit.axisName
  }

  patchedControls.pointerDown = (pointer) => {
    const hit = resolveVisibleHandleHit(pointer)
    pointerDownDebugRef.current = {
      pointer: hit.pointerScreenPoint,
      handlePoint: hit.handleScreenPoint,
      handleName: hit.axisName,
      handleType: hit.handleType,
      maxDistance: hit.maxDistance,
      blocked: hit.blocked,
    }

    if (hit.blocked || !hit.axisName) {
      patchedControls.axis = null
      return
    }

    patchedControls.axis = hit.axisName
    originalPointerDown(pointer)
  }

  patchedControls.__editorVisibleHitPatchVersion = TRANSFORM_HANDLE_HIT_PATCH_VERSION
}

export function EditorTransformGizmo({
  camera,
  domElement,
  orbitControlsRef,
}: {
  camera: THREE.Camera
  domElement: HTMLCanvasElement
  orbitControlsRef: RefObject<OrbitControlsType | null>
}) {
  const draftEntity = useEditorSceneStore((state) => state.draftEntity)
  const draftStaticAsset = useEditorSceneStore((state) => state.draftStaticAsset)
  const transformMode = useEditorUiStore((state) => state.transformMode)
  const snapEnabled = useEditorUiStore((state) => state.snapEnabled)
  const translateSnap = useEditorUiStore((state) => state.translateSnap)
  const rotateSnapDegrees = useEditorUiStore((state) => state.rotateSnapDegrees)
  const isTransformDragging = useEditorUiStore((state) => state.isTransformDragging)
  const beginTransformSession = useEditorSceneStore((state) => state.beginTransformSession)
  const setTransformPreview = useEditorUiStore((state) => state.setTransformPreview)
  const updateDraftTransform = useEditorSceneStore((state) => state.updateDraftTransform)
  const commitTransformSession = useEditorSceneStore((state) => state.commitTransformSession)
  const setTransformDragging = useEditorUiStore((state) => state.setTransformDragging)
  const targetRef = useRef<THREE.Group>(null!)
  const transformControlsRef = useRef<TransformControlsImpl>(null)
  const pendingPreviewRef = useRef<EditorTransformSnapshot | null>(null)
  const lastPointerRef = useRef<ScreenPointerSnapshot | null>(null)
  const dragStartPointerRef = useRef<ScreenPointerSnapshot | null>(null)
  const dragStartSnapshotRef = useRef<EditorTransformSnapshot | null>(null)
  const dragActivatedRef = useRef(false)
  const transformDragConfirmedRef = useRef(false)
  const pointerDownDebugRef = useRef<{
    pointer: ScreenPointerSnapshot | null
    handlePoint: ScreenPointerSnapshot | null
    handleName: string | null
    handleType: string | null
    maxDistance: number | null
    blocked: boolean
  }>({
    pointer: null,
    handlePoint: null,
    handleName: null,
    handleType: null,
    maxDistance: null,
    blocked: false,
  })

  const draftTarget = draftStaticAsset ?? draftEntity
  const targetKind: EditorTransformTargetKind | undefined = draftStaticAsset
    ? 'static-asset'
    : draftEntity?.type
  const allowVerticalTranslation = draftEntity?.type === 'sensor' || draftEntity?.type === 'camera'
  const axisConfig = resolveEditorTransformAxisConfig(targetKind, transformMode)

  useLayoutEffect(() => {
    if (!draftTarget || !targetRef.current || isTransformDragging) return

    targetRef.current.position.set(
      draftTarget.position.x,
      draftTarget.position.y,
      draftTarget.position.z
    )
    targetRef.current.rotation.set(
      draftTarget.rotation.x,
      draftTarget.rotation.y,
      draftTarget.rotation.z
    )
    targetRef.current.scale.set(
      draftTarget.scale.x,
      draftTarget.scale.y,
      draftTarget.scale.z
    )
    targetRef.current.updateMatrixWorld()
  }, [draftTarget, isTransformDragging])

  useEffect(() => {
    const updatePointer = (event: PointerEvent) => {
      lastPointerRef.current = {
        x: event.clientX,
        y: event.clientY,
      }
    }

    window.addEventListener('pointermove', updatePointer, { passive: true })
    return () => {
      window.removeEventListener('pointermove', updatePointer)
    }
  }, [])

  useEffect(() => {
    installEditorDragCheckBridge()

    setEditorDragCheckTargetTransformProvider(() => {
      const targetObject = targetRef.current
      if (targetObject) {
        return {
          position: toVectorSnapshot(targetObject.position),
          rotation: toVectorSnapshot(targetObject.rotation),
          scale: toVectorSnapshot(targetObject.scale),
        }
      }

      return {
        position: toVectorSnapshot(draftTarget?.position),
        rotation: toVectorSnapshot(draftTarget?.rotation),
        scale: toVectorSnapshot(draftTarget?.scale),
      }
    })

    setEditorDragCheckGizmoProvider(() => {
      const controls = transformControlsRef.current
      if (!controls) {
        return {
          xAxisScreenPoint: null,
          visibleXAxisScreenPoint: null,
          pickerXAxisScreenPoint: null,
          activeAxis: null,
        }
      }
      return {
        xAxisScreenPoint: resolveNamedGizmoHandleScreenPoint(
          controls,
          camera,
          domElement,
          'picker',
          'X'
        ),
        visibleXAxisScreenPoint: resolveNamedGizmoHandleScreenPoint(
          controls,
          camera,
          domElement,
          'gizmo',
          'X'
        ),
        pickerXAxisScreenPoint: resolveNamedGizmoHandleScreenPoint(
          controls,
          camera,
          domElement,
          'picker',
          'X'
        ),
        activeAxis: resolveTransformControlsActiveAxis(controls),
      }
    })

    setEditorDragCheckDragMetaProvider(() => ({
      dragActivated: dragActivatedRef.current,
      deadzonePixels: TRANSLATE_DRAG_DEADZONE_PIXELS,
      dragStartPointer: dragStartPointerRef.current,
      lastPointer: lastPointerRef.current,
      pointerDownPointer: pointerDownDebugRef.current.pointer,
      pointerDownHandlePoint: pointerDownDebugRef.current.handlePoint,
      pointerDownHandleName: pointerDownDebugRef.current.handleName,
      pointerDownHandleType: pointerDownDebugRef.current.handleType,
      pointerDownMaxDistance: pointerDownDebugRef.current.maxDistance,
      pointerDownBlocked: pointerDownDebugRef.current.blocked,
    }))

    return () => {
      setEditorDragCheckDragMetaProvider(null)
      setEditorDragCheckTargetTransformProvider(null)
      setEditorDragCheckGizmoProvider(null)
    }
  }, [camera, domElement, draftTarget])

  useLayoutEffect(() => {
    const controls = transformControlsRef.current
    if (!controls) return
    patchTransformControlsPointerDown(
      controls,
      camera,
      domElement,
      pointerDownDebugRef
    )
  })

  const captureObjectSnapshot = useCallback(() => {
    if (!draftTarget || !targetRef.current) return null

    return {
      position: {
        x: targetRef.current.position.x,
        y: allowVerticalTranslation ? targetRef.current.position.y : draftTarget.position.y,
        z: targetRef.current.position.z,
      },
      rotation: {
        x:
          transformMode === 'rotate' || transformMode === 'scale'
            ? draftTarget.rotation.x
            : targetRef.current.rotation.x,
        y: targetRef.current.rotation.y,
        z:
          transformMode === 'rotate' || transformMode === 'scale'
            ? draftTarget.rotation.z
            : targetRef.current.rotation.z,
      },
      scale: {
        x: targetRef.current.scale.x,
        y: targetRef.current.scale.y,
        z: targetRef.current.scale.z,
      },
    }
  }, [allowVerticalTranslation, draftTarget, transformMode])

  const flushTransformPreview = useCallback(() => {
    if (!pendingPreviewRef.current) return
    setTransformPreview(pendingPreviewRef.current)
    pendingPreviewRef.current = null
  }, [setTransformPreview])

  const confirmTransformDrag = useCallback(() => {
    if (transformDragConfirmedRef.current) return
    transformDragConfirmedRef.current = true
    setTransformDragging(true)
  }, [setTransformDragging])

  const restoreTargetRefSnapshot = useCallback(
    (snapshot: EditorTransformSnapshot) => {
      if (!targetRef.current) return
      targetRef.current.position.set(
        snapshot.position.x,
        snapshot.position.y,
        snapshot.position.z
      )
      targetRef.current.rotation.set(
        snapshot.rotation.x,
        snapshot.rotation.y,
        snapshot.rotation.z
      )
      targetRef.current.scale.set(
        snapshot.scale.x,
        snapshot.scale.y,
        snapshot.scale.z
      )
      targetRef.current.updateMatrixWorld(true)
      transformControlsRef.current?.updateMatrixWorld()
    },
    []
  )

  const scheduleTransformPreview = useCallback(() => {
    const nextSnapshot = captureObjectSnapshot()
    if (!nextSnapshot) return

    if (
      transformMode === 'translate' &&
      dragStartSnapshotRef.current &&
      dragStartPointerRef.current &&
      lastPointerRef.current &&
      !dragActivatedRef.current
    ) {
      const startSnapshot = dragStartSnapshotRef.current
      const delta = Math.hypot(
        lastPointerRef.current.x - dragStartPointerRef.current.x,
        lastPointerRef.current.y - dragStartPointerRef.current.y
      )

      if (delta < TRANSLATE_DRAG_DEADZONE_PIXELS) {
        pendingPreviewRef.current = startSnapshot
        restoreTargetRefSnapshot(startSnapshot)
        setTransformPreview(startSnapshot)
        return
      }

      dragActivatedRef.current = true
    }

    if (
      dragStartSnapshotRef.current &&
      !transformDragConfirmedRef.current
    ) {
      const startSnapshot = dragStartSnapshotRef.current
      if (!hasEditorTransformSnapshotChanged(startSnapshot, nextSnapshot)) {
        return
      }

      confirmTransformDrag()
    }

    pendingPreviewRef.current = nextSnapshot
    setTransformPreview(nextSnapshot)
  }, [
    captureObjectSnapshot,
    confirmTransformDrag,
    restoreTargetRefSnapshot,
    setTransformPreview,
    transformMode,
  ])

  if (!draftTarget || transformMode === 'select') return null

  return (
    <>
      <group ref={targetRef}>
        <mesh visible={false}>
          <boxGeometry args={[0.01, 0.01, 0.01]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </group>
      <TransformControls
        ref={transformControlsRef}
        object={targetRef}
        mode={transformMode}
        size={0.9}
        showX={axisConfig.showX}
        showY={axisConfig.showY}
        showZ={axisConfig.showZ}
        translationSnap={
          snapEnabled && transformMode === 'translate' ? translateSnap : undefined
        }
        rotationSnap={
          snapEnabled && transformMode === 'rotate'
            ? (rotateSnapDegrees * Math.PI) / 180
            : undefined
        }
        onMouseDown={() => {
          const startSnapshot = captureObjectSnapshot()
          dragStartSnapshotRef.current = startSnapshot
          dragStartPointerRef.current =
            pointerDownDebugRef.current.pointer ?? lastPointerRef.current
          dragActivatedRef.current = false
          transformDragConfirmedRef.current = false
          pendingPreviewRef.current = null
          setTransformPreview(null)
          if (startSnapshot) {
            restoreTargetRefSnapshot(startSnapshot)
          }
          setEditorCanvasControlsEnabled(orbitControlsRef.current, false)
          beginTransformSession()
        }}
        onObjectChange={scheduleTransformPreview}
        onMouseUp={() => {
          flushTransformPreview()
          const finalSnapshot = captureObjectSnapshot()
          if (finalSnapshot) {
            updateDraftTransform(finalSnapshot)
          }
          dragStartPointerRef.current = null
          dragStartSnapshotRef.current = null
          dragActivatedRef.current = false
          transformDragConfirmedRef.current = false
          commitTransformSession()
          setEditorCanvasControlsEnabled(orbitControlsRef.current, true)
          setTransformDragging(false)
        }}
      />
    </>
  )
}
