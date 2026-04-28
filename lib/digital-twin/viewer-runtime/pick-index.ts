import * as THREE from 'three'
import {
  resolvePickTargetFromIntersection,
  type ScenePickTarget,
} from '@/lib/digital-twin/renderer/interaction'

export type DigitalTwinPickGroupPriority = 'entity' | 'static-feature' | 'mixed'

export interface DigitalTwinPickCandidateHit {
  target: ScenePickTarget
  distance: number
}

export interface DigitalTwinRaySpherePickGridOptions {
  cellSize?: number
  maxVisitedCells?: number
}

export interface DigitalTwinPickGroup {
  id: string
  objects: THREE.Object3D[]
  bounds?: THREE.Sphere | THREE.Box3
  priority?: DigitalTwinPickGroupPriority
  pickCandidates?: (raycaster: THREE.Raycaster) => readonly DigitalTwinPickCandidateHit[]
  exactRaycast?: boolean
}

export interface DigitalTwinPickRequest {
  pointer: { offsetX: number; offsetY: number }
  domElement: HTMLCanvasElement
  camera: THREE.Camera
  raycaster: THREE.Raycaster
}

interface RegisteredPickGroup {
  id: string
  objects: THREE.Object3D[]
  sphere: THREE.Sphere | null
  priority: DigitalTwinPickGroupPriority
  pickCandidates?: (raycaster: THREE.Raycaster) => readonly DigitalTwinPickCandidateHit[]
  exactRaycast: boolean
}

interface CandidateGroup {
  group: RegisteredPickGroup
  distanceSq: number
}

interface RaySpherePickEntry {
  id: string
  target: ScenePickTarget
  x: number
  y: number
  z: number
  radius: number
  cellX: number
  cellZ: number
}

const POINTER = new THREE.Vector2()
const BOX_CENTER = new THREE.Vector3()
const BOX_SIZE = new THREE.Vector3()
const WORLD_SPHERE = new THREE.Sphere()
const RAY_SPHERE_CENTER = new THREE.Vector3()
const MIN_PROJECTED_RAY_LENGTH_SQ = 1e-8

function cloneBoundsAsSphere(bounds: THREE.Sphere | THREE.Box3 | undefined): THREE.Sphere | null {
  if (!bounds) return null
  if (bounds instanceof THREE.Sphere) return bounds.clone()

  const center = bounds.getCenter(BOX_CENTER).clone()
  const radius = bounds.getSize(BOX_SIZE).length() / 2
  return new THREE.Sphere(center, radius)
}

function resolveGroupPriority(priority: DigitalTwinPickGroupPriority) {
  return priority === 'entity' || priority === 'mixed' ? 0 : 1
}

function normalizePickDistance(distance: number) {
  return Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY
}

function updateBestTarget(
  target: ScenePickTarget,
  distance: number,
  current: {
    entity: { target: ScenePickTarget; distance: number } | null
    staticFeature: { target: ScenePickTarget; distance: number } | null
  }
) {
  const normalizedDistance = normalizePickDistance(distance)
  if (target.kind === 'entity') {
    if (!current.entity || normalizedDistance < current.entity.distance) {
      current.entity = { target, distance: normalizedDistance }
    }
    return
  }

  if (!current.staticFeature || normalizedDistance < current.staticFeature.distance) {
    current.staticFeature = { target, distance: normalizedDistance }
  }
}

export function resolveRaySpherePickHit(
  raycaster: THREE.Raycaster,
  center: { x: number; y: number; z: number },
  radius: number,
  target: ScenePickTarget
): DigitalTwinPickCandidateHit | null {
  const safeRadius = Math.max(0, radius)
  RAY_SPHERE_CENTER.set(center.x, center.y, center.z)

  if (raycaster.ray.distanceSqToPoint(RAY_SPHERE_CENTER) > safeRadius * safeRadius) {
    return null
  }

  return {
    target,
    distance: Math.max(0, raycaster.ray.origin.distanceTo(RAY_SPHERE_CENTER) - safeRadius),
  }
}

