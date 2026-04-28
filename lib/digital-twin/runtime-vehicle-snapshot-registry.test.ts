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

  test('keeps dense same-frame timestamp projection from overweighting the offset history', () => {
    const projector = createRuntimeTimestampProjector({
      historyLimit: 4,
      percentile: 0.5,
    })

    expect(projector.project(1_000, 1_100)).toBe(1_100)
    expect(projector.project(900, 1_100)).toBe(1_000)
    expect(projector.project(2_000, 2_120)).toBe(2_100)
  })

  test('mutates existing per-entity snapshot buffers instead of allocating per append', () => {
    const registry = createRuntimeVehicleSnapshotRegistry({
      maxSamplesPerEntity: 3,
    })

    const first = registry.append('vehicle-1', {
      timestamp: 1_000,
      sourceTimestamp: 1_000,
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
      speed: 3,
      status: 'active',
    })
    const second = registry.append('vehicle-1', {
      timestamp: 1_100,
      sourceTimestamp: 1_100,
      position: { x: 1, y: 0, z: 0 },
      yaw: 0,
      speed: 3,
      status: 'active',
    })
    const third = registry.append('vehicle-1', {
      timestamp: 1_200,
      sourceTimestamp: 1_200,
      position: { x: 2, y: 0, z: 0 },
      yaw: 0,
      speed: 3,
      status: 'active',
    })
    const fourth = registry.append('vehicle-1', {
      timestamp: 1_300,
      sourceTimestamp: 1_300,
      position: { x: 3, y: 0, z: 0 },
      yaw: 0,
      speed: 3,
      status: 'active',
    })

    expect(second).toBe(first)
    expect(third).toBe(first)
    expect(fourth).toBe(first)
    expect(registry.get('vehicle-1').map((sample) => sample.timestamp)).toEqual([
      1_100,
      1_200,
      1_300,
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
