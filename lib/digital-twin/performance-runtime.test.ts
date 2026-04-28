import { describe, expect, test } from 'bun:test'
import { aggregatePoolMetrics, getFrameDrawCallSample } from './performance-runtime'

describe('performance runtime helpers', () => {
  test('samples frame draw calls from the renderer frame counter', () => {
    expect(getFrameDrawCallSample(820, 1000)).toEqual({
      drawCalls: 1000,
      previousRawDrawCalls: 1000,
    })
  })

  test('keeps direct frame draw call samples when they drop between frames', () => {
    expect(getFrameDrawCallSample(1000, 140)).toEqual({
      drawCalls: 140,
      previousRawDrawCalls: 140,
    })
  })

  test('prefers direct draw call stats when the renderer exposes them', () => {
    expect(getFrameDrawCallSample(1000, 1400, 86)).toEqual({
      drawCalls: 86,
      previousRawDrawCalls: 1400,
    })
  })

  test('aggregates pool hit rate across all active pools', () => {
    expect(
      aggregatePoolMetrics([
        { stats: { requests: 4, hits: 3, misses: 1, hitRate: 0.75 } },
        { stats: { requests: 6, hits: 2, misses: 4, hitRate: 1 / 3 } },
      ])
    ).toEqual({
      requests: 10,
      hitRate: 0.5,
    })
  })

  test('reports idle aggregate pool metrics when no pool has activity', () => {
    expect(
      aggregatePoolMetrics([
        { stats: { requests: 0, hits: 0, misses: 0, hitRate: 0 } },
        { stats: { requests: 0, hits: 0, misses: 0, hitRate: 0 } },
      ])
    ).toEqual({
      requests: 0,
      hitRate: 0,
    })
  })
})
