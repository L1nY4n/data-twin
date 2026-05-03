'use client'

import { Suspense, memo, useCallback, useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { Expand, MousePointer2, Move, RotateCcw } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useTheme } from '@/components/theme-provider'
import * as THREE from 'three'
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { OrbitControls as OrbitControlsType } from 'three-stdlib'
import { createPublishedStaticPalette } from '@/components/digital-twin/scene/palette'
import { SpaceGrid } from '@/components/digital-twin/scene/SpaceGrid'
import { SceneLoading } from '@/components/digital-twin/scene/SceneLoading'
import { createPreferredRenderer } from '@/lib/digital-twin/renderer/createPreferredRenderer'
import { useEditorPreviewStore } from '@/lib/digital-twin/editor-preview-store'
import {
  type EditorTransformMode,
  getEditorViewerState,
  isEditorEntityEditable,
  useEditorDigitalTwinStore,
  useEditorSceneStore,
  useEditorUiStore,
  useEditorViewerStore,
} from '@/lib/digital-twin/editor-store'
import { getStaticAssetCatalogItem } from '@/lib/digital-twin/static-asset-catalog'
import type { Vector3 } from '@/lib/digital-twin/types'
import { EditorAuthoredStaticAssetLayer } from './scene/EditorAuthoredStaticAssetLayer'
import { EditorEntityLayer } from './scene/EditorEntityLayer'
import { EditorFloorPlanOverlay } from './scene/EditorFloorPlanOverlay'
import { EditorScenePicking } from './scene/EditorScenePicking'
import { EditorStaticEnvironment } from './scene/EditorStaticEnvironment'
import { EditorTransformGizmo } from './scene/EditorTransformGizmo'
import {
  installEditorDragCheckBridge,
  setEditorDragCheckCameraProvider,
  setEditorDragCheckPrepareTargetProvider,
  setEditorDragCheckSelectTargetProvider,
  setEditorDragCheckSelectionProvider,
  setEditorDragCheckStoreProvider,
} from './scene/editor-drag-check-bridge'

type EditorOrbitMouseButtons = {
  LEFT: number
  MIDDLE: number
  RIGHT: number
}

const DEFAULT_ORBIT_MOUSE_BUTTONS: EditorOrbitMouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
}

export function resolveEditorCanvasHintCopy(
  transformMode: EditorTransformMode,
  hasActiveTransformTarget: boolean
) {
  switch (transformMode) {
    case 'translate':
      return hasActiveTransformTarget
        ? {
            label: '移动对象',
            lines: ['拖拽 Gizmo 移动物体', '空白处仍可拖动画面', '滚轮/中键缩放 · 右键平移'],
          }
        : {
            label: '移动对象',
            lines: ['选中对象后显示 Gizmo', '左键拖动画面', '滚轮/中键缩放 · 右键平移'],
          }
    case 'rotate':
      return hasActiveTransformTarget
        ? {
            label: '旋转对象',
            lines: ['拖拽 Gizmo 旋转对象', '空白处仍可拖动画面', '滚轮/中键缩放 · 右键平移'],
          }
        : {
            label: '旋转对象',
            lines: ['选中对象后显示 Gizmo', '左键拖动画面', '滚轮/中键缩放 · 右键平移'],
          }
    case 'scale':
      return hasActiveTransformTarget
        ? {
            label: '缩放对象',
            lines: ['拖拽 Gizmo 缩放对象', '空白处仍可拖动画面', '滚轮/中键缩放 · 右键平移'],
          }
        : {
            label: '缩放对象',
            lines: ['选中对象后显示 Gizmo', '左键拖动画面', '滚轮/中键缩放 · 右键平移'],
          }
    default:
      return {
        label: '选择模式',
        lines: ['左键拖动画面', 'Shift + 左键框选', '单击选择对象'],
      }
  }
}

