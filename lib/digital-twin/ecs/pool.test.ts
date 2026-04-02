import { describe, expect, test } from 'bun:test'
import { ObjectPool } from './pool'

describe('ObjectPool', () => {
  test('reuses released instances and tracks hit rate', () => {
    let createCount = 0
    const pool = new ObjectPool(
      () => ({ id: ++createCount, value: 0 }),
      (item) => {
        item.value = 0
      }
    )

    const a = pool.acquire()
    const b = pool.acquire()
    expect(a.id).toBe(1)
    expect(b.id).toBe(2)

    pool.release(a)
    pool.release(b)

    const c = pool.acquire()
    expect(c.id === 1 || c.id === 2).toBe(true)
    expect(pool.stats.requests).toBe(3)
    expect(pool.stats.hits).toBe(1)
    expect(pool.stats.misses).toBe(2)
    expect(pool.stats.hitRate).toBeCloseTo(1 / 3, 6)
  })
})
