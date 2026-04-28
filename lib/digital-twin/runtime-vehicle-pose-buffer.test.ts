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

  test('populate only marks a runtime pose dirty when the solved pose changed', () => {
    const buffer = createRuntimeVehiclePoseBuffer({
      capacity: 2,
      useWorker: false,
      interpolationDelayMs: 0,
      maxExtrapolationMs: 0,
    })
    const target = {
      x: 1,
      y: 0,
      z: 2,
      yaw: 0.3,
      status: 'active' as const,
    }

    buffer.upsert('vehicle-3', [
      {
        timestamp: 1000,
        position: { x: 1, y: 0, z: 2 },
        yaw: 0.3,
        speed: 0,
        status: 'active',
      },
    ])

    expect(buffer.hasSolvedPose('vehicle-3')).toBe(false)
    buffer.solve(1000)
    expect(buffer.hasSolvedPose('vehicle-3')).toBe(true)
    expect(buffer.populate('vehicle-3', target)).toBe('unchanged')

    buffer.upsert('vehicle-3', [
      {
        timestamp: 1100,
        position: { x: 3, y: 0, z: 4 },
        yaw: 0.6,
        speed: 0,
        status: 'warning',
      },
    ])
    buffer.solve(1100)

    expect(buffer.populate('vehicle-3', target)).toBe('changed')
    expect(target.x).toBe(3)
    expect(target.z).toBe(4)
    expect(target.yaw).toBeCloseTo(0.6)
    expect(target.status).toBe('warning')
  })

  test('does not wake the pose worker when there are no buffered ids', () => {
    const commands: unknown[] = []
    const worker = {
      onmessage: null,
      onerror: null,
      postMessage(message: unknown) {
        commands.push(message)
      },
      terminate() {},
    }
    const buffer = createRuntimeVehiclePoseBuffer({
      capacity: 2,
      workerFactory: () => worker,
    })

    buffer.solve(1000)

    expect(commands).toEqual([])
  })

  test('uses stable worker indices instead of cloning entity ids every solve', () => {
    const commands: unknown[] = []
    const worker = {
      onmessage: null,
      onerror: null,
      postMessage(message: unknown) {
        commands.push(message)
      },
      terminate() {},
    }
    const buffer = createRuntimeVehiclePoseBuffer({
      capacity: 2,
      workerFactory: () => worker,
      interpolationDelayMs: 0,
      maxExtrapolationMs: 0,
    })

    buffer.upsert('vehicle-1', [
      {
        timestamp: 1000,
        position: { x: 1, y: 0, z: 2 },
        yaw: 0,
        speed: 0,
        status: 'active',
      },
    ])
    buffer.solve(1000)

    const upsertCommand = commands.find(
      (command) => typeof command === 'object' && command !== null && (command as { type?: string }).type === 'upsert'
    ) as { index?: number } | undefined
    const solveCommand = commands.find(
      (command) => typeof command === 'object' && command !== null && (command as { type?: string }).type === 'solve'
    ) as { count?: number; entityIds?: unknown } | undefined

    expect(upsertCommand?.index).toBe(0)
    expect(solveCommand?.count).toBe(1)
    expect(solveCommand?.entityIds).toBeUndefined()
  })
})
