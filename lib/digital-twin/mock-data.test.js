import { describe, expect, test } from 'bun:test'
import {
  CAMPUS_EQUIPMENT_PLACEMENTS,
  VEHICLE_LANE_RECTS,
} from './campus-layout'
import {
  applyDynamicSeparation,
  generateEquipment,
  generateMockScene,
  generatePerson,
  generateVehicle,
  isPointOnPlantMobilityLane,
  planPlantRoute,
  resolveVehicleBlockedMetadata,
  simulateEntityMovement,
  simulateEquipmentStatus,
} from './mock-data'

function pointInsideLane(point, lane) {
  return (
    point.x >= lane.minX &&
    point.x <= lane.maxX &&
    point.z >= lane.minZ &&
    point.z <= lane.maxZ
  )
}

function isCampusTransferLane(lane) {
  return lane.maxX - lane.minX > 300 || lane.maxZ - lane.minZ > 300
}

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

  test('increments runtime by elapsed seconds instead of one step per scheduler tick', () => {
    const equipment = {
      id: 'eq-2',
      type: 'equipment',
      name: '运行时间设备',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: {},
      createdAt: 0,
      updatedAt: 0,
      parameters: {
        温度: 60,
        压力: 1.5,
        流量: 120,
        运行时间: 100,
      },
      alarms: [],
    }

    const result = simulateEquipmentStatus(equipment, 2500)

    expect(result.parameters['运行时间']).toBeCloseTo(102.5, 6)
  })
})

describe('chemical plant mock scene semantics', () => {
  test('generates plant-specific zones and equipment names', () => {
    const scene = generateMockScene()

    expect(scene.zones.length).toBeGreaterThanOrEqual(12)
    expect(scene.zones.some((zone) => zone.name === '西区反应单元')).toBe(true)
    expect(scene.zones.some((zone) => zone.name === '东区原料罐组')).toBe(true)
    expect(scene.zones.some((zone) => zone.name === '南区装车廊道')).toBe(true)
    expect(scene.zones.some((zone) => zone.name === '北区循环水站')).toBe(true)
    expect(scene.equipment.some((equipment) => equipment.name.includes('反应器'))).toBe(true)
    expect(scene.equipment.some((equipment) => equipment.name.includes('装车鹤管'))).toBe(true)
    expect(scene.equipment.some((equipment) => equipment.name.includes('污水'))).toBe(true)
  })

  test('generates plant-specific people and vehicles', () => {
    const person = generatePerson()
    const vehicle = generateVehicle()

    expect(['外操', '内操', '巡检工程师', '仪表技术员', '设备维修工', 'HSE监督员']).toContain(person.role)
    expect(['生产运行部', '设备维护部', '仪表自动化部', 'HSE部']).toContain(person.department)
    expect(person.name).toMatch(/^[\u4e00-\u9fa5]{2,3}$/)
    expect(String(person.metadata.employeeNo)).toMatch(/^[A-Z]{3}-\d{4}$/)
    expect(String(person.metadata.shift)).toMatch(/^(甲班|乙班|丙班|常白班)$/)
    expect(vehicle.name).toMatch(
      /^(厂内巡检车 IP|危化品槽车 HT|电动叉车 FL|采样AGV AGV|运维保障车 MT)-\d{3}$/
    )
    expect(String(vehicle.metadata.assetCode)).toMatch(/^(IP|HT|FL|AGV|MT)-\d{3}$/)
    expect(vehicle.speed).toBe(0)
    expect(typeof vehicle.metadata.cruiseSpeed).toBe('number')
    expect(Array.isArray(vehicle.metadata.routeLoop)).toBe(true)
    expect(typeof vehicle.metadata.routeLoopIndex).toBe('number')
    expect(
      Math.abs(Math.sin(vehicle.rotation.y)) < 1e-6 || Math.abs(Math.cos(vehicle.rotation.y)) < 1e-6
    ).toBe(true)
  })

  test('generates chemical telemetry parameters for equipment', () => {
    const equipment = generateEquipment()

    expect(equipment.name).not.toMatch(/\d{4}$/)
    expect(String(equipment.metadata.assetTag)).toMatch(/[A-Z]{1,4}-\d{3}$/)
    expect(Object.keys(equipment.parameters)).toContain('温度')
    expect(Object.keys(equipment.parameters)).toContain('压力')
    expect(Object.keys(equipment.parameters)).toContain('流量')
  })

  test('production profile scales moving population above the default campus scene', () => {
    const defaultScene = generateMockScene()
    const productionScene = generateMockScene({ profile: 'production' })

    expect(productionScene.persons.length).toBeGreaterThan(defaultScene.persons.length)
    expect(productionScene.vehicles.length).toBeGreaterThan(defaultScene.vehicles.length)
    expect(productionScene.equipment.length).toBeGreaterThan(defaultScene.equipment.length)
  })

  test('production profile does not spawn vehicles inside the vehicle safety radius', () => {
    const { vehicles } = generateMockScene({ profile: 'production' })

    for (let i = 0; i < vehicles.length; i += 1) {
      for (let j = i + 1; j < vehicles.length; j += 1) {
        const distance = Math.hypot(
          vehicles[i].position.x - vehicles[j].position.x,
          vehicles[i].position.z - vehicles[j].position.z
        )
        expect(distance).toBeGreaterThanOrEqual(2.6)
      }
    }
  })

  test('production profile keeps loading arms unique and outside vehicle lanes', () => {
    const { equipment } = generateMockScene({ profile: 'production' })
    const loadingArms = equipment.filter((item) => item.name.includes('装车鹤管'))
    const loadingArmAnchorCount = CAMPUS_EQUIPMENT_PLACEMENTS.filter((item) =>
      item.name.includes('装车鹤管')
    ).length
    const districtVehicleLanes = VEHICLE_LANE_RECTS.filter((lane) => !isCampusTransferLane(lane))

    expect(loadingArms.length).toBe(loadingArmAnchorCount)

    for (const loadingArm of loadingArms) {
      expect(loadingArm.name.includes('#')).toBe(false)
      expect(
        districtVehicleLanes.some((lane) => pointInsideLane(loadingArm.position, lane))
      ).toBe(false)
    }
  })
})

