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
  installEditorDragCheckBridge,
  setEditorDragCheckGizmoProvider,
  setEditorDragCheckTargetTransformProvider,
} from './editor-drag-check-bridge'

export type EditorTransformTargetKind = EntityType | 'static-asset'

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

function resolveGizmoXAxisScreenPoint(
  controls: TransformControlsImpl,
  camera: THREE.Camera,
  domElement: HTMLCanvasElement
) {
  const pickerTranslate = (
    controls as unknown as {
      picker?: {
        translate?: THREE.Object3D
      }
    }
  ).picker?.translate
  const xAxisHandle =
    pickerTranslate?.children.find(
      (child) => child.name === 'X' && (child as { tag?: string }).tag !== 'helper'
    ) ?? controls.getObjectByName('X')
  if (!xAxisHandle) return null
  const worldPosition = new THREE.Vector3()
  const geometry = (xAxisHandle as THREE.Mesh).geometry

  if (geometry && 'computeBoundingBox' in geometry) {
    geometry.computeBoundingBox()
    const boundsCenter = geometry.boundingBox?.getCenter(new THREE.Vector3())
    if (boundsCenter) {
      xAxisHandle.localToWorld(worldPosition.copy(boundsCenter))
    } else {
      xAxisHandle.getWorldPosition(worldPosition)
    }
  } else {
    xAxisHandle.getWorldPosition(worldPosition)
  }

  return resolveWorldScreenPoint(worldPosition, camera, domElement)
}

function resolveTransformControlsActiveAxis(controls: TransformControlsImpl) {
  const activeAxis = (controls as unknown as { axis?: string | null }).axis
  return typeof activeAxis === 'string' ? activeAxis : null
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
  const previewFrameRef = useRef<number | null>(null)
  const pendingPreviewRef = useRef<{
    position: { x: number; y: number; z: number }
    rotation: { x: number; y: number; z: number }
    scale: { x: number; y: number; z: number }
  } | null>(null)

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
          activeAxis: null,
        }
      }
      return {
        xAxisScreenPoint: resolveGizmoXAxisScreenPoint(controls, camera, domElement),
        activeAxis: resolveTransformControlsActiveAxis(controls),
      }
    })

    return () => {
      setEditorDragCheckTargetTransformProvider(null)
      setEditorDragCheckGizmoProvider(null)
    }
  }, [camera, domElement, draftTarget])

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
    if (previewFrameRef.current !== null) {
      window.cancelAnimationFrame(previewFrameRef.current)
      previewFrameRef.current = null
    }
    if (!pendingPreviewRef.current) return
    setTransformPreview(pendingPreviewRef.current)
    pendingPreviewRef.current = null
  }, [setTransformPreview])

  const scheduleTransformPreview = useCallback(() => {
    const nextSnapshot = captureObjectSnapshot()
    if (!nextSnapshot) return

    pendingPreviewRef.current = nextSnapshot
    if (previewFrameRef.current !== null) return

    previewFrameRef.current = window.requestAnimationFrame(() => {
      previewFrameRef.current = null
      if (!pendingPreviewRef.current) return
      setTransformPreview(pendingPreviewRef.current)
      pendingPreviewRef.current = null
    })
  }, [captureObjectSnapshot, setTransformPreview])

  useEffect(
    () => () => {
      if (previewFrameRef.current !== null) {
        window.cancelAnimationFrame(previewFrameRef.current)
      }
    },
    []
  )

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
          pendingPreviewRef.current = null
          setTransformPreview(null)
          setEditorCanvasControlsEnabled(orbitControlsRef.current, false)
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
          commitTransformSession()
          setEditorCanvasControlsEnabled(orbitControlsRef.current, true)
          setTransformDragging(false)
        }}
      />
    </>
  )
}
