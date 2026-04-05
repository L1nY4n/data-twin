'use client'

import { Suspense, memo, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import {
  Environment,
  OrbitControls,
  PerspectiveCamera,
} from '@react-three/drei'
import { useTheme } from 'next-themes'
import type * as THREE from 'three'
import { createPublishedStaticPalette } from '@/components/digital-twin/scene/palette'
import { SpaceGrid } from '@/components/digital-twin/scene/SpaceGrid'
import { SceneLoading } from '@/components/digital-twin/scene/SceneLoading'
import { createPreferredRenderer } from '@/lib/digital-twin/renderer/createPreferredRenderer'
import { useEditorDigitalTwinStore } from '@/lib/digital-twin/editor-store'
import { EditorAuthoredStaticAssetLayer } from './scene/EditorAuthoredStaticAssetLayer'
import { EditorEntityLayer } from './scene/EditorEntityLayer'
import { EditorScenePicking } from './scene/EditorScenePicking'
import { EditorStaticEnvironment } from './scene/EditorStaticEnvironment'
import { EditorTransformGizmo } from './scene/EditorTransformGizmo'

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
  const palette = useMemo(() => createPublishedStaticPalette(isDark), [isDark])
  const pickRootRef = useRef<THREE.Group>(null)
  const environmentFile = isDark
    ? '/hdr/dikhololo_night_1k.hdr'
    : '/hdr/potsdamer_platz_1k.hdr'

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
        makeDefault
        position={[
          sceneConfig.cameraPosition.x,
          sceneConfig.cameraPosition.y,
          sceneConfig.cameraPosition.z,
        ]}
        fov={50}
      />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={8}
        maxDistance={320}
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

      <EditorTransformGizmo />
    </>
  )
})

export function EditorCanvas() {
  const { resolvedTheme } = useTheme()
  const sceneConfig = useEditorDigitalTwinStore((state) => state.sceneConfig)
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
    <div className="h-full w-full">
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
    </div>
  )
}
