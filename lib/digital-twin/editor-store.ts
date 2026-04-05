import { create } from 'zustand'
import type { BootstrapPayload } from './bootstrap-client'
import {
  cloneEntityDraft,
  cloneSceneDraft,
  cloneStaticAssetDraft,
} from './admin-view-models'
import { generateId } from './mock-data'
import { DEFAULT_PUBLISHED_SCENE_PACKAGE, type PublishedScenePackage } from './publish'
import { createStaticAssetTemplateFromCatalog } from './static-asset-catalog'
import type {
  CameraPreset,
  Entity,
  SceneConfig,
  StaticAssetInstance,
  Vector3,
  ViewMode,
} from './types'

export type EditorTransformMode = 'select' | 'translate' | 'rotate' | 'scale'
export type EditorSelectionKind = 'entity' | 'static-asset'
export type EditorViewportProjection = 'perspective' | 'orthographic'
export type EditorCameraDirection = 'north' | 'east' | 'south' | 'west' | 'top'

interface TransformSnapshot {
  position: Vector3
  rotation: Vector3
  scale: Vector3
}

interface CameraFocusRequest {
  position: Vector3
  target: Vector3
}

interface EditorSelectionMarquee {
  left: number
  top: number
  width: number
  height: number
}

type TransformableDraft = Entity | StaticAssetInstance
type TransformField = keyof TransformSnapshot
type EditableDraftPatch = Pick<TransformableDraft, 'name' | 'visible'>

interface EditorDigitalTwinState {
  publishedScenePackage: PublishedScenePackage
  sceneConfig: SceneConfig
  entities: Map<string, Entity>
  staticAssets: Map<string, StaticAssetInstance>
  selectedEntityId: string | null
  selectedStaticAssetId: string | null
  hoveredEntityId: string | null
  hoveredStaticAssetId: string | null
  placementCatalogId: string | null
  transformMode: EditorTransformMode
  viewMode: ViewMode
  viewportProjection: EditorViewportProjection
  cameraPresets: CameraPreset[]
  activeCameraPreset: string | null
  cameraFocusRequest: CameraFocusRequest | null
  snapEnabled: boolean
  translateSnap: number
  rotateSnapDegrees: number
  placementPreview: Vector3 | null
  draftEntity: Entity | null
  savedEntity: Entity | null
  draftStaticAsset: StaticAssetInstance | null
  savedStaticAsset: StaticAssetInstance | null
  transformSessionStart: TransformSnapshot | null
  history: TransformSnapshot[]
  redoHistory: TransformSnapshot[]
  isDirty: boolean
  isLoading: boolean
  isSaving: boolean
  isTransformDragging: boolean
  isMarqueeSelecting: boolean
  selectionMarquee: EditorSelectionMarquee | null
  error: string | null
}

interface EditorDigitalTwinActions {
  hydrateFromBootstrap: (
    payload: BootstrapPayload,
    publishedScenePackage: PublishedScenePackage
  ) => void
  setLoading: (loading: boolean) => void
  setSaving: (saving: boolean) => void
  setError: (error: string | null) => void
  selectEntity: (id: string | null) => void
  selectStaticAsset: (id: string | null) => void
  setHoveredEntity: (id: string | null) => void
  setHoveredStaticAsset: (id: string | null) => void
  armStaticAssetPlacement: (catalogId: string | null) => void
  placeStaticAsset: (position: Vector3) => StaticAssetInstance | null
  setTransformMode: (mode: EditorTransformMode) => void
  setViewMode: (mode: ViewMode) => void
  setViewportProjection: (projection: EditorViewportProjection) => void
  setSceneConfig: (config: Partial<SceneConfig>) => void
  focusCameraPreset: (presetId: string) => void
  focusCameraDirection: (direction: EditorCameraDirection) => void
  clearCameraFocusRequest: () => void
  setSnapEnabled: (enabled: boolean) => void
  setTranslateSnap: (value: number) => void
  setRotateSnapDegrees: (value: number) => void
  setPlacementPreview: (position: Vector3 | null) => void
  setTransformDragging: (dragging: boolean) => void
  setMarqueeSelecting: (selecting: boolean) => void
  setSelectionMarquee: (marquee: EditorSelectionMarquee | null) => void
  updateDraftProperties: (patch: Partial<EditableDraftPatch>) => void
  updateDraftField: (field: string, value: unknown) => void
  updateDraftMetadata: (patch: Record<string, unknown>) => void
  setDraftTransformField: (
    field: TransformField,
    axis: keyof Vector3,
    value: number
  ) => void
  beginTransformSession: () => void
  updateDraftTransform: (snapshot: TransformSnapshot) => void
  commitTransformSession: () => void
  duplicateSelection: () => Entity | StaticAssetInstance | null
  placeStaticAssetFromCatalog: (
    catalogId: string,
    position: Vector3
  ) => StaticAssetInstance | null
  undo: () => void
  redo: () => void
  resetDraft: () => void
  reset: () => void
}

