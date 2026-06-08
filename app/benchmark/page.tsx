'use client'

import dynamic from 'next/dynamic'
import { useCallback, useState } from 'react'
import { BarChart3, Gauge, Layers3, TimerReset } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSimulation } from '@/hooks/use-simulation'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { cn } from '@/lib/utils'
import {
  ViewerAdminControlGroup,
  ViewerAdminMetricListCard,
  ViewerAdminPanel,
  ViewerAdminPanelBody,
  ViewerAdminPanelHeader,
  ViewerAdminSurfaceShell,
  ViewerAdminToolbarBar,
} from '@/components/viewer-admin/primitives'
import { ProductModuleNav } from '@/components/chrome/ProductModuleNav'

const DigitalTwinCanvas = dynamic(
  () => import('@/components/digital-twin/scene/DigitalTwinCanvas').then((mod) => mod.DigitalTwinCanvas),
  { ssr: false }
)

interface BenchmarkResult {
  mode: 'webgpu' | 'webgl2'
  requestedMode: string
  quality: 'balanced' | 'performance'
  cameraPreset: string
  avgFps: number
  p95FrameTime: number
  samples: number
  backend: string
  backendMismatch: boolean
  fallbackReason: string | null
  storageBufferActive: boolean
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, n) => sum + n, 0) / values.length
}

function formatBenchmarkRows(result?: BenchmarkResult) {
  return [
    {
      label: 'AVG FPS',
      value: result?.avgFps.toFixed(1) ?? '-',
    },
    {
      label: 'P95(ms)',
      value: result?.p95FrameTime.toFixed(1) ?? '-',
    },
    {
      label: 'Samples',
      value: result?.samples ?? '-',
    },
    {
      label: 'Requested',
      value: result?.requestedMode ?? '-',
    },
    {
      label: 'Backend',
      value: result?.backend ?? '-',
    },
    {
      label: 'Storage',
      value: result ? (result.storageBufferActive ? 'on' : 'off') : '-',
    },
    {
      label: 'Fallback',
      value: result?.fallbackReason ?? '-',
    },
    {
      label: 'Preset',
      value: result?.cameraPreset ?? '-',
    },
    {
      label: 'Quality',
      value: result?.quality ?? '-',
    },
  ]
}

function formatWebGpuRows(result?: BenchmarkResult) {
  const rows = formatBenchmarkRows(result)
  return [
    ...rows.slice(0, 5),
    {
      label: 'Mismatch',
      value: result ? (result.backendMismatch ? 'yes' : 'no') : '-',
    },
    ...rows.slice(5),
  ]
}

function BenchmarkControlsPanel({
  className,
  benchmarkQuality,
  running,
  cameraPresets,
  activeCameraPreset,
  onQualityChange,
  onCameraPresetChange,
}: {
  className?: string
  benchmarkQuality: 'balanced' | 'performance'
  running: boolean
  cameraPresets: Array<{ id: string; name: string }>
  activeCameraPreset: string | null
  onQualityChange: (quality: 'balanced' | 'performance') => void
  onCameraPresetChange: (presetId: string) => void
}) {
  return (
    <ViewerAdminPanel className={cn('pointer-events-auto flex flex-col overflow-hidden rounded-2xl', className)}>
      <ViewerAdminPanelHeader
        title="Benchmark Controls"
        description="画质、机位与测试入口"
        leading={<Layers3 className="h-4 w-4" />}
        className="px-4 py-3"
      />
      <ViewerAdminPanelBody className="space-y-4 text-xs text-white/75">
        <ViewerAdminControlGroup title="质量档位" icon={Gauge}>
          <Button
            size="sm"
            variant={benchmarkQuality === 'balanced' ? 'default' : 'outline'}
            onClick={() => onQualityChange('balanced')}
            disabled={running}
          >
            Balanced
          </Button>
          <Button
            size="sm"
            variant={benchmarkQuality === 'performance' ? 'default' : 'outline'}
            onClick={() => onQualityChange('performance')}
            disabled={running}
          >
            Performance
          </Button>
        </ViewerAdminControlGroup>

        <ViewerAdminControlGroup title="机位" icon={TimerReset}>
          {cameraPresets.map((preset) => (
            <Button
              key={preset.id}
              size="sm"
              variant={activeCameraPreset === preset.id ? 'default' : 'outline'}
              onClick={() => onCameraPresetChange(preset.id)}
              disabled={running}
            >
              {preset.name}
            </Button>
          ))}
        </ViewerAdminControlGroup>
      </ViewerAdminPanelBody>
    </ViewerAdminPanel>
  )
}

function BenchmarkResultsPanel({
  className,
  results,
}: {
  className?: string
  results: Record<string, BenchmarkResult>
}) {
  return (
    <ViewerAdminPanel className={cn('pointer-events-auto flex flex-col overflow-hidden rounded-2xl', className)}>
      <ViewerAdminPanelHeader
        title="Results"
        description="最近一次采样结果"
        leading={<BarChart3 className="h-4 w-4" />}
        className="px-4 py-3"
      />
      <ViewerAdminPanelBody className="grid gap-3 text-xs text-white/75">
        <ViewerAdminMetricListCard title="WebGL2" rows={formatBenchmarkRows(results.webgl2)} />
        <ViewerAdminMetricListCard title="WebGPU" rows={formatWebGpuRows(results.webgpu)} />
      </ViewerAdminPanelBody>
    </ViewerAdminPanel>
  )
}

