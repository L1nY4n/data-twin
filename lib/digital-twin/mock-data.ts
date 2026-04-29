import type {
  PersonEntity,
  VehicleEntity,
  EquipmentEntity,
  ZoneEntity,
  Vector3,
} from './types'
import {
  CAMPUS_BOUNDS,
  CAMPUS_ZONES,
  EQUIPMENT_ANCHORS,
  PERSON_ANCHORS,
  PERSON_LANE_RECTS,
  PERSON_ROUTE_GOALS,
  VEHICLE_ANCHORS,
  VEHICLE_LANE_RECTS,
  VEHICLE_ROUTE_GOALS,
  VEHICLE_ROUTE_LOOPS,
  VEHICLE_TYPES,
  type LaneRect,
  type PlantMobilityType,
} from './campus-layout'
import { createPublishedCampusScenePackage, hydratePublishedScenePackage } from './publish'
import {
  MAX_DYNAMIC_FOOTPRINT_SEPARATION,
  PERSON_FOOTPRINT_RADIUS,
  VEHICLE_FOOTPRINT_CLEARANCE,
  getVehicleFootprintRadius,
  getVehicleSeparationDistance,
} from './vehicle-footprint'

// 生成唯一ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// 随机数范围
function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

// 随机选择
function randomChoice<T>(array: readonly T[]): T {
  return array[Math.floor(Math.random() * array.length)]
}

function randomPositionAround(anchor: Vector3, spread: { x: number; z: number }): Vector3 {
  return {
    x: anchor.x + randomRange(-spread.x, spread.x),
    y: anchor.y,
    z: anchor.z + randomRange(-spread.z, spread.z),
  }
}

const DEFAULT_EQUIPMENT_SPREAD = { x: 1, z: 1 }

function resolveEquipmentSpread(
  anchor: { spread?: { x: number; z: number } },
  fallback: { x: number; z: number } = DEFAULT_EQUIPMENT_SPREAD
) {
  return anchor.spread ?? fallback
}

// 人员角色
const PERSON_ROLE_PROFILES = [
  {
    role: '外操',
    department: '生产运行部',
    employeePrefix: 'OPR',
    activities: ['巡检中', '切换流程中', '现场核对'],
  },
  {
    role: '内操',
    department: '生产运行部',
    employeePrefix: 'CCR',
    activities: ['DCS监盘', '工艺切换监护', '参数复核'],
  },
  {
    role: '巡检工程师',
    department: '设备维护部',
    employeePrefix: 'INS',
    activities: ['设备点检', '状态确认', '缺陷复查'],
  },
  {
    role: '仪表技术员',
    department: '仪表自动化部',
    employeePrefix: 'IAC',
    activities: ['仪表校验', '联锁核查', '回路测试'],
  },
  {
    role: '设备维修工',
    department: '设备维护部',
    employeePrefix: 'MNT',
    activities: ['维修作业', '备件核对', '作业许可办理'],
  },
  {
    role: 'HSE监督员',
    department: 'HSE部',
    employeePrefix: 'HSE',
    activities: ['作业监护', '风险巡查', '现场抽查'],
  },
] as const
const PERSON_SHIFTS = ['甲班', '乙班', '丙班', '常白班']
const PERSON_FAMILY_NAMES = [
  '赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈',
  '褚', '卫', '蒋', '沈', '韩', '杨', '朱', '秦', '尤', '许',
  '何', '吕', '施', '张', '孔', '曹', '严', '华', '金', '魏',
  '陶', '姜', '谢', '邹', '喻', '柏', '水', '窦', '章', '云',
]
const PERSON_GIVEN_NAME_PREFIXES = [
  '建', '志', '文', '晓', '明', '国', '海', '天', '博', '承',
  '嘉', '宇', '思', '俊', '维', '安', '晨', '宏', '泽', '景',
]
const PERSON_GIVEN_NAME_SUFFIXES = [
  '伟', '磊', '涛', '鹏', '超', '峰', '杰', '斌', '凯', '洋',
  '宁', '辰', '轩', '豪', '瑞', '阳', '琳', '静', '颖', '婷',
]
const PLATE_PREFIXES = ['京', '沪', '粤', '苏', '浙']
const VEHICLE_NAME_STANDARDS: Record<
  VehicleEntity['vehicleType'],
  { label: string; assetPrefix: string }
> = {
  car: { label: '厂内巡检车', assetPrefix: 'IP' },
  truck: { label: '危化品槽车', assetPrefix: 'HT' },
  forklift: { label: '电动叉车', assetPrefix: 'FL' },
  agv: { label: '采样AGV', assetPrefix: 'AGV' },
  other: { label: '运维保障车', assetPrefix: 'MT' },
}

function hashSeed(seed: string): number {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 131 + seed.charCodeAt(index)) >>> 0
  }
  return hash
}

function buildSeededCode(seed: string, width: number, min: number, span: number): string {
  const numeric = min + (hashSeed(seed) % span)
  return String(numeric).padStart(width, '0')
}

