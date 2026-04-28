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

function appendSnapshotInPlace(
  samples: VehicleSnapshotSample[],
  sample: VehicleSnapshotSample,
  maxSamples: number
) {
  if (samples.some((existing) => isDuplicateSnapshot(existing, sample))) {
    return samples
  }

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
  return samples
}

export interface RuntimeVehicleSnapshotRegistry {
  append: (entityId: string, sample: VehicleSnapshotSample) => readonly VehicleSnapshotSample[]
  get: (entityId: string) => readonly VehicleSnapshotSample[]
  projectTimestamp: (serverTimestamp: number, receivedAt?: number) => number
  clear: (entityId?: string) => void
}

export function createRuntimeVehicleSnapshotRegistry(options?: {
  maxSamplesPerEntity?: number
  timestampProjector?: RuntimeTimestampProjector
}): RuntimeVehicleSnapshotRegistry {
  const maxSamplesPerEntity = Math.max(2, options?.maxSamplesPerEntity ?? 16)
  const timestampProjector =
    options?.timestampProjector ?? createRuntimeTimestampProjector()
  const snapshotsByEntityId = new Map<string, VehicleSnapshotSample[]>()

  return {
    append(entityId, sample) {
      const existingSamples = snapshotsByEntityId.get(entityId)
      if (existingSamples) {
        return appendSnapshotInPlace(existingSamples, sample, maxSamplesPerEntity)
      }

      const samples = [sample]
      snapshotsByEntityId.set(entityId, samples)
      return samples
    },
    get(entityId) {
      return snapshotsByEntityId.get(entityId) ?? EMPTY_SNAPSHOTS
    },
    projectTimestamp(serverTimestamp, receivedAt = Date.now()) {
      return timestampProjector.project(serverTimestamp, receivedAt)
    },
    clear(entityId) {
      if (typeof entityId === 'string') {
        snapshotsByEntityId.delete(entityId)
        return
      }
      snapshotsByEntityId.clear()
      timestampProjector.reset()
    },
  }
}

export const runtimeVehicleSnapshotRegistry = createRuntimeVehicleSnapshotRegistry()
