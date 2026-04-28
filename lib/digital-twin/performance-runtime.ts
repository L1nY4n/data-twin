import type { PoolStats } from './ecs/pool'

interface PoolLike {
  stats: PoolStats
}

export function getFrameDrawCallSample(
  _previousRawDrawCalls: number,
  rawDrawCalls: number,
  directDrawCalls?: number
) {
  if (Number.isFinite(directDrawCalls) && (directDrawCalls ?? 0) >= 0) {
    return {
      drawCalls: directDrawCalls ?? 0,
      previousRawDrawCalls: rawDrawCalls,
    }
  }

  return {
    drawCalls: rawDrawCalls,
    previousRawDrawCalls: rawDrawCalls,
  }
}

export function aggregatePoolMetrics(pools: PoolLike[]) {
  let requests = 0
  let hits = 0

  for (const pool of pools) {
    requests += pool.stats.requests
    hits += pool.stats.hits
  }

  return {
    requests,
    hitRate: requests > 0 ? hits / requests : 0,
  }
}
