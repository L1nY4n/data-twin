'use client'

import { Suspense, memo, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree, addAfterEffect } from '@react-three/fiber'
import {
  OrbitControls,
  PerspectiveCamera,
  Environment,
  Stats,
  Bvh,
} from '@react-three/drei'
import { useTheme } from '@/components/theme-provider'
import type * as THREE from 'three'
import type { OrbitControls as OrbitControlsType } from 'three-stdlib'
import type { Entity } from '@/lib/digital-twin/types'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { createPreferredRenderer } from '@/lib/digital-twin/renderer/createPreferredRenderer'
import { getFrameDrawCallSample } from '@/lib/digital-twin/performance-runtime'
import { runtimeVehiclePoseBuffer } from '@/lib/digital-twin/runtime-vehicle-pose-buffer'
import { SpaceGrid } from './SpaceGrid'
import { ChemicalPlantEnvironment } from './ChemicalPlantEnvironment'
import { EntityMarkers } from '../entities/EntityMarkers'
import { ZoneAreas } from '../entities/ZoneAreas'
import { MeasurementTool } from '../overlays/MeasurementTool'
import { TrajectoryOverlay } from '../overlays/TrajectoryLine'
import { NearbyDistanceOverlay } from '../overlays/DistanceIndicator'
import { IncidentEffects } from '../overlays/IncidentEffects'
import { SceneLoading } from './SceneLoading'
import { ScenePicking } from './ScenePicking'
import { PublishedStaticFeaturePickingLayer } from './PublishedStaticFeaturePickingLayer'

interface DigitalTwinCanvasProps {
  showStats?: boolean
}

interface SceneContentProps {
  backgroundColor: string
}

interface CameraPose {
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
}

interface TrackedEntityPose {
  position: { x: number; y: number; z: number }
  yaw: number
  anchorHeight: number
}

const FOLLOW_DISTANCE = 9
const FOLLOW_HEIGHT = 4.8
const FIRSTPERSON_FORWARD_DISTANCE = 6
const FIRSTPERSON_EYE_HEIGHT = 1.55

function isTrackedViewMode(viewMode: 'orbit' | 'topdown' | 'follow' | 'firstperson') {
  return viewMode === 'follow' || viewMode === 'firstperson'
}

function resolveEntityAnchorHeight(entity: Entity) {
  switch (entity.type) {
    case 'person':
      return 1.45
    case 'vehicle':
      return entity.vehicleType === 'truck' ? 2.3 : entity.vehicleType === 'forklift' ? 1.8 : 1.35
    case 'equipment':
      return Math.max(2.2, entity.scale.y * 0.8)
    case 'sensor':
      return 1.4
    case 'camera':
      return 2.1
    case 'zone':
      return 1.2
    case 'dynamic':
      return Math.max(1.4, entity.scale.y * 1.2)
  }
}

function forwardVectorFromYaw(yaw: number) {
  return {
    x: Math.sin(yaw),
    z: Math.cos(yaw),
  }
}

function resolveTrackedEntityPose(entity: Entity): TrackedEntityPose {
  const snapshot = useDigitalTwinStore.getState().getEcsSnapshotById(entity.id)

  if (entity.type === 'vehicle') {
    const interpolatedPose = runtimeVehiclePoseBuffer.get(entity.id)
    return {
      position: {
        x: interpolatedPose?.x ?? snapshot?.position.x ?? entity.position.x,
        y: interpolatedPose?.y ?? snapshot?.position.y ?? entity.position.y,
        z: interpolatedPose?.z ?? snapshot?.position.z ?? entity.position.z,
      },
      yaw: interpolatedPose?.yaw ?? snapshot?.rotation.y ?? entity.rotation.y,
      anchorHeight: resolveEntityAnchorHeight(entity),
    }
  }

  return {
    position: {
      x: snapshot?.position.x ?? entity.position.x,
      y: snapshot?.position.y ?? entity.position.y,
      z: snapshot?.position.z ?? entity.position.z,
    },
    yaw: snapshot?.rotation.y ?? entity.rotation.y,
    anchorHeight: resolveEntityAnchorHeight(entity),
  }
}

function resolveFollowCameraPose(pose: TrackedEntityPose): CameraPose {
  const forward = forwardVectorFromYaw(pose.yaw)
  return {
    position: {
      x: pose.position.x - forward.x * FOLLOW_DISTANCE,
      y: pose.position.y + FOLLOW_HEIGHT,
      z: pose.position.z - forward.z * FOLLOW_DISTANCE,
    },
    target: {
      x: pose.position.x + forward.x * 1.6,
      y: pose.position.y + pose.anchorHeight,
      z: pose.position.z + forward.z * 1.6,
    },
  }
}

