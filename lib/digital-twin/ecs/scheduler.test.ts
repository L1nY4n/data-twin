import { describe, expect, test } from 'bun:test'
import { createTickScheduler } from './scheduler'

describe('createTickScheduler', () => {
  test('runs fixed ticks at fixed interval and render tick each advance', () => {
    let fixedCount = 0
    let renderCount = 0
    const fixedDeltas: number[] = []

    const scheduler = createTickScheduler({
      fixedHz: 30,
      onFixedTick: (deltaMs) => {
        fixedCount += 1
        fixedDeltas.push(deltaMs)
      },
      onRenderTick: () => {
        renderCount += 1
      },
    })

    scheduler.advance(0)
    scheduler.advance(16)
    scheduler.advance(33)
    scheduler.advance(50)
    scheduler.advance(66)

    expect(renderCount).toBe(5)
    expect(fixedCount).toBe(1)
    expect(fixedDeltas[0]).toBeCloseTo(1000 / 30, 4)
  })

  test('supports throttled channels on render timeline', () => {
    let calls = 0
    const scheduler = createTickScheduler({
      fixedHz: 30,
      onFixedTick: () => {
        // noop
      },
      onRenderTick: () => {
        // noop
      },
    })

    scheduler.addThrottleChannel('labels', 100, () => {
      calls += 1
    })

    for (let t = 0; t <= 350; t += 16) {
      scheduler.advance(t)
    }

    expect(calls).toBeGreaterThanOrEqual(3)
    expect(calls).toBeLessThanOrEqual(4)
  })

  test('drops large frame gaps instead of replaying every missed fixed tick', () => {
    let fixedCount = 0
    const renderDeltas: number[] = []

    const scheduler = createTickScheduler({
      fixedHz: 30,
      onFixedTick: () => {
        fixedCount += 1
      },
      onRenderTick: (_nowMs, deltaMs) => {
        renderDeltas.push(deltaMs)
      },
    })

    scheduler.advance(0)
    scheduler.advance(2000)

    expect(fixedCount).toBe(0)
    expect(renderDeltas[1]).toBe(0)
  })
})
