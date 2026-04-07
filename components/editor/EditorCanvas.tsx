'use client'

import { Suspense, memo, useCallback, useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { Expand, MousePointer2, Move, RotateCcw } from 'lucide-react'
import { useTheme } from 'next-themes'
import * as THREE from 'three'
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { OrbitControls as OrbitControlsType } from 'three-stdlib'
import { createPublishedStaticPalette } from '@/components/digital-twin/scene/palette'
import { SpaceGrid } from '@/components/digital-twin/scene/SpaceGrid'
import { SceneLoading } from '@/components/digital-twin/scene/SceneLoading'
import { createPreferredRenderer } from '@/lib/digital-twin/renderer/createPreferredRenderer'
import { useEditorDigitalTwinStore } from '@/lib/digital-twin/editor-store'
import { getStaticAssetCatalogItem } from '@/lib/digital-twin/static-asset-catalog'
import type { Vector3 } from '@/lib/digital-twin/types'
import { EditorAuthoredStaticAssetLayer } from './scene/EditorAuthoredStaticAssetLayer'
import { EditorEntityLayer } from './scene/EditorEntityLayer'
import { EditorScenePicking } from './scene/EditorScenePicking'
import { EditorStaticEnvironment } from './scene/EditorStaticEnvironment'
import { EditorTransformGizmo } from './scene/EditorTransformGizmo'

const DEFAULT_ORBIT_MOUSE_BUTTONS = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
}

function EditorOrbitControls({
  controlsRef,
  enabled,
  maxDistance,
  maxPolarAngle,
  minDistance,
  minPolarAngle,
  mouseButtons,
  onRest,
  target,
}: {
  controlsRef: RefObject<OrbitControlsType | null>
  enabled: boolean
  maxDistance: number
  maxPolarAngle?: number
  minDistance: number
  minPolarAngle?: number
  mouseButtons: typeof DEFAULT_ORBIT_MOUSE_BUTTONS
  onRest: () => void
  target: [number, number, number]
}) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const controls = useMemo(() => new OrbitControlsImpl(camera, gl.domElement), [camera, gl])
  const onRestRef = useRef(onRest)
  const settleRequestedRef = useRef(false)

  useEffect(() => {
    onRestRef.current = onRest
  }, [onRest])

  useEffect(() => {
    controlsRef.current = controls

    return () => {
      if (controlsRef.current === controls) {
        controlsRef.current = null
      }
    }
  }, [controls, controlsRef])

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
    controls.target.set(target[0], target[1], target[2])
    controls.update()
    invalidate()
  }, [
    controls,
    invalidate,
    maxDistance,
    maxPolarAngle,
    minDistance,
    minPolarAngle,
    mouseButtons,
    target,
  ])

  useEffect(() => {
    let rafId: number | null = null

    const finishSettledInteraction = () => {
      if (!settleRequestedRef.current) return
      settleRequestedRef.current = false
      onRestRef.current()
    }

    const stepControls = () => {
      rafId = null
      if (!controls.enabled) {
        settleRequestedRef.current = false
        return
      }
      const controlsChanged = (controls.update as () => boolean)()
      if (controlsChanged) {
        invalidate()
        rafId = window.requestAnimationFrame(stepControls)
        return
      }
      finishSettledInteraction()
    }

    const scheduleControlsStep = () => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(stepControls)
    }

    const handleChange = () => {
      invalidate()
    }

    const handleStart = () => {
      settleRequestedRef.current = false
      scheduleControlsStep()
    }

    const handleEnd = () => {
      settleRequestedRef.current = true
      scheduleControlsStep()
    }

    controls.addEventListener('change', handleChange)
    controls.addEventListener('start', handleStart)
    controls.addEventListener('end', handleEnd)

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
      controls.removeEventListener('change', handleChange)
      controls.removeEventListener('start', handleStart)
      controls.removeEventListener('end', handleEnd)
      controls.dispose()
    }
  }, [controls, invalidate])

  return <primitive object={controls} />
}