function EditorOrbitControls({
  controlsRef,
  enabled,
  makeDefault,
  maxDistance,
  maxPolarAngle,
  minDistance,
  minPolarAngle,
  mouseButtons,
  onInteractionChange,
  onRest,
  target,
}: {
  controlsRef: RefObject<OrbitControlsType | null>
  enabled: boolean
  makeDefault: boolean
  maxDistance: number
  maxPolarAngle?: number
  minDistance: number
  minPolarAngle?: number
  mouseButtons: EditorOrbitMouseButtons
  onInteractionChange?: (active: boolean) => void
  onRest: () => void
  target: Vector3
}) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const get = useThree((state) => state.get)
  const invalidate = useThree((state) => state.invalidate)
  const set = useThree((state) => state.set)
  const controls = useMemo(() => new OrbitControlsImpl(camera, gl.domElement), [camera, gl])
  const onRestRef = useRef(onRest)
  const onInteractionChangeRef = useRef(onInteractionChange)
  const settleRequestedRef = useRef(false)
  const interactionActiveRef = useRef(false)
  const pendingTargetRef = useRef<Vector3 | null>(null)

  const syncControlsTarget = useCallback(
    (nextTarget: Vector3) => {
      if (controls.target.equals(nextTarget as THREE.Vector3)) return
      controls.target.set(nextTarget.x, nextTarget.y, nextTarget.z)
      controls.update()
      invalidate()
    },
    [controls, invalidate]
  )

  useEffect(() => {
    onRestRef.current = onRest
  }, [onRest])

  useEffect(() => {
    onInteractionChangeRef.current = onInteractionChange
  }, [onInteractionChangeRef, onInteractionChange])

  useEffect(() => {
    controlsRef.current = controls

    return () => {
      if (controlsRef.current === controls) {
        controlsRef.current = null
      }
    }
  }, [controls, controlsRef])

  useEffect(() => {
    if (!makeDefault) return

    const previousControls = get().controls
    set({ controls })

    return () => {
      if (get().controls === controls) {
        set({ controls: previousControls })
      }
    }
  }, [controls, get, makeDefault, set])

  useEffect(() => {
    controls.enabled = enabled
  }, [controls, enabled])

  useEffect(() => {
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = minDistance
    controls.maxDistance = maxDistance
    controls.minPolarAngle = minPolarAngle ?? 0
    controls.maxPolarAngle = maxPolarAngle ?? Math.PI
    controls.mouseButtons = mouseButtons
    invalidate()
  }, [
    controls,
    invalidate,
    maxDistance,
    maxPolarAngle,
    minDistance,
    minPolarAngle,
    mouseButtons,
  ])

  useEffect(() => {
    const nextTarget = { x: target.x, y: target.y, z: target.z }
    if (interactionActiveRef.current) {
      pendingTargetRef.current = nextTarget
      return
    }

    pendingTargetRef.current = null
    syncControlsTarget(nextTarget)
  }, [syncControlsTarget, target.x, target.y, target.z])

  useFrame(() => {
    if (!controls.enabled) {
      settleRequestedRef.current = false
      return
    }

    const controlsChanged = (controls.update as () => boolean)()
    if (controlsChanged) {
      invalidate()
      return
    }

    if (!settleRequestedRef.current) return
    settleRequestedRef.current = false
    onRestRef.current()
  }, -1)

  useEffect(() => {
    const handleChange = () => {
      invalidate()
    }

    const handleStart = () => {
      interactionActiveRef.current = true
      onInteractionChangeRef.current?.(true)
      settleRequestedRef.current = false
    }

    const handleEnd = () => {
      interactionActiveRef.current = false
      onInteractionChangeRef.current?.(false)
      if (pendingTargetRef.current) {
        syncControlsTarget(pendingTargetRef.current)
        pendingTargetRef.current = null
      }
      settleRequestedRef.current = true
      invalidate()
    }

    controls.addEventListener('change', handleChange)
    controls.addEventListener('start', handleStart)
    controls.addEventListener('end', handleEnd)

    return () => {
      controls.removeEventListener('change', handleChange)
      controls.removeEventListener('start', handleStart)
      controls.removeEventListener('end', handleEnd)
      onInteractionChangeRef.current?.(false)
      interactionActiveRef.current = false
      pendingTargetRef.current = null
      controls.dispose()
    }
  }, [controls, invalidate, syncControlsTarget])

  return <primitive object={controls} />
}

