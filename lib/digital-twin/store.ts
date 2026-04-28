import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  AccessRule,
  CameraEntity,
  DynamicEntity,
  Entity,
  EntityArchetype,
  EntityCategory,
  ZoneEntity,
  PersonEntity,
  VehicleEntity,
  EquipmentEntity,
  SensorEntity,
  EntityType,
  EntityStatus,
  TimeRange,
  Vector3,
  SceneConfig,
  ViewMode,
  CameraPreset,
  RuleConfig,
  EntityTrajectory,
  Alarm,
  IncidentVideoFeed,
  RuntimeDataSource,
  RuntimeIncident,
  StaticAssetInstance,
  VehicleRouteContract,
  VehicleRouteLike,
  VehicleTrackContract,
  VehicleTrackLike,
} from './types'
import {
  createEcsWorld,
  enqueueCommands as enqueueEcsCommands,
  flushBufferedCommands,
  flushCommands,
  LabelComponent,
  resolveLabelMode,
  type EcsCommand,
  type EcsEntitySnapshot,
  type EcsCreatePayload,
  type EcsWorld,
} from './ecs'
import {
  applyDynamicSeparation,
  createDynamicOccupancyIndex,
  DYNAMIC_NEIGHBOR_QUERY_RADIUS,
  generateId,
  queryDynamicOccupants,
  resolveVehicleBlockedMetadata,
  simulateEntityMovement,
  simulateEquipmentStatus,
  updateDynamicOccupancyIndex,
} from './mock-data'
import { createTickScheduler } from './ecs/scheduler'
import { CAMPUS_BOUNDS } from './campus-layout'
import { stabilizeCameraPresets } from './camera-presets'
import { getEquipmentSimulationIntervalMs, shouldRunEquipmentSimulation } from './equipment-runtime'
import { aggregatePoolMetrics } from './performance-runtime'
import {
  resolveEntitySimulationCadence,
  shouldSimulateEntityThisTick,
} from './runtime-simulation-cadence'
import type { PublishedScenePackage } from './publish'
import { DEFAULT_PUBLISHED_SCENE_PACKAGE } from './publish'
import {
  createRuntimeStaticChunkRegistry,
  type RuntimeStaticChunkRegistration,
} from './runtime/static/chunk-registry'
import {
  createRuntimePublishedStaticFeatureRegistry,
  getRuntimePublishedStaticFeature,
  type RuntimePublishedStaticFeatureRegistry,
} from './runtime/static/features'
import {
  createEntitySchemaRegistry,
  getDynamicEntityPresentation as resolveDynamicEntityPresentation,
  type DynamicEntityPresentation,
  type EntitySchemaRegistry,
} from './entity-schema-registry'
import {
  isRuntimeIncidentActive,
  shouldRetainRuntimeIncident,
} from './incident-utils'
import type {
  EventTypeRegistration,
  PlatformModuleManifest,
} from './module-registry'
import { runtimeVehicleSnapshotRegistry } from './runtime-vehicle-snapshot-registry'
import { runtimeVehiclePoseBuffer } from './runtime-vehicle-pose-buffer'

export type QualityProfile = 'balanced' | 'performance'
export type RendererMode = 'auto' | 'webgpu' | 'webgl2'
export type RendererBackend = 'webgpu' | 'webgl2' | 'unknown'

export interface RendererDiagnostics {
  requestedMode: RendererMode
  backend: RendererBackend
  webgpuAvailable: boolean | null
  fallbackReason: string | null
  message: string | null
  storageBufferActive: boolean
}

interface PerformanceMetrics {
  fps: number
  frameTimeP95: number
  drawCalls: number
  visibleLabels: number
  poolHitRate: number
  poolRequests: number
}

interface CameraFocusRequest {
  position: Vector3
  target: Vector3
}

interface EntityBuckets {
  persons: PersonEntity[]
  vehicles: VehicleEntity[]
  equipment: EquipmentEntity[]
  sensors: SensorEntity[]
  cameras: CameraEntity[]
  zones: ZoneEntity[]
  dynamic: DynamicEntity[]
}

function isTrackedRuntimeViewMode(mode: ViewMode) {
  return mode === 'follow' || mode === 'firstperson'
}

function canTrackRuntimeEntity(entity: Entity | null | undefined) {
  return !!entity && entity.type !== 'zone'
}

export interface EntityDirectoryEntry {
  id: string
  type: EntityType
  name: string
  status: EntityStatus
  visible: boolean
  categoryKey?: string
  categoryLabel?: string
  categoryColor?: string
  categorySortOrder?: number
  archetypeLabel?: string
  secondaryLabel?: string
}

interface EntityCategoryPresentation {
  key: string
  displayName: string
  color?: string
  sortOrder: number
}

function getEntityCategoryPresentationFromMap(
  categories: Map<string, EntityCategory>,
  key: string
): EntityCategoryPresentation {
  const category = categories.get(key)
  return {
    key,
    displayName: category?.displayName ?? key,
    ...(category?.color ? { color: category.color } : {}),
    sortOrder: category?.sortOrder ?? 0,
  }
}

const defaultPublishedScenePackage = DEFAULT_PUBLISHED_SCENE_PACKAGE
const defaultStaticChunkRegistry = createRuntimeStaticChunkRegistry(defaultPublishedScenePackage)
const defaultStaticFeatureRegistry =
  createRuntimePublishedStaticFeatureRegistry(defaultPublishedScenePackage)

// 默认场景配置
const defaultSceneConfig: SceneConfig = defaultPublishedScenePackage.sceneConfig

// 默认相机预设
const defaultCameraPresets: CameraPreset[] = stabilizeCameraPresets(
  defaultPublishedScenePackage.cameraPresets
)

interface DigitalTwinState {
  publishedScenePackage: PublishedScenePackage
  staticChunkRegistry: RuntimeStaticChunkRegistration[]
  staticFeatureRegistry: RuntimePublishedStaticFeatureRegistry
  authoredStaticAssets: Map<string, StaticAssetInstance>

  // 场景状态
  sceneConfig: SceneConfig
  viewMode: ViewMode
  cameraPresets: CameraPreset[]
  activeCameraPreset: string | null
  cameraFocusRequest: CameraFocusRequest | null
  isSceneReady: boolean

  // 实体状态（UI层消费）
  entities: Map<string, Entity>
  // Authoritative registry data hydrated from bootstrap/admin state.
  entityCategories: Map<string, EntityCategory>
  entityArchetypes: Map<string, EntityArchetype>
  // Derived lookup index built from the authoritative category/archetype maps.
  entitySchemaRegistry: EntitySchemaRegistry
  platformModules: PlatformModuleManifest[]
  eventTypeRegistry: Map<string, EventTypeRegistration>
  entityBuckets: EntityBuckets
  entityDirectory: Map<string, EntityDirectoryEntry>
  selectedEntityId: string | null
  hoveredEntityId: string | null
  selectedStaticFeatureId: string | null
  hoveredStaticFeatureId: string | null
  entityFilters: {
    types: EntityType[]
    statuses: EntityStatus[]
    searchQuery: string
  }

  // 轨迹数据
  trajectories: Map<string, EntityTrajectory>
  isPlayingTrajectory: boolean
  trajectoryPlaybackSpeed: number

  // 规则配置
  rules: Map<string, RuleConfig>
  activeRuleId: string | null
  isRuleEditorOpen: boolean

  // 告警列表
  alarms: Alarm[]
  unacknowledgedAlarmCount: number

  // 事件 / Citation runtime
  incidents: RuntimeIncident[]
  activeIncidentId: string | null
  incidentVideoFeed: IncidentVideoFeed | null
  incidentVideoIncidentId: string | null
  isIncidentVideoOpen: boolean
  runtimeDataSource: RuntimeDataSource
  runtimeNotice: string | null

  // UI状态
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  bottomPanelOpen: boolean
  bottomPanelTab: 'timeline' | 'rules' | 'charts'

  // 测量工具
  measurementMode: 'none' | 'distance' | 'angle' | 'area'
  measurementPoints: Vector3[]

  // 连接状态
  isConnected: boolean
  connectionUrl: string | null

  // 渲染后端
  rendererMode: RendererMode
  rendererBackend: RendererBackend
  rendererDiagnostics: RendererDiagnostics

  // 运行时性能状态
  qualityProfile: QualityProfile
  autoQuality: boolean
  runtimeRunning: boolean
  performanceMetrics: PerformanceMetrics
}

interface SimulationTickPayload {
  entityUpdates: Array<{ id: string; updates: Partial<Entity> }>
  trajectoryUpdates?: Array<{ entityId: string; point: { position: Vector3; timestamp: number } }>
  newAlarms?: Alarm[]
}

interface DigitalTwinActions {
  setPublishedScenePackage: (pkg: PublishedScenePackage) => void
  setAuthoredStaticAssets: (assets: StaticAssetInstance[]) => void
  setPlatformRegistry: (registry: {
    modules?: PlatformModuleManifest[]
    eventTypes?: EventTypeRegistration[]
  }) => void

  // 场景操作
  setSceneConfig: (config: Partial<SceneConfig>) => void
  setViewMode: (mode: ViewMode) => void
  setActiveCameraPreset: (presetId: string | null) => void
  clearCameraFocusRequest: () => void
  focusCameraOnEntity: (id: string) => void
  setSceneReady: (ready: boolean) => void

  // 实体操作
  addEntity: (entity: Entity) => void
  addEntities: (entities: Entity[]) => void
  setEntityRegistry: (registry: {
    categories?: EntityCategory[]
    archetypes?: EntityArchetype[]
  }) => void
  updateEntity: (id: string, updates: Partial<Entity>) => void
  removeEntity: (id: string) => void
  setSelectedEntity: (id: string | null) => void
  setHoveredEntity: (id: string | null) => void
  setSelectedStaticFeature: (id: string | null) => void
  setHoveredStaticFeature: (id: string | null) => void
  setEntityFilters: (filters: Partial<DigitalTwinState['entityFilters']>) => void
  updateEntityPosition: (id: string, position: Vector3, rotation?: Vector3) => void
  batchUpdateEntities: (updates: Array<{ id: string; updates: Partial<Entity> }>) => void
  applySimulationTick: (payload: SimulationTickPayload) => void

  // ECS命令缓冲
  enqueueCommands: (commands: EcsCommand[]) => void
  flushCommands: () => void
  advanceRuntime: (
    nowMs: number,
    deltaMs: number,
    cameraPosition: Vector3,
    drawCalls: number,
    cameraTarget?: Vector3
  ) => void
  setRuntimeRunning: (running: boolean) => void
  resetRuntimeClock: () => void

  // 轨迹操作
  addTrajectoryPoint: (entityId: string, point: { position: Vector3; timestamp: number }) => void
  clearTrajectory: (entityId: string) => void
  setTrajectoryPlayback: (playing: boolean, speed?: number) => void

  // 规则操作
  addRule: (rule: RuleConfig) => void
  updateRule: (id: string, updates: Partial<RuleConfig>) => void
  removeRule: (id: string) => void
  setActiveRule: (id: string | null) => void
  setRuleEditorOpen: (open: boolean) => void

  // 告警操作
  addAlarm: (alarm: Alarm) => void
  acknowledgeAlarm: (id: string) => void
  clearAlarms: () => void

  // 事件操作
  upsertIncident: (incident: RuntimeIncident) => void
  batchUpsertIncidents: (incidents: RuntimeIncident[]) => void
  acknowledgeIncident: (id: string) => void
  setActiveIncident: (id: string | null) => void
  openIncidentVideo: (feed: IncidentVideoFeed, incidentId?: string | null) => void
  closeIncidentVideo: () => void
  clearIncidents: () => void
  pruneIncidents: (now?: number) => void
  setRuntimeDataSource: (source: RuntimeDataSource, notice?: string | null) => void

  // UI操作
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  toggleBottomPanel: () => void
  setBottomPanelTab: (tab: DigitalTwinState['bottomPanelTab']) => void

  // 测量工具
  setMeasurementMode: (mode: DigitalTwinState['measurementMode']) => void
  addMeasurementPoint: (point: Vector3) => void
  clearMeasurementPoints: () => void

  // 连接操作
  setConnectionStatus: (connected: boolean, url?: string) => void

  // 性能档位
  setQualityProfile: (profile: QualityProfile) => void
  setAutoQuality: (enabled: boolean) => void
  setRendererMode: (mode: RendererMode) => void
  setRendererBackend: (backend: RendererBackend) => void
  setRendererDiagnostics: (diagnostics: RendererDiagnostics) => void

