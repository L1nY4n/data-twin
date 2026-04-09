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

  test('default scene metadata and camera presets stay aligned with the generic runtime shell', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    const state = useDigitalTwinStore.getState()
    expect(state.sceneConfig.name).toBe('数字孪生运行时场景')
    expect(state.sceneConfig.gridSize).toBeGreaterThanOrEqual(200)
    expect(state.activeCameraPreset).toBe('iso')
    expect(state.rendererMode).toBe('webgpu')
    expect(state.cameraPresets.some((preset) => preset.name.includes('园区总览'))).toBe(true)
    expect(state.cameraPresets.some((preset) => preset.name.includes('俯视'))).toBe(true)
    expect(state.cameraPresets.some((preset) => preset.name.includes('西区'))).toBe(true)
    expect(state.cameraPresets.some((preset) => preset.name.includes('东区'))).toBe(true)
    expect(state.cameraPresets.some((preset) => preset.name.includes('南区'))).toBe(true)
    expect(state.cameraPresets.some((preset) => preset.name.includes('北区'))).toBe(true)
  })

  test('focusing an entity selects it and emits a camera focus request', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    const person = generatePerson({
      name: '聚焦对象',
      position: { x: 24, y: 0, z: -12 },
      rotation: { x: 0, y: 0, z: 0 },
    })
    store.addEntity(person)
    store.advanceRuntime(1, 16, { x: 120, y: 72, z: 96 }, 0)

    store.focusCameraOnEntity(person.id)

    const state = useDigitalTwinStore.getState()
    expect(state.selectedEntityId).toBe(person.id)
    expect(state.activeCameraPreset).toBeNull()
    expect(state.cameraFocusRequest).not.toBeNull()

    const focusRequest = state.cameraFocusRequest
    expect(focusRequest?.target.x).toBe(24)
    expect(focusRequest?.target.z).toBe(-12)
    expect(focusRequest?.target.y).toBeGreaterThan(1)
    expect(focusRequest?.position.y).toBeGreaterThan(focusRequest?.target.y ?? 0)
    expect(
      Math.hypot(
        (focusRequest?.position.x ?? 0) - (focusRequest?.target.x ?? 0),
        (focusRequest?.position.z ?? 0) - (focusRequest?.target.z ?? 0)
      )
    ).toBeGreaterThan(15)
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

  test('entity projection keeps sensor and camera fields intact', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()
    const now = Date.now()

    const sensor = {
      id: 'sensor-1',
      type: 'sensor',
      name: '温度变送器 T-101',
      position: { x: 5, y: 1.8, z: -3 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 0.8, y: 0.8, z: 0.8 },
      status: 'warning',
      visible: true,
      metadata: {},
      createdAt: now - 3000,
      updatedAt: now - 1000,
      sensorType: 'temperature',
      unit: '°C',
      reading: 83.5,
      thresholdMin: 10,
      thresholdMax: 80,
    }
    const camera = {
      id: 'camera-1',
      type: 'camera',
      name: '装置区云台 CAM-01',
      position: { x: -6, y: 4, z: 8 },
      rotation: { x: 0, y: Math.PI / 3, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: {},
      createdAt: now - 5000,
      updatedAt: now - 2000,
      cameraType: 'ptz',
      streamUrl: 'rtsp://example.local/live',
      fov: 90,
      heading: 60,
      range: 35,
      recording: true,
    }

    store.addEntities([sensor, camera])

    const projectedSensor = useDigitalTwinStore.getState().getEntityById(sensor.id)
    const projectedCamera = useDigitalTwinStore.getState().getEntityById(camera.id)
    const buckets = useDigitalTwinStore.getState().entityBuckets

    expect(projectedSensor?.type).toBe('sensor')
    if (projectedSensor?.type === 'sensor') {
      expect(projectedSensor.reading).toBe(83.5)
      expect(projectedSensor.unit).toBe('°C')
      expect(projectedSensor.thresholdMax).toBe(80)
    }

    expect(projectedCamera?.type).toBe('camera')
    if (projectedCamera?.type === 'camera') {
      expect(projectedCamera.cameraType).toBe('ptz')
      expect(projectedCamera.streamUrl).toContain('rtsp://')
      expect(projectedCamera.range).toBe(35)
      expect(projectedCamera.recording).toBe(true)
    }

    expect(buckets.sensors).toHaveLength(1)
    expect(buckets.cameras).toHaveLength(1)
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

  test('camera preset focus keeps orbit mode available for continued free navigation', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    store.setViewMode('orbit')
    store.setActiveCameraPreset('top')

    const state = useDigitalTwinStore.getState()
    expect(state.activeCameraPreset).toBe('top')
    expect(state.viewMode).toBe('orbit')
  })

  test('entity clear paths also clear static feature selection and hover state', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    const staticFeatureId = useDigitalTwinStore.getState().staticFeatureRegistry.entries[0]?.feature.id
    if (!staticFeatureId) throw new Error('static feature missing')

    store.setSelectedStaticFeature(staticFeatureId)
    store.setHoveredStaticFeature(staticFeatureId)

    expect(useDigitalTwinStore.getState().selectedStaticFeatureId).toBe(staticFeatureId)
    expect(useDigitalTwinStore.getState().hoveredStaticFeatureId).toBe(staticFeatureId)

    store.setSelectedEntity(null)
    store.setHoveredEntity(null)

    expect(useDigitalTwinStore.getState().selectedStaticFeatureId).toBeNull()
    expect(useDigitalTwinStore.getState().hoveredStaticFeatureId).toBeNull()
  })

  test('incident actions keep active incident and video popup state in sync', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    const incident = {
      id: 'incident-1',
      kind: 'near_miss',
      severity: 'warning',
      title: '人车接近预警',
      summary: '测试事件摘要',
      message: '测试事件消息',
      primaryEntityId: 'person-1',
      entityIds: ['person-1', 'vehicle-1'],
      citations: [{ id: 'citation-1', label: '最短间距', value: '2.4 m' }],
      acknowledged: false,
      timestamp: Date.now(),
      videoFeed: {
        id: 'feed-1',
        cameraName: 'CAM-01',
        title: '联动视频',
        status: 'live',
        sceneLabel: '装置区',
        badge: 'LIVE',
        streamUrl: 'mock://feed-1',
      },
    }

    store.upsertIncident(incident)
    store.setActiveIncident(incident.id)
    store.openIncidentVideo(incident.videoFeed, incident.id)

    let state = useDigitalTwinStore.getState()
    expect(state.activeIncidentId).toBe(incident.id)
    expect(state.isIncidentVideoOpen).toBe(true)
    expect(state.incidentVideoFeed?.cameraName).toBe('CAM-01')

    store.acknowledgeIncident(incident.id)
    store.closeIncidentVideo()

    state = useDigitalTwinStore.getState()
    expect(state.incidents[0]?.acknowledged).toBe(true)
    expect(state.isIncidentVideoOpen).toBe(false)
    expect(state.incidentVideoFeed).toBeNull()
  })

  test('pruning incidents removes expired history and clears stale active state', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    const now = Date.now()
    const freshIncident = {
      id: 'incident-fresh',
      kind: 'near_miss',
      severity: 'warning',
      title: '新事件',
      summary: 'fresh',
      message: 'fresh',
      primaryEntityId: 'person-1',
      entityIds: ['person-1'],
      citations: [],
      acknowledged: false,
      timestamp: now,
      videoFeed: null,
    }
    const staleIncident = {
      ...freshIncident,
      id: 'incident-stale',
      timestamp: now - 6 * 60 * 1000,
    }

    store.upsertIncident(staleIncident)
    store.upsertIncident(freshIncident)
    store.setActiveIncident(staleIncident.id)

    store.pruneIncidents(now)

    const state = useDigitalTwinStore.getState()
    expect(state.incidents.some((incident) => incident.id === staleIncident.id)).toBe(false)
    expect(state.incidents.some((incident) => incident.id === freshIncident.id)).toBe(true)
    expect(state.activeIncidentId).toBe(freshIncident.id)
  })
})
