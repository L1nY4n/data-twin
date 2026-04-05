'use client'

import {
  Boxes,
  Copy,
  Expand,
  MousePointer2,
  Move,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  getEditorSelectionKind,
  useEditorDigitalTwinStore,
} from '@/lib/digital-twin/editor-store'
import { getStaticAssetCatalogItem } from '@/lib/digital-twin/static-asset-catalog'

type EditorToolbarProps = {
  onSave: () => void
  onDuplicate: () => void
  onDelete: () => void
  className?: string
}

export function EditorToolbar({
  onSave,
  onDuplicate,
  onDelete,
  className,
}: EditorToolbarProps) {
  const selectedEntityId = useEditorDigitalTwinStore((state) => state.selectedEntityId)
  const selectedStaticAssetId = useEditorDigitalTwinStore(
    (state) => state.selectedStaticAssetId
  )
  const placementCatalogId = useEditorDigitalTwinStore((state) => state.placementCatalogId)
  const draftEntity = useEditorDigitalTwinStore((state) => state.draftEntity)
  const draftStaticAsset = useEditorDigitalTwinStore((state) => state.draftStaticAsset)
  const transformMode = useEditorDigitalTwinStore((state) => state.transformMode)
  const historyLength = useEditorDigitalTwinStore((state) => state.history.length)
  const redoLength = useEditorDigitalTwinStore((state) => state.redoHistory.length)
  const isDirty = useEditorDigitalTwinStore((state) => state.isDirty)
  const isSaving = useEditorDigitalTwinStore((state) => state.isSaving)
  const setTransformMode = useEditorDigitalTwinStore((state) => state.setTransformMode)
  const undo = useEditorDigitalTwinStore((state) => state.undo)
  const redo = useEditorDigitalTwinStore((state) => state.redo)
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
  const subtitle = armedCatalogItem
    ? '已就绪，拖入或点击画布完成摆放'
    : selectionKind === 'static-asset'
      ? draftStaticAsset?.variant
        ? `${draftStaticAsset.assetKind} / ${draftStaticAsset.variant}`
        : draftStaticAsset?.assetKind ?? '静态对象'
      : selectionKind === 'entity'
        ? `${draftEntity?.type ?? '实体'} / ${draftEntity?.status ?? 'active'}`
        : '选择对象后进入编辑'
  const selectionBadge = armedCatalogItem
    ? 'Placement'
    : selectionKind === 'static-asset'
      ? 'Asset'
      : selectionKind === 'entity'
        ? 'Entity'
        : 'Scene'

  return (
    <div
      className={cn(
        'pointer-events-auto editor-toolbar w-full max-w-full px-1.5 py-1 text-white',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-1">
        <div className="editor-block flex min-w-0 items-center gap-1.5 px-1.5 py-1">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[#7da7ff]/30 bg-[#7da7ff]/14 text-[#cfe0ff]">
            <Boxes className="size-3.5" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="editor-kicker">Context</p>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
              <p className="truncate text-[12px] font-semibold text-white">{heading}</p>
              <span className="editor-pill">{selectionBadge}</span>
            </div>
            <p className="truncate text-[11px] text-white/52">{subtitle}</p>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn('editor-control', transformMode === 'select' && 'is-active')}
            aria-label="Switch tool to select"
            title="Switch tool to select"
            onClick={() => setTransformMode('select')}
          >
            <MousePointer2 className="size-4" />
            Select
          </Button>
          {hasDraftSelection ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className={cn('editor-control', transformMode === 'translate' && 'is-active')}
                aria-label="Switch tool to move"
                title="Switch tool to move"
                onClick={() => setTransformMode('translate')}
              >
                <Move className="size-4" />
                Move
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn('editor-control', transformMode === 'rotate' && 'is-active')}
                aria-label="Switch tool to rotate"
                title="Switch tool to rotate"
                onClick={() => setTransformMode('rotate')}
              >
                <RotateCcw className="size-4" />
                Rotate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn('editor-control', transformMode === 'scale' && 'is-active')}
                aria-label="Switch tool to scale"
                title="Switch tool to scale"
                onClick={() => setTransformMode('scale')}
              >
                <Expand className="size-4" />
                Scale
              </Button>
            </>
          ) : null}

          {hasHistory ? <Separator orientation="vertical" className="editor-separator hidden lg:block" /> : null}

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
              size="sm"
              className="editor-control"
              onClick={onDuplicate}
              aria-label="Duplicate selected object"
              title="Duplicate selected object"
            >
              <Copy className="size-4" />
              Duplicate
            </Button>
          ) : null}

          {hasSelection ? (
            <Button
              variant="ghost"
              size="sm"
              className="editor-control is-danger"
              onClick={onDelete}
              disabled={isSaving}
              aria-label="Delete selected object"
              title="Delete selected object"
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          ) : null}

          {isDirty || isSaving ? (
            <Button
              variant="ghost"
              size="sm"
              className="editor-control is-primary"
              onClick={onSave}
              disabled={!isDirty || isSaving}
              aria-label={isSaving ? 'Saving current draft' : 'Save current draft'}
              title={isSaving ? 'Saving current draft' : 'Save current draft'}
            >
              <Save className="size-4" />
              {isSaving ? 'Saving' : 'Save'}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
