'use client'

import dynamic from 'next/dynamic'
import type { KeyboardEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  Boxes,
  Camera,
  Eye,
  EyeOff,
  LocateFixed,
  PanelLeft,
  PanelRight,
  Search,
  X,
} from 'lucide-react'
import { useLiveDigitalTwin } from '@/hooks/use-live-digital-twin'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { EntityListPanel } from '@/components/digital-twin/panels/EntityListPanel'
import { EntityDetailPanel } from '@/components/digital-twin/panels/EntityDetailPanel'
import { IncidentVideoDialog } from '@/components/digital-twin/panels/IncidentVideoDialog'
import { Toolbar } from '@/components/digital-twin/panels/Toolbar'
import { ViewerHmiOverlay } from '@/components/digital-twin/panels/ViewerHmiOverlay'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import {
  ViewerAdminEdgePanel,
  ViewerAdminPanel,
  ViewerAdminSurfaceShell,
} from '@/components/viewer-admin/primitives'
import { cn } from '@/lib/utils'

const DigitalTwinCanvas = dynamic(
  () => import('@/components/digital-twin/scene/DigitalTwinCanvas').then((mod) => mod.DigitalTwinCanvas),
  {
    ssr: false,
    loading: () => (
      <div
        data-viewer-ui-panel="canvas-loading"
        className="flex h-full w-full items-center justify-center bg-[#0a0a0f]"
      >
        <div className="flex flex-col items-center gap-3">
          <Spinner className="h-8 w-8 text-primary" />
          <span className="text-sm text-muted-foreground">加载3D引擎...</span>
        </div>
      </div>
    ),
  }
)

const BottomPanel = dynamic(
  () => import('@/components/digital-twin/panels/BottomPanel').then((mod) => mod.BottomPanel),
  { ssr: false }
)

function useDigitalTwinViewportState() {
  const leftPanelOpen = useDigitalTwinStore((state) => state.leftPanelOpen)
  const rightPanelOpen = useDigitalTwinStore((state) => state.rightPanelOpen)
  const bottomPanelOpen = useDigitalTwinStore((state) => state.bottomPanelOpen)
  const hmiOverlayVisible = useDigitalTwinStore((state) => state.hmiOverlayVisible)
  const runtimeNotice = useDigitalTwinStore((state) => state.runtimeNotice)
  const isConnected = useDigitalTwinStore((state) => state.isConnected)
  const runtimeDataSource = useDigitalTwinStore((state) => state.runtimeDataSource)
  const rendererDiagnostics = useDigitalTwinStore((state) => state.rendererDiagnostics)
  const publishedScenePackage = useDigitalTwinStore((state) => state.publishedScenePackage)
  const staticFeatureRegistry = useDigitalTwinStore((state) => state.staticFeatureRegistry)
  const entityDirectory = useDigitalTwinStore((state) => state.entityDirectory)
  const selectedEntityId = useDigitalTwinStore((state) => state.selectedEntityId)
  const selectedStaticFeatureId = useDigitalTwinStore((state) => state.selectedStaticFeatureId)
  const cameraPresets = useDigitalTwinStore((state) => state.cameraPresets)
  const activeCameraPreset = useDigitalTwinStore((state) => state.activeCameraPreset)
  const setActiveCameraPreset = useDigitalTwinStore((state) => state.setActiveCameraPreset)
  const clearCameraFocusRequest = useDigitalTwinStore((state) => state.clearCameraFocusRequest)
  const setViewMode = useDigitalTwinStore((state) => state.setViewMode)
  const toggleLeftPanel = useDigitalTwinStore((state) => state.toggleLeftPanel)
  const toggleRightPanel = useDigitalTwinStore((state) => state.toggleRightPanel)
  const toggleBottomPanel = useDigitalTwinStore((state) => state.toggleBottomPanel)
  const toggleHmiOverlayVisible = useDigitalTwinStore((state) => state.toggleHmiOverlayVisible)
  const setSelectedEntity = useDigitalTwinStore((state) => state.setSelectedEntity)
  const setSelectedStaticFeature = useDigitalTwinStore((state) => state.setSelectedStaticFeature)
  const focusCameraOnEntity = useDigitalTwinStore((state) => state.focusCameraOnEntity)
  const focusCameraOnStaticFeature = useDigitalTwinStore((state) => state.focusCameraOnStaticFeature)

  return {
    leftPanelOpen,
    rightPanelOpen,
    bottomPanelOpen,
    hmiOverlayVisible,
    runtimeNotice,
    isConnected,
    runtimeDataSource,
    rendererDiagnostics,
    publishedScenePackage,
    staticFeatureRegistry,
    entityDirectory,
    selectedEntityId,
    selectedStaticFeatureId,
    cameraPresets,
    activeCameraPreset,
    setActiveCameraPreset,
    clearCameraFocusRequest,
    setViewMode,
    toggleLeftPanel,
    toggleRightPanel,
    toggleBottomPanel,
    toggleHmiOverlayVisible,
    setSelectedEntity,
    setSelectedStaticFeature,
    focusCameraOnEntity,
    focusCameraOnStaticFeature,
  }
}

