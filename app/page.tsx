'use client'

import dynamic from 'next/dynamic'
import {
  PanelLeft, 
  PanelRight, 
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { useLiveDigitalTwin } from '@/hooks/use-live-digital-twin'
import { EntityListPanel } from '@/components/digital-twin/panels/EntityListPanel'
import { EntityDetailPanel } from '@/components/digital-twin/panels/EntityDetailPanel'
import { Toolbar } from '@/components/digital-twin/panels/Toolbar'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

// 动态导入3D场景，避免SSR问题
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

// 动态导入底部面板
const BottomPanel = dynamic(
  () => import('@/components/digital-twin/panels/BottomPanel').then((mod) => mod.BottomPanel),
  { ssr: false }
)

export default function DigitalTwinPage() {
  const { isLoading, error } = useLiveDigitalTwin()

  const leftPanelOpen = useDigitalTwinStore((state) => state.leftPanelOpen)
  const rightPanelOpen = useDigitalTwinStore((state) => state.rightPanelOpen)
  const bottomPanelOpen = useDigitalTwinStore((state) => state.bottomPanelOpen)
  const toggleLeftPanel = useDigitalTwinStore((state) => state.toggleLeftPanel)
  const toggleRightPanel = useDigitalTwinStore((state) => state.toggleRightPanel)
  const toggleBottomPanel = useDigitalTwinStore((state) => state.toggleBottomPanel)

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* 顶部工具栏 */}
      <Toolbar />

      {/* 主内容区域 */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* 左侧面板 */}
        <div
          className={cn(
            'relative flex shrink-0 flex-col overflow-hidden border-r bg-background transition-all duration-300',
            leftPanelOpen ? 'w-64' : 'w-0'
          )}
        >
          {leftPanelOpen && <EntityListPanel />}
        </div>

        {/* 左侧面板切换按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'absolute top-2 z-10 h-8 w-8 transition-all duration-300',
            leftPanelOpen ? 'left-[252px]' : 'left-2'
          )}
          onClick={toggleLeftPanel}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>

        {/* 3D场景区域 */}
        <div className="relative flex-1">
          <DigitalTwinCanvas />

          {(isLoading || error) && (
            <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-background/60 backdrop-blur-sm">
              <div className="rounded-md border bg-background/90 px-4 py-3 text-sm shadow-sm">
                {error ? `后端连接失败: ${error}` : '正在连接后端数据...'}
              </div>
            </div>
          )}

          {/* 规则与图表右侧Dock切换按钮 */}
          <Button
            variant="secondary"
            size="sm"
            className="absolute right-3 top-14 z-30 gap-1.5 shadow-sm"
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
                <span className="text-xs">摘要与图表</span>
              </>
            )}
          </Button>

          {/* 摘要与图表右侧Dock */}
          <div
            className={cn(
              'pointer-events-none absolute inset-y-2 right-2 z-20 overflow-hidden transition-all duration-300',
              bottomPanelOpen ? 'w-[420px]' : 'w-0'
            )}
          >
            <div
              className={cn(
                'pointer-events-auto h-full rounded-xl border bg-background/95 shadow-xl backdrop-blur-sm transition-all duration-300 supports-[backdrop-filter]:bg-background/80',
                bottomPanelOpen ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0'
              )}
            >
              {bottomPanelOpen && <BottomPanel />}
            </div>
          </div>
        </div>

        {/* 右侧面板切换按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'absolute top-2 z-10 h-8 w-8 transition-all duration-300',
            rightPanelOpen ? 'right-[252px]' : 'right-2'
          )}
          onClick={toggleRightPanel}
        >
          <PanelRight className="h-4 w-4" />
        </Button>

        {/* 右侧面板 */}
        <div
          className={cn(
            'relative flex shrink-0 flex-col overflow-hidden border-l bg-background transition-all duration-300',
            rightPanelOpen ? 'w-64' : 'w-0'
          )}
        >
          {rightPanelOpen && <EntityDetailPanel />}
        </div>
      </div>
    </div>
  )
}
