import { describe, expect, test } from 'bun:test'

import { createRuntimeVehiclePoseBuffer } from './runtime-vehicle-pose-buffer'

describe('runtime vehicle pose buffer', () => {
  test('solves buffered vehicle poses and exposes them by entity id', () => {
    const buffer = createRuntimeVehiclePoseBuffer({
      capacity: 2,
      useWorker: false,
      interpolationDelayMs: 0,
      maxExtrapolationMs: 0,
    })

    buffer.upsert('vehicle-1', [
      {
        timestamp: 1000,
        position: { x: 0, y: 0, z: 0 },
        yaw: 0,
        speed: 2,
        status: 'active',
        routeTrack: {
          id: 'track-1',
          loop: true,
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 10, y: 0, z: 0 },
          ],
        },
        trackPosition: {
          trackId: 'track-1',
          segmentIndex: 0,
          segmentProgress: 0.5,
          direction: 'forward',
        },
      },
    ])

    buffer.solve(1000)

    const pose = buffer.get('vehicle-1')
    expect(pose).not.toBeNull()
    expect(pose?.x).toBe(5)
    expect(pose?.y).toBe(0)
    expect(pose?.z).toBe(0)
    expect(pose?.yaw).toBeCloseTo(Math.PI / 2, 5)
    expect(pose?.status).toBe('active')
  })

  test('returns no pose before solving and clears state on delete', () => {
    const buffer = createRuntimeVehiclePoseBuffer({
      capacity: 2,
      useWorker: false,
    })

    buffer.upsert('vehicle-2', [
      {
        timestamp: 1000,
        position: { x: 1, y: 0, z: 2 },
        yaw: 0,
        speed: 0,
        status: 'warning',
      },
    ])

    expect(buffer.get('vehicle-2')).toBeNull()
    buffer.solve(1000)
    expect(buffer.get('vehicle-2')).not.toBeNull()

    buffer.delete('vehicle-2')
    expect(buffer.get('vehicle-2')).toBeNull()
  })
})