function EditorPlacementPreview() {
  const placementCatalogId = useEditorDigitalTwinStore((state) => state.placementCatalogId)
  const placementPreview = useEditorDigitalTwinStore((state) => state.placementPreview)
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
  const invalidate = useThree((state) => state.invalidate)
  const sceneConfig = useEditorDigitalTwinStore((state) => state.sceneConfig)
  const editorCameraPosition = useEditorDigitalTwinStore((state) => state.editorCameraPosition)
  const editorCameraTarget = useEditorDigitalTwinStore((state) => state.editorCameraTarget)
  const publishedScenePackage = useEditorDigitalTwinStore(
    (state) => state.publishedScenePackage
  )
  const viewMode = useEditorDigitalTwinStore((state) => state.viewMode)
  const viewportProjection = useEditorDigitalTwinStore(
    (state) => state.viewportProjection
  )
  const isTransformDragging = useEditorDigitalTwinStore(
    (state) => state.isTransformDragging
  )
  const isMarqueeSelecting = useEditorDigitalTwinStore(
    (state) => state.isMarqueeSelecting
  )
  const cameraFocusRequest = useEditorDigitalTwinStore(
    (state) => state.cameraFocusRequest
  )
  const clearCameraFocusRequest = useEditorDigitalTwinStore(
    (state) => state.clearCameraFocusRequest
  )
  const setEditorCameraPose = useEditorDigitalTwinStore((state) => state.setEditorCameraPose)
  const palette = useMemo(() => createPublishedStaticPalette(isDark), [isDark])
  const pickRootRef = useRef<THREE.Group>(null)
  const controlsRef = useRef<OrbitControlsType>(null)
  const perspectiveCameraRef = useRef<THREE.PerspectiveCamera>(null)
  const orthographicCameraRef = useRef<THREE.OrthographicCamera>(null)
  const focusAnimationRef = useRef<{
    position: Vector3
    target: Vector3
  } | null>(null)
  const environmentFile = isDark
    ? '/hdr/dikhololo_night_1k.hdr'
    : '/hdr/potsdamer_platz_1k.hdr'
  useEffect(() => {
    if (!cameraFocusRequest) return
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
    if (!activeCamera || !controls || focusAnimationRef.current) return

    activeCamera.position.set(
      editorCameraPosition.x,
      editorCameraPosition.y,
      editorCameraPosition.z
    )
    controls.target.set(
      editorCameraTarget.x,
      editorCameraTarget.y,
      editorCameraTarget.z
    )
    activeCamera.updateProjectionMatrix()
    controls.update()
  }, [
    editorCameraPosition.x,
    editorCameraPosition.y,
    editorCameraPosition.z,
    editorCameraTarget.x,
    editorCameraTarget.y,
    editorCameraTarget.z,
    isMarqueeSelecting,
    isTransformDragging,
    viewportProjection,
  ])

  useFrame((_, delta) => {
    const controls = controlsRef.current
    const activeCamera =
      viewportProjection === 'orthographic'
        ? orthographicCameraRef.current
        : perspectiveCameraRef.current
    if (!controls || !activeCamera || !focusAnimationRef.current) return
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
        position={[
          editorCameraPosition.x,
          editorCameraPosition.y,
          editorCameraPosition.z,
        ]}
        fov={50}
      />
      <OrthographicCamera
        ref={orthographicCameraRef}
        makeDefault={viewportProjection === 'orthographic'}
        position={[
          editorCameraPosition.x,
          editorCameraPosition.y,
          editorCameraPosition.z,
        ]}
        zoom={32}
        near={0.1}
        far={1200}
      />
      <EditorOrbitControls
        controlsRef={controlsRef}
        enabled={!isTransformDragging && !isMarqueeSelecting}
        mouseButtons={DEFAULT_ORBIT_MOUSE_BUTTONS}
        minDistance={8}
        maxDistance={320}
        minPolarAngle={viewMode === 'topdown' ? 0 : undefined}
        maxPolarAngle={viewMode === 'topdown' ? 0 : Math.PI / 2.05}
        onRest={persistCameraPose}
        target={[
          editorCameraTarget.x,
          editorCameraTarget.y,
          editorCameraTarget.z,
        ]}
      />

      <EditorScenePicking pickRootRef={pickRootRef} />

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

      <group ref={pickRootRef}>
        <EditorAuthoredStaticAssetLayer palette={palette} />
        <EditorEntityLayer />
      </group>

      <EditorPlacementPreview />
      <EditorTransformGizmo />
    </>
  )
})

export function EditorCanvas() {
  const { resolvedTheme } = useTheme()
  const sceneConfig = useEditorDigitalTwinStore((state) => state.sceneConfig)
  const selectionMarquee = useEditorDigitalTwinStore((state) => state.selectionMarquee)
  const transformMode = useEditorDigitalTwinStore((state) => state.transformMode)
  const isDark = resolvedTheme === 'dark'
  const canvasBackground = isDark ? sceneConfig.backgroundColor : '#eaf1fb'
  const canvasHint = useMemo(() => {
    switch (transformMode) {
      case 'translate':
        return {
          icon: Move,
          label: '移动对象',
          lines: ['拖拽 Gizmo 移动物体', '左键拖动画面', '滚轮缩放 / 右键平移'],
        }
      case 'rotate':
        return {
          icon: RotateCcw,
          label: '旋转对象',
          lines: ['拖拽 Gizmo 旋转对象', '左键拖动画面', '滚轮缩放 / 右键平移'],
        }
      case 'scale':
        return {
          icon: Expand,
          label: '缩放对象',
          lines: ['拖拽 Gizmo 缩放对象', '左键拖动画面', '滚轮缩放 / 右键平移'],
        }
      default:
        return {
          icon: MousePointer2,
          label: '选择模式',
          lines: ['左键拖动画面', 'Shift + 左键框选', '单击选择对象'],
        }
    }
  }, [transformMode])
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
