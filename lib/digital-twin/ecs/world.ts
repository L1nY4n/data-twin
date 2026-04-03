import {
  Types,
  addComponent,
  addEntity,
  createWorld,
  defineComponent,
  removeEntity,
  type IWorld,
} from 'bitecs'
import type {
  AccessRule,
  Alarm,
  EntityStatus,
  EntityType,
  TimeRange,
  Vector3,
} from '@/lib/digital-twin/types'
import { ObjectPool } from './pool'
import type { LabelMode } from './label-lod'

const ENTITY_TYPE_TO_CODE: Record<EntityType, number> = {
  person: 1,
  vehicle: 2,
  equipment: 3,
  zone: 4,
}

const STATUS_TO_CODE: Record<EntityStatus, number> = {
  active: 1,
  inactive: 2,
  warning: 3,
  error: 4,
}

export const TransformComponent = defineComponent({
  x: Types.f32,
  y: Types.f32,
  z: Types.f32,
  rx: Types.f32,
  ry: Types.f32,
  rz: Types.f32,
  sx: Types.f32,
  sy: Types.f32,
  sz: Types.f32,
})

export const MotionComponent = defineComponent({
  speed: Types.f32,
  heading: Types.f32,
})

export const RenderableComponent = defineComponent({
  visible: Types.ui8,
  entityType: Types.ui8,
})

export const SelectableComponent = defineComponent({
  selected: Types.ui8,
  hovered: Types.ui8,
})

export const LabelComponent = defineComponent({
  mode: Types.ui8,
})

export const StatusComponent = defineComponent({
  status: Types.ui8,
})

export const ZoneComponent = defineComponent({
  zoneType: Types.ui8,
})

export const TrajectoryComponent = defineComponent({
  count: Types.ui16,
})

export interface EcsEntitySnapshot {
  id: string
  eid: number
  type: EntityType
  name: string
  position: Vector3
  rotation: Vector3
  scale: Vector3
  status: EntityStatus
  visible: boolean
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
  heading?: number
  speed?: number
  labelMode: LabelMode
  role?: string
  department?: string
  currentActivity?: string
  avatar?: string
  schedule?: TimeRange[]
  plateNumber?: string
  vehicleType?: 'car' | 'truck' | 'forklift' | 'agv' | 'other'
  capacity?: number
  currentLoad?: number
  modelId?: string
  modelUrl?: string
  parameters?: Record<string, number | string | boolean>
  alarms?: Alarm[]
  maintenanceSchedule?: TimeRange[]
  zoneType?: string
  color?: string
  boundary?: Vector3[]
  accessRules?: AccessRule[]
  currentOccupancy?: number
}

export interface EcsCreatePayload {
  id: string
  entityType: EntityType
  name: string
  position: Vector3
  rotation: Vector3
  scale: Vector3
  status: EntityStatus
  visible: boolean
  metadata: Record<string, unknown>
  createdAt?: number
  updatedAt?: number
  heading?: number
  speed?: number
  role?: string
  department?: string
  currentActivity?: string
  avatar?: string
  schedule?: TimeRange[]
  plateNumber?: string
  vehicleType?: 'car' | 'truck' | 'forklift' | 'agv' | 'other'
  capacity?: number
  currentLoad?: number
  modelId?: string
  modelUrl?: string
  parameters?: Record<string, number | string | boolean>
  alarms?: Alarm[]
  maintenanceSchedule?: TimeRange[]
  zoneType?: string
  color?: string
  boundary?: Vector3[]
  accessRules?: AccessRule[]
  currentOccupancy?: number
}

export interface EcsUpdatePayload {
  id: string
  updates: Partial<Omit<EcsCreatePayload, 'id' | 'entityType'> & { position: Vector3; rotation: Vector3; scale: Vector3 }>
}

