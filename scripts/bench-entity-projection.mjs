#!/usr/bin/env node

import { performance } from 'node:perf_hooks'

const PRODUCTION_SCENARIO = {
  name: 'production-campus',
  entityCount: 480,
  ticks: 3000,
  hotLabelCount: 48,
  equipmentCount: 96,
  movingEntities: 180,
  separationTicks: 2200,
  occupancyCellSize: 8,
}

function random(min, max) {
  return Math.random() * (max - min) + min
}

function createSnapshots() {
  const snapshots = []
  for (let i = 0; i < PRODUCTION_SCENARIO.entityCount; i += 1) {
    const type =
      i < PRODUCTION_SCENARIO.equipmentCount
        ? 'equipment'
        : i % 4 === 0
          ? 'person'
          : i % 4 === 1
            ? 'vehicle'
            : 'person'
    snapshots.push({
      id: `e-${i}`,
      type,
      name: `${type}-${i}`,
      position: { x: random(-104, 104), y: 0, z: random(-104, 104) },
      rotation: { x: 0, y: random(0, Math.PI * 2), z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: {},
      labelMode: i < PRODUCTION_SCENARIO.hotLabelCount ? 'html' : 'sprite',
      role: '员工',
      department: '生产部',
      currentActivity: '移动中',
      plateNumber: `A${10000 + i}`,
      vehicleType: 'car',
      speed: 2,
      heading: 45,
      parameters: { 温度: 40, 功率: 60, 运行时间: 1000 + i },
    })
  }
  return snapshots
}

function advanceSnapshots(snapshots, tick) {
  for (let i = 0; i < snapshots.length; i += 1) {
    const snapshot = snapshots[i]
    if (snapshot.type === 'person' || snapshot.type === 'vehicle') {
      snapshot.position.x += Math.sin((tick + i) * 0.02) * 0.12
      snapshot.position.z += Math.cos((tick + i) * 0.02) * 0.12
      snapshot.rotation.y += 0.01
      if (snapshot.rotation.y > Math.PI * 2) snapshot.rotation.y -= Math.PI * 2
      if (snapshot.type === 'vehicle') {
        snapshot.heading = ((snapshot.rotation.y * 180) / Math.PI + 360) % 360
      }
    } else if (tick % 120 === 0 && i % 7 === 0) {
      snapshot.parameters = {
        ...snapshot.parameters,
        温度: Number((snapshot.parameters.温度 + random(-2, 2)).toFixed(2)),
      }
    }
  }
}

function projectOld(snapshot, now) {
  return {
    id: snapshot.id,
    type: snapshot.type,
    name: snapshot.name,
    position: { ...snapshot.position },
    rotation: { ...snapshot.rotation },
    scale: { ...snapshot.scale },
    status: snapshot.status,
    visible: snapshot.visible,
    metadata: snapshot.metadata,
    createdAt: now,
    updatedAt: now,
    labelMode: snapshot.labelMode,
    role: snapshot.role,
    department: snapshot.department,
    currentActivity: snapshot.currentActivity,
    plateNumber: snapshot.plateNumber,
    vehicleType: snapshot.vehicleType,
    speed: snapshot.speed,
    heading: snapshot.heading,
    parameters: snapshot.parameters,
  }
}

function canReuseProjectedEntity(previous, snapshot) {
  if (!previous) return false
  if (previous.type !== snapshot.type) return false
  if (previous.name !== snapshot.name) return false
  if (previous.status !== snapshot.status) return false
  if (previous.visible !== snapshot.visible) return false
  if ((previous.labelMode ?? 'html') !== snapshot.labelMode) return false

  if (snapshot.type === 'person') {
    return (
      previous.role === snapshot.role &&
      previous.department === snapshot.department &&
      previous.currentActivity === snapshot.currentActivity
    )
  }

  if (snapshot.type === 'vehicle') {
    return previous.plateNumber === snapshot.plateNumber && previous.vehicleType === snapshot.vehicleType
  }

  if (snapshot.type === 'equipment') {
    const prevKeys = Object.keys(previous.parameters ?? {})
    const nextKeys = Object.keys(snapshot.parameters ?? {})
    if (prevKeys.length !== nextKeys.length) return false
    for (const key of nextKeys) {
      if (previous.parameters[key] !== snapshot.parameters[key]) return false
    }
    return true
  }

  return true
}

function projectIncremental(snapshot, previousEntity, now, forceProject) {
  if (!forceProject && canReuseProjectedEntity(previousEntity, snapshot)) {
    return { reused: true, entity: previousEntity }
  }

  const next = projectOld(snapshot, now)
  if (previousEntity) next.createdAt = previousEntity.createdAt
  return { reused: false, entity: next }
}

function runOldProjection(snapshots) {
  let allocations = 0
  const started = performance.now()
  for (let tick = 0; tick < PRODUCTION_SCENARIO.ticks; tick += 1) {
    advanceSnapshots(snapshots, tick)
    const now = Date.now()
    const map = new Map()
    for (const snapshot of snapshots) {
      map.set(snapshot.id, projectOld(snapshot, now))
      allocations += 1
    }
  }
  return { ms: performance.now() - started, allocations }
}

function runIncrementalProjection(snapshots) {
  let allocations = 0
  let reused = 0
  let previous = new Map()
  const started = performance.now()
  for (let tick = 0; tick < PRODUCTION_SCENARIO.ticks; tick += 1) {
    advanceSnapshots(snapshots, tick)
    const now = Date.now()
    const next = new Map()
    for (const snapshot of snapshots) {
      const forceProject =
        snapshot.type === 'equipment' || snapshot.labelMode === 'html' || snapshot.id === 'e-0'
      const { reused: wasReused, entity } = projectIncremental(
        snapshot,
        previous.get(snapshot.id),
        now,
        forceProject
      )
      next.set(snapshot.id, entity)
      if (wasReused) {
        reused += 1
      } else {
        allocations += 1
      }
    }
    previous = next
  }
  return { ms: performance.now() - started, allocations, reused }
}

function createMovingEntities() {
  const entities = []
  for (let i = 0; i < PRODUCTION_SCENARIO.movingEntities; i += 1) {
    entities.push({
      id: `m-${i}`,
      type: i % 3 === 0 ? 'vehicle' : 'person',
      position: { x: random(-96, 96), y: 0, z: random(-96, 96) },
      vx: random(-0.22, 0.22),
      vz: random(-0.22, 0.22),
    })
  }
  return entities
}

function getMinDistance(entityType, neighborType) {
  if (entityType === 'vehicle' && neighborType === 'vehicle') return 2.6
  if (entityType === 'vehicle' && neighborType === 'person') return 2.2
  if (entityType === 'person' && neighborType === 'vehicle') return 1.8
  return 0.95
}

function advanceMovingEntities(entities) {
  for (const entity of entities) {
    entity.position.x += entity.vx
    entity.position.z += entity.vz
    if (entity.position.x < -104 || entity.position.x > 104) entity.vx *= -1
    if (entity.position.z < -104 || entity.position.z > 104) entity.vz *= -1
  }
}

function buildSpatialIndex(entities, cellSize) {
  const buckets = new Map()
  for (const entity of entities) {
    const col = Math.floor(entity.position.x / cellSize)
    const row = Math.floor(entity.position.z / cellSize)
    const key = `${col}:${row}`
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.push(entity)
    } else {
      buckets.set(key, [entity])
    }
  }
  return { cellSize, buckets }
}