export default function BenchmarkPage() {
  useSimulation({ autoStart: true, profile: 'production' })
  const isMobile = useIsMobile()

  const cameraPresets = useDigitalTwinStore((state) => state.cameraPresets)
  const activeCameraPreset = useDigitalTwinStore((state) => state.activeCameraPreset)
  const setActiveCameraPreset = useDigitalTwinStore((state) => state.setActiveCameraPreset)
  const setRendererMode = useDigitalTwinStore((state) => state.setRendererMode)
  const setQualityProfile = useDigitalTwinStore((state) => state.setQualityProfile)
  const setAutoQuality = useDigitalTwinStore((state) => state.setAutoQuality)
  const [benchmarkQuality, setBenchmarkQuality] = useState<'balanced' | 'performance'>('balanced')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<Record<string, BenchmarkResult>>({})

  const runBenchmark = useCallback(async (mode: 'webgpu' | 'webgl2') => {
    setRunning(true)
    setAutoQuality(false)
    setQualityProfile(benchmarkQuality)
    setRendererMode(mode)

    // 等待重建renderer与场景稳定
    await delay(1800)

    const fpsSamples: number[] = []
    const p95Samples: number[] = []
    const started = performance.now()

    while (performance.now() - started < 10000) {
      const state = useDigitalTwinStore.getState()
      fpsSamples.push(state.performanceMetrics.fps)
      p95Samples.push(state.performanceMetrics.frameTimeP95)
      await delay(250)
    }

    const finalState = useDigitalTwinStore.getState()
    const rendererDiagnostics = finalState.rendererDiagnostics
    const result: BenchmarkResult = {
      mode,
      requestedMode: finalState.rendererMode,
      quality: benchmarkQuality,
      cameraPreset: finalState.activeCameraPreset ?? 'manual',
      avgFps: average(fpsSamples),
      p95FrameTime: average(p95Samples),
      samples: fpsSamples.length,
      backend: finalState.rendererBackend,
      backendMismatch: mode === 'webgpu' && finalState.rendererBackend !== 'webgpu',
      fallbackReason: rendererDiagnostics.fallbackReason,
      storageBufferActive: rendererDiagnostics.storageBufferActive,
    }

    setResults((prev) => ({ ...prev, [mode]: result }))
    setRunning(false)
    return result
  }, [benchmarkQuality, setAutoQuality, setQualityProfile, setRendererMode])

  const runCompare = useCallback(async () => {
    if (running) return
    await runBenchmark('webgl2')
    await runBenchmark('webgpu')
  }, [runBenchmark, running])

  return (
    <ViewerAdminSurfaceShell
      className="viewer-surface h-screen overflow-hidden"
      innerClassName="viewer-admin-content flex h-screen flex-col"
    >
      <ViewerAdminToolbarBar
        as="header"
        className="mx-2 mt-2 flex min-h-14 flex-col gap-3 rounded-[20px] px-4 py-3 xl:flex-row xl:items-center"
      >
        <div className="min-w-0 w-full xl:flex-1">
          <div className="flex flex-wrap items-start gap-3 xl:items-center">
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-semibold text-white">Renderer Benchmark</h1>
              <p className="text-xs text-white/60">
                生产级园区场景下的渲染后端与画质档位对比
              </p>
            </div>
            <Badge variant="outline" className="rounded-full border-white/12 bg-white/5 text-white/80">
              Internal
            </Badge>
          </div>
        </div>
        <ProductModuleNav className="w-full justify-start pt-1 xl:w-auto xl:pt-0" />
        <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto">
          <Button
            size="sm"
            variant="secondary"
            className="min-w-0 flex-1 sm:flex-none"
            onClick={() => runBenchmark('webgl2')}
            disabled={running}
          >
            跑 WebGL2
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="min-w-0 flex-1 sm:flex-none"
            onClick={() => runBenchmark('webgpu')}
            disabled={running}
          >
            跑 WebGPU
          </Button>
          <Button
            size="sm"
            className="min-w-0 flex-1 sm:flex-none"
            onClick={runCompare}
            disabled={running}
          >
            一键对比
          </Button>
        </div>
      </ViewerAdminToolbarBar>

      <div className="relative flex flex-1 overflow-hidden px-2 pb-2">
        <div className="relative flex-1">
          <div className="viewer-admin-canvas-frame editor-canvas-frame relative h-full overflow-hidden rounded-[30px]">
            <DigitalTwinCanvas />
          </div>

          <div className="pointer-events-none absolute inset-y-2 left-2 z-20 hidden w-[320px] xl:block">
            <BenchmarkControlsPanel
              className="h-full"
              benchmarkQuality={benchmarkQuality}
              running={running}
              cameraPresets={cameraPresets}
              activeCameraPreset={activeCameraPreset}
              onQualityChange={setBenchmarkQuality}
              onCameraPresetChange={setActiveCameraPreset}
            />
          </div>

          <div className="pointer-events-none absolute inset-y-2 right-2 z-20 hidden w-[320px] xl:block">
            <BenchmarkResultsPanel className="h-full" results={results} />
          </div>

          <div
            className={cn(
              'pointer-events-none absolute inset-x-3 bottom-3 z-20 grid gap-3 xl:hidden',
              isMobile ? 'grid-cols-1' : 'grid-cols-2'
            )}
          >
            <BenchmarkControlsPanel
              className="max-h-[34svh]"
              benchmarkQuality={benchmarkQuality}
              running={running}
              cameraPresets={cameraPresets}
              activeCameraPreset={activeCameraPreset}
              onQualityChange={setBenchmarkQuality}
              onCameraPresetChange={setActiveCameraPreset}
            />

            <BenchmarkResultsPanel className="max-h-[34svh]" results={results} />
          </div>
        </div>
      </div>
    </ViewerAdminSurfaceShell>
  )
}