export type EditorDigitalTwinStore = EditorDigitalTwinState & EditorDigitalTwinActions

export function isEditorEntityEditable(
  entity: Entity | null | undefined
): entity is Exclude<Entity, { type: 'zone' }> {
  return Boolean(entity && entity.type !== 'zone')
}

export function getEditorSelectionKind(
  state: Pick<EditorDigitalTwinState, 'selectedEntityId' | 'selectedStaticAssetId'>
): EditorSelectionKind | null {
  if (state.selectedStaticAssetId) return 'static-asset'
  if (state.selectedEntityId) return 'entity'
  return null
}

function cloneVector(value: Vector3): Vector3 {
  return { x: value.x, y: value.y, z: value.z }
}

function cloneCameraPreset(preset: CameraPreset): CameraPreset {
  return {
    ...preset,
    position: cloneVector(preset.position),
    target: cloneVector(preset.target),
  }
}

function cloneCameraPresets(presets: CameraPreset[]) {
  return presets.map(cloneCameraPreset)
}

function snapNumber(value: number, step: number) {
  return Math.round(value / step) * step
}

function createDirectionalFocusRequest(
  direction: EditorCameraDirection,
  sceneConfig: SceneConfig
): CameraFocusRequest {
  const target = cloneVector(sceneConfig.cameraTarget)
  const deltaX = sceneConfig.cameraPosition.x - target.x
  const deltaY = sceneConfig.cameraPosition.y - target.y
  const deltaZ = sceneConfig.cameraPosition.z - target.z
  const horizontalRadius = Math.max(48, Math.hypot(deltaX, deltaZ))
  const orbitHeight = Math.max(24, Math.abs(deltaY))

  switch (direction) {
    case 'north':
      return {
        position: { x: target.x, y: target.y + orbitHeight, z: target.z - horizontalRadius },
        target,
      }
    case 'east':
      return {
        position: { x: target.x + horizontalRadius, y: target.y + orbitHeight, z: target.z },
        target,
      }
    case 'south':
      return {
        position: { x: target.x, y: target.y + orbitHeight, z: target.z + horizontalRadius },
        target,
      }
    case 'west':
      return {
        position: { x: target.x - horizontalRadius, y: target.y + orbitHeight, z: target.z },
        target,
      }
    case 'top':
      return {
        position: {
          x: target.x,
          y: target.y + Math.max(horizontalRadius * 1.15, 96),
          z: target.z,
        },
        target,
      }
  }
}

function createTransformSnapshot(value: TransformableDraft): TransformSnapshot {
  return {
    position: cloneVector(value.position),
    rotation: cloneVector(value.rotation),
    scale: cloneVector(value.scale),
  }
}

function applyTransformSnapshot<T extends TransformableDraft>(
  value: T,
  snapshot: TransformSnapshot
): T {
  return {
    ...value,
    position: cloneVector(snapshot.position),
    rotation: cloneVector(snapshot.rotation),
    scale: cloneVector(snapshot.scale),
    updatedAt: Date.now(),
  }
}

function areVectorsEqual(left: Vector3, right: Vector3) {
  return left.x === right.x && left.y === right.y && left.z === right.z
}

