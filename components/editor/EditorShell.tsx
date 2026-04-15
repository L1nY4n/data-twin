'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { useIsMobile } from '@/hooks/use-mobile'
import { useEditorDigitalTwin } from '@/hooks/use-editor-digital-twin'
import { useEditorUiStore } from '@/lib/digital-twin/editor-store'
import { cn } from '@/lib/utils'
import { EditorAppSidebar } from './EditorAppSidebar'
import { EditorInspector } from './EditorInspector'
import { EditorToolbar } from './EditorToolbar'
import { EditorViewportDock } from './EditorViewportDock'
import { useEditorChromeMotion } from './useEditorChromeMotion'

const EditorCanvas = dynamic(
  () => import('@/components/editor/EditorCanvas').then((mod) => mod.EditorCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="editor-canvas-loading-shell flex h-full w-full items-center justify-center">
        <div className="editor-loading-card flex flex-col items-center gap-3 px-6 py-5 text-white">
          <Spinner className="h-8 w-8 text-[#7da7ff]" />
          <span className="text-sm text-white/70">加载 3D 编辑器...</span>
        </div>
      </div>
    ),
  }
)

const COLLAPSED_PANEL_SIZE = 40
const MOBILE_RESOURCES_PANEL_WIDTH = 244
const DESKTOP_RESOURCES_PANEL_DEFAULT = 252
const DESKTOP_INSPECTOR_PANEL_DEFAULT = 252
const DESKTOP_RESOURCES_PANEL_MIN = 224
const DESKTOP_RESOURCES_PANEL_MAX = 420
const DESKTOP_INSPECTOR_PANEL_MIN = 224
const DESKTOP_INSPECTOR_PANEL_MAX = 420
const DESKTOP_MIN_CENTER_WIDTH = 460
const RESIZE_EDGE_HIT_AREA = 10

