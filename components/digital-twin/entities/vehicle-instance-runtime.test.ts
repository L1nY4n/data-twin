import { describe, expect, test } from 'bun:test'

import { reseedVehicleRuntimeState } from './vehicle-instance-runtime'
import type { VehicleEntity } from '@/lib/digital-twin/types'

function createVehicle(): VehicleEntity {
  return {
    id: 'vehicle-runtime-test',
    type: 'vehicle',
    name: 'Runtime Test Vehicle',
    position: { x: 12, y: 0, z: -6 },
    rotation: { x: 0, y: Math.PI / 3, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    status: 'active',
    visible: true,
    metadata: {},
    plateNumber: 'TEST-001',
    vehicleType: 'forklift',
    speed: 0,
    heading: 0,
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('vehicle instance runtime fallback', () => {
  test('reseeds stale runtime state from the latest snapshot when the pose buffer is empty', () => {
    const state = {
      x: -100,
      y: 0,
      z: -100,
      yaw: 0,
      status: 'warning' as const,
    }

    const changed = reseedVehicleRuntimeState(state, createVehicle(), {
      id: 'vehicle-runtime-test',
      eid: 1,
      type: 'vehicle',
      position: { x: 24, y: 0, z: 18 },
      rotation: { x: 0, y: Math.PI / 2, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      name: 'Runtime Test Vehicle',
      metadata: {},
      createdAt: 1,
      updatedAt: 2,
      labelMode: 'sprite',
      plateNumber: 'TEST-001',
      vehicleType: 'forklift',
      speed: 0,
      heading: 0,
    })

    expect(changed).toBe(true)
    expect(state).toEqual({
      x: 24,
      y: 0,
      z: 18,
      yaw: Math.PI / 2,
      status: 'active',
    })
  })
})
