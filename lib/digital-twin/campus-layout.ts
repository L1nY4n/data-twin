import type { CameraPreset, VehicleEntity, Vector3, ZoneEntity } from './types'

export interface LaneRect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface CampusDistrict {
  id: string
  name: string
  center: Vector3
  size: {
    width: number
    depth: number
  }
}

export interface ZoneBlueprint {
  center: Vector3
  size: {
    width: number
    depth: number
  }
  name: string
  zoneType: ZoneEntity['zoneType']
  color: string
}

export interface EquipmentPlacement {
  name: string
  position: Vector3
  repeatable?: boolean
  spread?: {
    x: number
    z: number
  }
}

export interface SceneEntityCounts {
  persons: number
  vehicles: number
  equipment: number
}

export type LayoutBlueprintKind =
  | 'admin-building'
  | 'cooling-tower'
  | 'emergency-station'
  | 'flare-stack'
  | 'fire-water'
  | 'gatehouse'
  | 'loading-rack'
  | 'logistics-warehouse'
  | 'perimeter-fence'
  | 'process-train'
  | 'process-strip'
  | 'rail-spur'
  | 'service-building'
  | 'solar-canopy'
  | 'pipe-rack'
  | 'sphere-tank'
  | 'substation-yard'
  | 'truck-parking'
  | 'vertical-tank'
  | 'weighbridge'
  | 'pump-manifold'
  | 'wall-system'
  | 'door-system'
  | 'window-system'
  | 'security-device'
  | 'smart-sensor'
  | 'smart-control'
  | 'bund'

export interface LayoutBlueprint {
  id: string
  districtId: CampusDistrict['id']
  label: string
  kind: LayoutBlueprintKind
  center: Vector3
  width: number
  depth: number
  height: number
  major: boolean
  blocksVehicle: boolean
  blocksPerson: boolean
  variant?: string
}

export type PlantMobilityType = 'person' | 'vehicle'

export interface CampusSector {
  id: string
  name: string
  offset: Vector3
}

function point(x: number, z: number, y = 0): Vector3 {
  return { x, y, z }
}

export const CAMPUS_SECTORS: CampusSector[] = [
  { id: 'sector-core', name: '核心炼化园', offset: point(0, 0) },
  { id: 'sector-east', name: '东部新材料园', offset: point(260, 0) },
  { id: 'sector-west', name: '西部储运园', offset: point(-260, 0) },
  { id: 'sector-north', name: '北部能源环保园', offset: point(0, -260) },
  { id: 'sector-south', name: '南部公辅园', offset: point(0, 260) },
  { id: 'sector-southeast', name: '东南研发仓储园', offset: point(260, 260) },
]

export const CAMPUS_SECTOR_HALF_EXTENT = 118

function offsetPoint(value: Vector3, offset: Vector3): Vector3 {
  return {
    x: value.x + offset.x,
    y: value.y + offset.y,
    z: value.z + offset.z,
  }
}

function offsetLaneRect(lane: LaneRect, offset: Vector3): LaneRect {
  return {
    minX: lane.minX + offset.x,
    maxX: lane.maxX + offset.x,
    minZ: lane.minZ + offset.z,
    maxZ: lane.maxZ + offset.z,
  }
}

function withSectorName(name: string, sector: CampusSector): string {
  if (sector.id === 'sector-core') return name
  return `${sector.name} · ${name}`
}

export const CAMPUS_GRID_SIZE = 860
export const CAMPUS_GRID_DIVISIONS = 430
export const CAMPUS_INTERACTION_RADIUS = 520
export const CAMPUS_INTERACTION_HEIGHT = 28
export const CAMPUS_SCENE_CONFIG = {
  gridSize: CAMPUS_GRID_SIZE,
  gridDivisions: CAMPUS_GRID_DIVISIONS,
  cameraPosition: point(460, 430, 420),
  cameraTarget: point(20, 72, 0),
} as const

export const CAMPUS_DISTRICTS: CampusDistrict[] = [
  {
    id: 'process-west',
    name: '西区工艺装置',
    center: point(-56, -18),
    size: { width: 76, depth: 52 },
  },
  {
    id: 'tank-east',
    name: '东区储罐区',
    center: point(58, -18),
    size: { width: 64, depth: 52 },
  },
  {
    id: 'logistics-south',
    name: '南区装车发运',
    center: point(7, 75.5),
    size: { width: 210, depth: 69 },
  },
  {
    id: 'utilities-north',
    name: '北区公辅处理',
    center: point(4, -85.5),
    size: { width: 168, depth: 61 },
  },
  {
    id: 'sector-perimeter',
    name: '分区围界',
    center: point(0, 0),
    size: { width: 230, depth: 230 },
  },
  {
    id: 'utilities-flare',
    name: '火炬安全区',
    center: point(92, -50),
    size: { width: 18, depth: 18 },
  },
]

export const LOGISTICS_BAY_OFFSETS = [-44, -22, 0, 22, 44] as const

