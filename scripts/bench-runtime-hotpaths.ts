#!/usr/bin/env bun

import { performance } from 'node:perf_hooks'

import {
  createDynamicOccupancyIndex,
  DYNAMIC_NEIGHBOR_QUERY_RADIUS,
  queryDynamicOccupants,
  updateDynamicOccupancyIndex,
} from '../lib/digital-twin/mock-data'
import {
  resolveLabelMode,
  resolveLabelModeFromDistanceSquared,
} from '../lib/digital-twin/ecs/label-lod'
import { DigitalTwinViewerRuntime } from '../lib/digital-twin/viewer-runtime/runtime'
import type { VehicleEntity, Vector3 } from '../lib/digital-twin/types'

interface MovingAgent {
  id: string
  type: 'person' | 'vehicle'
  vehicleType?: VehicleEntity['vehicleType']
  position: Vector3
  vx: number
  vz: number
}

interface OccupantInput {
  id: string
  type: 'person' | 'vehicle'
  vehicleType?: VehicleEntity['vehicleType']
  position: Vector3
}

const OCCUPANCY_AGENT_COUNT = 520
const OCCUPANCY_TICKS = 900
const LABEL_ENTITY_COUNT = 12000
const LABEL_PASSES = 360
const VIEWER_PLUGIN_COUNT = 14
const VIEWER_FRAMES = 24000
const BOUNDS = { minX: -120, maxX: 120, minZ: -120, maxZ: 120 }
const VEHICLE_TYPES: VehicleEntity['vehicleType'][] = ['car', 'truck', 'forklift', 'agv']

function seededUnit(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

function createAgents(): MovingAgent[] {
  return Array.from({ length: OCCUPANCY_AGENT_COUNT }, (_value, index) => {
    const isVehicle = index % 3 === 0
    return {
      id: `agent-${index}`,
      type: isVehicle ? 'vehicle' : 'person',
      vehicleType: isVehicle ? VEHICLE_TYPES[index % VEHICLE_TYPES.length] : undefined,
      position: {
        x: BOUNDS.minX + seededUnit(index + 1) * (BOUNDS.maxX - BOUNDS.minX),
        y: 0,
        z: BOUNDS.minZ + seededUnit(index + 33) * (BOUNDS.maxZ - BOUNDS.minZ),
      },
      vx: seededUnit(index + 71) * 0.54 - 0.27,
      vz: seededUnit(index + 149) * 0.54 - 0.27,
    }
  })
}

function advanceAgent(agent: MovingAgent, tick: number) {
  const phase = (tick + agent.id.length) * 0.015
  const x = agent.position.x + agent.vx + Math.sin(phase) * 0.05
  const z = agent.position.z + agent.vz + Math.cos(phase) * 0.05
  if (x < BOUNDS.minX || x > BOUNDS.maxX) agent.vx *= -1
  if (z < BOUNDS.minZ || z > BOUNDS.maxZ) agent.vz *= -1
  agent.position = {
    x: Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, x)),
    y: 0,
    z: Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, z)),
  }
}

function nextCandidate(agent: MovingAgent, tick: number): Vector3 {
  const phase = (tick + agent.id.length) * 0.021
  return {
    x: Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, agent.position.x + Math.sin(phase) * 0.34)),
    y: 0,
    z: Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, agent.position.z + Math.cos(phase) * 0.34)),
  }
}

function fillOccupants(agents: MovingAgent[], scratch: OccupantInput[]) {
  for (let index = 0; index < agents.length; index += 1) {
    const agent = agents[index]
    const occupant = scratch[index] ?? {
      id: agent.id,
      type: agent.type,
      position: agent.position,
    }
    occupant.id = agent.id
    occupant.type = agent.type
    occupant.position = agent.position
    occupant.vehicleType = agent.type === 'vehicle' ? agent.vehicleType : undefined
    scratch[index] = occupant
  }
  scratch.length = agents.length
  return scratch
}

