export interface TickSchedulerOptions {
  fixedHz: number
  onFixedTick: (deltaMs: number) => void
  onRenderTick: (nowMs: number, deltaMs: number) => void
  maxDeltaMs?: number
  maxFixedStepsPerAdvance?: number
}

interface ThrottleChannel {
  intervalMs: number
  callback: (nowMs: number) => void
  nextRun: number
}

export interface TickScheduler {
  advance: (nowMs: number, deltaMs?: number) => void
  reset: () => void
  addThrottleChannel: (
    name: string,
    intervalMs: number,
    callback: (nowMs: number) => void
  ) => void
  removeThrottleChannel: (name: string) => void
}

export function createTickScheduler(options: TickSchedulerOptions): TickScheduler {
  const fixedStepMs = 1000 / Math.max(1, options.fixedHz)
  const maxDeltaMs = options.maxDeltaMs ?? 250
  const maxFixedStepsPerAdvance =
    options.maxFixedStepsPerAdvance ?? Math.max(1, Math.ceil(maxDeltaMs / fixedStepMs))
  let lastTimeMs: number | null = null
  let renderTimelineMs = 0
  let accumulatorMs = 0
  const channels = new Map<string, ThrottleChannel>()

  return {
    advance(nowMs, deltaMsOverride) {
      if (lastTimeMs === null) {
        lastTimeMs = nowMs
        renderTimelineMs = nowMs
        options.onRenderTick(renderTimelineMs, 0)
      } else {
        const hasDeltaOverride =
          deltaMsOverride !== undefined && Number.isFinite(deltaMsOverride)
        const clockDeltaMs = Math.max(0, nowMs - lastTimeMs)
        const rawDeltaMs = hasDeltaOverride ? Math.max(0, deltaMsOverride) : clockDeltaMs
        lastTimeMs = nowMs
        renderTimelineMs = hasDeltaOverride ? renderTimelineMs + rawDeltaMs : nowMs
        if (rawDeltaMs > maxDeltaMs) {
          accumulatorMs = 0
          options.onRenderTick(renderTimelineMs, 0)
        } else {
          const deltaMs = rawDeltaMs
          accumulatorMs += deltaMs
          let fixedSteps = 0

          while (accumulatorMs >= fixedStepMs && fixedSteps < maxFixedStepsPerAdvance) {
            options.onFixedTick(fixedStepMs)
            accumulatorMs -= fixedStepMs
            fixedSteps += 1
          }

          if (fixedSteps >= maxFixedStepsPerAdvance) {
            accumulatorMs = 0
          }

          options.onRenderTick(renderTimelineMs, deltaMs)
        }
      }

      channels.forEach((channel) => {
        if (renderTimelineMs < channel.nextRun) return
        channel.callback(renderTimelineMs)
        channel.nextRun = renderTimelineMs + channel.intervalMs
      })
    },
    reset() {
      lastTimeMs = null
      renderTimelineMs = 0
      accumulatorMs = 0
      channels.forEach((channel) => {
        channel.nextRun = 0
      })
    },
    addThrottleChannel(name, intervalMs, callback) {
      channels.set(name, {
        intervalMs,
        callback,
        nextRun: 0,
      })
    },
    removeThrottleChannel(name) {
      channels.delete(name)
    },
  }
}
