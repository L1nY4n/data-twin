'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type BootstrapPayload,
  type EditorSaveRequest,
  createAdminStaticAsset,
  deleteAdminEntity,
  deleteAdminStaticAsset,
  fetchAdminPublishStatus,
  fetchEditorBootstrap,
  getAdminApiSceneVersionConflict,
  isAdminApiError,
  saveAdminEditorDrafts,
  triggerAdminPublish,
} from '@/lib/digital-twin/bootstrap-client'
import type { PublishStatus } from '@/lib/digital-twin/admin'
import {
  buildEditorSceneSavePayload,
  type EditorFloorPlanReference,
  getEditorSceneState,
  getEditorUiState,
  getEditorViewerState,
  getEditorSelectionKind,
  type EditorDigitalTwinStore,
  useEditorSceneStore,
  useEditorUiStore,
  useEditorViewerStore,
} from '@/lib/digital-twin/editor-store'
import type { FloorPlanDetectionResultDto } from '@/lib/digital-twin/floor-plan-detector'
import { createStaticAssetsFromFloorPlanDetection } from '@/lib/digital-twin/floor-plan-import'
import {
  DEFAULT_PUBLISHED_SCENE_PACKAGE,
  loadPublishedScenePackage,
  type PublishedScenePackage,
  withVersionedPublishedScenePackage,
} from '@/lib/digital-twin/publish'
import {
  createStandardRoomStaticAssets,
  isStandardRoomEntryDoorAsset,
} from '@/lib/digital-twin/standard-room'
import type {
  Entity,
  StaticAssetInstance,
  Vector3,
} from '@/lib/digital-twin/types'

type EditorActivityPhase =
  | 'ready'
  | 'loading'
  | 'saving'
  | 'publishing'
  | 'recovering'
  | 'error'

type EditorActivityTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
export type EditorRetryAction =
  | 'reload'
  | 'save'
  | 'delete'
  | 'publish'
  | 'create_standard_room'
  | 'import_floor_plan'

type ReloadReason = 'initial' | 'manual' | 'publish'

export interface EditorActivityStatus {
  phase: EditorActivityPhase
  tone: EditorActivityTone
  title: string
  detail: string
  isBusy: boolean
  canRetry?: boolean
  retryLabel?: string
  retryAction?: EditorRetryAction
}

function countEditorEntityTypes(entities: Entity[]) {
  return entities.reduce(
    (counts, entity) => {
      if (entity.type === 'person') counts.persons += 1
      if (entity.type === 'vehicle') counts.vehicles += 1
      if (entity.type === 'equipment') counts.equipment += 1
      return counts
    },
    { persons: 0, vehicles: 0, equipment: 0 }
  )
}

function createEmptyEditorPublishedScenePackage(
  payload: BootstrapPayload
): PublishedScenePackage {
  const halfExtent = Math.max(payload.sceneConfig.gridSize / 2, 20)
  const counts = countEditorEntityTypes(payload.entities)

  return {
    schemaVersion: 1,
    sceneId: payload.sceneConfig.id,
    profile: 'default',
    generatedAt: new Date().toISOString(),
    source: 'working-snapshot',
    staticAssetManifestUrl: '/generated/published-static/empty-manifest.json',
    bounds: {
      min: { x: -halfExtent, y: 0, z: -halfExtent },
      max: { x: halfExtent, y: halfExtent, z: halfExtent },
    },
    sceneConfig: {
      ...payload.sceneConfig,
      cameraPosition: { ...payload.sceneConfig.cameraPosition },
      cameraTarget: { ...payload.sceneConfig.cameraTarget },
    },
    sectors: [],
    staticChunks: [],
    interactionLayers: [],
    zoneOverlays: [],
    dynamicLayers: [],
    routingLayers: [],
    cameraPresets: [
      {
        id: 'editor-default',
        name: '编辑器默认视角',
        position: { ...payload.sceneConfig.cameraPosition },
        target: { ...payload.sceneConfig.cameraTarget },
        fov: 50,
      },
    ],
    entityCounts: {
      default: { ...counts },
      production: { ...counts },
    },
  }
}

async function resolvePublishedScenePackage(
  payload: BootstrapPayload
) {
  const publishedScene = payload.publishedScene

  if (!publishedScene) {
    return createEmptyEditorPublishedScenePackage(payload)
  }

  const pkg = await loadPublishedScenePackage(
    publishedScene.packageUrl,
    publishedScene.packageVersion
  )

  return (
    pkg ??
    withVersionedPublishedScenePackage(
      DEFAULT_PUBLISHED_SCENE_PACKAGE,
      publishedScene.packageVersion
    )
  )
}