function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | null {
  const value = metadata?.[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function resolvePersonRoleProfile(role?: string) {
  return PERSON_ROLE_PROFILES.find((profile) => profile.role === role) ?? null
}

function buildPersonDisplayName(seed: string) {
  const hash = hashSeed(seed)
  const familyName = PERSON_FAMILY_NAMES[hash % PERSON_FAMILY_NAMES.length]
  const givenPrefix =
    PERSON_GIVEN_NAME_PREFIXES[Math.floor(hash / PERSON_FAMILY_NAMES.length) % PERSON_GIVEN_NAME_PREFIXES.length]
  const givenSuffix =
    PERSON_GIVEN_NAME_SUFFIXES[
      Math.floor(hash / (PERSON_FAMILY_NAMES.length * PERSON_GIVEN_NAME_PREFIXES.length)) %
        PERSON_GIVEN_NAME_SUFFIXES.length
    ]
  return `${familyName}${givenPrefix}${givenSuffix}`
}

function buildEmployeeNo(seed: string, prefix: string) {
  return `${prefix}-${buildSeededCode(seed, 4, 1000, 9000)}`
}

function buildVehicleAssetCode(seed: string, vehicleType: VehicleEntity['vehicleType']) {
  const standard = VEHICLE_NAME_STANDARDS[vehicleType]
  return `${standard.assetPrefix}-${buildSeededCode(seed, 3, 101, 899)}`
}

export function formatRepeatedEquipmentName(name: string, instanceNumber: number) {
  if (instanceNumber <= 1) return name
  return `${name}-${String(instanceNumber).padStart(2, '0')}`
}

// 默认场景边界
const DEFAULT_BOUNDS = CAMPUS_BOUNDS

interface MobilityGrid {
  lanes: LaneRect[]
  goals: Vector3[]
  traversable: boolean[]
  traversableIndices: number[]
  cols: number
  rows: number
  cellSize: number
  bounds: { min: Vector3; max: Vector3 }
}

interface DynamicOccupant {
  id: string
  type: PlantMobilityType
  position: Vector3
  vehicleType?: VehicleEntity['vehicleType']
}

interface DynamicOccupancyIndex {
  cellSize: number
  buckets: Map<string, DynamicOccupant[]>
  occupants: Map<string, { occupant: DynamicOccupant; bucketKey: string }>
}

const ROUTE_CELL_SIZE = 2
const PERSON_SPEED = 0.42
const PERSON_ARRIVE_TOLERANCE = 0.2
const DYNAMIC_OCCUPANCY_CELL_SIZE = 4
export const DYNAMIC_NEIGHBOR_QUERY_RADIUS = MAX_DYNAMIC_FOOTPRINT_SEPARATION

function isPointInsideLane(point: Vector3, lane: LaneRect): boolean {
  return (
    point.x >= lane.minX &&
    point.x <= lane.maxX &&
    point.z >= lane.minZ &&
    point.z <= lane.maxZ
  )
}

function createMobilityGrid(
  lanes: LaneRect[],
  goals: Vector3[],
  bounds = DEFAULT_BOUNDS,
  cellSize = ROUTE_CELL_SIZE
): MobilityGrid {
  const cols = Math.floor((bounds.max.x - bounds.min.x) / cellSize) + 1
  const rows = Math.floor((bounds.max.z - bounds.min.z) / cellSize) + 1
  const traversable = new Array<boolean>(cols * rows).fill(false)
  const traversableIndices: number[] = []

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col
      const point = {
        x: bounds.min.x + col * cellSize,
        y: 0,
        z: bounds.min.z + row * cellSize,
      }

      if (lanes.some((lane) => isPointInsideLane(point, lane))) {
        traversable[index] = true
        traversableIndices.push(index)
      }
    }
  }

  return {
    lanes,
    goals,
    traversable,
    traversableIndices,
    cols,
    rows,
    cellSize,
    bounds,
  }
}

const MOBILITY_GRIDS: Record<PlantMobilityType, MobilityGrid> = {
  person: createMobilityGrid(PERSON_LANE_RECTS, PERSON_ROUTE_GOALS),
  vehicle: createMobilityGrid(VEHICLE_LANE_RECTS, VEHICLE_ROUTE_GOALS),
}

function getGrid(type: PlantMobilityType): MobilityGrid {
  return MOBILITY_GRIDS[type]
}

function pointFromCell(grid: MobilityGrid, index: number, y = 0): Vector3 {
  const row = Math.floor(index / grid.cols)
  const col = index % grid.cols
  return {
    x: grid.bounds.min.x + col * grid.cellSize,
    y,
    z: grid.bounds.min.z + row * grid.cellSize,
  }
}

function nearestTraversableCellIndex(type: PlantMobilityType, point: Vector3): number | null {
  const grid = getGrid(type)
  let bestIndex: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const index of grid.traversableIndices) {
    const cellPoint = pointFromCell(grid, index)
    const distance = Math.hypot(point.x - cellPoint.x, point.z - cellPoint.z)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }

  return bestIndex
}

function neighborIndices(grid: MobilityGrid, index: number): number[] {
  const row = Math.floor(index / grid.cols)
  const col = index % grid.cols
  const result: number[] = []

  if (col > 0) result.push(index - 1)
  if (col < grid.cols - 1) result.push(index + 1)
  if (row > 0) result.push(index - grid.cols)
  if (row < grid.rows - 1) result.push(index + grid.cols)

  return result
}

function compressRoute(indices: number[], grid: MobilityGrid, y: number): Vector3[] {
  if (indices.length === 0) return []
  if (indices.length === 1) return [pointFromCell(grid, indices[0], y)]

  const result: Vector3[] = [pointFromCell(grid, indices[0], y)]

  for (let i = 1; i < indices.length - 1; i += 1) {
    const prev = indices[i - 1]
    const current = indices[i]
    const next = indices[i + 1]

    const prevRow = Math.floor(prev / grid.cols)
    const prevCol = prev % grid.cols
    const currRow = Math.floor(current / grid.cols)
    const currCol = current % grid.cols
    const nextRow = Math.floor(next / grid.cols)
    const nextCol = next % grid.cols

    const dirACol = currCol - prevCol
    const dirARow = currRow - prevRow
    const dirBCol = nextCol - currCol
    const dirBRow = nextRow - currRow

    if (dirACol !== dirBCol || dirARow !== dirBRow) {
      result.push(pointFromCell(grid, current, y))
    }
  }

  result.push(pointFromCell(grid, indices[indices.length - 1], y))
  return result
}

function pointsClose2D(a: Vector3, b: Vector3, tolerance = 0.6): boolean {
  return Math.hypot(a.x - b.x, a.z - b.z) <= tolerance
}