function clampPanelWidth(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function isPointerNearResizeEdge(
  side: 'left' | 'right',
  rect: DOMRect,
  clientX: number
) {
  return side === 'left'
    ? rect.right - clientX <= RESIZE_EDGE_HIT_AREA
    : clientX - rect.left <= RESIZE_EDGE_HIT_AREA
}

export function EditorShell({
  workspaceHint,
  returnHref,
}: {
  workspaceHint?: string
  returnHref?: string
}) {
  const {
    saveSelection,
    deleteSelection,
    duplicateSelection,
    createStandardRoom,
    publish,
    publishStatus,
    activityStatus,
    retryActivity,
    canPublish,
  } = useEditorDigitalTwin()
  const isMobile = useIsMobile()
  const error = useEditorUiStore((state) => state.error)
  const [resourcesPanelOpen, setResourcesPanelOpen] = useState(true)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [resourcesPanelWidth, setResourcesPanelWidth] = useState(
    DESKTOP_RESOURCES_PANEL_DEFAULT
  )
  const [inspectorPanelWidth, setInspectorPanelWidth] = useState(
    DESKTOP_INSPECTOR_PANEL_DEFAULT
  )
  const [viewportWidth, setViewportWidth] = useState(0)
  const [isLargeViewport, setIsLargeViewport] = useState(false)
  const [activeResizeHandle, setActiveResizeHandle] = useState<'left' | 'right' | null>(null)
  const [hoveredResizeEdge, setHoveredResizeEdge] = useState<'left' | 'right' | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const leftPanelRef = useRef<HTMLDivElement | null>(null)
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const rightPanelRef = useRef<HTMLDivElement | null>(null)
  const dockRef = useRef<HTMLDivElement | null>(null)
  const resizeSessionRef = useRef<{
    side: 'left' | 'right'
    startX: number
    startWidth: number
  } | null>(null)

  useEffect(() => {
    if (isMobile) {
      setResourcesPanelOpen(false)
    }
  }, [isMobile])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const syncViewport = () => {
      setViewportWidth(window.innerWidth)
      setIsLargeViewport(mediaQuery.matches)
    }

    syncViewport()
    window.addEventListener('resize', syncViewport)
    mediaQuery.addEventListener('change', syncViewport)

    return () => {
      window.removeEventListener('resize', syncViewport)
      mediaQuery.removeEventListener('change', syncViewport)
    }
  }, [])

  const getPanelWidthBounds = useCallback(
    (side: 'left' | 'right') => {
      const surfaceWidth = rootRef.current?.clientWidth ?? viewportWidth ?? 0
      const otherPanelWidth =
        side === 'left'
          ? isLargeViewport && !inspectorCollapsed
            ? inspectorPanelWidth
            : COLLAPSED_PANEL_SIZE
          : resourcesPanelOpen && !isMobile
            ? resourcesPanelWidth
            : COLLAPSED_PANEL_SIZE
      const min = side === 'left' ? DESKTOP_RESOURCES_PANEL_MIN : DESKTOP_INSPECTOR_PANEL_MIN
      const hardMax = side === 'left' ? DESKTOP_RESOURCES_PANEL_MAX : DESKTOP_INSPECTOR_PANEL_MAX
      const availableMax = surfaceWidth
        ? surfaceWidth - otherPanelWidth - DESKTOP_MIN_CENTER_WIDTH
        : hardMax

      return {
        min,
        max: clampPanelWidth(availableMax, min, hardMax),
      }
    },
    [
      inspectorCollapsed,
      inspectorPanelWidth,
      isLargeViewport,
      isMobile,
      resourcesPanelOpen,
      resourcesPanelWidth,
      viewportWidth,
    ]
  )

  useEffect(() => {
    if (!isLargeViewport) return

    const leftBounds = getPanelWidthBounds('left')
    const rightBounds = getPanelWidthBounds('right')

    setResourcesPanelWidth((value) =>
      clampPanelWidth(value, leftBounds.min, leftBounds.max)
    )
    setInspectorPanelWidth((value) =>
      clampPanelWidth(value, rightBounds.min, rightBounds.max)
    )
  }, [getPanelWidthBounds, isLargeViewport])

  const stopResizingPanels = useCallback(() => {
    resizeSessionRef.current = null
    setActiveResizeHandle(null)
    setHoveredResizeEdge(null)
    document.body.style.removeProperty('cursor')
    document.body.style.removeProperty('userSelect')
  }, [])

  useEffect(() => {
    if (!activeResizeHandle) return

    const handlePointerMove = (event: PointerEvent) => {
      const session = resizeSessionRef.current
      if (!session) return

      event.preventDefault()
      if (session.side === 'left') {
        const bounds = getPanelWidthBounds('left')
        setResourcesPanelWidth(
          clampPanelWidth(session.startWidth + (event.clientX - session.startX), bounds.min, bounds.max)
        )
        return
      }

      const bounds = getPanelWidthBounds('right')
      setInspectorPanelWidth(
        clampPanelWidth(session.startWidth - (event.clientX - session.startX), bounds.min, bounds.max)
      )
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResizingPanels)
    window.addEventListener('pointercancel', stopResizingPanels)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResizingPanels)
      window.removeEventListener('pointercancel', stopResizingPanels)
    }
  }, [activeResizeHandle, getPanelWidthBounds, stopResizingPanels])

  const beginPanelResize = useCallback(
    (side: 'left' | 'right') => (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isLargeViewport) return
      if (side === 'left' && (!resourcesPanelOpen || isMobile)) return
      if (side === 'right' && inspectorCollapsed) return

      const panelRect = event.currentTarget.getBoundingClientRect()
      if (!isPointerNearResizeEdge(side, panelRect, event.clientX)) {
        return
      }

      event.preventDefault()
      resizeSessionRef.current = {
        side,
        startX: event.clientX,
        startWidth: side === 'left' ? resourcesPanelWidth : inspectorPanelWidth,
      }
      setActiveResizeHandle(side)
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
    },
    [
      inspectorCollapsed,
      inspectorPanelWidth,
      isLargeViewport,
      isMobile,
      resourcesPanelOpen,
      resourcesPanelWidth,
    ]
  )

  const handleResizeEdgePointerMove = useCallback(
    (side: 'left' | 'right') => (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isLargeViewport) return
      if (side === 'left' && (!resourcesPanelOpen || isMobile)) return
      if (side === 'right' && inspectorCollapsed) return

      const panelRect = event.currentTarget.getBoundingClientRect()
      setHoveredResizeEdge((current) =>
        isPointerNearResizeEdge(side, panelRect, event.clientX)
          ? side
          : current === side
            ? null
            : current
      )
    },
    [inspectorCollapsed, isLargeViewport, isMobile, resourcesPanelOpen]
  )

  const handleResizeEdgePointerLeave = useCallback(
    (side: 'left' | 'right') => () => {
      setHoveredResizeEdge((current) => (current === side ? null : current))
    },
    []
  )

  useEditorChromeMotion({
    rootRef,
    leftPanelRef,
    toolbarRef,
    rightPanelRef,
    dockRef,
    resourcesPanelOpen,
    inspectorCollapsed,
  })

  const shouldShowStatusBanner =
    Boolean(error) || activityStatus.phase === 'recovering' || activityStatus.phase === 'error'
  const canRetryCurrentOperation = Boolean(activityStatus.canRetry && activityStatus.retryAction)
  const statusBannerToneClass =
    activityStatus.tone === 'danger'
      ? 'border-[#ff9e9e]/40 bg-[#1b1014]/84 text-[#ffd4d4] shadow-[0_18px_44px_rgba(43,12,16,0.22)]'
      : 'border-[#f6bf6a]/35 bg-[#2a2114]/82 text-[#ffe0ad] shadow-[0_18px_44px_rgba(62,38,10,0.22)]'
  const bannerDetail = error ?? activityStatus.detail
  const resourcesPanelInlineSize = resourcesPanelOpen
    ? isMobile
      ? MOBILE_RESOURCES_PANEL_WIDTH
      : resourcesPanelWidth
    : COLLAPSED_PANEL_SIZE
  const inspectorPanelInlineSize = inspectorCollapsed
    ? COLLAPSED_PANEL_SIZE
    : inspectorPanelWidth

  useEffect(() => {
    return () => {
      stopResizingPanels()
    }
  }, [stopResizingPanels])

  return (
    <div
      ref={rootRef}
      className="editor-surface relative min-h-svh overflow-hidden text-slate-950"
    >
      <div aria-hidden className="editor-shell-backdrop absolute inset-0" />
      <div aria-hidden className="editor-shell-grid absolute inset-0" />
      <div aria-hidden className="editor-shell-vignette absolute inset-0" />

      <div className="relative z-10 flex min-h-svh">
        <main className="min-w-0 flex flex-1 flex-col px-1.5 py-1.5 md:px-2 md:py-2 lg:px-2.5 lg:py-2.5">
          <section className="editor-canvas-frame relative h-[calc(100svh-0.75rem)] min-h-[520px] w-full overflow-hidden md:h-[calc(100svh-1rem)] lg:h-[calc(100svh-1.25rem)] xl:min-h-[680px]">
            <div aria-hidden className="editor-canvas-sheen absolute inset-0" />

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
                  'absolute left-3 z-30 transition-[height,opacity,transform] duration-200',
                  (hoveredResizeEdge === 'left' || activeResizeHandle === 'left') &&
                    'cursor-ew-resize',
                  resourcesPanelOpen
                    ? isMobile
                      ? 'inset-y-3 w-[15.25rem]'
                      : 'inset-y-3 w-[15.75rem]'
                    : 'top-3 h-10 w-10'
                )}
                style={!isMobile ? { width: `${resourcesPanelInlineSize}px` } : undefined}
                data-editor-resize-hover={hoveredResizeEdge === 'left'}
                onPointerMove={handleResizeEdgePointerMove('left')}
                onPointerLeave={handleResizeEdgePointerLeave('left')}
                onPointerDown={beginPanelResize('left')}
              >
                <div
                  ref={leftPanelRef}
                  data-editor-chrome="resources"
                  data-editor-collapsed={!resourcesPanelOpen}
                  className={cn('pointer-events-auto', resourcesPanelOpen ? 'h-full' : 'h-10')}
                >
                  <EditorAppSidebar
                    collapsed={!resourcesPanelOpen}
                    onToggleCollapse={() => setResourcesPanelOpen((value) => !value)}
                    returnHref={returnHref}
                  />
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-14 md:px-16 lg:px-24">
                <div className="flex w-full max-w-[60rem] flex-col items-center gap-1.5">
                  <div
                    ref={toolbarRef}
                    data-editor-chrome="toolbar"
                    className="pointer-events-auto w-full"
                  >
                    <EditorToolbar
                      onSave={() => void saveSelection()}
                      onPublish={() => void publish()}
                      onDuplicate={() => void duplicateSelection()}
                      onDelete={() => void deleteSelection()}
                      canPublish={canPublish}
                      publishStatus={publishStatus}
                      activityStatus={activityStatus}
                      workspaceHint={workspaceHint}
                    />
                  </div>

                  {shouldShowStatusBanner ? (
                    <div className="pointer-events-auto w-full max-w-[21rem] self-end xl:mt-1">
                      <div
                        className={cn(
                          'flex items-start gap-2.5 rounded-[16px] border px-3 py-2 backdrop-blur-xl',
                          statusBannerToneClass
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-current/68">
                            {activityStatus.title}
                          </p>
                          <p className="mt-0.5 text-[12px] leading-4 text-current/92">
                            {bannerDetail}
                          </p>
                        </div>

                        {canRetryCurrentOperation ? (
                          <button
                            type="button"
                            className="rounded-full border border-current/20 bg-black/10 px-2.5 py-1 text-[10px] font-semibold text-current transition hover:bg-black/20"
                            onClick={() => void retryActivity()}
                            title={activityStatus.retryLabel ?? '重试当前操作'}
                            aria-label={activityStatus.retryLabel ?? '重试当前操作'}
                          >
                            {activityStatus.retryLabel ?? '重试'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                className={cn(
                  'absolute right-3 z-30 hidden transition-[height,opacity,transform] duration-200 lg:block',
                  (hoveredResizeEdge === 'right' || activeResizeHandle === 'right') &&
                    'cursor-ew-resize',
                  inspectorCollapsed ? 'top-3 h-10 w-10' : 'inset-y-3 w-[15.75rem]'
                )}
                style={{ width: `${inspectorPanelInlineSize}px` }}
                data-editor-resize-hover={hoveredResizeEdge === 'right'}
                onPointerMove={handleResizeEdgePointerMove('right')}
                onPointerLeave={handleResizeEdgePointerLeave('right')}
                onPointerDown={beginPanelResize('right')}
              >
                <div
                  ref={rightPanelRef}
                  data-editor-chrome="inspector"
                  data-editor-collapsed={inspectorCollapsed}
                  className={cn('pointer-events-auto', inspectorCollapsed ? 'h-10' : 'h-full')}
                >
                  <EditorInspector
                    collapsed={inspectorCollapsed}
                    onToggleCollapse={() => setInspectorCollapsed((value) => !value)}
                    onCreateStandardRoom={() => void createStandardRoom()}
                    createStandardRoomBusy={activityStatus.isBusy}
                  />
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-2.5 z-20 hidden justify-center px-2.5 md:flex xl:bottom-3">
                <div
                  ref={dockRef}
                  data-editor-chrome="dock"
                  className="pointer-events-auto"
                >
                  <EditorViewportDock />
                </div>
              </div>
            </div>
          </section>

          <div className="mt-2.5 lg:hidden">
            <EditorInspector
              onCreateStandardRoom={() => void createStandardRoom()}
              createStandardRoomBusy={activityStatus.isBusy}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
