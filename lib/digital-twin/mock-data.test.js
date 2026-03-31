import { describe, expect, test } from 'bun:test'
import {
  simulateEntityMovement,
  simulateEquipmentStatus,
} from './mock-data'

describe('simulateEquipmentStatus', () => {
  test('returns error when temperature is above 95C', () => {
    const equipment = {
      id: 'eq-1',
      type: 'equipment',
      name: '测试设备',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: {},
      createdAt: 0,
      updatedAt: 0,
      parameters: {
        温度: 100,
        功率: 50,
        运行时间: 100,
      },
      alarms: [],
    }

    const result = simulateEquipmentStatus(equipment)

    expect(result.status).toBe('error')
  })
})

describe('simulateEntityMovement', () => {
  test('returns both position and rotation result for movement update', () => {
    const entity = {
      id: 'person-1',
      type: 'person',
      name: '测试人员',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: {},
      createdAt: 0,
      updatedAt: 0,
      role: '操作员',
      department: '测试部',
      schedule: [],
    }

    const originalRandom = Math.random
    Math.random = () => 0

    try {
      const result = simulateEntityMovement(entity)

      expect(result.position).toBeDefined()
      expect(typeof result.rotationY).toBe('number')
    } finally {
      Math.random = originalRandom
    }
  })

  test('moves vehicle forward along +Z when yaw is 0', () => {
    const vehicle = {
      id: 'vehicle-1',
      type: 'vehicle',
      name: '测试车辆',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: {},
      createdAt: 0,
      updatedAt: 0,
      plateNumber: '沪A12345',
      vehicleType: 'car',
      speed: 10,
      heading: 0,
      capacity: 100,
      currentLoad: 0,
    }

    const originalRandom = Math.random
    Math.random = () => 0.5

    try {
      const result = simulateEntityMovement(vehicle)

      expect(result.position.x).toBeCloseTo(0, 6)
      expect(result.position.z).toBeGreaterThan(0)
      expect(result.position.z).toBeCloseTo(1, 6)
    } finally {
      Math.random = originalRandom
    }
  })

  test('moves vehicle forward along +X when yaw is PI/2', () => {
    const vehicle = {
      id: 'vehicle-2',
      type: 'vehicle',
      name: '测试车辆',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: Math.PI / 2, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: {},
      createdAt: 0,
      updatedAt: 0,
      plateNumber: '沪A12346',
      vehicleType: 'car',
      speed: 10,
      heading: 90,
      capacity: 100,
      currentLoad: 0,
    }

    const originalRandom = Math.random
    Math.random = () => 0.5

    try {
      const result = simulateEntityMovement(vehicle)

      expect(result.position.x).toBeGreaterThan(0)
      expect(result.position.x).toBeCloseTo(1, 6)
      expect(result.position.z).toBeCloseTo(0, 6)
    } finally {
      Math.random = originalRandom
    }
  })
})