describe('chemical plant route planning', () => {
  test('plans vehicle route on plant lanes instead of crossing blocked tank space', () => {
    const route = planPlantRoute(
      'vehicle',
      { x: 0, y: 0, z: -4 },
      { x: 70, y: 0, z: -72 }
    )

    expect(route.length).toBeGreaterThan(2)
    route.forEach((point) => {
      expect(isPointOnPlantMobilityLane('vehicle', point)).toBe(true)
    })
    expect(route.some((point) => point.z <= -64)).toBe(true)
  })

  test('plans person route on walkways instead of cutting through process structures', () => {
    const route = planPlantRoute(
      'person',
      { x: -88, y: 0, z: -12 },
      { x: -12, y: 0, z: -82 }
    )

    expect(route.length).toBeGreaterThan(2)
    route.forEach((point) => {
      expect(isPointOnPlantMobilityLane('person', point)).toBe(true)
    })
  })
})

describe('dynamic movement separation', () => {
  test('lets vehicle creep forward to the nearest safe following distance', () => {
    const result = applyDynamicSeparation(
      'vehicle-a',
      'vehicle',
      { x: 0, y: 0, z: 0 },
      { x: 2.4, y: 0, z: 0 },
      [{ id: 'vehicle-b', type: 'vehicle', position: { x: 3.2, y: 0, z: 0 } }]
    )

    expect(result.blocked).toBe(false)
    expect(result.position.x).toBeGreaterThan(0)
    expect(result.position.x).toBeLessThan(0.7)
    expect(result.position.z).toBe(0)
  })

  test('holds vehicle when there is no safe forward progress available', () => {
    const result = applyDynamicSeparation(
      'vehicle-a',
      'vehicle',
      { x: 0, y: 0, z: 0 },
      { x: 0.6, y: 0, z: 0 },
      [{ id: 'vehicle-b', type: 'vehicle', position: { x: 2.6, y: 0, z: 0 } }]
    )

    expect(result.blocked).toBe(true)
    expect(result.position).toEqual({ x: 0, y: 0, z: 0 })
  })

  test('holds person when the next step would enter vehicle safety radius', () => {
    const result = applyDynamicSeparation(
      'person-a',
      'person',
      { x: 0, y: 0, z: 0 },
      { x: 1.1, y: 0, z: 0 },
      [{ id: 'vehicle-b', type: 'vehicle', position: { x: 2.2, y: 0, z: 0 } }]
    )

    expect(result.blocked).toBe(true)
    expect(result.position).toEqual({ x: 0, y: 0, z: 0 })
  })
})

