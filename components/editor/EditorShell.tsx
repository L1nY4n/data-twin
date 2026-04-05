'use client'

import dynamic from 'next/dynamic'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { useEditorDigitalTwin } from '@/hooks/use-editor-digital-twin'
import {
  getEditorSelectionKind,
  useEditorDigitalTwinStore,
} from '@/lib/digital-twin/editor-store'
import {
  getStaticAssetCatalogItem,
} from '@/lib/digital-twin/static-asset-catalog'
import { EditorAppSidebar } from './EditorAppSidebar'
import { EditorInspector } from './EditorInspector'
import { EditorToolbar } from './EditorToolbar'

const EditorCanvas = dynamic(
  () => import('@/components/editor/EditorCanvas').then((mod) => mod.EditorCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#dce7f5]">
        <div className="flex flex-col items-center gap-3 rounded-[28px] border border-white/65 bg-[#0d1117]/78 px-6 py-5 text-white shadow-[0_24px_60px_rgba(8,12,20,0.32)] backdrop-blur-xl">
          <Spinner className="h-8 w-8 text-[#7da7ff]" />
          <span className="text-sm text-white/70">加载 3D 编辑器...</span>
        </div>
      </div>
    ),
  }
)

export function EditorShell() {
  const { reload, saveSelection, deleteSelection } = useEditorDigitalTwin()
  const isLoading = useEditorDigitalTwinStore((state) => state.isLoading)
  const error = useEditorDigitalTwinStore((state) => state.error)
  const isDirty = useEditorDigitalTwinStore((state) => state.isDirty)
  const transformMode = useEditorDigitalTwinStore((state) => state.transformMode)
  const selectedEntityId = useEditorDigitalTwinStore((state) => state.selectedEntityId)
  const selectedStaticAssetId = useEditorDigitalTwinStore(
    (state) => state.selectedStaticAssetId
  )
  const placementCatalogId = useEditorDigitalTwinStore((state) => state.placementCatalogId)
  const historyLength = useEditorDigitalTwinStore((state) => state.history.length)
  const redoLength = useEditorDigitalTwinStore((state) => state.redoHistory.length)
  const selectionKind = getEditorSelectionKind({
    selectedEntityId,
    selectedStaticAssetId,
  })
  const armedCatalogItem = placementCatalogId
    ? getStaticAssetCatalogItem(placementCatalogId)
    : null

  return (
    <div className="editor-surface relative min-h-svh overflow-hidden bg-[#dce7f5] text-slate-950">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at top left, rgba(255,255,255,0.96), transparent 28%), radial-gradient(circle at top right, rgba(167,189,223,0.4), transparent 32%), linear-gradient(180deg, #eef4fb 0%, #dce7f2 52%, #d3deeb 100%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-45"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage:
            'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.42) 56%, rgba(255,255,255,0) 100%)',
        }}
      />

      <SidebarProvider
        defaultOpen
        className="relative z-10 flex min-h-svh [--sidebar-width:20.75rem] [--sidebar-width-icon:4.5rem]"
      >
        <EditorAppSidebar />
        <SidebarInset className="bg-transparent md:peer-data-[variant=inset]:m-0 md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:shadow-none">
          <EditorToolbar
            onReload={() => void reload()}
            onSave={() => void saveSelection()}
            onDelete={() => void deleteSelection()}
          />

          <main className="-mt-24 flex flex-1 px-3 pb-3 md:-mt-28 md:px-4 md:pb-4 lg:px-5 lg:pb-5">
            <div className="mx-auto flex w-full max-w-[1840px] flex-col gap-5 pt-24 md:pt-28">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="editor-canvas-frame relative overflow-hidden">
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage:
                        'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.14) 36%, rgba(255,255,255,0.08) 100%)',
                    }}
                  />

                  <div className="pointer-events-none absolute inset-x-4 top-4 z-20 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="pointer-events-auto editor-panel editor-panel--soft max-w-[18.5rem] px-4 py-3 text-white">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-[#7da7ff]" />
                        <p className="editor-kicker">Workspace</p>
                      </div>
                      <p className="mt-2 text-[13px] font-semibold leading-5">
                        Published scene + authored overlays
                      </p>
                      <p className="mt-1 text-[11px] leading-4 text-white/56">
                        Place, adjust, then explicitly save before it reaches the runtime
                        viewer.
                      </p>
                    </div>

                    <div className="pointer-events-auto flex flex-wrap items-center gap-2">
                      {isLoading ? (
                        <Badge className="editor-pill is-floating">Syncing</Badge>
                      ) : error ? (
                        <Badge className="editor-pill is-floating">Connection Issue</Badge>
                      ) : (
                        <Badge className="editor-pill is-floating">Scene Ready</Badge>
                      )}
                      <Badge className="editor-pill is-floating">
                        {selectionKind === 'static-asset'
                          ? 'Static Asset'
                          : selectionKind === 'entity'
                            ? 'Entity'
                            : 'Idle'}
                      </Badge>
                      <Badge className="editor-pill is-floating">
                        {armedCatalogItem ? `Armed · ${armedCatalogItem.name}` : 'Authoring Surface'}
                      </Badge>
                    </div>
                  </div>

                  <div className="relative h-[min(78svh,940px)] min-h-[560px] xl:h-[calc(100svh-7.5rem)] xl:min-h-[720px]">
                    <EditorCanvas />

                    {error ? (
                      <div className="pointer-events-none absolute inset-x-4 top-28 z-30 rounded-[22px] border border-[#ff9e9e]/40 bg-[#1b1014]/84 px-4 py-3 text-sm text-[#ffd4d4] shadow-[0_20px_50px_rgba(43,12,16,0.24)] backdrop-blur-xl">
                        {error}
                      </div>
                    ) : null}

                    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 hidden justify-center px-4 md:flex">
                      <div className="pointer-events-auto editor-dock flex max-w-[min(100%,920px)] flex-wrap items-center justify-center gap-2 px-4 py-3 text-white">
                        <span className="editor-pill is-soft">
                          {armedCatalogItem
                            ? `Placement · ${armedCatalogItem.name}`
                            : selectionKind === 'static-asset'
                              ? 'Editing · static asset'
                              : selectionKind === 'entity'
                                ? 'Editing · entity'
                                : 'Idle'}
                        </span>
                        <span className="editor-pill is-soft">
                          Transform · {transformMode === 'translate' ? 'translate' : 'rotate'}
                        </span>
                        <span className="editor-pill is-soft">
                          History · {historyLength} / {redoLength}
                        </span>
                        <span className="editor-pill is-soft">
                          Status ·{' '}
                          {error
                            ? 'offline'
                            : isLoading
                              ? 'syncing'
                              : isDirty
                                ? 'unsaved'
                                : 'synced'}
                        </span>
                      </div>
                    </div>
                  </div>
                </section>

                <aside className="xl:sticky xl:top-24 xl:h-[calc(100svh-7.5rem)]">
                  <EditorInspector />
                </aside>
              </div>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