function createBucketKey(cellX: number, cellZ: number) {
  return `${cellX}:${cellZ}`
}

function isFiniteNumber(value: number) {
  return Number.isFinite(value)
}

function raySlabRange(
  origin: number,
  direction: number,
  min: number,
  max: number,
  range: { min: number; max: number }
) {
  if (Math.abs(direction) <= Number.EPSILON) {
    return origin >= min && origin <= max
  }

  let first = (min - origin) / direction
  let second = (max - origin) / direction
  if (first > second) {
    const tmp = first
    first = second
    second = tmp
  }
  range.min = Math.max(range.min, first)
  range.max = Math.min(range.max, second)
  return range.max >= range.min
}

export class DigitalTwinRaySpherePickGrid {
  private readonly cellSize: number
  private readonly maxVisitedCells: number
  private readonly buckets = new Map<string, Set<string>>()
  private readonly entries = new Map<string, RaySpherePickEntry>()
  private minX = Number.POSITIVE_INFINITY
  private minZ = Number.POSITIVE_INFINITY
  private maxX = Number.NEGATIVE_INFINITY
  private maxZ = Number.NEGATIVE_INFINITY
  private maxRadius = 0
  lastVisitedCellCount = 0
  lastVisitedEntryCount = 0

  constructor(options: DigitalTwinRaySpherePickGridOptions = {}) {
    this.cellSize = Math.max(0.5, options.cellSize ?? 8)
    this.maxVisitedCells = Math.max(16, options.maxVisitedCells ?? 4096)
  }

  get size() {
    return this.entries.size
  }

  clear() {
    this.buckets.clear()
    this.entries.clear()
    this.minX = Number.POSITIVE_INFINITY
    this.minZ = Number.POSITIVE_INFINITY
    this.maxX = Number.NEGATIVE_INFINITY
    this.maxZ = Number.NEGATIVE_INFINITY
    this.maxRadius = 0
    this.lastVisitedCellCount = 0
    this.lastVisitedEntryCount = 0
  }

  remove(id: string) {
    const entry = this.entries.get(id)
    if (!entry) return

    this.removeFromBucket(entry)
    this.entries.delete(id)
  }

  upsertEntity(id: string, x: number, y: number, z: number, radius: number) {
    const existing = this.entries.get(id)
    const target = existing?.target ?? { kind: 'entity', id }
    this.upsert(id, target, x, y, z, radius)
  }

  upsert(
    id: string,
    target: ScenePickTarget,
    x: number,
    y: number,
    z: number,
    radius: number
  ) {
    if (![x, y, z, radius].every(isFiniteNumber)) {
      this.remove(id)
      return
    }

    const safeRadius = Math.max(0, radius)
    const cellX = this.cellFor(x)
    const cellZ = this.cellFor(z)
    const existing = this.entries.get(id)
    if (existing) {
      if (existing.cellX !== cellX || existing.cellZ !== cellZ) {
        this.removeFromBucket(existing)
        this.addToBucket(id, cellX, cellZ)
      }

      existing.target = target
      existing.x = x
      existing.y = y
      existing.z = z
      existing.radius = safeRadius
      existing.cellX = cellX
      existing.cellZ = cellZ
      this.expandBounds(x, z, safeRadius)
      return
    }

    this.entries.set(id, {
      id,
      target,
      x,
      y,
      z,
      radius: safeRadius,
      cellX,
      cellZ,
    })
    this.addToBucket(id, cellX, cellZ)
    this.expandBounds(x, z, safeRadius)
  }