export type EcsCommand =
  | { type: 'create'; payload: EcsCreatePayload }
  | { type: 'update'; payload: EcsUpdatePayload }
  | { type: 'remove'; payload: { id: string } }
  | { type: 'select'; payload: { id: string | null } }
  | { type: 'hover'; payload: { id: string | null } }

export interface FlushResult {
  applied: number
}

type EcsTypeIndex = Record<EntityType, Set<string>>

export interface EcsWorld {
  world: IWorld
  byExternalId: Map<string, number>
  externalIdByEid: Map<number, string>
  snapshotById: Map<string, EcsEntitySnapshot>
  byType: EcsTypeIndex
  commandBuffer: EcsCommand[]
  selectedId: string | null
  hoveredId: string | null
  pools: {
    trajectoryPoint: ObjectPool<{ x: number; y: number; z: number; t: number }>
    labelToken: ObjectPool<{ id: number; text: string }>
  }
}

export function createEcsWorld(): EcsWorld {
  return {
    world: createWorld(),
    byExternalId: new Map(),
    externalIdByEid: new Map(),
    snapshotById: new Map(),
    byType: createTypeIndex(),
    commandBuffer: [],
    selectedId: null,
    hoveredId: null,
    pools: {
      trajectoryPoint: new ObjectPool(
        () => ({ x: 0, y: 0, z: 0, t: 0 }),
        (item) => {
          item.x = 0
          item.y = 0
          item.z = 0
          item.t = 0
        }
      ),
      labelToken: new ObjectPool(
        () => ({ id: 0, text: '' }),
        (item) => {
          item.id = 0
          item.text = ''
        }
      ),
    },
  }
}

export function enqueueCommands(world: EcsWorld, commands: EcsCommand[]) {
  if (commands.length === 0) return
  world.commandBuffer.push(...commands)
}

export function flushBufferedCommands(world: EcsWorld): FlushResult {
  if (world.commandBuffer.length === 0) {
    return { applied: 0 }
  }

  const commands = world.commandBuffer.splice(0, world.commandBuffer.length)
  return flushCommands(world, commands)
}

export function flushCommands(world: EcsWorld, commands: EcsCommand[]): FlushResult {
  let applied = 0
  for (const command of commands) {
    if (command.type === 'create') {
      if (world.byExternalId.has(command.payload.id)) continue
      const eid = addEntity(world.world)
      applyCreate(world, eid, command.payload)
      applied += 1
      continue
    }

    if (command.type === 'update') {
      const eid = world.byExternalId.get(command.payload.id)
      if (eid === undefined) continue
      applyUpdate(world, eid, command.payload)
      applied += 1
      continue
    }

    if (command.type === 'remove') {
      const eid = world.byExternalId.get(command.payload.id)
      if (eid === undefined) continue
      const snapshot = world.snapshotById.get(command.payload.id)
      if (world.selectedId === command.payload.id) {
        setSelectedId(world, null)
      }
      if (world.hoveredId === command.payload.id) {
        setHoveredId(world, null)
      }
      removeEntity(world.world, eid)
      world.byExternalId.delete(command.payload.id)
      world.externalIdByEid.delete(eid)
      if (snapshot) {
        world.byType[snapshot.type].delete(command.payload.id)
      }
      world.snapshotById.delete(command.payload.id)
      applied += 1
      continue
    }

    if (command.type === 'select') {
      setSelectedId(world, normalizeSelectableId(world, command.payload.id))
      applied += 1
      continue
    }

    setHoveredId(world, normalizeSelectableId(world, command.payload.id))
    applied += 1
  }

  return { applied }
}

