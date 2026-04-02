import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  AccessRule,
  Entity,
  ZoneEntity,
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
import { CAMPUS_BOUNDS, CAMPUS_CAMERA_PRESETS, CAMPUS_SCENE_CONFIG } from './campus-layout'
import { getEquipmentSimulationIntervalMs, shouldRunEquipmentSimulation } from './equipment-runtime'
import { aggregatePoolMetrics } from './performance-runtime'

export type QualityProfile = 'balanced' | 'performance'
export type RendererMode = 'auto' | 'webgpu' | 'webgl2'
export type RendererBackend = 'webgpu' | 'webgl2' | 'unknown'

interface PerformanceMetrics {
  fps: number
  frameTimeP95: number
  drawCalls: number
  visibleLabels: number
  poolHitRate: number
  poolRequests: number
}

export interface EntityDirectoryEntry {
  id: string
  type: EntityType
  name: string
  status: EntityStatus
  visible: boolean
}

// 默认场景配置
const defaultSceneConfig: SceneConfig = {
  id: 'default',
  name: '化工园区数字孪生',
  gridSize: CAMPUS_SCENE_CONFIG.gridSize,
  gridDivisions: CAMPUS_SCENE_CONFIG.gridDivisions,
  backgroundColor: '#09131d',
  ambientLightIntensity: 0.52,
  showAxes: false,
  showGrid: true,
  cameraPosition: CAMPUS_SCENE_CONFIG.cameraPosition,
  cameraTarget: CAMPUS_SCENE_CONFIG.cameraTarget,
}

// 默认相机预设
const defaultCameraPresets: CameraPreset[] = CAMPUS_CAMERA_PRESETS

interface DigitalTwinState {
  // 场景状态
  sceneConfig: SceneConfig
  viewMode: ViewMode
  cameraPresets: CameraPreset[]
  activeCameraPreset: string | null
  isSceneReady: boolean

  // 实体状态（UI层消费）
  entities: Map<string, Entity>
  entityDirectory: Map<string, EntityDirectoryEntry>
  selectedEntityId: string | null
  hoveredEntityId: string | null
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
  // 场景操作
  setSceneConfig: (config: Partial<SceneConfig>) => void
  setViewMode: (mode: ViewMode) => void
  setActiveCameraPreset: (presetId: string | null) => void
  setSceneReady: (ready: boolean) => void

  // 实体操作
  addEntity: (entity: Entity) => void
  addEntities: (entities: Entity[]) => void
  updateEntity: (id: string, updates: Partial<Entity>) => void
  removeEntity: (id: string) => void
  setSelectedEntity: (id: string | null) => void
  setHoveredEntity: (id: string | null) => void
  setEntityFilters: (filters: Partial<DigitalTwinState['entityFilters']>) => void
  updateEntityPosition: (id: string, position: Vector3, rotation?: Vector3) => void
  batchUpdateEntities: (updates: Array<{ id: string; updates: Partial<Entity> }>) => void
  applySimulationTick: (payload: SimulationTickPayload) => void

  // ECS命令缓冲
  enqueueCommands: (commands: EcsCommand[]) => void
  flushCommands: () => void
  advanceRuntime: (nowMs: number, deltaMs: number, cameraPosition: Vector3, drawCalls: number) => void
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

  // 工具方法
  getEntitiesByType: <T extends Entity>(type: EntityType) => T[]
  getEntityById: (id: string) => Entity | undefined
  getEntitiesInZone: (zoneId: string) => Entity[]
  getEcsSnapshotById: (id: string) => EcsEntitySnapshot | undefined
  reset: () => void
}

const initialState: DigitalTwinState = {
  sceneConfig: defaultSceneConfig,
  viewMode: 'orbit',
  cameraPresets: defaultCameraPresets,
  activeCameraPreset: 'iso',
  isSceneReady: false,

  entities: new Map(),
  entityDirectory: new Map(),
  selectedEntityId: null,
  hoveredEntityId: null,
  entityFilters: {
    types: ['person', 'vehicle', 'equipment', 'zone'],
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

  leftPanelOpen: true,
  rightPanelOpen: true,
  bottomPanelOpen: false,
  bottomPanelTab: 'timeline',

  measurementMode: 'none',
  measurementPoints: [],

  isConnected: false,
  connectionUrl: null,
  rendererMode: 'webgl2',
  rendererBackend: 'unknown',

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

function cloneBoundary(boundary: Vector3[] | undefined): Vector3[] | undefined {
  return boundary ? boundary.map((point) => ({ ...point })) : undefined
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
      && entity.plateNumber === (snapshot.plateNumber ?? entity.plateNumber)
      && entity.vehicleType === (snapshot.vehicleType ?? entity.vehicleType)
      && entity.capacity === snapshot.capacity
      && entity.currentLoad === snapshot.currentLoad
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
  ids: Array<string | null | undefined>
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

    const projected = projectEntitySnapshot(snapshot, previousEntity, true)
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
      previousEntry &&
      previousEntry.type === snapshot.type &&
      previousEntry.name === snapshot.name &&
      previousEntry.status === snapshot.status &&
      previousEntry.visible === snapshot.visible
    ) {
      next.set(id, previousEntry)
      return
    }

    next.set(id, {
      id: snapshot.id,
      type: snapshot.type,
      name: snapshot.name,
      status: snapshot.status,
      visible: snapshot.visible,
    })
  })

  if (!previous || previous.size !== next.size) return next
  for (const [id, entry] of next) {
    if (previous.get(id) !== entry) return next
  }
  return previous
}

