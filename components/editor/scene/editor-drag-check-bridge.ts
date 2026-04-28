'use client'

type EditorDragCheckVector3 = {
  x: number
  y: number
  z: number
}

type EditorDragCheckScreenPoint = {
  x: number
  y: number
}

type EditorDragCheckSelectionSnapshot = {
  selectedTargetId: string | null
  selectedTargetKind: string | null
  transformMode: 'select' | 'translate' | 'rotate' | 'scale'
  isTransformDragging: boolean
}

type EditorDragCheckCameraSnapshot = {
  position: EditorDragCheckVector3 | null
  target: EditorDragCheckVector3 | null
}

type EditorDragCheckTargetTransformSnapshot = {
  position: EditorDragCheckVector3 | null
  rotation: EditorDragCheckVector3 | null
  scale: EditorDragCheckVector3 | null
}

type EditorDragCheckRenderedTargetSnapshot = {
  position: EditorDragCheckVector3 | null
}

type EditorDragCheckGizmoSnapshot = {
  xAxisScreenPoint: EditorDragCheckScreenPoint | null
  visibleXAxisScreenPoint: EditorDragCheckScreenPoint | null
  pickerXAxisScreenPoint: EditorDragCheckScreenPoint | null
  activeAxis: string | null
}

type EditorDragCheckPrepareResult = {
  prepared: boolean
  selectedTargetId: string | null
}

type EditorDragCheckSelectResult = {
  selectedTargetId: string | null
  transformMode: 'select' | 'translate' | 'rotate' | 'scale'
}

type EditorDragCheckDragMetaSnapshot = {
  dragActivated: boolean
  deadzonePixels: number | null
  dragStartPointer: EditorDragCheckScreenPoint | null
  lastPointer: EditorDragCheckScreenPoint | null
  pointerDownPointer: EditorDragCheckScreenPoint | null
  pointerDownHandlePoint: EditorDragCheckScreenPoint | null
  pointerDownHandleName: string | null
  pointerDownHandleType: string | null
  pointerDownMaxDistance: number | null
  pointerDownBlocked: boolean
}

type EditorDragCheckStoreSnapshot = {
  selectedStaticAssetId: string | null
  draftStaticAssetId: string | null
  savedStaticAssetId: string | null
  draftStaticAssetPosition: EditorDragCheckVector3 | null
  savedStaticAssetPosition: EditorDragCheckVector3 | null
  transformPreviewPosition: EditorDragCheckVector3 | null
  isTransformDragging: boolean
}

export type EditorDragCheckSnapshot = EditorDragCheckSelectionSnapshot &
  {
    camera: EditorDragCheckCameraSnapshot
    targetTransform: EditorDragCheckTargetTransformSnapshot
    renderedTarget: EditorDragCheckRenderedTargetSnapshot
    dragMeta: EditorDragCheckDragMetaSnapshot
    store: EditorDragCheckStoreSnapshot
    gizmo: EditorDragCheckGizmoSnapshot
    timestamp: number
  }

type SelectionSnapshotProvider = () => EditorDragCheckSelectionSnapshot
type CameraSnapshotProvider = () => EditorDragCheckCameraSnapshot
type TargetTransformSnapshotProvider = () => EditorDragCheckTargetTransformSnapshot
type RenderedTargetSnapshotProvider = () => EditorDragCheckRenderedTargetSnapshot
type DragMetaSnapshotProvider = () => EditorDragCheckDragMetaSnapshot
type StoreSnapshotProvider = () => EditorDragCheckStoreSnapshot
type GizmoSnapshotProvider = () => EditorDragCheckGizmoSnapshot
type PrepareTargetProvider = () => EditorDragCheckPrepareResult
type SelectTargetProvider = (
  targetId: string,
  transformMode?: 'select' | 'translate' | 'rotate' | 'scale'
) => EditorDragCheckSelectResult | null

type EditorDragCheckBridge = {
  getSnapshot: () => EditorDragCheckSnapshot
  prepareTranslateTarget: () => EditorDragCheckPrepareResult | null
  selectTarget: (
    targetId: string,
    transformMode?: 'select' | 'translate' | 'rotate' | 'scale'
  ) => EditorDragCheckSelectResult | null
}

type EditorDragCheckWindow = Window & {
  __EDITOR_DRAG_CHECK__?: EditorDragCheckBridge
}

declare global {
  interface Window {
    __EDITOR_DRAG_CHECK__?: EditorDragCheckBridge
  }
}

const bridgeProviders: {
  selection: SelectionSnapshotProvider | null
  camera: CameraSnapshotProvider | null
  targetTransform: TargetTransformSnapshotProvider | null
  renderedTarget: RenderedTargetSnapshotProvider | null
  dragMeta: DragMetaSnapshotProvider | null
  store: StoreSnapshotProvider | null
  gizmo: GizmoSnapshotProvider | null
  prepareTarget: PrepareTargetProvider | null
  selectTarget: SelectTargetProvider | null
} = {
  selection: null,
  camera: null,
  targetTransform: null,
  renderedTarget: null,
  dragMeta: null,
  store: null,
  gizmo: null,
  prepareTarget: null,
  selectTarget: null,
}

