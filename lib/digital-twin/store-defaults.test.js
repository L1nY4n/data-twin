import { describe, expect, test } from 'bun:test'
import { useDigitalTwinStore } from './store'
import { generatePerson, generateVehicle, generateZone } from './mock-data'

describe('digital twin store defaults', () => {
  test('hides axes by default after reset', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    expect(useDigitalTwinStore.getState().sceneConfig.showAxes).toBe(false)
  })

  test('auto quality defaults to off to prevent silent visual degradation', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    expect(useDigitalTwinStore.getState().autoQuality).toBe(false)
  })

  test('manual quality switch keeps auto quality disabled', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    store.setQualityProfile('performance')
    expect(useDigitalTwinStore.getState().autoQuality).toBe(false)
  })

  test('default camera presets stay aligned with chemical plant viewpoints', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    const state = useDigitalTwinStore.getState()
    expect(state.sceneConfig.name).toContain('化工')
    expect(state.sceneConfig.gridSize).toBeGreaterThanOrEqual(200)
    expect(state.activeCameraPreset).toBe('iso')
    expect(state.cameraPresets.some((preset) => preset.name.includes('园区总览'))).toBe(true)
    expect(state.cameraPresets.some((preset) => preset.name.includes('俯视'))).toBe(true)
    expect(state.cameraPresets.some((preset) => preset.name.includes('西区'))).toBe(true)
    expect(state.cameraPresets.some((preset) => preset.name.includes('东区'))).toBe(true)
    expect(state.cameraPresets.some((preset) => preset.name.includes('南区'))).toBe(true)
    expect(state.cameraPresets.some((preset) => preset.name.includes('北区'))).toBe(true)
  })

  test('removing an entity clears hovered state when it points to that entity', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    const person = generatePerson()
    store.addEntity(person)
    store.setHoveredEntity(person.id)
    expect(useDigitalTwinStore.getState().hoveredEntityId).toBe(person.id)

    store.removeEntity(person.id)
    expect(useDigitalTwinStore.getState().hoveredEntityId).toBeNull()
  })

  test('entity projection keeps extended vehicle and zone fields intact', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()
    const now = Date.now()

    const vehicle = generateVehicle({
      name: '字段验证车辆',
      capacity: 3000,
      currentLoad: 900,
      createdAt: now - 1000,
      updatedAt: now - 500,
    })
    const zone = generateZone(
      { x: 0, y: 0, z: 0 },
      { width: 10, depth: 10 },
      {
        name: '字段验证区域',
        zoneType: 'restricted',
        color: '#ef4444',
        accessRules: [
          {
            id: 'rule-1',
            allowedRoles: ['admin'],
            allowedDepartments: ['ops'],
            timeRanges: [{ start: now, end: now + 10000 }],
            action: 'deny',
          },
        ],
        capacity: 50,
        currentOccupancy: 12,
      }
    )

    store.addEntities([vehicle, zone])

    const projectedVehicle = useDigitalTwinStore.getState().getEntityById(vehicle.id)
    const projectedZone = useDigitalTwinStore.getState().getEntityById(zone.id)

    expect(projectedVehicle?.type).toBe('vehicle')
    if (projectedVehicle?.type === 'vehicle') {
      expect(projectedVehicle.capacity).toBe(3000)
      expect(projectedVehicle.currentLoad).toBe(900)
      expect(projectedVehicle.createdAt).toBe(now - 1000)
      expect(projectedVehicle.updatedAt).toBe(now - 500)
    }

    expect(projectedZone?.type).toBe('zone')
    if (projectedZone?.type === 'zone') {
      expect(projectedZone.color).toBe('#ef4444')
      expect(projectedZone.accessRules.length).toBe(1)
      expect(projectedZone.capacity).toBe(50)
      expect(projectedZone.currentOccupancy).toBe(12)
    }
  })

  test('selecting sprite-mode vehicle forces fresh projection for detail data', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    const vehicle = generateVehicle({
      speed: 2,
      heading: 15,
    })
    store.addEntity(vehicle)

    const snapshot = useDigitalTwinStore.getState().getEcsSnapshotById(vehicle.id)
    if (!snapshot) throw new Error('snapshot missing')
    snapshot.labelMode = 'sprite'

    // 先同步一次 labelMode=sprite 的投影，再制造一次仅速度/航向更新的“可复用”场景。
    store.updateEntity(vehicle.id, {})
    store.updateEntity(vehicle.id, { speed: 9, heading: 180 })
    const beforeSelect = useDigitalTwinStore.getState().getEntityById(vehicle.id)
    expect(beforeSelect?.type).toBe('vehicle')
    if (beforeSelect?.type === 'vehicle') {
      expect(beforeSelect.speed).toBe(2)
      expect(beforeSelect.heading).toBe(15)
    }

    store.setSelectedEntity(vehicle.id)
    const afterSelect = useDigitalTwinStore.getState().getEntityById(vehicle.id)
    expect(afterSelect?.type).toBe('vehicle')
    if (afterSelect?.type === 'vehicle') {
      expect(afterSelect.speed).toBe(9)
      expect(afterSelect.heading).toBe(180)
    }
  })

  test('hover transitions immediately downgrade the previous html label when focus moves away', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    const hoverA = generatePerson({
      name: '悬停对象A',
      position: { x: 20, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    })
    const hoverB = generatePerson({
      name: '悬停对象B',
      position: { x: 21, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    })

    store.addEntities([hoverA, hoverB])
    store.advanceRuntime(1, 16, { x: 0, y: 0, z: 0 }, 0)

    store.setHoveredEntity(hoverA.id)
    let projectedA = useDigitalTwinStore.getState().getEntityById(hoverA.id)
    let projectedB = useDigitalTwinStore.getState().getEntityById(hoverB.id)
    expect(projectedA?.labelMode).toBe('html')
    expect(projectedB?.labelMode).toBe('sprite')

    store.setHoveredEntity(hoverB.id)
    projectedA = useDigitalTwinStore.getState().getEntityById(hoverA.id)
    projectedB = useDigitalTwinStore.getState().getEntityById(hoverB.id)
    expect(projectedA?.labelMode).toBe('sprite')
    expect(projectedB?.labelMode).toBe('html')

    store.setHoveredEntity(null)
    projectedB = useDigitalTwinStore.getState().getEntityById(hoverB.id)
    expect(projectedB?.labelMode).toBe('sprite')
  })

  test('hovering one person keeps unrelated vehicle buckets stable', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    const person = generatePerson({
      position: { x: 20, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    })
    const vehicle = generateVehicle({
      position: { x: 80, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    })

    store.addEntities([person, vehicle])

    const personSnapshot = useDigitalTwinStore.getState().getEcsSnapshotById(person.id)
    const vehicleSnapshot = useDigitalTwinStore.getState().getEcsSnapshotById(vehicle.id)
    if (!personSnapshot || !vehicleSnapshot) throw new Error('snapshot missing')
    personSnapshot.labelMode = 'sprite'
    vehicleSnapshot.labelMode = 'hidden'
    store.updateEntity(person.id, {})

    const beforeBuckets = useDigitalTwinStore.getState().entityBuckets
    store.setHoveredEntity(person.id)
    const afterBuckets = useDigitalTwinStore.getState().entityBuckets

    expect(afterBuckets.persons).not.toBe(beforeBuckets.persons)
    expect(afterBuckets.vehicles).toBe(beforeBuckets.vehicles)
    expect(afterBuckets.equipment).toBe(beforeBuckets.equipment)
    expect(afterBuckets.zones).toBe(beforeBuckets.zones)
  })

  test('buffered commands keep selected/hovered ids synced with ECS normalization', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    const person = generatePerson()
    store.addEntity(person)

    store.enqueueCommands([
      { type: 'select', payload: { id: person.id } },
      { type: 'hover', payload: { id: person.id } },
    ])
    store.flushCommands()
    expect(useDigitalTwinStore.getState().selectedEntityId).toBe(person.id)
    expect(useDigitalTwinStore.getState().hoveredEntityId).toBe(person.id)

    store.enqueueCommands([{ type: 'remove', payload: { id: person.id } }])
    store.flushCommands()
    expect(useDigitalTwinStore.getState().selectedEntityId).toBeNull()
    expect(useDigitalTwinStore.getState().hoveredEntityId).toBeNull()

    store.enqueueCommands([
      { type: 'select', payload: { id: 'missing-id' } },
      { type: 'hover', payload: { id: 'missing-id' } },
    ])
    store.flushCommands()
    expect(useDigitalTwinStore.getState().selectedEntityId).toBeNull()
    expect(useDigitalTwinStore.getState().hoveredEntityId).toBeNull()
  })

  test('movement-only updates keep entity directory reference stable', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    const vehicle = generateVehicle({
      speed: 3,
      heading: 45,
    })
    store.addEntity(vehicle)

    const beforeDirectory = useDigitalTwinStore.getState().entityDirectory
    const beforeEntry = beforeDirectory.get(vehicle.id)

    store.updateEntity(vehicle.id, {
      position: { x: vehicle.position.x + 1, y: vehicle.position.y, z: vehicle.position.z + 2 },
      rotation: { x: 0, y: 0.5, z: 0 },
      speed: 8,
      heading: 180,
    })

    const afterDirectory = useDigitalTwinStore.getState().entityDirectory
    const afterEntry = afterDirectory.get(vehicle.id)

    expect(afterDirectory).toBe(beforeDirectory)
    expect(afterEntry).toBe(beforeEntry)
  })

  test('default camera preset ordering stays stable for toolbar selection', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    const { cameraPresets } = useDigitalTwinStore.getState()

    expect(cameraPresets.map((preset) => preset.name)).toEqual([
      '园区总览',
      '全域俯视',
      '西区工艺',
      '东区罐区',
      '南区装卸',
      '北区公用工程',
    ])
  })
})