function applyCreate(world: EcsWorld, eid: number, payload: EcsCreatePayload) {
  addComponent(world.world, TransformComponent, eid)
  addComponent(world.world, MotionComponent, eid)
  addComponent(world.world, RenderableComponent, eid)
  addComponent(world.world, SelectableComponent, eid)
  addComponent(world.world, LabelComponent, eid)
  addComponent(world.world, StatusComponent, eid)
  addComponent(world.world, TrajectoryComponent, eid)

  if (payload.entityType === 'zone') {
    addComponent(world.world, ZoneComponent, eid)
  }

  setTransform(eid, payload.position, payload.rotation, payload.scale)
  MotionComponent.heading[eid] = payload.heading ?? 0
  MotionComponent.speed[eid] = payload.speed ?? 0
  RenderableComponent.entityType[eid] = ENTITY_TYPE_TO_CODE[payload.entityType]
  RenderableComponent.visible[eid] = payload.visible ? 1 : 0
  SelectableComponent.selected[eid] = world.selectedId === payload.id ? 1 : 0
  SelectableComponent.hovered[eid] = world.hoveredId === payload.id ? 1 : 0
  LabelComponent.mode[eid] = 2
  StatusComponent.status[eid] = STATUS_TO_CODE[payload.status]
  TrajectoryComponent.count[eid] = 0

  const now = Date.now()
  const createdAt = payload.createdAt ?? now
  const updatedAt = payload.updatedAt ?? createdAt
  world.byExternalId.set(payload.id, eid)
  world.externalIdByEid.set(eid, payload.id)
  world.snapshotById.set(payload.id, {
    id: payload.id,
    eid,
    type: payload.entityType,
    name: payload.name,
    position: { ...payload.position },
    rotation: { ...payload.rotation },
    scale: { ...payload.scale },
    status: payload.status,
    visible: payload.visible,
    metadata: { ...(payload.metadata ?? {}) },
    createdAt,
    updatedAt,
    heading: payload.heading,
    speed: payload.speed,
    labelMode: 'html',
    role: payload.role,
    department: payload.department,
    currentActivity: payload.currentActivity,
    avatar: payload.avatar,
    schedule: cloneTimeRanges(payload.schedule),
    plateNumber: payload.plateNumber,
    vehicleType: payload.vehicleType,
    capacity: payload.capacity,
    currentLoad: payload.currentLoad,
    modelId: payload.modelId,
    modelUrl: payload.modelUrl,
    parameters: payload.parameters ? { ...payload.parameters } : undefined,
    alarms: cloneAlarms(payload.alarms),
    maintenanceSchedule: cloneTimeRanges(payload.maintenanceSchedule),
    zoneType: payload.zoneType,
    color: payload.color,
    boundary: cloneBoundary(payload.boundary),
    accessRules: cloneAccessRules(payload.accessRules),
    currentOccupancy: payload.currentOccupancy,
  })
  world.byType[payload.entityType].add(payload.id)
}