function hasSnapshotChanged(left: TransformSnapshot, right: TransformSnapshot) {
  return (
    !areVectorsEqual(left.position, right.position) ||
    !areVectorsEqual(left.rotation, right.rotation) ||
    !areVectorsEqual(left.scale, right.scale)
  )
}

function hasEditableDraftChanged(
  current: TransformableDraft | null,
  saved: TransformableDraft | null
) {
  if (!current || !saved) return Boolean(current && !saved)
  return (
    current.name !== saved.name ||
    current.visible !== saved.visible ||
    JSON.stringify(current.metadata ?? {}) !== JSON.stringify(saved.metadata ?? {}) ||
    hasSnapshotChanged(createTransformSnapshot(current), createTransformSnapshot(saved))
  )
}

function getActiveDraft(state: EditorDigitalTwinState): TransformableDraft | null {
  return state.draftStaticAsset ?? state.draftEntity
}

function getActiveSaved(state: EditorDigitalTwinState): TransformableDraft | null {
  return state.savedStaticAsset ?? state.savedEntity
}

function createDraftPatch(
  state: EditorDigitalTwinState,
  draft: TransformableDraft
) {
  return state.draftStaticAsset
    ? { draftStaticAsset: draft as StaticAssetInstance }
    : { draftEntity: draft as Entity }
}

function clearSelectionState() {
  return {
    placementCatalogId: null,
    placementPreview: null,
    selectedEntityId: null,
    selectedStaticAssetId: null,
    draftEntity: null,
    savedEntity: null,
    draftStaticAsset: null,
    savedStaticAsset: null,
    transformSessionStart: null,
    selectionMarquee: null as EditorSelectionMarquee | null,
    isMarqueeSelecting: false,
    history: [] as TransformSnapshot[],
    redoHistory: [] as TransformSnapshot[],
    isDirty: false,
  }
}

function cloneEditableEntitySelection(entity: Entity | null) {
  if (!isEditorEntityEditable(entity)) return null
  return cloneEntityDraft(entity)
}

const defaultPublishedScenePackage = DEFAULT_PUBLISHED_SCENE_PACKAGE
const defaultCameraPresets = cloneCameraPresets(defaultPublishedScenePackage.cameraPresets)
const DEFAULT_TRANSLATE_SNAP = 1
const DEFAULT_ROTATE_SNAP_DEGREES = 15

const initialState: EditorDigitalTwinState = {
  publishedScenePackage: defaultPublishedScenePackage,
  sceneConfig: cloneSceneDraft(defaultPublishedScenePackage.sceneConfig),
  entities: new Map(),
  staticAssets: new Map(),
  selectedEntityId: null,
  selectedStaticAssetId: null,
  hoveredEntityId: null,
  hoveredStaticAssetId: null,
  placementCatalogId: null,
  transformMode: 'select',
  viewMode: 'orbit',
  viewportProjection: 'perspective',
  cameraPresets: defaultCameraPresets,
  activeCameraPreset: defaultCameraPresets[0]?.id ?? null,
  cameraFocusRequest: null,
  snapEnabled: false,
  translateSnap: DEFAULT_TRANSLATE_SNAP,
  rotateSnapDegrees: DEFAULT_ROTATE_SNAP_DEGREES,
  placementPreview: null,
  draftEntity: null,
  savedEntity: null,
  draftStaticAsset: null,
  savedStaticAsset: null,
  transformSessionStart: null,
  history: [],
  redoHistory: [],
  isDirty: false,
  isLoading: true,
  isSaving: false,
  isTransformDragging: false,
  isMarqueeSelecting: false,
  selectionMarquee: null,
  error: null,
}