function toVector3(
  value: unknown,
  bounds: { min: Vector3; max: Vector3 },
  fallbackY: number
): Vector3 | null {
  if (!value || typeof value !== 'object') return null
  const maybe = value as Partial<Vector3>
  const x = typeof maybe.x === 'number' ? maybe.x : Number.NaN
  const z = typeof maybe.z === 'number' ? maybe.z : Number.NaN
  const y = typeof maybe.y === 'number' ? maybe.y : fallbackY

  if (!Number.isFinite(x) || !Number.isFinite(z)) return null
  if (x < bounds.min.x || x > bounds.max.x || z < bounds.min.z || z > bounds.max.z) return null

  return { x, y, z }
}

function readRoutePoints(
  metadata: Record<string, unknown> | undefined,
  bounds: { min: Vector3; max: Vector3 },
  fallbackY: number
): Vector3[] | null {
  if (!Array.isArray(metadata?.routePoints)) return null
  const routePoints: Vector3[] = []

  for (const point of metadata.routePoints) {
    const parsed = toVector3(point, bounds, fallbackY)
    if (!parsed) return null
    routePoints.push(parsed)
  }

  return routePoints.length > 0 ? routePoints : null
}

function readRouteGoal(
  metadata: Record<string, unknown> | undefined,
  bounds: { min: Vector3; max: Vector3 },
  fallbackY: number
): Vector3 | null {
  return toVector3(metadata?.routeGoal, bounds, fallbackY)
}

function readRouteIndex(metadata: Record<string, unknown> | undefined, routeLength: number): number {
  const raw = metadata?.routeIndex
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return 0
  if (raw < 0 || raw >= routeLength) return 0
  return raw
}

function createRouteMetadata(
  routePoints: Vector3[],
  routeIndex: number,
  routeGoal: Vector3,
  moveTarget: Vector3
): Record<string, unknown> {
  return {
    routeDirect: false,
    routePoints: routePoints.map((point) => ({ x: point.x, y: point.y, z: point.z })),
    routeIndex,
    routeGoal: { x: routeGoal.x, y: routeGoal.y, z: routeGoal.z },
    moveTarget: { x: moveTarget.x, y: moveTarget.y, z: moveTarget.z },
  }
}

function createDirectTargetMetadata(
  moveTarget: Vector3,
  extras?: Record<string, unknown>
): Record<string, unknown> {
  return {
    routeDirect: true,
    routePoints: undefined,
    routeIndex: undefined,
    routeGoal: { x: moveTarget.x, y: moveTarget.y, z: moveTarget.z },
    moveTarget: { x: moveTarget.x, y: moveTarget.y, z: moveTarget.z },
    ...(extras ?? {}),
  }
}

const VEHICLE_PATROL_LOOPS: Vector3[][] = VEHICLE_ROUTE_LOOPS

function cloneRouteLoop(loop: Vector3[]): Vector3[] {
  return loop.map((point) => ({ x: point.x, y: point.y, z: point.z }))
}

function readRouteLoop(
  metadata: Record<string, unknown> | undefined,
  bounds: { min: Vector3; max: Vector3 },
  fallbackY: number
): Vector3[] | null {
  if (!Array.isArray(metadata?.routeLoop)) return null
  const routeLoop: Vector3[] = []
  for (const point of metadata.routeLoop) {
    const parsed = toVector3(point, bounds, fallbackY)
    if (!parsed) return null
    routeLoop.push(parsed)
  }
  return routeLoop.length > 1 ? routeLoop : null
}

function readRouteLoopIndex(metadata: Record<string, unknown> | undefined, loopLength: number): number {
  const raw = metadata?.routeLoopIndex
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return 0
  if (raw < 0 || raw >= loopLength) return 0
  return raw
}

function isDirectRoute(metadata: Record<string, unknown> | undefined): boolean {
  return metadata?.routeDirect === true
}

function findClosestWaypointIndex(points: Vector3[], position: Vector3): number {
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]
    const distance = Math.hypot(point.x - position.x, point.z - position.z)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = i
    }
  }
  return bestIndex
}

function selectVehiclePatrolLoop(position: Vector3): Vector3[] {
  let bestLoop = VEHICLE_PATROL_LOOPS[0]
  let bestDistance = Number.POSITIVE_INFINITY
  for (const loop of VEHICLE_PATROL_LOOPS) {
    const distance = loop.reduce(
      (closest, point) => Math.min(closest, Math.hypot(point.x - position.x, point.z - position.z)),
      Number.POSITIVE_INFINITY
    )
    if (distance < bestDistance) {
      bestLoop = loop
      bestDistance = distance
    }
  }
  return cloneRouteLoop(bestLoop)
}

function selectFallbackRouteGoal(
  type: PlantMobilityType,
  position: Vector3,
  yaw: number,
  routeGoal: Vector3 | null,
  routeComplete: boolean,
  forceRandomGoal: boolean
): Vector3 {
  if (!routeComplete && routeGoal !== null) {
    return routeGoal
  }

  if (forceRandomGoal || type === 'person') {
    return selectRandomRouteGoal(type, position)
  }

  return selectForwardRouteGoal(type, position, yaw)
}

function selectRandomRouteGoal(type: PlantMobilityType, current: Vector3): Vector3 {
  const goals = getGrid(type).goals
  const candidates = goals.filter((goal) => Math.hypot(goal.x - current.x, goal.z - current.z) > 6)
  return { ...(candidates.length > 0 ? randomChoice(candidates) : randomChoice(goals)) }
}

function selectForwardRouteGoal(type: PlantMobilityType, current: Vector3, yaw: number): Vector3 {
  const goals = getGrid(type).goals.filter((goal) => Math.hypot(goal.x - current.x, goal.z - current.z) > 6)
  const forwardX = Math.sin(yaw)
  const forwardZ = Math.cos(yaw)
  let bestGoal: Vector3 | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  for (const goal of goals) {
    const dx = goal.x - current.x
    const dz = goal.z - current.z
    const distance = Math.hypot(dx, dz)
    if (distance < 1e-6) continue
    const alignment = (dx * forwardX + dz * forwardZ) / distance
    const score = alignment * 10 - distance * 0.04
    if (score > bestScore) {
      bestScore = score
      bestGoal = goal
    }
  }

  return { ...(bestGoal ?? selectRandomRouteGoal(type, current)) }
}