  // 工具方法
  getEntitiesByType: <T extends Entity>(type: EntityType) => T[]
  getEntityById: (id: string) => Entity | undefined
  getEventTypeRegistration: (eventType: string) => EventTypeRegistration | undefined
  getDynamicEntityPresentation: (entity: DynamicEntity) => DynamicEntityPresentation
  getEntitiesInZone: (zoneId: string) => Entity[]
  getEcsSnapshotById: (id: string) => EcsEntitySnapshot | undefined
  reset: () => void
}

const initialState: DigitalTwinState = {
  publishedScenePackage: defaultPublishedScenePackage,
  staticChunkRegistry: defaultStaticChunkRegistry,
  staticFeatureRegistry: defaultStaticFeatureRegistry,
  authoredStaticAssets: new Map(),
  sceneConfig: defaultSceneConfig,
  viewMode: 'orbit',
  cameraPresets: defaultCameraPresets,
  activeCameraPreset: 'iso',
  cameraFocusRequest: null,
  isSceneReady: false,

  entities: new Map(),
  entityCategories: new Map(),
  entityArchetypes: new Map(),
  entitySchemaRegistry: createEntitySchemaRegistry({}),
  platformModules: [],
  eventTypeRegistry: new Map(),
  entityBuckets: {
    persons: [],
    vehicles: [],
    equipment: [],
    sensors: [],
    cameras: [],
    zones: [],
    dynamic: [],
  },
  entityDirectory: new Map(),
  selectedEntityId: null,
  hoveredEntityId: null,
  selectedStaticFeatureId: null,
  hoveredStaticFeatureId: null,
  entityFilters: {
    types: ['person', 'vehicle', 'equipment', 'sensor', 'camera', 'zone', 'dynamic'],
    statuses: ['active', 'inactive', 'warning', 'error'],
    searchQuery: '',
  },

  trajectories: new Map(),
  isPlayingTrajectory: false,
  trajectoryPlaybackSpeed: 1,

  rules: new Map(),
  activeRuleId: null,
  isRuleEditorOpen: false,

  alarms: [],
  unacknowledgedAlarmCount: 0,

  incidents: [],
  activeIncidentId: null,
  incidentVideoFeed: null,
  incidentVideoIncidentId: null,
  isIncidentVideoOpen: false,
  runtimeDataSource: 'live',
  runtimeNotice: null,

  leftPanelOpen: true,
  rightPanelOpen: true,
  bottomPanelOpen: false,
  bottomPanelTab: 'timeline',

  measurementMode: 'none',
  measurementPoints: [],

  isConnected: false,
  connectionUrl: null,
  rendererMode: 'auto',
  rendererBackend: 'unknown',
  rendererDiagnostics: {
    requestedMode: 'auto',
    backend: 'unknown',
    webgpuAvailable: null,
    fallbackReason: null,
    message: null,
    storageBufferActive: false,
  },

  qualityProfile: 'balanced',
  autoQuality: false,
  runtimeRunning: true,
  performanceMetrics: {
    fps: 0,
    frameTimeP95: 0,
    drawCalls: 0,
    visibleLabels: 0,
    poolHitRate: 0,
    poolRequests: 0,
  },
}

const ECS_BOUNDS = CAMPUS_BOUNDS

const MAX_TRAJECTORY_ENTITIES = 24

const LABEL_MODE_TO_CODE: Record<'hidden' | 'sprite' | 'html', number> = {
  hidden: 0,
  sprite: 1,
  html: 2,
}

const ecsWorld = createEcsWorld()
type MovingSnapshot = EcsEntitySnapshot & { type: 'person' | 'vehicle' }

function upsertRuntimeIncidentState(
  state: Pick<DigitalTwinState, 'incidents' | 'activeIncidentId'>,
  incident: RuntimeIncident,
  now = Date.now()
) {
  const retainedIncidents = state.incidents.filter((entry) =>
    shouldRetainRuntimeIncident(entry, now)
  )
  const existingIndex = state.incidents.findIndex((entry) => entry.id === incident.id)
  if (existingIndex >= 0) {
    const nextIncidents = retainedIncidents.slice()
    const retainedIndex = nextIncidents.findIndex((entry) => entry.id === incident.id)
    if (retainedIndex === -1) {
      nextIncidents.unshift(incident)
      return { incidents: nextIncidents.slice(0, 80) }
    }
    nextIncidents[retainedIndex] = incident
    return { incidents: nextIncidents }
  }

  const nextIncidents = [incident, ...retainedIncidents]
  const currentActiveIncident =
    state.activeIncidentId
      ? nextIncidents.find((entry) => entry.id === state.activeIncidentId) ?? null
      : null
  const nextActiveIncidentId =
    currentActiveIncident && isRuntimeIncidentActive(currentActiveIncident, now)
      ? currentActiveIncident.id
      : incident.id

  return {
    incidents: nextIncidents.slice(0, 80),
    activeIncidentId: nextActiveIncidentId,
  }
}

function collectVisibleSnapshotsByTypes<T extends EntityType>(
  world: EcsWorld,
  types: readonly T[]
): Array<EcsEntitySnapshot & { type: T }> {
  const snapshots: Array<EcsEntitySnapshot & { type: T }> = []
  for (const type of types) {
    for (const id of world.byType[type]) {
      const snapshot = world.snapshotById.get(id)
      if (snapshot?.visible) {
        snapshots.push(snapshot as EcsEntitySnapshot & { type: T })
      }
    }
  }

  return snapshots
}

function getAggregatePoolMetrics() {
  const { requests: poolRequests, hitRate: poolHitRate } = aggregatePoolMetrics(
    Object.values(ecsWorld.pools)
  )

  return {
    poolRequests,
    poolHitRate,
  }
}

function getLabelConfig(profile: QualityProfile) {
  if (profile === 'performance') {
    return {
      htmlDistance: 13,
      spriteDistance: 34,
      maxHtmlLabels: 20,
    }
  }

  return {
    htmlDistance: 18,
    spriteDistance: 42,
    maxHtmlLabels: 40,
  }
}

function getLabelLodIntervalMs(profile: QualityProfile, entityCount: number) {
  const base = profile === 'performance' ? 360 : 250
  if (entityCount >= 300) return profile === 'performance' ? 760 : 560
  if (entityCount >= 180) return profile === 'performance' ? 620 : 440
  if (entityCount >= 100) return profile === 'performance' ? 480 : 340
  return base
}

function getEntityPublishIntervalMs(
  profile: QualityProfile,
  entityCount: number,
  interactionActive: boolean
): number {
  const base = profile === 'performance' ? 340 : 220
  const scaled =
    entityCount >= 300
      ? Math.round(base * 1.8)
      : entityCount >= 180
        ? Math.round(base * 1.5)
        : entityCount >= 100
          ? Math.round(base * 1.25)
          : base

  // 交互时保持更低延迟，避免详情面板和高亮反馈滞后。
  return interactionActive ? Math.min(scaled, 140) : scaled
}

const RUNTIME_MOTION_PATCH_KEYS = new Set([
  'position',
  'rotation',
  'scale',
  'speed',
  'heading',
  'routeTrack',
  'trackPosition',
  'metadata',
  'updatedAt',
])

function isMotionOnlyRuntimePatch(updates: Partial<Entity>) {
  const keys = Object.keys(updates)
  return keys.length > 0 && keys.every((key) => RUNTIME_MOTION_PATCH_KEYS.has(key))
}

function shouldPublishRuntimePatchImmediately(
  id: string,
  updates: Partial<Entity>,
  selectedEntityId: string | null,
  hoveredEntityId: string | null
) {
  if (id === selectedEntityId || id === hoveredEntityId) return true
  const snapshot = ecsWorld.snapshotById.get(id)
  if (snapshot?.labelMode === 'html') return true
  return !isMotionOnlyRuntimePatch(updates)
}

function cloneBoundary(boundary: Vector3[] | undefined): Vector3[] | undefined {
  return boundary ? boundary.map((point) => ({ ...point })) : undefined
}

function cloneSceneConfigValue(sceneConfig: SceneConfig): SceneConfig {
  return {
    ...sceneConfig,
    cameraPosition: { ...sceneConfig.cameraPosition },
    cameraTarget: { ...sceneConfig.cameraTarget },
  }
}

function cloneCameraPresetsValue(cameraPresets: CameraPreset[]): CameraPreset[] {
  return stabilizeCameraPresets(cameraPresets)
}

function cloneTimeRanges(schedule: TimeRange[] | undefined): TimeRange[] | undefined {
  return schedule
    ? schedule.map((range) => ({
        ...range,
      }))
    : undefined
}

function cloneAlarms(alarms: Alarm[] | undefined): Alarm[] | undefined {
  return alarms
    ? alarms.map((alarm) => ({
        ...alarm,
      }))
    : undefined
}

function cloneAccessRules(rules: AccessRule[] | undefined): AccessRule[] | undefined {
  return rules
    ? rules.map((rule) => ({
        ...rule,
        allowedRoles: [...rule.allowedRoles],
        allowedDepartments: [...rule.allowedDepartments],
        timeRanges: cloneTimeRanges(rule.timeRanges) ?? [],
      }))
    : undefined
}

function normalizeRouteTrack(track: VehicleTrackLike | undefined): VehicleTrackContract | undefined {
  if (!track) return undefined
  if ('points' in track) {
    return {
      id: track.id,
      loop: track.loop,
      points: track.points.map((point) => ({ ...point })),
    }
  }
  return {
    id: track.trackId,
    loop: track.looped,
    points: track.waypoints.map((point) => ({ ...point })),
  }
}

function cloneRouteTrack(track: VehicleTrackLike | undefined): VehicleTrackContract | undefined {
  const normalized = normalizeRouteTrack(track)
  if (!normalized) return undefined
  return track
    ? {
        id: normalized.id,
        loop: normalized.loop,
        points: normalized.points.map((point) => ({ ...point })),
      }
    : undefined
}

function normalizeTrackPosition(route: VehicleRouteLike | undefined): VehicleRouteContract | undefined {
  if (!route) return undefined
  if ('target' in route || 'direction' in route) {
    return {
      trackId: route.trackId,
      segmentIndex: route.segmentIndex,
      segmentProgress: route.segmentProgress,
      ...(route.target ? { target: { ...route.target } } : {}),
      ...(route.direction ? { direction: route.direction } : {}),
    }
  }
  return {
    trackId: route.trackId,
    segmentIndex: route.segmentIndex,
    segmentProgress: route.segmentProgress,
  }
}

function cloneTrackPosition(route: VehicleRouteLike | undefined): VehicleRouteContract | undefined {
  const normalized = normalizeTrackPosition(route)
  if (!normalized) return undefined
  return {
    trackId: normalized.trackId,
    segmentIndex: normalized.segmentIndex,
    segmentProgress: normalized.segmentProgress,
    ...(normalized.target ? { target: { ...normalized.target } } : {}),
    ...(normalized.direction ? { direction: normalized.direction } : {}),
  }
}

function routeTrackEquals(
  left: VehicleTrackLike | undefined,
  right: VehicleTrackLike | undefined
) {
  const normalizedLeft = normalizeRouteTrack(left)
  const normalizedRight = normalizeRouteTrack(right)
  if (!normalizedLeft && !normalizedRight) return true
  if (!normalizedLeft || !normalizedRight) return false
  if (
    normalizedLeft.id !== normalizedRight.id ||
    normalizedLeft.loop !== normalizedRight.loop ||
    normalizedLeft.points.length !== normalizedRight.points.length
  ) {
    return false
  }
  for (let index = 0; index < normalizedLeft.points.length; index += 1) {
    const leftPoint = normalizedLeft.points[index]
    const rightPoint = normalizedRight.points[index]
    if (
      !rightPoint ||
      leftPoint.x !== rightPoint.x ||
      leftPoint.y !== rightPoint.y ||
      leftPoint.z !== rightPoint.z
    ) {
      return false
    }
  }
  return true
}

function trackPositionEquals(
  left: VehicleRouteLike | undefined,
  right: VehicleRouteLike | undefined
) {
  const normalizedLeft = normalizeTrackPosition(left)
  const normalizedRight = normalizeTrackPosition(right)
  if (!normalizedLeft && !normalizedRight) return true
  if (!normalizedLeft || !normalizedRight) return false
  if (
    normalizedLeft.trackId !== normalizedRight.trackId ||
    normalizedLeft.segmentIndex !== normalizedRight.segmentIndex ||
    normalizedLeft.segmentProgress !== normalizedRight.segmentProgress ||
    normalizedLeft.direction !== normalizedRight.direction
  ) {
    return false
  }
  if (!normalizedLeft.target && !normalizedRight.target) return true
  if (!normalizedLeft.target || !normalizedRight.target) return false
  return (
    normalizedLeft.target.x === normalizedRight.target.x &&
    normalizedLeft.target.y === normalizedRight.target.y &&
    normalizedLeft.target.z === normalizedRight.target.z
  )
}

