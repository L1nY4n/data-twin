import { describe, expect, test } from 'bun:test'
import { AdminApiError } from '@/lib/digital-twin/bootstrap-client'
import type { Entity, SceneConfig, StaticAssetInstance } from '@/lib/digital-twin/types'
import {
  canEditorPublish,
  createEditorSceneSavePayload,
  createEditorSaveRequest,
  describeEditorOperationError,
  executeFloorPlanImport,
  FloorPlanImportError,
  resolveEditorPublishResult,
  resolveEditorSaveFailureStatus,
  resolveEditorSaveSelectionResult,
  restoreSelectionAfterReload,
  StandardRoomCreationError,
  executeStandardRoomCreation,
} from './use-editor-digital-twin'
import type { PublishStatus } from '@/lib/digital-twin/admin'
import { useEditorDigitalTwinStore } from '@/lib/digital-twin/editor-store'
import { DEFAULT_PUBLISHED_SCENE_PACKAGE } from '@/lib/digital-twin/publish'
import type { BootstrapPayload } from '@/lib/digital-twin/bootstrap-client'

function createSavedAsset(
  asset: StaticAssetInstance,
  id = `${String(asset.metadata.presetRole)}-saved`
) {
  return {
    ...asset,
    id,
    metadata: {
      ...asset.metadata,
    },
  } satisfies StaticAssetInstance
}

function createSceneConfig(overrides: Partial<SceneConfig> = {}): SceneConfig {
  return {
    id: 'scene-1',
    name: 'Editor scene',
    gridSize: 80,
    gridDivisions: 40,
    backgroundColor: '#10151d',
    ambientLightIntensity: 0.5,
    showAxes: false,
    showGrid: true,
    cameraPosition: { x: 30, y: 20, z: 10 },
    cameraTarget: { x: 0, y: 0, z: 0 },
    ...overrides,
  }
}

