'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type EditorSaveRequest,
  createAdminStaticAsset,
  deleteAdminEntity,
  deleteAdminStaticAsset,
  fetchAdminPublishStatus,
  fetchEditorBootstrap,
  isAdminApiError,
  saveAdminEditorDrafts,
  triggerAdminPublish,
} from '@/lib/digital-twin/bootstrap-client'
import type { PublishStatus } from '@/lib/digital-twin/admin'
import {
  buildEditorSceneSavePayload,
  getEditorSelectionKind,
  type EditorDigitalTwinStore,
  useEditorDigitalTwinStore,
} from '@/lib/digital-twin/editor-store'
import {
  DEFAULT_PUBLISHED_SCENE_PACKAGE,
  loadPublishedScenePackage,
  withVersionedPublishedScenePackage,
} from '@/lib/digital-twin/publish'
import {
  createStandardRoomStaticAssets,
  isStandardRoomEntryDoorAsset,
} from '@/lib/digital-twin/standard-room'
import type {
  PublishedSceneRuntimeDescriptor,
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

type ReloadReason = 'initial' | 'manual' | 'publish'

export interface EditorActivityStatus {
  phase: EditorActivityPhase
  tone: EditorActivityTone
  title: string
  detail: string
  isBusy: boolean
  canRetry?: boolean
  retryLabel?: string
}

async function resolvePublishedScenePackage(
  publishedScene?: PublishedSceneRuntimeDescriptor | null
) {
  if (!publishedScene) return DEFAULT_PUBLISHED_SCENE_PACKAGE

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

function describeEditorOperationError(error: unknown, fallback: string) {
  if (isAdminApiError(error)) {
    switch (error.status) {
      case 409:
        return '已有发布任务正在执行，工作台会自动接管最新状态。'
      default:
        return error.message
    }
  }

  return error instanceof Error ? error.message : fallback
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

export function useEditorDigitalTwin() {
  const [publishStatus, setPublishStatus] = useState<PublishStatus | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const [activityStatus, setActivityStatus] = useState<EditorActivityStatus>({
    phase: 'loading',
    tone: 'info',
    title: '同步编辑器工作台',
    detail: '正在载入场景、发布状态与资源库。',
    isBusy: true,
  })
  const selectedEntityId = useEditorDigitalTwinStore((state) => state.selectedEntityId)
  const selectedStaticAssetId = useEditorDigitalTwinStore(
    (state) => state.selectedStaticAssetId
  )
  const duplicateSelectionState = useEditorDigitalTwinStore(
    (state) => state.duplicateSelection
  )
  const isDirty = useEditorDigitalTwinStore((state) => state.isDirty)
  const isSaving = useEditorDigitalTwinStore((state) => state.isSaving)

  const reload = useCallback(
    async (reason: ReloadReason = 'manual') => {
      const store = useEditorDigitalTwinStore.getState()
      const syncDetail =
        reason === 'publish'
          ? '正在刷新发布结果与当前工作台上下文。'
          : reason === 'initial'
            ? '正在载入场景、发布状态与资源库。'
            : '正在重新同步场景、资源与发布状态。'

      store.setLoading(true)
      setActivityStatus({
        phase: 'loading',
        tone: 'info',
        title: '同步编辑器工作台',
        detail: syncDetail,
        isBusy: true,
      })

      try {
        const [payload, nextPublishStatus] = await Promise.all([
          fetchEditorBootstrap(),
          fetchAdminPublishStatus(),
        ])
        const publishedScenePackage = await resolvePublishedScenePackage(payload.publishedScene)
        useEditorDigitalTwinStore.getState().hydrateFromBootstrap(
          payload,
          publishedScenePackage,
          {
            preserveEditorCameraPose: reason !== 'initial',
          }
        )
        setPublishStatus(nextPublishStatus)
        useEditorDigitalTwinStore.getState().setError(null)
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
        useEditorDigitalTwinStore.getState().setError(message)
        setActivityStatus({
          phase: 'error',
          tone: 'danger',
          title: '工作台同步失败',
          detail: message,
          isBusy: false,
          canRetry: true,
          retryLabel: '重新同步',
        })
        return false
      } finally {
        useEditorDigitalTwinStore.getState().setLoading(false)
      }
    },
    []
  )

  const saveSelection = useCallback(async () => {
    const store = useEditorDigitalTwinStore.getState()
    const hasSceneChanges = store.hasSceneChanges
    const hasSelectionChanges = store.hasSelectionChanges

    if (!hasSceneChanges && !hasSelectionChanges) return false
    store.setSaving(true)
    store.setError(null)
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
      if (!request) return false
      const response = await saveAdminEditorDrafts(request)

      const focusEntityId = response.savedEntity?.id ?? null
      const focusStaticAssetId = response.savedStaticAsset?.id ?? null

      const reloadSucceeded = await reload('manual')
      const selectionRestored = restoreSelectionAfterReload({
        reloadSucceeded,
        savedEntityId: focusEntityId,
        savedStaticAssetId: focusStaticAssetId,
        selectEntity: (id) => {
          useEditorDigitalTwinStore.getState().selectEntity(id)
          return useEditorDigitalTwinStore.getState().selectedEntityId === id
        },
        selectStaticAsset: (id) => {
          useEditorDigitalTwinStore.getState().selectStaticAsset(id)
          return useEditorDigitalTwinStore.getState().selectedStaticAssetId === id
        },
      })

      if (!reloadSucceeded) {
        const message = '编辑内容已保存，但工作台重新同步失败。请重新同步后继续编辑。'
        useEditorDigitalTwinStore.getState().setError(message)
        setActivityStatus({
          phase: 'error',
          tone: 'warning',
          title: '保存成功但同步失败',
          detail: message,
          isBusy: false,
          canRetry: true,
          retryLabel: '重新同步',
        })
        return false
      }

      if ((focusEntityId || focusStaticAssetId) && !selectionRestored) {
        const message = '编辑内容已保存，但刷新后未恢复当前选中对象。请重新同步后继续编辑。'
        useEditorDigitalTwinStore.getState().setError(message)
        setActivityStatus({
          phase: 'error',
          tone: 'warning',
          title: '保存成功但未恢复选中',
          detail: message,
          isBusy: false,
          canRetry: true,
          retryLabel: '重新同步',
        })
        return false
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
      return true
    } catch (error) {
      const message = describeEditorOperationError(error, '保存编辑内容失败')
      useEditorDigitalTwinStore.getState().setError(message)
      setActivityStatus({
        phase: 'error',
        tone: 'danger',
        title: '保存失败',
        detail: message,
        isBusy: false,
        canRetry: true,
        retryLabel: '重试保存',
      })
      return false
    } finally {
      useEditorDigitalTwinStore.getState().setSaving(false)
    }
  }, [reload])

  const deleteSelection = useCallback(async () => {
    const store = useEditorDigitalTwinStore.getState()
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

    store.setSaving(true)
    store.setError(null)
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
        await deleteAdminEntity(selectedEntityId)
      } else {
        if (!selectedStaticAssetId) return false
        await deleteAdminStaticAsset(selectedStaticAssetId)
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
      useEditorDigitalTwinStore.getState().setError(message)
      setActivityStatus({
        phase: 'error',
        tone: 'danger',
        title: '删除失败',
        detail: message,
        isBusy: false,
        canRetry: true,
        retryLabel: '重试删除',
      })
      return false
    } finally {
      useEditorDigitalTwinStore.getState().setSaving(false)
    }
  }, [reload, selectedEntityId, selectedStaticAssetId])

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
    const store = useEditorDigitalTwinStore.getState()
    if (store.isLoading || store.isSaving) return false

    store.setSaving(true)
    store.setError(null)
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
        createStaticAsset: createAdminStaticAsset,
        reload: () => reload('manual'),
        selectStaticAsset: (id) => {
          useEditorDigitalTwinStore.getState().selectStaticAsset(id)
          return useEditorDigitalTwinStore.getState().selectedStaticAssetId === id
        },
      })

      if (!result.reloadSucceeded) {
        const message = '标准房间已创建，但工作台重新同步失败。请重新同步后继续编辑。'
        useEditorDigitalTwinStore.getState().setError(message)
        setActivityStatus({
          phase: 'error',
          tone: 'warning',
          title: '标准房间已创建但同步失败',
          detail: message,
          isBusy: false,
          canRetry: true,
          retryLabel: '重新同步',
        })
        return false
      }

      if (!result.focusAssetId || !result.selectionRestored) {
        const message = '标准房间已创建，但入口门在刷新后未恢复选中。请重新同步后继续编辑。'
        useEditorDigitalTwinStore.getState().setError(message)
        setActivityStatus({
          phase: 'error',
          tone: 'warning',
          title: '标准房间已创建但未恢复选中',
          detail: message,
          isBusy: false,
          canRetry: true,
          retryLabel: '重新同步',
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
          useEditorDigitalTwinStore.getState().selectStaticAsset(focusAssetId)
        }
      }

      const message = describeEditorOperationError(error, '生成标准房间失败')
      useEditorDigitalTwinStore.getState().setError(message)
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
      })
      return false
    } finally {
      useEditorDigitalTwinStore.getState().setSaving(false)
    }
  }, [reload])

  const publish = useCallback(async () => {
    const store = useEditorDigitalTwinStore.getState()
    if (store.isDirty || store.isSaving) {
      const message = '请先保存当前编辑内容，再执行 Publish'
      store.setError(message)
      setActivityStatus({
        phase: 'error',
        tone: 'warning',
        title: 'Publish 已阻止',
        detail: message,
        isBusy: false,
      })
      return false
    }

    store.setError(null)
    setIsPublishing(true)
    setActivityStatus({
      phase: 'publishing',
      tone: 'info',
      title: '发布运行时场景',
      detail: '正在生成新的运行时包并刷新工作台状态。',
      isBusy: true,
    })

    try {
      const nextStatus = await triggerAdminPublish()
      setPublishStatus(nextStatus)
      await reload('publish')
      setActivityStatus({
        phase: 'ready',
        tone: 'success',
        title: '运行时已发布',
        detail: '最新发布结果已同步回编辑工作台。',
        isBusy: false,
      })
      return true
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
          const syncedStatus = await fetchAdminPublishStatus()
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
          return true
        } catch (syncError) {
          failure = syncError
        }
      }

      try {
        setPublishStatus(await fetchAdminPublishStatus())
      } catch {
        // Keep the primary publish error visible when follow-up status sync also fails.
      }

      const message = describeEditorOperationError(failure, '发布运行时场景失败')
      useEditorDigitalTwinStore.getState().setError(message)
      setActivityStatus({
        phase: 'error',
        tone: 'danger',
        title: '发布失败',
        detail: message,
        isBusy: false,
        canRetry: true,
        retryLabel: '重新发布',
      })
      return false
    } finally {
      setIsPublishing(false)
    }
  }, [reload])

  const effectivePublishStatus = useMemo(() => {
    if (!publishStatus) return null
    if (!isPublishing) return publishStatus

    return {
      ...publishStatus,
      status: 'publishing',
    } satisfies PublishStatus
  }, [isPublishing, publishStatus])

  useEffect(() => {
    void reload('initial')
  }, [reload])

  return {
    reload,
    saveSelection,
    deleteSelection,
    duplicateSelection,
    createStandardRoom,
    publish,
    publishStatus: effectivePublishStatus,
    activityStatus,
    canPublish:
      Boolean(effectivePublishStatus?.hasUnpublishedChanges) &&
      !isDirty &&
      !isSaving &&
      !isPublishing,
  }
}