function vectorEquals(left: Vector3, right: Vector3) {
  return left.x === right.x && left.y === right.y && left.z === right.z
}

function flatRecordEquals(
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined
) {
  const leftEntries = Object.entries(left ?? {})
  const rightEntries = Object.entries(right ?? {})
  if (leftEntries.length !== rightEntries.length) return false
  return leftEntries.every(([key, value]) => right?.[key] === value)
}

function toCreatePayload(entity: Entity): EcsCreatePayload {
  const payload: EcsCreatePayload = {
    id: entity.id,
    entityType: entity.type,
    name: entity.name,
    position: entity.position,
    rotation: entity.rotation,
    scale: entity.scale,
    status: entity.status,
    visible: entity.visible,
    metadata: { ...entity.metadata },
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  }

  if (entity.type === 'person') {
    payload.role = entity.role
    payload.department = entity.department
    payload.currentActivity = entity.currentActivity
    payload.avatar = entity.avatar
    payload.schedule = cloneTimeRanges(entity.schedule)
    return payload
  }

  if (entity.type === 'vehicle') {
    payload.plateNumber = entity.plateNumber
    payload.vehicleType = entity.vehicleType
    payload.heading = entity.heading
    payload.speed = entity.speed
    payload.capacity = entity.capacity
    payload.currentLoad = entity.currentLoad
    payload.routeTrack = cloneRouteTrack(entity.routeTrack)
    payload.trackPosition = cloneTrackPosition(entity.trackPosition)
    return payload
  }

  if (entity.type === 'equipment') {
    payload.modelId = entity.modelId
    payload.modelUrl = entity.modelUrl
    payload.parameters = { ...entity.parameters }
    payload.alarms = cloneAlarms(entity.alarms)
    payload.maintenanceSchedule = cloneTimeRanges(entity.maintenanceSchedule)
    return payload
  }

  if (entity.type === 'sensor') {
    payload.sensorType = entity.sensorType
    payload.unit = entity.unit
    payload.reading = entity.reading
    payload.thresholdMin = entity.thresholdMin
    payload.thresholdMax = entity.thresholdMax
    return payload
  }

  if (entity.type === 'camera') {
    payload.cameraType = entity.cameraType
    payload.streamUrl = entity.streamUrl
    payload.fov = entity.fov
    payload.heading = entity.heading
    payload.range = entity.range
    payload.recording = entity.recording
    return payload
  }

  if (entity.type === 'dynamic') {
    payload.archetypeId = entity.archetypeId
    payload.categoryKey = entity.categoryKey
    payload.attributes = { ...entity.attributes }
    payload.displayAttributes = { ...entity.displayAttributes }
    return payload
  }

  payload.zoneType = entity.zoneType
  payload.boundary = cloneBoundary(entity.boundary)
  payload.color = entity.color
  payload.accessRules = cloneAccessRules(entity.accessRules)
  payload.capacity = entity.capacity
  payload.currentOccupancy = entity.currentOccupancy
  return payload
}

function snapshotToEntity(snapshot: EcsEntitySnapshot): Entity {
  const createdAt = snapshot.createdAt
  const updatedAt = snapshot.updatedAt
  if (snapshot.type === 'person') {
    return {
      id: snapshot.id,
      type: 'person',
      name: snapshot.name,
      position: snapshot.position,
      rotation: snapshot.rotation,
      scale: snapshot.scale,
      status: snapshot.status,
      visible: snapshot.visible,
      metadata: { ...snapshot.metadata },
      createdAt,
      updatedAt,
      role: snapshot.role ?? '员工',
      department: snapshot.department ?? '未知部门',
      avatar: snapshot.avatar,
      schedule: cloneTimeRanges(snapshot.schedule) ?? [],
      currentActivity: snapshot.currentActivity,
      labelMode: snapshot.labelMode,
    }
  }

  if (snapshot.type === 'vehicle') {
    return {
      id: snapshot.id,
      type: 'vehicle',
      name: snapshot.name,
      position: snapshot.position,
      rotation: snapshot.rotation,
      scale: snapshot.scale,
      status: snapshot.status,
      visible: snapshot.visible,
      metadata: { ...snapshot.metadata },
      createdAt,
      updatedAt,
      plateNumber: snapshot.plateNumber ?? '未登记',
      vehicleType: snapshot.vehicleType ?? 'other',
      speed: snapshot.speed ?? 0,
      heading: snapshot.heading ?? 0,
      capacity: snapshot.capacity,
      currentLoad: snapshot.currentLoad,
      routeTrack: cloneRouteTrack(snapshot.routeTrack),
      trackPosition: cloneTrackPosition(snapshot.trackPosition),
      labelMode: snapshot.labelMode,
    }
  }

  if (snapshot.type === 'equipment') {
    return {
      id: snapshot.id,
      type: 'equipment',
      name: snapshot.name,
      position: snapshot.position,
      rotation: snapshot.rotation,
      scale: snapshot.scale,
      status: snapshot.status,
      visible: snapshot.visible,
      metadata: { ...snapshot.metadata },
      createdAt,
      updatedAt,
      modelId: snapshot.modelId,
      modelUrl: snapshot.modelUrl,
      parameters: { ...(snapshot.parameters ?? {}) },
      alarms: cloneAlarms(snapshot.alarms) ?? [],
      maintenanceSchedule: cloneTimeRanges(snapshot.maintenanceSchedule),
      labelMode: snapshot.labelMode,
    }
  }

  if (snapshot.type === 'sensor') {
    return {
      id: snapshot.id,
      type: 'sensor',
      name: snapshot.name,
      position: snapshot.position,
      rotation: snapshot.rotation,
      scale: snapshot.scale,
      status: snapshot.status,
      visible: snapshot.visible,
      metadata: { ...snapshot.metadata },
      createdAt,
      updatedAt,
      sensorType: snapshot.sensorType ?? 'other',
      unit: snapshot.unit ?? '',
      reading: snapshot.reading ?? 0,
      thresholdMin: snapshot.thresholdMin,
      thresholdMax: snapshot.thresholdMax,
      labelMode: snapshot.labelMode,
    }
  }

  if (snapshot.type === 'camera') {
    return {
      id: snapshot.id,
      type: 'camera',
      name: snapshot.name,
      position: snapshot.position,
      rotation: snapshot.rotation,
      scale: snapshot.scale,
      status: snapshot.status,
      visible: snapshot.visible,
      metadata: { ...snapshot.metadata },
      createdAt,
      updatedAt,
      cameraType: snapshot.cameraType ?? 'fixed',
      streamUrl: snapshot.streamUrl,
      fov: snapshot.fov ?? 75,
      heading: snapshot.heading ?? 0,
      range: snapshot.range,
      recording: snapshot.recording ?? true,
      labelMode: snapshot.labelMode,
    }
  }

  if (snapshot.type === 'dynamic') {
    return {
      id: snapshot.id,
      type: 'dynamic',
      name: snapshot.name,
      position: snapshot.position,
      rotation: snapshot.rotation,
      scale: snapshot.scale,
      status: snapshot.status,
      visible: snapshot.visible,
      metadata: { ...snapshot.metadata },
      createdAt,
      updatedAt,
      archetypeId: snapshot.archetypeId ?? '',
      categoryKey: snapshot.categoryKey ?? '',
      attributes: { ...(snapshot.attributes ?? {}) },
      displayAttributes: { ...(snapshot.displayAttributes ?? {}) },
      labelMode: snapshot.labelMode,
    }
  }

  return {
    id: snapshot.id,
    type: 'zone',
    name: snapshot.name,
    position: snapshot.position,
    rotation: snapshot.rotation,
    scale: snapshot.scale,
    status: snapshot.status,
    visible: snapshot.visible,
    metadata: { ...snapshot.metadata },
    createdAt,
    updatedAt,
    boundary: cloneBoundary(snapshot.boundary) ?? [],
    zoneType: (snapshot.zoneType as ZoneEntity['zoneType']) ?? 'custom',
    color: snapshot.color ?? String(snapshot.metadata.color ?? '#60a5fa'),
    accessRules: cloneAccessRules(snapshot.accessRules) ?? [],
    capacity: snapshot.capacity,
    currentOccupancy: snapshot.currentOccupancy,
    labelMode: snapshot.labelMode,
  }
}

function canReuseProjectedEntity(previous: Entity, snapshot: EcsEntitySnapshot): boolean {
  if (previous.type !== snapshot.type) return false
  if (previous.name !== snapshot.name) return false
  if (previous.status !== snapshot.status) return false
  if (previous.visible !== snapshot.visible) return false
  if ((previous.labelMode ?? 'html') !== snapshot.labelMode) return false
  if (!vectorEquals(previous.position, snapshot.position)) return false
  if (!vectorEquals(previous.rotation, snapshot.rotation)) return false
  if (!vectorEquals(previous.scale, snapshot.scale)) return false
  if (previous.createdAt !== snapshot.createdAt) return false
  if (previous.updatedAt !== snapshot.updatedAt) return false

  if (snapshot.type === 'person') {
    const entity = previous
    if (entity.type !== 'person') return false
    const nextSchedule = snapshot.schedule ?? []
    if (entity.schedule.length !== nextSchedule.length) return false
    for (let i = 0; i < nextSchedule.length; i += 1) {
      const prevRange = entity.schedule[i]
      const nextRange = nextSchedule[i]
      if (!prevRange) return false
      if (
        prevRange.start !== nextRange.start ||
        prevRange.end !== nextRange.end ||
        prevRange.label !== nextRange.label
      ) {
        return false
      }
    }
    return (
      entity.role === (snapshot.role ?? entity.role) &&
      entity.department === (snapshot.department ?? entity.department) &&
      entity.currentActivity === snapshot.currentActivity &&
      entity.avatar === snapshot.avatar
    )
  }

  if (snapshot.type === 'vehicle') {
    const entity = previous
    return entity.type === 'vehicle'
      && entity.speed === (snapshot.speed ?? entity.speed)
      && entity.heading === (snapshot.heading ?? entity.heading)
      && entity.plateNumber === (snapshot.plateNumber ?? entity.plateNumber)
      && entity.vehicleType === (snapshot.vehicleType ?? entity.vehicleType)
      && entity.capacity === snapshot.capacity
      && entity.currentLoad === snapshot.currentLoad
      && routeTrackEquals(entity.routeTrack, snapshot.routeTrack)
      && trackPositionEquals(entity.trackPosition, snapshot.trackPosition)
  }

  if (snapshot.type === 'equipment') {
    const entity = previous
    if (entity.type !== 'equipment') return false
    const nextParameters = snapshot.parameters ?? {}
    const prevKeys = Object.keys(entity.parameters)
    const nextKeys = Object.keys(nextParameters)
    if (prevKeys.length !== nextKeys.length) return false
    for (const key of nextKeys) {
      if (entity.parameters[key] !== nextParameters[key]) return false
    }
    if (entity.modelId !== snapshot.modelId) return false
    if (entity.modelUrl !== snapshot.modelUrl) return false
    const nextSchedule = snapshot.maintenanceSchedule ?? []
    const prevSchedule = entity.maintenanceSchedule ?? []
    if (nextSchedule.length !== prevSchedule.length) return false
    for (let i = 0; i < nextSchedule.length; i += 1) {
      const prevRange = prevSchedule[i]
      const nextRange = nextSchedule[i]
      if (!prevRange) return false
      if (
        prevRange.start !== nextRange.start ||
        prevRange.end !== nextRange.end ||
        prevRange.label !== nextRange.label
      ) {
        return false
      }
    }
    const nextAlarms = snapshot.alarms ?? []
    if (entity.alarms.length !== nextAlarms.length) return false
    for (let i = 0; i < nextAlarms.length; i += 1) {
      const prevAlarm = entity.alarms[i]
      const nextAlarm = nextAlarms[i]
      if (!prevAlarm) return false
      if (
        prevAlarm.id !== nextAlarm.id ||
        prevAlarm.level !== nextAlarm.level ||
        prevAlarm.message !== nextAlarm.message ||
        prevAlarm.timestamp !== nextAlarm.timestamp ||
        prevAlarm.acknowledged !== nextAlarm.acknowledged
      ) {
        return false
      }
    }
    return true
  }

  if (snapshot.type === 'sensor') {
    return previous.type === 'sensor'
      && previous.sensorType === (snapshot.sensorType ?? previous.sensorType)
      && previous.unit === (snapshot.unit ?? previous.unit)
      && previous.reading === (snapshot.reading ?? previous.reading)
      && previous.thresholdMin === snapshot.thresholdMin
      && previous.thresholdMax === snapshot.thresholdMax
  }

  if (snapshot.type === 'camera') {
    return previous.type === 'camera'
      && previous.cameraType === (snapshot.cameraType ?? previous.cameraType)
      && previous.streamUrl === snapshot.streamUrl
      && previous.fov === (snapshot.fov ?? previous.fov)
      && previous.heading === (snapshot.heading ?? previous.heading)
      && previous.range === snapshot.range
      && previous.recording === (snapshot.recording ?? previous.recording)
  }

  if (snapshot.type === 'dynamic') {
    return previous.type === 'dynamic'
      && previous.archetypeId === (snapshot.archetypeId ?? previous.archetypeId)
      && previous.categoryKey === (snapshot.categoryKey ?? previous.categoryKey)
      && flatRecordEquals(previous.attributes, snapshot.attributes)
      && flatRecordEquals(previous.displayAttributes, snapshot.displayAttributes)
  }

  const entity = previous
  if (entity.type !== 'zone') return false
  if (entity.zoneType !== ((snapshot.zoneType as ZoneEntity['zoneType']) ?? entity.zoneType)) return false
  const snapshotColor = snapshot.color ?? String(snapshot.metadata.color ?? entity.color)
  if (entity.color !== snapshotColor) return false
  if (entity.capacity !== snapshot.capacity) return false
  if (entity.currentOccupancy !== snapshot.currentOccupancy) return false
  const nextRules = snapshot.accessRules ?? []
  if (entity.accessRules.length !== nextRules.length) return false
  for (let i = 0; i < nextRules.length; i += 1) {
    const prevRule = entity.accessRules[i]
    const nextRule = nextRules[i]
    if (!prevRule) return false
    if (
      prevRule.id !== nextRule.id ||
      prevRule.action !== nextRule.action ||
      prevRule.allowedRoles.length !== nextRule.allowedRoles.length ||
      prevRule.allowedDepartments.length !== nextRule.allowedDepartments.length ||
      prevRule.timeRanges.length !== nextRule.timeRanges.length
    ) {
      return false
    }
    for (let j = 0; j < nextRule.allowedRoles.length; j += 1) {
      if (prevRule.allowedRoles[j] !== nextRule.allowedRoles[j]) return false
    }
    for (let j = 0; j < nextRule.allowedDepartments.length; j += 1) {
      if (prevRule.allowedDepartments[j] !== nextRule.allowedDepartments[j]) return false
    }
    for (let j = 0; j < nextRule.timeRanges.length; j += 1) {
      const prevRange = prevRule.timeRanges[j]
      const nextRange = nextRule.timeRanges[j]
      if (!prevRange) return false
      if (
        prevRange.start !== nextRange.start ||
        prevRange.end !== nextRange.end ||
        prevRange.label !== nextRange.label
      ) {
        return false
      }
    }
  }
  const nextBoundary = snapshot.boundary ?? []
  if (entity.boundary.length !== nextBoundary.length) return false
  for (let i = 0; i < nextBoundary.length; i += 1) {
    const prevPoint = entity.boundary[i]
    const nextPoint = nextBoundary[i]
    if (prevPoint.x !== nextPoint.x || prevPoint.y !== nextPoint.y || prevPoint.z !== nextPoint.z) {
      return false
    }
  }
  return true
}

