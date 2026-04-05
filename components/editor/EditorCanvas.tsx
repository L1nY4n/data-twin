'use client'

import { Suspense, memo, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import {
  Environment,
  OrthographicCamera,
  OrbitControls,
  PerspectiveCamera,
} from '@react-three/drei'
import { useTheme } from 'next-themes'
import type * as THREE from 'three'
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

function EditorPlacementPreview() {
  const placementCatalogId = useEditorDigitalTwinStore((state) => state.placementCatalogId)
  const placementPreview = useEditorDigitalTwinStore((state) => state.placementPreview)
  const catalogItem = placementCatalogId ? getStaticAssetCatalogItem(placementCatalogId) : null

  if (!placementPreview) return null

  const width = catalogItem?.dimensions.width ?? 4
  const depth = catalogItem?.dimensions.depth ?? 4
  const height = catalogItem?.dimensions.height ?? 1.5

  return (
    <group
      position={[
        placementPreview.x,
        placementPreview.y,
        placementPreview.z,
      ]}
    >
      <mesh position={[0, Math.max(height / 2, 0.75), 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color="#7da7ff"
          opacity={0.18}
          transparent
          emissive="#4f83ff"
          emissiveIntensity={0.5}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[Math.max(width, depth) * 0.32, Math.max(width, depth) * 0.42, 48]} />
        <meshBasicMaterial color="#d5e4ff" opacity={0.88} transparent />
      </mesh>
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
  const sceneConfig = useEditorDigitalTwinStore((state) => state.sceneConfig)
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
  const setSceneConfig = useEditorDigitalTwinStore((state) => state.setSceneConfig)
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
  }, [cameraFocusRequest, clearCameraFocusRequest])

  useEffect(() => {
    const activeCamera =
      viewportProjection === 'orthographic'
        ? orthographicCameraRef.current
        : perspectiveCameraRef.current
    const controls = controlsRef.current
    if (!activeCamera || !controls || focusAnimationRef.current) return

    activeCamera.position.set(
      sceneConfig.cameraPosition.x,
      sceneConfig.cameraPosition.y,
      sceneConfig.cameraPosition.z
    )
    controls.target.set(
      sceneConfig.cameraTarget.x,
      sceneConfig.cameraTarget.y,
      sceneConfig.cameraTarget.z
    )
    activeCamera.updateProjectionMatrix()
    controls.update()
  }, [
    sceneConfig.cameraPosition.x,
    sceneConfig.cameraPosition.y,
    sceneConfig.cameraPosition.z,
    sceneConfig.cameraTarget.x,
    sceneConfig.cameraTarget.y,
    sceneConfig.cameraTarget.z,
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

  const persistCameraPose = () => {
    const activeCamera =
      viewportProjection === 'orthographic'
        ? orthographicCameraRef.current
        : perspectiveCameraRef.current
    const controls = controlsRef.current
    if (!activeCamera || !controls || focusAnimationRef.current) return

    setSceneConfig({
      cameraPosition: {
        x: activeCamera.position.x,
        y: activeCamera.position.y,
        z: activeCamera.position.z,
      },
      cameraTarget: {
        x: controls.target.x,
        y: controls.target.y,
        z: controls.target.z,
      },
    })
  }

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
          sceneConfig.cameraPosition.x,
          sceneConfig.cameraPosition.y,
          sceneConfig.cameraPosition.z,
        ]}
        fov={50}
      />
      <OrthographicCamera
        ref={orthographicCameraRef}
        makeDefault={viewportProjection === 'orthographic'}
        position={[
          sceneConfig.cameraPosition.x,
          sceneConfig.cameraPosition.y,
          sceneConfig.cameraPosition.z,
        ]}
        zoom={32}
        near={0.1}
        far={1200}
      />
      <OrbitControls
        ref={controlsRef}
        enabled={!isTransformDragging && !isMarqueeSelecting}
        enableDamping
        dampingFactor={0.08}
        minDistance={8}
        maxDistance={320}
        minPolarAngle={viewMode === 'topdown' ? 0 : undefined}
        maxPolarAngle={viewMode === 'topdown' ? 0 : Math.PI / 2.05}
        onEnd={persistCameraPose}
        target={[
          sceneConfig.cameraTarget.x,
          sceneConfig.cameraTarget.y,
          sceneConfig.cameraTarget.z,
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
  const isDark = resolvedTheme === 'dark'
  const canvasBackground = isDark ? sceneConfig.backgroundColor : '#eaf1fb'

  const createRenderer = useMemo(
    () =>
      async (defaults: { canvas: HTMLCanvasElement | OffscreenCanvas }) =>
        createPreferredRenderer(defaults, {
          mode: 'auto',
          antialias: true,
          alpha: false,
        }),
    []
  )

  return (
    <div className="relative h-full w-full">
      <Canvas
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
    </div>
  )
}
