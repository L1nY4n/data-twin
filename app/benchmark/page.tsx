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
  ViewerAdminPanel,
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
  quality: 'balanced' | 'performance'
  cameraPreset: string
  avgFps: number
  p95FrameTime: number
  samples: number
  backend: string
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, n) => sum + n, 0) / values.length
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
    const result: BenchmarkResult = {
      mode,
      quality: benchmarkQuality,
      cameraPreset: finalState.activeCameraPreset ?? 'manual',
      avgFps: average(fpsSamples),
      p95FrameTime: average(p95Samples),
      samples: fpsSamples.length,
      backend: finalState.rendererBackend,
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
        className="mx-2 mt-2 flex min-h-14 flex-wrap items-center gap-3 rounded-[20px] px-4 py-3"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <div>
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
        <ProductModuleNav className="order-3 basis-full pt-1 xl:order-none xl:basis-auto xl:pt-0" />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => runBenchmark('webgl2')} disabled={running}>
            跑 WebGL2
          </Button>
          <Button size="sm" variant="secondary" onClick={() => runBenchmark('webgpu')} disabled={running}>
            跑 WebGPU
          </Button>
          <Button size="sm" onClick={runCompare} disabled={running}>
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
            <div className="viewer-admin-panel pointer-events-auto flex h-full flex-col overflow-hidden rounded-2xl">
              <div className="border-b border-white/8 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <Layers3 className="h-4 w-4" />
                  Benchmark Controls
                </div>
                <p className="mt-1 text-xs text-white/60">画质、机位与测试入口</p>
              </div>
              <div className="space-y-4 overflow-y-auto p-4 text-xs text-white/75">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 font-medium text-white">
                    <Gauge className="h-3.5 w-3.5" />
                    质量档位
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={benchmarkQuality === 'balanced' ? 'default' : 'outline'}
                      onClick={() => setBenchmarkQuality('balanced')}
                      disabled={running}
                    >
                      Balanced
                    </Button>
                    <Button
                      size="sm"
                      variant={benchmarkQuality === 'performance' ? 'default' : 'outline'}
                      onClick={() => setBenchmarkQuality('performance')}
                      disabled={running}
                    >
                      Performance
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 font-medium text-white">
                    <TimerReset className="h-3.5 w-3.5" />
                    机位
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cameraPresets.map((preset) => (
                      <Button
                        key={preset.id}
                        size="sm"
                        variant={activeCameraPreset === preset.id ? 'default' : 'outline'}
                        onClick={() => setActiveCameraPreset(preset.id)}
                        disabled={running}
                      >
                        {preset.name}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-y-2 right-2 z-20 hidden w-[320px] xl:block">
            <div className="viewer-admin-panel pointer-events-auto flex h-full flex-col overflow-hidden rounded-2xl">
              <div className="border-b border-white/8 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <BarChart3 className="h-4 w-4" />
                  Results
                </div>
                <p className="mt-1 text-xs text-white/60">最近一次采样结果</p>
              </div>
              <div className="grid gap-3 overflow-y-auto p-4 text-xs text-white/75">
                <ViewerAdminPanel variant="soft" className="rounded-xl p-3">
                  <div className="font-medium text-white">WebGL2</div>
                  <div className="mt-2 space-y-1">
                    <div>AVG FPS: {results.webgl2?.avgFps.toFixed(1) ?? '-'}</div>
                    <div>P95(ms): {results.webgl2?.p95FrameTime.toFixed(1) ?? '-'}</div>
                    <div>Samples: {results.webgl2?.samples ?? '-'}</div>
                    <div>Backend: {results.webgl2?.backend ?? '-'}</div>
                    <div>Preset: {results.webgl2?.cameraPreset ?? '-'}</div>
                    <div>Quality: {results.webgl2?.quality ?? '-'}</div>
                  </div>
                </ViewerAdminPanel>
                <ViewerAdminPanel variant="soft" className="rounded-xl p-3">
                  <div className="font-medium text-white">WebGPU</div>
                  <div className="mt-2 space-y-1">
                    <div>AVG FPS: {results.webgpu?.avgFps.toFixed(1) ?? '-'}</div>
                    <div>P95(ms): {results.webgpu?.p95FrameTime.toFixed(1) ?? '-'}</div>
                    <div>Samples: {results.webgpu?.samples ?? '-'}</div>
                    <div>Backend: {results.webgpu?.backend ?? '-'}</div>
                    <div>Preset: {results.webgpu?.cameraPreset ?? '-'}</div>
                    <div>Quality: {results.webgpu?.quality ?? '-'}</div>
                  </div>
                </ViewerAdminPanel>
              </div>
            </div>
          </div>

          <div
            className={cn(
              'pointer-events-none absolute inset-x-3 bottom-3 z-20 grid gap-3 xl:hidden',
              isMobile ? 'grid-cols-1' : 'grid-cols-2'
            )}
          >
            <div className="viewer-admin-panel pointer-events-auto flex max-h-[34svh] flex-col overflow-hidden rounded-2xl">
              <div className="border-b border-white/8 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <Layers3 className="h-4 w-4" />
                  Benchmark Controls
                </div>
                <p className="mt-1 text-xs text-white/60">画质、机位与测试入口</p>
              </div>
              <div className="space-y-4 overflow-y-auto p-4 text-xs text-white/75">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 font-medium text-white">
                    <Gauge className="h-3.5 w-3.5" />
                    质量档位
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={benchmarkQuality === 'balanced' ? 'default' : 'outline'}
                      onClick={() => setBenchmarkQuality('balanced')}
                      disabled={running}
                    >
                      Balanced
                    </Button>
                    <Button
                      size="sm"
                      variant={benchmarkQuality === 'performance' ? 'default' : 'outline'}
                      onClick={() => setBenchmarkQuality('performance')}
                      disabled={running}
                    >
                      Performance
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 font-medium text-white">
                    <TimerReset className="h-3.5 w-3.5" />
                    机位
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cameraPresets.map((preset) => (
                      <Button
                        key={preset.id}
                        size="sm"
                        variant={activeCameraPreset === preset.id ? 'default' : 'outline'}
                        onClick={() => setActiveCameraPreset(preset.id)}
                        disabled={running}
                      >
                        {preset.name}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="viewer-admin-panel pointer-events-auto flex max-h-[34svh] flex-col overflow-hidden rounded-2xl">
              <div className="border-b border-white/8 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <BarChart3 className="h-4 w-4" />
                  Results
                </div>
                <p className="mt-1 text-xs text-white/60">最近一次采样结果</p>
              </div>
              <div className="grid gap-3 overflow-y-auto p-4 text-xs text-white/75">
                <ViewerAdminPanel variant="soft" className="rounded-xl p-3">
                  <div className="font-medium text-white">WebGL2</div>
                  <div className="mt-2 space-y-1">
                    <div>AVG FPS: {results.webgl2?.avgFps.toFixed(1) ?? '-'}</div>
                    <div>P95(ms): {results.webgl2?.p95FrameTime.toFixed(1) ?? '-'}</div>
                    <div>Samples: {results.webgl2?.samples ?? '-'}</div>
                    <div>Backend: {results.webgl2?.backend ?? '-'}</div>
                    <div>Preset: {results.webgl2?.cameraPreset ?? '-'}</div>
                    <div>Quality: {results.webgl2?.quality ?? '-'}</div>
                  </div>
                </ViewerAdminPanel>
                <ViewerAdminPanel variant="soft" className="rounded-xl p-3">
                  <div className="font-medium text-white">WebGPU</div>
                  <div className="mt-2 space-y-1">
                    <div>AVG FPS: {results.webgpu?.avgFps.toFixed(1) ?? '-'}</div>
                    <div>P95(ms): {results.webgpu?.p95FrameTime.toFixed(1) ?? '-'}</div>
                    <div>Samples: {results.webgpu?.samples ?? '-'}</div>
                    <div>Backend: {results.webgpu?.backend ?? '-'}</div>
                    <div>Preset: {results.webgpu?.cameraPreset ?? '-'}</div>
                    <div>Quality: {results.webgpu?.quality ?? '-'}</div>
                  </div>
                </ViewerAdminPanel>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ViewerAdminSurfaceShell>
  )
}
