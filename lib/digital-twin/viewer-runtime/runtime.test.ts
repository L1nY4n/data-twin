import { describe, expect, test } from 'bun:test'
import {
  DigitalTwinBufferedSignalInterface,
  DigitalTwinViewerRuntime,
} from './runtime'

describe('DigitalTwinViewerRuntime', () => {
  test('runs plugins in stable order with fixed pre/post and render phases', () => {
    const runtime = new DigitalTwinViewerRuntime({ fixedHz: 60 })
    const calls: string[] = []

    runtime.use({
      id: 'late',
      order: 20,
      onRuntimeReady: () => calls.push('late:ready'),
      onFixedUpdatePre: () => calls.push('late:pre'),
      onFixedUpdatePost: () => calls.push('late:post'),
      onRender: () => calls.push('late:render'),
    })
    runtime.use({
      id: 'early',
      order: 5,
      onRuntimeReady: () => calls.push('early:ready'),
      onFixedUpdatePre: () => calls.push('early:pre'),
      onFixedUpdatePost: () => calls.push('early:post'),
      onRender: () => calls.push('early:render'),
    })

    runtime.advance({ nowMs: 0, deltaMs: 0 })
    runtime.advance({ nowMs: 20, deltaMs: 20 })

    expect(calls).toEqual([
      'late:ready',
      'early:ready',
      'early:render',
      'late:render',
      'early:pre',
      'late:pre',
      'early:post',
      'late:post',
      'early:render',
      'late:render',
    ])
  })

  test('isolates plugin errors and keeps the runtime ticking', () => {
    const runtime = new DigitalTwinViewerRuntime({ fixedHz: 60 })
    let healthyRenderCount = 0

    runtime.use({
      id: 'faulty',
      order: 1,
      onRender: () => {
        throw new Error('render failed')
      },
    })
    runtime.use({
      id: 'healthy',
      order: 2,
      onRender: () => {
        healthyRenderCount += 1
      },
    })

    runtime.advance({ nowMs: 0, deltaMs: 0 })

    expect(healthyRenderCount).toBe(1)
    expect(runtime.getPluginErrors()).toEqual([
      { pluginId: 'faulty', method: 'onRender', message: 'render failed' },
    ])
  })

  test('pause reasons suppress fixed ticks without suppressing render ticks', () => {
    const runtime = new DigitalTwinViewerRuntime({ fixedHz: 60 })
    let fixedCount = 0
    let renderCount = 0

    runtime.use({
      id: 'counter',
      onFixedUpdatePre: () => {
        fixedCount += 1
      },
      onRender: () => {
        renderCount += 1
      },
    })

    runtime.setPaused('camera-transition', true)
    runtime.advance({ nowMs: 0, deltaMs: 0 })
    runtime.advance({ nowMs: 40, deltaMs: 40 })
    runtime.setPaused('camera-transition', false)
    runtime.advance({ nowMs: 80, deltaMs: 40 })

    expect(fixedCount).toBeGreaterThan(0)
    expect(fixedCount).toBeLessThan(3)
    expect(renderCount).toBe(3)
  })

  test('drops very large frame gaps instead of replaying every missed fixed tick', () => {
    const runtime = new DigitalTwinViewerRuntime({ fixedHz: 60, maxDeltaMs: 100 })
    let fixedCount = 0

    runtime.use({
      id: 'counter',
      onFixedUpdatePre: () => {
        fixedCount += 1
      },
    })

    runtime.advance({ nowMs: 0, deltaMs: 0 })
    runtime.advance({ nowMs: 2000, deltaMs: 2000 })

    expect(fixedCount).toBe(0)
  })

  test('uses supplied render delta when the coarse clock has not advanced', () => {
    const runtime = new DigitalTwinViewerRuntime({ fixedHz: 60 })
    let fixedCount = 0
    const renderDeltas: number[] = []

    runtime.use({
      id: 'counter',
      onFixedUpdatePre: () => {
        fixedCount += 1
      },
      onRender: (frame) => {
        renderDeltas.push(frame.deltaMs)
      },
    })

    runtime.advance({ nowMs: 1000, deltaMs: 0 })
    runtime.advance({ nowMs: 1000, deltaMs: 16.7 })
    runtime.advance({ nowMs: 1000, deltaMs: 16.7 })

    expect(fixedCount).toBeGreaterThan(0)
    expect(renderDeltas).toEqual([0, 16.7, 16.7])
  })

  test('updates plugin order after registrations change', () => {
    const runtime = new DigitalTwinViewerRuntime({ fixedHz: 60 })
    const calls: string[] = []

    runtime.use({
      id: 'late',
      order: 20,
      onRender: () => calls.push('late'),
    })
    runtime.advance({ nowMs: 0, deltaMs: 0 })

    const unregisterEarly = runtime.use({
      id: 'early',
      order: 1,
      onRender: () => calls.push('early'),
    })
    runtime.advance({ nowMs: 16, deltaMs: 16 })
    unregisterEarly()
    runtime.advance({ nowMs: 32, deltaMs: 16 })

    expect(calls).toEqual(['late', 'early', 'late', 'late'])
    expect(runtime.getPluginIds()).toEqual(['late'])
  })
})

describe('DigitalTwinBufferedSignalInterface', () => {
  test('deduplicates incoming signals until the fixed pre phase', () => {
    const applied: Array<Record<string, unknown>> = []
    const iface = new DigitalTwinBufferedSignalInterface({
      handlers: {
        applyIncoming: (signals) => applied.push(signals),
      },
    })

    iface.bufferIncoming({ motorA: 1, motorB: false })
    iface.bufferIncoming({ motorA: 2 })
    iface.onFixedUpdatePre()

    expect(applied).toEqual([{ motorA: 2, motorB: false }])
    expect(iface.getStats()).toMatchObject({
      bufferedIncoming: 0,
      flushedIncomingBatches: 1,
      droppedIncomingWrites: 1,
    })
  })

  test('flushes outgoing signals after fixed updates', () => {
    const sent: Array<Record<string, unknown>> = []
    const iface = new DigitalTwinBufferedSignalInterface({
      handlers: {
        sendOutgoing: (signals) => sent.push(signals),
      },
    })

    iface.markOutgoing({ gateOpen: true })
    iface.markOutgoing({ gateOpen: false, speed: 4 })
    iface.onFixedUpdatePost()

    expect(sent).toEqual([{ gateOpen: false, speed: 4 }])
    expect(iface.getStats()).toMatchObject({
      dirtyOutgoing: 0,
      flushedOutgoingBatches: 1,
    })
  })
})
