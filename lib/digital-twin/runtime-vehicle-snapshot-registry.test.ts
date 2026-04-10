import { describe, expect, test } from 'bun:test'
import {
  createRuntimeTimestampProjector,
  createRuntimeVehicleSnapshotRegistry,
} from './runtime-vehicle-snapshot-registry'

describe('runtime vehicle snapshot registry', () => {
  test('projects server timestamps onto a stable local timeline', () => {
    const projector = createRuntimeTimestampProjector({
      historyLimit: 6,
      percentile: 0.2,
    })

    expect(projector.project(1_000, 1_090)).toBe(1_090)
    expect(projector.project(1_200, 1_320)).toBe(1_290)
    expect(projector.project(1_400, 1_505)).toBe(1_490)
  })

  test('stores per-entity snapshots in timestamp order', () => {
    const registry = createRuntimeVehicleSnapshotRegistry({
      maxSamplesPerEntity: 4,
    })

    registry.append('vehicle-1', {
      timestamp: 1_200,
      sourceTimestamp: 1_120,
      position: { x: 12, y: 0, z: 0 },
      yaw: 0,
      speed: 3,
      status: 'active',
    })
    registry.append('vehicle-1', {
      timestamp: 1_000,
      sourceTimestamp: 1_000,
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
      speed: 3,
      status: 'active',
    })
    registry.append('vehicle-1', {
      timestamp: 1_100,
      sourceTimestamp: 1_080,
      position: { x: 6, y: 0, z: 0 },
      yaw: 0,
      speed: 3,
      status: 'active',
    })

    expect(registry.get('vehicle-1').map((sample) => sample.timestamp)).toEqual([
      1_000,
      1_100,
      1_200,
    ])
  })

  test('resets buffers and time sync together on global clear', () => {
    const registry = createRuntimeVehicleSnapshotRegistry()
    const projectedBeforeClear = registry.projectTimestamp(1_000, 1_090)

    registry.append('vehicle-1', {
      timestamp: projectedBeforeClear,
      sourceTimestamp: 1_000,
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
      speed: 0,
      status: 'active',
    })
    registry.clear()

    expect(registry.get('vehicle-1')).toEqual([])
    expect(registry.projectTimestamp(2_000, 2_150)).toBe(2_150)
  })
})