interface BuildEntityMapOptions {
  previous?: Map<string, Entity>
}

interface BuildEntityDirectoryOptions {
  previous?: Map<string, EntityDirectoryEntry>
  getCategoryPresentation?: (key: string) => EntityCategoryPresentation
  getDynamicPresentation?: (entity: Pick<DynamicEntity, 'archetypeId' | 'categoryKey'>) => DynamicEntityPresentation
}

function sameEntityArray<T extends Entity>(
  previous: T[] | undefined,
  next: T[]
): previous is T[] {
  if (!previous || previous.length !== next.length) return false
  for (let index = 0; index < next.length; index += 1) {
    if (previous[index] !== next[index]) return false
  }
  return true
}

function getBucketKey(entity: Entity): keyof EntityBuckets {
  switch (entity.type) {
    case 'person':
      return 'persons'
    case 'vehicle':
      return 'vehicles'
    case 'equipment':
      return 'equipment'
    case 'sensor':
      return 'sensors'
    case 'camera':
      return 'cameras'
    case 'zone':
      return 'zones'
    case 'dynamic':
      return 'dynamic'
  }
}

function projectEntitySnapshot(
  snapshot: EcsEntitySnapshot,
  previousEntity?: Entity,
  forceProject = false
) {
  if (!forceProject && previousEntity && canReuseProjectedEntity(previousEntity, snapshot)) {
    return previousEntity
  }

  return snapshotToEntity(snapshot)
}

function projectEntityDirectoryEntry(
  snapshot: EcsEntitySnapshot,
  getCategoryPresentation?: (key: string) => EntityCategoryPresentation,
  getDynamicPresentation?: (entity: Pick<DynamicEntity, 'archetypeId' | 'categoryKey'>) => DynamicEntityPresentation
): EntityDirectoryEntry {
  const categoryPresentation = snapshot.categoryKey
    ? getCategoryPresentation?.(snapshot.categoryKey)
    : undefined
  const dynamicPresentation =
    snapshot.type === 'dynamic' && snapshot.archetypeId && snapshot.categoryKey
      ? getDynamicPresentation?.({
          archetypeId: snapshot.archetypeId,
          categoryKey: snapshot.categoryKey,
        })
      : undefined
  return {
    id: snapshot.id,
    type: snapshot.type,
    name: snapshot.name,
    status: snapshot.status,
    visible: snapshot.visible,
    ...(snapshot.categoryKey ? { categoryKey: snapshot.categoryKey } : {}),
    ...(snapshot.categoryKey
      ? {
          categoryLabel: categoryPresentation?.displayName ?? snapshot.categoryKey,
          categorySortOrder: categoryPresentation?.sortOrder ?? 0,
          ...(categoryPresentation?.color ? { categoryColor: categoryPresentation.color } : {}),
        }
      : {}),
    ...(snapshot.type === 'dynamic' && dynamicPresentation
      ? {
          archetypeLabel: dynamicPresentation.archetypeLabel,
          secondaryLabel:
            dynamicPresentation.categoryLabel && dynamicPresentation.archetypeLabel
              ? `${dynamicPresentation.categoryLabel} · ${dynamicPresentation.archetypeLabel}`
              : dynamicPresentation.categoryLabel || dynamicPresentation.archetypeLabel,
        }
      : {}),
  }
}

function canReuseEntityDirectoryEntry(
  previousEntry: EntityDirectoryEntry | undefined,
  snapshot: EcsEntitySnapshot,
  getCategoryPresentation?: (key: string) => EntityCategoryPresentation,
  getDynamicPresentation?: (entity: Pick<DynamicEntity, 'archetypeId' | 'categoryKey'>) => DynamicEntityPresentation
): previousEntry is EntityDirectoryEntry {
  const categoryPresentation = snapshot.categoryKey
    ? getCategoryPresentation?.(snapshot.categoryKey)
    : undefined
  const dynamicPresentation =
    snapshot.type === 'dynamic' && snapshot.archetypeId && snapshot.categoryKey
      ? getDynamicPresentation?.({
          archetypeId: snapshot.archetypeId,
          categoryKey: snapshot.categoryKey,
        })
      : undefined
  return (
    !!previousEntry &&
    previousEntry.type === snapshot.type &&
    previousEntry.name === snapshot.name &&
    previousEntry.status === snapshot.status &&
    previousEntry.visible === snapshot.visible &&
    previousEntry.categoryKey === snapshot.categoryKey &&
    previousEntry.categoryLabel ===
      (snapshot.categoryKey ? categoryPresentation?.displayName ?? snapshot.categoryKey : undefined) &&
    previousEntry.categorySortOrder ===
      (snapshot.categoryKey ? categoryPresentation?.sortOrder ?? 0 : undefined) &&
    previousEntry.categoryColor ===
      (snapshot.categoryKey ? categoryPresentation?.color : undefined) &&
    previousEntry.archetypeLabel ===
      (snapshot.type === 'dynamic' ? dynamicPresentation?.archetypeLabel : undefined) &&
    previousEntry.secondaryLabel ===
      (snapshot.type === 'dynamic' && dynamicPresentation
        ? dynamicPresentation.categoryLabel && dynamicPresentation.archetypeLabel
          ? `${dynamicPresentation.categoryLabel} · ${dynamicPresentation.archetypeLabel}`
          : dynamicPresentation.categoryLabel || dynamicPresentation.archetypeLabel
        : undefined)
  )
}

function buildEntityMapFromWorld(options: BuildEntityMapOptions = {}): Map<string, Entity> {
  const next = new Map<string, Entity>()
  const previous = options.previous
  ecsWorld.snapshotById.forEach((snapshot, id) => {
    const forceProject = snapshot.labelMode === 'html'
    const previousEntity = previous?.get(id)

    next.set(id, projectEntitySnapshot(snapshot, previousEntity, forceProject))
  })
  if (!previous || previous.size !== next.size) return next
  for (const [id, entity] of next) {
    if (previous.get(id) !== entity) return next
  }
  return previous
}

function patchProjectedEntities(
  previous: Map<string, Entity>,
  ids: Array<string | null | undefined>,
  forceProject = false
): Map<string, Entity> {
  const uniqueIds = new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))
  if (uniqueIds.size === 0) return previous

  let next = previous

  uniqueIds.forEach((id) => {
    const snapshot = ecsWorld.snapshotById.get(id)
    const previousEntity = previous.get(id)

    if (!snapshot) {
      if (!previous.has(id)) return
      if (next === previous) next = new Map(previous)
      next.delete(id)
      return
    }

    const projected = projectEntitySnapshot(
      snapshot,
      previousEntity,
      forceProject || snapshot.labelMode === 'html'
    )
    if (next === previous) next = new Map(previous)
    next.set(id, projected)
  })

  return next
}

function buildEntityDirectoryFromWorld(
  options: BuildEntityDirectoryOptions = {}
): Map<string, EntityDirectoryEntry> {
  const previous = options.previous
  const next = new Map<string, EntityDirectoryEntry>()

  ecsWorld.snapshotById.forEach((snapshot, id) => {
    const previousEntry = previous?.get(id)
    if (
      canReuseEntityDirectoryEntry(
        previousEntry,
        snapshot,
        options.getCategoryPresentation,
        options.getDynamicPresentation
      )
    ) {
      next.set(id, previousEntry)
      return
    }

    next.set(
      id,
      projectEntityDirectoryEntry(
        snapshot,
        options.getCategoryPresentation,
        options.getDynamicPresentation
      )
    )
  })

  if (!previous || previous.size !== next.size) return next
  for (const [id, entry] of next) {
    if (previous.get(id) !== entry) return next
  }
  return previous
}

function buildEntityBucketsFromEntities(
  entities: Map<string, Entity>,
  previous?: EntityBuckets
): EntityBuckets {
  const nextPersons: PersonEntity[] = []
  const nextVehicles: VehicleEntity[] = []
  const nextEquipment: EquipmentEntity[] = []
  const nextSensors: SensorEntity[] = []
  const nextCameras: CameraEntity[] = []
  const nextZones: ZoneEntity[] = []
  const nextDynamic: DynamicEntity[] = []

  entities.forEach((entity) => {
    switch (entity.type) {
      case 'person':
        nextPersons.push(entity)
        break
      case 'vehicle':
        nextVehicles.push(entity)
        break
      case 'equipment':
        nextEquipment.push(entity)
        break
      case 'sensor':
        nextSensors.push(entity)
        break
      case 'camera':
        nextCameras.push(entity)
        break
      case 'zone':
        nextZones.push(entity)
        break
      case 'dynamic':
        nextDynamic.push(entity)
        break
    }
  })

  if (!previous) {
    return {
      persons: nextPersons,
      vehicles: nextVehicles,
      equipment: nextEquipment,
      sensors: nextSensors,
      cameras: nextCameras,
      zones: nextZones,
      dynamic: nextDynamic,
    }
  }

  const persons = sameEntityArray(previous.persons, nextPersons) ? previous.persons : nextPersons
  const vehicles = sameEntityArray(previous.vehicles, nextVehicles) ? previous.vehicles : nextVehicles
  const equipment = sameEntityArray(previous.equipment, nextEquipment) ? previous.equipment : nextEquipment
  const sensors = sameEntityArray(previous.sensors, nextSensors) ? previous.sensors : nextSensors
  const cameras = sameEntityArray(previous.cameras, nextCameras) ? previous.cameras : nextCameras
  const zones = sameEntityArray(previous.zones, nextZones) ? previous.zones : nextZones
  const dynamic = sameEntityArray(previous.dynamic, nextDynamic) ? previous.dynamic : nextDynamic

  if (
    persons === previous.persons &&
    vehicles === previous.vehicles &&
    equipment === previous.equipment &&
    sensors === previous.sensors &&
    cameras === previous.cameras &&
    zones === previous.zones &&
    dynamic === previous.dynamic
  ) {
    return previous
  }

  return {
    persons,
    vehicles,
    equipment,
    sensors,
    cameras,
    zones,
    dynamic,
  }
}

