'use client'

import { TransformControls } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import type * as THREE from 'three'
import { useEditorDigitalTwinStore } from '@/lib/digital-twin/editor-store'
import type { EntityType } from '@/lib/digital-twin/types'

export type EditorTransformTargetKind = EntityType | 'static-asset'

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

export function EditorTransformGizmo() {
  const draftEntity = useEditorDigitalTwinStore((state) => state.draftEntity)
  const draftStaticAsset = useEditorDigitalTwinStore((state) => state.draftStaticAsset)
  const transformMode = useEditorDigitalTwinStore((state) => state.transformMode)
  const snapEnabled = useEditorDigitalTwinStore((state) => state.snapEnabled)
  const translateSnap = useEditorDigitalTwinStore((state) => state.translateSnap)
  const rotateSnapDegrees = useEditorDigitalTwinStore(
    (state) => state.rotateSnapDegrees
  )
  const beginTransformSession = useEditorDigitalTwinStore(
    (state) => state.beginTransformSession
  )
  const updateDraftTransform = useEditorDigitalTwinStore(
    (state) => state.updateDraftTransform
  )
  const commitTransformSession = useEditorDigitalTwinStore(
    (state) => state.commitTransformSession
  )
  const setTransformDragging = useEditorDigitalTwinStore(
    (state) => state.setTransformDragging
  )
  const targetRef = useRef<THREE.Group>(null!)

  const draftTarget = draftStaticAsset ?? draftEntity
  const targetKind: EditorTransformTargetKind | undefined = draftStaticAsset
    ? 'static-asset'
    : draftEntity?.type
  const allowVerticalTranslation = draftEntity?.type === 'sensor' || draftEntity?.type === 'camera'
  const axisConfig = resolveEditorTransformAxisConfig(targetKind, transformMode)

  useLayoutEffect(() => {
    if (!draftTarget || !targetRef.current) return

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
  }, [draftTarget])

  const syncDraftFromObject = useMemo(
    () => () => {
      if (!draftTarget || !targetRef.current) return

      updateDraftTransform({
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
      })
    },
    [allowVerticalTranslation, draftTarget, transformMode, updateDraftTransform]
  )

  if (!draftTarget || transformMode === 'select') return null

  return (
    <>
      <group
        ref={targetRef}
        position={[draftTarget.position.x, draftTarget.position.y, draftTarget.position.z]}
        rotation={[draftTarget.rotation.x, draftTarget.rotation.y, draftTarget.rotation.z]}
        scale={[draftTarget.scale.x, draftTarget.scale.y, draftTarget.scale.z]}
      >
        <mesh visible={false}>
          <boxGeometry args={[0.01, 0.01, 0.01]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </group>
      <TransformControls
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
          beginTransformSession()
          setTransformDragging(true)
        }}
        onObjectChange={syncDraftFromObject}
        onMouseUp={() => {
          syncDraftFromObject()
          commitTransformSession()
          setTransformDragging(false)
        }}
      />
    </>
  )
}
