import { describe, expect, test } from 'bun:test'
import type { BootstrapPayload } from './bootstrap-client'
import { useEditorDigitalTwinStore } from './editor-store'
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
    store.setDraftTransformField('scale', 'x', 1.25)

    const state = useEditorDigitalTwinStore.getState()

    expect(state.draftStaticAsset?.name).toBe('立罐组 B')
    expect(state.draftStaticAsset?.visible).toBe(false)
    expect(state.draftStaticAsset?.scale.x).toBe(1.25)
    expect(state.history).toHaveLength(1)
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
      x: 12,
      y: 0,
      z: -6,
    })

    expect(placed?.assetKind).toBe('pipe-rack')
    expect(useEditorDigitalTwinStore.getState().draftStaticAsset?.position.x).toBe(12)
    expect(useEditorDigitalTwinStore.getState().savedStaticAsset).toBeNull()
    expect(useEditorDigitalTwinStore.getState().placementCatalogId).toBeNull()
    expect(useEditorDigitalTwinStore.getState().isDirty).toBe(true)
  })
})
