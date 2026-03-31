import type {
  PersonEntity,
  VehicleEntity,
  EquipmentEntity,
  ZoneEntity,
  Vector3,
  Entity,
} from './types'

// 生成唯一ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// 随机数范围
function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

// 随机位置
function randomPosition(bounds: { min: Vector3; max: Vector3 }): Vector3 {
  return {
    x: randomRange(bounds.min.x, bounds.max.x),
    y: randomRange(bounds.min.y, bounds.max.y),
    z: randomRange(bounds.min.z, bounds.max.z),
  }
}

// 随机选择
function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]
}

// 人员角色
const ROLES = ['操作员', '工程师', '管理员', '安保人员', '访客', '技术员']
const DEPARTMENTS = ['生产部', '技术部', '安保部', '物流部', '行政部', '质检部']
const ACTIVITIES = ['巡检中', '作业中', '休息', '会议中', '移动中']

// 车辆类型
const VEHICLE_TYPES: Array<VehicleEntity['vehicleType']> = ['car', 'truck', 'forklift', 'agv']
const PLATE_PREFIXES = ['京', '沪', '粤', '苏', '浙']

// 设备类型
const EQUIPMENT_NAMES = [
  '传送带',
  '机械臂',
  '激光切割机',
  '数控机床',
  '压力机',
  '焊接机器人',
  '包装机',
  '检测设备',
]

// 区域类型
const ZONE_CONFIGS: Array<{
  type: ZoneEntity['zoneType']
  name: string
  color: string
}> = [
  { type: 'work', name: '作业区', color: '#22c55e' },
  { type: 'storage', name: '存储区', color: '#3b82f6' },
  { type: 'passage', name: '通道', color: '#a855f7' },
  { type: 'restricted', name: '限制区', color: '#f59e0b' },
  { type: 'danger', name: '危险区', color: '#ef4444' },
]

// 默认场景边界
const DEFAULT_BOUNDS = {
  min: { x: -40, y: 0, z: -40 },
  max: { x: 40, y: 0, z: 40 },
}

