#!/usr/bin/env bun

import { performance } from 'node:perf_hooks'
import { writeFileSync } from 'node:fs'

import {
  buildRuntimePositionEntityPatch,
  buildRuntimeStatusEntityPatch,
} from '../lib/digital-twin/runtime-ingest'
import { DigitalTwinWebSocket } from '../lib/digital-twin/websocket-client'
import {
  appendVehicleSnapshot,
  resolveVehiclePoseFromSnapshots,
  type VehicleSnapshotSample,
} from '../lib/digital-twin/vehicle-snapshot-interpolation'
import type {
  PositionUpdateMessage,
  StatusUpdateMessage,
  VehicleEntity,
} from '../lib/digital-twin/types'

type BenchmarkLabel = 'baseline' | 'post'

interface BenchmarkReport {
  label: BenchmarkLabel
  generatedAt: string
  connection: Record<string, unknown>
  ingestion: Record<string, unknown>
  interpolation: Record<string, unknown>
}

const DEFAULT_OUT =
  '.omx/state/sessions/019d9f1a-dba8-7540-a6fc-d4bde0d02827/aetherweave-migration-benchmark.json'
const INTERPOLATION_DELAY_MS = 120
const MAX_EXTRAPOLATION_MS = 220

function argValue(flag: string) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  return process.argv[index + 1] ?? null
}

function createVehicleEntity(index: number): VehicleEntity {
  return {
    id: `vehicle-${index}`,
    type: 'vehicle',
    name: `Vehicle ${index}`,
    position: { x: index, y: 0, z: index * 0.5 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    status: 'active',
    visible: true,
    metadata: {},
    plateNumber: `TEST-${index}`,
    vehicleType: index % 3 === 0 ? 'truck' : index % 3 === 1 ? 'forklift' : 'car',
    speed: 2.4,
    heading: 90,
    createdAt: 1,
    updatedAt: 1,
  }
}

function createPositionMessage(
  entityId: string,
  tick: number,
  seed: number
): PositionUpdateMessage {
  const x = seed + tick * 0.4
  const z = seed * 0.2 + tick * 0.3
  return {
    entityId,
    position: { x, y: 0, z },
    speed: 2.4 + (tick % 5) * 0.1,
    heading: (tick * 7) % 360,
    routeTrack: {
      id: `track-${entityId}`,
      loop: true,
      points: [
        { x, y: 0, z },
        { x: x + 4, y: 0, z: z + 3 },
        { x: x + 8, y: 0, z: z + 3 },
      ],
    },
    trackPosition: {
      trackId: `track-${entityId}`,
      segmentIndex: tick % 2,
      segmentProgress: (tick % 10) / 10,
      direction: 'forward',
      target: { x: x + 8, y: 0, z: z + 3 },
    },
  }
}

function createStatusMessage(entityId: string, tick: number): StatusUpdateMessage {
  return {
    entityId,
    status: tick % 11 === 0 ? 'warning' : tick % 17 === 0 ? 'error' : 'active',
    parameters: {
      battery: 90 - (tick % 20),
      mode: tick % 2 === 0 ? '巡检' : '运输',
    },
  }
}

function buildVehicleSamples(vehicleCount: number, sampleCount: number) {
  const snapshotsById = new Map<string, VehicleSnapshotSample[]>()
  const baseTimestamp = 1_000_000

  for (let vehicleIndex = 0; vehicleIndex < vehicleCount; vehicleIndex += 1) {
    let snapshots: VehicleSnapshotSample[] = []
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const message = createPositionMessage(`vehicle-${vehicleIndex}`, sampleIndex, vehicleIndex)
      snapshots = appendVehicleSnapshot(snapshots, {
        timestamp: baseTimestamp + sampleIndex * 120,
        sourceTimestamp: baseTimestamp + sampleIndex * 120,
        receivedAt: baseTimestamp + sampleIndex * 120 + 8,
        position: message.position,
        yaw: 0,
        speed: message.speed ?? 0,
        routeTrack: message.routeTrack,
        trackPosition: message.trackPosition,
        status: 'active',
      })
    }
    snapshotsById.set(`vehicle-${vehicleIndex}`, snapshots)
  }

  return snapshotsById
}