export function describeEditorOperationError(error: unknown, fallback: string) {
  if (isAdminApiError(error)) {
    return error.message
  }

  return error instanceof Error ? error.message : fallback
}

export function resolveEditorSaveFailureStatus(error: unknown): EditorActivityStatus {
  if (isAdminApiError(error) && error.status === 409) {
    const conflict = getAdminApiSceneVersionConflict(error)

    return {
      phase: 'error',
      tone: 'warning',
      title: '检测到编辑版本冲突',
      detail: conflict
        ? `当前编辑基于场景版本 ${conflict.expectedSceneVersion}，但服务端最新版本已是 ${conflict.currentSceneVersion}。请先重新同步，再重试保存。`
        : describeEditorOperationError(error, '保存编辑内容失败'),
      isBusy: false,
      canRetry: true,
      retryLabel: '重新同步',
      retryAction: 'reload',
    }
  }

  const message = describeEditorOperationError(error, '保存编辑内容失败')
  return {
    phase: 'error',
    tone: 'danger',
    title: '保存失败',
    detail: message,
    isBusy: false,
    canRetry: true,
    retryLabel: '重试保存',
    retryAction: 'save',
  }
}

function createReadyStatus(detail = '场景、发布状态与资源库已同步。'): EditorActivityStatus {
  return {
    phase: 'ready',
    tone: 'success',
    title: '工作台已就绪',
    detail,
    isBusy: false,
  }
}

export function createEditorSceneSavePayload(
  sceneConfig: EditorDigitalTwinStore['sceneConfig'],
  savedSceneConfig: EditorDigitalTwinStore['savedSceneConfig']
) {
  return buildEditorSceneSavePayload(sceneConfig, savedSceneConfig)
}

export function createEditorSaveRequest(
  store: Pick<
    EditorDigitalTwinStore,
    | 'sceneConfig'
    | 'savedSceneConfig'
    | 'sceneVersion'
    | 'hasSceneChanges'
    | 'hasSelectionChanges'
    | 'draftEntity'
    | 'draftStaticAsset'
    | 'savedEntity'
    | 'savedStaticAsset'
    | 'selectedEntityId'
    | 'selectedStaticAssetId'
  >
): EditorSaveRequest | null {
  const selectionKind = getEditorSelectionKind(store)
  if (!store.hasSceneChanges && !store.hasSelectionChanges) {
    return null
  }

  return {
    expectedSceneVersion: store.sceneVersion,
    ...(store.hasSceneChanges
      ? {
          sceneConfig: createEditorSceneSavePayload(
            store.sceneConfig,
            store.savedSceneConfig
          ),
        }
      : {}),
    ...(selectionKind === 'entity' && store.hasSelectionChanges && store.draftEntity
      ? {
          entity: {
            mode: store.savedEntity ? 'update' : 'create',
            entity: store.draftEntity,
          },
        }
      : {}),
    ...(selectionKind === 'static-asset' &&
    store.hasSelectionChanges &&
    store.draftStaticAsset &&
    store.selectedStaticAssetId
      ? {
          staticAsset: {
            mode: store.savedStaticAsset ? 'update' : 'create',
            staticAsset: store.draftStaticAsset,
          },
        }
      : {}),
  }
}

export function restoreSelectionAfterReload({
  reloadSucceeded,
  savedEntityId,
  savedStaticAssetId,
  selectEntity,
  selectStaticAsset,
}: {
  reloadSucceeded: boolean
  savedEntityId?: string | null
  savedStaticAssetId?: string | null
  selectEntity: (id: string) => boolean
  selectStaticAsset: (id: string) => boolean
}) {
  if (!reloadSucceeded) return false
  if (savedEntityId) return selectEntity(savedEntityId)
  if (savedStaticAssetId) return selectStaticAsset(savedStaticAssetId)
  return true
}

export type EditorSaveSelectionResult =
  | {
      status: 'noop'
      persisted: false
      synced: false
      requiresReload: false
      reloadSucceeded: false
      selectionRestored: false
    }
  | {
      status: 'failed'
      persisted: false
      synced: false
      requiresReload: false
      reloadSucceeded: false
      selectionRestored: false
    }
  | {
      status: 'saved'
      persisted: true
      synced: true
      requiresReload: false
      reloadSucceeded: true
      selectionRestored: boolean
    }
  | {
      status: 'saved_with_reload_warning'
      persisted: true
      synced: false
      requiresReload: true
      reloadSucceeded: false
      selectionRestored: false
    }
  | {
      status: 'saved_with_selection_warning'
      persisted: true
      synced: false
      requiresReload: true
      reloadSucceeded: true
      selectionRestored: false
    }