function runAllocatedOccupancy() {
  const agents = createAgents()
  let neighborCount = 0
  const started = performance.now()

  for (let tick = 0; tick < OCCUPANCY_TICKS; tick += 1) {
    for (const agent of agents) advanceAgent(agent, tick)
    const index = createDynamicOccupancyIndex(
      agents.map((agent) => ({
        id: agent.id,
        type: agent.type,
        position: agent.position,
        vehicleType: agent.type === 'vehicle' ? agent.vehicleType : undefined,
      }))
    )

    for (const agent of agents) {
      const candidate = nextCandidate(agent, tick)
      neighborCount += queryDynamicOccupants(
        index,
        candidate,
        DYNAMIC_NEIGHBOR_QUERY_RADIUS,
        agent.id
      ).length
      updateDynamicOccupancyIndex(index, agent.id, candidate)
      agent.position = candidate
    }
  }

  return {
    ms: performance.now() - started,
    neighborCount,
  }
}

function runScratchOccupancy() {
  const agents = createAgents()
  const occupantsScratch: OccupantInput[] = []
  const neighborsScratch: OccupantInput[] = []
  let neighborCount = 0
  const started = performance.now()

  for (let tick = 0; tick < OCCUPANCY_TICKS; tick += 1) {
    for (const agent of agents) advanceAgent(agent, tick)
    const index = createDynamicOccupancyIndex(fillOccupants(agents, occupantsScratch))

    for (const agent of agents) {
      const candidate = nextCandidate(agent, tick)
      neighborCount += queryDynamicOccupants(
        index,
        candidate,
        DYNAMIC_NEIGHBOR_QUERY_RADIUS,
        agent.id,
        neighborsScratch
      ).length
      updateDynamicOccupancyIndex(index, agent.id, candidate)
      agent.position = candidate
    }
  }

  return {
    ms: performance.now() - started,
    neighborCount,
  }
}

function createLabelPositions() {
  return Array.from({ length: LABEL_ENTITY_COUNT }, (_value, index) => ({
    x: -160 + seededUnit(index + 701) * 320,
    y: seededUnit(index + 881) * 18,
    z: -160 + seededUnit(index + 1069) * 320,
    selected: index === 42,
    hovered: index === 777,
  }))
}

function runSqrtLabelLod() {
  const positions = createLabelPositions()
  let visibleLabels = 0
  let htmlLabels = 0
  const started = performance.now()

  for (let pass = 0; pass < LABEL_PASSES; pass += 1) {
    let htmlIndex = 0
    const camera = { x: Math.sin(pass * 0.03) * 30, y: 32, z: Math.cos(pass * 0.03) * 30 }
    for (const entity of positions) {
      const distance = Math.hypot(entity.x - camera.x, entity.y - camera.y, entity.z - camera.z)
      const mode = resolveLabelMode({
        distance,
        isSelected: entity.selected,
        isHovered: entity.hovered,
        htmlDistance: 18,
        spriteDistance: 42,
        maxHtmlLabels: 40,
        htmlLabelIndex: htmlIndex,
      })
      if (mode === 'html') htmlIndex += 1
      if (mode !== 'hidden') visibleLabels += 1
    }
    htmlLabels += htmlIndex
  }

  return {
    ms: performance.now() - started,
    visibleLabels,
    htmlLabels,
  }
}

function runSquaredLabelLod() {
  const positions = createLabelPositions()
  let visibleLabels = 0
  let htmlLabels = 0
  const htmlDistanceSquared = 18 * 18
  const spriteDistanceSquared = 42 * 42
  const started = performance.now()

  for (let pass = 0; pass < LABEL_PASSES; pass += 1) {
    let htmlIndex = 0
    const camera = { x: Math.sin(pass * 0.03) * 30, y: 32, z: Math.cos(pass * 0.03) * 30 }
    for (const entity of positions) {
      const dx = entity.x - camera.x
      const dy = entity.y - camera.y
      const dz = entity.z - camera.z
      const mode = resolveLabelModeFromDistanceSquared({
        distanceSquared: dx * dx + dy * dy + dz * dz,
        isSelected: entity.selected,
        isHovered: entity.hovered,
        htmlDistanceSquared,
        spriteDistanceSquared,
        maxHtmlLabels: 40,
        htmlLabelIndex: htmlIndex,
      })
      if (mode === 'html') htmlIndex += 1
      if (mode !== 'hidden') visibleLabels += 1
    }
    htmlLabels += htmlIndex
  }

  return {
    ms: performance.now() - started,
    visibleLabels,
    htmlLabels,
  }
}

