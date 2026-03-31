import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  Entity,
  PersonEntity,
  VehicleEntity,
  EquipmentEntity,
  ZoneEntity,
  EntityType,
  EntityStatus,
  Vector3,
  SceneConfig,
  ViewMode,
  CameraPreset,
  RuleConfig,
  EntityTrajectory,
  Alarm,
} from './types'

// 默认场景配置
const defaultSceneConfig: SceneConfig = {
  id: 'default',
  name: '默认场景',
  gridSize: 100,
  gridDivisions: 100,
  backgroundColor: '#0a0a0f',
  ambientLightIntensity: 0.5,
  showAxes: false,
  showGrid: true,
  cameraPosition: { x: 50, y: 50, z: 50 },
  cameraTarget: { x: 0, y: 0, z: 0 },
}

// 默认相机预设
const defaultCameraPresets: CameraPreset[] = [
  { id: 'iso', name: '等距视角', position: { x: 50, y: 50, z: 50 }, target: { x: 0, y: 0, z: 0 }, fov: 50 },
  { id: 'top', name: '俯视视角', position: { x: 0, y: 100, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 50 },
  { id: 'front', name: '正面视角', position: { x: 0, y: 20, z: 80 }, target: { x: 0, y: 0, z: 0 }, fov: 50 },
  { id: 'side', name: '侧面视角', position: { x: 80, y: 20, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 50 },
]

interface DigitalTwinState {
  // 场景状态
  sceneConfig: SceneConfig
  viewMode: ViewMode
  cameraPresets: CameraPreset[]
  activeCameraPreset: string | null
  isSceneReady: boolean

  // 实体状态
  entities: Map<string, Entity>
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
}

interface DigitalTwinActions {
  // 场景操作
  setSceneConfig: (config: Partial<SceneConfig>) => void
  setViewMode: (mode: ViewMode) => void
  setActiveCameraPreset: (presetId: string | null) => void
  setSceneReady: (ready: boolean) => void

  // 实体操作
  addEntity: (entity: Entity) => void
  updateEntity: (id: string, updates: Partial<Entity>) => void
  removeEntity: (id: string) => void
  setSelectedEntity: (id: string | null) => void
  setHoveredEntity: (id: string | null) => void
  setEntityFilters: (filters: Partial<DigitalTwinState['entityFilters']>) => void
  updateEntityPosition: (id: string, position: Vector3, rotation?: Vector3) => void
  batchUpdateEntities: (updates: Array<{ id: string; updates: Partial<Entity> }>) => void

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

  // 工具方法
  getEntitiesByType: <T extends Entity>(type: EntityType) => T[]
  getEntityById: (id: string) => Entity | undefined
  getEntitiesInZone: (zoneId: string) => Entity[]
  reset: () => void
}

const initialState: DigitalTwinState = {
  sceneConfig: defaultSceneConfig,
  viewMode: 'orbit',
  cameraPresets: defaultCameraPresets,
  activeCameraPreset: 'iso',
  isSceneReady: false,

  entities: new Map(),
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
}

export const useDigitalTwinStore = create<DigitalTwinState & DigitalTwinActions>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // 场景操作
    setSceneConfig: (config) =>
      set((state) => ({
        sceneConfig: { ...state.sceneConfig, ...config },
      })),

    setViewMode: (mode) => set({ viewMode: mode }),

    setActiveCameraPreset: (presetId) => set({ activeCameraPreset: presetId }),

    setSceneReady: (ready) => set({ isSceneReady: ready }),

    // 实体操作
    addEntity: (entity) =>
      set((state) => {
        const newEntities = new Map(state.entities)
        newEntities.set(entity.id, entity)
        return { entities: newEntities }
      }),

    updateEntity: (id, updates) =>
      set((state) => {
        const entity = state.entities.get(id)
        if (!entity) return state
        const newEntities = new Map(state.entities)
        newEntities.set(id, { ...entity, ...updates, updatedAt: Date.now() } as Entity)
        return { entities: newEntities }
      }),

    removeEntity: (id) =>
      set((state) => {
        const newEntities = new Map(state.entities)
        newEntities.delete(id)
        return {
          entities: newEntities,
          selectedEntityId: state.selectedEntityId === id ? null : state.selectedEntityId,
        }
      }),

    setSelectedEntity: (id) => set({ selectedEntityId: id }),

    setHoveredEntity: (id) => set({ hoveredEntityId: id }),

    setEntityFilters: (filters) =>
      set((state) => ({
        entityFilters: { ...state.entityFilters, ...filters },
      })),

    updateEntityPosition: (id, position, rotation) =>
      set((state) => {
        const entity = state.entities.get(id)
        if (!entity) return state
        const newEntities = new Map(state.entities)
        newEntities.set(id, {
          ...entity,
          position,
          ...(rotation && { rotation }),
          updatedAt: Date.now(),
        } as Entity)
        return { entities: newEntities }
      }),

    batchUpdateEntities: (updates) =>
      set((state) => {
        const newEntities = new Map(state.entities)
        updates.forEach(({ id, updates: entityUpdates }) => {
          const entity = newEntities.get(id)
          if (entity) {
            newEntities.set(id, { ...entity, ...entityUpdates, updatedAt: Date.now() } as Entity)
          }
        })
        return { entities: newEntities }
      }),

    // 轨迹操作
    addTrajectoryPoint: (entityId, point) =>
      set((state) => {
        const newTrajectories = new Map(state.trajectories)
        const trajectory = newTrajectories.get(entityId) || { entityId, points: [] }
        trajectory.points.push(point)
        // 保留最近1000个点
        if (trajectory.points.length > 1000) {
          trajectory.points = trajectory.points.slice(-1000)
        }
        newTrajectories.set(entityId, trajectory)
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
        alarms: [alarm, ...state.alarms].slice(0, 100), // 保留最近100条
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

    reset: () => set(initialState),
  }))
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