export function resolveEditorSaveSelectionResult({
  reloadSucceeded,
  selectionRestored,
  savedEntityId,
  savedStaticAssetId,
}: {
  reloadSucceeded: boolean
  selectionRestored: boolean
  savedEntityId?: string | null
  savedStaticAssetId?: string | null
}): Extract<EditorSaveSelectionResult, { persisted: true }> {
  if (!reloadSucceeded) {
    return {
      status: 'saved_with_reload_warning',
      persisted: true,
      synced: false,
      requiresReload: true,
      reloadSucceeded: false,
      selectionRestored: false,
    }
  }

  if ((savedEntityId || savedStaticAssetId) && !selectionRestored) {
    return {
      status: 'saved_with_selection_warning',
      persisted: true,
      synced: false,
      requiresReload: true,
      reloadSucceeded: true,
      selectionRestored: false,
    }
  }

  return {
    status: 'saved',
    persisted: true,
    synced: true,
    requiresReload: false,
    reloadSucceeded: true,
    selectionRestored,
  }
}

export type EditorPublishResult =
  | {
      status: 'blocked'
      completed: false
      inProgress: false
      recovered: false
    }
  | {
      status: 'failed'
      completed: false
      inProgress: false
      recovered: false
    }
  | {
      status: 'published'
      completed: true
      inProgress: false
      recovered: boolean
    }
  | {
      status: 'publish_in_progress'
      completed: false
      inProgress: true
      recovered: true
    }

export function resolveEditorPublishResult({
  publishStatus,
  recovered,
}: {
  publishStatus: PublishStatus
  recovered: boolean
}): Extract<EditorPublishResult, { status: 'published' | 'publish_in_progress' }> {
  if (publishStatus.status === 'publishing') {
    return {
      status: 'publish_in_progress',
      completed: false,
      inProgress: true,
      recovered: true,
    }
  }

  return {
    status: 'published',
    completed: true,
    inProgress: false,
    recovered,
  }
}

export function canEditorPublish({
  publishStatus,
  isDirty,
  isSaving,
  isPublishing,
}: {
  publishStatus: PublishStatus | null
  isDirty: boolean
  isSaving: boolean
  isPublishing: boolean
}) {
  return (
    Boolean(publishStatus?.hasUnpublishedChanges) &&
    publishStatus?.status !== 'publishing' &&
    !isDirty &&
    !isSaving &&
    !isPublishing
  )
}

export class StandardRoomCreationError extends Error {
  createdCount: number
  focusAssetId: string | null

