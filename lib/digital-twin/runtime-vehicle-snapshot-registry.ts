import type { VehicleSnapshotSample } from './vehicle-snapshot-interpolation'

const EMPTY_SNAPSHOTS = Object.freeze([]) as readonly VehicleSnapshotSample[]

function clampPercentile(percentile: number) {
  return Math.min(Math.max(percentile, 0), 1)
}

function resolvePercentile(values: number[], percentile: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const normalizedPercentile = clampPercentile(percentile)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * normalizedPercentile))
  )
  return sorted[index] ?? sorted[sorted.length - 1] ?? 0
}

export interface RuntimeTimestampProjector {
  project: (serverTimestamp: number, receivedAt?: number) => number
  reset: () => void
}

export function createRuntimeTimestampProjector(options?: {
  historyLimit?: number
  percentile?: number
}): RuntimeTimestampProjector {
  const historyLimit = Math.max(4, options?.historyLimit ?? 48)
  const percentile = options?.percentile ?? 0.15
  const offsets: number[] = []
  let lastReceivedAt: number | null = null
  let lastEstimatedOffset = 0

  return {
    project(serverTimestamp, receivedAt = Date.now()) {
      if (lastReceivedAt !== receivedAt) {
        const observedOffset = receivedAt - serverTimestamp
        offsets.push(observedOffset)
        if (offsets.length > historyLimit) {
          offsets.shift()
        }
        lastEstimatedOffset = resolvePercentile(offsets, percentile)
        lastReceivedAt = receivedAt
      }
      return serverTimestamp + lastEstimatedOffset
    },
    reset() {
      offsets.length = 0
      lastReceivedAt = null
      lastEstimatedOffset = 0
    },
  }
}

function isDuplicateSnapshot(
  existing: VehicleSnapshotSample,
  sample: VehicleSnapshotSample
) {
  if (
    sample.sourceTimestamp !== undefined &&
    existing.sourceTimestamp !== undefined &&
    existing.sourceTimestamp === sample.sourceTimestamp
  ) {
    return true
  }

  return (
    existing.timestamp === sample.timestamp &&
    existing.position.x === sample.position.x &&
    existing.position.y === sample.position.y &&
    existing.position.z === sample.position.z &&
    existing.yaw === sample.yaw
  )
}

interface AppendSnapshotResult {
  samples: VehicleSnapshotSample[]
  droppedOverflow: number
}

function appendSnapshotInPlace(
  samples: VehicleSnapshotSample[],
  sample: VehicleSnapshotSample,
  maxSamples: number
): AppendSnapshotResult {
  const insertIndex = samples.findIndex((existing) => existing.timestamp > sample.timestamp)
  if (insertIndex === -1) {
    samples.push(sample)
  } else {
    samples.splice(insertIndex, 0, sample)
  }

  const overflow = samples.length - maxSamples
  if (overflow > 0) {
    samples.splice(0, overflow)
  }
  return {
    samples,
    droppedOverflow: Math.max(0, overflow),
  }
}

export interface RuntimeVehicleSnapshotRegistryStats {
  entityCount: number
  acceptedSnapshots: number
  duplicateSnapshots: number
  staleSnapshots: number
  reorderedSnapshots: number
  droppedOverflowSnapshots: number
}

export interface RuntimeVehicleSnapshotRegistry {
  append: (entityId: string, sample: VehicleSnapshotSample) => readonly VehicleSnapshotSample[]
  get: (entityId: string) => readonly VehicleSnapshotSample[]
  projectTimestamp: (serverTimestamp: number, receivedAt?: number) => number
  getStats: () => RuntimeVehicleSnapshotRegistryStats
  clear: (entityId?: string) => void
}