function patchEntityBuckets(
  previousBuckets: EntityBuckets,
  previousEntities: Map<string, Entity>,
  nextEntities: Map<string, Entity>,
  ids: Array<string | null | undefined>
): EntityBuckets {
  const uniqueIds = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
  if (uniqueIds.length === 0 || nextEntities === previousEntities) return previousBuckets

  let nextBuckets = previousBuckets
  const idsByBucket = new Map<keyof EntityBuckets, string[]>()

  for (const id of uniqueIds) {
    const previousEntity = previousEntities.get(id)
    const nextEntity = nextEntities.get(id)

    if (!previousEntity || !nextEntity || previousEntity.type !== nextEntity.type) {
      return buildEntityBucketsFromEntities(nextEntities, previousBuckets)
    }

    const bucketKey = getBucketKey(nextEntity)
    const bucketIds = idsByBucket.get(bucketKey)
    if (bucketIds) {
      bucketIds.push(id)
    } else {
      idsByBucket.set(bucketKey, [id])
    }
  }

  for (const [bucketKey, bucketIds] of idsByBucket) {
    const previousBucket = previousBuckets[bucketKey]
    const entityIndexById = new Map(previousBucket.map((entity, index) => [entity.id, index]))
    let nextBucket = previousBucket

    for (const id of bucketIds) {
      const nextEntity = nextEntities.get(id)
      if (!nextEntity) {
        return buildEntityBucketsFromEntities(nextEntities, previousBuckets)
      }

      const entityIndex = entityIndexById.get(id)
      if (entityIndex === undefined) {
        return buildEntityBucketsFromEntities(nextEntities, previousBuckets)
      }

      if (previousBucket[entityIndex] === nextEntity) continue

      if (nextBuckets === previousBuckets) {
        nextBuckets = {
          persons: previousBuckets.persons,
          vehicles: previousBuckets.vehicles,
          equipment: previousBuckets.equipment,
          sensors: previousBuckets.sensors,
          cameras: previousBuckets.cameras,
          zones: previousBuckets.zones,
          dynamic: previousBuckets.dynamic,
        }
      }

      if (nextBucket === previousBucket) {
        nextBucket = previousBucket.slice()
      }

      nextBucket[entityIndex] = nextEntity
    }

    if (nextBucket === previousBucket) continue

    switch (bucketKey) {
      case 'persons':
        nextBuckets.persons = nextBucket as PersonEntity[]
        break
      case 'vehicles':
        nextBuckets.vehicles = nextBucket as VehicleEntity[]
        break
      case 'equipment':
        nextBuckets.equipment = nextBucket as EquipmentEntity[]
        break
      case 'sensors':
        nextBuckets.sensors = nextBucket as SensorEntity[]
        break
      case 'cameras':
        nextBuckets.cameras = nextBucket as CameraEntity[]
        break
      case 'zones':
        nextBuckets.zones = nextBucket as ZoneEntity[]
        break
      case 'dynamic':
        nextBuckets.dynamic = nextBucket as DynamicEntity[]
        break
    }
  }

  return nextBuckets
}

function patchEntityDirectory(
  previous: Map<string, EntityDirectoryEntry>,
  ids: Array<string | null | undefined>,
  getCategoryPresentation?: (key: string) => EntityCategoryPresentation,
  getDynamicPresentation?: (entity: Pick<DynamicEntity, 'archetypeId' | 'categoryKey'>) => DynamicEntityPresentation
): Map<string, EntityDirectoryEntry> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
  if (uniqueIds.length === 0) return previous

  let next = previous

  for (const id of uniqueIds) {
    const snapshot = ecsWorld.snapshotById.get(id)
    const previousEntry = previous.get(id)

    if (!snapshot) {
      if (!previousEntry) continue
      if (next === previous) next = new Map(previous)
      next.delete(id)
      continue
    }

    if (canReuseEntityDirectoryEntry(previousEntry, snapshot, getCategoryPresentation, getDynamicPresentation)) {
      continue
    }

    if (next === previous) next = new Map(previous)
    next.set(id, projectEntityDirectoryEntry(snapshot, getCategoryPresentation, getDynamicPresentation))
  }

  return next
}

function patchPublishedEntityState(options: {
  previousEntities: Map<string, Entity>
  previousBuckets: EntityBuckets
  previousDirectory: Map<string, EntityDirectoryEntry>
  ids: Array<string | null | undefined>
  getCategoryPresentation?: (key: string) => EntityCategoryPresentation
  getDynamicPresentation?: (entity: Pick<DynamicEntity, 'archetypeId' | 'categoryKey'>) => DynamicEntityPresentation
}) {
  const entities = patchProjectedEntities(options.previousEntities, options.ids)

  return {
    entities,
    entityBuckets: patchEntityBuckets(
      options.previousBuckets,
      options.previousEntities,
      entities,
      options.ids
    ),
    entityDirectory: patchEntityDirectory(
      options.previousDirectory,
      options.ids,
      options.getCategoryPresentation,
      options.getDynamicPresentation
    ),
  }
}

function buildPublishedEntityState(options: {
  previousEntities?: Map<string, Entity>
  previousBuckets?: EntityBuckets
  previousDirectory?: Map<string, EntityDirectoryEntry>
  getCategoryPresentation?: (key: string) => EntityCategoryPresentation
  getDynamicPresentation?: (entity: Pick<DynamicEntity, 'archetypeId' | 'categoryKey'>) => DynamicEntityPresentation
}) {
  const entities = buildEntityMapFromWorld({
    previous: options.previousEntities,
  })

  return {
    entities,
    entityBuckets: buildEntityBucketsFromEntities(entities, options.previousBuckets),
    entityDirectory: buildEntityDirectoryFromWorld({
      previous: options.previousDirectory,
      getCategoryPresentation: options.getCategoryPresentation,
      getDynamicPresentation: options.getDynamicPresentation,
    }),
  }
}

function appendTrajectoryPoint(
  trajectories: Map<string, EntityTrajectory>,
  entityId: string,
  point: { position: Vector3; timestamp: number }
) {
  const existing = trajectories.get(entityId)
  const trajectory = existing || { entityId, points: [] }
  trajectory.points.push(point)
  if (trajectory.points.length > 1000) {
    trajectory.points = trajectory.points.slice(-1000)
  }

  // Refresh insertion order to keep LRU-like eviction behavior.
  if (existing) {
    trajectories.delete(entityId)
  }
  trajectories.set(entityId, trajectory)

  while (trajectories.size > MAX_TRAJECTORY_ENTITIES) {
    const oldestKey = trajectories.keys().next().value as string | undefined
    if (!oldestKey) break
    trajectories.delete(oldestKey)
  }
}

function applyLabelLod(profile: QualityProfile, cameraPosition: Vector3): {
  visibleLabels: number
  htmlLabels: number
  changedIds: string[]
} {
  const config = getLabelConfig(profile)

  let htmlIndex = 0
  let visibleLabels = 0
  const changedIds: string[] = []

  for (const snapshot of ecsWorld.snapshotById.values()) {
    const distance = Math.hypot(
      snapshot.position.x - cameraPosition.x,
      snapshot.position.y - cameraPosition.y,
      snapshot.position.z - cameraPosition.z
    )

    const mode = resolveLabelMode({
      distance,
      isSelected: ecsWorld.selectedId === snapshot.id,
      isHovered: ecsWorld.hoveredId === snapshot.id,
      htmlDistance: config.htmlDistance,
      spriteDistance: config.spriteDistance,
      maxHtmlLabels: config.maxHtmlLabels,
      htmlLabelIndex: htmlIndex,
    })

    if (mode === 'html') htmlIndex += 1
    if (mode !== 'hidden') visibleLabels += 1

    if (snapshot.labelMode !== mode) {
      snapshot.labelMode = mode
      LabelComponent.mode[snapshot.eid] = LABEL_MODE_TO_CODE[mode]
      changedIds.push(snapshot.id)
    }
  }

  return {
    visibleLabels,
    htmlLabels: htmlIndex,
    changedIds,
  }
}

const CAMERA_FOCUS_HORIZONTAL_DISTANCE = 18
const CAMERA_FOCUS_VERTICAL_DISTANCE = 10
const CAMERA_FOCUS_MIN_HORIZONTAL_DISTANCE = 8
const CAMERA_FOCUS_MIN_VERTICAL_DISTANCE = 6

function isZeroVector(vector: Vector3) {
  return vector.x === 0 && vector.y === 0 && vector.z === 0
}

function buildCameraFocusRequest(
  entity: Entity,
  currentCamera: Vector3,
  fallbackCamera: Vector3
): CameraFocusRequest {
  const targetHeight = entity.type === 'zone'
    ? 1.5
    : Math.max(entity.scale.y * 0.9, 1.8)
  const target = {
    x: entity.position.x,
    y: entity.position.y + targetHeight,
    z: entity.position.z,
  }
  const sourceCamera = isZeroVector(currentCamera) ? fallbackCamera : currentCamera
  let offsetX = sourceCamera.x - target.x
  let offsetZ = sourceCamera.z - target.z
  const horizontalDistance = Math.hypot(offsetX, offsetZ)

  if (horizontalDistance < CAMERA_FOCUS_MIN_HORIZONTAL_DISTANCE) {
    offsetX = CAMERA_FOCUS_HORIZONTAL_DISTANCE * 0.72
    offsetZ = CAMERA_FOCUS_HORIZONTAL_DISTANCE * 0.72
  } else {
    const scale = CAMERA_FOCUS_HORIZONTAL_DISTANCE / horizontalDistance
    offsetX *= scale
    offsetZ *= scale
  }

  const sourceVerticalDistance = sourceCamera.y - target.y
  const verticalDistance = Math.max(
    CAMERA_FOCUS_MIN_VERTICAL_DISTANCE,
    Math.min(
      CAMERA_FOCUS_VERTICAL_DISTANCE,
      sourceVerticalDistance > 0 ? sourceVerticalDistance : CAMERA_FOCUS_VERTICAL_DISTANCE
    )
  )

  return {
    position: {
      x: target.x + offsetX,
      y: target.y + verticalDistance,
      z: target.z + offsetZ,
    },
    target,
  }
}

