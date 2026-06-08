'use client'
import Link from 'next/link'
import { 
  ArrowUpRight,
  Eye, 
  Grid3X3, 
  Axis3D,
  Camera,
  Ruler,
  Triangle,
  Play,
  Pause,
  RotateCcw,
  Move,
  ArrowUp,
  Wifi,
  WifiOff,
  Settings,
  ChevronDown,
  Sun,
  Moon,
} from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { useDigitalTwinStore, type QualityProfile, type RendererMode } from '@/lib/digital-twin/store'
import type { ViewMode } from '@/lib/digital-twin/types'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ViewerAdminToolbarBar } from '@/components/viewer-admin/primitives'
import { ProductModuleNav } from '@/components/chrome/ProductModuleNav'
import { buildEditorHref } from '@/lib/digital-twin/editor-routing'
import { cn } from '@/lib/utils'

const VIEW_MODE_CONFIG: Record<ViewMode, { icon: typeof Move; label: string }> = {
  orbit: { icon: Move, label: '轨道视角' },
  topdown: { icon: ArrowUp, label: '俯视视角' },
  follow: { icon: Eye, label: '跟随视角' },
  firstperson: { icon: Camera, label: '第一人称' },
}

const RENDERER_MODE_OPTIONS: Array<{ value: RendererMode; label: string }> = [
  { value: 'auto', label: '自动（稳定优先）' },
  { value: 'webgpu', label: '强制WebGPU（失败回退）' },
  { value: 'webgl2', label: '强制WebGL2' },
]

const QUALITY_PROFILE_OPTIONS: Array<{ value: QualityProfile; label: string }> = [
  { value: 'balanced', label: '平衡画质' },
  { value: 'performance', label: '性能优先' },
]

function isTrackedViewMode(mode: ViewMode) {
  return mode === 'follow' || mode === 'firstperson'
}