describe('vehicle blockage recovery metadata', () => {
  test('clears stale route state after repeated vehicle blockage while preserving cruise speed', () => {
    let metadata = {
      moveTarget: { x: 0, y: 0, z: 40 },
      routeGoal: { x: 12, y: 0, z: 48 },
      routeIndex: 2,
      routePoints: [
        { x: 0, y: 0, z: 10 },
        { x: 0, y: 0, z: 20 },
      ],
      cruiseSpeed: 8,
      laneId: 'west-lane',
    }

    for (let i = 0; i < 12; i += 1) {
      metadata = resolveVehicleBlockedMetadata(metadata, true)
    }

    expect(metadata).toMatchObject({
      cruiseSpeed: 8,
      laneId: 'west-lane',
      forceRandomGoal: true,
    })
    expect(metadata?.moveTarget).toBeUndefined()
    expect(metadata?.routeGoal).toBeUndefined()
    expect(metadata?.routeIndex).toBeUndefined()
    expect(metadata?.routePoints).toBeUndefined()
    expect(metadata?.blockedTicks).toBeUndefined()
  })

  test('drops blockage counter once vehicle movement resumes', () => {
    const metadata = resolveVehicleBlockedMetadata(
      {
        moveTarget: { x: 0, y: 0, z: 24 },
        cruiseSpeed: 7.5,
        blockedTicks: 4,
      },
      false
    )

    expect(metadata).toEqual({
      moveTarget: { x: 0, y: 0, z: 24 },
      cruiseSpeed: 7.5,
    })
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

      expect(Math.abs(result.position.x)).toBeLessThan(0.1)
      expect(result.position.z).toBeGreaterThan(0)
      expect(result.heading === 0 || result.heading >= 350).toBe(true)
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
      expect(Math.abs(result.position.z)).toBeLessThan(0.2)
      expect(result.heading).toBeGreaterThanOrEqual(90)
    } finally {
      Math.random = originalRandom
    }
  })

  test('decelerates vehicle when approaching movement target', () => {
    const baseVehicle = {
      id: 'vehicle-arrive-1',
      type: 'vehicle',
      name: '到达测试车辆',
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: { moveTarget: { x: 0, y: 0, z: 10 } },
      createdAt: 0,
      updatedAt: 0,
      plateNumber: '沪A88888',
      vehicleType: 'car',
      speed: 10,
      heading: 0,
      capacity: 100,
      currentLoad: 0,
    }

    const originalRandom = Math.random
    Math.random = () => 0.5

    try {
      const far = simulateEntityMovement({
        ...baseVehicle,
        position: { x: 0, y: 0, z: 0 },
      })
      const near = simulateEntityMovement({
        ...baseVehicle,
        position: { x: 0, y: 0, z: 9.8 },
      })

      const farStep = far.position.z
      const nearStep = near.position.z - 9.8

      expect(farStep).toBeGreaterThan(nearStep)
      expect(nearStep).toBeGreaterThan(0)
      expect(near.position.z).toBeLessThanOrEqual(10)
    } finally {
      Math.random = originalRandom
    }
  })

  test('returns heading for vehicle movement aligned with updated yaw', () => {
    const vehicle = {
      id: 'vehicle-arrive-2',
      type: 'vehicle',
      name: '朝向测试车辆',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: { moveTarget: { x: 10, y: 0, z: 0 } },
      createdAt: 0,
      updatedAt: 0,
      plateNumber: '沪A88889',
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
      expect(typeof result.heading).toBe('number')
      expect(result.heading).toBeGreaterThan(0)
    } finally {
      Math.random = originalRandom
    }
  })

  test('uses cruise speed metadata instead of feeding back measured speed as next tick input', () => {
    const vehicle = {
      id: 'vehicle-cruise-1',
      type: 'vehicle',
      name: '巡检车-巡航',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: {
        cruiseSpeed: 8,
        moveTarget: { x: 0, y: 0, z: 50 },
      },
      createdAt: 0,
      updatedAt: 0,
      plateNumber: '沪A12347',
      vehicleType: 'car',
      speed: 0,
      heading: 0,
      capacity: 100,
      currentLoad: 0,
    }

    const first = simulateEntityMovement(vehicle)
    const second = simulateEntityMovement({
      ...vehicle,
      position: first.position,
      rotation: { x: 0, y: first.rotationY, z: 0 },
      speed: first.speed ?? 0,
      heading: first.heading ?? 0,
      metadata: first.metadata ?? vehicle.metadata,
    })

    expect(first.speed).toBeGreaterThan(7)
    expect(second.speed).toBeGreaterThan(7)
    expect((second.metadata ?? {}).cruiseSpeed).toBe(8)
  })

  test('does not rewrite metadata target on every tick when existing target is valid', () => {
    const vehicle = {
      id: 'vehicle-metadata-1',
      type: 'vehicle',
      name: '目标复用车辆',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: { moveTarget: { x: 0, y: 0, z: 12 }, cruiseSpeed: 10 },
      createdAt: 0,
      updatedAt: 0,
      plateNumber: '沪A77777',
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
      expect(result.metadata).toMatchObject({
        moveTarget: { x: 0, y: 0, z: 12 },
        cruiseSpeed: 10,
      })
    } finally {
      Math.random = originalRandom
    }
  })

  test('marks direct routes so later ticks skip route planning work until arrival', () => {
    const vehicle = {
      id: 'vehicle-direct-route-1',
      type: 'vehicle',
      name: '直达路线车辆',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: { routeLoop: [{ x: 0, y: 0, z: 20 }, { x: 0, y: 0, z: 40 }], routeLoopIndex: 0 },
      createdAt: 0,
      updatedAt: 0,
      plateNumber: '沪A77780',
      vehicleType: 'car',
      speed: 10,
      heading: 0,
      capacity: 100,
      currentLoad: 0,
    }

    const first = simulateEntityMovement(vehicle)
    const second = simulateEntityMovement({
      ...vehicle,
      position: first.position,
      rotation: { x: 0, y: first.rotationY, z: 0 },
      metadata: first.metadata ?? vehicle.metadata,
    })

    expect(first.metadata?.routeDirect).toBe(true)
    expect(second.metadata?.routeDirect).toBe(true)
    expect(second.metadata?.routePoints).toBeUndefined()
    expect(second.position.z).toBeGreaterThan(first.position.z)
  })

  test('writes metadata target when none exists', () => {
    const vehicle = {
      id: 'vehicle-metadata-2',
      type: 'vehicle',
      name: '目标初始化车辆',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: {},
      createdAt: 0,
      updatedAt: 0,
      plateNumber: '沪A77778',
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
      expect(result.metadata).toBeDefined()
      expect(result.metadata?.moveTarget).toBeDefined()
    } finally {
      Math.random = originalRandom
    }
  })

  test('picks a new cruise goal after reaching the end of a planned vehicle route', () => {
    const vehicle = {
      id: 'vehicle-route-complete-1',
      type: 'vehicle',
      name: '终点续航车辆',
      position: { x: -67.98, y: 0, z: 71.98 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: {
        moveTarget: { x: -68, y: 0, z: 72 },
        routeGoal: { x: -68, y: 0, z: 72 },
        routeIndex: 1,
        routePoints: [
          { x: -68, y: 0, z: 60 },
          { x: -68, y: 0, z: 72 },
        ],
        cruiseSpeed: 8,
      },
      createdAt: 0,
      updatedAt: 0,
      plateNumber: '沪A77779',
      vehicleType: 'car',
      speed: 0,
      heading: 0,
      capacity: 100,
      currentLoad: 0,
    }

    const result = simulateEntityMovement(vehicle)

    expect(result.speed).toBeGreaterThan(0.05)
    expect(result.metadata?.routeGoal).not.toEqual({ x: -68, y: 0, z: 72 })
    expect(result.metadata?.moveTarget).not.toEqual({ x: -68, y: 0, z: 72 })
  })

  test('reroutes vehicle targets that would clip through plant structures', () => {
    const vehicle = {
      id: 'vehicle-route-1',
      type: 'vehicle',
      name: '路径规划车辆',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: { moveTarget: { x: 56, y: 0, z: -66 } },
      createdAt: 0,
      updatedAt: 0,
      plateNumber: '沪A77779',
      vehicleType: 'car',
      speed: 10,
      heading: 0,
      capacity: 100,
      currentLoad: 0,
    }

    const result = simulateEntityMovement(vehicle)
    const nextTarget = result.metadata?.moveTarget

    expect(result.metadata).toBeDefined()
    expect(Array.isArray(result.metadata?.routePoints)).toBe(true)
    expect(nextTarget).toBeDefined()
    expect(isPointOnPlantMobilityLane('vehicle', nextTarget)).toBe(true)
  })

  test('reroutes person targets that would clip through process structures', () => {
    const person = {
      id: 'person-route-1',
      type: 'person',
      name: '路径规划人员',
      position: { x: -18, y: 0, z: 23 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: { moveTarget: { x: -18, y: 0, z: -12 } },
      createdAt: 0,
      updatedAt: 0,
      role: '外操',
      department: '生产运行部',
      schedule: [],
    }

    const result = simulateEntityMovement(person)
    const nextTarget = result.metadata?.moveTarget

    expect(result.metadata).toBeDefined()
    expect(Array.isArray(result.metadata?.routePoints)).toBe(true)
    expect(nextTarget).toBeDefined()
    expect(isPointOnPlantMobilityLane('person', nextTarget)).toBe(true)
  })

  test('uses cruise speed metadata instead of collapsing speed after startup', () => {
    const vehicle = {
      id: 'vehicle-cruise-1',
      type: 'vehicle',
      name: '巡航测试车辆',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: {
        moveTarget: { x: 0, y: 0, z: 80 },
        cruiseSpeed: 8,
      },
      createdAt: 0,
      updatedAt: 0,
      plateNumber: '沪A66666',
      vehicleType: 'car',
      speed: 0,
      heading: 0,
      capacity: 100,
      currentLoad: 0,
    }

    const result = simulateEntityMovement(vehicle)

    expect(result.speed).toBeGreaterThan(5)
    expect(result.metadata?.cruiseSpeed).toBe(8)
  })
})
