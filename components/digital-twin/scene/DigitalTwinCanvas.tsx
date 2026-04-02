'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree, addAfterEffect } from '@react-three/fiber'
import {
  OrbitControls,
  PerspectiveCamera,
  Environment,
  Stats,
  Bvh,
} from '@react-three/drei'
import { useTheme } from 'next-themes'
import type * as THREE from 'three'
import type { OrbitControls as OrbitControlsType } from 'three-stdlib'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { createPreferredRenderer } from '@/lib/digital-twin/renderer/createPreferredRenderer'
import { getFrameDrawCallSample } from '@/lib/digital-twin/performance-runtime'
import { SpaceGrid } from './SpaceGrid'
import { ChemicalPlantEnvironment } from './ChemicalPlantEnvironment'
import { EntityMarkers } from '../entities/EntityMarkers'
import { ZoneAreas } from '../entities/ZoneAreas'
import { MeasurementTool } from '../overlays/MeasurementTool'
import { TrajectoryOverlay } from '../overlays/TrajectoryLine'
import { NearbyDistanceOverlay } from '../overlays/DistanceIndicator'
import { SceneLoading } from './SceneLoading'
import { ScenePicking } from './ScenePicking'

interface DigitalTwinCanvasProps {
  showStats?: boolean
}

interface SceneContentProps {
  backgroundColor: string
}

