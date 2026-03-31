import type { Vector3, Entity, ZoneEntity, SpatialRelation } from './types'

// 计算两点之间的距离
export function calculateDistance(a: Vector3, b: Vector3): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dz = b.z - a.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

// 计算两点之间的水平距离（忽略Y轴）
export function calculateHorizontalDistance(a: Vector3, b: Vector3): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  return Math.sqrt(dx * dx + dz * dz)
}

// 计算从点A到点B的角度（弧度）
export function calculateAngle(from: Vector3, to: Vector3): number {
  const dx = to.x - from.x
  const dz = to.z - from.z
  return Math.atan2(dz, dx)
}

// 计算从点A到点B的角度（度数）
export function calculateAngleDegrees(from: Vector3, to: Vector3): number {
  return (calculateAngle(from, to) * 180) / Math.PI
}

// 计算方向向量（归一化）
export function calculateDirection(from: Vector3, to: Vector3): Vector3 {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz)

  if (length === 0) return { x: 0, y: 0, z: 0 }

  return {
    x: dx / length,
    y: dy / length,
    z: dz / length,
  }
}

// 判断点是否在多边形区域内
export function isPointInZone(point: Vector3, zone: ZoneEntity): boolean {
  return isPointInPolygon(point, zone.boundary)
}

// 射线法判断点是否在多边形内
export function isPointInPolygon(point: Vector3, polygon: Vector3[]): boolean {
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

// 查找附近的实体
export function findNearbyEntities(
  center: Vector3,
  entities: Entity[],
  radius: number,
  excludeId?: string
): Entity[] {
  return entities.filter((entity) => {
    if (excludeId && entity.id === excludeId) return false
    if (entity.type === 'zone') return false
    return calculateDistance(center, entity.position) <= radius
  })
}

// 计算两个实体之间的空间关系
export function calculateSpatialRelation(
  entityA: Entity,
  entityB: Entity
): SpatialRelation {
  const distance = calculateDistance(entityA.position, entityB.position)
  const angle = calculateAngleDegrees(entityA.position, entityB.position)
  const direction = calculateDirection(entityA.position, entityB.position)

  return {
    entityA: entityA.id,
    entityB: entityB.id,
    distance,
    angle,
    direction,
  }
}

// 计算多边形面积（平面，忽略Y轴）
export function calculatePolygonArea(polygon: Vector3[]): number {
  if (polygon.length < 3) return 0

  let area = 0
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length
    area += polygon[i].x * polygon[j].z
    area -= polygon[j].x * polygon[i].z
  }

  return Math.abs(area) / 2
}

// 计算多边形中心点
export function calculatePolygonCenter(polygon: Vector3[]): Vector3 {
  if (polygon.length === 0) return { x: 0, y: 0, z: 0 }

  const sum = polygon.reduce(
    (acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y,
      z: acc.z + point.z,
    }),
    { x: 0, y: 0, z: 0 }
  )

  return {
    x: sum.x / polygon.length,
    y: sum.y / polygon.length,
    z: sum.z / polygon.length,
  }
}

// 计算包围盒
export function calculateBoundingBox(points: Vector3[]): {
  min: Vector3
  max: Vector3
  center: Vector3
  size: Vector3
} {
  if (points.length === 0) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
      center: { x: 0, y: 0, z: 0 },
      size: { x: 0, y: 0, z: 0 },
    }
  }

  const min = { x: Infinity, y: Infinity, z: Infinity }
  const max = { x: -Infinity, y: -Infinity, z: -Infinity }

  points.forEach((point) => {
    min.x = Math.min(min.x, point.x)
    min.y = Math.min(min.y, point.y)
    min.z = Math.min(min.z, point.z)
    max.x = Math.max(max.x, point.x)
    max.y = Math.max(max.y, point.y)
    max.z = Math.max(max.z, point.z)
  })

  return {
    min,
    max,
    center: {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2,
    },
    size: {
      x: max.x - min.x,
      y: max.y - min.y,
      z: max.z - min.z,
    },
  }
}

// 向量加法
export function addVectors(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  }
}

// 向量减法
export function subtractVectors(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  }
}

// 向量缩放
export function scaleVector(v: Vector3, scale: number): Vector3 {
  return {
    x: v.x * scale,
    y: v.y * scale,
    z: v.z * scale,
  }
}

// 向量长度
export function vectorLength(v: Vector3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
}

// 向量归一化
export function normalizeVector(v: Vector3): Vector3 {
  const length = vectorLength(v)
  if (length === 0) return { x: 0, y: 0, z: 0 }
  return scaleVector(v, 1 / length)
}

// 向量点积
export function dotProduct(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

// 向量叉积
export function crossProduct(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

// 线性插值
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// 向量线性插值
export function lerpVector(a: Vector3, b: Vector3, t: number): Vector3 {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  }
}

// 角度转弧度
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

// 弧度转角度
export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

// 格式化距离显示
export function formatDistance(distance: number): string {
  if (distance < 1) {
    return `${(distance * 100).toFixed(0)} cm`
  } else if (distance < 1000) {
    return `${distance.toFixed(1)} m`
  } else {
    return `${(distance / 1000).toFixed(2)} km`
  }
}

// 格式化角度显示
export function formatAngle(degrees: number): string {
  // 规范化到 0-360 度
  let normalized = degrees % 360
  if (normalized < 0) normalized += 360
  return `${normalized.toFixed(1)}°`
}

// 获取方位名称
export function getDirectionName(degrees: number): string {
  let normalized = degrees % 360
  if (normalized < 0) normalized += 360

  if (normalized >= 337.5 || normalized < 22.5) return '北'
  if (normalized >= 22.5 && normalized < 67.5) return '东北'
  if (normalized >= 67.5 && normalized < 112.5) return '东'
  if (normalized >= 112.5 && normalized < 157.5) return '东南'
  if (normalized >= 157.5 && normalized < 202.5) return '南'
  if (normalized >= 202.5 && normalized < 247.5) return '西南'
  if (normalized >= 247.5 && normalized < 292.5) return '西'
  return '西北'
}