export const useDigitalTwinStore = create<DigitalTwinState & DigitalTwinActions>()(
  subscribeWithSelector((set, get) => {
    let lastMetricsAt = 0
    let lastLabelLodAt = 0
    let lastEntityPublishAt = 0
    let lastRealtimeEntityPublishAt = 0
    let lastEquipmentSimulationAt = 0
    let lastHtmlLabelCount = 0
    let smoothFramesStreak = 0
    let fixedTickCount = 0
    const frameTimes: number[] = []
    let latestCamera: Vector3 = { x: 0, y: 0, z: 0 }
    let latestCameraTarget: Vector3 | null = null
    let latestDrawCalls = 0

    function syncImmediateLabelLod() {
      const labelState = applyLabelLod(get().qualityProfile, latestCamera)
      lastLabelLodAt = Date.now()
      lastHtmlLabelCount = labelState.htmlLabels
      return labelState
    }

    const scheduler = createTickScheduler({
      fixedHz: 30,
      onFixedTick: () => {
        if (!get().runtimeRunning) return

        const now = Date.now()
        const {
          selectedEntityId,
          hoveredEntityId,
          selectedStaticFeatureId,
          hoveredStaticFeatureId,
          isPlayingTrajectory,
          qualityProfile,
        } = get()
        const equipmentSimulationIntervalMs = getEquipmentSimulationIntervalMs(
          qualityProfile,
          ecsWorld.snapshotById.size
        )
        const shouldSimulateEquipment = shouldRunEquipmentSimulation(
          now,
          lastEquipmentSimulationAt,
          equipmentSimulationIntervalMs
        )
        const updates: EcsCommand[] = []
        const trajectoryUpdates: Array<{ entityId: string; point: { position: Vector3; timestamp: number } }> = []
        const newAlarms: Alarm[] = []
        fixedTickCount += 1
        const movingSnapshots = collectVisibleSnapshotsByTypes(ecsWorld, [
          'person',
          'vehicle',
        ]) as MovingSnapshot[]
        const occupancyIndex = createDynamicOccupancyIndex(
          movingSnapshots.map((snapshot) => ({
            id: snapshot.id,
            type: snapshot.type,
            position: snapshot.position,
            vehicleType: snapshot.type === 'vehicle' ? snapshot.vehicleType : undefined,
          }))
        )

        for (const snapshot of movingSnapshots) {
          const simulationCadence = resolveEntitySimulationCadence({
            entityPosition: snapshot.position,
            cameraPosition: latestCamera,
            cameraTarget: latestCameraTarget,
            isInteractionCritical:
              snapshot.id === selectedEntityId ||
              snapshot.id === hoveredEntityId ||
              snapshot.labelMode === 'html' ||
              (isPlayingTrajectory && snapshot.id === selectedEntityId),
          })
          if (!shouldSimulateEntityThisTick(fixedTickCount, simulationCadence)) {
            continue
          }

          const movement = simulateEntityMovement(
            {
              type: snapshot.type,
              position: snapshot.position,
              rotation: snapshot.rotation,
              metadata: snapshot.metadata,
              speed: snapshot.speed,
            },
            ECS_BOUNDS
          )
          const separation = applyDynamicSeparation(
            snapshot.id,
            snapshot.type,
            snapshot.position,
            movement.position,
            queryDynamicOccupants(
              occupancyIndex,
              movement.position,
              DYNAMIC_NEIGHBOR_QUERY_RADIUS,
              snapshot.id
            ),
            snapshot.type === 'vehicle' ? snapshot.vehicleType : undefined
          )
          const nextPosition = separation.position

          const nextUpdates: Record<string, unknown> = {
            position: nextPosition,
            rotation: {
              x: snapshot.rotation.x,
              y: movement.rotationY,
              z: snapshot.rotation.z,
            },
          }

          if (snapshot.type === 'vehicle') {
            const nextMetadata = resolveVehicleBlockedMetadata(movement.metadata, separation.blocked)
            if (nextMetadata) nextUpdates.metadata = nextMetadata
          } else if (movement.metadata) {
            nextUpdates.metadata = movement.metadata
          }
          if (typeof movement.heading === 'number') nextUpdates.heading = movement.heading
          if (typeof movement.speed === 'number') {
            nextUpdates.speed = separation.blocked ? 0 : movement.speed
          }

          updateDynamicOccupancyIndex(occupancyIndex, snapshot.id, nextPosition)

          updates.push({
            type: 'update',
            payload: {
              id: snapshot.id,
              updates: nextUpdates as never,
            },
          })

          if (isPlayingTrajectory && selectedEntityId === snapshot.id) {
            const pooled = ecsWorld.pools.trajectoryPoint.acquire()
            pooled.x = nextPosition.x
            pooled.y = nextPosition.y
            pooled.z = nextPosition.z
            pooled.t = now

            trajectoryUpdates.push({
              entityId: snapshot.id,
              point: {
                position: { x: nextPosition.x, y: nextPosition.y, z: nextPosition.z },
                timestamp: pooled.t,
              },
            })

            ecsWorld.pools.trajectoryPoint.release(pooled)
          }
        }

        if (shouldSimulateEquipment) {
          for (const equipmentId of ecsWorld.byType.equipment) {
            const snapshot = ecsWorld.snapshotById.get(equipmentId)
            if (!snapshot?.visible) continue

            const prevStatus = snapshot.status
            const next = simulateEquipmentStatus(
              {
                status: snapshot.status,
                parameters: snapshot.parameters ?? {},
              },
              equipmentSimulationIntervalMs
            )

            updates.push({
              type: 'update',
              payload: {
                id: snapshot.id,
                updates: next as never,
              },
            })

            if (next.status === 'warning' && prevStatus !== 'warning') {
              newAlarms.push({
                id: generateId(),
                level: 'warning',
                message: `设备 ${snapshot.name} 温度过高`,
                timestamp: now,
                acknowledged: false,
              })
            }

            if (next.status === 'error' && prevStatus !== 'error') {
              newAlarms.push({
                id: generateId(),
                level: 'error',
                message: `设备 ${snapshot.name} 发生故障`,
                timestamp: now,
                acknowledged: false,
              })
            }
          }
        }

        if (shouldSimulateEquipment) {
          lastEquipmentSimulationAt = now
        }

        if (updates.length > 0) {
          flushCommands(ecsWorld, updates)
        }

        if (updates.length === 0 && trajectoryUpdates.length === 0 && newAlarms.length === 0) {
          return
        }

        const labelLodIntervalMs = getLabelLodIntervalMs(
          qualityProfile,
          ecsWorld.snapshotById.size
        )
        const shouldRecomputeLabelLod = now - lastLabelLodAt >= labelLodIntervalMs
        const labelState = shouldRecomputeLabelLod
          ? applyLabelLod(qualityProfile, latestCamera)
          : {
              visibleLabels: get().performanceMetrics.visibleLabels,
              htmlLabels: lastHtmlLabelCount,
              changedIds: [],
            }
        const visibleLabels = labelState.visibleLabels

        if (shouldRecomputeLabelLod) {
          lastLabelLodAt = now
          lastHtmlLabelCount = labelState.htmlLabels
        }

        const publishIntervalMs = getEntityPublishIntervalMs(
          qualityProfile,
          ecsWorld.snapshotById.size,
          selectedEntityId !== null ||
            hoveredEntityId !== null ||
            selectedStaticFeatureId !== null ||
            hoveredStaticFeatureId !== null ||
            lastHtmlLabelCount > 0
        )
        const shouldPublishEntities = now - lastEntityPublishAt >= publishIntervalMs
        if (shouldPublishEntities) {
          lastEntityPublishAt = now
        }

        if (
          !shouldPublishEntities &&
          trajectoryUpdates.length === 0 &&
          newAlarms.length === 0 &&
          !shouldRecomputeLabelLod
        ) {
          return
        }

        set((state) => {
          const changedIds = shouldPublishEntities
            ? [...labelState.changedIds, ...updates.map((command) => command.payload.id)]
            : []
          let nextTrajectories = state.trajectories
          let trajectoriesChanged = false
          if (trajectoryUpdates.length > 0) {
            trajectoriesChanged = true
            nextTrajectories = new Map(state.trajectories)
            trajectoryUpdates.forEach(({ entityId, point }) => {
              appendTrajectoryPoint(nextTrajectories, entityId, point)
            })
          }

          let nextAlarms = state.alarms
          let nextUnacknowledged = state.unacknowledgedAlarmCount
          let alarmsChanged = false
          if (newAlarms.length > 0) {
            alarmsChanged = true
            nextAlarms = [...newAlarms, ...state.alarms].slice(0, 100)
            nextUnacknowledged = nextAlarms.reduce(
              (count, alarm) => (alarm.acknowledged ? count : count + 1),
              0
            )
          }

          const metricsChanged =
            shouldRecomputeLabelLod && state.performanceMetrics.visibleLabels !== visibleLabels

          if (!shouldPublishEntities && !trajectoriesChanged && !alarmsChanged && !metricsChanged) {
            return state
          }

          return {
            ...(shouldPublishEntities
              ? patchPublishedEntityState({
                  previousEntities: state.entities,
                  previousBuckets: state.entityBuckets,
                  previousDirectory: state.entityDirectory,
                  ids: changedIds,
                  getCategoryPresentation: (key) =>
                    getEntityCategoryPresentationFromMap(state.entityCategories, key),
                  getDynamicPresentation: (entity) =>
                    resolveDynamicEntityPresentation(entity, state.entitySchemaRegistry),
                })
              : {}),
            ...(trajectoriesChanged ? { trajectories: nextTrajectories } : {}),
            ...(alarmsChanged ? { alarms: nextAlarms, unacknowledgedAlarmCount: nextUnacknowledged } : {}),
            ...(metricsChanged
              ? {
                  performanceMetrics: {
                    ...state.performanceMetrics,
                    visibleLabels,
                  },
                }
              : {}),
          }
        })
      },
      onRenderTick: (nowMs, deltaMs) => {
        frameTimes.push(deltaMs)
        if (frameTimes.length > 120) frameTimes.shift()

        if (nowMs - lastMetricsAt < 250) return

        const sorted = [...frameTimes].sort((a, b) => a - b)
        const p95Index = Math.max(0, Math.floor(sorted.length * 0.95) - 1)
        const p95 = sorted[p95Index] ?? 0
        const avg = frameTimes.length > 0 ? frameTimes.reduce((sum, item) => sum + item, 0) / frameTimes.length : 0
        const fps = avg > 0 ? 1000 / avg : 0

        const { poolHitRate, poolRequests } = getAggregatePoolMetrics()

        set((state) => {
          let nextProfile = state.qualityProfile
          if (state.autoQuality) {
            if (state.qualityProfile === 'balanced' && (p95 > 20 || fps < 45)) {
              nextProfile = 'performance'
              smoothFramesStreak = 0
            } else if (state.qualityProfile === 'performance') {
              if (p95 < 14 && fps > 56) {
                smoothFramesStreak += 1
                if (smoothFramesStreak >= 6) {
                  nextProfile = 'balanced'
                  smoothFramesStreak = 0
                }
              } else {
                smoothFramesStreak = 0
              }
            }
          }

          const metricsChanged =
            state.performanceMetrics.fps !== fps ||
            state.performanceMetrics.frameTimeP95 !== p95 ||
            state.performanceMetrics.poolHitRate !== poolHitRate ||
            state.performanceMetrics.poolRequests !== poolRequests ||
            state.performanceMetrics.drawCalls !== latestDrawCalls

          if (!metricsChanged && nextProfile === state.qualityProfile) {
            return state
          }

          return {
            ...(nextProfile !== state.qualityProfile ? { qualityProfile: nextProfile } : {}),
            ...(metricsChanged
              ? {
                  performanceMetrics: {
                    ...state.performanceMetrics,
                    fps,
                    frameTimeP95: p95,
                    poolHitRate,
                    poolRequests,
                    drawCalls: latestDrawCalls,
                  },
                }
              : {}),
          }
        })

        lastMetricsAt = nowMs
      },
    })

    function resetRuntimeClockState() {
      scheduler.reset()
      lastMetricsAt = 0
      lastLabelLodAt = 0
      lastEntityPublishAt = 0
      lastRealtimeEntityPublishAt = 0
      lastEquipmentSimulationAt = 0
      lastHtmlLabelCount = 0
      smoothFramesStreak = 0
      fixedTickCount = 0
      frameTimes.length = 0
    }

    return {
      ...initialState,

      setPublishedScenePackage: (pkg) =>
        set((state) => {
          const staticFeatureRegistry = createRuntimePublishedStaticFeatureRegistry(pkg)
          return {
            publishedScenePackage: pkg,
            staticChunkRegistry: createRuntimeStaticChunkRegistry(pkg),
            staticFeatureRegistry,
            sceneConfig: cloneSceneConfigValue(pkg.sceneConfig),
            cameraPresets: cloneCameraPresetsValue(pkg.cameraPresets),
            activeCameraPreset: pkg.cameraPresets.some(
              (preset) => preset.id === state.activeCameraPreset
            )
              ? state.activeCameraPreset
              : pkg.cameraPresets[0]?.id ?? null,
            selectedStaticFeatureId:
              state.selectedStaticFeatureId &&
              staticFeatureRegistry.byId.has(state.selectedStaticFeatureId)
                ? state.selectedStaticFeatureId
                : null,
            hoveredStaticFeatureId:
              state.hoveredStaticFeatureId &&
              staticFeatureRegistry.byId.has(state.hoveredStaticFeatureId)
                ? state.hoveredStaticFeatureId
                : null,
          }
        }),

      setAuthoredStaticAssets: (assets) =>
        set({
          authoredStaticAssets: new Map(assets.map((asset) => [asset.id, asset])),
        }),

      setPlatformRegistry: ({ modules, eventTypes }) =>
        set((state) => ({
          platformModules: modules ?? state.platformModules,
          eventTypeRegistry:
            eventTypes === undefined
              ? state.eventTypeRegistry
              : new Map(eventTypes.map((registration) => [registration.eventType, registration])),
        })),

      setEntityRegistry: ({ categories, archetypes }) =>
        set((state) => {
          const nextCategories =
            categories === undefined
              ? state.entityCategories
              : new Map(categories.map((category) => [category.key, category]))
          const nextArchetypes =
            archetypes === undefined
              ? state.entityArchetypes
              : new Map(archetypes.map((archetype) => [archetype.id, archetype]))
          const getCategoryPresentation = (key: string): EntityCategoryPresentation => {
            return getEntityCategoryPresentationFromMap(nextCategories, key)
          }
          const nextSchemaRegistry = createEntitySchemaRegistry({
            categories: nextCategories.values(),
            archetypes: nextArchetypes.values(),
          })
          const getDynamicPresentation = (
            entity: Pick<DynamicEntity, 'archetypeId' | 'categoryKey'>
          ): DynamicEntityPresentation => resolveDynamicEntityPresentation(entity, nextSchemaRegistry)

          // Keep the original maps as the source of truth and rebuild the
          // schema registry as a derived runtime index for read paths.
          return {
            entityCategories: nextCategories,
            entityArchetypes: nextArchetypes,
            entitySchemaRegistry: nextSchemaRegistry,
            entityDirectory: buildEntityDirectoryFromWorld({
              previous: state.entityDirectory,
              getCategoryPresentation,
              getDynamicPresentation,
            }),
          }
        }),

      // 场景操作
      setSceneConfig: (config) =>
        set((state) => ({
          sceneConfig: { ...state.sceneConfig, ...config },
        })),

      setViewMode: (mode) =>
        set((state) => {
          if (mode === 'topdown') {
            return {
              viewMode: 'orbit',
              activeCameraPreset: 'top',
              cameraFocusRequest: null,
            }
          }

          if (isTrackedRuntimeViewMode(mode)) {
            const selectedEntity = state.selectedEntityId
              ? state.entities.get(state.selectedEntityId)
              : null

            if (!canTrackRuntimeEntity(selectedEntity)) {
              return {
                viewMode: 'orbit',
                activeCameraPreset: null,
                cameraFocusRequest: null,
              }
            }

            return {
              viewMode: mode,
              activeCameraPreset: null,
              cameraFocusRequest: null,
            }
          }

          return { viewMode: mode }
        }),

      setActiveCameraPreset: (presetId) =>
        set(
          presetId
            ? {
                viewMode: 'orbit',
                activeCameraPreset: presetId,
                cameraFocusRequest: null,
              }
            : { activeCameraPreset: null }
        ),

      clearCameraFocusRequest: () => set({ cameraFocusRequest: null }),

      focusCameraOnEntity: (id) => {
        const state = get()
        if (state.selectedEntityId !== id || state.selectedStaticFeatureId !== null) {
          state.setSelectedEntity(id)
        }

        const focusedState = get()
        const entity = focusedState.entities.get(id)
        if (!entity) return

        set({
          activeCameraPreset: null,
          cameraFocusRequest: isTrackedRuntimeViewMode(focusedState.viewMode)
            ? null
            : buildCameraFocusRequest(
                entity,
                latestCamera,
                focusedState.sceneConfig.cameraPosition
              ),
        })
      },

      setSceneReady: (ready) => set({ isSceneReady: ready }),

      // 实体操作（主写入路径转为ECS command-buffer）
      addEntity: (entity) => {
        enqueueEcsCommands(ecsWorld, [{ type: 'create', payload: toCreatePayload(entity) }])
        flushBufferedCommands(ecsWorld)
        set((state) => ({
          ...buildPublishedEntityState({
            previousEntities: state.entities,
            previousBuckets: state.entityBuckets,
            previousDirectory: state.entityDirectory,
            getCategoryPresentation: (key) =>
              getEntityCategoryPresentationFromMap(state.entityCategories, key),
            getDynamicPresentation: (entity) =>
              resolveDynamicEntityPresentation(entity, state.entitySchemaRegistry),
          }),
        }))
      },

      addEntities: (entities) => {
        if (entities.length === 0) return
        enqueueEcsCommands(
          ecsWorld,
          entities.map((entity) => ({
            type: 'create' as const,
            payload: toCreatePayload(entity),
          }))
        )
        flushBufferedCommands(ecsWorld)
        set((state) => ({
          ...buildPublishedEntityState({
            previousEntities: state.entities,
            previousBuckets: state.entityBuckets,
            previousDirectory: state.entityDirectory,
            getCategoryPresentation: (key) =>
              getEntityCategoryPresentationFromMap(state.entityCategories, key),
            getDynamicPresentation: (entity) =>
              resolveDynamicEntityPresentation(entity, state.entitySchemaRegistry),
          }),
        }))
      },

      updateEntity: (id, updates) => {
        enqueueEcsCommands(ecsWorld, [{ type: 'update', payload: { id, updates: updates as never } }])
        flushBufferedCommands(ecsWorld)
        set((state) => ({
          ...patchPublishedEntityState({
            previousEntities: state.entities,
            previousBuckets: state.entityBuckets,
            previousDirectory: state.entityDirectory,
            ids: [id],
            getCategoryPresentation: (key) =>
              getEntityCategoryPresentationFromMap(state.entityCategories, key),
            getDynamicPresentation: (entity) =>
              resolveDynamicEntityPresentation(entity, state.entitySchemaRegistry),
          }),
        }))
      },

      removeEntity: (id) => {
        enqueueEcsCommands(ecsWorld, [{ type: 'remove', payload: { id } }])
        flushBufferedCommands(ecsWorld)
        runtimeVehicleSnapshotRegistry.clear(id)
        runtimeVehiclePoseBuffer.delete(id)
        set((state) => ({
          ...buildPublishedEntityState({
            previousEntities: state.entities,
            previousBuckets: state.entityBuckets,
            previousDirectory: state.entityDirectory,
            getCategoryPresentation: (key) =>
              getEntityCategoryPresentationFromMap(state.entityCategories, key),
            getDynamicPresentation: (entity) =>
              resolveDynamicEntityPresentation(entity, state.entitySchemaRegistry),
          }),
          selectedEntityId: state.selectedEntityId === id ? null : state.selectedEntityId,
          hoveredEntityId: state.hoveredEntityId === id ? null : state.hoveredEntityId,
        }))
      },

      setSelectedEntity: (id) => {
        const state = get()
        if (state.selectedEntityId === id && state.selectedStaticFeatureId === null) return
        enqueueEcsCommands(ecsWorld, [{ type: 'select', payload: { id } }])
        flushBufferedCommands(ecsWorld)
        const labelState = syncImmediateLabelLod()
        set((state) => {
          const changedIds = [
            ...labelState.changedIds,
            state.selectedEntityId,
            ecsWorld.selectedId,
          ]
          const nextEntities = patchProjectedEntities(state.entities, changedIds, true)
          return {
            selectedEntityId: ecsWorld.selectedId,
            hoveredEntityId: ecsWorld.hoveredId,
            selectedStaticFeatureId: null,
            entities: nextEntities,
            entityBuckets: patchEntityBuckets(
              state.entityBuckets,
              state.entities,
              nextEntities,
              changedIds
            ),
            ...(state.performanceMetrics.visibleLabels !== labelState.visibleLabels
              ? {
                  performanceMetrics: {
                    ...state.performanceMetrics,
                    visibleLabels: labelState.visibleLabels,
                  },
                }
              : {}),
          }
        })
      },

      setHoveredEntity: (id) => {
        const state = get()
        if (state.hoveredEntityId === id && state.hoveredStaticFeatureId === null) return
        enqueueEcsCommands(ecsWorld, [{ type: 'hover', payload: { id } }])
        flushBufferedCommands(ecsWorld)
        const labelState = syncImmediateLabelLod()
        set((state) => {
          const changedIds = [
            ...labelState.changedIds,
            state.hoveredEntityId,
            ecsWorld.hoveredId,
          ]
          const nextEntities = patchProjectedEntities(state.entities, changedIds, true)
          return {
            selectedEntityId: ecsWorld.selectedId,
            hoveredEntityId: ecsWorld.hoveredId,
            hoveredStaticFeatureId: null,
            entities: nextEntities,
            entityBuckets: patchEntityBuckets(
              state.entityBuckets,
              state.entities,
              nextEntities,
              changedIds
            ),
            ...(state.performanceMetrics.visibleLabels !== labelState.visibleLabels
              ? {
                  performanceMetrics: {
                    ...state.performanceMetrics,
                    visibleLabels: labelState.visibleLabels,
                  },
                }
              : {}),
          }
        })
      },

      setSelectedStaticFeature: (id) =>
        set((state) => {
          if (state.selectedStaticFeatureId === id && state.selectedEntityId === null) {
            return state
          }

          if (state.selectedEntityId !== null || state.hoveredEntityId !== null) {
            enqueueEcsCommands(ecsWorld, [
              { type: 'select', payload: { id: null } },
              { type: 'hover', payload: { id: null } },
            ])
            flushBufferedCommands(ecsWorld)
          }

          return {
            selectedEntityId: null,
            hoveredEntityId: null,
            selectedStaticFeatureId: id,
          }
        }),

      setHoveredStaticFeature: (id) =>
        set((state) => {
          if (state.hoveredStaticFeatureId === id && state.hoveredEntityId === null) {
            return state
          }

          if (state.hoveredEntityId !== null) {
            enqueueEcsCommands(ecsWorld, [{ type: 'hover', payload: { id: null } }])
            flushBufferedCommands(ecsWorld)
          }

          return {
            hoveredEntityId: null,
            hoveredStaticFeatureId: id,
          }
        }),

      setEntityFilters: (filters) =>
        set((state) => ({
          entityFilters: { ...state.entityFilters, ...filters },
        })),

      updateEntityPosition: (id, position, rotation) => {
        enqueueEcsCommands(ecsWorld, [
          {
            type: 'update',
            payload: {
              id,
              updates: {
                position,
                ...(rotation && { rotation }),
              } as never,
            },
          },
        ])
        flushBufferedCommands(ecsWorld)
        set((state) => ({
          ...patchPublishedEntityState({
            previousEntities: state.entities,
            previousBuckets: state.entityBuckets,
            previousDirectory: state.entityDirectory,
            ids: [id],
            getCategoryPresentation: (key) =>
              getEntityCategoryPresentationFromMap(state.entityCategories, key),
            getDynamicPresentation: (entity) =>
              resolveDynamicEntityPresentation(entity, state.entitySchemaRegistry),
          }),
        }))
      },

      batchUpdateEntities: (updates) => {
        if (updates.length === 0) return
        enqueueEcsCommands(
          ecsWorld,
          updates.map(({ id, updates: entityUpdates }) => ({
            type: 'update' as const,
            payload: { id, updates: entityUpdates as never },
          }))
        )
        flushBufferedCommands(ecsWorld)
        set((state) => ({
          ...patchPublishedEntityState({
            previousEntities: state.entities,
            previousBuckets: state.entityBuckets,
            previousDirectory: state.entityDirectory,
            ids: updates.map(({ id }) => id),
            getCategoryPresentation: (key) =>
              getEntityCategoryPresentationFromMap(state.entityCategories, key),
            getDynamicPresentation: (entity) =>
              resolveDynamicEntityPresentation(entity, state.entitySchemaRegistry),
          }),
        }))
      },

      applySimulationTick: ({ entityUpdates, trajectoryUpdates = [], newAlarms = [] }) => {
        if (entityUpdates.length > 0) {
          enqueueEcsCommands(
            ecsWorld,
            entityUpdates.map(({ id, updates }) => ({
              type: 'update' as const,
              payload: { id, updates: updates as never },
            }))
          )
          flushBufferedCommands(ecsWorld)
        }

        const now = Date.now()
        const current = get()
        const interactionActive =
          current.selectedEntityId !== null ||
          current.hoveredEntityId !== null ||
          current.selectedStaticFeatureId !== null ||
          current.hoveredStaticFeatureId !== null ||
          lastHtmlLabelCount > 0
        const publishIntervalMs = getEntityPublishIntervalMs(
          current.qualityProfile,
          ecsWorld.snapshotById.size,
          interactionActive
        )
        const shouldPublishAllRuntimeUpdates =
          entityUpdates.length > 0 && now - lastRealtimeEntityPublishAt >= publishIntervalMs
        const idsToPublish = shouldPublishAllRuntimeUpdates
          ? entityUpdates.map(({ id }) => id)
          : entityUpdates
              .filter(({ id, updates }) =>
                shouldPublishRuntimePatchImmediately(
                  id,
                  updates,
                  current.selectedEntityId,
                  current.hoveredEntityId
                )
              )
              .map(({ id }) => id)

        if (idsToPublish.length > 0 && shouldPublishAllRuntimeUpdates) {
          lastRealtimeEntityPublishAt = now
        }

        if (idsToPublish.length === 0 && trajectoryUpdates.length === 0 && newAlarms.length === 0) {
          return
        }

        set((state) => {
          let nextTrajectories = state.trajectories
          let trajectoriesChanged = false
          if (trajectoryUpdates.length > 0) {
            nextTrajectories = new Map(state.trajectories)
            trajectoryUpdates.forEach(({ entityId, point }) => {
              appendTrajectoryPoint(nextTrajectories, entityId, point)
            })
            trajectoriesChanged = true
          }

          const alarmsChanged = newAlarms.length > 0
          const mergedAlarms = alarmsChanged ? [...newAlarms, ...state.alarms].slice(0, 100) : state.alarms

          return {
            ...(idsToPublish.length > 0
              ? patchPublishedEntityState({
                  previousEntities: state.entities,
                  previousBuckets: state.entityBuckets,
                  previousDirectory: state.entityDirectory,
                  ids: idsToPublish,
                  getCategoryPresentation: (key) =>
                    getEntityCategoryPresentationFromMap(state.entityCategories, key),
                  getDynamicPresentation: (entity) =>
                    resolveDynamicEntityPresentation(entity, state.entitySchemaRegistry),
                })
              : {}),
            ...(trajectoriesChanged ? { trajectories: nextTrajectories } : {}),
            ...(alarmsChanged
              ? {
                  alarms: mergedAlarms,
                  unacknowledgedAlarmCount: mergedAlarms.reduce(
                    (count, alarm) => (alarm.acknowledged ? count : count + 1),
                    0
                  ),
                }
              : {}),
          }
        })
      },

      enqueueCommands: (commands) => {
        enqueueEcsCommands(ecsWorld, commands)
      },

      flushCommands: () => {
        const result = flushBufferedCommands(ecsWorld)
        if (result.applied > 0) {
          set((state) => ({
            selectedEntityId: ecsWorld.selectedId,
            hoveredEntityId: ecsWorld.hoveredId,
            ...buildPublishedEntityState({
              previousEntities: state.entities,
              previousBuckets: state.entityBuckets,
              previousDirectory: state.entityDirectory,
              getCategoryPresentation: (key) =>
                getEntityCategoryPresentationFromMap(state.entityCategories, key),
              getDynamicPresentation: (entity) =>
                resolveDynamicEntityPresentation(entity, state.entitySchemaRegistry),
            }),
          }))
        }
      },

      advanceRuntime: (nowMs, _deltaMs, cameraPosition, drawCalls, cameraTarget) => {
        latestCamera = cameraPosition
        latestCameraTarget = cameraTarget ? { ...cameraTarget } : latestCameraTarget
        latestDrawCalls = drawCalls
        scheduler.advance(nowMs)
      },

      setRuntimeRunning: (running) => set({ runtimeRunning: running }),

      resetRuntimeClock: () => {
        resetRuntimeClockState()
      },

      // 轨迹操作
      addTrajectoryPoint: (entityId, point) =>
        set((state) => {
          const newTrajectories = new Map(state.trajectories)
          appendTrajectoryPoint(newTrajectories, entityId, point)
          return { trajectories: newTrajectories }
        }),

      clearTrajectory: (entityId) =>
        set((state) => {
          const newTrajectories = new Map(state.trajectories)
          newTrajectories.delete(entityId)
          return { trajectories: newTrajectories }
        }),

      setTrajectoryPlayback: (playing, speed) =>
        set({
          isPlayingTrajectory: playing,
          ...(speed !== undefined && { trajectoryPlaybackSpeed: speed }),
        }),

      // 规则操作
      addRule: (rule) =>
        set((state) => {
          const newRules = new Map(state.rules)
          newRules.set(rule.id, rule)
          return { rules: newRules }
        }),

      updateRule: (id, updates) =>
        set((state) => {
          const rule = state.rules.get(id)
          if (!rule) return state
          const newRules = new Map(state.rules)
          newRules.set(id, { ...rule, ...updates, updatedAt: Date.now() })
          return { rules: newRules }
        }),

      removeRule: (id) =>
        set((state) => {
          const newRules = new Map(state.rules)
          newRules.delete(id)
          return {
            rules: newRules,
            activeRuleId: state.activeRuleId === id ? null : state.activeRuleId,
          }
        }),

      setActiveRule: (id) => set({ activeRuleId: id }),

      setRuleEditorOpen: (open) => set({ isRuleEditorOpen: open }),

      // 告警操作
      addAlarm: (alarm) =>
        set((state) => ({
          alarms: [alarm, ...state.alarms].slice(0, 100),
          unacknowledgedAlarmCount: state.unacknowledgedAlarmCount + 1,
        })),

      acknowledgeAlarm: (id) =>
        set((state) => ({
          alarms: state.alarms.map((a) =>
            a.id === id ? { ...a, acknowledged: true } : a
          ),
          unacknowledgedAlarmCount: Math.max(0, state.unacknowledgedAlarmCount - 1),
        })),

      clearAlarms: () => set({ alarms: [], unacknowledgedAlarmCount: 0 }),

      // 事件操作
      upsertIncident: (incident) =>
        set((state) => upsertRuntimeIncidentState(state, incident)),

      batchUpsertIncidents: (incidents) =>
        set((state) => {
          if (incidents.length === 0) return state

          let nextState = state
          for (const incident of incidents) {
            nextState = {
              ...nextState,
              ...upsertRuntimeIncidentState(nextState, incident),
            }
          }

          return nextState
        }),

      acknowledgeIncident: (id) =>
        set((state) => {
          const incidents = state.incidents.map((incident) =>
            incident.id === id ? { ...incident, acknowledged: true } : incident
          )
          const now = Date.now()
          const nextActiveIncident =
            incidents.find((incident) => incident.id !== id && isRuntimeIncidentActive(incident, now)) ??
            incidents.find((incident) => incident.id !== id) ??
            null

          return {
            incidents,
            ...(state.activeIncidentId === id
              ? { activeIncidentId: nextActiveIncident?.id ?? null }
              : {}),
            ...(state.incidentVideoIncidentId === id
              ? {
                  incidentVideoFeed: null,
                  incidentVideoIncidentId: null,
                  isIncidentVideoOpen: false,
                }
              : {}),
          }
        }),

      setActiveIncident: (id) => set({ activeIncidentId: id }),

      openIncidentVideo: (feed, incidentId = null) =>
        set({
          incidentVideoFeed: feed,
          incidentVideoIncidentId: incidentId,
          isIncidentVideoOpen: true,
          ...(incidentId ? { activeIncidentId: incidentId } : {}),
        }),

      closeIncidentVideo: () =>
        set({
          incidentVideoFeed: null,
          incidentVideoIncidentId: null,
          isIncidentVideoOpen: false,
        }),

      clearIncidents: () =>
        set({
          incidents: [],
          activeIncidentId: null,
          incidentVideoFeed: null,
          incidentVideoIncidentId: null,
          isIncidentVideoOpen: false,
        }),

      pruneIncidents: (now = Date.now()) =>
        set((state) => {
          const incidents = state.incidents.filter((incident) =>
            shouldRetainRuntimeIncident(incident, now)
          )

          const nextActiveIncident =
            incidents.find((incident) => isRuntimeIncidentActive(incident, now)) ??
            incidents[0] ??
            null

          const currentActiveIncident =
            state.activeIncidentId
              ? incidents.find((incident) => incident.id === state.activeIncidentId) ?? null
              : null
          const shouldCloseVideo =
            state.incidentVideoIncidentId !== null &&
            !incidents.some((incident) => incident.id === state.incidentVideoIncidentId)
          const nextActiveIncidentId =
            currentActiveIncident && isRuntimeIncidentActive(currentActiveIncident, now)
              ? currentActiveIncident.id
              : nextActiveIncident?.id ?? null

          if (
            incidents.length === state.incidents.length &&
            !shouldCloseVideo &&
            nextActiveIncidentId === state.activeIncidentId
          ) {
            return state
          }

          return {
            incidents,
            activeIncidentId: nextActiveIncidentId,
            ...(shouldCloseVideo
              ? {
                  incidentVideoFeed: null,
                  incidentVideoIncidentId: null,
                  isIncidentVideoOpen: false,
                }
              : {}),
          }
        }),

      setRuntimeDataSource: (source, notice = null) =>
        set({
          runtimeDataSource: source,
          runtimeNotice: notice,
        }),

      // UI操作
      toggleLeftPanel: () => set((state) => ({ leftPanelOpen: !state.leftPanelOpen })),

      toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),

      toggleBottomPanel: () => set((state) => ({ bottomPanelOpen: !state.bottomPanelOpen })),

      setBottomPanelTab: (tab) => set({ bottomPanelTab: tab }),

      // 测量工具
      setMeasurementMode: (mode) =>
        set({ measurementMode: mode, measurementPoints: [] }),

      addMeasurementPoint: (point) =>
        set((state) => ({
          measurementPoints: [...state.measurementPoints, point],
        })),

      clearMeasurementPoints: () => set({ measurementPoints: [] }),

      // 连接操作
      setConnectionStatus: (connected, url) =>
        set({ isConnected: connected, connectionUrl: url || null }),

      // 手动切换档位时，默认关闭自动降级，避免被下一帧自动策略立即覆盖。
      setQualityProfile: (profile) =>
        set((state) => ({
          qualityProfile: profile,
          autoQuality: state.autoQuality ? false : state.autoQuality,
        })),

      setAutoQuality: (enabled) => set({ autoQuality: enabled }),

      setRendererMode: (mode) =>
        set((state) => (state.rendererMode === mode ? state : { rendererMode: mode })),

      setRendererBackend: (backend) =>
        set((state) => (state.rendererBackend === backend ? state : { rendererBackend: backend })),

      setRendererDiagnostics: (diagnostics) =>
        set((state) =>
          state.rendererDiagnostics.requestedMode === diagnostics.requestedMode &&
          state.rendererDiagnostics.backend === diagnostics.backend &&
          state.rendererDiagnostics.webgpuAvailable === diagnostics.webgpuAvailable &&
          state.rendererDiagnostics.fallbackReason === diagnostics.fallbackReason &&
          state.rendererDiagnostics.message === diagnostics.message &&
          state.rendererDiagnostics.storageBufferActive === diagnostics.storageBufferActive
            ? state
            : { rendererDiagnostics: diagnostics }
        ),

      // 工具方法
      getEntitiesByType: <T extends Entity>(type: EntityType): T[] => {
        const entities: T[] = []
        get().entities.forEach((entity) => {
          if (entity.type === type) {
            entities.push(entity as T)
          }
        })
        return entities
      },

      getEntityById: (id) => get().entities.get(id),

      getEventTypeRegistration: (eventType) => get().eventTypeRegistry.get(eventType),

      getDynamicEntityPresentation: (entity) =>
        resolveDynamicEntityPresentation(entity, get().entitySchemaRegistry),

      getEntitiesInZone: (zoneId) => {
        const zone = get().entities.get(zoneId) as ZoneEntity | undefined
        if (!zone || zone.type !== 'zone') return []

        const result: Entity[] = []
        get().entities.forEach((entity) => {
          if (entity.type !== 'zone' && isPointInPolygon(entity.position, zone.boundary)) {
            result.push(entity)
          }
        })
        return result
      },

      getEcsSnapshotById: (id) => ecsWorld.snapshotById.get(id),

      reset: () => {
        ecsWorld.byExternalId.clear()
        ecsWorld.externalIdByEid.clear()
        ecsWorld.snapshotById.clear()
        Object.values(ecsWorld.byType).forEach((ids) => ids.clear())
        ecsWorld.commandBuffer.length = 0
        ecsWorld.selectedId = null
        ecsWorld.hoveredId = null
        runtimeVehicleSnapshotRegistry.clear()
        runtimeVehiclePoseBuffer.clear()
        resetRuntimeClockState()
        set(initialState)
      },
    }
  })
)