function createEntityDraft(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'entity-1',
    type: 'equipment',
    name: 'AHU 01',
    position: { x: 1, y: 0, z: 2 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    status: 'active',
    visible: true,
    metadata: {},
    modelId: '',
    parameters: {},
    alarms: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as Entity
}

function createRoutedVehicleDraft(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'vehicle-1',
    type: 'vehicle',
    name: '叉车 01',
    position: { x: 4, y: 0, z: 6 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    status: 'active',
    visible: true,
    metadata: {},
    plateNumber: 'A1001',
    vehicleType: 'forklift',
    speed: 1,
    heading: 0,
    routeTrack: {
      id: 'forklift-track-01',
      loop: true,
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
      ],
    },
    trackPosition: {
      trackId: 'forklift-track-01',
      segmentIndex: 0,
      segmentProgress: 0.4,
    },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as Entity
}

function createBootstrapPayload(entity: Entity): BootstrapPayload {
  return {
    siteId: 'site-1',
    workspaceId: 'factory-demo-scene',
    workspaceSlug: 'factory-demo-scene',
    workspaceName: '工厂演示场景',
    sceneVersion: 1,
    sceneConfig: DEFAULT_PUBLISHED_SCENE_PACKAGE.sceneConfig,
    entities: [entity],
    staticAssets: [],
    entityCategories: [],
    entityArchetypes: [],
    rules: [],
    alarms: [],
    publishedScene: null,
    issuedAt: Date.now(),
  }
}

function createPublishStatus(overrides: Partial<PublishStatus> = {}): PublishStatus {
  return {
    status: 'published',
    currentSceneVersion: 1,
    publishedSceneVersion: 1,
    lastPublishedAt: null,
    lastPublishedVersion: null,
    lastError: null,
    hasUnpublishedChanges: false,
    compilerSource: 'test',
    ...overrides,
  }
}

describe('useEditorDigitalTwin standard room workflow', () => {
  test('creates a scene save payload that keeps persisted camera fields', () => {
    const savedSceneConfig = createSceneConfig()
    const nextSceneConfig = createSceneConfig({
      showAxes: true,
      backgroundColor: '#0f172a',
      cameraPosition: { x: 120, y: 90, z: 45 },
      cameraTarget: { x: 18, y: 0, z: -12 },
    })

    expect(
      createEditorSceneSavePayload(nextSceneConfig, savedSceneConfig)
    ).toEqual({
      ...nextSceneConfig,
      cameraPosition: savedSceneConfig.cameraPosition,
      cameraTarget: savedSceneConfig.cameraTarget,
    })
  })

  test('returns null when there are no scene or selection changes to save', () => {
    expect(
      createEditorSaveRequest({
        sceneVersion: 7,
        sceneConfig: createSceneConfig(),
        savedSceneConfig: createSceneConfig(),
        hasSceneChanges: false,
        hasSelectionChanges: false,
        draftEntity: null,
        draftStaticAsset: null,
        savedEntity: null,
        savedStaticAsset: null,
        selectedEntityId: null,
        selectedStaticAssetId: null,
      })
    ).toBeNull()
  })

  test('builds a transactional editor save request with persisted camera fields', () => {
    const savedSceneConfig = createSceneConfig()
    const nextSceneConfig = createSceneConfig({
      backgroundColor: '#1d3557',
      showAxes: true,
      cameraPosition: { x: 90, y: 70, z: 50 },
      cameraTarget: { x: 9, y: 0, z: -5 },
    })
    const draftEntity = createEntityDraft()

    const request = createEditorSaveRequest({
      sceneVersion: 7,
      sceneConfig: nextSceneConfig,
      savedSceneConfig,
      hasSceneChanges: true,
      hasSelectionChanges: true,
      draftEntity,
      draftStaticAsset: null,
      savedEntity: draftEntity,
      savedStaticAsset: null,
      selectedEntityId: draftEntity.id,
      selectedStaticAssetId: null,
    })

    expect(request).not.toBeNull()
    expect(request?.expectedSceneVersion).toBe(7)
    expect(request?.sceneConfig).toEqual({
      ...nextSceneConfig,
      cameraPosition: savedSceneConfig.cameraPosition,
      cameraTarget: savedSceneConfig.cameraTarget,
    })
    expect(request?.entity?.mode).toBe('update')
    expect(request?.entity?.entity.id).toBe('entity-1')
  })

  test('reports saved_with_reload_warning when persistence succeeds but reload fails', () => {
    expect(
      resolveEditorSaveSelectionResult({
        reloadSucceeded: false,
        selectionRestored: false,
        savedEntityId: 'entity-1',
      })
    ).toEqual({
      status: 'saved_with_reload_warning',
      persisted: true,
      synced: false,
      requiresReload: true,
      reloadSucceeded: false,
      selectionRestored: false,
    })
  })

  test('reports saved_with_selection_warning when reload succeeds but selection restoration fails', () => {
    expect(
      resolveEditorSaveSelectionResult({
        reloadSucceeded: true,
        selectionRestored: false,
        savedStaticAssetId: 'asset-42',
      })
    ).toEqual({
      status: 'saved_with_selection_warning',
      persisted: true,
      synced: false,
      requiresReload: true,
      reloadSucceeded: true,
      selectionRestored: false,
    })
  })

  test('reports saved when persistence and reload complete cleanly', () => {
    expect(
      resolveEditorSaveSelectionResult({
        reloadSucceeded: true,
        selectionRestored: true,
        savedEntityId: 'entity-1',
      })
    ).toEqual({
      status: 'saved',
      persisted: true,
      synced: true,
      requiresReload: false,
      reloadSucceeded: true,
      selectionRestored: true,
    })
  })

  test('reports publish_in_progress when a recovered publish is still running', () => {
    expect(
      resolveEditorPublishResult({
        publishStatus: createPublishStatus({ status: 'publishing' }),
        recovered: true,
      })
    ).toEqual({
      status: 'publish_in_progress',
      completed: false,
      inProgress: true,
      recovered: true,
    })
  })

  test('reports published when publish recovery sync finds a completed publish', () => {
    expect(
      resolveEditorPublishResult({
        publishStatus: createPublishStatus({
          status: 'published',
          lastPublishedVersion: '42',
        }),
        recovered: true,
      })
    ).toEqual({
      status: 'published',
      completed: true,
      inProgress: false,
      recovered: true,
    })
  })

  test('reports published when a direct publish call completes', () => {
    expect(
      resolveEditorPublishResult({
        publishStatus: createPublishStatus({
          status: 'published',
          lastPublishedVersion: '42',
        }),
        recovered: false,
      })
    ).toEqual({
      status: 'published',
      completed: true,
      inProgress: false,
      recovered: false,
    })
  })

  test('disables publish while a recovered publish is still running remotely', () => {
    expect(
      canEditorPublish({
        publishStatus: createPublishStatus({
          status: 'publishing',
          hasUnpublishedChanges: true,
        }),
        isDirty: false,
        isSaving: false,
        isPublishing: false,
      })
    ).toBe(false)
  })

  test('allows publish only when unpublished changes are ready and no publish is active', () => {
    expect(
      canEditorPublish({
        publishStatus: createPublishStatus({
          status: 'saved-unpublished',
          hasUnpublishedChanges: true,
        }),
        isDirty: false,
        isSaving: false,
        isPublishing: false,
      })
    ).toBe(true)

    expect(
      canEditorPublish({
        publishStatus: createPublishStatus({
          status: 'saved-unpublished',
          hasUnpublishedChanges: true,
        }),
        isDirty: false,
        isSaving: false,
        isPublishing: true,
      })
    ).toBe(false)
  })

  test('preserves backend conflict messaging for editor save concurrency errors', () => {
    expect(
      describeEditorOperationError(
        new AdminApiError('Request failed 409: reload the editor and retry', {
          status: 409,
          payload: '{"error":"reload the editor and retry"}',
        }),
        '保存编辑内容失败'
      )
    ).toBe('Request failed 409: reload the editor and retry')
  })

  test('maps editor save concurrency conflicts to a reload-first recovery status', () => {
    expect(
      resolveEditorSaveFailureStatus(
        new AdminApiError(
          'Request failed 409: editor save is based on scene version 3, but the current version is 4; reload the editor and retry',
          {
            status: 409,
            payload:
              '{"error":"editor save is based on scene version 3, but the current version is 4; reload the editor and retry","code":"scene_version_conflict","expectedSceneVersion":3,"currentSceneVersion":4,"recoveryAction":"reload"}',
          }
        )
      )
    ).toEqual({
      phase: 'error',
      tone: 'warning',
      title: '检测到编辑版本冲突',
      detail: '当前编辑基于场景版本 3，但服务端最新版本已是 4。请先重新同步，再重试保存。',
      isBusy: false,
      canRetry: true,
      retryLabel: '重新同步',
      retryAction: 'reload',
    })
  })

  test('keeps generic save failures on the retry-save path', () => {
    expect(
      resolveEditorSaveFailureStatus(new Error('network request failed'))
    ).toEqual({
      phase: 'error',
      tone: 'danger',
      title: '保存失败',
      detail: 'network request failed',
      isBusy: false,
      canRetry: true,
      retryLabel: '重试保存',
      retryAction: 'save',
    })
  })

  test('builds a transactional scene and static-asset save request without persisting editor-only camera pose', () => {
    const savedSceneConfig = createSceneConfig()
    const nextSceneConfig = createSceneConfig({
      backgroundColor: '#1d3557',
      showAxes: true,
      cameraPosition: { x: 90, y: 70, z: 50 },
      cameraTarget: { x: 9, y: 0, z: -5 },
    })
    const savedAsset: StaticAssetInstance = {
      id: 'asset-42',
      name: 'AHU Door',
      assetKind: 'door-system',
      variant: 'single-swing',
      position: { x: 4, y: 0, z: 5 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      metadata: { catalogId: 'door-system-single-swing' },
      createdAt: 1,
      updatedAt: 1,
    }
    const draftAsset: StaticAssetInstance = {
      ...savedAsset,
      name: 'AHU Door / Updated',
    }

    const request = createEditorSaveRequest({
      sceneVersion: 7,
      sceneConfig: nextSceneConfig,
      savedSceneConfig,
      hasSceneChanges: true,
      hasSelectionChanges: true,
      draftEntity: null,
      draftStaticAsset: draftAsset,
      savedEntity: null,
      savedStaticAsset: savedAsset,
      selectedEntityId: null,
      selectedStaticAssetId: draftAsset.id,
    })

    expect(request).not.toBeNull()
    expect(request?.expectedSceneVersion).toBe(7)
    expect(request?.sceneConfig).toEqual({
      ...nextSceneConfig,
      cameraPosition: savedSceneConfig.cameraPosition,
      cameraTarget: savedSceneConfig.cameraTarget,
    })
    expect(request?.entity).toBeUndefined()
    expect(request?.staticAsset?.mode).toBe('update')
    expect(request?.staticAsset?.staticAsset.id).toBe(savedAsset.id)
    expect(request?.staticAsset?.staticAsset.name).toBe('AHU Door / Updated')
  })

  test('builds a transactional scene and create-mode static-asset save request for unsaved drafts', () => {
    const savedSceneConfig = createSceneConfig()
    const nextSceneConfig = createSceneConfig({
      backgroundColor: '#1d3557',
      showAxes: true,
      cameraPosition: { x: 90, y: 70, z: 50 },
      cameraTarget: { x: 9, y: 0, z: -5 },
    })
    const draftAsset: StaticAssetInstance = {
      id: 'asset-draft-1',
      name: 'Door',
      assetKind: 'door-system',
      variant: 'single-swing',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      metadata: {},
      createdAt: 1,
      updatedAt: 1,
    }

    const request = createEditorSaveRequest({
      sceneVersion: 7,
      sceneConfig: nextSceneConfig,
      savedSceneConfig,
      hasSceneChanges: true,
      hasSelectionChanges: true,
      draftEntity: null,
      draftStaticAsset: draftAsset,
      savedEntity: null,
      savedStaticAsset: null,
      selectedEntityId: null,
      selectedStaticAssetId: draftAsset.id,
    })

    expect(request).not.toBeNull()
    expect(request?.expectedSceneVersion).toBe(7)
    expect(request?.sceneConfig).toEqual({
      ...nextSceneConfig,
      cameraPosition: savedSceneConfig.cameraPosition,
      cameraTarget: savedSceneConfig.cameraTarget,
    })
    expect(request?.entity).toBeUndefined()
    expect(request?.staticAsset?.mode).toBe('create')
    expect(request?.staticAsset?.staticAsset.id).toBe('asset-draft-1')
  })

  test('builds update-mode save requests for persisted static-asset drafts', () => {
    const savedAsset: StaticAssetInstance = {
      id: 'asset-42',
      name: 'AHU Door',
      assetKind: 'door-system',
      variant: 'single-swing',
      position: { x: 4, y: 0, z: 5 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      metadata: { catalogId: 'door-system-single-swing' },
      createdAt: 1,
      updatedAt: 1,
    }
    const draftAsset: StaticAssetInstance = {
      ...savedAsset,
      name: 'AHU Door / Updated',
    }

    const request = createEditorSaveRequest({
      sceneVersion: 7,
      sceneConfig: createSceneConfig(),
      savedSceneConfig: createSceneConfig(),
      hasSceneChanges: false,
      hasSelectionChanges: true,
      draftEntity: null,
      draftStaticAsset: draftAsset,
      savedEntity: null,
      savedStaticAsset: savedAsset,
      selectedEntityId: null,
      selectedStaticAssetId: draftAsset.id,
    })

    expect(request?.sceneConfig).toBeUndefined()
    expect(request?.entity).toBeUndefined()
    expect(request?.staticAsset?.mode).toBe('update')
    expect(request?.staticAsset?.staticAsset.name).toBe('AHU Door / Updated')
  })

  test('builds create-mode save requests for unsaved static-asset drafts', () => {
    const draftAsset: StaticAssetInstance = {
      id: 'asset-draft-1',
      name: 'Door',
      assetKind: 'door-system',
      variant: 'single-swing',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      metadata: {},
      createdAt: 1,
      updatedAt: 1,
    }

    const request = createEditorSaveRequest({
      sceneVersion: 7,
      sceneConfig: createSceneConfig(),
      savedSceneConfig: createSceneConfig(),
      hasSceneChanges: false,
      hasSelectionChanges: true,
      draftEntity: null,
      draftStaticAsset: draftAsset,
      savedEntity: null,
      savedStaticAsset: null,
      selectedEntityId: null,
      selectedStaticAssetId: draftAsset.id,
    })

    expect(request?.entity).toBeUndefined()
    expect(request?.staticAsset?.mode).toBe('create')
    expect(request?.staticAsset?.staticAsset.id).toBe('asset-draft-1')
  })

  test('restores the saved selection after a successful reload', () => {
    const selectedIds: string[] = []

    const restored = restoreSelectionAfterReload({
      reloadSucceeded: true,
      savedEntityId: 'entity-42',
      savedStaticAssetId: null,
      selectEntity: (id) => {
        selectedIds.push(`entity:${id}`)
        return true
      },
      selectStaticAsset: (id) => {
        selectedIds.push(`asset:${id}`)
        return true
      },
    })

    expect(restored).toBe(true)
    expect(selectedIds).toEqual(['entity:entity-42'])
  })

  test('skips reselection when reload does not complete', () => {
    const selectedIds: string[] = []

    const restored = restoreSelectionAfterReload({
      reloadSucceeded: false,
      savedEntityId: null,
      savedStaticAssetId: 'asset-9',
      selectEntity: (id) => {
        selectedIds.push(`entity:${id}`)
        return true
      },
      selectStaticAsset: (id) => {
        selectedIds.push(`asset:${id}`)
        return true
      },
    })

    expect(restored).toBe(false)
    expect(selectedIds).toEqual([])
  })

  test('creates the standard room sequentially and reselects the saved entry door after reload', async () => {
    const createdAssets: StaticAssetInstance[] = []
    const selectedIds: string[] = []

    const result = await executeStandardRoomCreation({
      center: { x: 4, y: 0, z: -3 },
      createStaticAsset: async (asset) => {
        const savedAsset = createSavedAsset(asset, `saved-${createdAssets.length + 1}`)
        createdAssets.push(savedAsset)
        return savedAsset
      },
      reload: async () => true,
      selectStaticAsset: (id) => {
        selectedIds.push(id)
        return true
      },
    })

    expect(createdAssets.map((asset) => asset.metadata.presetRole)).toEqual([
      'north-wall',
      'south-wall',
      'east-wall',
      'west-wall',
      'entry-door',
    ])
    expect(result.createdCount).toBe(5)
    expect(result.reloadSucceeded).toBe(true)
    expect(result.focusAssetId).toBe('saved-5')
    expect(result.selectionRestored).toBe(true)
    expect(selectedIds).toEqual(['saved-5'])
    expect(createdAssets.at(-1)?.metadata.presetRole).toBe('entry-door')
  })

  test('does not reselect the entry door when reload fails after successful creation', async () => {
    const selectedIds: string[] = []

    const result = await executeStandardRoomCreation({
      center: { x: 0, y: 0, z: 0 },
      createStaticAsset: async (asset) => createSavedAsset(asset),
      reload: async () => false,
      selectStaticAsset: (id) => {
        selectedIds.push(id)
        return true
      },
    })

    expect(result.createdCount).toBe(5)
    expect(result.reloadSucceeded).toBe(false)
    expect(result.focusAssetId).toBe('entry-door-saved')
    expect(result.selectionRestored).toBe(false)
    expect(selectedIds).toEqual([])
  })

  test('reports that selection was not restored when reload succeeds but the door is missing', async () => {
    const selectedIds: string[] = []

    const result = await executeStandardRoomCreation({
      center: { x: 0, y: 0, z: 0 },
      createStaticAsset: async (asset) => createSavedAsset(asset),
      reload: async () => true,
      selectStaticAsset: (id) => {
        selectedIds.push(id)
        return false
      },
    })

    expect(result.createdCount).toBe(5)
    expect(result.reloadSucceeded).toBe(true)
    expect(result.focusAssetId).toBe('entry-door-saved')
    expect(result.selectionRestored).toBe(false)
    expect(selectedIds).toEqual(['entry-door-saved'])
  })

  test('captures partial creation progress when a room asset save fails', async () => {
    try {
      await executeStandardRoomCreation({
        center: { x: 0, y: 0, z: 0 },
        createStaticAsset: async (asset) => {
          if (asset.metadata.presetRole === 'east-wall') {
            throw new Error('east wall failed')
          }

          return createSavedAsset(asset)
        },
        reload: async () => true,
        selectStaticAsset: () => true,
      })
      throw new Error('expected executeStandardRoomCreation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(StandardRoomCreationError)
      expect((error as StandardRoomCreationError).createdCount).toBe(2)
      expect((error as StandardRoomCreationError).focusAssetId).toBeNull()
      expect((error as StandardRoomCreationError).message).toBe('east wall failed')
    }
  })

  test('captures partial floor plan import progress when an asset save fails', async () => {
    try {
      await executeFloorPlanImport({
        detection: {
          imageWidth: 100,
          imageHeight: 50,
          walls: [
            {
              start: { x: 10, y: 20 },
              end: { x: 90, y: 20 },
              orientation: 'horizontal',
              length: 80,
              thickness: 4,
            },
          ],
          doors: [
            {
              type: 'door',
              position: { x: 50, y: 20 },
              span: 10,
              orientation: 'horizontal',
              bounds: { minX: 45, minY: 18, maxX: 55, maxY: 22 },
            },
          ],
          windows: [],
        },
        reference: {
          position: { x: 0, y: 0, z: 0 },
          scaleMeters: 10,
        },
        createStaticAsset: async (asset) => {
          if (asset.assetKind === 'door-system') {
            throw new Error('door import failed')
          }

          return createSavedAsset(asset, `${asset.assetKind}-saved`)
        },
        reload: async () => true,
        selectStaticAsset: () => true,
      })
      throw new Error('expected executeFloorPlanImport to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(FloorPlanImportError)
      expect((error as FloorPlanImportError).createdCount).toBe(1)
      expect((error as FloorPlanImportError).focusAssetId).toBe('wall-system-saved')
      expect((error as FloorPlanImportError).message).toBe('door import failed')
    }
  })

  test('undo restores routed vehicle metadata before a later save request', () => {
    useEditorDigitalTwinStore.getState().reset()
    const vehicle = createRoutedVehicleDraft()
    const store = useEditorDigitalTwinStore.getState()

    store.hydrateFromBootstrap(
      createBootstrapPayload(vehicle),
      DEFAULT_PUBLISHED_SCENE_PACKAGE
    )
    store.selectEntity(vehicle.id)
    store.beginTransformSession()
    store.updateDraftTransform({
      position: { x: 8, y: 1.5, z: 9 },
      rotation: { x: 0.2, y: 0.4, z: 0.1 },
      scale: { x: 1, y: 1, z: 1 },
    })
    store.commitTransformSession()
    store.undo()
    store.updateDraftProperties({ name: '叉车 01 / 已回退' })

    const state = useEditorDigitalTwinStore.getState()
    const request = createEditorSaveRequest({
      sceneVersion: state.sceneVersion,
      sceneConfig: state.sceneConfig,
      savedSceneConfig: state.savedSceneConfig,
      hasSceneChanges: state.hasSceneChanges,
      hasSelectionChanges: state.hasSelectionChanges,
      draftEntity: state.draftEntity,
      draftStaticAsset: state.draftStaticAsset,
      savedEntity: state.savedEntity,
      savedStaticAsset: state.savedStaticAsset,
      selectedEntityId: state.selectedEntityId,
      selectedStaticAssetId: state.selectedStaticAssetId,
    })

    const savedEntity = request?.entity?.entity
    expect(savedEntity?.type).toBe('vehicle')
    if (!savedEntity || savedEntity.type !== 'vehicle') {
      throw new Error('expected vehicle save request')
    }
    const savedVehicle = savedEntity as Extract<Entity, { type: 'vehicle' }>
    const sourceVehicle = vehicle as Extract<Entity, { type: 'vehicle' }>
    expect(savedVehicle.routeTrack).toEqual(sourceVehicle.routeTrack)
    expect(savedVehicle.trackPosition).toEqual(sourceVehicle.trackPosition)
  })
})