function querySpatialIndex(index, position) {
  const col = Math.floor(position.x / index.cellSize)
  const row = Math.floor(position.z / index.cellSize)
  const results = []
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      const bucket = index.buckets.get(`${col + dx}:${row + dz}`)
      if (!bucket) continue
      results.push(...bucket)
    }
  }
  return results
}

function runNaiveSeparation(entities) {
  let blocked = 0
  const started = performance.now()
  for (let tick = 0; tick < PRODUCTION_SCENARIO.separationTicks; tick += 1) {
    advanceMovingEntities(entities)
    for (let i = 0; i < entities.length; i += 1) {
      const entity = entities[i]
      for (let j = 0; j < entities.length; j += 1) {
        if (i === j) continue
        const neighbor = entities[j]
        const dx = entity.position.x - neighbor.position.x
        const dz = entity.position.z - neighbor.position.z
        const distance = Math.hypot(dx, dz)
        if (distance < getMinDistance(entity.type, neighbor.type)) {
          blocked += 1
          break
        }
      }
    }
  }
  return { ms: performance.now() - started, blocked }
}

function runSpatialSeparation(entities) {
  let blocked = 0
  const started = performance.now()
  for (let tick = 0; tick < PRODUCTION_SCENARIO.separationTicks; tick += 1) {
    advanceMovingEntities(entities)
    const index = buildSpatialIndex(entities, PRODUCTION_SCENARIO.occupancyCellSize)
    for (let i = 0; i < entities.length; i += 1) {
      const entity = entities[i]
      const candidates = querySpatialIndex(index, entity.position)
      for (let j = 0; j < candidates.length; j += 1) {
        const neighbor = candidates[j]
        if (neighbor.id === entity.id) continue
        const dx = entity.position.x - neighbor.position.x
        const dz = entity.position.z - neighbor.position.z
        const distance = Math.hypot(dx, dz)
        if (distance < getMinDistance(entity.type, neighbor.type)) {
          blocked += 1
          break
        }
      }
    }
  }
  return { ms: performance.now() - started, blocked }
}