export function isPointOnPlantMobilityLane(type: PlantMobilityType, point: Vector3): boolean {
  return getGrid(type).lanes.some((lane) => isPointInsideLane(point, lane))
}

function getDynamicSeparationDistance(
  entityType: PlantMobilityType,
  neighborType: PlantMobilityType,
  entityVehicleType?: VehicleEntity['vehicleType'],
  neighborVehicleType?: VehicleEntity['vehicleType']
): number {
  if (entityType === 'vehicle' && neighborType === 'vehicle') {
    return getVehicleSeparationDistance(entityVehicleType, neighborVehicleType)
  }
  if (entityType === 'vehicle' && neighborType === 'person') {
    return getVehicleFootprintRadius(entityVehicleType) + PERSON_FOOTPRINT_RADIUS + VEHICLE_FOOTPRINT_CLEARANCE
  }
  if (entityType === 'person' && neighborType === 'vehicle') {
    return PERSON_FOOTPRINT_RADIUS + getVehicleFootprintRadius(neighborVehicleType) + VEHICLE_FOOTPRINT_CLEARANCE
  }
  return PERSON_FOOTPRINT_RADIUS * 2 + 0.05
}

function bucketKey(position: Vector3, cellSize: number): string {
  return `${Math.floor(position.x / cellSize)}:${Math.floor(position.z / cellSize)}`
}

export function createDynamicOccupancyIndex(
  occupants: DynamicOccupant[],
  cellSize = DYNAMIC_OCCUPANCY_CELL_SIZE
): DynamicOccupancyIndex {
  const index: DynamicOccupancyIndex = {
    cellSize,
    buckets: new Map(),
    occupants: new Map(),
  }

  occupants.forEach((occupant) => {
    const key = bucketKey(occupant.position, cellSize)
    const stored: DynamicOccupant = {
      id: occupant.id,
      type: occupant.type,
      position: { ...occupant.position },
      vehicleType: occupant.type === 'vehicle' ? occupant.vehicleType : undefined,
    }
    const bucket = index.buckets.get(key)
    if (bucket) {
      bucket.push(stored)
    } else {
      index.buckets.set(key, [stored])
    }
    index.occupants.set(occupant.id, { occupant: stored, bucketKey: key })
  })

  return index
}

export function queryDynamicOccupants(
  index: DynamicOccupancyIndex,
  point: Vector3,
  radius: number,
  excludeId?: string
): DynamicOccupant[] {
  const centerX = Math.floor(point.x / index.cellSize)
  const centerZ = Math.floor(point.z / index.cellSize)
  const cellRadius = Math.max(1, Math.ceil(radius / index.cellSize))
  const neighbors: DynamicOccupant[] = []

  for (let dz = -cellRadius; dz <= cellRadius; dz += 1) {
    for (let dx = -cellRadius; dx <= cellRadius; dx += 1) {
      const bucket = index.buckets.get(`${centerX + dx}:${centerZ + dz}`)
      if (!bucket) continue

      for (const occupant of bucket) {
        if (occupant.id === excludeId) continue
        neighbors.push(occupant)
      }
    }
  }

  return neighbors
}

export function updateDynamicOccupancyIndex(
  index: DynamicOccupancyIndex,
  occupantId: string,
  position: Vector3
): void {
  const entry = index.occupants.get(occupantId)
  if (!entry) return

  const nextKey = bucketKey(position, index.cellSize)
  if (nextKey !== entry.bucketKey) {
    const previousBucket = index.buckets.get(entry.bucketKey)
    if (previousBucket) {
      const nextBucketMembers = previousBucket.filter((occupant) => occupant.id !== occupantId)
      if (nextBucketMembers.length > 0) {
        index.buckets.set(entry.bucketKey, nextBucketMembers)
      } else {
        index.buckets.delete(entry.bucketKey)
      }
    }

    const nextBucket = index.buckets.get(nextKey)
    if (nextBucket) {
      nextBucket.push(entry.occupant)
    } else {
      index.buckets.set(nextKey, [entry.occupant])
    }
    entry.bucketKey = nextKey
  }

  entry.occupant.position = { ...position }
}

export function applyDynamicSeparation(
  entityId: string,
  entityType: PlantMobilityType,
  currentPosition: Vector3,
  proposedPosition: Vector3,
  neighbors: DynamicOccupant[],
  entityVehicleType?: VehicleEntity['vehicleType']
): { position: Vector3; blocked: boolean } {
  const hasClearance = (position: Vector3) => {
    for (const neighbor of neighbors) {
      if (neighbor.id === entityId) continue
      const minDistance = getDynamicSeparationDistance(
        entityType,
        neighbor.type,
        entityVehicleType,
        neighbor.vehicleType
      )
      const distance = Math.hypot(position.x - neighbor.position.x, position.z - neighbor.position.z)
      if (distance < minDistance) return false
    }
    return true
  }

  if (hasClearance(proposedPosition)) {
    return {
      position: proposedPosition,
      blocked: false,
    }
  }

  if (entityType === 'vehicle' && hasClearance(currentPosition)) {
    let safeFactor = 0
    let unsafeFactor = 1
    for (let i = 0; i < 10; i += 1) {
      const factor = (safeFactor + unsafeFactor) / 2
      const candidate = {
        x: currentPosition.x + (proposedPosition.x - currentPosition.x) * factor,
        y: currentPosition.y + (proposedPosition.y - currentPosition.y) * factor,
        z: currentPosition.z + (proposedPosition.z - currentPosition.z) * factor,
      }
      if (hasClearance(candidate)) {
        safeFactor = factor
      } else {
        unsafeFactor = factor
      }
    }

    if (safeFactor > 0.02) {
      return {
        position: {
          x: currentPosition.x + (proposedPosition.x - currentPosition.x) * safeFactor,
          y: currentPosition.y + (proposedPosition.y - currentPosition.y) * safeFactor,
          z: currentPosition.z + (proposedPosition.z - currentPosition.z) * safeFactor,
        },
        blocked: false,
      }
    }
  }

  return {
    position: { ...currentPosition },
    blocked: true,
  }
}