  constructor(
    message: string,
    options: {
      createdCount: number
      focusAssetId: string | null
      cause?: unknown
    }
  ) {
    super(message)
    this.name = 'StandardRoomCreationError'
    this.createdCount = options.createdCount
    this.focusAssetId = options.focusAssetId
    ;(this as Error & { cause?: unknown }).cause = options.cause
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export function isStandardRoomCreationError(
  error: unknown
): error is StandardRoomCreationError {
  return error instanceof StandardRoomCreationError
}

export class FloorPlanImportError extends Error {
  createdCount: number
  focusAssetId: string | null

  constructor(
    message: string,
    options: {
      createdCount: number
      focusAssetId: string | null
      cause?: unknown
    }
  ) {
    super(message)
    this.name = 'FloorPlanImportError'
    this.createdCount = options.createdCount
    this.focusAssetId = options.focusAssetId
    ;(this as Error & { cause?: unknown }).cause = options.cause
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export function isFloorPlanImportError(error: unknown): error is FloorPlanImportError {
  return error instanceof FloorPlanImportError
}

export async function executeStandardRoomCreation({
  center,
  createStaticAsset,
  reload,
  selectStaticAsset,
}: {
  center: Vector3
  createStaticAsset: (asset: StaticAssetInstance) => Promise<StaticAssetInstance>
  reload: () => Promise<boolean>
  selectStaticAsset: (id: string) => boolean
}) {
  const roomAssets = createStandardRoomStaticAssets(center)
  let focusAssetId: string | null = null
  let createdCount = 0

  try {
    for (const asset of roomAssets) {
      const savedAsset = await createStaticAsset(asset)
      createdCount += 1
      if (isStandardRoomEntryDoorAsset(asset)) {
        focusAssetId = savedAsset.id
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '生成标准房间时创建构件失败'
    throw new StandardRoomCreationError(message, {
      createdCount,
      focusAssetId,
      cause: error,
    })
  }

  const reloadSucceeded = await reload()
  let selectionRestored = false
  if (reloadSucceeded && focusAssetId) {
    selectionRestored = selectStaticAsset(focusAssetId)
  }

  return {
    createdCount,
    focusAssetId,
    reloadSucceeded,
    selectionRestored,
  }
}

export async function executeFloorPlanImport({
  detection,
  reference,
  createStaticAsset,
  reload,
  selectStaticAsset,
}: {
  detection: FloorPlanDetectionResultDto
  reference: Pick<EditorFloorPlanReference, 'position' | 'scaleMeters'>
  createStaticAsset: (asset: StaticAssetInstance) => Promise<StaticAssetInstance>
  reload: () => Promise<boolean>
  selectStaticAsset: (id: string) => boolean
}) {
  const importedAssets = createStaticAssetsFromFloorPlanDetection(detection, reference)
  if (importedAssets.length > 500) {
    throw new Error('Detected too many assets; refine the floor plan before importing')
  }
  let focusAssetId: string | null = null
  let createdCount = 0

  try {
    for (const [index, asset] of importedAssets.entries()) {
      const savedAsset = await createStaticAsset(asset)
      createdCount += 1
      if (index === 0) {
        focusAssetId = savedAsset.id
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'floor plan 导入时创建构件失败'
    throw new FloorPlanImportError(message, {
      createdCount,
      focusAssetId,
      cause: error,
    })
  }

  const reloadSucceeded = await reload()
  let selectionRestored = false
  if (reloadSucceeded && focusAssetId) {
    selectionRestored = selectStaticAsset(focusAssetId)
  }

  return {
    createdCount,
    focusAssetId,
    reloadSucceeded,
    selectionRestored,
  }
}

export function useEditorDigitalTwin(workspaceId: string) {
  const [publishStatus, setPublishStatus] = useState<PublishStatus | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const [activityStatus, setActivityStatus] = useState<EditorActivityStatus>({
    phase: 'loading',
    tone: 'info',
    title: '同步编辑器工作台',
    detail: '正在载入场景、发布状态与资源库。',
    isBusy: true,
  })
  const selectedEntityId = useEditorViewerStore((state) => state.selectedEntityId)
  const selectedStaticAssetId = useEditorViewerStore((state) => state.selectedStaticAssetId)
  const duplicateSelectionState = useEditorSceneStore((state) => state.duplicateSelection)
  const isDirty = useEditorSceneStore((state) => state.isDirty)
  const isSaving = useEditorUiStore((state) => state.isSaving)

  const reload = useCallback(
    async (reason: ReloadReason = 'manual') => {
      const uiStore = getEditorUiState()
      const syncDetail =
        reason === 'publish'
          ? '正在刷新发布结果与当前工作台上下文。'
          : reason === 'initial'
            ? '正在载入场景、发布状态与资源库。'
            : '正在重新同步场景、资源与发布状态。'

      uiStore.setLoading(true)
      setActivityStatus({
        phase: 'loading',
        tone: 'info',
        title: '同步编辑器工作台',
        detail: syncDetail,
        isBusy: true,
      })

      try {
        const [payload, nextPublishStatus] = await Promise.all([
          fetchEditorBootstrap(workspaceId),
          fetchAdminPublishStatus(workspaceId),
        ])
        const publishedScenePackage = await resolvePublishedScenePackage(payload)
        getEditorSceneState().hydrateFromBootstrap(
          payload,
          publishedScenePackage,
          {
            preserveEditorCameraPose: reason !== 'initial',
          }
        )
        setPublishStatus(nextPublishStatus)
        getEditorUiState().setError(null)
        setActivityStatus(
          createReadyStatus(
            reason === 'publish'
              ? '最新发布状态与当前场景上下文已刷新。'
              : '场景、发布状态与资源库已同步。'
          )
        )
        return true
      } catch (error) {
        const message = describeEditorOperationError(error, '加载 3D 编辑器数据失败')
        getEditorUiState().setError(message)
        setActivityStatus({
          phase: 'error',
          tone: 'danger',
          title: '工作台同步失败',
          detail: message,
          isBusy: false,
          canRetry: true,
          retryLabel: '重新同步',
          retryAction: 'reload',
        })
        return false
      } finally {
        getEditorUiState().setLoading(false)
      }
    },
    [workspaceId]
  )

  const saveSelection = useCallback(async (): Promise<EditorSaveSelectionResult> => {
    const sceneStore = getEditorSceneState()
    const viewerStore = getEditorViewerState()
    const uiStore = getEditorUiState()
    const store = {
      ...sceneStore,
      ...viewerStore,
    }
    const hasSceneChanges = store.hasSceneChanges
    const hasSelectionChanges = store.hasSelectionChanges

    if (!hasSceneChanges && !hasSelectionChanges) {
      return {
        status: 'noop',
        persisted: false,
        synced: false,
        requiresReload: false,
        reloadSucceeded: false,
        selectionRestored: false,
      }
    }
    uiStore.setSaving(true)
    uiStore.setError(null)
    setActivityStatus({
      phase: 'saving',
      tone: 'info',
      title:
        hasSceneChanges && hasSelectionChanges
          ? '保存场景与草稿'
          : hasSceneChanges
            ? '保存场景配置'
            : '保存当前草稿',
      detail: hasSceneChanges
        ? hasSelectionChanges
          ? '正在提交场景配置与当前对象编辑结果。'
          : '正在提交场景级编辑结果。'
        : '正在提交当前对象的编辑结果。',
      isBusy: true,
    })

    try {
      const request = createEditorSaveRequest(store)
      if (!request) {
        return {
          status: 'noop',
          persisted: false,
          synced: false,
          requiresReload: false,
          reloadSucceeded: false,
          selectionRestored: false,
        }
      }
      const response = await saveAdminEditorDrafts(workspaceId, request)

      const focusEntityId = response.savedEntity?.id ?? null
      const focusStaticAssetId = response.savedStaticAsset?.id ?? null

      const reloadSucceeded = await reload('manual')
      const selectionRestored = restoreSelectionAfterReload({
        reloadSucceeded,
        savedEntityId: focusEntityId,
        savedStaticAssetId: focusStaticAssetId,
        selectEntity: (id) => {
          getEditorViewerState().selectEntity(id)
          return getEditorViewerState().selectedEntityId === id
        },
        selectStaticAsset: (id) => {
          getEditorViewerState().selectStaticAsset(id)
          return getEditorViewerState().selectedStaticAssetId === id
        },
      })
      const result = resolveEditorSaveSelectionResult({
        reloadSucceeded,
        selectionRestored,
        savedEntityId: focusEntityId,
        savedStaticAssetId: focusStaticAssetId,
      })

      if (result.status === 'saved_with_reload_warning') {
        const message = '编辑内容已保存，但工作台重新同步失败。请重新同步后继续编辑。'
        getEditorUiState().setError(message)
        setActivityStatus({
          phase: 'error',
          tone: 'warning',
          title: '保存成功但同步失败',
          detail: message,
          isBusy: false,
          canRetry: true,
          retryLabel: '重新同步',
          retryAction: 'reload',
        })
        return result
      }

      if (result.status === 'saved_with_selection_warning') {
        const message = '编辑内容已保存，但刷新后未恢复当前选中对象。请重新同步后继续编辑。'
        getEditorUiState().setError(message)
        setActivityStatus({
          phase: 'error',
          tone: 'warning',
          title: '保存成功但未恢复选中',
          detail: message,
          isBusy: false,
          canRetry: true,
          retryLabel: '重新同步',
          retryAction: 'reload',
        })
        return result
      }

      setActivityStatus({
        phase: 'ready',
        tone: 'success',
        title:
          hasSceneChanges && hasSelectionChanges
            ? '场景与草稿已保存'
            : hasSceneChanges
              ? '场景已保存'
              : '草稿已保存',
        detail:
          hasSceneChanges && hasSelectionChanges
            ? '场景配置与对象草稿已同步到作者工作区。'
            : hasSceneChanges
            ? '场景级配置已同步到作者工作区。'
            : '作者工作区已同步最新对象状态。',
        isBusy: false,
      })
      return result
    } catch (error) {
      const nextStatus = resolveEditorSaveFailureStatus(error)
      getEditorUiState().setError(nextStatus.detail)
      setActivityStatus(nextStatus)
      return {
        status: 'failed',
        persisted: false,
        synced: false,
        requiresReload: false,
        reloadSucceeded: false,
        selectionRestored: false,
      }
    } finally {
      getEditorUiState().setSaving(false)
    }
  }, [reload, workspaceId])

  const deleteSelection = useCallback(async () => {
    const sceneStore = getEditorSceneState()
    const viewerStore = getEditorViewerState()
    const uiStore = getEditorUiState()
    const store = {
      ...sceneStore,
      ...viewerStore,
      ...uiStore,
    }
    const selectionKind = getEditorSelectionKind(store)
    if (!selectionKind) return false

    if (
      (selectionKind === 'entity' && !store.savedEntity) ||
      (selectionKind === 'static-asset' && !store.savedStaticAsset)
    ) {
      store.resetDraft()
      setActivityStatus({
        phase: 'ready',
        tone: 'success',
        title: '未保存草稿已清除',
        detail: '当前草稿已回退到上次持久化状态。',
        isBusy: false,
      })
      return true
    }

    uiStore.setSaving(true)
    uiStore.setError(null)
    setActivityStatus({
      phase: 'saving',
      tone: 'info',
      title: '移除对象',
      detail: '正在删除当前选中的对象并刷新工作台。',
      isBusy: true,
    })

    try {
      if (selectionKind === 'entity') {
        if (!selectedEntityId) return false
        await deleteAdminEntity(workspaceId, selectedEntityId)
      } else {
        if (!selectedStaticAssetId) return false
        await deleteAdminStaticAsset(workspaceId, selectedStaticAssetId)
      }
      await reload('manual')
      setActivityStatus({
        phase: 'ready',
        tone: 'success',
        title: '对象已移除',
        detail: '工作台已同步最新场景内容。',
        isBusy: false,
      })
      return true
    } catch (error) {
      const message = describeEditorOperationError(error, '删除静态资产失败')
      getEditorUiState().setError(message)
      setActivityStatus({
        phase: 'error',
        tone: 'danger',
        title: '删除失败',
        detail: message,
        isBusy: false,
        canRetry: true,
        retryLabel: '重试删除',
        retryAction: 'delete',
      })
      return false
    } finally {
      getEditorUiState().setSaving(false)
    }
  }, [reload, selectedEntityId, selectedStaticAssetId, workspaceId])

  const duplicateSelection = useCallback(() => {
    const duplicated = duplicateSelectionState()
    if (duplicated) {
      setActivityStatus({
        phase: 'ready',
        tone: 'success',
        title: '对象已复制',
        detail: '已生成新的本地草稿，可继续拖拽或微调。',
        isBusy: false,
      })
    }
    return duplicated
  }, [duplicateSelectionState])

  const createStandardRoom = useCallback(async () => {
    const sceneStore = getEditorSceneState()
    const viewerStore = getEditorViewerState()
    const uiStore = getEditorUiState()
    const store = {
      ...sceneStore,
      ...viewerStore,
      ...uiStore,
    }
    if (store.isLoading || store.isSaving) return false

    uiStore.setSaving(true)
    uiStore.setError(null)
    setActivityStatus({
      phase: 'saving',
      tone: 'info',
      title: '生成标准房间',
      detail: '正在以当前镜头中心创建墙体与入口门。',
      isBusy: true,
    })

    try {
      const result = await executeStandardRoomCreation({
        center: store.editorCameraTarget,
        createStaticAsset: (staticAsset) => createAdminStaticAsset(workspaceId, staticAsset),
        reload: () => reload('manual'),
        selectStaticAsset: (id) => {
          getEditorViewerState().selectStaticAsset(id)
          return getEditorViewerState().selectedStaticAssetId === id
        },
      })

      if (!result.reloadSucceeded) {
        const message = '标准房间已创建，但工作台重新同步失败。请重新同步后继续编辑。'
        getEditorUiState().setError(message)
        setActivityStatus({
          phase: 'error',
          tone: 'warning',
          title: '标准房间已创建但同步失败',
          detail: message,
          isBusy: false,
          canRetry: true,
          retryLabel: '重新同步',
          retryAction: 'reload',
        })
        return false
      }

      if (!result.focusAssetId || !result.selectionRestored) {
        const message = '标准房间已创建，但入口门在刷新后未恢复选中。请重新同步后继续编辑。'
        getEditorUiState().setError(message)
        setActivityStatus({
          phase: 'error',
          tone: 'warning',
          title: '标准房间已创建但未恢复选中',
          detail: message,
          isBusy: false,
          canRetry: true,
          retryLabel: '重新同步',
          retryAction: 'reload',
        })
        return false
      }

      setActivityStatus({
        phase: 'ready',
        tone: 'success',
        title: '标准房间已生成',
        detail: '已创建 4 段墙体与 1 樘入口门，可继续微调尺寸与门洞位置。',
        isBusy: false,
      })
      return true
    } catch (error) {
      const createdCount = isStandardRoomCreationError(error) ? error.createdCount : 0
      const focusAssetId = isStandardRoomCreationError(error) ? error.focusAssetId : null
      let partialReloadSucceeded = false
      if (createdCount > 0) {
        partialReloadSucceeded = await reload('manual')
        if (partialReloadSucceeded && focusAssetId) {
          getEditorViewerState().selectStaticAsset(focusAssetId)
        }
      }

      const message = describeEditorOperationError(error, '生成标准房间失败')
      getEditorUiState().setError(message)
      setActivityStatus({
        phase: 'error',
        tone: 'danger',
        title: createdCount > 0 ? '标准房间创建未完成' : '生成标准房间失败',
        detail:
          createdCount > 0
            ? partialReloadSucceeded
              ? `已创建 ${createdCount} 个构件，当前结果已同步。${message}`
              : `已创建 ${createdCount} 个构件，但重新同步失败。${message}`
            : message,
        isBusy: false,
        canRetry: createdCount > 0,
        retryLabel: createdCount > 0 ? '重新同步' : undefined,
        retryAction: createdCount > 0 ? 'reload' : undefined,
      })
      return false
    } finally {
      getEditorUiState().setSaving(false)
    }
  }, [reload, workspaceId])

  const importDetectedFloorPlan = useCallback(
    async (
      detection: FloorPlanDetectionResultDto,
      reference: Pick<EditorFloorPlanReference, 'position' | 'scaleMeters'>
    ) => {
      const sceneStore = getEditorSceneState()
      const viewerStore = getEditorViewerState()
      const uiStore = getEditorUiState()
      const store = {
        ...sceneStore,
        ...viewerStore,
        ...uiStore,
      }
      if (store.isLoading || store.isSaving) return false

      uiStore.setSaving(true)
      uiStore.setError(null)
      setActivityStatus({
        phase: 'saving',
        tone: 'info',
        title: '导入 floor plan',
        detail: '正在把识别结果转换成当前工作区的墙体、门窗构件。',
        isBusy: true,
      })

      try {
        const result = await executeFloorPlanImport({
          detection,
          reference,
          createStaticAsset: (asset) => createAdminStaticAsset(workspaceId, asset),
          reload: () => reload('manual'),
          selectStaticAsset: (id) => {
            getEditorViewerState().selectStaticAsset(id)
            return getEditorViewerState().selectedStaticAssetId === id
          },
        })

        if (!result.reloadSucceeded) {
          const message = 'floor plan 已导入，但工作台重新同步失败。请重新同步后继续编辑。'
          getEditorUiState().setError(message)
          setActivityStatus({
            phase: 'error',
            tone: 'warning',
            title: 'floor plan 已导入但同步失败',
            detail: message,
            isBusy: false,
            canRetry: true,
            retryLabel: '重新同步',
            retryAction: 'reload',
          })
          return false
        }

        setActivityStatus({
          phase: 'ready',
          tone: 'success',
          title: 'floor plan 已导入',
          detail: `已创建 ${result.createdCount} 个可编辑构件。`,
          isBusy: false,
        })
        return true
      } catch (error) {
        const createdCount = isFloorPlanImportError(error) ? error.createdCount : 0
        const focusAssetId = isFloorPlanImportError(error) ? error.focusAssetId : null
        let partialReloadSucceeded = false

        if (createdCount > 0) {
          partialReloadSucceeded = await reload('manual')
          if (partialReloadSucceeded && focusAssetId) {
            getEditorViewerState().selectStaticAsset(focusAssetId)
          }
        }

        const message = describeEditorOperationError(error, 'floor plan 导入失败')
        getEditorUiState().setError(message)
        setActivityStatus({
          phase: 'error',
          tone: 'danger',
          title: createdCount > 0 ? 'floor plan 导入未完成' : 'floor plan 导入失败',
          detail:
            createdCount > 0
              ? partialReloadSucceeded
                ? `已导入 ${createdCount} 个构件，当前结果已同步。${message}`
                : `已导入 ${createdCount} 个构件，但重新同步失败。${message}`
              : message,
          isBusy: false,
          canRetry: createdCount > 0,
          retryLabel: createdCount > 0 ? '重新同步' : undefined,
          retryAction: createdCount > 0 ? 'reload' : undefined,
        })
        return false
      } finally {
        getEditorUiState().setSaving(false)
      }
    },
    [reload, workspaceId]
  )

  const publish = useCallback(async (): Promise<EditorPublishResult> => {
    const sceneStore = getEditorSceneState()
    const uiStore = getEditorUiState()
    const store = {
      ...sceneStore,
      ...uiStore,
    }
    if (store.isDirty || store.isSaving) {
      const message = '请先保存当前编辑内容，再执行 Publish'
      uiStore.setError(message)
      setActivityStatus({
        phase: 'error',
        tone: 'warning',
        title: 'Publish 已阻止',
        detail: message,
        isBusy: false,
      })
      return {
        status: 'blocked',
        completed: false,
        inProgress: false,
        recovered: false,
      }
    }

    uiStore.setError(null)
    setIsPublishing(true)
    setActivityStatus({
      phase: 'publishing',
      tone: 'info',
      title: '发布运行时场景',
      detail: '正在生成新的运行时包并刷新工作台状态。',
      isBusy: true,
    })

    try {
      const nextStatus = await triggerAdminPublish(workspaceId)
      setPublishStatus(nextStatus)
      await reload('publish')
      setActivityStatus({
        phase: 'ready',
        tone: 'success',
        title: '运行时已发布',
        detail: '最新发布结果已同步回编辑工作台。',
        isBusy: false,
      })
      return resolveEditorPublishResult({
        publishStatus: nextStatus,
        recovered: false,
      })
    } catch (error) {
      let failure = error

      if (isAdminApiError(error) && error.status === 409) {
        setActivityStatus({
          phase: 'recovering',
          tone: 'warning',
          title: '检测到已有发布任务',
          detail: '工作台正在自动接管现有发布流程并同步状态。',
          isBusy: true,
        })

        try {
          const syncedStatus = await fetchAdminPublishStatus(workspaceId)
          setPublishStatus(syncedStatus)
          await reload('publish')
          setActivityStatus({
            phase: syncedStatus.status === 'publishing' ? 'publishing' : 'ready',
            tone: syncedStatus.status === 'publishing' ? 'info' : 'success',
            title:
              syncedStatus.status === 'publishing'
                ? '已接入现有发布流程'
                : '发布状态已恢复',
            detail:
              syncedStatus.status === 'publishing'
                ? '已有发布任务正在执行，工作台状态已自动同步。'
                : '最新发布状态已经同步回工作台。',
            isBusy: syncedStatus.status === 'publishing',
          })
          return resolveEditorPublishResult({
            publishStatus: syncedStatus,
            recovered: true,
          })
        } catch (syncError) {
          failure = syncError
        }
      }

      try {
        setPublishStatus(await fetchAdminPublishStatus(workspaceId))
      } catch {
        // Keep the primary publish error visible when follow-up status sync also fails.
      }

      const message = describeEditorOperationError(failure, '发布运行时场景失败')
      getEditorUiState().setError(message)
      setActivityStatus({
        phase: 'error',
        tone: 'danger',
        title: '发布失败',
        detail: message,
        isBusy: false,
        canRetry: true,
        retryLabel: '重新发布',
        retryAction: 'publish',
      })
      return {
        status: 'failed',
        completed: false,
        inProgress: false,
        recovered: false,
      }
    } finally {
      setIsPublishing(false)
    }
  }, [reload, workspaceId])

  const effectivePublishStatus = useMemo(() => {
    if (!publishStatus) return null
    if (!isPublishing) return publishStatus

    return {
      ...publishStatus,
      status: 'publishing',
    } satisfies PublishStatus
  }, [isPublishing, publishStatus])

  const retryActivity = useCallback(async () => {
    switch (activityStatus.retryAction) {
      case 'reload':
        await reload('manual')
        return
      case 'save':
        await saveSelection()
        return
      case 'delete':
        await deleteSelection()
        return
      case 'publish':
        await publish()
        return
      case 'create_standard_room':
        await createStandardRoom()
        return
      case 'import_floor_plan':
        return
      default:
        return
    }
  }, [
    activityStatus.retryAction,
    createStandardRoom,
    deleteSelection,
    publish,
    reload,
    saveSelection,
  ])

  useEffect(() => {
    void reload('initial')
  }, [reload])

  return {
    reload,
    saveSelection,
    deleteSelection,
    duplicateSelection,
    createStandardRoom,
    importDetectedFloorPlan,
    publish,
    publishStatus: effectivePublishStatus,
    activityStatus,
    retryActivity,
    canPublish: canEditorPublish({
      publishStatus: effectivePublishStatus,
      isDirty,
      isSaving,
      isPublishing,
    }),
  }
}
