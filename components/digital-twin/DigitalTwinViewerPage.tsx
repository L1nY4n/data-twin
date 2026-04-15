'use client'

import dynamic from 'next/dynamic'
import {
  PanelLeft,
  PanelRight,
  ChevronLeft,
  ChevronRight,
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
  const toggleLeftPanel = useDigitalTwinStore((state) => state.toggleLeftPanel)
  const toggleRightPanel = useDigitalTwinStore((state) => state.toggleRightPanel)
  const toggleBottomPanel = useDigitalTwinStore((state) => state.toggleBottomPanel)

  return {
    leftPanelOpen,
    rightPanelOpen,
    bottomPanelOpen,
    runtimeNotice,
    toggleLeftPanel,
    toggleRightPanel,
    toggleBottomPanel,
  }
}

export function DigitalTwinViewerPage() {
  const { isLoading, error } = useLiveDigitalTwin()
  const {
    leftPanelOpen,
    rightPanelOpen,
    bottomPanelOpen,
    runtimeNotice,
    toggleLeftPanel,
    toggleRightPanel,
    toggleBottomPanel,
  } = useDigitalTwinViewportState()

  return (
    <ViewerAdminSurfaceShell
      className="viewer-surface h-screen overflow-hidden"
      innerClassName="viewer-admin-content flex h-screen flex-col"
    >
      <Toolbar />

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

            <Button
              variant="secondary"
              size="sm"
              className={cn(
                'absolute top-4 z-30 gap-1.5 shadow-sm transition-all duration-300',
                rightPanelOpen ? 'right-[266px]' : 'right-3'
              )}
              onClick={toggleBottomPanel}
            >
              {bottomPanelOpen ? (
                <>
                  <ChevronRight className="h-4 w-4" />
                  <span className="text-xs">收起面板</span>
                </>
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4" />
                  <span className="text-xs">摘要与趋势</span>
                </>
              )}
            </Button>

            <div
              className={cn(
                'pointer-events-none absolute inset-y-2 z-20 overflow-hidden transition-all duration-300',
                rightPanelOpen ? 'right-[264px]' : 'right-2',
                bottomPanelOpen ? 'w-[420px]' : 'w-0'
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
            widthClass={leftPanelOpen ? 'w-[230px]' : 'w-0'}
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
              leftPanelOpen ? 'left-[226px]' : 'left-4'
            )}
            onClick={toggleLeftPanel}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>

          <ViewerAdminEdgePanel
            variant="soft"
            widthClass={rightPanelOpen ? 'w-64' : 'w-0'}
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
              rightPanelOpen ? 'right-[252px]' : 'right-4'
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