export const useEditorDigitalTwinStore = create<EditorDigitalTwinStore>((set, get) => ({
  ...initialState,

  hydrateFromBootstrap: (payload, publishedScenePackage) =>
    set((state) => {
      const entities = new Map(payload.entities.map((entity) => [entity.id, entity]))
      const staticAssets = new Map(payload.staticAssets.map((asset) => [asset.id, asset]))
      const cameraPresets = cloneCameraPresets(publishedScenePackage.cameraPresets)
      const selectedStaticAsset =
        state.selectedStaticAssetId === null
          ? null
          : staticAssets.get(state.selectedStaticAssetId) ?? null
      const selectedEntity =
        state.selectedEntityId === null ? null : entities.get(state.selectedEntityId) ?? null

      if (selectedStaticAsset) {
        return {
          publishedScenePackage,
          sceneConfig: cloneSceneDraft(payload.sceneConfig),
          cameraPresets,
          activeCameraPreset: cameraPresets.some(
            (preset) => preset.id === state.activeCameraPreset
          )
            ? state.activeCameraPreset
            : cameraPresets[0]?.id ?? null,
          cameraFocusRequest: null,
          entities,
          staticAssets,
          selectedEntityId: null,
          selectedStaticAssetId: selectedStaticAsset.id,
          hoveredEntityId:
            state.hoveredEntityId && entities.has(state.hoveredEntityId)
              ? state.hoveredEntityId
              : null,
          hoveredStaticAssetId:
            state.hoveredStaticAssetId && staticAssets.has(state.hoveredStaticAssetId)
              ? state.hoveredStaticAssetId
              : null,
          draftEntity: null,
          savedEntity: null,
          draftStaticAsset: cloneStaticAssetDraft(selectedStaticAsset),
          savedStaticAsset: cloneStaticAssetDraft(selectedStaticAsset),
          transformSessionStart: null,
          history: [],
          redoHistory: [],
          placementPreview: null,
          isDirty: false,
        }
      }

      const editableSelection = cloneEditableEntitySelection(selectedEntity)

      return {
        publishedScenePackage,
        sceneConfig: cloneSceneDraft(payload.sceneConfig),
        cameraPresets,
        activeCameraPreset: cameraPresets.some(
          (preset) => preset.id === state.activeCameraPreset
        )
          ? state.activeCameraPreset
          : cameraPresets[0]?.id ?? null,
        cameraFocusRequest: null,
        entities,
        staticAssets,
        selectedEntityId: editableSelection?.id ?? null,
        selectedStaticAssetId: null,
        hoveredEntityId:
          state.hoveredEntityId && entities.has(state.hoveredEntityId)
            ? state.hoveredEntityId
            : null,
        hoveredStaticAssetId:
          state.hoveredStaticAssetId && staticAssets.has(state.hoveredStaticAssetId)
            ? state.hoveredStaticAssetId
            : null,
        draftEntity: editableSelection,
        savedEntity: editableSelection ? cloneEntityDraft(editableSelection) : null,
        draftStaticAsset: null,
        savedStaticAsset: null,
        transformSessionStart: null,
        history: [],
        redoHistory: [],
        placementPreview: null,
        isDirty: false,
      }
    }),

  setLoading: (loading) => set({ isLoading: loading }),
  setSaving: (saving) => set({ isSaving: saving }),
  setError: (error) => set({ error }),

  selectEntity: (id) =>
    set((state) => {
      if (!id) {
        return clearSelectionState()
      }

      const entity = state.entities.get(id) ?? null
      const draftEntity = cloneEditableEntitySelection(entity)
      if (!draftEntity) {
        return clearSelectionState()
      }

      return {
        placementCatalogId: null,
        selectedEntityId: id,
        selectedStaticAssetId: null,
        draftEntity,
        savedEntity: cloneEntityDraft(draftEntity),
        draftStaticAsset: null,
        savedStaticAsset: null,
        transformSessionStart: null,
        history: [],
        redoHistory: [],
        placementPreview: null,
        isDirty: false,
      }
    }),

  selectStaticAsset: (id) =>
    set((state) => {
      if (!id) {
        return clearSelectionState()
      }

      const staticAsset =
        state.staticAssets.get(id) ??
        (state.draftStaticAsset &&
        !state.savedStaticAsset &&
        state.draftStaticAsset.id === id
          ? state.draftStaticAsset
          : null)
      if (!staticAsset) {
        return clearSelectionState()
      }

      return {
        placementCatalogId: null,
        selectedEntityId: null,
        selectedStaticAssetId: id,
        draftEntity: null,
        savedEntity: null,
        draftStaticAsset: cloneStaticAssetDraft(staticAsset),
        savedStaticAsset: state.staticAssets.has(id)
          ? cloneStaticAssetDraft(staticAsset)
          : null,
        transformSessionStart: null,
        history: [],
        redoHistory: [],
        placementPreview: null,
        isDirty: !state.staticAssets.has(id),
      }
    }),

  setHoveredEntity: (id) => set({ hoveredEntityId: id }),
  setHoveredStaticAsset: (id) => set({ hoveredStaticAssetId: id }),

  armStaticAssetPlacement: (catalogId) =>
    set({
      placementCatalogId: catalogId,
      placementPreview: null,
    }),

  placeStaticAsset: (position) => {
    const { placementCatalogId } = get()
    if (!placementCatalogId) return null

    return get().placeStaticAssetFromCatalog(placementCatalogId, position)
  },

  placeStaticAssetFromCatalog: (catalogId, position) => {
    const draftStaticAsset = createStaticAssetTemplateFromCatalog(catalogId, position)
    set({
      placementCatalogId: null,
      selectedEntityId: null,
      selectedStaticAssetId: draftStaticAsset.id,
      draftEntity: null,
      savedEntity: null,
      draftStaticAsset,
      savedStaticAsset: null,
      transformSessionStart: null,
      history: [],
      redoHistory: [],
      placementPreview: null,
      transformMode: 'translate',
      isDirty: true,
    })

    return draftStaticAsset
  },

  setTransformMode: (mode) => set({ transformMode: mode }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setViewportProjection: (viewportProjection) => set({ viewportProjection }),
  setSceneConfig: (config) =>
    set((state) => ({
      sceneConfig: {
        ...state.sceneConfig,
        ...config,
      },
      activeCameraPreset:
        'cameraPosition' in config || 'cameraTarget' in config
          ? null
          : state.activeCameraPreset,
    })),
  focusCameraPreset: (presetId) =>
    set((state) => {
      const preset = state.cameraPresets.find((candidate) => candidate.id === presetId)
      if (!preset) return state

      return {
        activeCameraPreset: preset.id,
        cameraFocusRequest: {
          position: cloneVector(preset.position),
          target: cloneVector(preset.target),
        },
        sceneConfig: {
          ...state.sceneConfig,
          cameraPosition: cloneVector(preset.position),
          cameraTarget: cloneVector(preset.target),
        },
      }
    }),
  focusCameraDirection: (direction) =>
    set((state) => {
      const focusRequest = createDirectionalFocusRequest(direction, state.sceneConfig)

      return {
        activeCameraPreset: null,
        cameraFocusRequest: focusRequest,
        sceneConfig: {
          ...state.sceneConfig,
          cameraPosition: cloneVector(focusRequest.position),
          cameraTarget: cloneVector(focusRequest.target),
        },
        viewMode: direction === 'top' ? 'topdown' : 'orbit',
      }
    }),
  clearCameraFocusRequest: () => set({ cameraFocusRequest: null }),
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
  setTranslateSnap: (translateSnap) =>
    set({ translateSnap: Math.max(0.1, translateSnap) }),
  setRotateSnapDegrees: (rotateSnapDegrees) =>
    set({ rotateSnapDegrees: Math.max(1, rotateSnapDegrees) }),
  setPlacementPreview: (placementPreview) => set({ placementPreview }),
  setTransformDragging: (dragging) => set({ isTransformDragging: dragging }),
  setMarqueeSelecting: (isMarqueeSelecting) => set({ isMarqueeSelecting }),
  setSelectionMarquee: (selectionMarquee) => set({ selectionMarquee }),

  updateDraftProperties: (patch) =>
    set((state) => {
      const draft = getActiveDraft(state)
      if (!draft) return state

      const nextDraft = {
        ...draft,
        ...patch,
        updatedAt: Date.now(),
      }

      if (
        nextDraft.name === draft.name &&
        nextDraft.visible === draft.visible
      ) {
        return state
      }

      return {
        ...createDraftPatch(state, nextDraft),
        isDirty: hasEditableDraftChanged(nextDraft, getActiveSaved(state)),
      }
    }),

  updateDraftField: (field, value) =>
    set((state) => {
      const draft = getActiveDraft(state)
      if (!draft) return state

      const currentValue = (draft as unknown as Record<string, unknown>)[field]
      if (currentValue === value) {
        return state
      }

      const nextDraft = {
        ...draft,
        [field]: value,
        updatedAt: Date.now(),
      } as TransformableDraft

      return {
        ...createDraftPatch(state, nextDraft),
        isDirty: hasEditableDraftChanged(nextDraft, getActiveSaved(state)),
      }
    }),

  updateDraftMetadata: (patch) =>
    set((state) => {
      const draft = getActiveDraft(state)
      if (!draft) return state

      const nextDraft = {
        ...draft,
        metadata: {
          ...draft.metadata,
          ...patch,
        },
        updatedAt: Date.now(),
      }

      return {
        ...createDraftPatch(state, nextDraft),
        isDirty: hasEditableDraftChanged(nextDraft, getActiveSaved(state)),
      }
    }),

  setDraftTransformField: (field, axis, value) =>
    set((state) => {
      const draft = getActiveDraft(state)
      if (!draft || draft[field][axis] === value) return state

      const previousSnapshot = createTransformSnapshot(draft)
      const nextSnapshot = createTransformSnapshot(draft)
      nextSnapshot[field] = {
        ...nextSnapshot[field],
        [axis]: value,
      }

      const nextDraft = applyTransformSnapshot(draft, nextSnapshot)

      return {
        ...createDraftPatch(state, nextDraft),
        history: [...state.history, previousSnapshot],
        redoHistory: [],
        transformSessionStart: null,
        isDirty: hasEditableDraftChanged(nextDraft, getActiveSaved(state)),
      }
    }),

  beginTransformSession: () =>
    set((state) => ({
      transformSessionStart: getActiveDraft(state)
        ? createTransformSnapshot(getActiveDraft(state)!)
        : null,
    })),

  updateDraftTransform: (snapshot) =>
    set((state) => {
      if (state.draftStaticAsset) {
        const draftStaticAsset = applyTransformSnapshot(state.draftStaticAsset, snapshot)
        return {
          draftStaticAsset,
          isDirty: hasEditableDraftChanged(draftStaticAsset, state.savedStaticAsset),
        }
      }

      if (!state.draftEntity) return state
      const draftEntity = applyTransformSnapshot(state.draftEntity, snapshot)
      return {
        draftEntity,
        isDirty: hasEditableDraftChanged(draftEntity, state.savedEntity),
      }
    }),

  commitTransformSession: () =>
    set((state) => {
      const draft = getActiveDraft(state)
      if (!draft || !state.transformSessionStart) {
        return { transformSessionStart: null }
      }

      const currentSnapshot = createTransformSnapshot(draft)
      const changed = hasSnapshotChanged(currentSnapshot, state.transformSessionStart)

      return {
        transformSessionStart: null,
        history: changed
          ? [...state.history, state.transformSessionStart]
          : state.history,
        redoHistory: changed ? [] : state.redoHistory,
        isDirty: hasEditableDraftChanged(draft, getActiveSaved(state)),
      }
    }),

  duplicateSelection: () => {
    const state = get()
    const now = Date.now()
    const offset = state.snapEnabled ? state.translateSnap : 4
    if (state.draftStaticAsset ?? state.savedStaticAsset) {
      const source = state.draftStaticAsset ?? state.savedStaticAsset
      if (!source) return null

      const duplicate = cloneStaticAssetDraft(source)
      duplicate.id = `static-asset-${generateId()}`
      duplicate.name = source.name.endsWith('副本') ? source.name : `${source.name} 副本`
      duplicate.position = {
        x: snapNumber(source.position.x + offset, Math.max(0.1, state.translateSnap)),
        y: source.position.y,
        z: snapNumber(source.position.z + offset, Math.max(0.1, state.translateSnap)),
      }
      duplicate.createdAt = now
      duplicate.updatedAt = now

      set({
        placementCatalogId: null,
        placementPreview: null,
        selectedEntityId: null,
        selectedStaticAssetId: duplicate.id,
        draftEntity: null,
        savedEntity: null,
        draftStaticAsset: duplicate,
        savedStaticAsset: null,
        transformSessionStart: null,
        history: [],
        redoHistory: [],
        transformMode: 'translate',
        isDirty: true,
      })

      return duplicate
    }

    const source = state.draftEntity ?? state.savedEntity
    if (!source) return null

    const duplicate = cloneEntityDraft(source)
    duplicate.id = `entity-${generateId()}`
    duplicate.name = source.name.endsWith('副本') ? source.name : `${source.name} 副本`
    duplicate.position = {
      x: snapNumber(source.position.x + offset, Math.max(0.1, state.translateSnap)),
      y: source.position.y,
      z: snapNumber(source.position.z + offset, Math.max(0.1, state.translateSnap)),
    }
    duplicate.createdAt = now
    duplicate.updatedAt = now

    set({
      placementCatalogId: null,
      placementPreview: null,
      selectedEntityId: duplicate.id,
      selectedStaticAssetId: null,
      draftEntity: duplicate,
      savedEntity: null,
      draftStaticAsset: null,
      savedStaticAsset: null,
      transformSessionStart: null,
      history: [],
      redoHistory: [],
      transformMode: 'translate',
      isDirty: true,
    })

    return duplicate
  },

  undo: () =>
    set((state) => {
      const draft = getActiveDraft(state)
      if (!draft || state.history.length === 0) return state

      const previous = state.history[state.history.length - 1]
      const nextDraft = applyTransformSnapshot(draft, previous)
      const nextPatch = state.draftStaticAsset
        ? { draftStaticAsset: nextDraft as StaticAssetInstance }
        : { draftEntity: nextDraft as Entity }

      return {
        ...nextPatch,
        history: state.history.slice(0, -1),
        redoHistory: [...state.redoHistory, createTransformSnapshot(draft)],
        transformSessionStart: null,
        isDirty: hasEditableDraftChanged(nextDraft, getActiveSaved(state)),
      }
    }),

  redo: () =>
    set((state) => {
      const draft = getActiveDraft(state)
      if (!draft || state.redoHistory.length === 0) return state

      const nextSnapshot = state.redoHistory[state.redoHistory.length - 1]
      const nextDraft = applyTransformSnapshot(draft, nextSnapshot)
      const nextPatch = state.draftStaticAsset
        ? { draftStaticAsset: nextDraft as StaticAssetInstance }
        : { draftEntity: nextDraft as Entity }

      return {
        ...nextPatch,
        history: [...state.history, createTransformSnapshot(draft)],
        redoHistory: state.redoHistory.slice(0, -1),
        transformSessionStart: null,
        isDirty: hasEditableDraftChanged(nextDraft, getActiveSaved(state)),
      }
    }),

  resetDraft: () =>
    set((state) => {
      if (state.savedStaticAsset) {
        return {
          draftStaticAsset: cloneStaticAssetDraft(state.savedStaticAsset),
          placementPreview: null,
          transformSessionStart: null,
          history: [],
          redoHistory: [],
          isDirty: false,
        }
      }

      if (state.draftStaticAsset && !state.savedStaticAsset) {
        return {
          ...clearSelectionState(),
          placementPreview: null,
          hoveredStaticAssetId: state.hoveredStaticAssetId,
          hoveredEntityId: state.hoveredEntityId,
        }
      }

      if (!state.savedEntity) return state
      return {
        draftEntity: cloneEntityDraft(state.savedEntity),
        placementPreview: null,
        transformSessionStart: null,
        history: [],
        redoHistory: [],
        isDirty: false,
      }
    }),

  reset: () => set(initialState),
}))
