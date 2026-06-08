'use client'

import {
  Component,
  Suspense,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Canvas,
  useFrame,
  useThree,
  addAfterEffect,
} from '@react-three/fiber'
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
import {
  createPreferredRenderer,
  type PreferredRendererDiagnostics,
} from '@/lib/digital-twin/renderer/createPreferredRenderer'
import { getFrameDrawCallSample } from '@/lib/digital-twin/performance-runtime'
import { runtimeVehiclePoseBuffer } from '@/lib/digital-twin/runtime-vehicle-pose-buffer'
import { stabilizeCameraPreset } from '@/lib/digital-twin/camera-presets'
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
import {
  useDigitalTwinRuntimePlugin,
  useDigitalTwinViewerRuntime,
  ViewerRuntimeBridge,
} from './ViewerRuntimeBridge'

interface DigitalTwinCanvasProps {
  showStats?: boolean
}

interface SceneContentProps {
  backgroundColor: string
}

interface RendererErrorBoundaryProps {
  children: ReactNode
  fallback: (error: Error) => ReactNode
  onError: (error: Error) => void
  resetKey: string | number
}

interface RendererErrorBoundaryState {
  error: Error | null
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
const FOLLOW_CAMERA_RESPONSE = 12
const FIRSTPERSON_CAMERA_RESPONSE = 16
const MAX_TRACKED_CAMERA_DELTA = 1 / 30
const MIN_ORBIT_POLAR_ANGLE = 0.08
const MAX_ORBIT_POLAR_ANGLE = Math.PI / 2.05
const RENDERER_TRANSITION_FALLBACK_MS = 2500
const WEBGPU_FRAME_STALL_FALLBACK_MS = 5000

type RendererMode = 'auto' | 'webgpu' | 'webgl2'
type RendererBackend = 'webgpu' | 'webgl2' | 'unknown'

class RendererErrorBoundary extends Component<
  RendererErrorBoundaryProps,
  RendererErrorBoundaryState
> {
  override state: RendererErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error): RendererErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error) {
    this.props.onError(error)
  }

  override componentDidUpdate(previousProps: RendererErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  override render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error)
    }

    return this.props.children
  }
}

function hasNavigatorWebGpu() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

function isTrackedViewMode(viewMode: 'orbit' | 'topdown' | 'follow' | 'firstperson') {
  return viewMode === 'follow' || viewMode === 'firstperson'
}

function shouldRecreateRendererForMode(mode: RendererMode, currentBackend: RendererBackend) {
  if (currentBackend === 'unknown') return true
  if (mode === 'webgpu') return currentBackend !== 'webgpu'
  return currentBackend !== 'webgl2'
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
  const interpolatedPose = entity.type !== 'zone' ? runtimeVehiclePoseBuffer.get(entity.id) : null

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
  smoothing: number,
  options: { syncOrbitControls?: boolean } = {}
) {
  camera.position.x += (desiredPose.position.x - camera.position.x) * smoothing
  camera.position.y += (desiredPose.position.y - camera.position.y) * smoothing
  camera.position.z += (desiredPose.position.z - camera.position.z) * smoothing

  controls.target.x += (desiredPose.target.x - controls.target.x) * smoothing
  controls.target.y += (desiredPose.target.y - controls.target.y) * smoothing
  controls.target.z += (desiredPose.target.z - controls.target.z) * smoothing

  if (options.syncOrbitControls ?? true) {
    controls.update()
  } else {
    camera.lookAt(controls.target)
    camera.updateMatrixWorld()
  }
}

function flushOrbitControlsDamping(controls: OrbitControlsType) {
  const position = controls.object.position.clone()
  const target = controls.target.clone()
  const dampingEnabled = controls.enableDamping

  controls.enableDamping = false
  controls.update()
  controls.object.position.copy(position)
  controls.target.copy(target)
  controls.object.lookAt(target)
  controls.object.updateMatrixWorld()
  controls.enableDamping = dampingEnabled
}

function resolveTrackedCameraSmoothing(
  viewMode: 'follow' | 'firstperson',
  delta: number
) {
  const response =
    viewMode === 'firstperson' ? FIRSTPERSON_CAMERA_RESPONSE : FOLLOW_CAMERA_RESPONSE
  return 1 - Math.exp(-Math.min(delta, MAX_TRACKED_CAMERA_DELTA) * response)
}