export const PROCESS_WEST_LAYOUT_BLUEPRINTS: LayoutBlueprint[] = [
  {
    id: 'west-train-reactor',
    districtId: 'process-west',
    label: '西区反应列',
    kind: 'process-train',
    center: point(-75, -30),
    width: 16,
    depth: 20,
    height: 20,
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'reactor',
  },
  {
    id: 'west-train-fractionation',
    districtId: 'process-west',
    label: '西区分馏列',
    kind: 'process-train',
    center: point(-58, -30),
    width: 16,
    depth: 20,
    height: 22.5,
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'fractionation',
  },
  {
    id: 'west-train-finishing',
    districtId: 'process-west',
    label: '西区压缩精制列',
    kind: 'process-train',
    center: point(-39, -30),
    width: 14,
    depth: 20,
    height: 17,
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'finishing',
  },
  {
    id: 'west-front-strip',
    districtId: 'process-west',
    label: '西区前场换热泵带',
    kind: 'process-strip',
    center: point(-58, -18),
    width: 52,
    depth: 8,
    height: 4.8,
    major: false,
    blocksVehicle: true,
    blocksPerson: false,
    variant: 'frontage',
  },
  {
    id: 'west-control-room',
    districtId: 'process-west',
    label: '西区控制电气间',
    kind: 'service-building',
    center: point(-23, -30),
    width: 8,
    depth: 14,
    height: 6,
    major: false,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'control-room',
  },
  {
    id: 'west-main-pipe-rack',
    districtId: 'process-west',
    label: '西区高架总管廊',
    kind: 'pipe-rack',
    center: point(-54, -22),
    width: 60,
    depth: 4,
    height: 9.1,
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
    variant: 'west-header',
  },
]

export const TANK_EAST_LAYOUT_BLUEPRINTS: LayoutBlueprint[] = [
  {
    id: 'east-vertical-a',
    districtId: 'tank-east',
    label: '东区立罐组 A',
    kind: 'vertical-tank',
    center: point(42, -31),
    width: 20,
    depth: 16,
    height: 11,
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'fixed-roof',
  },
  {
    id: 'east-vertical-b',
    districtId: 'tank-east',
    label: '东区立罐组 B',
    kind: 'vertical-tank',
    center: point(42, -17),
    width: 20,
    depth: 10,
    height: 9,
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'day-tank',
  },
  {
    id: 'east-sphere-1',
    districtId: 'tank-east',
    label: '东区球罐 1',
    kind: 'sphere-tank',
    center: point(66, -34),
    width: 8,
    depth: 8,
    height: 9,
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'lpg',
  },
  {
    id: 'east-sphere-2',
    districtId: 'tank-east',
    label: '东区球罐 2',
    kind: 'sphere-tank',
    center: point(78, -34),
    width: 8,
    depth: 8,
    height: 9,
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'lpg',
  },
  {
    id: 'east-sphere-3',
    districtId: 'tank-east',
    label: '东区球罐 3',
    kind: 'sphere-tank',
    center: point(66, -22),
    width: 8,
    depth: 8,
    height: 9,
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'lpg',
  },
  {
    id: 'east-sphere-4',
    districtId: 'tank-east',
    label: '东区球罐 4',
    kind: 'sphere-tank',
    center: point(78, -22),
    width: 8,
    depth: 8,
    height: 9,
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'lpg',
  },
  {
    id: 'east-pump-manifold',
    districtId: 'tank-east',
    label: '东区泵阀管汇带',
    kind: 'pump-manifold',
    center: point(59, -17),
    width: 12,
    depth: 6,
    height: 4.4,
    major: false,
    blocksVehicle: true,
    blocksPerson: false,
    variant: 'manifold',
  },
  {
    id: 'east-gas-detector-array',
    districtId: 'tank-east',
    label: '东区可燃气体检测阵列',
    kind: 'smart-sensor',
    center: point(87, -28),
    width: 1.8,
    depth: 1.8,
    height: 3.4,
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
    variant: 'occupancy-sensor',
  },
  {
    id: 'east-metering-house',
    districtId: 'tank-east',
    label: '东区计量机柜间',
    kind: 'service-building',
    center: point(74, -17),
    width: 10,
    depth: 8,
    height: 5.2,
    major: false,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'metering',
  },
  {
    id: 'east-bund-vertical',
    districtId: 'tank-east',
    label: '东区立罐围堰',
    kind: 'bund',
    center: point(42, -25),
    width: 24,
    depth: 30,
    height: 1.2,
    major: false,
    blocksVehicle: true,
    blocksPerson: false,
    variant: 'liquid',
  },
  {
    id: 'east-bund-sphere',
    districtId: 'tank-east',
    label: '东区球罐围堰',
    kind: 'bund',
    center: point(70, -28),
    width: 20,
    depth: 28,
    height: 1.2,
    major: false,
    blocksVehicle: true,
    blocksPerson: false,
    variant: 'sphere',
  },
]

