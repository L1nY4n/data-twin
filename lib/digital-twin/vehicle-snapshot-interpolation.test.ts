import { describe, expect, test } from 'bun:test'
import {
  appendVehicleSnapshot,
  resolveVehiclePoseFromSnapshots,
} from './vehicle-snapshot-interpolation'

describe('vehicle snapshot interpolation', () => {
  test('interpolates between two snapshots at a delayed render time', () => {
    const pose = resolveVehiclePoseFromSnapshots(
      [
        {
          timestamp: 1000,
          position: { x: 0, y: 0, z: 0 },
          yaw: 0,
          speed: 0,
          status: 'active',
        },
        {
          timestamp: 1200,
          position: { x: 10, y: 0, z: 0 },
          yaw: 0,
          speed: 0,
          status: 'active',
        },
      ],
      1300,
      150,
      200
    )

    expect(pose).toEqual({
      x: 7.5,
      y: 0,
      z: 0,
      yaw: 0,
      status: 'active',
    })
  })

  test('extrapolates along the route when render time is slightly ahead of the latest packet', () => {
    const pose = resolveVehiclePoseFromSnapshots(
      [
        {
          timestamp: 1000,
          position: { x: 0, y: 0, z: 0 },
          yaw: 0,
          speed: 5,
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
      ],
      1180,
      100,
      200
    )

    expect(pose).toEqual({
      x: 5.4,
      y: 0,
      z: 0,
      yaw: Math.PI / 2,
      status: 'active',
    })
  })

  test('deduplicates repeated snapshots with the same timestamp and pose', () => {
    const snapshots = appendVehicleSnapshot([], {
      timestamp: 1000,
      sourceTimestamp: 1000,
      position: { x: 1, y: 0, z: 2 },
      yaw: 0.3,
      speed: 3,
      status: 'active',
    })
    const deduped = appendVehicleSnapshot(snapshots, {
      timestamp: 1000,
      sourceTimestamp: 1000,
      position: { x: 1, y: 0, z: 2 },
      yaw: 0.3,
      speed: 3,
      status: 'active',
    })

    expect(deduped).toHaveLength(1)
  })

  test('keeps late snapshots ordered by timestamp before interpolation', () => {
    const snapshots = appendVehicleSnapshot(
      appendVehicleSnapshot([], {
        timestamp: 1200,
        sourceTimestamp: 1200,
        position: { x: 12, y: 0, z: 0 },
        yaw: 0,
        speed: 3,
        status: 'active',
      }),
      {
        timestamp: 1000,
        sourceTimestamp: 1000,
        position: { x: 0, y: 0, z: 0 },
        yaw: 0,
        speed: 3,
        status: 'active',
      }
    )

    expect(snapshots.map((sample) => sample.timestamp)).toEqual([1000, 1200])
  })
})