function reductionPercent(beforeMs: number, afterMs: number) {
  return Number((((beforeMs - afterMs) / beforeMs) * 100).toFixed(2))
}

function createViewerPlugins(count: number) {
  return Array.from({ length: count }, (_value, index) => ({
    id: `plugin-${index}`,
    order: index % 2 === 0 ? index : index + 1,
    onFixedUpdatePre: () => {},
    onFixedUpdatePost: () => {},
    onRender: () => {},
  }))
}

function runNaiveViewerAdvance() {
  const plugins = createViewerPlugins(VIEWER_PLUGIN_COUNT)
  let accumulatorMs = 0
  let fixedPreCallbacks = 0
  const fixedStepMs = 1000 / 60
  const started = performance.now()

  for (let frame = 0; frame < VIEWER_FRAMES; frame += 1) {
    const deltaMs = 16
    accumulatorMs += deltaMs

    while (accumulatorMs >= fixedStepMs) {
      const prePlugins = [...plugins].sort((left, right) => (left.order ?? 100) - (right.order ?? 100))
      for (const plugin of prePlugins) {
        try {
          plugin.onFixedUpdatePre?.()
          fixedPreCallbacks += 1
        } catch {
          // Keep the benchmark comparable to the production runtime's error isolation.
        }
      }
      const postPlugins = [...plugins].sort((left, right) => (left.order ?? 100) - (right.order ?? 100))
      for (const plugin of postPlugins) {
        try {
          plugin.onFixedUpdatePost?.()
        } catch {
          // Keep the benchmark comparable to the production runtime's error isolation.
        }
      }
      accumulatorMs -= fixedStepMs
    }

    const sortedPlugins = [...plugins].sort((left, right) => (left.order ?? 100) - (right.order ?? 100))
    for (const plugin of sortedPlugins) {
      try {
        plugin.onRender?.()
      } catch {
        // Keep the benchmark comparable to the production runtime's error isolation.
      }
    }
  }

  return {
    ms: performance.now() - started,
    fixedPreCallbacks,
  }
}

function runCachedViewerAdvance() {
  const runtime = new DigitalTwinViewerRuntime({ fixedHz: 60 })
  const plugins = createViewerPlugins(VIEWER_PLUGIN_COUNT)
  let fixedPreCallbacks = 0

  for (const plugin of plugins) {
    runtime.use({
      ...plugin,
      onFixedUpdatePre: () => {
        fixedPreCallbacks += 1
      },
    })
  }

  const started = performance.now()
  for (let frame = 0; frame < VIEWER_FRAMES; frame += 1) {
    runtime.advance({ nowMs: frame * 16, deltaMs: 16, drawCalls: frame % 11 })
  }

  return {
    ms: performance.now() - started,
    fixedPreCallbacks,
  }
}

// Warm the JIT before measuring the reported pass.
runScratchOccupancy()
runAllocatedOccupancy()
runSquaredLabelLod()
runSqrtLabelLod()
runCachedViewerAdvance()
runNaiveViewerAdvance()

const occupancyAllocated = runAllocatedOccupancy()
const occupancyScratch = runScratchOccupancy()
const labelSqrt = runSqrtLabelLod()
const labelSquared = runSquaredLabelLod()
const viewerNaive = runNaiveViewerAdvance()
const viewerCached = runCachedViewerAdvance()

console.log(
  JSON.stringify(
    {
      scenario: 'runtime-hotpaths',
      config: {
        occupancyAgents: OCCUPANCY_AGENT_COUNT,
        occupancyTicks: OCCUPANCY_TICKS,
        labelEntities: LABEL_ENTITY_COUNT,
        labelPasses: LABEL_PASSES,
      },
      occupancy: {
        allocated: occupancyAllocated,
        scratch: occupancyScratch,
        reduction: {
          timePercent: reductionPercent(occupancyAllocated.ms, occupancyScratch.ms),
        },
      },
      labelLod: {
        sqrtDistance: labelSqrt,
        squaredDistance: labelSquared,
        reduction: {
          timePercent: reductionPercent(labelSqrt.ms, labelSquared.ms),
        },
      },
      viewerAdvance: {
        naive: viewerNaive,
        cached: viewerCached,
        reduction: {
          timePercent: reductionPercent(viewerNaive.ms, viewerCached.ms),
        },
      },
    },
    null,
    2
  )
)
