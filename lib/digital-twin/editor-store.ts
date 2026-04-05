import { create } from 'zustand'
import type { BootstrapPayload } from './bootstrap-client'
import {
  cloneEntityDraft,
  cloneSceneDraft,
  cloneStaticAssetDraft,
} from './admin-view-models'
import { DEFAULT_PUBLISHED_SCENE_PACKAGE, type PublishedScenePackage } from './publish'
import { createStaticAssetTemplateFromCatalog } from './static-asset-catalog'
import type { Entity, SceneConfig, StaticAssetInstance, Vector3 } from './types'

export type EditorTransformMode = 'translate' | 'rotate'
export type EditorSelectionKind = 'entity' | 'static-asset'

interface TransformSnapshot {
  position: Vector3
  rotation: Vector3
  scale: Vector3
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
  setTransformDragging: (dragging: boolean) => void
  updateDraftProperties: (patch: Partial<EditableDraftPatch>) => void
  setDraftTransformField: (
    field: TransformField,
    axis: keyof Vector3,
    value: number
  ) => void
  beginTransformSession: () => void
  updateDraftTransform: (snapshot: TransformSnapshot) => void
  commitTransformSession: () => void
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
    selectedEntityId: null,
    selectedStaticAssetId: null,
    draftEntity: null,
    savedEntity: null,
    draftStaticAsset: null,
    savedStaticAsset: null,
    transformSessionStart: null,
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
  transformMode: 'translate',
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
  error: null,
}

export const useEditorDigitalTwinStore = create<EditorDigitalTwinStore>((set, get) => ({
  ...initialState,

  hydrateFromBootstrap: (payload, publishedScenePackage) =>
    set((state) => {
      const entities = new Map(payload.entities.map((entity) => [entity.id, entity]))
      const staticAssets = new Map(payload.staticAssets.map((asset) => [asset.id, asset]))
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
          isDirty: false,
        }
      }

      const editableSelection = cloneEditableEntitySelection(selectedEntity)

      return {
        publishedScenePackage,
        sceneConfig: cloneSceneDraft(payload.sceneConfig),
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
        isDirty: !state.staticAssets.has(id),
      }
    }),

  setHoveredEntity: (id) => set({ hoveredEntityId: id }),
  setHoveredStaticAsset: (id) => set({ hoveredStaticAssetId: id }),

  armStaticAssetPlacement: (catalogId) => set({ placementCatalogId: catalogId }),

  placeStaticAsset: (position) => {
    const { placementCatalogId } = get()
    if (!placementCatalogId) return null

    const draftStaticAsset = createStaticAssetTemplateFromCatalog(placementCatalogId, position)
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
      isDirty: true,
    })

    return draftStaticAsset
  },

  setTransformMode: (mode) => set({ transformMode: mode }),
  setTransformDragging: (dragging) => set({ isTransformDragging: dragging }),

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
          transformSessionStart: null,
          history: [],
          redoHistory: [],
          isDirty: false,
        }
      }

      if (state.draftStaticAsset && !state.savedStaticAsset) {
        return {
          ...clearSelectionState(),
          hoveredStaticAssetId: state.hoveredStaticAssetId,
          hoveredEntityId: state.hoveredEntityId,
        }
      }

      if (!state.savedEntity) return state
      return {
        draftEntity: cloneEntityDraft(state.savedEntity),
        transformSessionStart: null,
        history: [],
        redoHistory: [],
        isDirty: false,
      }
    }),

  reset: () => set(initialState),
}))
