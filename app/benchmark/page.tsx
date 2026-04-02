'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useSimulation } from '@/hooks/use-simulation'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'

const DigitalTwinCanvas = dynamic(
  () => import('@/components/digital-twin/scene/DigitalTwinCanvas').then((mod) => mod.DigitalTwinCanvas),
  { ssr: false }
)

interface BenchmarkResult {
  mode: 'webgpu' | 'webgl2'
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

  const setRendererMode = useDigitalTwinStore((state) => state.setRendererMode)
  const setQualityProfile = useDigitalTwinStore((state) => state.setQualityProfile)
  const setAutoQuality = useDigitalTwinStore((state) => state.setAutoQuality)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<Record<string, BenchmarkResult>>({})

  const runBenchmark = useCallback(async (mode: 'webgpu' | 'webgl2') => {
    setRunning(true)
    setAutoQuality(false)
    setQualityProfile('performance')
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
      avgFps: average(fpsSamples),
      p95FrameTime: average(p95Samples),
      samples: fpsSamples.length,
      backend: finalState.rendererBackend,
    }

    setResults((prev) => ({ ...prev, [mode]: result }))
    setRunning(false)
    return result
  }, [setAutoQuality, setQualityProfile, setRendererMode])

  const runCompare = useCallback(async () => {
    if (running) return
    await runBenchmark('webgl2')
    await runBenchmark('webgpu')
  }, [runBenchmark, running])

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="space-y-0.5">
          <h1 className="text-sm font-semibold">Renderer Benchmark</h1>
          <p className="text-xs text-muted-foreground">
            以生产级园区实体密度对比 WebGL2 与 WebGPU 的实测帧率
          </p>
        </div>
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
          <Link href="/">
            <Button size="sm" variant="outline">返回主页面</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b px-4 py-2 text-xs">
        <div className="rounded border p-2">
          <div className="font-medium">WebGL2</div>
          <div>AVG FPS: {results.webgl2?.avgFps.toFixed(1) ?? '-'}</div>
          <div>P95(ms): {results.webgl2?.p95FrameTime.toFixed(1) ?? '-'}</div>
          <div>Samples: {results.webgl2?.samples ?? '-'}</div>
          <div>Backend: {results.webgl2?.backend ?? '-'}</div>
        </div>
        <div className="rounded border p-2">
          <div className="font-medium">WebGPU</div>
          <div>AVG FPS: {results.webgpu?.avgFps.toFixed(1) ?? '-'}</div>
          <div>P95(ms): {results.webgpu?.p95FrameTime.toFixed(1) ?? '-'}</div>
          <div>Samples: {results.webgpu?.samples ?? '-'}</div>
          <div>Backend: {results.webgpu?.backend ?? '-'}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <DigitalTwinCanvas />
      </div>
    </div>
  )
}