  collect(raycaster: THREE.Raycaster): DigitalTwinPickCandidateHit[] {
    const ids = this.collectCandidateIds(raycaster)
    const hits: DigitalTwinPickCandidateHit[] = []
    this.lastVisitedEntryCount = ids.size

    for (const id of ids) {
      const entry = this.entries.get(id)
      if (!entry) continue

      const hit = resolveRaySpherePickHit(
        raycaster,
        { x: entry.x, y: entry.y, z: entry.z },
        entry.radius,
        entry.target
      )
      if (hit) hits.push(hit)
    }

    hits.sort((a, b) => a.distance - b.distance)
    return hits
  }

  private collectCandidateIds(raycaster: THREE.Raycaster) {
    const ids = new Set<string>()
    this.lastVisitedCellCount = 0
    if (this.entries.size === 0) return ids

    const padding = this.maxRadius + this.cellSize
    const minX = this.minX - padding
    const minZ = this.minZ - padding
    const maxX = this.maxX + padding
    const maxZ = this.maxZ + padding
    const { origin, direction } = raycaster.ray
    const projectedLengthSq = direction.x * direction.x + direction.z * direction.z
    const neighborRadius = Math.max(1, Math.ceil((this.maxRadius + this.cellSize * 0.5) / this.cellSize))

    if (projectedLengthSq <= MIN_PROJECTED_RAY_LENGTH_SQ) {
      this.collectCellNeighborhood(this.cellFor(origin.x), this.cellFor(origin.z), neighborRadius, ids)
      return ids
    }

    const range = {
      min: Math.max(0, raycaster.near),
      max: Number.isFinite(raycaster.far) ? raycaster.far : Number.POSITIVE_INFINITY,
    }
    if (
      !raySlabRange(origin.x, direction.x, minX, maxX, range) ||
      !raySlabRange(origin.z, direction.z, minZ, maxZ, range) ||
      !Number.isFinite(range.max)
    ) {
      return ids
    }

    const startX = origin.x + direction.x * range.min
    const startZ = origin.z + direction.z * range.min
    const endX = origin.x + direction.x * range.max
    const endZ = origin.z + direction.z * range.max
    let cellX = this.cellFor(startX)
    let cellZ = this.cellFor(startZ)
    const endCellX = this.cellFor(endX)
    const endCellZ = this.cellFor(endZ)
    const stepX = direction.x > 0 ? 1 : direction.x < 0 ? -1 : 0
    const stepZ = direction.z > 0 ? 1 : direction.z < 0 ? -1 : 0
    let nextX =
      stepX === 0
        ? Number.POSITIVE_INFINITY
        : ((cellX + (stepX > 0 ? 1 : 0)) * this.cellSize - startX) / direction.x
    let nextZ =
      stepZ === 0
        ? Number.POSITIVE_INFINITY
        : ((cellZ + (stepZ > 0 ? 1 : 0)) * this.cellSize - startZ) / direction.z
    const deltaX = stepX === 0 ? Number.POSITIVE_INFINITY : this.cellSize / Math.abs(direction.x)
    const deltaZ = stepZ === 0 ? Number.POSITIVE_INFINITY : this.cellSize / Math.abs(direction.z)

    for (let visited = 0; visited < this.maxVisitedCells; visited += 1) {
      this.collectCellNeighborhood(cellX, cellZ, neighborRadius, ids)
      if (cellX === endCellX && cellZ === endCellZ) break

      if (nextX < nextZ) {
        cellX += stepX
        nextX += deltaX
      } else {
        cellZ += stepZ
        nextZ += deltaZ
      }
    }

    return ids
  }

  private cellFor(value: number) {
    return Math.floor(value / this.cellSize)
  }

  private addToBucket(id: string, cellX: number, cellZ: number) {
    const key = createBucketKey(cellX, cellZ)
    let bucket = this.buckets.get(key)
    if (!bucket) {
      bucket = new Set()
      this.buckets.set(key, bucket)
    }
    bucket.add(id)
  }

  private removeFromBucket(entry: RaySpherePickEntry) {
    const key = createBucketKey(entry.cellX, entry.cellZ)
    const bucket = this.buckets.get(key)
    if (!bucket) return
    bucket.delete(entry.id)
    if (bucket.size === 0) this.buckets.delete(key)
  }