export function createRuntimeVehicleSnapshotRegistry(options?: {
  maxSamplesPerEntity?: number
  timestampProjector?: RuntimeTimestampProjector
  maxSourceTimestampBacktrackMs?: number
}): RuntimeVehicleSnapshotRegistry {
  const maxSamplesPerEntity = Math.max(2, options?.maxSamplesPerEntity ?? 16)
  const maxSourceTimestampBacktrackMs = Math.max(
    0,
    options?.maxSourceTimestampBacktrackMs ?? 1_500
  )
  const timestampProjector =
    options?.timestampProjector ?? createRuntimeTimestampProjector()
  const snapshotsByEntityId = new Map<string, VehicleSnapshotSample[]>()
  const latestSourceTimestampByEntityId = new Map<string, number>()
  let acceptedSnapshots = 0
  let duplicateSnapshots = 0
  let staleSnapshots = 0
  let reorderedSnapshots = 0
  let droppedOverflowSnapshots = 0

  function resolveOrderingTimestamp(sample: VehicleSnapshotSample) {
    return sample.sourceTimestamp ?? sample.timestamp
  }

  function isStaleSourceTimestamp(entityId: string, sample: VehicleSnapshotSample) {
    const orderingTimestamp = resolveOrderingTimestamp(sample)
    const latestSourceTimestamp = latestSourceTimestampByEntityId.get(entityId)
    if (latestSourceTimestamp === undefined) return false
    return orderingTimestamp < latestSourceTimestamp - maxSourceTimestampBacktrackMs
  }

  function recordAcceptedSnapshot(
    entityId: string,
    sample: VehicleSnapshotSample,
    result: AppendSnapshotResult
  ) {
    const orderingTimestamp = resolveOrderingTimestamp(sample)
    const latestSourceTimestamp = latestSourceTimestampByEntityId.get(entityId)
    if (latestSourceTimestamp !== undefined && orderingTimestamp < latestSourceTimestamp) {
      reorderedSnapshots += 1
    }
    if (
      latestSourceTimestamp === undefined ||
      orderingTimestamp > latestSourceTimestamp
    ) {
      latestSourceTimestampByEntityId.set(entityId, orderingTimestamp)
    }

    acceptedSnapshots += 1
    droppedOverflowSnapshots += result.droppedOverflow
  }

  return {
    append(entityId, sample) {
      const existingSamples = snapshotsByEntityId.get(entityId)
      if (existingSamples) {
        if (existingSamples.some((existing) => isDuplicateSnapshot(existing, sample))) {
          duplicateSnapshots += 1
          return existingSamples
        }
        if (isStaleSourceTimestamp(entityId, sample)) {
          staleSnapshots += 1
          return existingSamples
        }
        const result = appendSnapshotInPlace(existingSamples, sample, maxSamplesPerEntity)
        recordAcceptedSnapshot(entityId, sample, result)
        return result.samples
      }

      const samples = [sample]
      snapshotsByEntityId.set(entityId, samples)
      const initialResult: AppendSnapshotResult = {
        samples,
        droppedOverflow: 0,
      }
      recordAcceptedSnapshot(entityId, sample, initialResult)
      return samples
    },
    get(entityId) {
      return snapshotsByEntityId.get(entityId) ?? EMPTY_SNAPSHOTS
    },
    projectTimestamp(serverTimestamp, receivedAt = Date.now()) {
      return timestampProjector.project(serverTimestamp, receivedAt)
    },
    getStats() {
      return {
        entityCount: snapshotsByEntityId.size,
        acceptedSnapshots,
        duplicateSnapshots,
        staleSnapshots,
        reorderedSnapshots,
        droppedOverflowSnapshots,
      }
    },
    clear(entityId) {
      if (typeof entityId === 'string') {
        snapshotsByEntityId.delete(entityId)
        latestSourceTimestampByEntityId.delete(entityId)
        return
      }
      snapshotsByEntityId.clear()
      latestSourceTimestampByEntityId.clear()
      acceptedSnapshots = 0
      duplicateSnapshots = 0
      staleSnapshots = 0
      reorderedSnapshots = 0
      droppedOverflowSnapshots = 0
      timestampProjector.reset()
    },
  }
}

export const runtimeVehicleSnapshotRegistry = createRuntimeVehicleSnapshotRegistry()
