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
  StaticAssetPlacement,
  StaticAssetPlacementPreview,
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

export interface EditorFloorPlanReference {
  src: string
  label: string
  position: Vector3
  scaleMeters: number
  opacity: number
  visible: boolean
}

interface HydrateEditorOptions {
  preserveEditorCameraPose?: boolean
}

type TransformableDraft = Entity | StaticAssetInstance
type TransformField = keyof TransformSnapshot
type EditableDraftPatch = Pick<TransformableDraft, 'name' | 'visible'>

interface EditorDigitalTwinState {
  publishedScenePackage: PublishedScenePackage
  sceneVersion: number
  sceneConfig: SceneConfig
  savedSceneConfig: SceneConfig
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
  editorCameraPosition: Vector3
  editorCameraTarget: Vector3
  cameraFocusRequest: CameraFocusRequest | null
  snapEnabled: boolean
  translateSnap: number
  rotateSnapDegrees: number
  floorPlanReference: EditorFloorPlanReference | null
  placementPreview: StaticAssetPlacementPreview | null
  transformPreview: TransformSnapshot | null
  draftEntity: Entity | null
  savedEntity: Entity | null
  draftStaticAsset: StaticAssetInstance | null
  savedStaticAsset: StaticAssetInstance | null
  transformSessionStart: TransformSnapshot | null
  history: TransformSnapshot[]
  redoHistory: TransformSnapshot[]
  hasSceneChanges: boolean
  hasSelectionChanges: boolean
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
    publishedScenePackage: PublishedScenePackage,
    options?: HydrateEditorOptions
  ) => void
  setLoading: (loading: boolean) => void
  setSaving: (saving: boolean) => void
  setError: (error: string | null) => void
  selectEntity: (id: string | null) => void
  selectStaticAsset: (id: string | null) => void
  setHoveredEntity: (id: string | null) => void
  setHoveredStaticAsset: (id: string | null) => void
  armStaticAssetPlacement: (catalogId: string | null) => void
  placeStaticAsset: (placement: StaticAssetPlacement) => StaticAssetInstance | null
  setTransformMode: (mode: EditorTransformMode) => void
  setViewMode: (mode: ViewMode) => void
  setViewportProjection: (projection: EditorViewportProjection) => void
  setSceneConfig: (config: Partial<SceneConfig>) => void
  setEditorCameraPose: (position: Vector3, target: Vector3) => void
  focusCameraPreset: (presetId: string) => void
  focusCameraDirection: (direction: EditorCameraDirection) => void
  clearCameraFocusRequest: () => void
  setSnapEnabled: (enabled: boolean) => void
  setTranslateSnap: (value: number) => void
  setRotateSnapDegrees: (value: number) => void
  setFloorPlanReference: (reference: EditorFloorPlanReference | null) => void
  updateFloorPlanReference: (patch: Partial<EditorFloorPlanReference>) => void
  setPlacementPreview: (placement: StaticAssetPlacementPreview | null) => void
  setTransformPreview: (preview: TransformSnapshot | null) => void
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
    placement: StaticAssetPlacement
  ) => StaticAssetInstance | null
  undo: () => void
  redo: () => void
  resetDraft: () => void
  reset: () => void
}

export type EditorDigitalTwinStore = EditorDigitalTwinState & EditorDigitalTwinActions

export type EditorSceneStoreSlice = Pick<
  EditorDigitalTwinStore,
  | 'publishedScenePackage'
  | 'sceneVersion'
  | 'sceneConfig'
  | 'savedSceneConfig'
  | 'entities'
  | 'staticAssets'
  | 'draftEntity'
  | 'savedEntity'
  | 'draftStaticAsset'
  | 'savedStaticAsset'
  | 'transformSessionStart'
  | 'history'
  | 'redoHistory'
  | 'hasSceneChanges'
  | 'hasSelectionChanges'
  | 'isDirty'
  | 'hydrateFromBootstrap'
  | 'setSceneConfig'
  | 'updateDraftProperties'
  | 'updateDraftField'
  | 'updateDraftMetadata'
  | 'setDraftTransformField'
  | 'beginTransformSession'
  | 'updateDraftTransform'
  | 'commitTransformSession'
  | 'duplicateSelection'
  | 'placeStaticAsset'
  | 'placeStaticAssetFromCatalog'
  | 'undo'
  | 'redo'
  | 'resetDraft'
  | 'reset'
