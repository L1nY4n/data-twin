'use client'

import { Suspense, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import {
  OrbitControls,
  PerspectiveCamera,
  Environment,
  Stats,
} from '@react-three/drei'
import { useTheme } from 'next-themes'
import type { OrbitControls as OrbitControlsType } from 'three-stdlib'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { SpaceGrid } from './SpaceGrid'
import { EntityMarkers } from '../entities/EntityMarkers'
import { ZoneAreas } from '../entities/ZoneAreas'
import { MeasurementTool } from '../overlays/MeasurementTool'
import { TrajectoryOverlay } from '../overlays/TrajectoryLine'
import { NearbyDistanceOverlay } from '../overlays/DistanceIndicator'
import { SceneLoading } from './SceneLoading'

interface DigitalTwinCanvasProps {
  showStats?: boolean
}

function SceneContent() {
  const controlsRef = useRef<OrbitControlsType>(null)
  const { resolvedTheme } = useTheme()
  const sceneConfig = useDigitalTwinStore((state) => state.sceneConfig)
  const viewMode = useDigitalTwinStore((state) => state.viewMode)
  const activeCameraPreset = useDigitalTwinStore((state) => state.activeCameraPreset)
  const cameraPresets = useDigitalTwinStore((state) => state.cameraPresets)
  const setSceneReady = useDigitalTwinStore((state) => state.setSceneReady)
  const measurementMode = useDigitalTwinStore((state) => state.measurementMode)
  const isDark = resolvedTheme === 'dark'
  const environmentFile = isDark
    ? '/hdr/dikhololo_night_1k.hdr'
    : '/hdr/potsdamer_platz_1k.hdr'

  useEffect(() => {
    setSceneReady(true)
    return () => setSceneReady(false)
  }, [setSceneReady])

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

  return (
    <>
      {/* 环境光 */}
      <ambientLight intensity={isDark ? sceneConfig.ambientLightIntensity : 0.75} />
      <directionalLight
        position={[50, 100, 50]}
        intensity={isDark ? 0.8 : 1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-50, 50, -50]} intensity={isDark ? 0.3 : 0.45} />

      {/* 本地HDR环境贴图，避免远程CDN加载失败 */}
      <Environment files={environmentFile} />

      {/* 本地兜底环境光，避免外部HDR资源加载失败导致场景报错 */}
      <hemisphereLight
        skyColor={isDark ? '#4b5563' : '#dbeafe'}
        groundColor={isDark ? '#111827' : '#cbd5e1'}
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
        maxDistance={200}
        maxPolarAngle={viewMode === 'topdown' ? 0 : Math.PI / 2.1}
        target={[sceneConfig.cameraTarget.x, sceneConfig.cameraTarget.y, sceneConfig.cameraTarget.z]}
      />

      {/* 空间网格 */}
      <SpaceGrid
        size={sceneConfig.gridSize}
        divisions={sceneConfig.gridDivisions}
        showAxes={sceneConfig.showAxes}
        showGrid={sceneConfig.showGrid}
        isDark={isDark}
      />

      {/* 区域 */}
      <ZoneAreas />

      {/* 实体标记 */}
      <EntityMarkers />

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
  const isDark = resolvedTheme === 'dark'
  const canvasBackground = isDark ? sceneConfig.backgroundColor : '#eaf1fb'

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        gl={{ 
          antialias: true,
          alpha: false,
        }}
        style={{ background: canvasBackground }}
        onCreated={({ gl }) => {
          gl.setClearColor(canvasBackground)
        }}
      >
        <Suspense fallback={<SceneLoading />}>
          <SceneContent />
        </Suspense>
        {showStats && <Stats />}
      </Canvas>
    </div>
  )
}
