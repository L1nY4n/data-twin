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

type EditorDragCheckGizmoSnapshot = {
  xAxisScreenPoint: EditorDragCheckScreenPoint | null
  activeAxis: string | null
}

type EditorDragCheckPrepareResult = {
  prepared: boolean
  selectedTargetId: string | null
}

export type EditorDragCheckSnapshot = EditorDragCheckSelectionSnapshot &
  {
    camera: EditorDragCheckCameraSnapshot
    targetTransform: EditorDragCheckTargetTransformSnapshot
    gizmo: EditorDragCheckGizmoSnapshot
    timestamp: number
  }

type SelectionSnapshotProvider = () => EditorDragCheckSelectionSnapshot
type CameraSnapshotProvider = () => EditorDragCheckCameraSnapshot
type TargetTransformSnapshotProvider = () => EditorDragCheckTargetTransformSnapshot
type GizmoSnapshotProvider = () => EditorDragCheckGizmoSnapshot
type PrepareTargetProvider = () => EditorDragCheckPrepareResult

type EditorDragCheckBridge = {
  getSnapshot: () => EditorDragCheckSnapshot
  prepareTranslateTarget: () => EditorDragCheckPrepareResult | null
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
  gizmo: GizmoSnapshotProvider | null
  prepareTarget: PrepareTargetProvider | null
} = {
  selection: null,
  camera: null,
  targetTransform: null,
  gizmo: null,
  prepareTarget: null,
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
    gizmo: {
      xAxisScreenPoint: null,
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

export function setEditorDragCheckGizmoProvider(provider: GizmoSnapshotProvider | null) {
  setBridgeProvider('gizmo', provider)
}

export function setEditorDragCheckPrepareTargetProvider(
  provider: PrepareTargetProvider | null
) {
  setBridgeProvider('prepareTarget', provider)
}