function resolveFirstPersonCameraPose(pose: TrackedEntityPose): CameraPose {
  const forward = forwardVectorFromYaw(pose.yaw)
  const eyeHeight = Math.max(FIRSTPERSON_EYE_HEIGHT, pose.anchorHeight * 0.9)
  return {
    position: {
      x: pose.position.x + forward.x * 0.28,
      y: pose.position.y + eyeHeight,
      z: pose.position.z + forward.z * 0.28,
    },
    target: {
      x: pose.position.x + forward.x * FIRSTPERSON_FORWARD_DISTANCE,
      y: pose.position.y + eyeHeight,
      z: pose.position.z + forward.z * FIRSTPERSON_FORWARD_DISTANCE,
    },
  }
}

function applySmoothedCameraPose(
  camera: THREE.Camera,
  controls: OrbitControlsType,
  desiredPose: CameraPose,
  smoothing: number
) {
  camera.position.x += (desiredPose.position.x - camera.position.x) * smoothing
  camera.position.y += (desiredPose.position.y - camera.position.y) * smoothing
  camera.position.z += (desiredPose.position.z - camera.position.z) * smoothing

  controls.target.x += (desiredPose.target.x - controls.target.x) * smoothing
  controls.target.y += (desiredPose.target.y - controls.target.y) * smoothing
  controls.target.z += (desiredPose.target.z - controls.target.z) * smoothing
  controls.update()
}