function applyUpdate(world: EcsWorld, eid: number, payload: EcsUpdatePayload) {
  const existing = world.snapshotById.get(payload.id)
  if (!existing) return

  const updates = payload.updates
  if (updates.name !== undefined) existing.name = updates.name
  if (updates.status !== undefined) existing.status = updates.status
  if (updates.visible !== undefined) existing.visible = updates.visible
  if (updates.heading !== undefined) existing.heading = updates.heading
  if (updates.speed !== undefined) existing.speed = updates.speed
  if (updates.role !== undefined) existing.role = updates.role
  if (updates.department !== undefined) existing.department = updates.department
  if (updates.currentActivity !== undefined) existing.currentActivity = updates.currentActivity
  if (updates.avatar !== undefined) existing.avatar = updates.avatar
  if (updates.schedule !== undefined) existing.schedule = cloneTimeRanges(updates.schedule)
  if (updates.plateNumber !== undefined) existing.plateNumber = updates.plateNumber
  if (updates.vehicleType !== undefined) existing.vehicleType = updates.vehicleType
  if (updates.capacity !== undefined) existing.capacity = updates.capacity
  if (updates.currentLoad !== undefined) existing.currentLoad = updates.currentLoad
  if (updates.modelId !== undefined) existing.modelId = updates.modelId
  if (updates.modelUrl !== undefined) existing.modelUrl = updates.modelUrl
  if (updates.parameters !== undefined) existing.parameters = { ...updates.parameters }
  if (updates.alarms !== undefined) existing.alarms = cloneAlarms(updates.alarms)
  if (updates.maintenanceSchedule !== undefined) {
    existing.maintenanceSchedule = cloneTimeRanges(updates.maintenanceSchedule)
  }
  if (updates.zoneType !== undefined) existing.zoneType = updates.zoneType
  if (updates.color !== undefined) existing.color = updates.color
  if (updates.boundary !== undefined) existing.boundary = cloneBoundary(updates.boundary)
  if (updates.accessRules !== undefined) existing.accessRules = cloneAccessRules(updates.accessRules)
  if (updates.currentOccupancy !== undefined) existing.currentOccupancy = updates.currentOccupancy
  if (updates.createdAt !== undefined) existing.createdAt = updates.createdAt
  existing.updatedAt = updates.updatedAt ?? Date.now()
  if (updates.metadata) {
    Object.assign(existing.metadata, updates.metadata)
  }

  if (updates.position) {
    existing.position.x = updates.position.x
    existing.position.y = updates.position.y
    existing.position.z = updates.position.z
  }

  if (updates.rotation) {
    existing.rotation.x = updates.rotation.x
    existing.rotation.y = updates.rotation.y
    existing.rotation.z = updates.rotation.z
  }

  if (updates.scale) {
    existing.scale.x = updates.scale.x
    existing.scale.y = updates.scale.y
    existing.scale.z = updates.scale.z
  }

  setTransform(eid, existing.position, existing.rotation, existing.scale)
  MotionComponent.heading[eid] = existing.heading ?? 0
  MotionComponent.speed[eid] = existing.speed ?? 0
  RenderableComponent.visible[eid] = existing.visible ? 1 : 0
  StatusComponent.status[eid] = STATUS_TO_CODE[existing.status]
}

function setTransform(eid: number, position: Vector3, rotation: Vector3, scale: Vector3) {
  TransformComponent.x[eid] = position.x
  TransformComponent.y[eid] = position.y
  TransformComponent.z[eid] = position.z
  TransformComponent.rx[eid] = rotation.x
  TransformComponent.ry[eid] = rotation.y
  TransformComponent.rz[eid] = rotation.z
  TransformComponent.sx[eid] = scale.x
  TransformComponent.sy[eid] = scale.y
  TransformComponent.sz[eid] = scale.z
}

function normalizeSelectableId(world: EcsWorld, id: string | null): string | null {
  if (id === null) return null
  return world.byExternalId.has(id) ? id : null
}

function setSelectedId(world: EcsWorld, id: string | null) {
  if (world.selectedId === id) return
  if (world.selectedId !== null) {
    const prevEid = world.byExternalId.get(world.selectedId)
    if (prevEid !== undefined) {
      SelectableComponent.selected[prevEid] = 0
    }
  }
  world.selectedId = id
  if (id !== null) {
    const nextEid = world.byExternalId.get(id)
    if (nextEid !== undefined) {
      SelectableComponent.selected[nextEid] = 1
    }
  }
}

function setHoveredId(world: EcsWorld, id: string | null) {
  if (world.hoveredId === id) return
  if (world.hoveredId !== null) {
    const prevEid = world.byExternalId.get(world.hoveredId)
    if (prevEid !== undefined) {
      SelectableComponent.hovered[prevEid] = 0
    }
  }
  world.hoveredId = id
  if (id !== null) {
    const nextEid = world.byExternalId.get(id)
    if (nextEid !== undefined) {
      SelectableComponent.hovered[nextEid] = 1
    }
  }
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

function createTypeIndex(): EcsTypeIndex {
  return {
    person: new Set(),
    vehicle: new Set(),
    equipment: new Set(),
    zone: new Set(),
  }
}