export function planPlantRoute(
  type: PlantMobilityType,
  start: Vector3,
  goal: Vector3,
  bounds: { min: Vector3; max: Vector3 } = DEFAULT_BOUNDS
): Vector3[] {
  const grid = getGrid(type)
  const startIndex = nearestTraversableCellIndex(type, start)
  const goalIndex = nearestTraversableCellIndex(type, goal)
  if (startIndex === null || goalIndex === null) return [start, goal]
  if (startIndex === goalIndex) return [pointFromCell(grid, startIndex, start.y), pointFromCell(grid, goalIndex, goal.y)]

  const gScore = new Array<number>(grid.traversable.length).fill(Number.POSITIVE_INFINITY)
  const fScore = new Array<number>(grid.traversable.length).fill(Number.POSITIVE_INFINITY)
  const cameFrom = new Array<number>(grid.traversable.length).fill(-1)
  const openSet = new Set<number>([startIndex])
  gScore[startIndex] = 0
  fScore[startIndex] = Math.abs((startIndex % grid.cols) - (goalIndex % grid.cols)) + Math.abs(Math.floor(startIndex / grid.cols) - Math.floor(goalIndex / grid.cols))

  while (openSet.size > 0) {
    let current = -1
    let lowestScore = Number.POSITIVE_INFINITY

    for (const candidate of openSet) {
      if (fScore[candidate] < lowestScore) {
        lowestScore = fScore[candidate]
        current = candidate
      }
    }

    if (current === goalIndex) {
      const pathIndices: number[] = [current]
      let cursor = current
      while (cameFrom[cursor] !== -1) {
        cursor = cameFrom[cursor]
        pathIndices.push(cursor)
      }
      pathIndices.reverse()
      return compressRoute(pathIndices, grid, start.y)
    }

    openSet.delete(current)

    for (const neighbor of neighborIndices(grid, current)) {
      if (!grid.traversable[neighbor]) continue

      const tentativeScore = gScore[current] + 1
      if (tentativeScore >= gScore[neighbor]) continue

      cameFrom[neighbor] = current
      gScore[neighbor] = tentativeScore
      const heuristic =
        Math.abs((neighbor % grid.cols) - (goalIndex % grid.cols)) +
        Math.abs(Math.floor(neighbor / grid.cols) - Math.floor(goalIndex / grid.cols))
      fScore[neighbor] = tentativeScore + heuristic
      openSet.add(neighbor)
    }
  }

  return [start, clampVectorToBounds(goal, bounds)]
}

function clampVectorToBounds(value: Vector3, bounds: { min: Vector3; max: Vector3 }): Vector3 {
  return {
    x: clamp(value.x, bounds.min.x, bounds.max.x),
    y: value.y,
    z: clamp(value.z, bounds.min.z, bounds.max.z),
  }
}

function resolvePlannedTarget(
  type: PlantMobilityType,
  position: Vector3,
  yaw: number,
  metadata: Record<string, unknown> | undefined,
  bounds: { min: Vector3; max: Vector3 }
): { target: Vector3; metadata?: Record<string, unknown> } {
  const routePoints = readRoutePoints(metadata, bounds, position.y)
  const routeGoal = readRouteGoal(metadata, bounds, position.y) ?? readMoveTarget(metadata, bounds, position.y)
  const routeLoop = type === 'vehicle' ? readRouteLoop(metadata, bounds, position.y) : null
  let routeLoopIndex = routeLoop ? readRouteLoopIndex(metadata, routeLoop.length) : 0
  const forceRandomGoal = metadata?.forceRandomGoal === true
  let routeComplete = false

  if (routeGoal && isDirectRoute(metadata)) {
    const tolerance = type === 'vehicle' ? VEHICLE_ARRIVE_TOLERANCE : PERSON_ARRIVE_TOLERANCE
    if (!pointsClose2D(position, routeGoal, tolerance)) {
      return { target: routeGoal }
    }
    routeComplete = true
  }

  if (routePoints) {
    let routeIndex = readRouteIndex(metadata, routePoints.length)
    let target = routePoints[routeIndex] ?? routePoints[routePoints.length - 1]

    const tolerance = type === 'vehicle' ? VEHICLE_ARRIVE_TOLERANCE : PERSON_ARRIVE_TOLERANCE
    if (pointsClose2D(position, target, tolerance)) {
      routeIndex += 1
      if (routeIndex < routePoints.length) {
        target = routePoints[routeIndex]
        return {
          target,
          metadata: {
            ...createRouteMetadata(routePoints, routeIndex, routeGoal ?? routePoints[routePoints.length - 1], target),
            ...(routeLoop ? { routeLoopIndex } : {}),
          },
        }
      }
      if (routeLoop) {
        routeLoopIndex = (routeLoopIndex + 1) % routeLoop.length
      }
      routeComplete = true
    } else {
      return { target }
    }
  }

  if (routeLoop && pointsClose2D(position, routeLoop[routeLoopIndex], 1.5)) {
    routeLoopIndex = (routeLoopIndex + 1) % routeLoop.length
  }

  const nextGoal = routeLoop
    ? routeLoop[routeLoopIndex]
    : selectFallbackRouteGoal(type, position, yaw, routeGoal, routeComplete, forceRandomGoal)
  const plannedRoute = planPlantRoute(type, position, nextGoal, bounds)
  const finalPoint = plannedRoute[plannedRoute.length - 1] ?? nextGoal
  const directPathUsable = plannedRoute.length <= 2 && pointsClose2D(finalPoint, nextGoal, 1.1)
  const needsDirectMetadata = forceRandomGoal || routeLoop !== null || routeComplete || routeGoal === null

  if (directPathUsable) {
    return {
      target: nextGoal,
      metadata:
        needsDirectMetadata
          ? createDirectTargetMetadata(nextGoal, {
              ...(forceRandomGoal ? { forceRandomGoal: false } : {}),
              ...(routeLoop ? { routeLoopIndex } : {}),
            })
          : undefined,
    }
  }

  const routeIndex = plannedRoute.length > 1 ? 1 : 0
  const target = plannedRoute[routeIndex] ?? finalPoint

  return {
    target,
    metadata: {
      ...createRouteMetadata(plannedRoute, routeIndex, nextGoal, target),
      ...(routeLoop ? { routeLoopIndex } : {}),
      ...(forceRandomGoal ? { forceRandomGoal: false } : {}),
    },
  }
}