>

export type EditorViewerStoreSlice = Pick<
  EditorDigitalTwinStore,
  | 'selectedEntityId'
  | 'selectedStaticAssetId'
  | 'hoveredEntityId'
  | 'hoveredStaticAssetId'
  | 'viewMode'
  | 'viewportProjection'
  | 'cameraPresets'
  | 'activeCameraPreset'
  | 'editorCameraPosition'
  | 'editorCameraTarget'
  | 'cameraFocusRequest'
  | 'selectEntity'
  | 'selectStaticAsset'
  | 'setHoveredEntity'
  | 'setHoveredStaticAsset'
  | 'setViewMode'
  | 'setViewportProjection'
  | 'setEditorCameraPose'
  | 'focusCameraPreset'
  | 'focusCameraDirection'
  | 'clearCameraFocusRequest'
>

export type EditorUiStoreSlice = Pick<
  EditorDigitalTwinStore,
  | 'placementCatalogId'
  | 'transformMode'
  | 'snapEnabled'
  | 'translateSnap'
  | 'rotateSnapDegrees'
  | 'floorPlanReference'
  | 'placementPreview'
  | 'transformPreview'
  | 'isLoading'
  | 'isSaving'
  | 'isTransformDragging'
  | 'isMarqueeSelecting'
  | 'selectionMarquee'
  | 'error'
  | 'setLoading'
  | 'setSaving'
  | 'setError'
  | 'armStaticAssetPlacement'
  | 'setTransformMode'
  | 'setSnapEnabled'
  | 'setTranslateSnap'
  | 'setRotateSnapDegrees'
  | 'setFloorPlanReference'
  | 'updateFloorPlanReference'
  | 'setPlacementPreview'
  | 'setTransformPreview'
  | 'setTransformDragging'
  | 'setMarqueeSelecting'
  | 'setSelectionMarquee'
>

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

export function hasEditorSceneConfigChanged(current: SceneConfig, saved: SceneConfig) {
  return (
    current.id !== saved.id ||
    current.name !== saved.name ||
    current.gridSize !== saved.gridSize ||
    current.gridDivisions !== saved.gridDivisions ||
    current.backgroundColor !== saved.backgroundColor ||
    current.ambientLightIntensity !== saved.ambientLightIntensity ||
    current.showAxes !== saved.showAxes ||
    current.showGrid !== saved.showGrid
  )
}

export function buildEditorSceneSavePayload(current: SceneConfig, saved: SceneConfig): SceneConfig {
  return {
    ...current,
    cameraPosition: cloneVector(saved.cameraPosition),
    cameraTarget: cloneVector(saved.cameraTarget),
  }
}

