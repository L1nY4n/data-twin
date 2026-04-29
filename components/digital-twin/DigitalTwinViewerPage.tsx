'use client'

import dynamic from 'next/dynamic'
import {
  Bell,
  PanelLeft,
  PanelRight,
} from 'lucide-react'
import { useLiveDigitalTwin } from '@/hooks/use-live-digital-twin'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { EntityListPanel } from '@/components/digital-twin/panels/EntityListPanel'
import { EntityDetailPanel } from '@/components/digital-twin/panels/EntityDetailPanel'
import { IncidentVideoDialog } from '@/components/digital-twin/panels/IncidentVideoDialog'
import { Toolbar } from '@/components/digital-twin/panels/Toolbar'
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
      <div className="flex h-full w-full items-center justify-center bg-[#0a0a0f]">
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
  const runtimeNotice = useDigitalTwinStore((state) => state.runtimeNotice)
  const publishedScenePackage = useDigitalTwinStore((state) => state.publishedScenePackage)
  const entityDirectory = useDigitalTwinStore((state) => state.entityDirectory)
  const selectedEntityId = useDigitalTwinStore((state) => state.selectedEntityId)
  const selectedStaticFeatureId = useDigitalTwinStore((state) => state.selectedStaticFeatureId)
  const toggleLeftPanel = useDigitalTwinStore((state) => state.toggleLeftPanel)
  const toggleRightPanel = useDigitalTwinStore((state) => state.toggleRightPanel)
  const toggleBottomPanel = useDigitalTwinStore((state) => state.toggleBottomPanel)

  return {
    leftPanelOpen,
    rightPanelOpen,
    bottomPanelOpen,
    runtimeNotice,
    publishedScenePackage,
    entityDirectory,
    selectedEntityId,
    selectedStaticFeatureId,
    toggleLeftPanel,
    toggleRightPanel,
    toggleBottomPanel,
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
    runtimeNotice,
    publishedScenePackage,
    entityDirectory,
    selectedEntityId,
    selectedStaticFeatureId,
    toggleLeftPanel,
    toggleRightPanel,
    toggleBottomPanel,
  } = useDigitalTwinViewportState()

  const sectorCount = publishedScenePackage.sectors.length
  const staticFeatureCount = publishedScenePackage.staticChunks.reduce(
    (count, chunk) => count + chunk.features.length,
    0
  )
  const activeSelectionLabel = selectedEntityId || selectedStaticFeatureId ? '已选择' : '未选择'
  const visibleEntityCount = Array.from(entityDirectory.values()).filter((entry) => entry.visible).length

  return (
    <ViewerAdminSurfaceShell
      className="viewer-surface h-screen overflow-hidden"
      innerClassName="viewer-admin-content flex h-screen flex-col"
    >
      <Toolbar workspaceSlug={workspaceSlug} />

      <div className="relative flex flex-1 overflow-hidden px-2 pb-2">
        <div className="relative flex-1">
          <div className="viewer-admin-canvas-frame editor-canvas-frame relative h-full overflow-hidden rounded-[30px]">
            <DigitalTwinCanvas />

            {runtimeNotice && (
              <div className="pointer-events-none absolute left-3 top-3 z-30 md:hidden">
                <Badge className="border border-amber-300/40 bg-amber-500/10 text-amber-50 shadow-lg">
                  {runtimeNotice}
                </Badge>
              </div>
            )}

            {(isLoading || error) && (
              <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                <ViewerAdminPanel className="rounded-2xl px-4 py-3 text-sm shadow-sm">
                  {error ? `后端连接失败: ${error}` : '正在连接后端数据...'}
                </ViewerAdminPanel>
              </div>
            )}

            <div className="viewer-panel-switchboard absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2">
              <div className="viewer-panel-switchboard__metrics" aria-label="当前3D场景规模">
                <span>{sectorCount}区</span>
                <span>{staticFeatureCount}设施</span>
                <span>{visibleEntityCount}对象</span>
              </div>
              <div className="viewer-panel-switchboard__actions" aria-label="3D viewer 面板控件">
                <Button
                  type="button"
                  variant={leftPanelOpen ? 'secondary' : 'ghost'}
                  size="sm"
                  className="viewer-panel-switchboard__button"
                  aria-pressed={leftPanelOpen}
                  onClick={toggleLeftPanel}
                >
                  <PanelLeft className="h-3.5 w-3.5" />
                  对象
                </Button>
                <Button
                  type="button"
                  variant={rightPanelOpen ? 'secondary' : 'ghost'}
                  size="sm"
                  className="viewer-panel-switchboard__button"
                  aria-pressed={rightPanelOpen}
                  onClick={toggleRightPanel}
                >
                  <PanelRight className="h-3.5 w-3.5" />
                  详情
                  <span className="viewer-panel-switchboard__meta">{activeSelectionLabel}</span>
                </Button>
                <Button
                  type="button"
                  variant={bottomPanelOpen ? 'secondary' : 'ghost'}
                  size="sm"
                  className="viewer-panel-switchboard__button"
                  aria-pressed={bottomPanelOpen}
                  onClick={toggleBottomPanel}
                >
                  <Bell className="h-3.5 w-3.5" />
                  事件
                </Button>
              </div>
            </div>

            <div
              className={cn(
                'pointer-events-none absolute inset-y-2 z-20 overflow-hidden transition-all duration-300',
                rightPanelOpen ? 'right-[328px]' : 'right-2',
                bottomPanelOpen ? 'w-[460px]' : 'w-0'
              )}
            >
              <div
                className={cn(
                  'viewer-admin-panel viewer-admin-side-panel pointer-events-auto h-full rounded-2xl transition-all duration-300',
                  bottomPanelOpen ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0'
                )}
              >
                {bottomPanelOpen && <BottomPanel />}
              </div>
            </div>
          </div>

          <ViewerAdminEdgePanel
            variant="soft"
            widthClass={leftPanelOpen ? 'w-[300px]' : 'w-0'}
            className={cn(
              'absolute inset-y-2 left-2 z-20 mt-0',
              leftPanelOpen
                ? 'pointer-events-auto translate-x-0 opacity-100'
                : 'pointer-events-none -translate-x-6 opacity-0'
            )}
          >
            {leftPanelOpen && <EntityListPanel />}
          </ViewerAdminEdgePanel>

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'viewer-header-icon viewer-edge-toggle viewer-edge-toggle--left absolute top-4 z-30 size-8 rounded-[12px] transition-all duration-300',
              leftPanelOpen ? 'left-[296px]' : 'left-4'
            )}
            onClick={toggleLeftPanel}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>

          <ViewerAdminEdgePanel
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

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'viewer-header-icon viewer-edge-toggle viewer-edge-toggle--right absolute top-4 z-30 size-8 rounded-[12px] transition-all duration-300',
              rightPanelOpen ? 'right-[316px]' : 'right-4'
            )}
            onClick={toggleRightPanel}
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <IncidentVideoDialog />
    </ViewerAdminSurfaceShell>
  )
}