const oldSnapshots = createSnapshots()
const newSnapshots = createSnapshots()
const oldProjection = runOldProjection(oldSnapshots)
const incrementalProjection = runIncrementalProjection(newSnapshots)
const oldPublishIntervalMs = 160
const newPublishIntervalMs = 396
const oldProjectionCostPerSecond = (1000 / oldPublishIntervalMs) * oldProjection.ms
const newProjectionCostPerSecond = (1000 / newPublishIntervalMs) * incrementalProjection.ms

const projectionReduction = {
  projectionTimePercent: Number((((oldProjection.ms - incrementalProjection.ms) / oldProjection.ms) * 100).toFixed(2)),
  allocationPercent: Number(
    (((oldProjection.allocations - incrementalProjection.allocations) / oldProjection.allocations) * 100).toFixed(2)
  ),
  effectiveProjectedWorkPerSecondPercent: Number(
    (((oldProjectionCostPerSecond - newProjectionCostPerSecond) / oldProjectionCostPerSecond) * 100).toFixed(2)
  ),
}

const naiveSeparation = runNaiveSeparation(createMovingEntities())
const spatialSeparation = runSpatialSeparation(createMovingEntities())
const separationReduction = {
  queryTimePercent: Number((((naiveSeparation.ms - spatialSeparation.ms) / naiveSeparation.ms) * 100).toFixed(2)),
}

console.log(
  JSON.stringify(
    {
      scenario: PRODUCTION_SCENARIO.name,
      config: {
        entityCount: PRODUCTION_SCENARIO.entityCount,
        movingEntities: PRODUCTION_SCENARIO.movingEntities,
        ticks: PRODUCTION_SCENARIO.ticks,
        htmlLabels: PRODUCTION_SCENARIO.hotLabelCount,
        equipment: PRODUCTION_SCENARIO.equipmentCount,
        separationTicks: PRODUCTION_SCENARIO.separationTicks,
        occupancyCellSize: PRODUCTION_SCENARIO.occupancyCellSize,
      },
      projection: {
        old: oldProjection,
        incremental: incrementalProjection,
        reduction: projectionReduction,
      },
      separation: {
        naive: naiveSeparation,
        spatial: spatialSeparation,
        reduction: separationReduction,
      },
      assumptions: {
        oldPublishIntervalMs,
        newPublishIntervalMs,
        note: 'newPublishIntervalMs reflects balanced mode at production-campus scale with adaptive publish cadence',
      },
    },
    null,
    2
  )
)