function createEditorDirtyState(sceneDirty: boolean, selectionDirty: boolean) {
  return {
    hasSceneChanges: sceneDirty,
    hasSelectionChanges: selectionDirty,
    isDirty: sceneDirty || selectionDirty,
  }
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

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function createDirectionalFocusRequest(
  direction: EditorCameraDirection,
  cameraPosition: Vector3,
  cameraTarget: Vector3,
  targetOverride?: Vector3
): CameraFocusRequest {
  const target = cloneVector(targetOverride ?? cameraTarget)
  const deltaX = cameraPosition.x - target.x
  const deltaY = cameraPosition.y - target.y
  const deltaZ = cameraPosition.z - target.z
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

function cloneTransformSnapshot(snapshot: TransformSnapshot): TransformSnapshot {
  return {
    position: cloneVector(snapshot.position),
    rotation: cloneVector(snapshot.rotation),
    scale: cloneVector(snapshot.scale),
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

function getDirectionalFocusTarget(state: EditorDigitalTwinState): Vector3 {
  const activeDraft = getActiveDraft(state)
  if (activeDraft) {
    return cloneVector(activeDraft.position)
  }

  return cloneVector(state.editorCameraTarget)
}

function createDraftPatch(
  state: EditorDigitalTwinState,
  draft: TransformableDraft
) {
  return state.draftStaticAsset
    ? { draftStaticAsset: draft as StaticAssetInstance }
    : { draftEntity: draft as Entity }
}

function clearSelectionState(sceneDirty = false) {
  return {
    placementCatalogId: null,
    placementPreview: null,
    transformPreview: null,
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
    ...createEditorDirtyState(sceneDirty, false),
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
  sceneVersion: 1,
  sceneConfig: cloneSceneDraft(defaultPublishedScenePackage.sceneConfig),
  savedSceneConfig: cloneSceneDraft(defaultPublishedScenePackage.sceneConfig),
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
  editorCameraPosition: cloneVector(defaultPublishedScenePackage.sceneConfig.cameraPosition),
  editorCameraTarget: cloneVector(defaultPublishedScenePackage.sceneConfig.cameraTarget),
  cameraFocusRequest: null,
  snapEnabled: false,
  translateSnap: DEFAULT_TRANSLATE_SNAP,
  rotateSnapDegrees: DEFAULT_ROTATE_SNAP_DEGREES,
  floorPlanReference: null,
  placementPreview: null,
  transformPreview: null,
  draftEntity: null,
  savedEntity: null,
  draftStaticAsset: null,
  savedStaticAsset: null,
  transformSessionStart: null,
  history: [],
  redoHistory: [],
  hasSceneChanges: false,
  hasSelectionChanges: false,
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

  hydrateFromBootstrap: (payload, publishedScenePackage, options) =>
    set((state) => {
      const entities = new Map(payload.entities.map((entity) => [entity.id, entity]))
      const staticAssets = new Map(payload.staticAssets.map((asset) => [asset.id, asset]))
      const cameraPresets = cloneCameraPresets(publishedScenePackage.cameraPresets)
      const editorCameraPosition = options?.preserveEditorCameraPose
        ? cloneVector(state.editorCameraPosition)
        : cloneVector(payload.sceneConfig.cameraPosition)
      const editorCameraTarget = options?.preserveEditorCameraPose
        ? cloneVector(state.editorCameraTarget)
        : cloneVector(payload.sceneConfig.cameraTarget)
      const selectedStaticAsset =
        state.selectedStaticAssetId === null
          ? null
          : staticAssets.get(state.selectedStaticAssetId) ?? null
      const selectedEntity =
        state.selectedEntityId === null ? null : entities.get(state.selectedEntityId) ?? null

      if (selectedStaticAsset) {
        return {
          publishedScenePackage,
          sceneVersion: payload.sceneVersion,
          sceneConfig: cloneSceneDraft(payload.sceneConfig),
          savedSceneConfig: cloneSceneDraft(payload.sceneConfig),
          cameraPresets,
          activeCameraPreset: cameraPresets.some(
            (preset) => preset.id === state.activeCameraPreset
          )
            ? state.activeCameraPreset
            : cameraPresets[0]?.id ?? null,
          editorCameraPosition,
          editorCameraTarget,
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
          floorPlanReference: null,
          transformPreview: null,
          transformSessionStart: null,
          history: [],
          redoHistory: [],
          placementPreview: null,
          ...createEditorDirtyState(false, false),
        }
      }

      const editableSelection = cloneEditableEntitySelection(selectedEntity)

      return {
        publishedScenePackage,
        sceneVersion: payload.sceneVersion,
        sceneConfig: cloneSceneDraft(payload.sceneConfig),
        savedSceneConfig: cloneSceneDraft(payload.sceneConfig),
        cameraPresets,
        activeCameraPreset: cameraPresets.some(
          (preset) => preset.id === state.activeCameraPreset
        )
          ? state.activeCameraPreset
          : cameraPresets[0]?.id ?? null,
        editorCameraPosition,
        editorCameraTarget,
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
        floorPlanReference: null,
        transformPreview: null,
        transformSessionStart: null,
        history: [],
        redoHistory: [],
        placementPreview: null,
        ...createEditorDirtyState(false, false),
      }
    }),

  setLoading: (loading) => set({ isLoading: loading }),
  setSaving: (saving) => set({ isSaving: saving }),
  setError: (error) => set({ error }),

  selectEntity: (id) =>
    set((state) => {
      if (!id) {
        return clearSelectionState(state.hasSceneChanges)
      }

      const entity = state.entities.get(id) ?? null
      const draftEntity = cloneEditableEntitySelection(entity)
      if (!draftEntity) {
        return clearSelectionState(state.hasSceneChanges)
      }

      return {
        placementCatalogId: null,
        selectedEntityId: id,
        selectedStaticAssetId: null,
        draftEntity,
        savedEntity: cloneEntityDraft(draftEntity),
        draftStaticAsset: null,
        savedStaticAsset: null,
        transformPreview: null,
        transformSessionStart: null,
        history: [],
        redoHistory: [],
        placementPreview: null,
        ...createEditorDirtyState(state.hasSceneChanges, false),
      }
    }),

  selectStaticAsset: (id) =>
    set((state) => {
      if (!id) {
        return clearSelectionState(state.hasSceneChanges)
      }

      const staticAsset =
        state.staticAssets.get(id) ??
        (state.draftStaticAsset &&
        !state.savedStaticAsset &&
        state.draftStaticAsset.id === id
          ? state.draftStaticAsset
          : null)
      if (!staticAsset) {
        return clearSelectionState(state.hasSceneChanges)
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
        transformPreview: null,
        transformSessionStart: null,
        history: [],
        redoHistory: [],
        placementPreview: null,
        ...createEditorDirtyState(state.hasSceneChanges, !state.staticAssets.has(id)),
      }
    }),

  setHoveredEntity: (id) => set({ hoveredEntityId: id }),
  setHoveredStaticAsset: (id) => set({ hoveredStaticAssetId: id }),

  armStaticAssetPlacement: (catalogId) =>
    set({
      placementCatalogId: catalogId,
      placementPreview: null,
      transformPreview: null,
    }),

  placeStaticAsset: (placement) => {
    const { placementCatalogId } = get()
    if (!placementCatalogId) return null

    return get().placeStaticAssetFromCatalog(placementCatalogId, placement)
  },

  placeStaticAssetFromCatalog: (catalogId, placement) => {
    const draftStaticAsset = createStaticAssetTemplateFromCatalog(catalogId, placement)
    const state = get()
    set({
      placementCatalogId: null,
      selectedEntityId: null,
      selectedStaticAssetId: draftStaticAsset.id,
      draftEntity: null,
      savedEntity: null,
      draftStaticAsset,
      savedStaticAsset: null,
      transformPreview: null,
      transformSessionStart: null,
      history: [],
      redoHistory: [],
      placementPreview: null,
      transformMode: 'translate',
      ...createEditorDirtyState(state.hasSceneChanges, true),
    })

    return draftStaticAsset
  },

  setTransformMode: (mode) => set({ transformMode: mode }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setViewportProjection: (viewportProjection) => set({ viewportProjection }),
  setSceneConfig: (config) =>
    set((state) => {
      const { cameraPosition, cameraTarget, ...persistentPatch } = config
      const hasPersistentPatch = Object.keys(persistentPatch).length > 0
      const hasCameraPosePatch = Boolean(cameraPosition || cameraTarget)
      if (!hasPersistentPatch && !hasCameraPosePatch) return state

      const sceneConfig = {
        ...state.sceneConfig,
        ...persistentPatch,
      }
      const sceneDirty = hasPersistentPatch
        ? hasEditorSceneConfigChanged(sceneConfig, state.savedSceneConfig)
        : state.hasSceneChanges

      return {
        sceneConfig,
        ...(hasCameraPosePatch
          ? {
              editorCameraPosition: cameraPosition
                ? cloneVector(cameraPosition)
                : state.editorCameraPosition,
              editorCameraTarget: cameraTarget
                ? cloneVector(cameraTarget)
                : state.editorCameraTarget,
            }
          : {}),
        activeCameraPreset: hasCameraPosePatch ? null : state.activeCameraPreset,
        ...createEditorDirtyState(sceneDirty, state.hasSelectionChanges),
      }
    }),
  setEditorCameraPose: (position, target) =>
    set({
      editorCameraPosition: cloneVector(position),
      editorCameraTarget: cloneVector(target),
      activeCameraPreset: null,
    }),
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
        editorCameraPosition: cloneVector(preset.position),
        editorCameraTarget: cloneVector(preset.target),
        ...createEditorDirtyState(state.hasSceneChanges, state.hasSelectionChanges),
      }
    }),
  focusCameraDirection: (direction) =>
    set((state) => {
      const focusRequest = createDirectionalFocusRequest(
        direction,
        state.editorCameraPosition,
        state.editorCameraTarget,
        getDirectionalFocusTarget(state)
      )

      return {
        activeCameraPreset: null,
        cameraFocusRequest: focusRequest,
        editorCameraPosition: cloneVector(focusRequest.position),
        editorCameraTarget: cloneVector(focusRequest.target),
        ...createEditorDirtyState(state.hasSceneChanges, state.hasSelectionChanges),
      }
    }),
  clearCameraFocusRequest: () => set({ cameraFocusRequest: null }),
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
  setTranslateSnap: (translateSnap) =>
    set({ translateSnap: Math.max(0.1, translateSnap) }),
  setRotateSnapDegrees: (rotateSnapDegrees) =>
    set({ rotateSnapDegrees: Math.max(1, rotateSnapDegrees) }),
  setFloorPlanReference: (floorPlanReference) =>
    set({
      floorPlanReference: floorPlanReference
        ? {
            ...floorPlanReference,
            scaleMeters: Math.max(1, floorPlanReference.scaleMeters),
            opacity: clampNumber(floorPlanReference.opacity, 0.05, 1),
          }
        : null,
    }),
  updateFloorPlanReference: (patch) =>
    set((state) => {
      if (!state.floorPlanReference) return state

      return {
        floorPlanReference: {
          ...state.floorPlanReference,
          ...patch,
          scaleMeters:
            typeof patch.scaleMeters === 'number'
              ? Math.max(1, patch.scaleMeters)
              : state.floorPlanReference.scaleMeters,
          opacity:
            typeof patch.opacity === 'number'
              ? clampNumber(patch.opacity, 0.05, 1)
              : state.floorPlanReference.opacity,
        },
      }
    }),
  setPlacementPreview: (placementPreview) => set({ placementPreview }),
  setTransformPreview: (transformPreview) =>
    set({
      transformPreview: transformPreview ? cloneTransformSnapshot(transformPreview) : null,
    }),
  setTransformDragging: (dragging) =>
    set(
      dragging
        ? { isTransformDragging: true }
        : { isTransformDragging: false, transformPreview: null }
    ),
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

      const selectionDirty = hasEditableDraftChanged(nextDraft, getActiveSaved(state))

      return {
        ...createDraftPatch(state, nextDraft),
        ...createEditorDirtyState(state.hasSceneChanges, selectionDirty),
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

      const selectionDirty = hasEditableDraftChanged(nextDraft, getActiveSaved(state))

      return {
        ...createDraftPatch(state, nextDraft),
        ...createEditorDirtyState(state.hasSceneChanges, selectionDirty),
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

      const selectionDirty = hasEditableDraftChanged(nextDraft, getActiveSaved(state))

      return {
        ...createDraftPatch(state, nextDraft),
        ...createEditorDirtyState(state.hasSceneChanges, selectionDirty),
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
      const selectionDirty = hasEditableDraftChanged(nextDraft, getActiveSaved(state))

      return {
        ...createDraftPatch(state, nextDraft),
        history: [...state.history, previousSnapshot],
        redoHistory: [],
        transformSessionStart: null,
        ...createEditorDirtyState(state.hasSceneChanges, selectionDirty),
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
        const currentSnapshot = createTransformSnapshot(state.draftStaticAsset)
        if (!hasSnapshotChanged(currentSnapshot, snapshot)) {
          return state
        }
        const draftStaticAsset = applyTransformSnapshot(state.draftStaticAsset, snapshot)
        const selectionDirty = hasEditableDraftChanged(
          draftStaticAsset,
          state.savedStaticAsset
        )
        return {
          draftStaticAsset,
          ...createEditorDirtyState(state.hasSceneChanges, selectionDirty),
        }
      }

      if (!state.draftEntity) return state
      const currentSnapshot = createTransformSnapshot(state.draftEntity)
      if (!hasSnapshotChanged(currentSnapshot, snapshot)) {
        return state
      }
      const draftEntity = applyTransformSnapshot(state.draftEntity, snapshot)
      const selectionDirty = hasEditableDraftChanged(draftEntity, state.savedEntity)
      return {
        draftEntity,
        ...createEditorDirtyState(state.hasSceneChanges, selectionDirty),
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
      const selectionDirty = hasEditableDraftChanged(draft, getActiveSaved(state))

      return {
        transformSessionStart: null,
        history: changed
          ? [...state.history, state.transformSessionStart]
          : state.history,
        redoHistory: changed ? [] : state.redoHistory,
        ...createEditorDirtyState(state.hasSceneChanges, selectionDirty),
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
        ...createEditorDirtyState(state.hasSceneChanges, true),
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
      ...createEditorDirtyState(state.hasSceneChanges, true),
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
        ...createEditorDirtyState(
          state.hasSceneChanges,
          hasEditableDraftChanged(nextDraft, getActiveSaved(state))
        ),
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
        ...createEditorDirtyState(
          state.hasSceneChanges,
          hasEditableDraftChanged(nextDraft, getActiveSaved(state))
        ),
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
          ...createEditorDirtyState(state.hasSceneChanges, false),
        }
      }

      if (state.draftStaticAsset && !state.savedStaticAsset) {
        return {
          ...clearSelectionState(state.hasSceneChanges),
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
        ...createEditorDirtyState(state.hasSceneChanges, false),
      }
    }),

  reset: () => set(initialState),
}))

function selectEditorSceneSlice(state: EditorDigitalTwinStore): EditorSceneStoreSlice {
  return {
    publishedScenePackage: state.publishedScenePackage,
    sceneVersion: state.sceneVersion,
    sceneConfig: state.sceneConfig,
    savedSceneConfig: state.savedSceneConfig,
    entities: state.entities,
    staticAssets: state.staticAssets,
    draftEntity: state.draftEntity,
    savedEntity: state.savedEntity,
    draftStaticAsset: state.draftStaticAsset,
    savedStaticAsset: state.savedStaticAsset,
    transformSessionStart: state.transformSessionStart,
    history: state.history,
    redoHistory: state.redoHistory,
    hasSceneChanges: state.hasSceneChanges,
    hasSelectionChanges: state.hasSelectionChanges,
    isDirty: state.isDirty,
    hydrateFromBootstrap: state.hydrateFromBootstrap,
    setSceneConfig: state.setSceneConfig,
    updateDraftProperties: state.updateDraftProperties,
    updateDraftField: state.updateDraftField,
    updateDraftMetadata: state.updateDraftMetadata,
    setDraftTransformField: state.setDraftTransformField,
    beginTransformSession: state.beginTransformSession,
    updateDraftTransform: state.updateDraftTransform,
    commitTransformSession: state.commitTransformSession,
    duplicateSelection: state.duplicateSelection,
    placeStaticAsset: state.placeStaticAsset,
    placeStaticAssetFromCatalog: state.placeStaticAssetFromCatalog,
    undo: state.undo,
    redo: state.redo,
    resetDraft: state.resetDraft,
    reset: state.reset,
  }
}

function selectEditorViewerSlice(state: EditorDigitalTwinStore): EditorViewerStoreSlice {
  return {
    selectedEntityId: state.selectedEntityId,
    selectedStaticAssetId: state.selectedStaticAssetId,
    hoveredEntityId: state.hoveredEntityId,
    hoveredStaticAssetId: state.hoveredStaticAssetId,
    viewMode: state.viewMode,
    viewportProjection: state.viewportProjection,
    cameraPresets: state.cameraPresets,
    activeCameraPreset: state.activeCameraPreset,
    editorCameraPosition: state.editorCameraPosition,
    editorCameraTarget: state.editorCameraTarget,
    cameraFocusRequest: state.cameraFocusRequest,
    selectEntity: state.selectEntity,
    selectStaticAsset: state.selectStaticAsset,
    setHoveredEntity: state.setHoveredEntity,
    setHoveredStaticAsset: state.setHoveredStaticAsset,
    setViewMode: state.setViewMode,
    setViewportProjection: state.setViewportProjection,
    setEditorCameraPose: state.setEditorCameraPose,
    focusCameraPreset: state.focusCameraPreset,
    focusCameraDirection: state.focusCameraDirection,
    clearCameraFocusRequest: state.clearCameraFocusRequest,
  }
}

function selectEditorUiSlice(state: EditorDigitalTwinStore): EditorUiStoreSlice {
  return {
    placementCatalogId: state.placementCatalogId,
    transformMode: state.transformMode,
    snapEnabled: state.snapEnabled,
    translateSnap: state.translateSnap,
    rotateSnapDegrees: state.rotateSnapDegrees,
    floorPlanReference: state.floorPlanReference,
    placementPreview: state.placementPreview,
    transformPreview: state.transformPreview,
    isLoading: state.isLoading,
    isSaving: state.isSaving,
    isTransformDragging: state.isTransformDragging,
    isMarqueeSelecting: state.isMarqueeSelecting,
    selectionMarquee: state.selectionMarquee,
    error: state.error,
    setLoading: state.setLoading,
    setSaving: state.setSaving,
    setError: state.setError,
    armStaticAssetPlacement: state.armStaticAssetPlacement,
    setTransformMode: state.setTransformMode,
    setSnapEnabled: state.setSnapEnabled,
    setTranslateSnap: state.setTranslateSnap,
    setRotateSnapDegrees: state.setRotateSnapDegrees,
    setFloorPlanReference: state.setFloorPlanReference,
    updateFloorPlanReference: state.updateFloorPlanReference,
    setPlacementPreview: state.setPlacementPreview,
    setTransformPreview: state.setTransformPreview,
    setTransformDragging: state.setTransformDragging,
    setMarqueeSelecting: state.setMarqueeSelecting,
    setSelectionMarquee: state.setSelectionMarquee,
  }
}

export function useEditorSceneStore<T>(
  selector: (state: EditorSceneStoreSlice) => T
): T {
  return useEditorDigitalTwinStore((state) => selector(selectEditorSceneSlice(state)))
}

export function useEditorViewerStore<T>(
  selector: (state: EditorViewerStoreSlice) => T
): T {
  return useEditorDigitalTwinStore((state) => selector(selectEditorViewerSlice(state)))
}

export function useEditorUiStore<T>(selector: (state: EditorUiStoreSlice) => T): T {
  return useEditorDigitalTwinStore((state) => selector(selectEditorUiSlice(state)))
}

export function getEditorSceneState(): EditorSceneStoreSlice {
  return selectEditorSceneSlice(useEditorDigitalTwinStore.getState())
}

export function getEditorViewerState(): EditorViewerStoreSlice {
  return selectEditorViewerSlice(useEditorDigitalTwinStore.getState())
}

export function getEditorUiState(): EditorUiStoreSlice {
  return selectEditorUiSlice(useEditorDigitalTwinStore.getState())
}
