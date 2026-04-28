'use client'
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Copy,
  Expand,
  MousePointer2,
  Move,
  RefreshCw,
  Redo2,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { EditorActivityStatus } from '@/hooks/use-editor-digital-twin'
import { cn } from '@/lib/utils'
import type { PublishStatus } from '@/lib/digital-twin/admin'
import {
  getEditorSelectionKind,
  useEditorSceneStore,
  useEditorUiStore,
  useEditorViewerStore,
} from '@/lib/digital-twin/editor-store'
import {
  getStaticAssetCatalogItem,
  getStaticAssetKindLabel,
} from '@/lib/digital-twin/static-asset-catalog'
import { EditorCatalogRealtimePreview } from './EditorCatalogRealtimePreview'

type EditorToolbarProps = {
  onSave: () => void
  onPublish: () => void
  onDuplicate: () => void
  onDelete: () => void
  canPublish: boolean
  publishStatus: PublishStatus | null
  activityStatus: EditorActivityStatus
  className?: string
}

export function EditorToolbar({
  onSave,
  onPublish,
  onDuplicate,
  onDelete,
  canPublish,
  publishStatus,
  activityStatus,
  className,
}: EditorToolbarProps) {
  const selectedEntityId = useEditorViewerStore((state) => state.selectedEntityId)
  const selectedStaticAssetId = useEditorViewerStore((state) => state.selectedStaticAssetId)
  const placementCatalogId = useEditorUiStore((state) => state.placementCatalogId)
  const draftEntity = useEditorSceneStore((state) => state.draftEntity)
  const draftStaticAsset = useEditorSceneStore((state) => state.draftStaticAsset)
  const sceneId = useEditorSceneStore((state) => state.sceneConfig.id)
  const sceneName = useEditorSceneStore((state) => state.sceneConfig.name)
  const transformMode = useEditorUiStore((state) => state.transformMode)
  const historyLength = useEditorSceneStore((state) => state.history.length)
  const redoLength = useEditorSceneStore((state) => state.redoHistory.length)
  const hasSceneChanges = useEditorSceneStore((state) => state.hasSceneChanges)
  const isDirty = useEditorSceneStore((state) => state.isDirty)
  const isSaving = useEditorUiStore((state) => state.isSaving)
  const setTransformMode = useEditorUiStore((state) => state.setTransformMode)
  const undo = useEditorSceneStore((state) => state.undo)
  const redo = useEditorSceneStore((state) => state.redo)
  const selectionKind = getEditorSelectionKind({
    selectedEntityId,
    selectedStaticAssetId,
  })
  const armedCatalogItem = placementCatalogId
    ? getStaticAssetCatalogItem(placementCatalogId)
    : null
  const draftSelection = draftStaticAsset ?? draftEntity
  const hasDraftSelection = Boolean(draftSelection)
  const hasSelection = Boolean(selectionKind)
  const hasHistory = historyLength > 0 || redoLength > 0
  const heading = draftSelection?.name ?? armedCatalogItem?.name ?? '场景'
  const publishLabel =
    publishStatus?.status === 'publishing'
      ? 'Publishing'
      : publishStatus?.status === 'failed'
        ? 'Retry Publish'
        : 'Publish'
  const publishToneClass =
    publishStatus?.status === 'failed'
      ? 'border-[#f59e0b]/35 bg-[#3b2711]/72 text-[#ffd7a1]'
      : publishStatus?.status === 'published'
        ? 'border-[#65c6a4]/35 bg-[#0f2b23]/72 text-[#baf2db]'
        : publishStatus?.status === 'publishing'
          ? 'border-[#7da7ff]/35 bg-[#15233c]/72 text-[#d6e4ff]'
          : 'border-[#7da7ff]/28 bg-[#122035]/70 text-[#d6e4ff]'
  const publishMeta =
    publishStatus?.status === 'failed'
      ? publishStatus.lastError ?? '发布失败，请重试'
      : publishStatus?.status === 'publishing'
        ? [
            publishStatus.activePublishStartedAt
              ? `开始 ${new Date(publishStatus.activePublishStartedAt).toLocaleTimeString(
                  'zh-CN',
                  {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }
                )}`
              : null,
            publishStatus.activePublishHeartbeatAt
              ? `心跳 ${new Date(publishStatus.activePublishHeartbeatAt).toLocaleTimeString(
                  'zh-CN',
                  {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }
                )}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ') || '正在发布并持续同步进度'
      : publishStatus?.lastPublishedAt
        ? `v${publishStatus.lastPublishedVersion ?? '--'} · ${new Date(
            publishStatus.lastPublishedAt
          ).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}`
        : publishStatus?.compilerSource
          ? `Runtime source · ${publishStatus.compilerSource}`
          : 'Runtime publish state'
  const publishBadge =
    publishStatus?.status === 'failed'
      ? 'Failed'
      : publishStatus?.status === 'publishing'
        ? 'Publishing'
        : publishStatus?.hasUnpublishedChanges
          ? 'Unpublished'
          : 'Published'
  const subtitle = armedCatalogItem
    ? '已就绪，拖入或点击画布完成摆放'
    : selectionKind === 'static-asset'
      ? draftStaticAsset?.variant
        ? `${getStaticAssetKindLabel(draftStaticAsset.assetKind)} / ${draftStaticAsset.variant}`
        : draftStaticAsset
          ? getStaticAssetKindLabel(draftStaticAsset.assetKind)
          : '静态对象'
      : selectionKind === 'entity'
        ? `${draftEntity?.type ?? '实体'} / ${draftEntity?.status ?? 'active'}`
        : '选择对象后进入编辑'
  const sessionBadge =
    activityStatus.phase === 'recovering'
      ? 'Recovering'
      : activityStatus.phase === 'publishing'
        ? 'Publishing'
        : activityStatus.phase === 'saving'
          ? 'Saving'
          : activityStatus.phase === 'loading'
            ? 'Syncing'
            : activityStatus.phase === 'error'
              ? 'Attention'
        : 'Ready'
  const showSessionBadge = sessionBadge !== 'Ready'
  const saveLabel = isSaving
    ? 'Saving changes'
    : hasSelection
      ? hasSceneChanges
        ? 'Save selection and scene changes'
        : 'Save current draft'
      : 'Save scene workspace'
  const sessionToneClass =
    activityStatus.tone === 'danger'
      ? 'border-[#ff9e9e]/35 bg-[#2f161a]/74 text-[#ffd5d8]'
      : activityStatus.tone === 'warning'
        ? 'border-[#f6bf6a]/35 bg-[#352515]/74 text-[#ffe0ad]'
        : activityStatus.tone === 'success'
          ? 'border-[#65c6a4]/35 bg-[#102a24]/74 text-[#c9f7e4]'
          : activityStatus.tone === 'info'
            ? 'border-[#7da7ff]/35 bg-[#15233c]/72 text-[#d6e4ff]'
            : 'border-white/12 bg-white/[0.035] text-white/88'
  const SessionIcon = activityStatus.isBusy
    ? RefreshCw
    : activityStatus.tone === 'danger' || activityStatus.tone === 'warning'
      ? AlertTriangle
      : activityStatus.tone === 'success'
        ? CheckCircle2
        : Sparkles

  return (
    <div
      className={cn(
        'pointer-events-auto editor-toolbar w-full max-w-full px-1.5 py-1 text-white',
        className
      )}
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="editor-pill">模型编辑器</span>
            <span className="truncate text-[11px] text-white/58">
              {sceneName?.trim() || '当前模型'}
            </span>
            {sceneId ? (
              <span className="hidden truncate rounded-full border border-white/10 bg-white/6 px-2 py-1 text-[10px] text-white/48 md:inline-flex">
                {sceneId}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
        <div className="editor-block flex min-w-0 items-center gap-1.5 px-1.5 py-1">
          {armedCatalogItem ? (
            <EditorCatalogRealtimePreview item={armedCatalogItem} />
          ) : (
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[#7da7ff]/30 bg-[#7da7ff]/14 text-[#cfe0ff]">
              <Boxes className="size-3.5" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-white">{heading}</p>
            <p className="truncate text-[11px] text-white/52">{subtitle}</p>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-1">
          <div
            data-editor-session-state={activityStatus.phase}
            className={cn(
              'editor-block flex min-w-[13rem] items-center gap-2 px-2 py-1.5',
              sessionToneClass
            )}
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-current/20 bg-black/10">
              <SessionIcon className={cn('size-3.5', activityStatus.isBusy && 'animate-spin')} />
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12px] font-semibold">{activityStatus.title}</span>
              <span className="truncate text-[11px] opacity-80">{activityStatus.detail}</span>
            </div>

            {showSessionBadge ? (
              <span className="editor-pill shrink-0 border-current/25 bg-black/10">{sessionBadge}</span>
            ) : null}
          </div>

          <div
            className={cn(
              'editor-block flex min-w-[13rem] items-center gap-2 px-2 py-1.5',
              publishToneClass
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12px] font-semibold">{publishBadge}</span>
              <span className="truncate text-[11px] opacity-80">{publishMeta}</span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className={cn('editor-control is-primary shrink-0', !canPublish && 'opacity-70')}
              onClick={onPublish}
              disabled={!canPublish}
              aria-label={publishLabel}
              title={publishLabel}
            >
              {publishStatus?.status === 'publishing' ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {publishLabel}
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            className={cn('editor-control editor-tool-control', transformMode === 'select' && 'is-active')}
            aria-label="Switch tool to select"
            title="Switch tool to select"
            onClick={() => setTransformMode('select')}
          >
            <MousePointer2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn('editor-control editor-tool-control', transformMode === 'translate' && 'is-active')}
            aria-label="Switch tool to move"
            title="Switch tool to move"
            onClick={() => setTransformMode('translate')}
            disabled={!hasDraftSelection}
          >
            <Move className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn('editor-control editor-tool-control', transformMode === 'rotate' && 'is-active')}
            aria-label="Switch tool to rotate"
            title="Switch tool to rotate"
            onClick={() => setTransformMode('rotate')}
            disabled={!hasDraftSelection}
          >
            <RotateCcw className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn('editor-control editor-tool-control', transformMode === 'scale' && 'is-active')}
            aria-label="Switch tool to scale"
            title="Switch tool to scale"
            onClick={() => setTransformMode('scale')}
            disabled={!hasDraftSelection}
          >
            <Expand className="size-4" />
          </Button>

          {hasHistory ? (
            <Separator orientation="vertical" className="editor-separator hidden lg:block" />
          ) : null}

          {hasHistory ? (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                className="editor-control"
                onClick={undo}
                disabled={historyLength === 0}
                aria-label="Undo last change"
                title="Undo last change"
              >
                <Undo2 className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="editor-control"
                onClick={redo}
                disabled={redoLength === 0}
                aria-label="Redo last change"
                title="Redo last change"
              >
                <Redo2 className="size-4" />
              </Button>
            </>
          ) : null}

          {hasSelection ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="editor-control"
              onClick={onDuplicate}
              aria-label="Duplicate selected object"
              title="Duplicate selected object"
            >
              <Copy className="size-4" />
            </Button>
          ) : null}

          {hasSelection ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="editor-control is-danger"
              onClick={onDelete}
              disabled={isSaving}
              aria-label="Delete selected object"
              title="Delete selected object"
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}

          {isDirty || isSaving ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="editor-control is-primary"
              onClick={onSave}
              disabled={!isDirty || isSaving}
              aria-label={saveLabel}
              title={saveLabel}
            >
              <Save className="size-4" />
            </Button>
          ) : null}
        </div>
        </div>
      </div>
    </div>
  )
}
