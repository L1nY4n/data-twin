'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { useIsMobile } from '@/hooks/use-mobile'
import { useEditorDigitalTwin } from '@/hooks/use-editor-digital-twin'
import { useEditorDigitalTwinStore } from '@/lib/digital-twin/editor-store'
import { cn } from '@/lib/utils'
import { EditorAppSidebar } from './EditorAppSidebar'
import { EditorInspector } from './EditorInspector'
import { EditorToolbar } from './EditorToolbar'
import { EditorViewportDock } from './EditorViewportDock'

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
  const { saveSelection, deleteSelection, duplicateSelection } = useEditorDigitalTwin()
  const isMobile = useIsMobile()
  const error = useEditorDigitalTwinStore((state) => state.error)
  const [resourcesPanelOpen, setResourcesPanelOpen] = useState(true)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)

  useEffect(() => {
    if (isMobile) {
      setResourcesPanelOpen(false)
    }
  }, [isMobile])

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

      <div className="relative z-10 flex min-h-svh">
        <main className="min-w-0 flex flex-1 flex-col px-1.5 py-1.5 md:px-2 md:py-2 lg:px-2.5 lg:py-2.5">
          <section className="editor-canvas-frame relative h-[calc(100svh-0.75rem)] min-h-[520px] w-full overflow-hidden md:h-[calc(100svh-1rem)] lg:h-[calc(100svh-1.25rem)] xl:min-h-[680px]">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.14) 36%, rgba(255,255,255,0.08) 100%)',
              }}
            />

            {isMobile ? (
              <div
                className={cn(
                  'absolute inset-0 z-30 bg-[#07101d]/26 transition-opacity duration-200 md:hidden',
                  resourcesPanelOpen
                    ? 'pointer-events-auto opacity-100'
                    : 'pointer-events-none opacity-0'
                )}
                onClick={() => setResourcesPanelOpen(false)}
              />
            ) : null}

            <div className="relative h-full">
              <EditorCanvas />

              <div
                className={cn(
                  'pointer-events-none absolute left-3 z-30 transition-[width,height,opacity,transform] duration-200',
                  resourcesPanelOpen
                    ? isMobile
                      ? 'inset-y-3 w-[15.25rem]'
                      : 'inset-y-3 w-[15.75rem]'
                    : 'top-3 h-10 w-10'
                )}
              >
                <div
                  className={cn(
                    'pointer-events-auto',
                    resourcesPanelOpen ? 'h-full' : 'h-10'
                  )}
                >
                  <EditorAppSidebar
                    collapsed={!resourcesPanelOpen}
                    onToggleCollapse={() => setResourcesPanelOpen((value) => !value)}
                  />
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-0 top-2.5 z-20 flex justify-center px-14 md:px-16 lg:px-24">
                <div className="pointer-events-auto w-full max-w-[60rem]">
                  <EditorToolbar
                    onSave={() => void saveSelection()}
                    onDuplicate={() => void duplicateSelection()}
                    onDelete={() => void deleteSelection()}
                  />
                </div>
              </div>

              {error ? (
                <div className="pointer-events-none absolute left-1/2 top-[4.6rem] z-30 w-[min(calc(100%-2rem),34rem)] -translate-x-1/2 rounded-[16px] border border-[#ff9e9e]/40 bg-[#1b1014]/84 px-3 py-2 text-sm text-[#ffd4d4] shadow-[0_18px_44px_rgba(43,12,16,0.22)] backdrop-blur-xl">
                  {error}
                </div>
              ) : null}

              <div
                className={cn(
                  'pointer-events-none absolute right-3 z-30 hidden transition-[width,height,opacity,transform] duration-200 lg:block',
                  inspectorCollapsed
                    ? 'top-3 h-10 w-10'
                    : 'inset-y-3 w-[15.75rem]'
                )}
              >
                <div
                  className={cn(
                    'pointer-events-auto',
                    inspectorCollapsed ? 'h-10' : 'h-full'
                  )}
                >
                  <EditorInspector
                    collapsed={inspectorCollapsed}
                    onToggleCollapse={() => setInspectorCollapsed((value) => !value)}
                  />
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-2.5 z-20 hidden justify-center px-2.5 md:flex">
                <div className="pointer-events-auto">
                  <EditorViewportDock />
                </div>
              </div>
            </div>
          </section>

          <div className="mt-2.5 lg:hidden">
            <EditorInspector />
          </div>
        </main>
      </div>
    </div>
  )
}