function EditorPlacementPreview() {
  const placementCatalogId = useEditorUiStore((state) => state.placementCatalogId)
  const placementPreview = useEditorUiStore((state) => state.placementPreview)
  const catalogItem = placementCatalogId ? getStaticAssetCatalogItem(placementCatalogId) : null

  if (!placementPreview) return null

  const width = catalogItem?.dimensions.width ?? 4
  const depth = catalogItem?.dimensions.depth ?? 4
  const height = catalogItem?.dimensions.height ?? 1.5
  const position = placementPreview.position
  const rotation = placementPreview.rotation ?? { x: 0, y: 0, z: 0 }
  const showGroundRing = !placementPreview.hostStaticAssetId && position.y <= 0.12

  return (
    <group
      position={[position.x, position.y, position.z]}
      rotation={[rotation.x, rotation.y, rotation.z]}
    >
      <mesh position={[0, Math.max(height / 2, 0.75), 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color={placementPreview.hostStaticAssetId ? '#93c5fd' : '#7da7ff'}
          opacity={placementPreview.hostStaticAssetId ? 0.24 : 0.18}
          transparent
          emissive="#4f83ff"
          emissiveIntensity={placementPreview.hostStaticAssetId ? 0.7 : 0.5}
        />
      </mesh>
      {showGroundRing ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry
            args={[Math.max(width, depth) * 0.32, Math.max(width, depth) * 0.42, 48]}
          />
          <meshBasicMaterial color="#d5e4ff" opacity={0.88} transparent />
        </mesh>
      ) : null}
    </group>
  )
}

const EditorSceneContent = memo(function EditorSceneContent({
  backgroundColor,
  isDark,
}: {
  backgroundColor: string
  isDark: boolean
}) {
  const sceneCamera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const sceneConfig = useEditorSceneStore((state) => state.sceneConfig)
  const editorCameraPosition = useEditorViewerStore((state) => state.editorCameraPosition)
  const editorCameraTarget = useEditorViewerStore((state) => state.editorCameraTarget)
  const publishedScenePackage = useEditorSceneStore((state) => state.publishedScenePackage)
  const viewportProjection = useEditorViewerStore((state) => state.viewportProjection)
  const isTransformDragging = useEditorUiStore((state) => state.isTransformDragging)
  const isMarqueeSelecting = useEditorUiStore((state) => state.isMarqueeSelecting)
  const cameraFocusRequest = useEditorViewerStore((state) => state.cameraFocusRequest)
  const clearCameraFocusRequest = useEditorViewerStore(
    (state) => state.clearCameraFocusRequest
  )
  const setEditorCameraPose = useEditorViewerStore((state) => state.setEditorCameraPose)
  const palette = useMemo(() => createPublishedStaticPalette(isDark), [isDark])
  const pickRootRef = useRef<THREE.Group>(null)
  const controlsRef = useRef<OrbitControlsType>(null)
  const perspectiveCameraRef = useRef<THREE.PerspectiveCamera>(null)
  const orthographicCameraRef = useRef<THREE.OrthographicCamera>(null)
  const focusAnimationRef = useRef<{
    position: Vector3
    target: Vector3
  } | null>(null)
  const orbitInteractionActiveRef = useRef(false)
  const pendingCameraPositionRef = useRef<Vector3 | null>(null)
  const lockedCameraPoseRef = useRef<{
    position: Vector3
    target: Vector3
  } | null>(null)
  const editorCameraPositionArray = useMemo<[number, number, number]>(
    () => [
      editorCameraPosition.x,
      editorCameraPosition.y,
      editorCameraPosition.z,
    ],
    [editorCameraPosition.x, editorCameraPosition.y, editorCameraPosition.z]
  )
  const environmentFile = isDark
    ? '/hdr/dikhololo_night_1k.hdr'
    : '/hdr/potsdamer_platz_1k.hdr'

  useEffect(() => {
    installEditorDragCheckBridge()

    setEditorDragCheckSelectionProvider(() => {
      const state = useEditorDigitalTwinStore.getState()
      return {
        selectedTargetId: state.selectedStaticAssetId ?? state.selectedEntityId,
        selectedTargetKind: state.draftStaticAsset ? 'static-asset' : state.draftEntity?.type ?? null,
        transformMode: state.transformMode,
        isTransformDragging: state.isTransformDragging,
      }
    })

    setEditorDragCheckStoreProvider(() => {
      const state = useEditorDigitalTwinStore.getState()
      const previewState = useEditorPreviewStore.getState()
      return {
        selectedStaticAssetId: state.selectedStaticAssetId,
        draftStaticAssetId: state.draftStaticAsset?.id ?? null,
        savedStaticAssetId: state.savedStaticAsset?.id ?? null,
        draftStaticAssetPosition: state.draftStaticAsset
          ? {
              x: state.draftStaticAsset.position.x,
              y: state.draftStaticAsset.position.y,
              z: state.draftStaticAsset.position.z,
            }
          : null,
        savedStaticAssetPosition: state.savedStaticAsset
          ? {
              x: state.savedStaticAsset.position.x,
              y: state.savedStaticAsset.position.y,
              z: state.savedStaticAsset.position.z,
            }
          : null,
        transformPreviewPosition: previewState.transformPreview
          ? {
              x: previewState.transformPreview.position.x,
              y: previewState.transformPreview.position.y,
              z: previewState.transformPreview.position.z,
            }
          : null,
        isTransformDragging: state.isTransformDragging,
      }
    })

    setEditorDragCheckCameraProvider(() => {
      const viewerState = getEditorViewerState()
      const activeCamera =
        viewerState.viewportProjection === 'orthographic'
          ? orthographicCameraRef.current
          : perspectiveCameraRef.current
      const controls = controlsRef.current
      if (!activeCamera || !controls) {
        return { position: null, target: null }
      }
      return {
        position: {
          x: activeCamera.position.x,
          y: activeCamera.position.y,
          z: activeCamera.position.z,
        },
        target: {
          x: controls.target.x,
          y: controls.target.y,
          z: controls.target.z,
        },
      }
    })

    setEditorDragCheckPrepareTargetProvider(() => {
      const state = useEditorDigitalTwinStore.getState()

      if (!(state.draftStaticAsset ?? state.draftEntity)) {
        const firstStaticAsset = state.staticAssets.values().next().value
        if (firstStaticAsset) {
          state.selectStaticAsset(firstStaticAsset.id)
        } else {
          const firstEditableEntity = Array.from(state.entities.values()).find((entity) =>
            isEditorEntityEditable(entity)
          )
          if (firstEditableEntity) {
            state.selectEntity(firstEditableEntity.id)
          }
        }
      }

      useEditorDigitalTwinStore.getState().setTransformMode('translate')

      const next = useEditorDigitalTwinStore.getState()
      const draftTarget = next.draftStaticAsset ?? next.draftEntity
      if (draftTarget) {
        next.setEditorCameraPose(
          {
            x: draftTarget.position.x + 56,
            y: draftTarget.position.y + 44,
            z: draftTarget.position.z + 56,
          },
          {
            x: draftTarget.position.x,
            y: draftTarget.position.y,
            z: draftTarget.position.z,
          }
        )
      }

      return {
        prepared: Boolean(draftTarget),
        selectedTargetId: next.selectedStaticAssetId ?? next.selectedEntityId,
      }
    })

    setEditorDragCheckSelectTargetProvider((targetId, transformMode = 'translate') => {
      const state = useEditorDigitalTwinStore.getState()
      const staticAsset = state.staticAssets.get(targetId)
      if (staticAsset) {
        state.selectStaticAsset(targetId)
      } else if (state.entities.has(targetId)) {
        state.selectEntity(targetId)
      } else {
        return null
      }

      useEditorDigitalTwinStore.getState().setTransformMode(transformMode)
      const next = useEditorDigitalTwinStore.getState()
      return {
        selectedTargetId: next.selectedStaticAssetId ?? next.selectedEntityId,
        transformMode: next.transformMode,
      }
    })

    return () => {
      setEditorDragCheckSelectionProvider(null)
      setEditorDragCheckStoreProvider(null)
      setEditorDragCheckCameraProvider(null)
      setEditorDragCheckPrepareTargetProvider(null)
      setEditorDragCheckSelectTargetProvider(null)
    }
  }, [])

  useEffect(() => {
    if (!cameraFocusRequest) return
    pendingCameraPositionRef.current = null
    focusAnimationRef.current = {
      position: cameraFocusRequest.position,
      target: cameraFocusRequest.target,
    }
    clearCameraFocusRequest()
    invalidate()
  }, [cameraFocusRequest, clearCameraFocusRequest, invalidate])

  useEffect(() => {
    const activeCamera =
      viewportProjection === 'orthographic'
        ? orthographicCameraRef.current
        : perspectiveCameraRef.current
    const controls = controlsRef.current
    if (!activeCamera || !controls || focusAnimationRef.current || isTransformDragging) return

    if (orbitInteractionActiveRef.current) {
      pendingCameraPositionRef.current = {
        x: editorCameraPosition.x,
        y: editorCameraPosition.y,
        z: editorCameraPosition.z,
      }
      return
    }

    activeCamera.position.set(
      editorCameraPosition.x,
      editorCameraPosition.y,
      editorCameraPosition.z
    )
    activeCamera.updateProjectionMatrix()
    controls.update()
    invalidate()
  }, [
    editorCameraPosition.x,
    editorCameraPosition.y,
    editorCameraPosition.z,
    invalidate,
    isTransformDragging,
    viewportProjection,
  ])

  const handleOrbitInteractionChange = useCallback(
    (active: boolean) => {
      orbitInteractionActiveRef.current = active

      if (active || focusAnimationRef.current || isTransformDragging) {
        return
      }

      const nextCameraPosition = pendingCameraPositionRef.current
      const activeCamera =
        viewportProjection === 'orthographic'
          ? orthographicCameraRef.current
          : perspectiveCameraRef.current
      const controls = controlsRef.current

      if (!nextCameraPosition || !activeCamera || !controls) {
        return
      }

      pendingCameraPositionRef.current = null
      activeCamera.position.set(
        nextCameraPosition.x,
        nextCameraPosition.y,
        nextCameraPosition.z
      )
      activeCamera.updateProjectionMatrix()
      controls.update()
      invalidate()
    },
    [invalidate, isTransformDragging, viewportProjection]
  )

  useEffect(() => {
    if (!isTransformDragging) {
      lockedCameraPoseRef.current = null
      return
    }

    const activeCamera =
      viewportProjection === 'orthographic'
        ? orthographicCameraRef.current
        : perspectiveCameraRef.current
    const controls = controlsRef.current
    if (!activeCamera || !controls || lockedCameraPoseRef.current) return

    // The current React/store-driven editor still needs pose pinning while a
    // gizmo owns the pointer, even after orbit controls are disabled.
    lockedCameraPoseRef.current = {
      position: {
        x: activeCamera.position.x,
        y: activeCamera.position.y,
        z: activeCamera.position.z,
      },
      target: {
        x: controls.target.x,
        y: controls.target.y,
        z: controls.target.z,
      },
    }
  }, [isTransformDragging, viewportProjection])

  useFrame((_, delta) => {
    const controls = controlsRef.current
    const activeCamera =
      viewportProjection === 'orthographic'
        ? orthographicCameraRef.current
        : perspectiveCameraRef.current
    if (!controls || !activeCamera) return

    const lockedPose = lockedCameraPoseRef.current
    if (lockedPose) {
      activeCamera.position.set(
        lockedPose.position.x,
        lockedPose.position.y,
        lockedPose.position.z
      )
      controls.target.set(
        lockedPose.target.x,
        lockedPose.target.y,
        lockedPose.target.z
      )
      activeCamera.updateProjectionMatrix()
      activeCamera.lookAt(
        lockedPose.target.x,
        lockedPose.target.y,
        lockedPose.target.z
      )
      activeCamera.updateMatrixWorld()
      return
    }

    if (!focusAnimationRef.current) return
    invalidate()

    const { position, target } = focusAnimationRef.current
    const smoothing = 1 - Math.exp(-delta * 8)

    activeCamera.position.x += (position.x - activeCamera.position.x) * smoothing
    activeCamera.position.y += (position.y - activeCamera.position.y) * smoothing
    activeCamera.position.z += (position.z - activeCamera.position.z) * smoothing

    controls.target.x += (target.x - controls.target.x) * smoothing
    controls.target.y += (target.y - controls.target.y) * smoothing
    controls.target.z += (target.z - controls.target.z) * smoothing
    activeCamera.updateProjectionMatrix()
    controls.update()

    const cameraDelta = Math.hypot(
      position.x - activeCamera.position.x,
      position.y - activeCamera.position.y,
      position.z - activeCamera.position.z
    )
    const targetDelta = Math.hypot(
      target.x - controls.target.x,
      target.y - controls.target.y,
      target.z - controls.target.z
    )

    if (cameraDelta < 0.08 && targetDelta < 0.08) {
      activeCamera.position.set(position.x, position.y, position.z)
      controls.target.set(target.x, target.y, target.z)
      activeCamera.updateProjectionMatrix()
      controls.update()
      focusAnimationRef.current = null
    }
  })

  const persistCameraPose = useCallback(() => {
    const activeCamera =
      viewportProjection === 'orthographic'
        ? orthographicCameraRef.current
        : perspectiveCameraRef.current
    const controls = controlsRef.current
    if (!activeCamera || !controls || focusAnimationRef.current) return

    setEditorCameraPose(
      {
        x: activeCamera.position.x,
        y: activeCamera.position.y,
        z: activeCamera.position.z,
      },
      {
        x: controls.target.x,
        y: controls.target.y,
        z: controls.target.z,
      }
    )
  }, [setEditorCameraPose, viewportProjection])

  return (
    <>
      <color attach="background" args={[backgroundColor]} />

      <ambientLight intensity={isDark ? sceneConfig.ambientLightIntensity : 0.75} />
      <directionalLight
        position={[50, 100, 50]}
        intensity={isDark ? 0.8 : 1}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
        shadow-camera-near={10}
        shadow-camera-far={320}
        shadow-camera-left={-170}
        shadow-camera-right={170}
        shadow-camera-top={170}
        shadow-camera-bottom={-170}
      />
      <directionalLight position={[-50, 50, -50]} intensity={isDark ? 0.3 : 0.45} />
      <hemisphereLight
        args={[isDark ? '#4b5563' : '#dbeafe', isDark ? '#111827' : '#cbd5e1', 1]}
        intensity={isDark ? 0.25 : 0.4}
      />
      <Environment files={environmentFile} />

      <PerspectiveCamera
        ref={perspectiveCameraRef}
        makeDefault={viewportProjection === 'perspective'}
        position={editorCameraPositionArray}
        fov={50}
      />
      <OrthographicCamera
        ref={orthographicCameraRef}
        makeDefault={viewportProjection === 'orthographic'}
        position={editorCameraPositionArray}
        zoom={32}
        near={0.1}
        far={1200}
      />
      <EditorScenePicking pickRootRef={pickRootRef} />

      <EditorOrbitControls
        controlsRef={controlsRef}
        enabled={!isTransformDragging && !isMarqueeSelecting}
        makeDefault
        mouseButtons={DEFAULT_ORBIT_MOUSE_BUTTONS}
        minDistance={8}
        maxDistance={320}
        maxPolarAngle={Math.PI / 2.05}
        onInteractionChange={handleOrbitInteractionChange}
        onRest={persistCameraPose}
        target={editorCameraTarget}
      />

      <SpaceGrid
        size={sceneConfig.gridSize}
        divisions={sceneConfig.gridDivisions}
        showAxes={sceneConfig.showAxes}
        showGrid={sceneConfig.showGrid}
        isDark={isDark}
      />

      <EditorStaticEnvironment
        isDark={isDark}
        publishedScenePackage={publishedScenePackage}
      />

      <EditorFloorPlanOverlay />

      <group ref={pickRootRef}>
        <EditorAuthoredStaticAssetLayer palette={palette} />
        <EditorEntityLayer />
      </group>

      <EditorPlacementPreview />
      <EditorTransformGizmo
        camera={
          viewportProjection === 'orthographic'
            ? orthographicCameraRef.current ?? perspectiveCameraRef.current ?? sceneCamera
            : perspectiveCameraRef.current ?? orthographicCameraRef.current ?? sceneCamera
        }
        domElement={gl.domElement}
      />
    </>
  )
})

export function EditorCanvas() {
  const { resolvedTheme } = useTheme()
  const { sceneConfig, draftEntity, draftStaticAsset } = useEditorSceneStore(
    useShallow((state) => ({
      sceneConfig: state.sceneConfig,
      draftEntity: state.draftEntity,
      draftStaticAsset: state.draftStaticAsset,
    }))
  )
  const { selectionMarquee, transformMode } = useEditorUiStore(
    useShallow((state) => ({
      selectionMarquee: state.selectionMarquee,
      transformMode: state.transformMode,
    }))
  )
  const isDark = resolvedTheme === 'dark'
  const canvasBackground = isDark ? sceneConfig.backgroundColor : '#eaf1fb'
  const hasActiveTransformTarget = Boolean(draftStaticAsset ?? draftEntity)
  const canvasHint = useMemo(() => {
    const hintCopy = resolveEditorCanvasHintCopy(transformMode, hasActiveTransformTarget)

    switch (transformMode) {
      case 'translate':
        return {
          icon: Move,
          ...hintCopy,
        }
      case 'rotate':
        return {
          icon: RotateCcw,
          ...hintCopy,
        }
      case 'scale':
        return {
          icon: Expand,
          ...hintCopy,
        }
      default:
        return {
          icon: MousePointer2,
          ...hintCopy,
        }
    }
  }, [hasActiveTransformTarget, transformMode])
  const HintIcon = canvasHint.icon

  const createRenderer = useMemo(
    () =>
      async (defaults: { canvas: HTMLCanvasElement | OffscreenCanvas }) =>
        createPreferredRenderer(defaults, {
          mode: 'auto',
          antialias: true,
          alpha: false,
          powerPreference: 'low-power',
        }),
    []
  )

  return (
    <div className="relative h-full w-full">
      <Canvas
        frameloop="demand"
        shadows
        dpr={[1, 1.35]}
        resize={{ debounce: 100 }}
        gl={createRenderer as unknown as never}
        style={{ background: canvasBackground }}
      >
        <Suspense fallback={<SceneLoading />}>
          <EditorSceneContent backgroundColor={canvasBackground} isDark={isDark} />
        </Suspense>
      </Canvas>

      {selectionMarquee ? (
        <div
          className="pointer-events-none absolute border border-[#8cb3ff]/75 bg-[#7da7ff]/10 shadow-[0_0_0_1px_rgba(140,179,255,0.2)]"
          style={{
            left: selectionMarquee.left,
            top: selectionMarquee.top,
            width: selectionMarquee.width,
            height: selectionMarquee.height,
          }}
        />
      ) : null}

      <div className="pointer-events-none absolute bottom-3 right-3 z-20 max-w-[15rem] rounded-[16px] border border-white/10 bg-[#07101d]/78 px-3 py-2.5 text-white shadow-[0_18px_40px_rgba(7,10,16,0.26)] backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-full border border-[#7da7ff]/28 bg-[#7da7ff]/12 text-[#d6e4ff]">
            <HintIcon className="size-3.5" />
          </div>
          <div>
            <p className="editor-kicker">Interaction</p>
            <p className="text-[12px] font-semibold text-white">{canvasHint.label}</p>
          </div>
        </div>
        <div className="mt-2 space-y-1 text-[11px] text-white/70">
          {canvasHint.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  )
}