const SceneContent = memo(function SceneContent({ backgroundColor }: SceneContentProps) {
  const controlsRef = useRef<OrbitControlsType>(null)
  const pickRootRef = useRef<THREE.Group>(null)
  const lastDrawCallsRef = useRef(0)
  const sampledDrawCallsRef = useRef(0)
  const hasInitializedPresetRef = useRef(false)
  const previousActiveCameraPresetRef = useRef<string | null>(null)
  const { resolvedTheme } = useTheme()
  const gl = useThree((state) => state.gl)
  const sceneConfig = useDigitalTwinStore((state) => state.sceneConfig)
  const viewMode = useDigitalTwinStore((state) => state.viewMode)
  const activeCameraPreset = useDigitalTwinStore((state) => state.activeCameraPreset)
  const cameraFocusRequest = useDigitalTwinStore((state) => state.cameraFocusRequest)
  const cameraPresets = useDigitalTwinStore((state) => state.cameraPresets)
  const selectedEntityId = useDigitalTwinStore((state) => state.selectedEntityId)
  const entities = useDigitalTwinStore((state) => state.entities)
  const setSceneReady = useDigitalTwinStore((state) => state.setSceneReady)
  const setViewMode = useDigitalTwinStore((state) => state.setViewMode)
  const measurementMode = useDigitalTwinStore((state) => state.measurementMode)
  const advanceRuntime = useDigitalTwinStore((state) => state.advanceRuntime)
  const qualityProfile = useDigitalTwinStore((state) => state.qualityProfile)
  const focusAnimationRef = useRef<{
    position: { x: number; y: number; z: number }
    target: { x: number; y: number; z: number }
  } | null>(null)
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

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return

    const trackedMode = isTrackedViewMode(viewMode)
    controls.enabled = !trackedMode
    controls.enablePan = !trackedMode
    controls.enableRotate = !trackedMode
    controls.enableZoom = !trackedMode

    if (trackedMode) {
      focusAnimationRef.current = null
    }
  }, [viewMode])

  useEffect(() => {
    const selectedEntity = selectedEntityId ? entities.get(selectedEntityId) ?? null : null
    if (isTrackedViewMode(viewMode) && (!selectedEntity || selectedEntity.type === 'zone')) {
      setViewMode('orbit')
    }
  }, [entities, selectedEntityId, setViewMode, viewMode])

  // 应用相机预设
  useEffect(() => {
    if (isTrackedViewMode(viewMode)) {
      previousActiveCameraPresetRef.current = activeCameraPreset
      return
    }

    const controls = controlsRef.current
    if (!controls || !activeCameraPreset) {
      previousActiveCameraPresetRef.current = activeCameraPreset
      return
    }

    const preset = cameraPresets.find((p) => p.id === activeCameraPreset)
    if (!preset) return

    const shouldAnimatePreset =
      hasInitializedPresetRef.current &&
      previousActiveCameraPresetRef.current !== activeCameraPreset

    if (shouldAnimatePreset) {
      focusAnimationRef.current = {
        position: preset.position,
        target: preset.target,
      }
    } else {
      controls.object.position.set(preset.position.x, preset.position.y, preset.position.z)
      controls.target.set(preset.target.x, preset.target.y, preset.target.z)
      focusAnimationRef.current = null
      controls.update()
      hasInitializedPresetRef.current = true
    }

    previousActiveCameraPresetRef.current = activeCameraPreset
  }, [activeCameraPreset, cameraPresets, viewMode])

  useEffect(() => {
    if (isTrackedViewMode(viewMode)) return
    if (!cameraFocusRequest) return

    focusAnimationRef.current = {
      position: cameraFocusRequest.position,
      target: cameraFocusRequest.target,
    }
  }, [cameraFocusRequest, viewMode])

  useFrame(({ clock, camera }, delta) => {
    const nowMs = Date.now()
    runtimeVehiclePoseBuffer.solve(nowMs)
    const controls = controlsRef.current
    const selectedEntity = selectedEntityId ? entities.get(selectedEntityId) ?? null : null

    if (isTrackedViewMode(viewMode) && controls && selectedEntity && selectedEntity.type !== 'zone') {
      const trackedPose = resolveTrackedEntityPose(selectedEntity)
      const desiredPose =
        viewMode === 'follow'
          ? resolveFollowCameraPose(trackedPose)
          : resolveFirstPersonCameraPose(trackedPose)
      const smoothing = 1 - Math.exp(-delta * (viewMode === 'firstperson' ? 10 : 8))

      applySmoothedCameraPose(camera, controls, desiredPose, smoothing)
    } else if (controlsRef.current && focusAnimationRef.current) {
      const { position, target } = focusAnimationRef.current
      const smoothing = 1 - Math.exp(-delta * 8)

      applySmoothedCameraPose(camera, controlsRef.current, { position, target }, smoothing)

      const cameraDelta = Math.hypot(
        position.x - camera.position.x,
        position.y - camera.position.y,
        position.z - camera.position.z
      )
      const targetDelta = Math.hypot(
        target.x - controlsRef.current.target.x,
        target.y - controlsRef.current.target.y,
        target.z - controlsRef.current.target.z
      )

      if (cameraDelta < 0.08 && targetDelta < 0.08) {
        camera.position.set(position.x, position.y, position.z)
        controlsRef.current.target.set(target.x, target.y, target.z)
        controlsRef.current.update()
        focusAnimationRef.current = null
      }
    }

    const runtimeCameraTarget = controls
      ? {
          x: controls.target.x,
          y: controls.target.y,
          z: controls.target.z,
        }
      : sceneConfig.cameraTarget

    advanceRuntime(
      clock.elapsedTime * 1000,
      delta * 1000,
      { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      sampledDrawCallsRef.current,
      runtimeCameraTarget
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
        maxPolarAngle={Math.PI / 2.1}
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

      {/* 静态语义代理负责固定资产拾取，动态实体/区域继续走 BVH */}
      <group ref={pickRootRef}>
        <PublishedStaticFeaturePickingLayer />
        <Bvh firstHitOnly>
          <group>
            <ZoneAreas />
            <EntityMarkers />
          </group>
        </Bvh>
      </group>

      {/* 测量工具 */}
      {measurementMode !== 'none' && <MeasurementTool />}

      {/* 轨迹叠加层 */}
      <TrajectoryOverlay />

      {/* 距离标注叠加层 */}
      <NearbyDistanceOverlay />

      {/* 事件联动特效 */}
      <IncidentEffects />
    </>
  )
})

const PerformanceHud = memo(function PerformanceHud({
  qualityProfile,
  rendererBackend,
  rendererMode,
}: {
  qualityProfile: string
  rendererBackend: string
  rendererMode: string
}) {
  const metrics = useDigitalTwinStore((state) => state.performanceMetrics)

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-md border bg-background/40 px-2.5 py-1.5 text-[10px] backdrop-blur-sm">
      <div>FPS {metrics.fps.toFixed(0)} | P95 {metrics.frameTimeP95.toFixed(1)}ms</div>
      <div>Draw {metrics.drawCalls} | Labels {metrics.visibleLabels}</div>
      <div>
        {metrics.poolRequests > 0 ? `Pool ${(metrics.poolHitRate * 100).toFixed(0)}%` : 'Pool idle'} | {qualityProfile}
      </div>
      <div>Renderer {rendererBackend} ({rendererMode})</div>
    </div>
  )
})

export function DigitalTwinCanvas({ showStats = false }: DigitalTwinCanvasProps) {
  const { resolvedTheme } = useTheme()
  const sceneConfig = useDigitalTwinStore((state) => state.sceneConfig)
  const qualityProfile = useDigitalTwinStore((state) => state.qualityProfile)
  const rendererMode = useDigitalTwinStore((state) => state.rendererMode)
  const rendererBackend = useDigitalTwinStore((state) => state.rendererBackend)
  const setRendererBackend = useDigitalTwinStore((state) => state.setRendererBackend)
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

      <PerformanceHud
        qualityProfile={qualityProfile}
        rendererBackend={rendererBackend}
        rendererMode={rendererMode}
      />
    </div>
  )
}
