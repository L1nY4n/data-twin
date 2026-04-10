import { describe, expect, test } from 'bun:test'
import {
  advanceVehicleRouteContract,
  resolveVehicleRoutePose,
} from './vehicle-route-motion'

describe('vehicle route motion', () => {
  test('resolves pose from segment progress', () => {
    const track = {
      id: 'track-1',
      loop: true,
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
      ],
    }
    const route = {
      trackId: 'track-1',
      segmentIndex: 0,
      segmentProgress: 0.25,
      direction: 'forward' as const,
    }

    expect(resolveVehicleRoutePose(track, route)).toEqual({
      position: { x: 2.5, y: 0, z: 0 },
      yaw: Math.PI / 2,
    })
  })

  test('advances along the current segment with elapsed time', () => {
    const track = {
      id: 'track-1',
      loop: true,
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
      ],
    }
    const route = {
      trackId: 'track-1',
      segmentIndex: 0,
      segmentProgress: 0.2,
      direction: 'forward' as const,
    }

    expect(advanceVehicleRouteContract(track, route, 4, 1)).toEqual({
      trackId: 'track-1',
      segmentIndex: 0,
      segmentProgress: 0.6,
      direction: 'forward',
      target: { x: 10, y: 0, z: 0 },
    })
  })

  test('crosses into the next segment when the current one is exhausted', () => {
    const track = {
      id: 'track-1',
      loop: true,
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
        { x: 10, y: 0, z: 10 },
      ],
    }
    const route = {
      trackId: 'track-1',
      segmentIndex: 0,
      segmentProgress: 0.9,
      direction: 'forward' as const,
    }

    expect(advanceVehicleRouteContract(track, route, 4, 1)).toEqual({
      trackId: 'track-1',
      segmentIndex: 1,
      segmentProgress: 0.3,
      direction: 'forward',
      target: { x: 10, y: 0, z: 10 },
    })
  })
})
