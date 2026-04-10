import {
  appendVehicleSnapshot,
  type VehicleSnapshotSample,
} from './vehicle-snapshot-interpolation'

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

  return {
    project(serverTimestamp, receivedAt = Date.now()) {
      const observedOffset = receivedAt - serverTimestamp
      offsets.push(observedOffset)
      if (offsets.length > historyLimit) {
        offsets.shift()
      }
      const estimatedOffset = resolvePercentile(offsets, percentile)
      return serverTimestamp + estimatedOffset
    },
    reset() {
      offsets.length = 0
    },
  }
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
      const nextSamples = appendVehicleSnapshot(
        snapshotsByEntityId.get(entityId) ?? [],
        sample,
        maxSamplesPerEntity
      )
      snapshotsByEntityId.set(entityId, nextSamples)
      return nextSamples
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