const VEHICLE_SLOW_RADIUS = 8
const VEHICLE_ARRIVE_TOLERANCE = 0.15
const VEHICLE_MAX_TURN_PER_TICK = Math.PI / 18
const DEFAULT_VEHICLE_CRUISE_SPEED = 6
const VEHICLE_ROUTE_RECOVERY_TICKS = 12
const VEHICLE_ROUTE_METADATA_KEYS = [
  'moveTarget',
  'routeDirect',
  'routePoints',
  'routeIndex',
  'routeGoal',
] as const

function getVehicleCruiseSpeedRange(vehicleType: VehicleEntity['vehicleType']) {
  switch (vehicleType) {
    case 'truck':
      return { min: 4.5, max: 6.5 }
    case 'forklift':
      return { min: 3.2, max: 4.8 }
    case 'agv':
      return { min: 2.8, max: 4.2 }
    case 'car':
      return { min: 5.5, max: 8 }
    default:
      return { min: 4.2, max: 6.2 }
  }
}

function readMetadataNumber(
  metadata: Record<string, unknown> | undefined,
  key: string
): number | null {
  const value = metadata?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function resolveVehicleBlockedMetadata(
  metadata: Record<string, unknown> | undefined,
  blocked: boolean
): Record<string, unknown> | undefined {
  if (!metadata) {
    return blocked ? { blockedTicks: 1 } : undefined
  }

  const blockedTicks = Math.max(0, Math.trunc(readMetadataNumber(metadata, 'blockedTicks') ?? 0))

  if (!blocked) {
    if (blockedTicks === 0) return metadata

    const nextMetadata: Record<string, unknown> = { ...metadata }
    delete nextMetadata.blockedTicks
    return Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined
  }

  const nextMetadata: Record<string, unknown> = {
    ...metadata,
    blockedTicks: blockedTicks + 1,
  }

  if ((nextMetadata.blockedTicks as number) < VEHICLE_ROUTE_RECOVERY_TICKS) {
    return nextMetadata
  }

  delete nextMetadata.blockedTicks
  for (const key of VEHICLE_ROUTE_METADATA_KEYS) {
    delete nextMetadata[key]
  }
  nextMetadata.forceRandomGoal = true
  return Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined
}

function mergeMovementMetadata(
  currentMetadata: Record<string, unknown> | undefined,
  nextMetadata: Record<string, unknown> | undefined,
  extras?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!currentMetadata && !nextMetadata && !extras) return undefined
  return {
    ...(currentMetadata ?? {}),
    ...(nextMetadata ?? {}),
    ...(extras ?? {}),
  }
}

function normalizeRadians(value: number): number {
  let angle = value
  const twoPi = Math.PI * 2
  while (angle <= -Math.PI) angle += twoPi
  while (angle > Math.PI) angle -= twoPi
  return angle
}

