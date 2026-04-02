export interface PoolStats {
  requests: number
  hits: number
  misses: number
  hitRate: number
}

export class ObjectPool<T> {
  private readonly freeList: T[] = []
  private requestsCount = 0
  private hitsCount = 0
  private missesCount = 0
  private readonly factory: () => T
  private readonly reset: (item: T) => void

  constructor(factory: () => T, reset: (item: T) => void) {
    this.factory = factory
    this.reset = reset
  }

  acquire(): T {
    this.requestsCount += 1

    const existing = this.freeList.pop()
    if (existing) {
      this.hitsCount += 1
      return existing
    }

    this.missesCount += 1
    return this.factory()
  }

  release(item: T) {
    this.reset(item)
    this.freeList.push(item)
  }

  get stats(): PoolStats {
    const hitRate = this.requestsCount > 0 ? this.hitsCount / this.requestsCount : 0
    return {
      requests: this.requestsCount,
      hits: this.hitsCount,
      misses: this.missesCount,
      hitRate,
    }
  }
}