export function DigitalTwinViewerPage({
  workspaceId,
  workspaceSlug,
}: {
  workspaceId: string
  workspaceSlug: string
}) {
  const { isLoading, error } = useLiveDigitalTwin(workspaceId)
  const {
    leftPanelOpen,
    rightPanelOpen,
    bottomPanelOpen,
    hmiOverlayVisible,
    runtimeNotice,
    isConnected,
    runtimeDataSource,
    rendererDiagnostics,
    publishedScenePackage,
    staticFeatureRegistry,
    entityDirectory,
    selectedEntityId,
    selectedStaticFeatureId,
    cameraPresets,
    activeCameraPreset,
    setActiveCameraPreset,
    clearCameraFocusRequest,
    setViewMode,
    toggleLeftPanel,
    toggleRightPanel,
    toggleBottomPanel,
    toggleHmiOverlayVisible,
    setSelectedEntity,
    setSelectedStaticFeature,
    focusCameraOnEntity,
    focusCameraOnStaticFeature,
  } = useDigitalTwinViewportState()
  const [quickSearchQuery, setQuickSearchQuery] = useState('')

  const sectorCount = publishedScenePackage.sectors.length
  const staticFeatureCount = publishedScenePackage.staticChunks.reduce(
    (count, chunk) => count + chunk.features.length,
    0
  )
  const activeSelectionLabel = selectedEntityId || selectedStaticFeatureId ? '已选择' : '未选择'
  const visibleEntityCount = Array.from(entityDirectory.values()).filter((entry) => entry.visible).length
  const runtimeStatusLabel = isConnected ? 'LIVE' : runtimeDataSource === 'mock' ? 'MOCK' : 'OFFLINE'
  const rendererBackendLabel = rendererDiagnostics.storageBufferActive
    ? 'GPU storage'
    : rendererDiagnostics.backend.toUpperCase()
  const sidePanelOpen = leftPanelOpen || rightPanelOpen || bottomPanelOpen
  const quickCameraPresets = useMemo(() => cameraPresets.slice(0, 3), [cameraPresets])
  const rightDockOffsetClass = bottomPanelOpen
    ? 'right-[476px]'
    : rightPanelOpen
      ? 'right-[336px]'
      : 'right-4'
  const normalizedQuickSearchQuery = quickSearchQuery.trim().toLowerCase()
  const quickSearchResults = useMemo(() => {
    if (!normalizedQuickSearchQuery) return []

    const entityResults = Array.from(entityDirectory.values())
      .filter((entry) => {
        if (!entry.visible) return false
        const haystack = [
          entry.name,
          entry.id,
          entry.secondaryLabel,
          entry.categoryLabel,
          entry.categoryKey,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return haystack.includes(normalizedQuickSearchQuery)
      })
      .map((entry) => ({
        id: entry.id,
        kind: 'entity' as const,
        title: entry.name,
        subtitle: `${entry.secondaryLabel ?? entry.categoryLabel ?? entry.type} · ${entry.id}`,
      }))

    const staticFeatureResults = staticFeatureRegistry.entries
      .filter((entry) => {
        const { feature, chunk, sector } = entry
        const haystack = [
          feature.label,
          feature.id,
          feature.kind,
          feature.districtName,
          feature.variant,
          chunk.label,
          sector?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return haystack.includes(normalizedQuickSearchQuery)
      })
      .map((entry) => ({
        id: entry.feature.id,
        kind: 'static' as const,
        title: entry.feature.label,
        subtitle: `${entry.sector?.name ?? entry.chunk.label} · ${entry.feature.kind}`,
      }))

    return [...entityResults, ...staticFeatureResults].slice(0, 6)
  }, [entityDirectory, normalizedQuickSearchQuery, staticFeatureRegistry])
  const showQuickSearchResults = normalizedQuickSearchQuery.length > 0
  const handleQuickSearchSelect = (entry: (typeof quickSearchResults)[number]) => {
    if (entry.kind === 'entity') {
      setSelectedEntity(entry.id)
      focusCameraOnEntity(entry.id)
      if (!leftPanelOpen) toggleLeftPanel()
    } else {
      setSelectedStaticFeature(entry.id)
      focusCameraOnStaticFeature(entry.id)
      if (!rightPanelOpen) toggleRightPanel()
    }
    setQuickSearchQuery('')
  }
  const handleQuickSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setQuickSearchQuery('')
      return
    }

    if (event.key === 'Enter' && quickSearchResults[0]) {
      event.preventDefault()
      handleQuickSearchSelect(quickSearchResults[0])
    }
  }
  const handleQuickCameraPresetSelect = (presetId: string) => {
    clearCameraFocusRequest()
    setViewMode('orbit')
    setActiveCameraPreset(presetId)
  }

  useEffect(() => {
    const handleKeyboardShortcut = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      if (event.key.toLowerCase() !== 'h') return

      event.preventDefault()
      toggleHmiOverlayVisible()
    }

    window.addEventListener('keydown', handleKeyboardShortcut)
    return () => window.removeEventListener('keydown', handleKeyboardShortcut)
  }, [toggleHmiOverlayVisible])

  return (
    <ViewerAdminSurfaceShell
      className="viewer-surface h-screen overflow-hidden"
      innerClassName="viewer-admin-content relative h-screen overflow-hidden"
    >
      <div className="absolute inset-0 p-2">
        <div className="viewer-admin-canvas-frame editor-canvas-frame relative h-full overflow-hidden rounded-[30px]">
            <DigitalTwinCanvas />

            {runtimeNotice && (
              <div
                data-viewer-ui-panel="runtime-notice"
                className="pointer-events-none absolute left-3 top-3 z-30 md:hidden"
              >
                <Badge className="border border-amber-300/40 bg-amber-500/10 text-amber-50 shadow-lg">
                  {runtimeNotice}
                </Badge>
              </div>
            )}

            <div
              data-viewer-ui-panel="runtime-status-badge"
              className={cn(
                'viewer-runtime-badge absolute top-4 z-30',
                leftPanelOpen ? 'left-[356px]' : 'left-4'
              )}
              aria-label={`运行状态 ${runtimeStatusLabel}`}
            >
              <span
                className={cn(
                  'viewer-runtime-badge__dot',
                  isConnected
                    ? 'viewer-runtime-badge__dot--live'
                    : runtimeDataSource === 'mock'
                      ? 'viewer-runtime-badge__dot--mock'
                      : 'viewer-runtime-badge__dot--offline'
                )}
                aria-hidden
              />
              <span className="viewer-runtime-badge__brand">data-t</span>
              <span
                className={cn(
                  'viewer-runtime-badge__status',
                  isConnected
                    ? 'viewer-runtime-badge__status--live'
                    : runtimeDataSource === 'mock'
                      ? 'viewer-runtime-badge__status--mock'
                      : 'viewer-runtime-badge__status--offline'
                )}
              >
                {runtimeStatusLabel}
              </span>
              <span className="viewer-runtime-badge__renderer">{rendererBackendLabel}</span>
            </div>

            {(isLoading || error) && (
              <div
                data-viewer-ui-panel="connection-overlay"
                className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-background/60 backdrop-blur-sm"
              >
                <ViewerAdminPanel className="rounded-2xl px-4 py-3 text-sm shadow-sm">
                  {error ? `后端连接失败: ${error}` : '正在连接后端数据...'}
                </ViewerAdminPanel>
              </div>
            )}

            {hmiOverlayVisible && <ViewerHmiOverlay panelOpen={sidePanelOpen} />}
            <Toolbar workspaceSlug={workspaceSlug} />

            <div
              data-viewer-ui-panel="panel-launcher"
              className={cn(
                'viewer-panel-toolbar absolute top-4 z-40 flex items-center gap-1.5',
                rightDockOffsetClass
              )}
            >
              <div className="viewer-panel-toolbar__scene-pill" aria-label="当前3D场景规模">
                <span><strong>{sectorCount}</strong> sectors</span>
                <span><strong>{staticFeatureCount}</strong> assets</span>
              </div>
              <div className="viewer-panel-toolbar__actions" aria-label="3D viewer 面板控件">
                <Button
                  type="button"
                  variant={leftPanelOpen ? 'secondary' : 'ghost'}
                  size="sm"
                  className="viewer-panel-toolbar__button"
                  aria-pressed={leftPanelOpen}
                  aria-label="展开对象树"
                  onClick={toggleLeftPanel}
                >
                  <PanelLeft className="h-4 w-4" />
                  <span className="viewer-panel-toolbar__badge">{visibleEntityCount}</span>
                </Button>
                <Button
                  type="button"
                  variant={rightPanelOpen ? 'secondary' : 'ghost'}
                  size="sm"
                  className="viewer-panel-toolbar__button"
                  aria-pressed={rightPanelOpen}
                  aria-label="展开检查器"
                  onClick={toggleRightPanel}
                >
                  <PanelRight className="h-4 w-4" />
                  <span className="viewer-panel-toolbar__badge">{activeSelectionLabel}</span>
                </Button>
                <Button
                  type="button"
                  variant={bottomPanelOpen ? 'secondary' : 'ghost'}
                  size="sm"
                  className="viewer-panel-toolbar__button"
                  aria-pressed={bottomPanelOpen}
                  aria-label="展开事件消息"
                  onClick={toggleBottomPanel}
                >
                  <Bell className="h-4 w-4" />
                  <span className="viewer-panel-toolbar__badge">{bottomPanelOpen ? 'open' : 'msg'}</span>
                </Button>
              </div>
            </div>

            <div
              data-viewer-ui-panel="viewer-command-strip"
              className={cn(
                'viewer-command-strip absolute bottom-4 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-2 xl:flex',
                sidePanelOpen && 'viewer-command-strip--hidden'
              )}
              aria-label="场景快速搜索与相机提示"
            >
              <div className="viewer-command-strip__search">
                <Search className="viewer-command-strip__search-icon h-4 w-4" />
                <input
                  type="search"
                  value={quickSearchQuery}
                  onChange={(event) => setQuickSearchQuery(event.target.value)}
                  onKeyDown={handleQuickSearchKeyDown}
                  className="viewer-command-strip__input"
                  placeholder="Search objects, signals, sectors..."
                  aria-label="全局对象搜索"
                />
                {quickSearchQuery && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="viewer-command-strip__clear h-6 w-6"
                    onClick={() => setQuickSearchQuery('')}
                    aria-label="清空全局搜索"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
                {showQuickSearchResults && (
                  <div className="viewer-command-palette" role="listbox" aria-label="全局对象搜索结果">
                    {quickSearchResults.length > 0 ? (
                      quickSearchResults.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className="viewer-command-palette__item"
                          onClick={() => handleQuickSearchSelect(entry)}
                          role="option"
                          aria-selected={false}
                        >
                          <span>
                            <strong>{entry.title}</strong>
                            <small>{entry.subtitle}</small>
                          </span>
                          <small className="viewer-command-palette__kind">
                            {entry.kind === 'entity' ? 'Entity' : 'Asset'}
                          </small>
                          <LocateFixed className="h-3.5 w-3.5" />
                        </button>
                      ))
                    ) : (
                      <div className="viewer-command-palette__empty">没有匹配对象</div>
                    )}
                  </div>
                )}
              </div>
              <span className="viewer-command-strip__divider" aria-hidden />
              <Boxes className="h-4 w-4" />
              <span>{visibleEntityCount} visible</span>
            </div>

            <div
              data-viewer-ui-panel="camera-preset-dock"
              className={cn(
                'viewer-camera-dock absolute bottom-4 z-30 hidden items-center gap-1.5 xl:flex',
                rightDockOffsetClass
              )}
              aria-label="相机快捷视角与HMI控制"
            >
              <div className="viewer-camera-dock__presets" role="group" aria-label="相机预设快捷切换">
                {quickCameraPresets.map((preset, index) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'viewer-camera-dock__button',
                      activeCameraPreset === preset.id && 'is-active'
                    )}
                    aria-pressed={activeCameraPreset === preset.id}
                    aria-label={`切换到相机预设 ${preset.name}`}
                    title={`相机预设 ${preset.name}`}
                    onClick={() => handleQuickCameraPresetSelect(preset.id)}
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span className="viewer-camera-dock__index">C{index + 1}</span>
                    <span className="viewer-camera-dock__label">{preset.name}</span>
                  </Button>
                ))}
              </div>
              <span className="viewer-camera-dock__divider" aria-hidden />
              <Button
                type="button"
                variant={hmiOverlayVisible ? 'secondary' : 'ghost'}
                size="sm"
                className="viewer-camera-dock__button viewer-camera-dock__hmi"
                aria-pressed={hmiOverlayVisible}
                aria-label={hmiOverlayVisible ? '隐藏HMI看板' : '显示HMI看板'}
                title="HMI 看板 (H)"
                onClick={toggleHmiOverlayVisible}
              >
                {hmiOverlayVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                <span className="viewer-camera-dock__label">HMI</span>
              </Button>
            </div>

            <div
              data-viewer-ui-panel="bottom-panel-dock"
              className={cn(
                'pointer-events-none absolute inset-y-2 right-2 z-20 overflow-hidden transition-all duration-300',
                bottomPanelOpen ? 'w-[460px]' : 'w-0'
              )}
            >
              <div
                className={cn(
                  'viewer-admin-panel viewer-admin-side-panel viewer-message-panel-frame pointer-events-auto h-full rounded-2xl transition-all duration-300',
                  bottomPanelOpen ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0'
                )}
              >
                {bottomPanelOpen && <BottomPanel />}
              </div>
            </div>

          <ViewerAdminEdgePanel
            data-viewer-ui-panel="left-entity-panel"
            variant="soft"
            widthClass={leftPanelOpen ? 'w-[340px]' : 'w-0'}
            className={cn(
              'absolute inset-y-2 left-2 z-20 mt-0',
              leftPanelOpen
                ? 'pointer-events-auto translate-x-0 opacity-100'
                : 'pointer-events-none -translate-x-6 opacity-0'
            )}
          >
            {leftPanelOpen && <EntityListPanel />}
          </ViewerAdminEdgePanel>

          <ViewerAdminEdgePanel
            data-viewer-ui-panel="right-detail-panel"
            variant="soft"
            widthClass={rightPanelOpen ? 'w-[320px]' : 'w-0'}
            className={cn(
              'absolute inset-y-2 right-2 z-20 mt-0',
              rightPanelOpen
                ? 'pointer-events-auto translate-x-0 opacity-100'
                : 'pointer-events-none translate-x-6 opacity-0'
            )}
          >
            {rightPanelOpen && <EntityDetailPanel />}
          </ViewerAdminEdgePanel>
        </div>
      </div>

      <IncidentVideoDialog />
    </ViewerAdminSurfaceShell>
  )
}