export function Toolbar({ workspaceSlug }: { workspaceSlug: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const sceneConfig = useDigitalTwinStore((state) => state.sceneConfig)
  const setSceneConfig = useDigitalTwinStore((state) => state.setSceneConfig)
  const viewMode = useDigitalTwinStore((state) => state.viewMode)
  const setViewMode = useDigitalTwinStore((state) => state.setViewMode)
  const selectedEntityType = useDigitalTwinStore((state) => {
    const selectedId = state.selectedEntityId
    return selectedId ? state.entities.get(selectedId)?.type ?? null : null
  })
  const setActiveCameraPreset = useDigitalTwinStore((state) => state.setActiveCameraPreset)
  const clearCameraFocusRequest = useDigitalTwinStore((state) => state.clearCameraFocusRequest)
  const measurementMode = useDigitalTwinStore((state) => state.measurementMode)
  const setMeasurementMode = useDigitalTwinStore((state) => state.setMeasurementMode)
  const clearMeasurementPoints = useDigitalTwinStore((state) => state.clearMeasurementPoints)
  const isConnected = useDigitalTwinStore((state) => state.isConnected)
  const leftPanelOpen = useDigitalTwinStore((state) => state.leftPanelOpen)
  const isPlayingTrajectory = useDigitalTwinStore((state) => state.isPlayingTrajectory)
  const setTrajectoryPlayback = useDigitalTwinStore((state) => state.setTrajectoryPlayback)
  const qualityProfile = useDigitalTwinStore((state) => state.qualityProfile)
  const setQualityProfile = useDigitalTwinStore((state) => state.setQualityProfile)
  const autoQuality = useDigitalTwinStore((state) => state.autoQuality)
  const setAutoQuality = useDigitalTwinStore((state) => state.setAutoQuality)
  const rendererMode = useDigitalTwinStore((state) => state.rendererMode)
  const rendererBackend = useDigitalTwinStore((state) => state.rendererBackend)
  const setRendererMode = useDigitalTwinStore((state) => state.setRendererMode)
  const isDarkTheme = resolvedTheme === 'dark'
  const editorHref = buildEditorHref(workspaceSlug, '/')
  const canTrackSelectedEntity = selectedEntityType !== null && selectedEntityType !== 'zone'
  const CurrentViewModeIcon = VIEW_MODE_CONFIG[viewMode].icon
  const ThemeIcon = isDarkTheme ? Sun : Moon

  const handleViewModeSelect = (mode: ViewMode) => {
    if (mode === 'topdown') {
      clearCameraFocusRequest()
      setViewMode('orbit')
      setActiveCameraPreset('top')
      return
    }

    clearCameraFocusRequest()
    setActiveCameraPreset(null)
    setViewMode(mode)
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div
        data-viewer-ui-panel="module-navigation"
        className={cn(
          'viewer-module-nav-strip absolute bottom-4 z-30 hidden items-center gap-2 xl:flex',
          leftPanelOpen ? 'left-[356px]' : 'left-4'
        )}
      >
        <ProductModuleNav className="viewer-module-nav-strip__links" />
      </div>

      <ViewerAdminToolbarBar
        data-viewer-ui-panel="top-toolbar"
        className={cn(
          'viewer-tool-rail absolute top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-2xl p-1.5',
          leftPanelOpen ? 'left-[356px]' : 'left-4'
        )}
      >
        {/* 左侧：视图控制 */}
        <div className="viewer-tool-rail__group flex flex-col items-center gap-1">
          {/* 网格开关 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={sceneConfig.showGrid ? 'secondary' : 'ghost'}
                size="icon"
                className="viewer-tool-rail__button h-8 w-8"
                aria-label={sceneConfig.showGrid ? '隐藏网格' : '显示网格'}
                onClick={() => setSceneConfig({ showGrid: !sceneConfig.showGrid })}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>网格 {sceneConfig.showGrid ? '(显示)' : '(隐藏)'}</TooltipContent>
          </Tooltip>

          {/* 坐标轴开关 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={sceneConfig.showAxes ? 'secondary' : 'ghost'}
                size="icon"
                className="viewer-tool-rail__button h-8 w-8"
                aria-label={sceneConfig.showAxes ? '隐藏坐标轴' : '显示坐标轴'}
                onClick={() => setSceneConfig({ showAxes: !sceneConfig.showAxes })}
              >
                <Axis3D className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>坐标轴 {sceneConfig.showAxes ? '(显示)' : '(隐藏)'}</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* 视角模式 */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="viewer-tool-rail__button h-8 w-8"
                    aria-label={`视角模式：${VIEW_MODE_CONFIG[viewMode].label}`}
                    title={`视角模式：${VIEW_MODE_CONFIG[viewMode].label}`}
                  >
                    <CurrentViewModeIcon className="h-4 w-4" />
                    <ChevronDown className="viewer-tool-rail__corner-caret" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>视角模式</TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              align="start"
              side="right"
              sideOffset={8}
              className="viewer-tool-rail__menu-content"
            >
              <DropdownMenuLabel>视角模式</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(Object.keys(VIEW_MODE_CONFIG) as ViewMode[]).map((mode) => {
                const config = VIEW_MODE_CONFIG[mode]
                const Icon = config.icon
                const isTrackedMode = isTrackedViewMode(mode)
                return (
                  <DropdownMenuItem
                    key={mode}
                    onClick={() => handleViewModeSelect(mode)}
                    disabled={isTrackedMode && !canTrackSelectedEntity}
                    className={cn(viewMode === mode && 'bg-accent')}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {config.label}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* 测量工具 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={measurementMode === 'distance' ? 'secondary' : 'ghost'}
                size="icon"
                className="viewer-tool-rail__button h-8 w-8"
                aria-label={measurementMode === 'distance' ? '关闭距离测量' : '开启距离测量'}
                onClick={() => {
                  if (measurementMode === 'distance') {
                    setMeasurementMode('none')
                  } else {
                    setMeasurementMode('distance')
                  }
                }}
              >
                <Ruler className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>距离测量</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={measurementMode === 'angle' ? 'secondary' : 'ghost'}
                size="icon"
                className="viewer-tool-rail__button h-8 w-8"
                aria-label={measurementMode === 'angle' ? '关闭角度测量' : '开启角度测量'}
                onClick={() => {
                  if (measurementMode === 'angle') {
                    setMeasurementMode('none')
                  } else {
                    setMeasurementMode('angle')
                  }
                }}
              >
                <Triangle className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>角度测量</TooltipContent>
          </Tooltip>

          {measurementMode !== 'none' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="viewer-tool-rail__button h-8 w-8"
                  aria-label="清除测量点"
                  onClick={clearMeasurementPoints}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>清除测量点</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* 右侧：状态和控制 */}
        <div className="viewer-tool-rail__group flex flex-col items-center gap-1">
          {/* 轨迹回放控制 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isPlayingTrajectory ? 'secondary' : 'ghost'}
                size="icon"
                className="viewer-tool-rail__button h-8 w-8"
                aria-label={isPlayingTrajectory ? '暂停轨迹回放' : '播放轨迹回放'}
                onClick={() => setTrajectoryPlayback(!isPlayingTrajectory)}
              >
                {isPlayingTrajectory ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>轨迹回放</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* 连接状态 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'viewer-tool-rail__button h-8 w-8',
                  isConnected ? "text-green-500" : "text-muted-foreground"
                )}
                aria-label={isConnected ? '后端已连接' : '后端未连接'}
              >
                {isConnected ? (
                  <Wifi className="h-4 w-4" />
                ) : (
                  <WifiOff className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isConnected ? '已连接' : '未连接'}</TooltipContent>
          </Tooltip>

          {/* 设置：把文字型控制收进菜单，避免竖向工具栏被标签撑宽 */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'viewer-tool-rail__button viewer-tool-rail__settings-menu h-8 w-8',
                      (rendererMode !== 'auto' || qualityProfile === 'performance' || autoQuality) && 'is-active'
                    )}
                    aria-label="打开视图与性能设置"
                    title="视图与性能设置"
                  >
                    <Settings className="h-4 w-4" />
                    <ChevronDown className="viewer-tool-rail__corner-caret" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>视图与性能设置</TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              align="start"
              side="right"
              sideOffset={8}
              className="viewer-tool-rail__menu-content viewer-tool-rail__settings-menu-content"
            >
              <DropdownMenuLabel>视图与性能</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href={editorHref}>
                  <ArrowUpRight className="mr-2 h-4 w-4" />
                  进入编辑器
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />

              <DropdownMenuLabel className="flex items-center justify-between gap-3">
                <span>渲染后端</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {rendererBackend}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={rendererMode}
                onValueChange={(value) => setRendererMode(value as RendererMode)}
              >
                {RENDERER_MODE_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />

              <DropdownMenuLabel>画质档位</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={qualityProfile}
                onValueChange={(value) => setQualityProfile(value as QualityProfile)}
              >
                {QUALITY_PROFILE_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuCheckboxItem
                checked={autoQuality}
                onCheckedChange={(checked) => setAutoQuality(checked === true)}
              >
                自动降级
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}>
                <ThemeIcon className="mr-2 h-4 w-4" />
                切换到{isDarkTheme ? '浅色' : '深色'}主题
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ViewerAdminToolbarBar>
    </TooltipProvider>
  )
}