export const LOGISTICS_SOUTH_LAYOUT_BLUEPRINTS: LayoutBlueprint[] = [
  {
    id: 'logistics-warehouse-west',
    districtId: 'logistics-south',
    label: '西侧立体仓库',
    kind: 'logistics-warehouse',
    center: point(-72, 90),
    width: 36,
    depth: 16,
    height: 11,
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'high-bay',
  },
  {
    id: 'logistics-dispatch-center',
    districtId: 'logistics-south',
    label: '发运调度中心',
    kind: 'admin-building',
    center: point(68, 91),
    width: 34,
    depth: 16,
    height: 10,
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'dispatch',
  },
  {
    id: 'logistics-fire-station',
    districtId: 'logistics-south',
    label: '消防应急站',
    kind: 'emergency-station',
    center: point(-20, 91),
    width: 24,
    depth: 14,
    height: 8,
    major: false,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'fire-house',
  },
  {
    id: 'logistics-rail-spur',
    districtId: 'logistics-south',
    label: '铁路装卸支线',
    kind: 'rail-spur',
    center: point(0, 106),
    width: 188,
    depth: 8,
    height: 1.4,
    major: true,
    blocksVehicle: false,
    blocksPerson: false,
    variant: 'siding',
  },
  {
    id: 'logistics-loading-rack',
    districtId: 'logistics-south',
    label: '五车位装车栈台',
    kind: 'loading-rack',
    center: point(0, 69),
    width: 112,
    depth: 10,
    height: 6.8,
    major: true,
    blocksVehicle: false,
    blocksPerson: false,
    variant: 'five-bay-top-loading',
  },
  {
    id: 'logistics-weighbridge',
    districtId: 'logistics-south',
    label: '无人值守地磅',
    kind: 'weighbridge',
    center: point(104, 86),
    width: 16,
    depth: 5,
    height: 2.8,
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
    variant: 'truck-scale',
  },
  {
    id: 'logistics-esd-panel',
    districtId: 'logistics-south',
    label: '装车 ESD 联锁面板',
    kind: 'smart-control',
    center: point(57, 68),
    width: 2.2,
    depth: 0.8,
    height: 2.8,
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
    variant: 'esd-panel',
  },
  {
    id: 'logistics-solar-parking',
    districtId: 'logistics-south',
    label: '光伏停车棚',
    kind: 'solar-canopy',
    center: point(22, 91),
    width: 30,
    depth: 13,
    height: 5.2,
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
    variant: 'solar-parking',
  },
  {
    id: 'logistics-yard-parking',
    districtId: 'logistics-south',
    label: '危化车待装区',
    kind: 'truck-parking',
    center: point(0, 84),
    width: 56,
    depth: 10,
    height: 0.2,
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
    variant: 'hazmat-staging',
  },
  {
    id: 'logistics-yard-service-west',
    districtId: 'logistics-south',
    label: '西侧仓储服务楼',
    kind: 'service-building',
    center: point(-70, 76),
    width: 34,
    depth: 12,
    height: 5.6,
    major: false,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'yard-service-west',
  },
  {
    id: 'logistics-yard-service-east',
    districtId: 'logistics-south',
    label: '东侧发运服务楼',
    kind: 'service-building',
    center: point(68, 76),
    width: 30,
    depth: 12,
    height: 6.4,
    major: false,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'yard-service-east',
  },
  {
    id: 'logistics-yard-center-block',
    districtId: 'logistics-south',
    label: '装卸中控模块',
    kind: 'service-building',
    center: point(0, 78),
    width: 20,
    depth: 10,
    height: 3.6,
    major: false,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'yard-control-block',
  },
]

export const UTILITIES_NORTH_LAYOUT_BLUEPRINTS: LayoutBlueprint[] = [
  {
    id: 'utilities-cooling-tower-bank',
    districtId: 'utilities-north',
    label: '循环水冷却塔组',
    kind: 'cooling-tower',
    center: point(-52, -72),
    width: 42,
    depth: 18,
    height: 11,
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'cooling-bank',
  },
  {
    id: 'utilities-water-treatment',
    districtId: 'utilities-north',
    label: '污水处理池组',
    kind: 'fire-water',
    center: point(28, -72),
    width: 46,
    depth: 18,
    height: 3.2,
    major: true,
    blocksVehicle: true,
    blocksPerson: false,
    variant: 'water-treatment',
  },
  {
    id: 'utilities-substation-yard',
    districtId: 'utilities-north',
    label: '高压变电站场',
    kind: 'substation-yard',
    center: point(74, -72),
    width: 28,
    depth: 18,
    height: 9,
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'switchyard',
  },
  {
    id: 'utilities-firewater-station',
    districtId: 'utilities-north',
    label: '消防水泵站',
    kind: 'emergency-station',
    center: point(-8, -94),
    width: 28,
    depth: 12,
    height: 5.5,
    major: false,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'firewater-pump',
  },
  {
    id: 'utilities-main-gate',
    districtId: 'utilities-north',
    label: '园区北门岗亭',
    kind: 'gatehouse',
    center: point(0, -112),
    width: 18,
    depth: 8,
    height: 4.2,
    major: false,
    blocksVehicle: false,
    blocksPerson: true,
    variant: 'north-gate',
  },
  {
    id: 'utilities-perimeter',
    districtId: 'sector-perimeter',
    label: '分区围界与照明',
    kind: 'perimeter-fence',
    center: point(0, 0),
    width: 230,
    depth: 230,
    height: 7.8,
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
    variant: 'sector-fence',
  },
  {
    id: 'utilities-perimeter-camera-nw',
    districtId: 'sector-perimeter',
    label: '西北周界 AI 摄像塔',
    kind: 'security-device',
    center: point(-104, -104),
    width: 3.4,
    depth: 3.4,
    height: 7.2,
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
    variant: 'dome-camera',
  },
  {
    id: 'utilities-perimeter-camera-ne',
    districtId: 'sector-perimeter',
    label: '东北周界 AI 摄像塔',
    kind: 'security-device',
    center: point(104, -104),
    width: 3.4,
    depth: 3.4,
    height: 7.2,
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
    variant: 'dome-camera',
  },
  {
    id: 'utilities-gate-lpr-camera',
    districtId: 'sector-perimeter',
    label: '北门车牌识别摄像塔',
    kind: 'security-device',
    center: point(12, -108),
    width: 3.2,
    depth: 3.2,
    height: 6.8,
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
    variant: 'dome-camera',
  },
  {
    id: 'utilities-service-building',
    districtId: 'utilities-north',
    label: '公辅值守服务楼',
    kind: 'service-building',
    center: point(-6, -72),
    width: 14,
    depth: 8,
    height: 2.4,
    major: false,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'utility-service',
  },
  {
    id: 'utilities-flare-stack',
    districtId: 'utilities-flare',
    label: '火炬排放塔',
    kind: 'flare-stack',
    center: point(92, -50),
    width: 6,
    depth: 6,
    height: 20.4,
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
    variant: 'flare-stack',
  },
]

