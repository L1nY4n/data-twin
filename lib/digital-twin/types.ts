// 数字孪生平台核心类型定义

// 三维向量
export interface Vector3 {
  x: number
  y: number
  z: number
}

// 实体状态
export type EntityStatus = 'active' | 'inactive' | 'warning' | 'error'

// 实体类型
export type EntityType = 'person' | 'vehicle' | 'equipment' | 'sensor' | 'camera' | 'zone'

export type SensorType =
  | 'temperature'
  | 'pressure'
  | 'flow'
  | 'gas'
  | 'level'
  | 'humidity'
  | 'other'

export type CameraType = 'fixed' | 'dome' | 'ptz' | 'thermal'

// 基础实体
export interface BaseEntity {
  id: string
  type: EntityType
  name: string
  position: Vector3
  rotation: Vector3
  scale: Vector3
  status: EntityStatus
  visible: boolean
  metadata: Record<string, unknown>
  // 渲染提示（由ECS渲染系统写入）
  labelMode?: 'hidden' | 'sprite' | 'html'
  createdAt: number
  updatedAt: number
}

// 人员实体
export interface PersonEntity extends BaseEntity {
  type: 'person'
  role: string
  department: string
  avatar?: string
  schedule: TimeRange[]
  currentActivity?: string
}

// 车辆实体
export interface VehicleEntity extends BaseEntity {
  type: 'vehicle'
  plateNumber: string
  vehicleType: 'car' | 'truck' | 'forklift' | 'agv' | 'other'
  speed: number
  heading: number
  capacity?: number
  currentLoad?: number
  routeTrack?: VehicleTrackLike
  trackPosition?: VehicleRouteLike
}

// 设备实体
export interface EquipmentEntity extends BaseEntity {
  type: 'equipment'
  modelId?: string
  modelUrl?: string
  parameters: Record<string, number | string | boolean>
  alarms: Alarm[]
  maintenanceSchedule?: TimeRange[]
}

// 传感器实体
export interface SensorEntity extends BaseEntity {
  type: 'sensor'
  sensorType: SensorType
  unit: string
  reading: number
  thresholdMin?: number
  thresholdMax?: number
}

// 摄像头实体
export interface CameraEntity extends BaseEntity {
  type: 'camera'
  cameraType: CameraType
  streamUrl?: string
  fov: number
  heading: number
  range?: number
  recording: boolean
}

// 区域实体
export interface ZoneEntity extends BaseEntity {
  type: 'zone'
  boundary: Vector3[]
  zoneType: 'restricted' | 'work' | 'storage' | 'passage' | 'danger' | 'custom'
  color: string
  accessRules: AccessRule[]
  capacity?: number
  currentOccupancy?: number
}

// 实体联合类型
export type Entity =
  | PersonEntity
  | VehicleEntity
  | EquipmentEntity
  | SensorEntity
  | CameraEntity
  | ZoneEntity

// 时间范围
export interface TimeRange {
  start: number
  end: number
  label?: string
}

// 告警
export interface Alarm {
  id: string
  level: 'info' | 'warning' | 'error' | 'critical'
  message: string
  timestamp: number
  acknowledged: boolean
}

export type IncidentSeverity = Alarm['level']

export type IncidentKind = 'near_miss' | 'zone_intrusion' | 'overspeed'

export interface IncidentCitation {
  id: string
  label: string
  value: string
}

export interface IncidentVideoFeed {
  id: string
  cameraName: string
  title: string
  status: 'live' | 'buffering' | 'review'
  sceneLabel: string
  badge: string
  streamUrl?: string
  posterTone?: string
}

export interface RuntimeIncident {
  id: string
  kind: IncidentKind
  severity: IncidentSeverity
  title: string
  summary: string
  message: string
  primaryEntityId: string
  entityIds: string[]
  zoneId?: string
  zoneName?: string
  cameraName?: string
  citations: IncidentCitation[]
  videoFeed?: IncidentVideoFeed | null
  acknowledged: boolean
  timestamp: number
}

// 访问规则
export interface AccessRule {
  id: string
  allowedRoles: string[]
  allowedDepartments: string[]
  timeRanges: TimeRange[]
  action: 'allow' | 'deny' | 'alert'
}

// 轨迹点
export interface TrajectoryPoint {
  position: Vector3
  timestamp: number
  speed?: number
  heading?: number
}

// 实体轨迹
export interface EntityTrajectory {
  entityId: string
  points: TrajectoryPoint[]
}

// 场景配置
export interface SceneConfig {
  id: string
  name: string
  gridSize: number
  gridDivisions: number
  backgroundColor: string
  ambientLightIntensity: number
  showAxes: boolean
  showGrid: boolean
  cameraPosition: Vector3
  cameraTarget: Vector3
}

// 视角模式
export type ViewMode = 'orbit' | 'topdown' | 'follow' | 'firstperson'

export type RuntimeDataSource = 'live' | 'mock'

// 相机预设
export interface CameraPreset {
  id: string
  name: string
  position: Vector3
  target: Vector3
  fov: number
}