function shouldEnableDragCheckBridge() {
  return typeof window !== 'undefined' && process.env.NODE_ENV !== 'production'
}

function resolveBridgeWindow() {
  if (!shouldEnableDragCheckBridge()) return null
  return window as EditorDragCheckWindow
}

function createEmptySnapshot(): EditorDragCheckSnapshot {
  return {
    selectedTargetId: null,
    selectedTargetKind: null,
    transformMode: 'select',
    isTransformDragging: false,
    camera: {
      position: null,
      target: null,
    },
    targetTransform: {
      position: null,
      rotation: null,
      scale: null,
    },
    renderedTarget: {
      position: null,
    },
    dragMeta: {
      dragActivated: false,
      deadzonePixels: null,
      dragStartPointer: null,
      lastPointer: null,
      pointerDownPointer: null,
      pointerDownHandlePoint: null,
      pointerDownHandleName: null,
      pointerDownHandleType: null,
      pointerDownMaxDistance: null,
      pointerDownBlocked: false,
    },
    store: {
      selectedStaticAssetId: null,
      draftStaticAssetId: null,
      savedStaticAssetId: null,
      draftStaticAssetPosition: null,
      savedStaticAssetPosition: null,
      transformPreviewPosition: null,
      isTransformDragging: false,
    },
    gizmo: {
      xAxisScreenPoint: null,
      visibleXAxisScreenPoint: null,
      pickerXAxisScreenPoint: null,
      activeAxis: null,
    },
    timestamp: Date.now(),
  }
}

function createBridgeSnapshot() {
  const snapshot = createEmptySnapshot()

  const selection = bridgeProviders.selection?.()
  if (selection) {
    snapshot.selectedTargetId = selection.selectedTargetId
    snapshot.selectedTargetKind = selection.selectedTargetKind
    snapshot.transformMode = selection.transformMode
    snapshot.isTransformDragging = selection.isTransformDragging
  }

  const camera = bridgeProviders.camera?.()
  if (camera) {
    snapshot.camera = camera
  }

  const targetTransform = bridgeProviders.targetTransform?.()
  if (targetTransform) {
    snapshot.targetTransform = targetTransform
  }

  const renderedTarget = bridgeProviders.renderedTarget?.()
  if (renderedTarget) {
    snapshot.renderedTarget = renderedTarget
  }

  const dragMeta = bridgeProviders.dragMeta?.()
  if (dragMeta) {
    snapshot.dragMeta = dragMeta
  }

  const store = bridgeProviders.store?.()
  if (store) {
    snapshot.store = store
  }

  const gizmo = bridgeProviders.gizmo?.()
  if (gizmo) {
    snapshot.gizmo = gizmo
  }

  snapshot.timestamp = Date.now()
  return snapshot
}

function ensureBridgeInstalled() {
  const bridgeWindow = resolveBridgeWindow()
  if (!bridgeWindow) return
  if (bridgeWindow.__EDITOR_DRAG_CHECK__) return

  bridgeWindow.__EDITOR_DRAG_CHECK__ = {
    getSnapshot: () => createBridgeSnapshot(),
    prepareTranslateTarget: () => bridgeProviders.prepareTarget?.() ?? null,
    selectTarget: (targetId, transformMode) =>
      bridgeProviders.selectTarget?.(targetId, transformMode) ?? null,
  }
}

export function installEditorDragCheckBridge() {
  ensureBridgeInstalled()
}

function setBridgeProvider<Key extends keyof typeof bridgeProviders>(
  key: Key,
  provider: (typeof bridgeProviders)[Key]
) {
  if (!shouldEnableDragCheckBridge()) return
  ensureBridgeInstalled()
  bridgeProviders[key] = provider
}

export function setEditorDragCheckSelectionProvider(provider: SelectionSnapshotProvider | null) {
  setBridgeProvider('selection', provider)
}

export function setEditorDragCheckCameraProvider(provider: CameraSnapshotProvider | null) {
  setBridgeProvider('camera', provider)
}

export function setEditorDragCheckTargetTransformProvider(
  provider: TargetTransformSnapshotProvider | null
) {
  setBridgeProvider('targetTransform', provider)
}

export function setEditorDragCheckRenderedTargetProvider(
  provider: RenderedTargetSnapshotProvider | null
) {
  setBridgeProvider('renderedTarget', provider)
}

export function setEditorDragCheckDragMetaProvider(
  provider: DragMetaSnapshotProvider | null
) {
  setBridgeProvider('dragMeta', provider)
}

export function setEditorDragCheckStoreProvider(
  provider: StoreSnapshotProvider | null
) {
  setBridgeProvider('store', provider)
}

export function setEditorDragCheckGizmoProvider(provider: GizmoSnapshotProvider | null) {
  setBridgeProvider('gizmo', provider)
}

export function setEditorDragCheckPrepareTargetProvider(
  provider: PrepareTargetProvider | null
) {
  setBridgeProvider('prepareTarget', provider)
}

export function setEditorDragCheckSelectTargetProvider(
  provider: SelectTargetProvider | null
) {
  setBridgeProvider('selectTarget', provider)
}