function runBaselineConnectionScenario(subscriberCount: number) {
  const instances: MockWebSocket[] = []

  class MockWebSocket {
    readyState = MockWebSocket.OPEN
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onerror: ((event: Event) => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null

    static OPEN = 1

    constructor(url: string) {
      void url
      instances.push(this)
      queueMicrotask(() => {
        this.onopen?.()
      })
    }

    close() {
      this.onclose?.()
    }

    send(payload: string) {
      void payload
    }
  }

  // @ts-expect-error benchmark mock
  globalThis.WebSocket = MockWebSocket

  const started = performance.now()
  const clients = Array.from({ length: subscriberCount }, (_, index) => {
    const client = new DigitalTwinWebSocket({
      url: `ws://bench/workspaces/demo/realtime`,
      socketFactory: (url) => new MockWebSocket(url),
      onMessage: () => {
        if (index === -1) {
          throw new Error('unreachable')
        }
      },
    })
    client.connect()
    return client
  })
  const elapsedMs = performance.now() - started

  clients.forEach((client) => client.disconnect({ suppressDisconnectEvent: true }))

  return {
    subscriberCount,
    elapsedMs,
    socketInstances: instances.length,
  }
}

function runBaselineIngestionScenario(entityCount: number, ticks: number) {
  const entities = new Map<string, VehicleEntity>()
  const sampleRegistry = new Map<string, VehicleSnapshotSample[]>()
  for (let index = 0; index < entityCount; index += 1) {
    entities.set(`vehicle-${index}`, createVehicleEntity(index))
  }

  let flushes = 0
  let patches = 0
  const started = performance.now()
  for (let tick = 0; tick < ticks; tick += 1) {
    for (let entityIndex = 0; entityIndex < entityCount; entityIndex += 1) {
      const entityId = `vehicle-${entityIndex}`
      const current = entities.get(entityId)
      if (!current) continue

      const positionMessage = createPositionMessage(entityId, tick, entityIndex)
      const positionPatch = buildRuntimePositionEntityPatch(current, positionMessage, {
        timestamp: tick,
      }) as Partial<VehicleEntity>
      entities.set(entityId, { ...current, ...positionPatch })
      sampleRegistry.set(
        entityId,
        appendVehicleSnapshot(sampleRegistry.get(entityId) ?? [], {
          timestamp: tick,
          position: positionPatch.position ?? positionMessage.position,
          yaw: positionPatch.rotation?.y ?? current.rotation.y,
          speed: positionPatch.speed ?? current.speed,
          routeTrack: positionPatch.routeTrack ?? current.routeTrack,
          trackPosition: positionPatch.trackPosition ?? current.trackPosition,
          status: current.status,
        })
      )
      flushes += 1
      patches += 1

      if (tick % 3 === 0) {
        const statusPatch = buildRuntimeStatusEntityPatch(
          entities.get(entityId),
          createStatusMessage(entityId, tick)
        ) as Partial<VehicleEntity>
        entities.set(entityId, { ...entities.get(entityId)!, ...statusPatch })
        flushes += 1
        patches += 1
      }
    }
  }

  return {
    entityCount,
    ticks,
    elapsedMs: performance.now() - started,
    patches,
    flushes,
  }
}

function runBaselineInterpolationScenario(vehicleCount: number, sampleCount: number, frameCount: number) {
  const snapshotsById = buildVehicleSamples(vehicleCount, sampleCount)
  let checksum = 0
  const started = performance.now()
  for (let frame = 0; frame < frameCount; frame += 1) {
    const nowMs = 1_000_000 + frame * 16
    for (let vehicleIndex = 0; vehicleIndex < vehicleCount; vehicleIndex += 1) {
      const pose = resolveVehiclePoseFromSnapshots(
        snapshotsById.get(`vehicle-${vehicleIndex}`) ?? [],
        nowMs,
        INTERPOLATION_DELAY_MS,
        MAX_EXTRAPOLATION_MS
      )
      checksum += pose?.x ?? 0
      checksum += pose?.z ?? 0
    }
  }

  return {
    vehicleCount,
    sampleCount,
    frameCount,
    elapsedMs: performance.now() - started,
    checksum,
  }
}

async function maybeRunOptimizedConnectionScenario(subscriberCount: number) {
  try {
    const mod = await import('../lib/digital-twin/realtime-connection-hub')
    if (typeof mod.createRealtimeConnectionHub !== 'function') return null

    const instances: unknown[] = []
    const hub = mod.createRealtimeConnectionHub({
      createClient: () => {
        instances.push({})
        return {
          connect() {},
          disconnect() {},
          subscribeAll() {
            return () => {}
          },
          get isConnected() {
            return true
          },
        }
      },
    })

    const unsubscribers = Array.from({ length: subscriberCount }, () =>
      hub.subscribe('ws://bench/workspaces/demo/realtime', { onMessage: () => {} })
    )
    unsubscribers.forEach((unsubscribe) => unsubscribe())

    return {
      subscriberCount,
      socketInstances: instances.length,
    }
  } catch {
    return null
  }
}

async function maybeRunOptimizedIngestionScenario(entityCount: number, ticks: number) {
  try {
    const mod = await import('../lib/digital-twin/runtime-message-batcher')
    if (typeof mod.createRuntimeMessageBatcher !== 'function') return null

    let flushes = 0
    const batcher = mod.createRuntimeMessageBatcher({
      flush: () => {
        flushes += 1
      },
    })

    const started = performance.now()
    for (let tick = 0; tick < ticks; tick += 1) {
      for (let entityIndex = 0; entityIndex < entityCount; entityIndex += 1) {
        batcher.push({
          type: 'position_update',
          timestamp: tick,
          payload: createPositionMessage(`vehicle-${entityIndex}`, tick, entityIndex),
        })
        if (tick % 3 === 0) {
          batcher.push({
            type: 'status_update',
            timestamp: tick,
            payload: createStatusMessage(`vehicle-${entityIndex}`, tick),
          })
        }
      }
      batcher.flushNow()
    }

    return {
      entityCount,
      ticks,
      elapsedMs: performance.now() - started,
      flushes,
    }
  } catch {
    return null
  }
}

async function maybeRunOptimizedInterpolationScenario(
  vehicleCount: number,
  sampleCount: number,
  frameCount: number
) {
  try {
    const mod = await import('../lib/digital-twin/runtime-vehicle-pose-buffer')
    if (typeof mod.createRuntimeVehiclePoseBuffer !== 'function') return null

    const snapshotsById = buildVehicleSamples(vehicleCount, sampleCount)
    const buffer = mod.createRuntimeVehiclePoseBuffer({
      capacity: vehicleCount,
      interpolationDelayMs: INTERPOLATION_DELAY_MS,
      maxExtrapolationMs: MAX_EXTRAPOLATION_MS,
    })

    snapshotsById.forEach((samples, entityId) => {
      buffer.upsert(entityId, samples)
    })

    let checksum = 0
    const started = performance.now()
    for (let frame = 0; frame < frameCount; frame += 1) {
      buffer.solve(1_000_000 + frame * 16)
      for (let vehicleIndex = 0; vehicleIndex < vehicleCount; vehicleIndex += 1) {
        const pose = buffer.get(`vehicle-${vehicleIndex}`)
        checksum += pose?.x ?? 0
        checksum += pose?.z ?? 0
      }
    }

    return {
      vehicleCount,
      sampleCount,
      frameCount,
      elapsedMs: performance.now() - started,
      checksum,
    }
  } catch {
    return null
  }
}

async function main() {
  const label = (argValue('--label') as BenchmarkLabel | null) ?? 'baseline'
  const outPath = argValue('--out') ?? DEFAULT_OUT

  const report: BenchmarkReport = {
    label,
    generatedAt: new Date().toISOString(),
    connection: runBaselineConnectionScenario(16),
    ingestion: runBaselineIngestionScenario(180, 120),
    interpolation: runBaselineInterpolationScenario(240, 8, 320),
  }

  const [optimizedConnection, optimizedIngestion, optimizedInterpolation] = await Promise.all([
    maybeRunOptimizedConnectionScenario(16),
    maybeRunOptimizedIngestionScenario(180, 120),
    maybeRunOptimizedInterpolationScenario(240, 8, 320),
  ])

  if (optimizedConnection) {
    report.connection = {
      ...(report.connection as Record<string, unknown>),
      optimized: optimizedConnection,
    }
  }
  if (optimizedIngestion) {
    report.ingestion = {
      ...(report.ingestion as Record<string, unknown>),
      optimized: optimizedIngestion,
    }
  }
  if (optimizedInterpolation) {
    report.interpolation = {
      ...(report.interpolation as Record<string, unknown>),
      optimized: optimizedInterpolation,
    }
  }

  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
