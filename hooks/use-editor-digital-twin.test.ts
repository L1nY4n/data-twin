import { describe, expect, test } from 'bun:test'
import type { Entity, SceneConfig, StaticAssetInstance } from '@/lib/digital-twin/types'
import {
  createEditorSceneSavePayload,
  createEditorSaveRequest,
  restoreSelectionAfterReload,
  StandardRoomCreationError,
  executeStandardRoomCreation,
} from './use-editor-digital-twin'

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
    expect(request?.sceneConfig).toEqual({
      ...nextSceneConfig,
      cameraPosition: savedSceneConfig.cameraPosition,
      cameraTarget: savedSceneConfig.cameraTarget,
    })
    expect(request?.entity?.mode).toBe('update')
    expect(request?.entity?.entity.id).toBe('entity-1')
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
})