  private collectCellNeighborhood(cellX: number, cellZ: number, radius: number, ids: Set<string>) {
    for (let x = cellX - radius; x <= cellX + radius; x += 1) {
      for (let z = cellZ - radius; z <= cellZ + radius; z += 1) {
        this.lastVisitedCellCount += 1
        const bucket = this.buckets.get(createBucketKey(x, z))
        if (!bucket) continue
        for (const id of bucket) ids.add(id)
      }
    }
  }

  private expandBounds(x: number, z: number, radius: number) {
    this.minX = Math.min(this.minX, x - radius)
    this.minZ = Math.min(this.minZ, z - radius)
    this.maxX = Math.max(this.maxX, x + radius)
    this.maxZ = Math.max(this.maxZ, z + radius)
    this.maxRadius = Math.max(this.maxRadius, radius)
  }
}

export class DigitalTwinPickIndex {
  private groups = new Map<string, RegisteredPickGroup>()

  register(group: DigitalTwinPickGroup): () => void {
    const objects = group.objects.filter(Boolean)
    if (objects.length === 0) return () => {}

    this.groups.set(group.id, {
      id: group.id,
      objects,
      sphere: cloneBoundsAsSphere(group.bounds),
      priority: group.priority ?? 'mixed',
      pickCandidates: group.pickCandidates,
      exactRaycast: group.exactRaycast ?? true,
    })

    return () => {
      const current = this.groups.get(group.id)
      if (current?.objects === objects) {
        this.groups.delete(group.id)
      } else if (current?.id === group.id) {
        this.groups.delete(group.id)
      }
    }
  }

  clear() {
    this.groups.clear()
  }

  get size() {
    return this.groups.size
  }

  pick({ pointer, domElement, camera, raycaster }: DigitalTwinPickRequest): ScenePickTarget | null {
    const width = domElement.clientWidth || domElement.width
    const height = domElement.clientHeight || domElement.height
    if (width <= 0 || height <= 0) return null

    POINTER.set((pointer.offsetX / width) * 2 - 1, -(pointer.offsetY / height) * 2 + 1)
    raycaster.setFromCamera(POINTER, camera)

    const candidates = this.collectCandidates(raycaster)
    if (candidates.length === 0) return null

    const best: {
      entity: { target: ScenePickTarget; distance: number } | null
      staticFeature: { target: ScenePickTarget; distance: number } | null
    } = {
      entity: null,
      staticFeature: null,
    }

    for (const candidate of candidates) {
      const candidateHits = candidate.group.pickCandidates?.(raycaster) ?? []
      for (const hit of candidateHits) {
        updateBestTarget(hit.target, hit.distance, best)
      }

      if (!candidate.group.exactRaycast) continue

      for (const object of candidate.group.objects) {
        const hits = raycaster.intersectObject(object, true)
        for (const hit of hits) {
          const target = resolvePickTargetFromIntersection(hit)
          if (!target) continue
          updateBestTarget(target, hit.distance, best)
        }
      }
    }

    return best.entity?.target ?? best.staticFeature?.target ?? null
  }

  private collectCandidates(raycaster: THREE.Raycaster): CandidateGroup[] {
    const candidates: CandidateGroup[] = []

    for (const group of this.groups.values()) {
      if (group.sphere) {
        WORLD_SPHERE.copy(group.sphere)
        if (!raycaster.ray.intersectsSphere(WORLD_SPHERE)) continue
        candidates.push({
          group,
          distanceSq: raycaster.ray.origin.distanceToSquared(WORLD_SPHERE.center),
        })
        continue
      }

      candidates.push({ group, distanceSq: 0 })
    }

    candidates.sort((a, b) => {
      const priorityDiff = resolveGroupPriority(a.group.priority) - resolveGroupPriority(b.group.priority)
      return priorityDiff || a.distanceSq - b.distanceSq
    })
    return candidates
  }
}