function rotateTowards(current: number, target: number, maxDelta: number): number {
  const delta = normalizeRadians(target - current)
  if (Math.abs(delta) <= maxDelta) return target
  return current + Math.sign(delta) * maxDelta
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function selectLaneAlignedYaw(type: PlantMobilityType, position: Vector3): number {
  const lanes = getGrid(type).lanes
  const lane =
    lanes.find((candidate) => isPointInsideLane(position, candidate)) ??
    lanes.reduce((closest, candidate) => {
      const center = {
        x: (candidate.minX + candidate.maxX) / 2,
        z: (candidate.minZ + candidate.maxZ) / 2,
      }
      const closestCenter = {
        x: (closest.minX + closest.maxX) / 2,
        z: (closest.minZ + closest.maxZ) / 2,
      }
      const candidateDistance = Math.hypot(position.x - center.x, position.z - center.z)
      const closestDistance = Math.hypot(position.x - closestCenter.x, position.z - closestCenter.z)
      return candidateDistance < closestDistance ? candidate : closest
    }, lanes[0])

  const width = lane.maxX - lane.minX
  const depth = lane.maxZ - lane.minZ
  if (width >= depth) {
    return randomChoice([Math.PI / 2, -Math.PI / 2])
  }
  return randomChoice([0, Math.PI])
}

function readMoveTarget(
  metadata: Record<string, unknown> | undefined,
  bounds: { min: Vector3; max: Vector3 },
  fallbackY: number
): Vector3 | null {
  const target = (metadata?.moveTarget ?? null) as Partial<Vector3> | null
  if (!target) return null

  const x = typeof target.x === 'number' ? target.x : Number.NaN
  const z = typeof target.z === 'number' ? target.z : Number.NaN
  const y = typeof target.y === 'number' ? target.y : fallbackY

  if (!Number.isFinite(x) || !Number.isFinite(z)) return null
  if (x < bounds.min.x || x > bounds.max.x || z < bounds.min.z || z > bounds.max.z) return null

  if (typeof target.y === 'number') {
    return target as Vector3
  }

  return { x, y, z }
}

// 生成人员实体
export function generatePerson(options?: Partial<PersonEntity>): PersonEntity {
  const id = generateId()
  const roleProfile = resolvePersonRoleProfile(options?.role) ?? randomChoice(PERSON_ROLE_PROFILES)
  const role = options?.role ?? roleProfile.role
  const department = options?.department ?? roleProfile.department
  const anchor = randomChoice(PERSON_ANCHORS)
  const employeeNo =
    readMetadataString(options?.metadata, 'employeeNo') ??
    buildEmployeeNo(`${role}:${department}:${id}`, roleProfile.employeePrefix)
  const shift = readMetadataString(options?.metadata, 'shift') ?? randomChoice(PERSON_SHIFTS)

  return {
    id,
    type: 'person',
    name: options?.name ?? buildPersonDisplayName(`${role}:${department}:${id}`),
    position: options?.position ?? randomPositionAround(anchor, { x: 2.4, z: 2 }),
    rotation: options?.rotation ?? { x: 0, y: randomRange(0, Math.PI * 2), z: 0 },
    scale: options?.scale ?? { x: 1, y: 1, z: 1 },
    status: options?.status ?? 'active',
    visible: options?.visible ?? true,
    metadata: {
      employeeNo,
      shift,
      ...(options?.metadata ?? {}),
    },
    createdAt: options?.createdAt ?? Date.now(),
    updatedAt: options?.updatedAt ?? Date.now(),
    role,
    department,
    schedule: options?.schedule ?? [],
    currentActivity: options?.currentActivity ?? randomChoice(roleProfile.activities),
    avatar: options?.avatar,
    labelMode: options?.labelMode,
  }
}

// 生成车辆实体
export function generateVehicle(options?: Partial<VehicleEntity>): VehicleEntity {
  const id = generateId()
  const vehicleType = options?.vehicleType ?? randomChoice(VEHICLE_TYPES)
  const prefix = randomChoice(PLATE_PREFIXES)
  const vehicleStandard = VEHICLE_NAME_STANDARDS[vehicleType]
  const cruiseSpeedRange = getVehicleCruiseSpeedRange(vehicleType)
  const cruiseSpeed =
    readMetadataNumber(options?.metadata, 'cruiseSpeed') ??
    randomRange(cruiseSpeedRange.min, cruiseSpeedRange.max)
  const assetCode =
    readMetadataString(options?.metadata, 'assetCode') ??
    buildVehicleAssetCode(`${vehicleType}:${id}`, vehicleType)
  const plateNumber = `${prefix}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${Math.floor(
    10000 + Math.random() * 90000
  )}`
  const anchor = randomChoice(VEHICLE_ANCHORS[vehicleType])
  const position = options?.position ?? randomPositionAround(anchor, { x: 2.6, z: 2.2 })
  const rotation = options?.rotation ?? { x: 0, y: selectLaneAlignedYaw('vehicle', position), z: 0 }
  const heading = ((((rotation.y * 180) / Math.PI) % 360) + 360) % 360
  const routeLoop = readRouteLoop(options?.metadata, DEFAULT_BOUNDS, position.y) ?? selectVehiclePatrolLoop(position)
  const routeLoopIndex = options?.metadata
    ? readRouteLoopIndex(options.metadata, routeLoop.length)
    : (findClosestWaypointIndex(routeLoop, position) + 1) % routeLoop.length

  return {
    id,
    type: 'vehicle',
    name: options?.name ?? `${vehicleStandard.label} ${assetCode}`,
    position,
    rotation,
    scale: options?.scale ?? { x: 1, y: 1, z: 1 },
    status: options?.status ?? 'active',
    visible: options?.visible ?? true,
    metadata: {
      assetCode,
      cruiseSpeed,
      routeLoop,
      routeLoopIndex,
      ...(options?.metadata ?? {}),
    },
    createdAt: options?.createdAt ?? Date.now(),
    updatedAt: options?.updatedAt ?? Date.now(),
    plateNumber: options?.plateNumber ?? plateNumber,
    vehicleType,
    speed: options?.speed ?? 0,
    heading: options?.heading ?? heading,
    capacity: options?.capacity ?? (vehicleType === 'truck' ? 5000 : vehicleType === 'forklift' ? 2000 : 100),
    currentLoad: options?.currentLoad ?? 0,
    labelMode: options?.labelMode,
  }
}

// 生成设备实体
export function generateEquipment(options?: Partial<EquipmentEntity>): EquipmentEntity {
  const id = generateId()
  const anchor = randomChoice(EQUIPMENT_ANCHORS)
  const equipmentName = options?.name ?? anchor.name

  return {
    id,
    type: 'equipment',
    name: equipmentName,
    position: options?.position ?? randomPositionAround(anchor.position, resolveEquipmentSpread(anchor)),
    rotation: options?.rotation ?? { x: 0, y: randomRange(0, Math.PI * 2), z: 0 },
    scale: options?.scale ?? { x: 1, y: 1, z: 1 },
    status: options?.status ?? randomChoice(['active', 'active', 'active', 'warning', 'inactive']),
    visible: options?.visible ?? true,
    metadata: {
      assetTag: equipmentName.split(' ').at(-1) ?? equipmentName,
      ...(options?.metadata ?? {}),
    },
    createdAt: options?.createdAt ?? Date.now(),
    updatedAt: options?.updatedAt ?? Date.now(),
    parameters: options?.parameters ?? {
      温度: randomRange(38, 92),
      压力: randomRange(0.2, 2.8),
      流量: randomRange(18, 180),
      运行时间: Math.floor(randomRange(800, 16000)),
    },
    alarms: options?.alarms ?? [],
    modelId: options?.modelId,
    modelUrl: options?.modelUrl,
    maintenanceSchedule: options?.maintenanceSchedule,
    labelMode: options?.labelMode,
  }
}

// 生成区域实体
export function generateZone(
  center: Vector3,
  size: { width: number; depth: number },
  options?: Partial<ZoneEntity>
): ZoneEntity {
  const id = generateId()
  const config = randomChoice(CAMPUS_ZONES)
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
    zoneType: config.zoneType,
    color: config.color,
    accessRules: [],
    capacity: Math.floor(size.width * size.depth / 10),
    currentOccupancy: 0,
    ...options,
  }
}