// 3D模型信息
export interface ModelInfo {
  id: string
  name: string
  url: string
  scale: Vector3
  rotation: Vector3
  thumbnail?: string
}

export type StaticAssetKind =
  | 'process-train'
  | 'pipe-rack'
  | 'vertical-tank'
  | 'sphere-tank'
  | 'pump-manifold'
  | 'service-building'
  | 'wall-system'
  | 'door-system'
  | 'window-system'
  | 'security-device'
  | 'smart-sensor'
  | 'smart-control'

export interface StaticAssetInstance {
  id: string
  name: string
  assetKind: StaticAssetKind
  variant?: string
  position: Vector3
  rotation: Vector3
  scale: Vector3
  visible: boolean
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface StaticAssetPlacement {
  position: Vector3
  rotation?: Vector3
  elevationLocked?: boolean
  metadata?: Record<string, unknown>
}

export interface StaticAssetPlacementPreview extends StaticAssetPlacement {
  hostStaticAssetId?: string | null
  hostSurface?:
    | 'ground'
    | 'wall-face'
    | 'ceiling-plane'
    | 'opening-center'
    | 'door-face'
  surfaceNormal?: Vector3 | null
}

// 规则节点类型
export type RuleNodeType = 
  | 'trigger-location'
  | 'trigger-device'
  | 'trigger-time'
  | 'trigger-manual'
  | 'condition-threshold'
  | 'condition-time'
  | 'condition-spatial'
  | 'logic-and'
  | 'logic-or'
  | 'logic-not'
  | 'action-alert'
  | 'action-control'
  | 'action-dispatch'

// 规则节点数据
export interface RuleNodeData {
  label: string
  nodeType: RuleNodeType
  config: Record<string, unknown>
  description?: string
}

// 规则配置
export interface RuleConfig {
  id: string
  name: string
  description: string
  enabled: boolean
  version?: number
  nodes: Array<{
    id: string
    type: string
    position: { x: number; y: number }
    data: RuleNodeData
  }>
  edges: Array<{
    id: string
    source: string
    target: string
    sourceHandle?: string
    targetHandle?: string
  }>
  createdAt: number
  updatedAt: number
}

// WebSocket消息类型
export type WSMessageType = 
  | 'position_update'
  | 'status_update'
  | 'alarm'
  | 'incident'
  | 'config_changed'
  | 'entity_enter_zone'
  | 'entity_leave_zone'
  | 'rule_triggered'

// WebSocket消息
export interface WSMessage {
  type: WSMessageType
  payload: unknown
  timestamp: number
}

export interface PublishedSceneRuntimeDescriptor {
  packageUrl: string
  packageVersion: string
  sceneId: string
  generatedAt: string
  staticAssetManifestUrl: string
}

export interface VehicleTrackContract {
  id: string
  points: Vector3[]
  loop: boolean
}

export interface VehicleRouteTrackDescriptor {
  routeId: string
  trackId: string
  label: string
  looped: boolean
  waypoints: Vector3[]
}

export type VehicleRouteDirection = 'forward' | 'reverse'

export interface VehicleRouteContract {
  trackId: string
  segmentIndex: number
  segmentProgress: number
  target?: Vector3
  direction?: VehicleRouteDirection
}

export interface VehicleTrackPositionDescriptor {
  routeId: string
  trackId: string
  segmentIndex: number
  nextWaypointIndex: number
  segmentProgress: number
}

export type VehicleTrackLike = VehicleTrackContract | VehicleRouteTrackDescriptor
export type VehicleRouteLike = VehicleRouteContract | VehicleTrackPositionDescriptor

// 位置更新消息
export interface PositionUpdateMessage {
  entityId: string
  position: Vector3
  rotation?: Vector3
  speed?: number
  heading?: number
  routeTrack?: VehicleTrackLike
  trackPosition?: VehicleRouteLike
  track?: VehicleTrackContract
  route?: VehicleRouteContract
}

// 状态更新消息
export interface StatusUpdateMessage {
  entityId: string
  status: EntityStatus
  parameters?: Record<string, unknown>
}

export interface IncidentMessage {
  incident: RuntimeIncident
}

export interface ConfigChangedMessage {
  sceneVersion: number
  changedAt: number
  scope: 'scene' | 'entity' | 'static_asset' | 'binding' | 'rule' | 'publish'
  publishedScene?: PublishedSceneRuntimeDescriptor | null
}

export interface DataConnector {
  id: string
  name: string
  protocol: string
  endpoint: string
  authConfig: Record<string, unknown>
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface EntityBinding {
  bindingId: string
  entityId: string
  connectorId: string
  sourcePath: string
  mapping: Record<string, unknown>
  enabled: boolean
  createdAt: number
  updatedAt: number
}

// 空间关系
export interface SpatialRelation {
  entityA: string
  entityB: string
  distance: number
  angle: number
  direction: Vector3
}

// 热力图数据点
export interface HeatmapPoint {
  position: Vector3
  intensity: number
  timestamp?: number
}
