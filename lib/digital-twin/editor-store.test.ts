import { describe, expect, test } from 'bun:test'
import type { BootstrapPayload } from './bootstrap-client'
import {
  buildEditorSceneSavePayload,
  useEditorDigitalTwinStore,
} from './editor-store'
import { DEFAULT_PUBLISHED_SCENE_PACKAGE } from './publish'
import type { Entity, StaticAssetInstance } from './types'

function createEntity(): Entity {
  const now = Date.now()

  return {
    id: 'person-1',
    type: 'person',
    name: '操作员 A',
    position: { x: 10, y: 0, z: 20 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    status: 'active',
    visible: true,
    metadata: {},
    role: '巡检',
    department: '生产部',
    schedule: [],
    createdAt: now,
    updatedAt: now,
  }
}

function createBootstrapPayload(entity: Entity): BootstrapPayload {
  return {
    siteId: 'site-1',
    sceneVersion: 1,
    sceneConfig: DEFAULT_PUBLISHED_SCENE_PACKAGE.sceneConfig,
    entities: [entity],
    staticAssets: [],
    rules: [],
    alarms: [],
    publishedScene: null,
    issuedAt: Date.now(),
  }
}

function createStaticAsset(): StaticAssetInstance {
  const now = Date.now()

  return {
    id: 'static-asset-1',
    name: '立罐组 A',
    assetKind: 'vertical-tank',
    variant: 'fixed-roof',
    position: { x: 42, y: 0, z: -18 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    metadata: { catalogId: 'vertical-tank-fixed-roof' },
    createdAt: now,
    updatedAt: now,
  }
}

describe('editor store', () => {
  test('hydrates entities and creates isolated editable draft selection', () => {
    useEditorDigitalTwinStore.getState().reset()
    const entity = createEntity()
    useEditorDigitalTwinStore
      .getState()
      .hydrateFromBootstrap(createBootstrapPayload(entity), DEFAULT_PUBLISHED_SCENE_PACKAGE)
    useEditorDigitalTwinStore.getState().selectEntity(entity.id)

    const state = useEditorDigitalTwinStore.getState()

    expect(state.selectedEntityId).toBe(entity.id)
    expect(state.draftEntity?.position.x).toBe(10)
    expect(state.savedEntity?.position.x).toBe(10)

    state.updateDraftTransform({
      position: { x: 15, y: 0, z: 24 },
      rotation: { x: 0, y: 0.2, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    })

    expect(useEditorDigitalTwinStore.getState().draftEntity?.position.x).toBe(15)
    expect(useEditorDigitalTwinStore.getState().entities.get(entity.id)?.position.x).toBe(10)
  })

  test('supports commit, undo, redo, and reset on draft transform history', () => {
    useEditorDigitalTwinStore.getState().reset()
    const entity = createEntity()
    const store = useEditorDigitalTwinStore.getState()

    store.hydrateFromBootstrap(
      createBootstrapPayload(entity),
      DEFAULT_PUBLISHED_SCENE_PACKAGE
    )
    store.selectEntity(entity.id)
    store.beginTransformSession()
    store.updateDraftTransform({
      position: { x: 12, y: 0, z: 22 },
      rotation: { x: 0, y: 0.6, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    })
    store.commitTransformSession()

    expect(useEditorDigitalTwinStore.getState().history).toHaveLength(1)
    expect(useEditorDigitalTwinStore.getState().isDirty).toBe(true)

    useEditorDigitalTwinStore.getState().undo()
    expect(useEditorDigitalTwinStore.getState().draftEntity?.position.x).toBe(10)
    expect(useEditorDigitalTwinStore.getState().redoHistory).toHaveLength(1)

    useEditorDigitalTwinStore.getState().redo()
    expect(useEditorDigitalTwinStore.getState().draftEntity?.position.x).toBe(12)

    useEditorDigitalTwinStore.getState().resetDraft()
    expect(useEditorDigitalTwinStore.getState().draftEntity?.position.x).toBe(10)
    expect(useEditorDigitalTwinStore.getState().isDirty).toBe(false)
  })

  test('ignores redundant draft transform snapshots', () => {
    useEditorDigitalTwinStore.getState().reset()
    const entity = createEntity()

    useEditorDigitalTwinStore
      .getState()
      .hydrateFromBootstrap(createBootstrapPayload(entity), DEFAULT_PUBLISHED_SCENE_PACKAGE)
    useEditorDigitalTwinStore.getState().selectEntity(entity.id)

    const before = useEditorDigitalTwinStore.getState().draftEntity
    expect(before).not.toBeNull()

    useEditorDigitalTwinStore.getState().updateDraftTransform({
      position: { x: 10, y: 0, z: 20 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    })

    const after = useEditorDigitalTwinStore.getState().draftEntity
    expect(after).toBe(before)
  })

  test('keeps drag preview ephemeral and clears it when dragging stops', () => {
    useEditorDigitalTwinStore.getState().reset()
    const entity = createEntity()

    useEditorDigitalTwinStore
      .getState()
      .hydrateFromBootstrap(createBootstrapPayload(entity), DEFAULT_PUBLISHED_SCENE_PACKAGE)
    useEditorDigitalTwinStore.getState().selectEntity(entity.id)
    useEditorDigitalTwinStore.getState().setTransformDragging(true)
    useEditorDigitalTwinStore.getState().setTransformPreview({
      position: { x: 14, y: 0, z: 24 },
      rotation: { x: 0, y: 0.2, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    })

    expect(useEditorDigitalTwinStore.getState().transformPreview?.position.x).toBe(14)
    expect(useEditorDigitalTwinStore.getState().isDirty).toBe(false)

    useEditorDigitalTwinStore.getState().setTransformDragging(false)

    expect(useEditorDigitalTwinStore.getState().transformPreview).toBeNull()
  })

  test('supports direct inspector property edits on selected entity drafts', () => {
    useEditorDigitalTwinStore.getState().reset()
    const entity = createEntity()
    const store = useEditorDigitalTwinStore.getState()

    store.hydrateFromBootstrap(
      createBootstrapPayload(entity),
      DEFAULT_PUBLISHED_SCENE_PACKAGE
    )
    store.selectEntity(entity.id)
    store.updateDraftProperties({
      name: '操作员 A / Shift B',
      visible: false,
    })
    store.setDraftTransformField('position', 'x', 13.5)
    store.setDraftTransformField('rotation', 'y', 0.35)

    const state = useEditorDigitalTwinStore.getState()

    expect(state.draftEntity?.name).toBe('操作员 A / Shift B')
    expect(state.draftEntity?.visible).toBe(false)
    expect(state.draftEntity?.position.x).toBe(13.5)
    expect(state.draftEntity?.rotation.y).toBe(0.35)
    expect(state.history).toHaveLength(2)
    expect(state.isDirty).toBe(true)

    state.undo()
    expect(useEditorDigitalTwinStore.getState().draftEntity?.rotation.y).toBe(0)
    expect(useEditorDigitalTwinStore.getState().draftEntity?.name).toBe('操作员 A / Shift B')
    expect(useEditorDigitalTwinStore.getState().draftEntity?.visible).toBe(false)
  })

  test('hydrates and edits authored static asset selections independently from entities', () => {
    useEditorDigitalTwinStore.getState().reset()
    const entity = createEntity()
    const staticAsset = createStaticAsset()

    useEditorDigitalTwinStore.getState().hydrateFromBootstrap(
      {
        ...createBootstrapPayload(entity),
        staticAssets: [staticAsset],
      },
      DEFAULT_PUBLISHED_SCENE_PACKAGE
    )

    useEditorDigitalTwinStore.getState().selectStaticAsset(staticAsset.id)
    expect(useEditorDigitalTwinStore.getState().selectedEntityId).toBeNull()
    expect(useEditorDigitalTwinStore.getState().draftStaticAsset?.name).toBe('立罐组 A')

    useEditorDigitalTwinStore.getState().beginTransformSession()
    useEditorDigitalTwinStore.getState().updateDraftTransform({
      position: { x: 44, y: 0, z: -16 },
      rotation: { x: 0, y: 0.4, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    })
    useEditorDigitalTwinStore.getState().commitTransformSession()

    expect(useEditorDigitalTwinStore.getState().isDirty).toBe(true)
    expect(useEditorDigitalTwinStore.getState().history).toHaveLength(1)

    useEditorDigitalTwinStore.getState().resetDraft()
    expect(useEditorDigitalTwinStore.getState().draftStaticAsset?.position.x).toBe(42)
    expect(useEditorDigitalTwinStore.getState().isDirty).toBe(false)
  })

  test('supports direct inspector property edits on selected static assets', () => {
    useEditorDigitalTwinStore.getState().reset()
    const entity = createEntity()
    const staticAsset = createStaticAsset()

    useEditorDigitalTwinStore.getState().hydrateFromBootstrap(
      {
        ...createBootstrapPayload(entity),
        staticAssets: [staticAsset],
      },
      DEFAULT_PUBLISHED_SCENE_PACKAGE
    )

    const store = useEditorDigitalTwinStore.getState()
    store.selectStaticAsset(staticAsset.id)
    store.updateDraftProperties({
      name: '立罐组 B',
      visible: false,
    })
    store.updateDraftMetadata({
      assetCode: 'TK-201',
      color: '#ff8844',
    })
    store.setDraftTransformField('scale', 'x', 1.25)

    const state = useEditorDigitalTwinStore.getState()

    expect(state.draftStaticAsset?.name).toBe('立罐组 B')
    expect(state.draftStaticAsset?.visible).toBe(false)
    expect(state.draftStaticAsset?.metadata.assetCode).toBe('TK-201')
    expect(state.draftStaticAsset?.metadata.color).toBe('#ff8844')
    expect(state.draftStaticAsset?.scale.x).toBe(1.25)
    expect(state.history).toHaveLength(1)
    expect(state.isDirty).toBe(true)
  })

  test('duplicates selected static assets into a new unsaved draft', () => {
    useEditorDigitalTwinStore.getState().reset()
    const entity = createEntity()
    const staticAsset = createStaticAsset()

    useEditorDigitalTwinStore.getState().hydrateFromBootstrap(
      {
        ...createBootstrapPayload(entity),
        staticAssets: [staticAsset],
      },
      DEFAULT_PUBLISHED_SCENE_PACKAGE
    )

    const store = useEditorDigitalTwinStore.getState()
    store.selectStaticAsset(staticAsset.id)
    store.setSnapEnabled(true)
    store.setTranslateSnap(2)

    const duplicate = store.duplicateSelection()
    const state = useEditorDigitalTwinStore.getState()

    expect(duplicate).not.toBeNull()
    expect(duplicate?.id).not.toBe(staticAsset.id)
    expect(duplicate?.name).toContain('副本')
    expect(duplicate?.position.x).toBe(staticAsset.position.x + 2)
    expect(duplicate?.position.z).toBe(staticAsset.position.z + 2)
    expect(state.savedStaticAsset).toBeNull()
    expect(state.selectedStaticAssetId).toBe(duplicate?.id ?? null)
    expect(state.isDirty).toBe(true)
  })

  test('duplicates selected entities into a new unsaved draft', () => {
    useEditorDigitalTwinStore.getState().reset()
    const entity = createEntity()

    useEditorDigitalTwinStore
      .getState()
      .hydrateFromBootstrap(createBootstrapPayload(entity), DEFAULT_PUBLISHED_SCENE_PACKAGE)

    const store = useEditorDigitalTwinStore.getState()
    store.selectEntity(entity.id)
    store.setSnapEnabled(true)
    store.setTranslateSnap(1)

    const duplicate = store.duplicateSelection()
    const state = useEditorDigitalTwinStore.getState()

    expect(duplicate).not.toBeNull()
    expect(duplicate?.id).not.toBe(entity.id)
    expect(duplicate?.name).toContain('副本')
    expect(state.savedEntity).toBeNull()
    expect(state.selectedEntityId).toBe(duplicate?.id ?? null)
    expect(state.draftEntity?.position.x).toBe(entity.position.x + 1)
    expect(state.draftEntity?.position.z).toBe(entity.position.z + 1)
    expect(state.isDirty).toBe(true)
  })

  test('creates a new authored static asset draft from placement mode', () => {
    useEditorDigitalTwinStore.getState().reset()
    const entity = createEntity()

    useEditorDigitalTwinStore
      .getState()
      .hydrateFromBootstrap(createBootstrapPayload(entity), DEFAULT_PUBLISHED_SCENE_PACKAGE)
    useEditorDigitalTwinStore
      .getState()
      .armStaticAssetPlacement('pipe-rack-west-header')

    const placed = useEditorDigitalTwinStore.getState().placeStaticAsset({
      position: {
        x: 12,
        y: 0,
        z: -6,
      },
      rotation: { x: 0, y: Math.PI / 2, z: 0 },
      metadata: {
        hostStaticAssetId: 'wall-1',
      },
    })

    expect(placed?.assetKind).toBe('pipe-rack')
    expect(useEditorDigitalTwinStore.getState().draftStaticAsset?.position.x).toBe(12)
    expect(useEditorDigitalTwinStore.getState().draftStaticAsset?.rotation.y).toBe(Math.PI / 2)
    expect(useEditorDigitalTwinStore.getState().draftStaticAsset?.metadata.hostStaticAssetId).toBe(
      'wall-1'
    )
    expect(useEditorDigitalTwinStore.getState().savedStaticAsset).toBeNull()
    expect(useEditorDigitalTwinStore.getState().placementCatalogId).toBeNull()
    expect(useEditorDigitalTwinStore.getState().isDirty).toBe(true)
  })

  test('locks hosted placement elevation when placing wall-mounted assets', () => {
    useEditorDigitalTwinStore.getState().reset()
    const entity = createEntity()

    useEditorDigitalTwinStore
      .getState()
      .hydrateFromBootstrap(createBootstrapPayload(entity), DEFAULT_PUBLISHED_SCENE_PACKAGE)
    useEditorDigitalTwinStore
      .getState()
      .armStaticAssetPlacement('security-device-access-reader')

    const placed = useEditorDigitalTwinStore.getState().placeStaticAsset({
      position: {
        x: 4,
        y: 1.68,
        z: 8.19,
      },
      rotation: { x: 0, y: Math.PI / 2, z: 0 },
      elevationLocked: true,
      metadata: {
        hostStaticAssetId: 'wall-1',
        hostSurface: 'wall-face',
      },
    })

    expect(placed?.position.y).toBe(1.68)
    expect(placed?.rotation.y).toBeCloseTo(Math.PI / 2)
    expect(placed?.metadata.hostStaticAssetId).toBe('wall-1')
    expect(placed?.metadata.hostSurface).toBe('wall-face')
  })

  test('updates viewport and scene workspace controls independently from selection drafts', () => {
    useEditorDigitalTwinStore.getState().reset()
    const entity = createEntity()
    const store = useEditorDigitalTwinStore.getState()

    store.hydrateFromBootstrap(
      createBootstrapPayload(entity),
      DEFAULT_PUBLISHED_SCENE_PACKAGE
    )

    store.setSceneConfig({
      showGrid: false,
      showAxes: true,
      gridSize: 640,
      gridDivisions: 256,
      ambientLightIntensity: 0.75,
    })
    store.setViewportProjection('orthographic')
    store.setViewMode('topdown')
    store.setSnapEnabled(true)
    store.setTranslateSnap(2.5)
    store.setRotateSnapDegrees(30)
    store.focusCameraPreset('top')

    const state = useEditorDigitalTwinStore.getState()
    const topPreset = state.cameraPresets.find((preset) => preset.id === 'top')

    expect(state.sceneConfig.showGrid).toBe(false)
    expect(state.sceneConfig.showAxes).toBe(true)
    expect(state.sceneConfig.gridSize).toBe(640)
    expect(state.sceneConfig.gridDivisions).toBe(256)
    expect(state.sceneConfig.ambientLightIntensity).toBe(0.75)
    expect(state.viewportProjection).toBe('orthographic')
    expect(state.viewMode).toBe('topdown')
    expect(state.snapEnabled).toBe(true)
    expect(state.translateSnap).toBe(2.5)
    expect(state.rotateSnapDegrees).toBe(30)
    expect(state.activeCameraPreset).toBe('top')
    expect(state.cameraFocusRequest).not.toBeNull()
    expect(state.cameraFocusRequest?.position).toEqual(topPreset?.position)
    expect(state.cameraFocusRequest?.target).toEqual(topPreset?.target)
    expect(state.editorCameraPosition).toEqual(topPreset?.position)
    expect(state.editorCameraTarget).toEqual(topPreset?.target)
    expect(state.sceneConfig.cameraPosition).toEqual(
      DEFAULT_PUBLISHED_SCENE_PACKAGE.sceneConfig.cameraPosition
    )
    expect(state.sceneConfig.cameraTarget).toEqual(
      DEFAULT_PUBLISHED_SCENE_PACKAGE.sceneConfig.cameraTarget
    )

    state.clearCameraFocusRequest()
    expect(useEditorDigitalTwinStore.getState().cameraFocusRequest).toBeNull()
    expect(useEditorDigitalTwinStore.getState().draftEntity).toBeNull()
    expect(useEditorDigitalTwinStore.getState().hasSceneChanges).toBe(true)
    expect(useEditorDigitalTwinStore.getState().hasSelectionChanges).toBe(false)
    expect(useEditorDigitalTwinStore.getState().isDirty).toBe(true)
  })

  test('tracks unsaved scene configuration changes across selection transitions', () => {
    useEditorDigitalTwinStore.getState().reset()
    const entity = createEntity()
    const store = useEditorDigitalTwinStore.getState()

    store.hydrateFromBootstrap(
      createBootstrapPayload(entity),
      DEFAULT_PUBLISHED_SCENE_PACKAGE
    )

    store.setSceneConfig({
      showGrid: false,
      ambientLightIntensity: 0.92,
    })

    expect(useEditorDigitalTwinStore.getState().isDirty).toBe(true)
    expect(useEditorDigitalTwinStore.getState().savedSceneConfig.showGrid).toBe(true)

    store.selectEntity(entity.id)
    expect(useEditorDigitalTwinStore.getState().selectedEntityId).toBe(entity.id)
    expect(useEditorDigitalTwinStore.getState().isDirty).toBe(true)

    store.selectEntity(null)
    expect(useEditorDigitalTwinStore.getState().selectedEntityId).toBeNull()
    expect(useEditorDigitalTwinStore.getState().isDirty).toBe(true)
  })

  test('focuses camera by cardinal directions without requiring preset ids', () => {
    useEditorDigitalTwinStore.getState().reset()
    const entity = createEntity()
    const store = useEditorDigitalTwinStore.getState()

    store.hydrateFromBootstrap(
      createBootstrapPayload(entity),
      DEFAULT_PUBLISHED_SCENE_PACKAGE
    )
    store.focusCameraDirection('east')

    const state = useEditorDigitalTwinStore.getState()

    expect(state.activeCameraPreset).toBeNull()
    expect(state.cameraFocusRequest).not.toBeNull()
    expect(state.viewMode).toBe('orbit')
    expect(state.editorCameraPosition.x).toBeGreaterThan(state.editorCameraTarget.x)
    expect(state.sceneConfig.cameraPosition).toEqual(
      DEFAULT_PUBLISHED_SCENE_PACKAGE.sceneConfig.cameraPosition
    )
  })

  test('top focus keeps the current view mode and only applies a one-shot camera pose change', () => {
    useEditorDigitalTwinStore.getState().reset()
    const entity = createEntity()
    const store = useEditorDigitalTwinStore.getState()

    store.hydrateFromBootstrap(
      createBootstrapPayload(entity),
      DEFAULT_PUBLISHED_SCENE_PACKAGE
    )
    store.setViewMode('orbit')
    const before = useEditorDigitalTwinStore.getState()

    store.focusCameraDirection('top')

    const state = useEditorDigitalTwinStore.getState()

    expect(state.viewMode).toBe('orbit')
    expect(state.activeCameraPreset).toBeNull()
    expect(state.cameraFocusRequest).not.toBeNull()
    expect(state.editorCameraTarget).toEqual(before.editorCameraTarget)
    expect(state.editorCameraPosition.x).toBe(state.editorCameraTarget.x)
    expect(state.editorCameraPosition.z).toBe(state.editorCameraTarget.z)
    expect(state.editorCameraPosition.y).toBeGreaterThan(before.editorCameraPosition.y)
  })

  test('tracks scene workspace changes separately from camera pose updates', () => {
    useEditorDigitalTwinStore.getState().reset()
    const entity = createEntity()
    const store = useEditorDigitalTwinStore.getState()

    store.hydrateFromBootstrap(
      createBootstrapPayload(entity),
      DEFAULT_PUBLISHED_SCENE_PACKAGE
    )

    store.setSceneConfig({ showGrid: false })
    let state = useEditorDigitalTwinStore.getState()
    expect(state.hasSceneChanges).toBe(true)
    expect(state.hasSelectionChanges).toBe(false)
    expect(state.isDirty).toBe(true)

    store.setEditorCameraPose({ x: 320, y: 240, z: 160 }, { x: 0, y: 0, z: 0 })
    state = useEditorDigitalTwinStore.getState()
    expect(state.hasSceneChanges).toBe(true)
    expect(state.isDirty).toBe(true)
    expect(state.editorCameraPosition).toEqual({ x: 320, y: 240, z: 160 })
    expect(state.editorCameraTarget).toEqual({ x: 0, y: 0, z: 0 })
    expect(state.sceneConfig.cameraPosition).toEqual(
      DEFAULT_PUBLISHED_SCENE_PACKAGE.sceneConfig.cameraPosition
    )

    store.hydrateFromBootstrap(
      {
        ...createBootstrapPayload(entity),
        sceneConfig: state.sceneConfig,
      },
      DEFAULT_PUBLISHED_SCENE_PACKAGE
    )

    store.setEditorCameraPose({ x: 400, y: 260, z: 180 }, { x: 10, y: 0, z: 10 })
    state = useEditorDigitalTwinStore.getState()
    expect(state.hasSceneChanges).toBe(false)
    expect(state.hasSelectionChanges).toBe(false)
    expect(state.isDirty).toBe(false)
    expect(state.editorCameraPosition).toEqual({ x: 400, y: 260, z: 180 })
    expect(state.editorCameraTarget).toEqual({ x: 10, y: 0, z: 10 })
    expect(state.sceneConfig.cameraTarget).toEqual(
      DEFAULT_PUBLISHED_SCENE_PACKAGE.sceneConfig.cameraTarget
    )
  })

  test('builds scene save payloads with persisted camera fields and local workspace edits', () => {
    const savedSceneConfig = {
      ...DEFAULT_PUBLISHED_SCENE_PACKAGE.sceneConfig,
      backgroundColor: '#10151d',
      cameraPosition: { x: 300, y: 180, z: 140 },
      cameraTarget: { x: 10, y: 0, z: -12 },
    }
    const currentSceneConfig = {
      ...savedSceneConfig,
      backgroundColor: '#1d3557',
      showAxes: true,
      cameraPosition: { x: 999, y: 888, z: 777 },
      cameraTarget: { x: 5, y: 4, z: 3 },
    }

    expect(buildEditorSceneSavePayload(currentSceneConfig, savedSceneConfig)).toEqual({
      ...currentSceneConfig,
      cameraPosition: savedSceneConfig.cameraPosition,
      cameraTarget: savedSceneConfig.cameraTarget,
    })
  })

  test('treats scene camera patches as editor-local view updates without dirtying persisted scene state', () => {
    useEditorDigitalTwinStore.getState().reset()
    const entity = createEntity()
    const store = useEditorDigitalTwinStore.getState()

    store.hydrateFromBootstrap(
      createBootstrapPayload(entity),
      DEFAULT_PUBLISHED_SCENE_PACKAGE
    )

    store.setSceneConfig({
      cameraPosition: { x: 180, y: 96, z: 72 },
      cameraTarget: { x: 12, y: 0, z: -8 },
    })

    const state = useEditorDigitalTwinStore.getState()

    expect(state.editorCameraPosition).toEqual({ x: 180, y: 96, z: 72 })
    expect(state.editorCameraTarget).toEqual({ x: 12, y: 0, z: -8 })
    expect(state.sceneConfig.cameraPosition).toEqual(
      DEFAULT_PUBLISHED_SCENE_PACKAGE.sceneConfig.cameraPosition
    )
    expect(state.sceneConfig.cameraTarget).toEqual(
      DEFAULT_PUBLISHED_SCENE_PACKAGE.sceneConfig.cameraTarget
    )
    expect(state.savedSceneConfig.cameraPosition).toEqual(
      DEFAULT_PUBLISHED_SCENE_PACKAGE.sceneConfig.cameraPosition
    )
    expect(state.savedSceneConfig.cameraTarget).toEqual(
      DEFAULT_PUBLISHED_SCENE_PACKAGE.sceneConfig.cameraTarget
    )
    expect(state.hasSceneChanges).toBe(false)
    expect(state.hasSelectionChanges).toBe(false)
    expect(state.isDirty).toBe(false)
  })

  test('preserves local editor camera pose across reload hydration when requested', () => {
    useEditorDigitalTwinStore.getState().reset()
    const entity = createEntity()
    const store = useEditorDigitalTwinStore.getState()

    store.hydrateFromBootstrap(
      createBootstrapPayload(entity),
      DEFAULT_PUBLISHED_SCENE_PACKAGE
    )
    store.setEditorCameraPose({ x: 360, y: 220, z: 140 }, { x: 8, y: 0, z: -4 })

    const nextPayload = {
      ...createBootstrapPayload(entity),
      sceneConfig: {
        ...DEFAULT_PUBLISHED_SCENE_PACKAGE.sceneConfig,
        cameraPosition: { x: 24, y: 18, z: 12 },
        cameraTarget: { x: 2, y: 0, z: 1 },
      },
    }

    store.hydrateFromBootstrap(nextPayload, DEFAULT_PUBLISHED_SCENE_PACKAGE, {
      preserveEditorCameraPose: true,
    })

    const state = useEditorDigitalTwinStore.getState()

    expect(state.sceneConfig.cameraPosition).toEqual(nextPayload.sceneConfig.cameraPosition)
    expect(state.sceneConfig.cameraTarget).toEqual(nextPayload.sceneConfig.cameraTarget)
    expect(state.savedSceneConfig.cameraPosition).toEqual(
      nextPayload.sceneConfig.cameraPosition
    )
    expect(state.savedSceneConfig.cameraTarget).toEqual(
      nextPayload.sceneConfig.cameraTarget
    )
    expect(state.editorCameraPosition).toEqual({ x: 360, y: 220, z: 140 })
    expect(state.editorCameraTarget).toEqual({ x: 8, y: 0, z: -4 })
    expect(state.hasSceneChanges).toBe(false)
    expect(state.hasSelectionChanges).toBe(false)
    expect(state.isDirty).toBe(false)
  })
})
