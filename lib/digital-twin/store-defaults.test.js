import { describe, expect, test } from 'bun:test'
import { useDigitalTwinStore } from './store'
import { generatePerson, generateVehicle, generateZone } from './mock-data'
import { CAMPUS_CAMERA_PRESETS } from './campus-layout'
import { selectQuickCameraPresets } from './camera-presets'

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

  test('hmi overlay visibility can be toggled without disturbing panel state', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    const initialVisible = useDigitalTwinStore.getState().hmiOverlayVisible
    store.toggleHmiOverlayVisible()

    let state = useDigitalTwinStore.getState()
    expect(state.hmiOverlayVisible).toBe(!initialVisible)
    expect(state.leftPanelOpen).toBe(false)
    expect(state.rightPanelOpen).toBe(false)
    expect(state.bottomPanelOpen).toBe(false)

    store.setHmiOverlayVisible(initialVisible)
    state = useDigitalTwinStore.getState()
    expect(state.hmiOverlayVisible).toBe(initialVisible)
  })

  test('default scene metadata and camera presets stay aligned with the generic runtime shell', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    const state = useDigitalTwinStore.getState()
    expect(state.sceneConfig.name).toBe('数字孪生运行时场景')
    expect(state.sceneConfig.gridSize).toBeGreaterThanOrEqual(200)
    expect(state.activeCameraPreset).toBe('iso')
    expect(state.rendererMode).toBe('auto')
    expect(state.cameraPresets.some((preset) => preset.name.includes('园区总览'))).toBe(true)
    expect(state.cameraPresets.some((preset) => preset.name.includes('俯视'))).toBe(true)
    expect(state.cameraPresets.some((preset) => preset.name.includes('西区'))).toBe(true)
    expect(state.cameraPresets.some((preset) => preset.name.includes('东区'))).toBe(true)
    expect(state.cameraPresets.some((preset) => preset.name.includes('南区'))).toBe(true)
    expect(state.cameraPresets.some((preset) => preset.name.includes('北区'))).toBe(true)
    expect(selectQuickCameraPresets(state.cameraPresets).map((preset) => preset.id)).toEqual([
      'iso',
      'top',
      'process',
    ])
  })

  test('quick camera presets are selected from scene configuration metadata with legacy fallback', () => {
    expect(
      selectQuickCameraPresets([
        {
          id: 'wide',
          name: 'Wide',
          position: { x: 1, y: 2, z: 3 },
          target: { x: 0, y: 0, z: 0 },
          fov: 50,
        },
        {
          id: 'detail',
          name: 'Detail',
          position: { x: 4, y: 5, z: 6 },
          target: { x: 0, y: 0, z: 0 },
          fov: 45,
        },
      ]).map((preset) => preset.id)
    ).toEqual(['wide', 'detail'])

    expect(
      selectQuickCameraPresets([
        {
          id: 'menu-only',
          name: 'Menu only',
          position: { x: 1, y: 2, z: 3 },
          target: { x: 0, y: 0, z: 0 },
          fov: 50,
        },
        {
          id: 'second',
          name: 'Second',
          position: { x: 4, y: 5, z: 6 },
          target: { x: 0, y: 0, z: 0 },
          fov: 45,
          quickAccess: true,
          quickAccessOrder: 20,
        },
        {
          id: 'first',
          name: 'First',
          position: { x: 7, y: 8, z: 9 },
          target: { x: 0, y: 0, z: 0 },
          fov: 45,
          quickAccess: true,
          quickAccessOrder: 10,
        },
      ]).map((preset) => preset.id)
    ).toEqual(['first', 'second'])
  })

  test('scene config camera presets update the runtime camera actions', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    store.setSceneConfig({
      cameraPresets: [
        {
          id: 'workspace-lobby',
          name: 'Workspace Lobby',
          position: { x: 10, y: 12, z: 14 },
          target: { x: 0, y: 0, z: 0 },
          fov: 48,
          quickAccess: true,
        },
      ],
    })

    const state = useDigitalTwinStore.getState()

    expect(state.cameraPresets.map((preset) => preset.id)).toEqual(['workspace-lobby'])
    expect(state.activeCameraPreset).toBe('workspace-lobby')
    expect(state.sceneConfig.cameraPresets?.map((preset) => preset.id)).toEqual([
      'workspace-lobby',
    ])
  })

  test('default campus camera presets keep the camera above the target and preserve top-view clearance', () => {
    for (const preset of CAMPUS_CAMERA_PRESETS) {
      expect(preset.position.y).toBeGreaterThan(preset.target.y)
    }

    const topPreset = CAMPUS_CAMERA_PRESETS.find((preset) => preset.id === 'top')
    expect(topPreset).toBeDefined()
    expect(topPreset?.position.y).toBeGreaterThan(topPreset?.target.y ?? 0)
    expect(Math.hypot(
      (topPreset?.position.x ?? 0) - (topPreset?.target.x ?? 0),
      (topPreset?.position.z ?? 0) - (topPreset?.target.z ?? 0)
    )).toBe(0)
  })

  test('runtime store stabilizes top presets so orbit controls do not collapse into a singular top-down pose', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    const topPreset = useDigitalTwinStore.getState().cameraPresets.find((preset) => preset.id === 'top')

    expect(topPreset).toBeDefined()
    expect(topPreset?.position.y).toBeGreaterThan(topPreset?.target.y ?? 0)
    expect(Math.hypot(
      (topPreset?.position.x ?? 0) - (topPreset?.target.x ?? 0),
      (topPreset?.position.z ?? 0) - (topPreset?.target.z ?? 0)
    )).toBeGreaterThan(0)
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

  test('focusing a published static feature selects it and emits a camera focus request', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    const feature = useDigitalTwinStore.getState().staticFeatureRegistry.entries[0]
    expect(feature).toBeDefined()

    store.advanceRuntime(1, 16, { x: 120, y: 72, z: 96 }, 0)
    store.focusCameraOnStaticFeature(feature.feature.id)

    const state = useDigitalTwinStore.getState()
    expect(state.selectedEntityId).toBeNull()
    expect(state.selectedStaticFeatureId).toBe(feature.feature.id)
    expect(state.activeCameraPreset).toBeNull()
    expect(state.cameraFocusRequest).not.toBeNull()
    expect(state.cameraFocusRequest?.target.x).toBe(feature.feature.center.x)
    expect(state.cameraFocusRequest?.target.z).toBe(feature.feature.center.z)
    expect(state.cameraFocusRequest?.position.y).toBeGreaterThan(
      state.cameraFocusRequest?.target.y ?? 0
    )
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

  test('entity projection keeps dynamic archetype-backed fields intact', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()
    const now = Date.now()

    store.setEntityRegistry({
      categories: [
        {
          id: 'category-robotics',
          key: 'robotics',
          displayName: '机器人',
          sortOrder: 1,
          createdAt: now - 5000,
          updatedAt: now - 5000,
        },
      ],
      archetypes: [
        {
          id: 'archetype-inspection-robot-v1',
          key: 'inspection-robot',
          categoryId: 'category-robotics',
          categoryKey: 'robotics',
          displayName: '巡检机器人',
          capabilities: {
            hasModel: false,
            movable: true,
            bindable: true,
            statusBearing: true,
            detailFieldsVisible: true,
          },
          metadata: {},
          createdAt: now - 5000,
          updatedAt: now - 5000,
        },
      ],
    })

    const dynamicEntity = {
      id: 'dynamic-robot-01',
      type: 'dynamic',
      name: '巡检机器人 01',
      position: { x: 12, y: 0, z: -6 },
      rotation: { x: 0, y: Math.PI / 4, z: 0 },
      scale: { x: 1.1, y: 1.1, z: 1.1 },
      status: 'active',
      visible: true,
      metadata: {},
      createdAt: now - 2000,
      updatedAt: now - 500,
      archetypeId: 'archetype-inspection-robot-v1',
      categoryKey: 'robotics',
      attributes: {
        battery: 74,
      },
      displayAttributes: {
        battery: 74,
        mode: '巡检中',
      },
    }

    store.addEntity(dynamicEntity)

    const projected = useDigitalTwinStore.getState().getEntityById(dynamicEntity.id)
    const buckets = useDigitalTwinStore.getState().entityBuckets
    const directoryEntry = useDigitalTwinStore.getState().entityDirectory.get(dynamicEntity.id)

    expect(projected?.type).toBe('dynamic')
    if (projected?.type === 'dynamic') {
      expect(projected.archetypeId).toBe('archetype-inspection-robot-v1')
      expect(projected.categoryKey).toBe('robotics')
      expect(projected.displayAttributes.mode).toBe('巡检中')
    }

    expect(buckets.dynamic).toHaveLength(1)
    expect(directoryEntry?.categoryKey).toBe('robotics')
    expect(directoryEntry?.categoryLabel).toBe('机器人')
    expect(directoryEntry?.categorySortOrder).toBe(1)
    expect(directoryEntry?.archetypeLabel).toBe('巡检机器人')
    expect(directoryEntry?.secondaryLabel).toBe('机器人 · 巡检机器人')
  })

  test('setEntityRegistry derives entity schema lookups from categories and archetypes', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    store.setEntityRegistry({
      categories: [
        {
          id: 'category-robotics',
          key: 'robotics',
          displayName: '机器人',
          sortOrder: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      archetypes: [
        {
          id: 'archetype-inspection-robot-v1',
          key: 'inspection-robot',
          categoryId: 'category-robotics',
          categoryKey: 'robotics',
          displayName: '巡检机器人',
          capabilities: {
            hasModel: false,
            movable: true,
            bindable: true,
            statusBearing: true,
            detailFieldsVisible: true,
          },
          metadata: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })

    const dynamicEntity = {
      id: 'dynamic-robot-1',
      type: 'dynamic',
      name: '巡检机器人 01',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: {},
      createdAt: 1,
      updatedAt: 1,
      archetypeId: 'archetype-inspection-robot-v1',
      categoryKey: 'robotics',
      attributes: {},
      displayAttributes: {},
    }
    const presentation = useDigitalTwinStore
      .getState()
      .getDynamicEntityPresentation(dynamicEntity)

    expect(presentation.schema?.displayName).toBe('巡检机器人')
    expect(presentation.schema?.category?.displayName).toBe('机器人')
    expect(presentation.schema?.archetype.capabilities.movable).toBe(true)
    expect(presentation.categoryLabel).toBe('机器人')
    expect(presentation.archetypeLabel).toBe('巡检机器人')
    expect(presentation.movable).toBe(true)
    expect(presentation.modelAsset).toBeUndefined()
  })

  test('setEntityRegistry refreshes existing dynamic directory metadata after late registry hydration', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()
    const now = Date.now()

    const dynamicEntity = {
      id: 'dynamic-robot-late-registry',
      type: 'dynamic',
      name: '晚绑定巡检机器人',
      position: { x: 4, y: 0, z: 8 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: {},
      createdAt: now - 2000,
      updatedAt: now - 1000,
      archetypeId: 'archetype-inspection-robot-v2',
      categoryKey: 'robotics',
      attributes: {},
      displayAttributes: {},
    }

    store.addEntity(dynamicEntity)

    const beforeRegistry = useDigitalTwinStore.getState().entityDirectory.get(dynamicEntity.id)
    expect(beforeRegistry?.categoryKey).toBe('robotics')
    expect(beforeRegistry?.categoryLabel).toBe('robotics')
    expect(beforeRegistry?.categorySortOrder).toBe(0)

    store.setEntityRegistry({
      categories: [
        {
          id: 'category-robotics',
          key: 'robotics',
          displayName: '机器人',
          color: '#38bdf8',
          sortOrder: 7,
          createdAt: now - 5000,
          updatedAt: now - 5000,
        },
      ],
      archetypes: [
        {
          id: 'archetype-inspection-robot-v2',
          key: 'inspection-robot-v2',
          categoryId: 'category-robotics',
          categoryKey: 'robotics',
          displayName: '巡检机器人 V2',
          capabilities: {
            hasModel: false,
            movable: true,
            bindable: true,
            statusBearing: true,
            detailFieldsVisible: true,
          },
          metadata: {},
          createdAt: now - 5000,
          updatedAt: now - 5000,
        },
      ],
    })

    const afterRegistry = useDigitalTwinStore.getState().entityDirectory.get(dynamicEntity.id)
    expect(afterRegistry?.categoryLabel).toBe('机器人')
    expect(afterRegistry?.categoryColor).toBe('#38bdf8')
    expect(afterRegistry?.categorySortOrder).toBe(7)
    expect(afterRegistry?.archetypeLabel).toBe('巡检机器人 V2')
    expect(afterRegistry?.secondaryLabel).toBe('机器人 · 巡检机器人 V2')
  })

  test('runtime publish preserves dynamic directory presentation metadata', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()
    const now = Date.now()

    store.setEntityRegistry({
      categories: [
        {
          id: 'category-robotics',
          key: 'robotics',
          displayName: '机器人',
          color: '#38bdf8',
          sortOrder: 7,
          createdAt: now - 5000,
          updatedAt: now - 5000,
        },
      ],
      archetypes: [
        {
          id: 'archetype-inspection-robot-runtime',
          key: 'inspection-robot-runtime',
          categoryId: 'category-robotics',
          categoryKey: 'robotics',
          displayName: '运行时巡检机器人',
          capabilities: {
            hasModel: false,
            movable: true,
            bindable: true,
            statusBearing: true,
            detailFieldsVisible: true,
          },
          metadata: {},
          createdAt: now - 5000,
          updatedAt: now - 5000,
        },
      ],
    })

    const dynamicEntity = {
      id: 'dynamic-robot-runtime-publish',
      type: 'dynamic',
      name: '运行时巡检机器人',
      position: { x: 5, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: {},
      createdAt: now - 2000,
      updatedAt: now - 1000,
      archetypeId: 'archetype-inspection-robot-runtime',
      categoryKey: 'robotics',
      attributes: {},
      displayAttributes: {},
    }
    const movingPerson = generatePerson({
      id: 'runtime-publish-trigger-person',
      position: { x: 18, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    })

    store.addEntities([dynamicEntity, movingPerson])
    store.advanceRuntime(1, 16, { x: 0, y: 0, z: 0 }, 0)
    store.advanceRuntime(101, 16, { x: 0, y: 0, z: 0 }, 0)

    const directoryEntry = useDigitalTwinStore
      .getState()
      .entityDirectory.get(dynamicEntity.id)

    expect(directoryEntry?.categoryLabel).toBe('机器人')
    expect(directoryEntry?.categoryColor).toBe('#38bdf8')
    expect(directoryEntry?.categorySortOrder).toBe(7)
    expect(directoryEntry?.archetypeLabel).toBe('运行时巡检机器人')
    expect(directoryEntry?.secondaryLabel).toBe('机器人 · 运行时巡检机器人')
  })

  test('sprite-mode vehicles still project fresh runtime kinematics immediately', () => {
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

    // 先同步一次 labelMode=sprite 的投影，再确认后续运行态更新不会被错误复用吞掉。
    store.updateEntity(vehicle.id, {})
    store.updateEntity(vehicle.id, {
      position: { x: 4, y: 0, z: -3 },
      rotation: { x: 0, y: Math.PI, z: 0 },
      speed: 9,
      heading: 180,
    })
    const beforeSelect = useDigitalTwinStore.getState().getEntityById(vehicle.id)
    expect(beforeSelect?.type).toBe('vehicle')
    if (beforeSelect?.type === 'vehicle') {
      expect(beforeSelect.position).toEqual({ x: 4, y: 0, z: -3 })
      expect(beforeSelect.rotation.y).toBe(Math.PI)
      expect(beforeSelect.speed).toBe(9)
      expect(beforeSelect.heading).toBe(180)
    }

    store.setSelectedEntity(vehicle.id)
    const afterSelect = useDigitalTwinStore.getState().getEntityById(vehicle.id)
    expect(afterSelect?.type).toBe('vehicle')
    if (afterSelect?.type === 'vehicle') {
      expect(afterSelect.position).toEqual({ x: 4, y: 0, z: -3 })
      expect(afterSelect.rotation.y).toBe(Math.PI)
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
      '铁路与发运',
      '北部能源环保园',
      '东南研发仓储园',
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

  test('camera focus requests can be cleared without disturbing the current view mode', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    const person = generatePerson({
      name: '清理焦点请求对象',
      position: { x: 8, y: 0, z: -4 },
      rotation: { x: 0, y: 0, z: 0 },
    })
    store.addEntity(person)
    store.focusCameraOnEntity(person.id)

    expect(useDigitalTwinStore.getState().cameraFocusRequest).not.toBeNull()
    expect(useDigitalTwinStore.getState().viewMode).toBe('orbit')

    store.clearCameraFocusRequest()

    expect(useDigitalTwinStore.getState().cameraFocusRequest).toBeNull()
    expect(useDigitalTwinStore.getState().viewMode).toBe('orbit')
  })

  test('tracked camera modes require a selected trackable entity and clear stale camera state', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    store.setActiveCameraPreset('top')
    store.setViewMode('follow')

    let state = useDigitalTwinStore.getState()
    expect(state.viewMode).toBe('orbit')
    expect(state.activeCameraPreset).toBeNull()
    expect(state.cameraFocusRequest).toBeNull()

    const person = generatePerson({
      name: '跟随对象',
      position: { x: 10, y: 0, z: 4 },
      rotation: { x: 0, y: 0.5, z: 0 },
    })
    store.addEntity(person)
    store.focusCameraOnEntity(person.id)

    expect(useDigitalTwinStore.getState().cameraFocusRequest).not.toBeNull()

    store.setViewMode('follow')
    state = useDigitalTwinStore.getState()
    expect(state.viewMode).toBe('follow')
    expect(state.activeCameraPreset).toBeNull()
    expect(state.cameraFocusRequest).toBeNull()

    store.setActiveCameraPreset('top')
    state = useDigitalTwinStore.getState()
    expect(state.viewMode).toBe('orbit')
    expect(state.activeCameraPreset).toBe('top')
    expect(state.cameraFocusRequest).toBeNull()
  })

  test('legacy topdown view mode is normalized into a one-shot top camera preset', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    store.setViewMode('topdown')

    const state = useDigitalTwinStore.getState()
    expect(state.viewMode).toBe('orbit')
    expect(state.activeCameraPreset).toBe('top')
    expect(state.cameraFocusRequest).toBeNull()
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
