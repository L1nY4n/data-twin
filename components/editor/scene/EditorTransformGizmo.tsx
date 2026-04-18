'use client'

import { TransformControls } from '@react-three/drei'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { TransformControls as TransformControlsImpl } from 'three-stdlib'
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
type ScreenPointerSnapshot = {
  x: number
  y: number
}

type EditorTransformSnapshot = {
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: { x: number; y: number; z: number }
}

export function resolveEditorTransformAxisConfig(
  _targetKind: EditorTransformTargetKind | undefined,
  transformMode: 'select' | 'translate' | 'rotate' | 'scale'
) {
  if (transformMode === 'rotate' || transformMode === 'scale' || transformMode === 'translate') {
    return {
      showX: true,
      showY: true,
      showZ: true,
    }
  }

  return { showX: true, showY: true, showZ: true }
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

export function EditorTransformGizmo({
  camera,
  domElement,
}: {
  camera: THREE.Camera
  domElement: HTMLCanvasElement
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
      dragActivated: isTransformDragging,
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
  }, [camera, domElement, draftTarget, isTransformDragging])

  const captureObjectSnapshot = useCallback(() => {
    if (!draftTarget || !targetRef.current) return null

    return {
      position: {
        x: targetRef.current.position.x,
        y: targetRef.current.position.y,
        z: targetRef.current.position.z,
      },
      rotation: {
        x: targetRef.current.rotation.x,
        y: targetRef.current.rotation.y,
        z: targetRef.current.rotation.z,
      },
      scale: {
        x: targetRef.current.scale.x,
        y: targetRef.current.scale.y,
        z: targetRef.current.scale.z,
      },
    }
  }, [draftTarget])

  const flushTransformPreview = useCallback(() => {
    if (!pendingPreviewRef.current) return
    setTransformPreview(pendingPreviewRef.current)
    pendingPreviewRef.current = null
  }, [setTransformPreview])

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

    pendingPreviewRef.current = nextSnapshot
    setTransformPreview(nextSnapshot)
  }, [
    captureObjectSnapshot,
    setTransformPreview,
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
          pendingPreviewRef.current = null
          setTransformPreview(null)
          if (startSnapshot) {
            restoreTargetRefSnapshot(startSnapshot)
          }
          beginTransformSession()
          setTransformDragging(true)
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
          commitTransformSession()
          setTransformDragging(false)
        }}
      />
    </>
  )
}
