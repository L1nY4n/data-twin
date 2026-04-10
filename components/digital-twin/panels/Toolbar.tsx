'use client'

import Link from 'next/link'
import { 
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
  Box,
  Wifi,
  WifiOff,
  Bell,
  Settings,
  Shield,
  ChevronDown,
  Sun,
  Moon,
} from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import type { ViewMode } from '@/lib/digital-twin/types'
import { isRuntimeIncidentActive } from '@/lib/digital-twin/incident-utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ViewerAdminToolbarBar } from '@/components/viewer-admin/primitives'
import { cn } from '@/lib/utils'

const VIEW_MODE_CONFIG: Record<ViewMode, { icon: typeof Move; label: string }> = {
  orbit: { icon: Move, label: '轨道视角' },
  topdown: { icon: ArrowUp, label: '俯视视角' },
  follow: { icon: Eye, label: '跟随视角' },
  firstperson: { icon: Camera, label: '第一人称' },
}

export function Toolbar() {
  const { resolvedTheme, setTheme } = useTheme()
  const sceneConfig = useDigitalTwinStore((state) => state.sceneConfig)
  const setSceneConfig = useDigitalTwinStore((state) => state.setSceneConfig)
  const viewMode = useDigitalTwinStore((state) => state.viewMode)
  const setViewMode = useDigitalTwinStore((state) => state.setViewMode)
  const cameraPresets = useDigitalTwinStore((state) => state.cameraPresets)
  const activeCameraPreset = useDigitalTwinStore((state) => state.activeCameraPreset)
  const setActiveCameraPreset = useDigitalTwinStore((state) => state.setActiveCameraPreset)
  const measurementMode = useDigitalTwinStore((state) => state.measurementMode)
  const setMeasurementMode = useDigitalTwinStore((state) => state.setMeasurementMode)
  const clearMeasurementPoints = useDigitalTwinStore((state) => state.clearMeasurementPoints)
  const isConnected = useDigitalTwinStore((state) => state.isConnected)
  const unacknowledgedAlarmCount = useDigitalTwinStore((state) => state.unacknowledgedAlarmCount)
  const activeIncidentCount = useDigitalTwinStore(
    (state) => state.incidents.filter((incident) => isRuntimeIncidentActive(incident)).length
  )
  const toggleBottomPanel = useDigitalTwinStore((state) => state.toggleBottomPanel)
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
  const sceneTitle = sceneConfig.name?.trim() || '数字孪生平台'

  const handleViewModeSelect = (mode: ViewMode) => {
    if (mode === 'topdown') {
      setViewMode('orbit')
      setActiveCameraPreset('top')
      return
    }

    setViewMode(mode)
  }

  return (
    <TooltipProvider delayDuration={300}>
      <ViewerAdminToolbarBar className="editor-toolbar mx-2 mt-2 flex h-12 items-center justify-between rounded-[22px] px-4">
        {/* 左侧：视图控制 */}
        <div className="flex items-center gap-1">
          {/* 网格开关 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={sceneConfig.showGrid ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
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
                className="h-8 w-8"
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
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5">
                    {(() => {
                      const config = VIEW_MODE_CONFIG[viewMode]
                      const Icon = config.icon
                      return <Icon className="h-4 w-4" />
                    })()}
                    <span className="text-xs">{VIEW_MODE_CONFIG[viewMode].label}</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>视角模式</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>视角模式</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(Object.keys(VIEW_MODE_CONFIG) as ViewMode[]).map((mode) => {
                const config = VIEW_MODE_CONFIG[mode]
                const Icon = config.icon
                return (
                  <DropdownMenuItem
                    key={mode}
                    onClick={() => handleViewModeSelect(mode)}
                    className={cn(viewMode === mode && 'bg-accent')}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {config.label}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 相机预设 */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Camera className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>相机预设</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>相机预设</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {cameraPresets.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  onClick={() => setActiveCameraPreset(preset.id)}
                  className={cn(activeCameraPreset === preset.id && 'bg-accent')}
                >
                  <Box className="mr-2 h-4 w-4" />
                  {preset.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* 测量工具 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={measurementMode === 'distance' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
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
                className="h-8 w-8"
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
                  className="h-8 w-8"
                  onClick={clearMeasurementPoints}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>清除测量点</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* 中间：标题 */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <h1 className="text-sm font-medium">{sceneTitle}</h1>
        </div>

        {/* 右侧：状态和控制 */}
        <div className="flex items-center gap-1">
          {/* 轨迹回放控制 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isPlayingTrajectory ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
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
                  "h-8 w-8",
                  isConnected ? "text-green-500" : "text-muted-foreground"
                )}
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

          {/* 告警 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative h-8 w-8"
                onClick={toggleBottomPanel}
              >
                <Bell className="h-4 w-4" />
                {Math.max(unacknowledgedAlarmCount, activeIncidentCount) > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px]"
                  >
                    {Math.max(unacknowledgedAlarmCount, activeIncidentCount)}
                  </Badge>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>事件 / 告警通知</TooltipContent>
          </Tooltip>

          {/* 设置 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>设置</TooltipContent>
          </Tooltip>

          <Button asChild variant="secondary" size="sm" className="h-8 gap-1.5 px-3 text-[11px]">
            <Link href="/admin/overview">
              <Shield className="h-4 w-4" />
              管理中心
            </Link>
          </Button>

          {/* 性能档位 */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-[11px]">
                    <span>GPU:{rendererMode}</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>渲染后端模式（当前: {rendererBackend}）</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>渲染后端</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setRendererMode('auto')}>
                自动（优先WebGPU）
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRendererMode('webgpu')}>
                强制WebGPU（失败回退）
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRendererMode('webgl2')}>
                强制WebGL2
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={qualityProfile === 'performance' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-2 text-[11px]"
                onClick={() =>
                  setQualityProfile(qualityProfile === 'balanced' ? 'performance' : 'balanced')
                }
              >
                {qualityProfile === 'balanced' ? 'Balanced' : 'Performance'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>切换渲染质量档位</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={autoQuality ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-2 text-[11px]"
                onClick={() => setAutoQuality(!autoQuality)}
              >
                Auto
              </Button>
            </TooltipTrigger>
            <TooltipContent>自动降级</TooltipContent>
          </Tooltip>

          {/* 主题切换 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
              >
                {isDarkTheme ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              切换到{isDarkTheme ? '浅色' : '深色'}主题
            </TooltipContent>
          </Tooltip>
        </div>
      </ViewerAdminToolbarBar>
    </TooltipProvider>
  )
}