const SceneContent = memo(function SceneContent({ backgroundColor }: SceneContentProps) {
  const controlsRef = useRef<OrbitControlsType>(null)
  const pickRootRef = useRef<THREE.Group>(null)
  const lastDrawCallsRef = useRef(0)
  const sampledDrawCallsRef = useRef(0)
  const runtimeFrameRef = useRef({
    nowMs: 0,
    deltaMs: 0,
    cameraPosition: { x: 0, y: 0, z: 0 },
    cameraTarget: { x: 0, y: 0, z: 0 } as { x: number; y: number; z: number } | null,
    drawCalls: 0,
  })
  const hasInitializedPresetRef = useRef(false)
  const previousActiveCameraPresetRef = useRef<string | null>(null)
  const { resolvedTheme } = useTheme()
  const gl = useThree((state) => state.gl)
  const sceneConfig = useDigitalTwinStore((state) => state.sceneConfig)
  const publishedScenePackage = useDigitalTwinStore((state) => state.publishedScenePackage)
  const authoredStaticAssetCount = useDigitalTwinStore((state) => state.authoredStaticAssets.size)
  const viewMode = useDigitalTwinStore((state) => state.viewMode)
  const activeCameraPreset = useDigitalTwinStore((state) => state.activeCameraPreset)
  const cameraFocusRequest = useDigitalTwinStore((state) => state.cameraFocusRequest)
  const cameraPresets = useDigitalTwinStore((state) => state.cameraPresets)
  const selectedEntityId = useDigitalTwinStore((state) => state.selectedEntityId)
  const setSceneReady = useDigitalTwinStore((state) => state.setSceneReady)
  const setViewMode = useDigitalTwinStore((state) => state.setViewMode)
  const measurementMode = useDigitalTwinStore((state) => state.measurementMode)
  const advanceRuntime = useDigitalTwinStore((state) => state.advanceRuntime)
  const qualityProfile = useDigitalTwinStore((state) => state.qualityProfile)
  const viewerRuntime = useDigitalTwinViewerRuntime()
  const focusAnimationRef = useRef<{
    position: { x: number; y: number; z: number }
    target: { x: number; y: number; z: number }
  } | null>(null)
  const isDark = resolvedTheme === 'dark'
  const environmentFile = isDark
    ? '/hdr/dikhololo_night_1k.hdr'
    : '/hdr/potsdamer_platz_1k.hdr'
  const hasPublishedStaticGeometry = useMemo(
    () =>
      publishedScenePackage.staticChunks.some(
        (chunk) =>
          chunk.featureCount > 0 ||
          chunk.renderRecipe.detailed.length > 0 ||
          (chunk.renderRecipe.proxy?.length ?? 0) > 0
      ),
    [publishedScenePackage.staticChunks]
  )
  const hasModelBackedRuntimeSurface =
    hasPublishedStaticGeometry || authoredStaticAssetCount > 0
  const runtimeStoreBridgePlugin = useMemo(
    () => ({
      id: 'store-runtime-bridge',
      order: 20,
      onFixedUpdatePre: (tick: { nowMs: number }) => {
        runtimeVehiclePoseBuffer.solve(tick.nowMs)
      },
      onRender: (frame: {
        nowMs: number
        deltaMs: number
        cameraPosition?: { x: number; y: number; z: number }
        cameraTarget?: { x: number; y: number; z: number } | null
        drawCalls?: number
      }) => {
        if (!frame.cameraPosition) return
        advanceRuntime(
          frame.nowMs,
          frame.deltaMs,
          frame.cameraPosition,
          frame.drawCalls ?? 0,
          frame.cameraTarget ?? undefined
        )
      },
    }),
    [advanceRuntime]
  )

  useDigitalTwinRuntimePlugin(runtimeStoreBridgePlugin, 'store-runtime-bridge')

  const handleOrbitControlsStart = useCallback(() => {
    if (isTrackedViewMode(useDigitalTwinStore.getState().viewMode)) return

    focusAnimationRef.current = null
    previousActiveCameraPresetRef.current = null

    const {
      activeCameraPreset: currentPreset,
      cameraFocusRequest: currentFocusRequest,
      setActiveCameraPreset,
      clearCameraFocusRequest,
    } = useDigitalTwinStore.getState()

    if (currentPreset) {
      setActiveCameraPreset(null)
    }

    if (currentFocusRequest) {
      clearCameraFocusRequest()
    }
  }, [])

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
    if (trackedMode) {
      flushOrbitControlsDamping(controls)
    }

    controls.enabled = !trackedMode
    controls.enablePan = !trackedMode
    controls.enableRotate = !trackedMode
    controls.enableZoom = !trackedMode
    controls.enableDamping = !trackedMode

    if (trackedMode) {
      focusAnimationRef.current = null
    }
  }, [viewMode])

  useEffect(() => {
    const selectedEntity = selectedEntityId
      ? useDigitalTwinStore.getState().getEntityById(selectedEntityId) ?? null
      : null
    if (isTrackedViewMode(viewMode) && (!selectedEntity || selectedEntity.type === 'zone')) {
      setViewMode('orbit')
    }
  }, [selectedEntityId, setViewMode, viewMode])

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

    const presetCandidate = cameraPresets.find((p) => p.id === activeCameraPreset)
    const preset = presetCandidate ? stabilizeCameraPreset(presetCandidate) : null
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

  useFrame(({ camera }, delta) => {
    const nowMs = Date.now()
    const controls = controlsRef.current
    const selectedEntity = selectedEntityId
      ? useDigitalTwinStore.getState().getEntityById(selectedEntityId) ?? null
      : null

    if (isTrackedViewMode(viewMode) && controls && selectedEntity && selectedEntity.type !== 'zone') {
      const trackedPose = resolveTrackedEntityPose(selectedEntity)
      const desiredPose =
        viewMode === 'follow'
          ? resolveFollowCameraPose(trackedPose)
          : resolveFirstPersonCameraPose(trackedPose)
      const smoothing = resolveTrackedCameraSmoothing(viewMode, delta)

      applySmoothedCameraPose(camera, controls, desiredPose, smoothing, {
        syncOrbitControls: false,
      })
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

    const runtimeFrame = runtimeFrameRef.current
    runtimeFrame.nowMs = nowMs
    runtimeFrame.deltaMs = delta * 1000
    runtimeFrame.cameraPosition.x = camera.position.x
    runtimeFrame.cameraPosition.y = camera.position.y
    runtimeFrame.cameraPosition.z = camera.position.z
    runtimeFrame.drawCalls = sampledDrawCallsRef.current
    const runtimeCameraTarget = controls ? controls.target : sceneConfig.cameraTarget
    if (runtimeCameraTarget) {
      if (runtimeFrame.cameraTarget) {
        runtimeFrame.cameraTarget.x = runtimeCameraTarget.x
        runtimeFrame.cameraTarget.y = runtimeCameraTarget.y
        runtimeFrame.cameraTarget.z = runtimeCameraTarget.z
      } else {
        runtimeFrame.cameraTarget = {
          x: runtimeCameraTarget.x,
          y: runtimeCameraTarget.y,
          z: runtimeCameraTarget.z,
        }
      }
    } else {
      runtimeFrame.cameraTarget = null
    }

    if (viewerRuntime) {
      viewerRuntime.advance(runtimeFrame)
    } else {
      runtimeVehiclePoseBuffer.solve(nowMs)
      advanceRuntime(
        runtimeFrame.nowMs,
        runtimeFrame.deltaMs,
        runtimeFrame.cameraPosition,
        runtimeFrame.drawCalls,
        runtimeFrame.cameraTarget ?? undefined
      )
    }
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
        onStart={handleOrbitControlsStart}
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={280}
        minPolarAngle={MIN_ORBIT_POLAR_ANGLE}
        maxPolarAngle={MAX_ORBIT_POLAR_ANGLE}
        target={[sceneConfig.cameraTarget.x, sceneConfig.cameraTarget.y, sceneConfig.cameraTarget.z]}
      />
      <ScenePicking pickRootRef={pickRootRef} />

      {/* 空间网格 */}
      <SpaceGrid
        size={sceneConfig.gridSize}
        divisions={sceneConfig.gridDivisions}
        showAxes={sceneConfig.showAxes}
        showGrid={sceneConfig.showGrid && !hasModelBackedRuntimeSurface}
        showGround={!hasPublishedStaticGeometry}
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

function RendererReadySignal({ onReady }: { onReady: () => void }) {
  const readyRef = useRef(false)

  useFrame(() => {
    if (readyRef.current) return
    readyRef.current = true
    onReady()
  })

  return null
}

const PerformanceHud = memo(function PerformanceHud({
  qualityProfile,
  rendererBackend,
  rendererMode,
}: {
  qualityProfile: string
  rendererBackend: string
  rendererMode: string
}) {
  const fps = useDigitalTwinStore((state) => state.performanceMetrics.fps)
  const frameTimeP95 = useDigitalTwinStore((state) => state.performanceMetrics.frameTimeP95)
  const drawCalls = useDigitalTwinStore((state) => state.performanceMetrics.drawCalls)
  const visibleLabels = useDigitalTwinStore((state) => state.performanceMetrics.visibleLabels)
  const poolHitRate = useDigitalTwinStore((state) => state.performanceMetrics.poolHitRate)
  const poolRequests = useDigitalTwinStore((state) => state.performanceMetrics.poolRequests)
  const rendererDiagnostics = useDigitalTwinStore((state) => state.rendererDiagnostics)
  const webGpuAvailability =
    rendererDiagnostics.webgpuAvailable === null
      ? 'unknown'
      : rendererDiagnostics.webgpuAvailable
        ? 'available'
        : 'unavailable'
  const fallbackSummary = rendererDiagnostics.fallbackReason
    ? rendererDiagnostics.message
      ? `${rendererDiagnostics.fallbackReason}: ${rendererDiagnostics.message}`
      : rendererDiagnostics.fallbackReason
    : null

  return (
    <div
      data-performance-hud="runtime"
      className="pointer-events-none absolute bottom-[4.75rem] left-4 z-20 rounded-md border bg-background/40 px-2.5 py-1.5 text-[10px] backdrop-blur-sm"
    >
      <div>FPS {fps.toFixed(0)} | P95 {frameTimeP95.toFixed(1)}ms</div>
      <div>Draw {drawCalls} | Labels {visibleLabels}</div>
      <div>
        {poolRequests > 0 ? `Pool ${(poolHitRate * 100).toFixed(0)}%` : 'Pool idle'} | {qualityProfile}
      </div>
      <div>Renderer {rendererBackend} ({rendererMode})</div>
      <div>
        WebGPU {webGpuAvailability} | Storage {rendererDiagnostics.storageBufferActive ? 'on' : 'off'}
      </div>
      {fallbackSummary && <div>Fallback {fallbackSummary}</div>}
    </div>
  )
})

function describeRendererFailure(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function DigitalTwinCanvas({ showStats = false }: DigitalTwinCanvasProps) {
  const { resolvedTheme } = useTheme()
  const sceneConfig = useDigitalTwinStore((state) => state.sceneConfig)
  const qualityProfile = useDigitalTwinStore((state) => state.qualityProfile)
  const rendererMode = useDigitalTwinStore((state) => state.rendererMode)
  const rendererBackend = useDigitalTwinStore((state) => state.rendererBackend)
  const setRendererBackend = useDigitalTwinStore((state) => state.setRendererBackend)
  const setRendererDiagnostics = useDigitalTwinStore((state) => state.setRendererDiagnostics)
  const setRendererMode = useDigitalTwinStore((state) => state.setRendererMode)
  const isDark = resolvedTheme === 'dark'
  const canvasBackground = isDark ? sceneConfig.backgroundColor : '#eaf1fb'
  const dprRange: [number, number] = qualityProfile === 'performance' ? [1, 1.2] : [1, 1.35]
  const [rendererRevision, setRendererRevision] = useState(0)
  const [rendererTransitioning, setRendererTransitioning] = useState(true)
  const [rendererError, setRendererError] = useState<string | null>(null)
  const previousRendererModeRef = useRef<RendererMode>(rendererMode)
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transitionFrameRef = useRef<number | null>(null)
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
  const clearTransitionTimers = useCallback(() => {
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current)
      transitionTimeoutRef.current = null
    }
    if (transitionFrameRef.current !== null) {
      window.cancelAnimationFrame(transitionFrameRef.current)
      transitionFrameRef.current = null
    }
  }, [])
  const beginRendererTransition = useCallback(() => {
    clearTransitionTimers()
    setRendererError(null)
    setRendererTransitioning(true)
    transitionTimeoutRef.current = setTimeout(() => {
      transitionTimeoutRef.current = null
      setRendererTransitioning(false)
    }, RENDERER_TRANSITION_FALLBACK_MS)
  }, [clearTransitionTimers])
  const finishRendererTransition = useCallback(() => {
    clearTransitionTimers()
    setRendererError(null)
    transitionFrameRef.current = window.requestAnimationFrame(() => {
      transitionFrameRef.current = null
      setRendererTransitioning(false)
    })
  }, [clearTransitionTimers])

  useEffect(() => {
    transitionTimeoutRef.current = setTimeout(() => {
      transitionTimeoutRef.current = null
      setRendererTransitioning(false)
    }, RENDERER_TRANSITION_FALLBACK_MS)

    return () => clearTransitionTimers()
  }, [clearTransitionTimers])

  useEffect(() => {
    if (previousRendererModeRef.current === rendererMode) return

    previousRendererModeRef.current = rendererMode

    if (!shouldRecreateRendererForMode(rendererMode, rendererBackend)) {
      return
    }

    beginRendererTransition()
    setRendererBackend('unknown')
    setRendererDiagnostics({
      requestedMode: rendererMode,
      backend: 'unknown',
      webgpuAvailable: hasNavigatorWebGpu(),
      fallbackReason: null,
      message: 'renderer recreating',
      storageBufferActive: false,
    })
    setRendererRevision((revision) => revision + 1)
  }, [beginRendererTransition, rendererBackend, rendererMode, setRendererBackend, setRendererDiagnostics])

  useEffect(() => {
    if (rendererMode !== 'auto' || rendererBackend !== 'webgpu') return

    const timeoutId = window.setTimeout(() => {
      const state = useDigitalTwinStore.getState()
      if (state.rendererMode !== 'auto' || state.rendererBackend !== 'webgpu') return
      if (state.performanceMetrics.fps > 0 || state.performanceMetrics.frameTimeP95 > 0) return

      setRendererMode('webgl2')
    }, WEBGPU_FRAME_STALL_FALLBACK_MS)

    return () => window.clearTimeout(timeoutId)
  }, [rendererBackend, rendererMode, setRendererMode])

  return (
    <div className="relative h-full w-full" style={{ background: canvasBackground }}>
      <RendererErrorBoundary
        resetKey={rendererRevision}
        onError={(error) => {
          const message = describeRendererFailure(error)
          setRendererError(message)
          setRendererBackend('unknown')
          setRendererDiagnostics({
            requestedMode: rendererMode,
            backend: 'unknown',
            webgpuAvailable: hasNavigatorWebGpu(),
            fallbackReason: 'renderer-init-failed',
            message,
            storageBufferActive: false,
          })
        }}
        fallback={() => {
          return null
        }}
      >
        <Canvas
          key={`renderer-${rendererRevision}`}
          frameloop="always"
          shadows={qualityProfile !== 'performance'}
          dpr={dprRange}
          resize={{ debounce: 100 }}
          gl={createRenderer as unknown as never}
          style={{ background: canvasBackground }}
          onCreated={({ gl }) => {
            setRendererError(null)
            const unknownRenderer = gl as unknown as {
              setClearColor?: (color: string) => void
              __backend?: 'webgpu' | 'webgl2'
              __diagnostics?: PreferredRendererDiagnostics
            }
            if (typeof unknownRenderer.setClearColor === 'function') {
              unknownRenderer.setClearColor(canvasBackground)
            }
            const glRenderer = gl as unknown as { setPixelRatio?: (value: number) => void }
            if (typeof glRenderer.setPixelRatio === 'function') {
              glRenderer.setPixelRatio(window.devicePixelRatio <= 1.5 ? window.devicePixelRatio : dprRange[1])
            }
            const backend = unknownRenderer.__backend ?? unknownRenderer.__diagnostics?.backend ?? 'unknown'
            setRendererBackend(backend)
            setRendererDiagnostics({
              requestedMode: rendererMode,
              backend,
              webgpuAvailable: unknownRenderer.__diagnostics?.webgpuAvailable ?? hasNavigatorWebGpu(),
              fallbackReason:
                unknownRenderer.__diagnostics?.fallbackReason ??
                (rendererMode === 'webgpu' && backend !== 'webgpu'
                  ? 'unknown-webgpu-fallback'
                  : null),
              message: unknownRenderer.__diagnostics?.message ?? null,
              storageBufferActive: backend === 'webgpu',
            })
          }}
        >
          <Suspense fallback={<SceneLoading />}>
            <ViewerRuntimeBridge>
              <SceneContent backgroundColor={canvasBackground} />
              <RendererReadySignal onReady={finishRendererTransition} />
            </ViewerRuntimeBridge>
          </Suspense>
          {showStats && <Stats />}
        </Canvas>
      </RendererErrorBoundary>

      {rendererError && (
        <div
          data-renderer-error="true"
          className="absolute inset-0 z-30 flex items-center justify-center px-6 text-center"
          style={{ background: canvasBackground }}
        >
          <div className="max-w-md rounded-xl border border-amber-300/30 bg-background/80 px-5 py-4 text-sm shadow-lg backdrop-blur">
            <div className="font-medium text-amber-100">3D renderer unavailable</div>
            <div className="mt-2 text-xs leading-5 text-muted-foreground">{rendererError}</div>
          </div>
        </div>
      )}

      {rendererTransitioning && (
        <div
          aria-hidden="true"
          data-renderer-transition="active"
          className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-150"
          style={{ background: canvasBackground }}
        />
      )}

      <PerformanceHud
        qualityProfile={qualityProfile}
        rendererBackend={rendererBackend}
        rendererMode={rendererMode}
      />
    </div>
  )
}