// 辅助函数：判断点是否在多边形内
function isPointInPolygon(point: Vector3, polygon: Vector3[]): boolean {
  if (polygon.length < 3) return false

  let inside = false
  const { x, z } = point

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const zi = polygon[i].z
    const xj = polygon[j].x
    const zj = polygon[j].z

    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside
    }
  }

  return inside
}

// 选择器 hooks
export const useEntities = () => useDigitalTwinStore((state) => state.entities)
export const useSelectedEntity = () => {
  const selectedId = useDigitalTwinStore((state) => state.selectedEntityId)
  const entities = useDigitalTwinStore((state) => state.entities)
  return selectedId ? entities.get(selectedId) : null
}
export const useSelectedStaticFeature = () => {
  const selectedId = useDigitalTwinStore((state) => state.selectedStaticFeatureId)
  const staticFeatureRegistry = useDigitalTwinStore((state) => state.staticFeatureRegistry)
  return selectedId ? getRuntimePublishedStaticFeature(selectedId, staticFeatureRegistry) : null
}
export const useIncidents = () => useDigitalTwinStore((state) => state.incidents)
export const useSelectedIncident = () => {
  const activeIncidentId = useDigitalTwinStore((state) => state.activeIncidentId)
  const incidents = useDigitalTwinStore((state) => state.incidents)
  return activeIncidentId ? incidents.find((incident) => incident.id === activeIncidentId) ?? null : null
}
export const useSceneConfig = () => useDigitalTwinStore((state) => state.sceneConfig)
export const useViewMode = () => useDigitalTwinStore((state) => state.viewMode)
export const useAlarms = () => useDigitalTwinStore((state) => state.alarms)