function SceneContent({ backgroundColor }: SceneContentProps) {
  const controlsRef = useRef<OrbitControlsType>(null)
  const pickRootRef = useRef<THREE.Group>(null)
  const lastDrawCallsRef = useRef(0)
  const sampledDrawCallsRef = useRef(0)
  const { resolvedTheme } = useTheme()
  const gl = useThree((state) => state.gl)
  const sceneConfig = useDigitalTwinStore((state) => state.sceneConfig)
  const viewMode = useDigitalTwinStore((state) => state.viewMode)
  const activeCameraPreset = useDigitalTwinStore((state) => state.activeCameraPreset)
  const cameraPresets = useDigitalTwinStore((state) => state.cameraPresets)
  const setSceneReady = useDigitalTwinStore((state) => state.setSceneReady)
  const measurementMode = useDigitalTwinStore((state) => state.measurementMode)
  const advanceRuntime = useDigitalTwinStore((state) => state.advanceRuntime)
  const qualityProfile = useDigitalTwinStore((state) => state.qualityProfile)
  const isDark = resolvedTheme === 'dark'
  const environmentFile = isDark
    ? '/hdr/dikhololo_night_1k.hdr'
    : '/hdr/potsdamer_platz_1k.hdr'

  useEffect(() => {
    setSceneReady(true)
    return () => setSceneReady(false)
  }, [setSceneReady])

  useEffect(
    () =>
      addAfterEffect(() => {
        const renderInfo = (gl as unknown as {
          info?: { render?: { calls?: number; drawCalls?: number } }
        }).info?.render
        const rawDrawCalls = renderInfo?.calls ?? 0
        const sample = getFrameDrawCallSample(
          lastDrawCallsRef.current,
          rawDrawCalls,
          renderInfo?.drawCalls
        )

        lastDrawCallsRef.current = sample.previousRawDrawCalls
        sampledDrawCallsRef.current = sample.drawCalls
      }),
    [gl]
  )

  // 应用相机预设
  useEffect(() => {
    if (!controlsRef.current || !activeCameraPreset) return
    
    const preset = cameraPresets.find((p) => p.id === activeCameraPreset)
    if (!preset) return

    controlsRef.current.object.position.set(
      preset.position.x,
      preset.position.y,
      preset.position.z
    )
    controlsRef.current.target.set(preset.target.x, preset.target.y, preset.target.z)
    controlsRef.current.update()
  }, [activeCameraPreset, cameraPresets])

  useFrame(({ clock, camera }, delta) => {
    advanceRuntime(
      clock.elapsedTime * 1000,
      delta * 1000,
      { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      sampledDrawCallsRef.current
    )
  })

  return (
    <>
      {/* 用 scene.background 兜底，避免 WebGPU 清屏色异常导致场景外出现黑幕 */}
      <color attach="background" args={[backgroundColor]} />

      {/* 环境光 */}
      <ambientLight intensity={isDark ? sceneConfig.ambientLightIntensity : 0.75} />
      <directionalLight
        position={[50, 100, 50]}
        intensity={isDark ? 0.8 : 1}
        castShadow={qualityProfile !== 'performance'}
        shadow-mapSize={qualityProfile === 'performance' ? [512, 512] : [1024, 1024]}
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

      {/* 本地HDR环境贴图，避免远程CDN加载失败 */}
      <Environment files={environmentFile} />

      {/* 本地兜底环境光，避免外部HDR资源加载失败导致场景报错 */}
      <hemisphereLight
        args={[isDark ? '#4b5563' : '#dbeafe', isDark ? '#111827' : '#cbd5e1', 1]}
        intensity={isDark ? 0.25 : 0.4}
      />

      {/* 相机控制 */}
      <PerspectiveCamera 
        makeDefault 
        position={[sceneConfig.cameraPosition.x, sceneConfig.cameraPosition.y, sceneConfig.cameraPosition.z]}
        fov={50}
      />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={280}
        maxPolarAngle={viewMode === 'topdown' ? 0 : Math.PI / 2.1}
        target={[sceneConfig.cameraTarget.x, sceneConfig.cameraTarget.y, sceneConfig.cameraTarget.z]}
      />
      <ScenePicking pickRootRef={pickRootRef} />

      {/* 空间网格 */}
      <SpaceGrid
        size={sceneConfig.gridSize}
        divisions={sceneConfig.gridDivisions}
        showAxes={sceneConfig.showAxes}
        showGrid={sceneConfig.showGrid}
        isDark={isDark}
      />

      {/* 静态化工厂环境，不参与拾取，避免拖慢射线遍历 */}
      <ChemicalPlantEnvironment isDark={isDark} />

      {/* BVH 只包裹可拾取对象，降低拾取和构建成本 */}
      <Bvh firstHitOnly>
        <group ref={pickRootRef}>
          <ZoneAreas />
          <EntityMarkers />
        </group>
      </Bvh>

      {/* 测量工具 */}
      {measurementMode !== 'none' && <MeasurementTool />}

      {/* 轨迹叠加层 */}
      <TrajectoryOverlay />

      {/* 距离标注叠加层 */}
      <NearbyDistanceOverlay />
    </>
  )
}

export function DigitalTwinCanvas({ showStats = false }: DigitalTwinCanvasProps) {
  const { resolvedTheme } = useTheme()
  const sceneConfig = useDigitalTwinStore((state) => state.sceneConfig)
  const qualityProfile = useDigitalTwinStore((state) => state.qualityProfile)
  const rendererMode = useDigitalTwinStore((state) => state.rendererMode)
  const rendererBackend = useDigitalTwinStore((state) => state.rendererBackend)
  const setRendererBackend = useDigitalTwinStore((state) => state.setRendererBackend)
  const metrics = useDigitalTwinStore((state) => state.performanceMetrics)
  const isDark = resolvedTheme === 'dark'
  const canvasBackground = isDark ? sceneConfig.backgroundColor : '#eaf1fb'
  const dprRange: [number, number] = qualityProfile === 'performance' ? [1, 1.2] : [1, 1.35]
  const createRenderer = useMemo(
    () =>
      async (defaults: { canvas: HTMLCanvasElement | OffscreenCanvas }) =>
        createPreferredRenderer(defaults, {
          mode: rendererMode,
          antialias: qualityProfile !== 'performance',
          alpha: false,
        }),
    [qualityProfile, rendererMode]
  )

  return (
    <div className="relative h-full w-full">
      <Canvas
        key={`renderer-${rendererMode}`}
        shadows={qualityProfile !== 'performance'}
        dpr={dprRange}
        resize={{ debounce: 100 }}
        gl={createRenderer as unknown as never}
        style={{ background: canvasBackground }}
        onCreated={({ gl }) => {
          const unknownRenderer = gl as unknown as {
            setClearColor?: (color: string) => void
            __backend?: 'webgpu' | 'webgl2'
          }
          if (typeof unknownRenderer.setClearColor === 'function') {
            unknownRenderer.setClearColor(canvasBackground)
          }
          setRendererBackend(unknownRenderer.__backend ?? 'unknown')
        }}
      >
        <Suspense fallback={<SceneLoading />}>
          <SceneContent backgroundColor={canvasBackground} />
        </Suspense>
        {showStats && <Stats />}
      </Canvas>

      <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-md border bg-background/80 px-2.5 py-1.5 text-[10px] backdrop-blur">
        <div>FPS {metrics.fps.toFixed(0)} | P95 {metrics.frameTimeP95.toFixed(1)}ms</div>
        <div>Draw {metrics.drawCalls} | Labels {metrics.visibleLabels}</div>
        <div>
          {metrics.poolRequests > 0 ? `Pool ${(metrics.poolHitRate * 100).toFixed(0)}%` : 'Pool idle'} | {qualityProfile}
        </div>
        <div>Renderer {rendererBackend} ({rendererMode})</div>
      </div>
    </div>
  )
}