export interface GenerateMockSceneOptions {
  profile?: 'default' | 'production'
}

// 生成完整的模拟场景
export function generateMockScene(options: GenerateMockSceneOptions = {}): {
  persons: PersonEntity[]
  vehicles: VehicleEntity[]
  equipment: EquipmentEntity[]
  zones: ZoneEntity[]
} {
  const { profile = 'default' } = options
  const publishedScene = createPublishedCampusScenePackage(profile)
  return hydratePublishedScenePackage(publishedScene)
}

interface MovementEntityLike {
  type: 'person' | 'vehicle'
  position: Vector3
  rotation: Vector3
  metadata?: Record<string, unknown>
  speed?: number
}

// 模拟实体移动
export function simulateEntityMovement(
  entity: MovementEntityLike,
  bounds: { min: Vector3; max: Vector3 } = DEFAULT_BOUNDS
): {
  position: Vector3
  rotationY: number
  heading?: number
  speed?: number
  metadata?: Record<string, unknown>
} {
  if (entity.type === 'vehicle') {
    const vehicle = entity as VehicleEntity
    const metadata = entity.metadata as Record<string, unknown> | undefined
    const cruiseSpeed = Math.max(
      readMetadataNumber(metadata, 'cruiseSpeed') ??
        (typeof vehicle.speed === 'number' && vehicle.speed > 0 ? vehicle.speed : DEFAULT_VEHICLE_CRUISE_SPEED),
      0.5
    )
    const maxStep = Math.max(cruiseSpeed / 10, 0.05)
    const routeState = resolvePlannedTarget('vehicle', entity.position, entity.rotation.y, metadata, bounds)
    let target = routeState.target

    let toX = target.x - entity.position.x
    let toZ = target.z - entity.position.z
    let distance = Math.hypot(toX, toZ)

    // 到达目标后重新选择巡航目标
    if (distance <= VEHICLE_ARRIVE_TOLERANCE) {
      const nextRoute = resolvePlannedTarget(
        'vehicle',
        target,
        entity.rotation.y,
        routeState.metadata ?? metadata,
        bounds
      )
      target = nextRoute.target
      toX = target.x - entity.position.x
      toZ = target.z - entity.position.z
      distance = Math.hypot(toX, toZ)
      routeState.metadata = nextRoute.metadata
    }

    const desiredYaw = distance > 1e-6 ? Math.atan2(toX, toZ) : entity.rotation.y
    const rotationY = rotateTowards(entity.rotation.y, desiredYaw, VEHICLE_MAX_TURN_PER_TICK)
    const yawGap = Math.abs(normalizeRadians(desiredYaw - rotationY))

    const turnFactor = Math.max(0.35, 1 - yawGap / Math.PI)
    const arriveFactor = Math.min(distance / VEHICLE_SLOW_RADIUS, 1)
    const step = Math.min(distance, maxStep * arriveFactor * turnFactor)

    const rawX = entity.position.x + Math.sin(rotationY) * step
    const rawZ = entity.position.z + Math.cos(rotationY) * step
    const newX = clamp(rawX, bounds.min.x, bounds.max.x)
    const newZ = clamp(rawZ, bounds.min.z, bounds.max.z)

    const moved = Math.hypot(newX - entity.position.x, newZ - entity.position.z)
    const heading = ((((rotationY * 180) / Math.PI) % 360) + 360) % 360

    return {
      position: {
        x: newX,
        y: entity.position.y,
        z: newZ,
      },
      rotationY,
      heading,
      speed: moved * 10,
      metadata: mergeMovementMetadata(metadata, routeState.metadata, {
        cruiseSpeed,
      }),
    }
  }

  const metadata = entity.metadata as Record<string, unknown> | undefined
  const routeState = resolvePlannedTarget('person', entity.position, entity.rotation.y, metadata, bounds)
  const target = routeState.target
  const toX = target.x - entity.position.x
  const toZ = target.z - entity.position.z
  const distance = Math.hypot(toX, toZ)
  const desiredYaw = distance > 1e-6 ? Math.atan2(toX, toZ) : entity.rotation.y
  const newRotationY = rotateTowards(entity.rotation.y, desiredYaw, Math.PI / 20)
  const step = Math.min(distance, PERSON_SPEED)
  const newX = clamp(entity.position.x + Math.sin(newRotationY) * step, bounds.min.x, bounds.max.x)
  const newZ = clamp(entity.position.z + Math.cos(newRotationY) * step, bounds.min.z, bounds.max.z)

  return {
    position: {
      x: newX,
      y: entity.position.y,
      z: newZ,
    },
    rotationY: newRotationY,
    metadata: mergeMovementMetadata(metadata, routeState.metadata),
  }
}

interface EquipmentStatusLike {
  status: EquipmentEntity['status']
  parameters: Record<string, number | string | boolean>
}

// 模拟设备状态变化
export function simulateEquipmentStatus(
  equipment: EquipmentStatusLike,
  elapsedMs = 1000
): Pick<EquipmentEntity, 'parameters' | 'status'> {
  const params = { ...equipment.parameters }

  // 温度波动
  if (typeof params['温度'] === 'number') {
    params['温度'] = Math.max(20, Math.min(100, params['温度'] + randomRange(-2, 2)))
  }

  // 压力波动
  if (typeof params['压力'] === 'number') {
    params['压力'] = Math.max(0.1, Math.min(3, params['压力'] + randomRange(-0.08, 0.08)))
  }

  // 流量波动
  if (typeof params['流量'] === 'number') {
    params['流量'] = Math.max(0, Math.min(220, params['流量'] + randomRange(-6, 6)))
  }

  // 运行时间增加
  if (typeof params['运行时间'] === 'number') {
    params['运行时间'] = params['运行时间'] + elapsedMs / 1000
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