// 生成人员实体
export function generatePerson(options?: Partial<PersonEntity>): PersonEntity {
  const id = generateId()
  const role = randomChoice(ROLES)
  const department = randomChoice(DEPARTMENTS)

  return {
    id,
    type: 'person',
    name: `${department}人员${id.slice(-4)}`,
    position: randomPosition(DEFAULT_BOUNDS),
    rotation: { x: 0, y: randomRange(0, Math.PI * 2), z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    status: 'active',
    visible: true,
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    role,
    department,
    schedule: [],
    currentActivity: randomChoice(ACTIVITIES),
    ...options,
  }
}

// 生成车辆实体
export function generateVehicle(options?: Partial<VehicleEntity>): VehicleEntity {
  const id = generateId()
  const vehicleType = randomChoice(VEHICLE_TYPES)
  const prefix = randomChoice(PLATE_PREFIXES)
  const plateNumber = `${prefix}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${Math.floor(
    10000 + Math.random() * 90000
  )}`

  return {
    id,
    type: 'vehicle',
    name: `${vehicleType === 'agv' ? 'AGV' : vehicleType}${id.slice(-4)}`,
    position: randomPosition(DEFAULT_BOUNDS),
    rotation: { x: 0, y: randomRange(0, Math.PI * 2), z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    status: 'active',
    visible: true,
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    plateNumber,
    vehicleType,
    speed: randomRange(0, 10),
    heading: randomRange(0, 360),
    capacity: vehicleType === 'truck' ? 5000 : vehicleType === 'forklift' ? 2000 : 100,
    currentLoad: 0,
    ...options,
  }
}

// 生成设备实体
export function generateEquipment(options?: Partial<EquipmentEntity>): EquipmentEntity {
  const id = generateId()
  const name = randomChoice(EQUIPMENT_NAMES)

  return {
    id,
    type: 'equipment',
    name: `${name}${id.slice(-4)}`,
    position: randomPosition(DEFAULT_BOUNDS),
    rotation: { x: 0, y: randomRange(0, Math.PI * 2), z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    status: randomChoice(['active', 'active', 'active', 'warning', 'inactive']),
    visible: true,
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    parameters: {
      温度: randomRange(20, 80),
      功率: randomRange(0, 100),
      运行时间: Math.floor(randomRange(0, 10000)),
    },
    alarms: [],
    ...options,
  }
}

// 生成区域实体
export function generateZone(
  center: Vector3,
  size: { width: number; depth: number },
  options?: Partial<ZoneEntity>
): ZoneEntity {
  const id = generateId()
  const config = randomChoice(ZONE_CONFIGS)
  const halfWidth = size.width / 2
  const halfDepth = size.depth / 2

  const boundary: Vector3[] = [
    { x: center.x - halfWidth, y: 0, z: center.z - halfDepth },
    { x: center.x + halfWidth, y: 0, z: center.z - halfDepth },
    { x: center.x + halfWidth, y: 0, z: center.z + halfDepth },
    { x: center.x - halfWidth, y: 0, z: center.z + halfDepth },
  ]

  return {
    id,
    type: 'zone',
    name: `${config.name}${id.slice(-4)}`,
    position: center,
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    status: 'active',
    visible: true,
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    boundary,
    zoneType: config.type,
    color: config.color,
    accessRules: [],
    capacity: Math.floor(size.width * size.depth / 10),
    currentOccupancy: 0,
    ...options,
  }
}

// 生成完整的模拟场景
export function generateMockScene(): {
  persons: PersonEntity[]
  vehicles: VehicleEntity[]
  equipment: EquipmentEntity[]
  zones: ZoneEntity[]
} {
  const persons: PersonEntity[] = []
  const vehicles: VehicleEntity[] = []
  const equipment: EquipmentEntity[] = []
  const zones: ZoneEntity[] = []

  // 生成区域
  zones.push(
    generateZone(
      { x: -20, y: 0, z: -20 },
      { width: 15, depth: 15 },
      { name: '生产区A', zoneType: 'work', color: '#22c55e' }
    ),
    generateZone(
      { x: 20, y: 0, z: -20 },
      { width: 15, depth: 15 },
      { name: '生产区B', zoneType: 'work', color: '#22c55e' }
    ),
    generateZone(
      { x: 0, y: 0, z: 20 },
      { width: 20, depth: 10 },
      { name: '仓储区', zoneType: 'storage', color: '#3b82f6' }
    ),
    generateZone(
      { x: -30, y: 0, z: 10 },
      { width: 8, depth: 8 },
      { name: '高压配电室', zoneType: 'danger', color: '#ef4444' }
    ),
    generateZone(
      { x: 30, y: 0, z: 10 },
      { width: 8, depth: 8 },
      { name: '访客限制区', zoneType: 'restricted', color: '#f59e0b' }
    )
  )

  // 生成人员
  for (let i = 0; i < 12; i++) {
    persons.push(generatePerson())
  }

  // 生成车辆
  for (let i = 0; i < 6; i++) {
    vehicles.push(generateVehicle())
  }

  // 生成设备
  const equipmentPositions = [
    { x: -25, y: 0, z: -25 },
    { x: -20, y: 0, z: -20 },
    { x: -15, y: 0, z: -25 },
    { x: 15, y: 0, z: -25 },
    { x: 20, y: 0, z: -20 },
    { x: 25, y: 0, z: -25 },
    { x: -5, y: 0, z: 18 },
    { x: 5, y: 0, z: 18 },
  ]

  equipmentPositions.forEach((pos, i) => {
    equipment.push(
      generateEquipment({
        position: pos,
        name: `${EQUIPMENT_NAMES[i % EQUIPMENT_NAMES.length]}${String(i + 1).padStart(2, '0')}`,
      })
    )
  })

  return { persons, vehicles, equipment, zones }
}

// 模拟实体移动
export function simulateEntityMovement(
  entity: Entity,
  bounds: { min: Vector3; max: Vector3 } = DEFAULT_BOUNDS
): { position: Vector3; rotationY: number } {
  const speed = entity.type === 'vehicle' ? (entity as VehicleEntity).speed / 10 : 0.5
  const angle = entity.rotation.y

  // 约定车头前向为本地 +Z 轴，平面移动需要与该前向保持一致
  let newX = entity.position.x + Math.sin(angle) * speed
  let newZ = entity.position.z + Math.cos(angle) * speed

  // 边界碰撞检测
  if (newX < bounds.min.x || newX > bounds.max.x) {
    newX = entity.position.x
  }
  if (newZ < bounds.min.z || newZ > bounds.max.z) {
    newZ = entity.position.z
  }

  // 随机改变方向
  const newRotationY =
    Math.random() < 0.02
      ? entity.rotation.y + randomRange(-Math.PI / 4, Math.PI / 4)
      : entity.rotation.y

  return {
    position: {
      x: newX,
      y: entity.position.y,
      z: newZ,
    },
    rotationY: newRotationY,
  }
}

// 模拟设备状态变化
export function simulateEquipmentStatus(equipment: EquipmentEntity): Partial<EquipmentEntity> {
  const params = { ...equipment.parameters }

  // 温度波动
  if (typeof params['温度'] === 'number') {
    params['温度'] = Math.max(20, Math.min(100, params['温度'] + randomRange(-2, 2)))
  }

  // 功率波动
  if (typeof params['功率'] === 'number') {
    params['功率'] = Math.max(0, Math.min(100, params['功率'] + randomRange(-5, 5)))
  }

  // 运行时间增加
  if (typeof params['运行时间'] === 'number') {
    params['运行时间'] = params['运行时间'] + 1
  }

  // 状态变化
  let status = equipment.status
  if (typeof params['温度'] === 'number' && params['温度'] > 95) {
    status = 'error'
  } else if (typeof params['温度'] === 'number' && params['温度'] > 85) {
    status = 'warning'
  } else if (Math.random() < 0.01) {
    status = randomChoice(['active', 'active', 'warning'])
  }

  return { parameters: params, status }
}