function buildPublishedEntityState(options: {
  previousEntities?: Map<string, Entity>
  previousDirectory?: Map<string, EntityDirectoryEntry>
}) {
  return {
    entities: buildEntityMapFromWorld({
      previous: options.previousEntities,
    }),
    entityDirectory: buildEntityDirectoryFromWorld({
      previous: options.previousDirectory,
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

export const useDigitalTwinStore = create<DigitalTwinState & DigitalTwinActions>()(
  subscribeWithSelector((set, get) => {
    let lastMetricsAt = 0
    let lastLabelLodAt = 0
    let lastEntityPublishAt = 0
    let lastEquipmentSimulationAt = 0
    let lastHtmlLabelCount = 0
    let smoothFramesStreak = 0
    const frameTimes: number[] = []
    let latestCamera: Vector3 = { x: 0, y: 0, z: 0 }
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
        const { selectedEntityId, hoveredEntityId, isPlayingTrajectory, qualityProfile } = get()
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
        const movingSnapshots = Array.from(ecsWorld.snapshotById.values()).filter(
          (snapshot): snapshot is MovingSnapshot =>
            snapshot.visible && (snapshot.type === 'person' || snapshot.type === 'vehicle')
        )
        const occupancyIndex = createDynamicOccupancyIndex(
          movingSnapshots.map((snapshot) => ({
            id: snapshot.id,
            type: snapshot.type,
            position: snapshot.position,
          }))
        )

        ecsWorld.snapshotById.forEach((snapshot) => {
          if (!snapshot.visible || snapshot.type === 'zone') return

          if (snapshot.type === 'person' || snapshot.type === 'vehicle') {
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
              )
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

          if (snapshot.type === 'equipment') {
            if (!shouldSimulateEquipment) return
            const prevStatus = snapshot.status
            const next = simulateEquipmentStatus({
              status: snapshot.status,
              parameters: snapshot.parameters ?? {},
            }, equipmentSimulationIntervalMs)

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
        })

        if (shouldSimulateEquipment) {
          lastEquipmentSimulationAt = now
        }

        if (updates.length > 0) {
          flushCommands(ecsWorld, updates)
        }

        if (updates.length === 0 && trajectoryUpdates.length === 0 && newAlarms.length === 0) {
          return
        }

        const shouldRecomputeLabelLod = now - lastLabelLodAt >= 250
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
          selectedEntityId !== null || hoveredEntityId !== null || lastHtmlLabelCount > 0
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
              ? buildPublishedEntityState({
                  previousEntities: state.entities,
                  previousDirectory: state.entityDirectory,
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
      lastEquipmentSimulationAt = 0
      lastHtmlLabelCount = 0
      smoothFramesStreak = 0
      frameTimes.length = 0
    }

    return {
      ...initialState,

      // 场景操作
      setSceneConfig: (config) =>
        set((state) => ({
          sceneConfig: { ...state.sceneConfig, ...config },
        })),

      setViewMode: (mode) => set({ viewMode: mode }),

      setActiveCameraPreset: (presetId) => set({ activeCameraPreset: presetId }),

      setSceneReady: (ready) => set({ isSceneReady: ready }),

      // 实体操作（主写入路径转为ECS command-buffer）
      addEntity: (entity) => {
        enqueueEcsCommands(ecsWorld, [{ type: 'create', payload: toCreatePayload(entity) }])
        flushBufferedCommands(ecsWorld)
        set((state) => ({
          ...buildPublishedEntityState({
            previousEntities: state.entities,
            previousDirectory: state.entityDirectory,
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
            previousDirectory: state.entityDirectory,
          }),
        }))
      },

      updateEntity: (id, updates) => {
        enqueueEcsCommands(ecsWorld, [{ type: 'update', payload: { id, updates: updates as never } }])
        flushBufferedCommands(ecsWorld)
        set((state) => ({
          ...buildPublishedEntityState({
            previousEntities: state.entities,
            previousDirectory: state.entityDirectory,
          }),
        }))
      },

      removeEntity: (id) => {
        enqueueEcsCommands(ecsWorld, [{ type: 'remove', payload: { id } }])
        flushBufferedCommands(ecsWorld)
        set((state) => ({
          ...buildPublishedEntityState({
            previousEntities: state.entities,
            previousDirectory: state.entityDirectory,
          }),
          selectedEntityId: state.selectedEntityId === id ? null : state.selectedEntityId,
          hoveredEntityId: state.hoveredEntityId === id ? null : state.hoveredEntityId,
        }))
      },

      setSelectedEntity: (id) => {
        if (get().selectedEntityId === id) return
        enqueueEcsCommands(ecsWorld, [{ type: 'select', payload: { id } }])
        flushBufferedCommands(ecsWorld)
        const labelState = syncImmediateLabelLod()
        set((state) => ({
          selectedEntityId: ecsWorld.selectedId,
          hoveredEntityId: ecsWorld.hoveredId,
          entities: patchProjectedEntities(state.entities, [
            ...labelState.changedIds,
            state.selectedEntityId,
            state.hoveredEntityId,
            ecsWorld.selectedId,
            ecsWorld.hoveredId,
          ]),
          ...(state.performanceMetrics.visibleLabels !== labelState.visibleLabels
            ? {
                performanceMetrics: {
                  ...state.performanceMetrics,
                  visibleLabels: labelState.visibleLabels,
                },
              }
            : {}),
        }))
      },

      setHoveredEntity: (id) => {
        if (get().hoveredEntityId === id) return
        enqueueEcsCommands(ecsWorld, [{ type: 'hover', payload: { id } }])
        flushBufferedCommands(ecsWorld)
        const labelState = syncImmediateLabelLod()
        set((state) => ({
          selectedEntityId: ecsWorld.selectedId,
          hoveredEntityId: ecsWorld.hoveredId,
          entities: patchProjectedEntities(state.entities, [
            ...labelState.changedIds,
            state.hoveredEntityId,
            ecsWorld.hoveredId,
          ]),
          ...(state.performanceMetrics.visibleLabels !== labelState.visibleLabels
            ? {
                performanceMetrics: {
                  ...state.performanceMetrics,
                  visibleLabels: labelState.visibleLabels,
                },
              }
            : {}),
        }))
      },

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
          ...buildPublishedEntityState({
            previousEntities: state.entities,
            previousDirectory: state.entityDirectory,
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
          ...buildPublishedEntityState({
            previousEntities: state.entities,
            previousDirectory: state.entityDirectory,
          }),
        }))
      },

      applySimulationTick: ({ entityUpdates, trajectoryUpdates = [], newAlarms = [] }) => {
        enqueueEcsCommands(
          ecsWorld,
          entityUpdates.map(({ id, updates }) => ({
            type: 'update' as const,
            payload: { id, updates: updates as never },
          }))
        )
        flushBufferedCommands(ecsWorld)

        set((state) => {
          const nextTrajectories = new Map(state.trajectories)
          trajectoryUpdates.forEach(({ entityId, point }) => {
            appendTrajectoryPoint(nextTrajectories, entityId, point)
          })

          const mergedAlarms = newAlarms.length > 0 ? [...newAlarms, ...state.alarms].slice(0, 100) : state.alarms

          return {
            ...buildPublishedEntityState({
              previousEntities: state.entities,
              previousDirectory: state.entityDirectory,
            }),
            trajectories: nextTrajectories,
            alarms: mergedAlarms,
            unacknowledgedAlarmCount: mergedAlarms.reduce(
              (count, alarm) => (alarm.acknowledged ? count : count + 1),
              0
            ),
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
              previousDirectory: state.entityDirectory,
            }),
          }))
        }
      },

      advanceRuntime: (nowMs, _deltaMs, cameraPosition, drawCalls) => {
        latestCamera = cameraPosition
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

      setRendererMode: (mode) => set({ rendererMode: mode }),

      setRendererBackend: (backend) => set({ rendererBackend: backend }),

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
        ecsWorld.commandBuffer.length = 0
        ecsWorld.selectedId = null
        ecsWorld.hoveredId = null
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
export const useSceneConfig = () => useDigitalTwinStore((state) => state.sceneConfig)
export const useViewMode = () => useDigitalTwinStore((state) => state.viewMode)
export const useAlarms = () => useDigitalTwinStore((state) => state.alarms)