export const CAMPUS_LAYOUT_BLUEPRINTS: LayoutBlueprint[] = [
  ...PROCESS_WEST_LAYOUT_BLUEPRINTS,
  ...TANK_EAST_LAYOUT_BLUEPRINTS,
  ...LOGISTICS_SOUTH_LAYOUT_BLUEPRINTS,
  ...UTILITIES_NORTH_LAYOUT_BLUEPRINTS,
]

export const CAMPUS_CAMERA_PRESETS: CameraPreset[] = [
  {
    id: 'iso',
    name: '园区总览',
    position: CAMPUS_SCENE_CONFIG.cameraPosition,
    target: CAMPUS_SCENE_CONFIG.cameraTarget,
    fov: 50,
  },
  {
    id: 'top',
    name: '全域俯视',
    position: { x: 0, y: 660, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    fov: 45,
  },
  {
    id: 'process',
    name: '西区工艺',
    position: { x: -4, y: 66, z: 34 },
    target: { x: -56, y: 8, z: -26 },
    fov: 50,
  },
  {
    id: 'tank',
    name: '东区罐区',
    position: { x: 128, y: 18, z: 30 },
    target: { x: 58, y: 8, z: -24 },
    fov: 50,
  },
  {
    id: 'logistics',
    name: '南区装卸',
    position: { x: 0, y: 130, z: 28 },
    target: { x: 0, y: 60, z: 6 },
    fov: 50,
  },
  {
    id: 'utilities',
    name: '北区公用工程',
    position: { x: 48, y: 24, z: -132 },
    target: { x: 0, y: 6, z: -72 },
    fov: 50,
  },
  {
    id: 'rail-logistics',
    name: '铁路与发运',
    position: { x: 152, y: 64, z: 146 },
    target: { x: 4, y: 3, z: 88 },
    fov: 48,
  },
  {
    id: 'energy-north',
    name: '北部能源环保园',
    position: { x: 118, y: 78, z: -334 },
    target: { x: 0, y: 7, z: -260 },
    fov: 48,
  },
  {
    id: 'southeast-rd',
    name: '东南研发仓储园',
    position: { x: 358, y: 88, z: 348 },
    target: { x: 260, y: 6, z: 260 },
    fov: 48,
  },
]

export const CAMPUS_ZONE_BLUEPRINTS: ZoneBlueprint[] = [
  {
    center: point(-77, -30),
    size: { width: 18, depth: 24 },
    name: '西区反应单元',
    zoneType: 'work',
    color: '#22c55e',
  },
  {
    center: point(-49, -26),
    size: { width: 38, depth: 28 },
    name: '西区分馏换热区',
    zoneType: 'work',
    color: '#16a34a',
  },
  {
    center: point(0, -4),
    size: { width: 156, depth: 14 },
    name: '中央管廊走廊',
    zoneType: 'passage',
    color: '#0ea5e9',
  },
  {
    center: point(42, -25),
    size: { width: 24, depth: 30 },
    name: '东区原料罐组',
    zoneType: 'storage',
    color: '#3b82f6',
  },
  {
    center: point(72, -28),
    size: { width: 24, depth: 28 },
    name: '东区成品罐组',
    zoneType: 'storage',
    color: '#2563eb',
  },
  {
    center: point(0, 56),
    size: { width: 192, depth: 20 },
    name: '南区装车廊道',
    zoneType: 'passage',
    color: '#06b6d4',
  },
  {
    center: point(-66, 74),
    size: { width: 42, depth: 18 },
    name: '南区仓储分拣场',
    zoneType: 'restricted',
    color: '#f59e0b',
  },
  {
    center: point(68, 74),
    size: { width: 44, depth: 18 },
    name: '南区发运调度场',
    zoneType: 'work',
    color: '#14b8a6',
  },
  {
    center: point(-50, -72),
    size: { width: 40, depth: 20 },
    name: '北区循环水站',
    zoneType: 'work',
    color: '#22c55e',
  },
  {
    center: point(24, -72),
    size: { width: 46, depth: 20 },
    name: '北区污水处理',
    zoneType: 'work',
    color: '#10b981',
  },
  {
    center: point(74, -72),
    size: { width: 26, depth: 16 },
    name: '北区变电站',
    zoneType: 'restricted',
    color: '#f59e0b',
  },
  {
    center: point(92, -50),
    size: { width: 18, depth: 18 },
    name: '火炬安全隔离带',
    zoneType: 'danger',
    color: '#ef4444',
  },
  {
    center: point(-20, 91),
    size: { width: 28, depth: 18 },
    name: '消防应急响应站',
    zoneType: 'restricted',
    color: '#f97316',
  },
  {
    center: point(0, 106),
    size: { width: 188, depth: 12 },
    name: '铁路装卸支线',
    zoneType: 'passage',
    color: '#64748b',
  },
  {
    center: point(22, 91),
    size: { width: 34, depth: 15 },
    name: '光储充停车棚',
    zoneType: 'work',
    color: '#84cc16',
  },
  {
    center: point(-8, -94),
    size: { width: 32, depth: 16 },
    name: '消防水泵站',
    zoneType: 'restricted',
    color: '#ef4444',
  },
]

const INTER_SECTOR_VEHICLE_LANE_RECTS: LaneRect[] = [
  { minX: -388, maxX: 388, minZ: -8, maxZ: 8 },
  { minX: -8, maxX: 8, minZ: -388, maxZ: 388 },
  { minX: -8, maxX: 388, minZ: 252, maxZ: 268 },
]

const INTER_SECTOR_PERSON_LANE_RECTS: LaneRect[] = [
  { minX: -388, maxX: 388, minZ: -16, maxZ: -12 },
  { minX: -388, maxX: 388, minZ: 12, maxZ: 16 },
  { minX: -16, maxX: -12, minZ: -388, maxZ: 388 },
  { minX: 12, maxX: 16, minZ: -388, maxZ: 388 },
  { minX: -8, maxX: 388, minZ: 244, maxZ: 248 },
  { minX: -8, maxX: 388, minZ: 272, maxZ: 276 },
]

const INTER_SECTOR_VEHICLE_ROUTE_GOALS: Vector3[] = [
  point(-356, 0),
  point(-260, 0),
  point(-130, 0),
  point(0, 0),
  point(130, 0),
  point(260, 0),
  point(356, 0),
  point(0, -112),
  point(0, -260),
  point(0, -356),
  point(0, 130),
  point(0, 260),
  point(0, 356),
  point(130, 260),
  point(260, 260),
  point(356, 260),
]

const INTER_SECTOR_PERSON_ROUTE_GOALS: Vector3[] = [
  point(-356, -14),
  point(-260, -14),
  point(-130, -14),
  point(0, -14),
  point(130, -14),
  point(260, -14),
  point(356, -14),
  point(-356, 14),
  point(-260, 14),
  point(-130, 14),
  point(0, 14),
  point(130, 14),
  point(260, 14),
  point(356, 14),
  point(-14, -112),
  point(-14, -260),
  point(-14, -356),
  point(-14, 0),
  point(-14, 130),
  point(-14, 260),
  point(-14, 356),
  point(14, -112),
  point(14, -260),
  point(14, -356),
  point(14, 0),
  point(14, 130),
  point(14, 260),
  point(14, 356),
  point(130, 246),
  point(260, 246),
  point(356, 246),
  point(130, 274),
  point(260, 274),
  point(356, 274),
]

const BASE_CAMPUS_EQUIPMENT_PLACEMENTS: EquipmentPlacement[] = [
  { name: '加氢反应器 R-101', position: point(-80, -33) },
  { name: '加氢反应器 R-102', position: point(-74, -31) },
  { name: '循环压缩机撬 C-401', position: point(-39, -31) },
  { name: '换热器组 E-301', position: point(-67, -18) },
  { name: '分馏塔 T-201', position: point(-58, -33) },
  { name: '吸收塔 T-202', position: point(-58, -28) },
  { name: '再生塔 T-203', position: point(-46, -30) },
  { name: '火炬气压缩机 C-402', position: point(-31, -24) },
  { name: '蒸汽分配撬 U-101', position: point(-45, -18) },
  { name: '原料罐 TK-101', position: point(42, -31) },
  { name: '原料罐 TK-102', position: point(42, -26) },
  { name: '中间罐 TK-201', position: point(42, -17) },
  { name: '成品罐 TK-301', position: point(66, -34) },
  { name: '成品罐 TK-302', position: point(78, -22) },
  { name: '计量撬 M-601', position: point(59, -17) },
  { name: '装车气相回收撬 VRU-101', position: point(10, 74) },
  { name: '装车泵房 P-501', position: point(74, -17) },
  {
    name: '装车鹤管 LD-101',
    position: point(LOGISTICS_BAY_OFFSETS[0], 70),
    repeatable: false,
    spread: { x: 0.35, z: 0.35 },
  },
  {
    name: '装车鹤管 LD-102',
    position: point(LOGISTICS_BAY_OFFSETS[1], 70),
    repeatable: false,
    spread: { x: 0.35, z: 0.35 },
  },
  {
    name: '装车鹤管 LD-103',
    position: point(LOGISTICS_BAY_OFFSETS[2], 70),
    repeatable: false,
    spread: { x: 0.35, z: 0.35 },
  },
  {
    name: '装车鹤管 LD-104',
    position: point(LOGISTICS_BAY_OFFSETS[3], 70),
    repeatable: false,
    spread: { x: 0.35, z: 0.35 },
  },
  {
    name: '装车鹤管 LD-105',
    position: point(LOGISTICS_BAY_OFFSETS[4], 70),
    repeatable: false,
    spread: { x: 0.35, z: 0.35 },
  },
  { name: '仓储分拣站 WH-101', position: point(-72, 74) },
  { name: '发运调度中心 LG-201', position: point(68, 74) },
  { name: '循环水塔 CT-101', position: point(-60, -72) },
  { name: '冷却水泵房 CW-201', position: point(-36, -74) },
  { name: '污水调节池 WW-101', position: point(12, -72) },
  { name: '生化处理池 WW-201', position: point(34, -72) },
  { name: '污水提升泵 WW-301', position: point(48, -74) },
  { name: '变电站 SS-101', position: point(72, -72) },
  { name: '火炬分液罐 FL-101', position: point(92, -50) },
  { name: '氮气站 UT-401', position: point(-6, -72) },
  { name: '消防泡沫站 FS-201', position: point(-20, 91), repeatable: false },
  { name: '消防水泵 FP-101', position: point(-8, -94), repeatable: false },
  { name: '无人地磅 WB-101', position: point(104, 86), repeatable: false },
  { name: '铁路道岔 RS-101', position: point(-84, 106), repeatable: false },
  { name: '铁路道岔 RS-102', position: point(84, 106), repeatable: false },
  { name: '装车 ESD 面板 ESD-501', position: point(57, 68), repeatable: false },
  { name: '可燃气体检测器 GD-301', position: point(87, -28), repeatable: false },
  { name: '西北 AI 摄像塔 CAM-101', position: point(-104, -104), repeatable: false },
  { name: '东北 AI 摄像塔 CAM-102', position: point(104, -104), repeatable: false },
  { name: '北门车牌识别 CAM-201', position: point(12, -108), repeatable: false },
  { name: '光伏逆变柜 PV-101', position: point(22, 91), repeatable: false },
  { name: '危化仓储货架 WH-301', position: point(-72, 90), repeatable: false },
  { name: '车辆闸机 GT-101', position: point(0, -112), repeatable: false },
]

const BASE_PERSON_ANCHORS: Vector3[] = [
  point(-88, -30),
  point(-70, -14),
  point(-50, -14),
  point(-30, -14),
  point(-22, -8),
  point(34, -10),
  point(54, -14),
  point(78, -10),
  point(-60, 56),
  point(-12, 56),
  point(36, 56),
  point(-48, -82),
  point(22, -72),
  point(72, -82),
  point(-20, 66),
  point(22, 91),
  point(88, 82),
  point(0, 106),
  point(-8, -82),
  point(-12, -112),
]

export const VEHICLE_TYPES: Array<VehicleEntity['vehicleType']> = ['car', 'truck', 'forklift', 'agv']

const BASE_VEHICLE_ANCHORS: Record<VehicleEntity['vehicleType'], Vector3[]> = {
  car: [
    point(-88, 54),
    point(-24, 54),
    point(12, 54),
    point(82, 54),
    point(-74, -4),
    point(72, -4),
  ],
  truck: [
    point(LOGISTICS_BAY_OFFSETS[0], 54),
    point(LOGISTICS_BAY_OFFSETS[1], 54),
    point(LOGISTICS_BAY_OFFSETS[2], 54),
    point(LOGISTICS_BAY_OFFSETS[3], 54),
    point(LOGISTICS_BAY_OFFSETS[4], 54),
    point(104, 86),
    point(-84, 106),
    point(84, 106),
  ],
  forklift: [
    point(-72, 66),
    point(66, 66),
    point(58, -6),
    point(-58, -6),
  ],
  agv: [
    point(-32, -4),
    point(30, -4),
    point(-28, -72),
    point(56, -72),
  ],
  other: [point(0, 54)],
}

const BASE_VEHICLE_LANE_RECTS: LaneRect[] = [
  { minX: -100, maxX: 100, minZ: 48, maxZ: 62 },
  { minX: -6, maxX: 6, minZ: -86, maxZ: 62 },
  { minX: -92, maxX: -84, minZ: -42, maxZ: 62 },
  { minX: 82, maxX: 90, minZ: -42, maxZ: 62 },
  { minX: -96, maxX: 92, minZ: -80, maxZ: -64 },
  { minX: -96, maxX: 92, minZ: -10, maxZ: 2 },
  { minX: -90, maxX: -48, minZ: 66, maxZ: 80 },
  { minX: 46, maxX: 90, minZ: 66, maxZ: 80 },
]

const BASE_PERSON_LANE_RECTS: LaneRect[] = [
  { minX: -100, maxX: 100, minZ: 42, maxZ: 46 },
  { minX: -100, maxX: 100, minZ: 64, maxZ: 68 },
  { minX: -10, maxX: -6, minZ: -86, maxZ: 62 },
  { minX: 6, maxX: 10, minZ: -86, maxZ: 62 },
  { minX: -90, maxX: -86, minZ: -42, maxZ: 62 },
  { minX: 82, maxX: 86, minZ: -42, maxZ: 62 },
  { minX: -96, maxX: 92, minZ: -64, maxZ: -60 },
  { minX: -96, maxX: 92, minZ: -84, maxZ: -80 },
  { minX: -88, maxX: -20, minZ: -16, maxZ: -12 },
  { minX: -88, maxX: -20, minZ: -42, maxZ: -38 },
  { minX: -69, maxX: -65, minZ: -40, maxZ: -12 },
  { minX: -50, maxX: -46, minZ: -40, maxZ: -12 },
  { minX: 28, maxX: 80, minZ: -14, maxZ: -10 },
  { minX: 28, maxX: 80, minZ: -40, maxZ: -36 },
  { minX: 52, maxX: 56, minZ: -40, maxZ: -10 },
  { minX: -86, maxX: -48, minZ: 80, maxZ: 84 },
  { minX: 48, maxX: 90, minZ: 80, maxZ: 84 },
]

const BASE_VEHICLE_ROUTE_GOALS: Vector3[] = [
  point(-92, 54),
  point(-60, 54),
  point(-28, 54),
  point(4, 54),
  point(36, 54),
  point(68, 54),
  point(96, 54),
  point(0, 32),
  point(0, 4),
  point(0, -24),
  point(0, -72),
  point(-88, 30),
  point(-88, 2),
  point(-88, -26),
  point(-88, -72),
  point(86, 30),
  point(86, 2),
  point(86, -26),
  point(86, -72),
  point(-84, -4),
  point(-36, -4),
  point(32, -4),
  point(86, -4),
  point(-68, 72),
  point(68, 72),
]

const BASE_PERSON_ROUTE_GOALS: Vector3[] = [
  point(-92, 44),
  point(-64, 44),
  point(-28, 44),
  point(8, 44),
  point(40, 44),
  point(72, 44),
  point(-92, 66),
  point(-56, 66),
  point(-16, 66),
  point(20, 66),
  point(60, 66),
  point(92, 66),
  point(-8, 20),
  point(-8, -10),
  point(-8, -44),
  point(-8, -82),
  point(8, 20),
  point(8, -10),
  point(8, -44),
  point(8, -82),
  point(-88, -40),
  point(-66, -14),
  point(-48, -14),
  point(-30, -14),
  point(34, -12),
  point(54, -12),
  point(78, -12),
  point(34, -38),
  point(54, -38),
  point(78, -38),
  point(-92, -62),
  point(-56, -62),
  point(-12, -62),
  point(28, -62),
  point(72, -62),
  point(-92, -82),
  point(-52, -82),
  point(0, -82),
  point(52, -82),
  point(88, -82),
  point(-68, 82),
  point(68, 82),
]

const BASE_VEHICLE_ROUTE_LOOPS: Vector3[][] = [
  [
    point(-92, 54),
    point(-28, 54),
    point(36, 54),
    point(96, 54),
    point(86, 30),
    point(86, 2),
    point(86, -72),
    point(0, -72),
    point(-88, -72),
    point(-88, 2),
    point(-88, 30),
  ],
  [
    point(-68, 72),
    point(68, 72),
    point(96, 54),
    point(68, 54),
    point(4, 54),
    point(-60, 54),
    point(-92, 54),
    point(-88, 30),
    point(-88, 2),
  ],
  [
    point(-84, -4),
    point(-36, -4),
    point(32, -4),
    point(86, -4),
    point(86, -26),
    point(86, -72),
    point(0, -72),
    point(-88, -72),
    point(-88, -26),
  ],
  [
    point(0, 32),
    point(0, 4),
    point(0, -24),
    point(0, -72),
    point(86, -72),
    point(86, 2),
    point(68, 54),
    point(4, 54),
    point(-60, 54),
    point(-88, 30),
  ],
]

export const CAMPUS_ZONES: ZoneBlueprint[] = CAMPUS_SECTORS.flatMap((sector) =>
  CAMPUS_ZONE_BLUEPRINTS.map((zone) => ({
    ...zone,
    name: withSectorName(zone.name, sector),
    center: offsetPoint(zone.center, sector.offset),
  }))
)

export const CAMPUS_EQUIPMENT_PLACEMENTS: EquipmentPlacement[] = CAMPUS_SECTORS.flatMap((sector) =>
  BASE_CAMPUS_EQUIPMENT_PLACEMENTS.map((placement) => ({
    ...placement,
    name: withSectorName(placement.name, sector),
    position: offsetPoint(placement.position, sector.offset),
  }))
)

export const EQUIPMENT_ANCHORS = CAMPUS_EQUIPMENT_PLACEMENTS

export const PERSON_ANCHORS: Vector3[] = CAMPUS_SECTORS.flatMap((sector) =>
  BASE_PERSON_ANCHORS.map((anchor) => offsetPoint(anchor, sector.offset))
)

export const VEHICLE_ANCHORS: Record<VehicleEntity['vehicleType'], Vector3[]> = {
  car: CAMPUS_SECTORS.flatMap((sector) =>
    BASE_VEHICLE_ANCHORS.car.map((anchor) => offsetPoint(anchor, sector.offset))
  ),
  truck: CAMPUS_SECTORS.flatMap((sector) =>
    BASE_VEHICLE_ANCHORS.truck.map((anchor) => offsetPoint(anchor, sector.offset))
  ),
  forklift: CAMPUS_SECTORS.flatMap((sector) =>
    BASE_VEHICLE_ANCHORS.forklift.map((anchor) => offsetPoint(anchor, sector.offset))
  ),
  agv: CAMPUS_SECTORS.flatMap((sector) =>
    BASE_VEHICLE_ANCHORS.agv.map((anchor) => offsetPoint(anchor, sector.offset))
  ),
  other: CAMPUS_SECTORS.flatMap((sector) =>
    BASE_VEHICLE_ANCHORS.other.map((anchor) => offsetPoint(anchor, sector.offset))
  ),
}

export const VEHICLE_LANE_RECTS: LaneRect[] = [
  ...CAMPUS_SECTORS.flatMap((sector) =>
    BASE_VEHICLE_LANE_RECTS.map((lane) => offsetLaneRect(lane, sector.offset))
  ),
  ...INTER_SECTOR_VEHICLE_LANE_RECTS,
]

export const PERSON_LANE_RECTS: LaneRect[] = [
  ...CAMPUS_SECTORS.flatMap((sector) =>
    BASE_PERSON_LANE_RECTS.map((lane) => offsetLaneRect(lane, sector.offset))
  ),
  ...INTER_SECTOR_PERSON_LANE_RECTS,
]

export const VEHICLE_ROUTE_GOALS: Vector3[] = [
  ...CAMPUS_SECTORS.flatMap((sector) =>
    BASE_VEHICLE_ROUTE_GOALS.map((goal) => offsetPoint(goal, sector.offset))
  ),
  ...INTER_SECTOR_VEHICLE_ROUTE_GOALS,
]

export const PERSON_ROUTE_GOALS: Vector3[] = [
  ...CAMPUS_SECTORS.flatMap((sector) =>
    BASE_PERSON_ROUTE_GOALS.map((goal) => offsetPoint(goal, sector.offset))
  ),
  ...INTER_SECTOR_PERSON_ROUTE_GOALS,
]

export const VEHICLE_ROUTE_LOOPS: Vector3[][] = [
  ...CAMPUS_SECTORS.flatMap((sector) =>
    BASE_VEHICLE_ROUTE_LOOPS.map((loop) =>
      loop.map((waypoint) => offsetPoint(waypoint, sector.offset))
    )
  ),
]

function expandCampusBoundsForPoint(
  bounds: { min: Vector3; max: Vector3 },
  position: Vector3,
  margin = 0
) {
  bounds.min.x = Math.min(bounds.min.x, position.x - margin)
  bounds.min.z = Math.min(bounds.min.z, position.z - margin)
  bounds.max.x = Math.max(bounds.max.x, position.x + margin)
  bounds.max.z = Math.max(bounds.max.z, position.z + margin)
}

function expandCampusBoundsForLane(bounds: { min: Vector3; max: Vector3 }, lane: LaneRect) {
  expandCampusBoundsForPoint(bounds, point(lane.minX, lane.minZ))
  expandCampusBoundsForPoint(bounds, point(lane.maxX, lane.maxZ))
}

function createCampusBounds() {
  const bounds = {
    min: point(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
    max: point(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY),
  }

  for (const sector of CAMPUS_SECTORS) {
    expandCampusBoundsForPoint(bounds, sector.offset, CAMPUS_SECTOR_HALF_EXTENT)
  }

  for (const lane of [...VEHICLE_LANE_RECTS, ...PERSON_LANE_RECTS]) {
    expandCampusBoundsForLane(bounds, lane)
  }

  for (const point of [
    ...VEHICLE_ROUTE_GOALS,
    ...PERSON_ROUTE_GOALS,
    ...VEHICLE_ROUTE_LOOPS.flat(),
    ...PERSON_ANCHORS,
    ...Object.values(VEHICLE_ANCHORS).flat(),
    ...EQUIPMENT_ANCHORS.map((placement) => placement.position),
  ]) {
    expandCampusBoundsForPoint(bounds, point)
  }

  return bounds
}

export const CAMPUS_BOUNDS = createCampusBounds()

export const DEFAULT_SCENE_COUNTS: SceneEntityCounts = {
  persons: 24 * CAMPUS_SECTORS.length,
  vehicles: 11 * CAMPUS_SECTORS.length,
  equipment: EQUIPMENT_ANCHORS.length,
}

export const PRODUCTION_SCENE_COUNTS: SceneEntityCounts = {
  persons: 80 * CAMPUS_SECTORS.length,
  vehicles: 45 * CAMPUS_SECTORS.length,
  equipment: EQUIPMENT_ANCHORS.length * 2,
}
