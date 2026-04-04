'use client'

import Link from 'next/link'
import {
  Boxes,
  Move,
  RefreshCw,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import {
  getEditorSelectionKind,
  useEditorDigitalTwinStore,
} from '@/lib/digital-twin/editor-store'
import { getStaticAssetCatalogItem } from '@/lib/digital-twin/static-asset-catalog'

export function EditorToolbar({
  onReload,
  onSave,
  onDelete,
}: {
  onReload: () => void
  onSave: () => void
  onDelete: () => void
}) {
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
  const armStaticAssetPlacement = useEditorDigitalTwinStore(
    (state) => state.armStaticAssetPlacement
  )
  const undo = useEditorDigitalTwinStore((state) => state.undo)
  const redo = useEditorDigitalTwinStore((state) => state.redo)
  const resetDraft = useEditorDigitalTwinStore((state) => state.resetDraft)
  const armedCatalogItem = placementCatalogId
    ? getStaticAssetCatalogItem(placementCatalogId)
    : null
  const selectionKind = getEditorSelectionKind({
    selectedEntityId,
    selectedStaticAssetId,
  })
  const draftSelection = draftStaticAsset ?? draftEntity
  const heading =
    draftSelection?.name ?? armedCatalogItem?.name ?? 'Select an entity or arm a catalog item'
  const subtitle = armedCatalogItem
    ? `Click the canvas to place ${armedCatalogItem.name}.`
    : selectionKind === 'static-asset'
      ? 'Authored overlay editing stays separate from the published runtime chunk.'
      : selectionKind === 'entity'
        ? 'Entity transforms are authored here and committed back through the editor flow.'
        : 'Catalog placement, in-canvas picking, transform gizmo, and explicit save all stay on /editor.'
  const statusTone = isDirty ? 'Unsaved' : isSaving ? 'Saving' : 'Synced'

  return (
    <header className="pointer-events-none sticky top-0 z-40 px-3 pt-3 md:px-4 md:pt-4 lg:px-5">
      <div className="pointer-events-auto editor-toolbar mx-auto w-full max-w-[1160px] p-3 text-white">
        <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap lg:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <SidebarTrigger className="editor-control shrink-0" />
            <div className="editor-separator hidden sm:block" />

            <div className="editor-block flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#7da7ff]/30 bg-[#7da7ff]/14 text-[#cfe0ff]">
                <Boxes className="size-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-white">{heading}</p>
                  <span className="editor-pill">
                    {draftStaticAsset
                      ? draftStaticAsset.assetKind
                      : draftEntity?.type ?? 'editor'}
                  </span>
                  {armedCatalogItem ? (
                    <span className="editor-pill">Placement armed</span>
                  ) : null}
                  <span className="editor-pill">{statusTone}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] leading-4 text-white/48">
                  <span className="truncate">{subtitle}</span>
                  <span className="hidden h-1 w-1 rounded-full bg-white/18 xl:block" />
                  <span className="hidden xl:block">
                    History {historyLength}/{redoLength}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'editor-control',
                transformMode === 'translate' && 'is-active'
              )}
              onClick={() => setTransformMode('translate')}
              disabled={!draftSelection}
            >
              <Move className="size-4" />
              Translate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'editor-control',
                transformMode === 'rotate' && 'is-active'
              )}
              onClick={() => setTransformMode('rotate')}
              disabled={!draftSelection}
            >
              <RotateCcw className="size-4" />
              Rotate
            </Button>

            <Separator orientation="vertical" className="editor-separator hidden lg:block" />

            <Button
              variant="ghost"
              size="icon-sm"
              className="editor-control"
              onClick={undo}
              disabled={historyLength === 0}
            >
              <Undo2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="editor-control"
              onClick={redo}
              disabled={redoLength === 0}
            >
              <Redo2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="editor-control"
              onClick={() => {
                if (armedCatalogItem) {
                  armStaticAssetPlacement(null)
                  return
                }
                resetDraft()
              }}
              disabled={!draftSelection && !armedCatalogItem}
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="editor-control"
              onClick={onReload}
            >
              <RefreshCw className="size-4" />
            </Button>

            <Separator orientation="vertical" className="editor-separator hidden lg:block" />

            <Button
              variant="ghost"
              size="sm"
              className="editor-control is-primary"
              onClick={onSave}
              disabled={!isDirty || isSaving}
            >
              <Save className="size-4" />
              {isSaving ? 'Saving' : 'Save'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="editor-control is-danger"
              onClick={onDelete}
              disabled={!selectedStaticAssetId || isSaving}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
            <Button asChild variant="ghost" size="sm" className="editor-control">
              <Link href="/">Viewer</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="editor-control">
              <Link href="/admin/overview">Admin</Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
