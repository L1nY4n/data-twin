import { DigitalTwinPickIndex } from './pick-index'

export interface DigitalTwinRuntimeFrame {
  nowMs: number
  deltaMs: number
  cameraPosition?: { x: number; y: number; z: number }
  cameraTarget?: { x: number; y: number; z: number } | null
  drawCalls?: number
}

export interface DigitalTwinRuntimeFixedTick {
  nowMs: number
  fixedDeltaMs: number
  frameDeltaMs: number
}

export interface DigitalTwinViewerRuntimePlugin {
  readonly id: string
  readonly order?: number
  onRuntimeReady?: (runtime: DigitalTwinViewerRuntime) => void
  onFixedUpdatePre?: (tick: DigitalTwinRuntimeFixedTick, runtime: DigitalTwinViewerRuntime) => void
  onFixedUpdatePost?: (tick: DigitalTwinRuntimeFixedTick, runtime: DigitalTwinViewerRuntime) => void
  onRender?: (frame: DigitalTwinRuntimeFrame, runtime: DigitalTwinViewerRuntime) => void
  dispose?: (runtime: DigitalTwinViewerRuntime) => void
}

export interface DigitalTwinViewerRuntimeOptions {
  fixedHz?: number
  maxDeltaMs?: number
  maxFixedStepsPerAdvance?: number
}

export type DigitalTwinSignalValue = boolean | number | string | null

export interface DigitalTwinBufferedSignalHandlers {
  applyIncoming?: (signals: Record<string, DigitalTwinSignalValue>) => void
  sendOutgoing?: (signals: Record<string, DigitalTwinSignalValue>) => void
}

export interface DigitalTwinBufferedSignalStats {
  bufferedIncoming: number
  dirtyOutgoing: number
  flushedIncomingBatches: number
  flushedOutgoingBatches: number
  droppedIncomingWrites: number
}

const DEFAULT_FIXED_HZ = 60
const DEFAULT_MAX_DELTA_MS = 100

function comparePluginOrder(
  left: DigitalTwinViewerRuntimePlugin,
  right: DigitalTwinViewerRuntimePlugin
) {
  return (left.order ?? 100) - (right.order ?? 100) || left.id.localeCompare(right.id)
}

function callPlugin(
  plugin: DigitalTwinViewerRuntimePlugin,
  method: keyof DigitalTwinViewerRuntimePlugin,
  runtime: DigitalTwinViewerRuntime,
  payload?: DigitalTwinRuntimeFrame | DigitalTwinRuntimeFixedTick
) {
  const callback = plugin[method]
  if (typeof callback !== 'function') return

  try {
    if (method === 'onRuntimeReady' || method === 'dispose') {
      ;(callback as (runtime: DigitalTwinViewerRuntime) => void)(runtime)
      return
    }
    ;(callback as (payload: unknown, runtime: DigitalTwinViewerRuntime) => void)(payload, runtime)
  } catch (error) {
    runtime.recordPluginError(plugin.id, String(method), error)
  }
}

export class DigitalTwinBufferedSignalInterface implements DigitalTwinViewerRuntimePlugin {
  readonly id: string
  readonly order: number
  private readonly pendingIncoming = new Map<string, DigitalTwinSignalValue>()
  private readonly dirtyOutgoing = new Map<string, DigitalTwinSignalValue>()
  private readonly handlers: DigitalTwinBufferedSignalHandlers
  private flushedIncomingBatches = 0
  private flushedOutgoingBatches = 0
  private droppedIncomingWrites = 0
  private disposed = false

  constructor({
    id = 'buffered-signal-interface',
    order = 10,
    handlers = {},
  }: {
    id?: string
    order?: number
    handlers?: DigitalTwinBufferedSignalHandlers
  } = {}) {
    this.id = id
    this.order = order
    this.handlers = handlers
  }

  bufferIncoming(signals: Record<string, DigitalTwinSignalValue>) {
    if (this.disposed) return
    for (const [name, value] of Object.entries(signals)) {
      if (this.pendingIncoming.has(name)) this.droppedIncomingWrites += 1
      this.pendingIncoming.set(name, value)
    }
  }

  markOutgoing(signals: Record<string, DigitalTwinSignalValue>) {
    if (this.disposed) return
    for (const [name, value] of Object.entries(signals)) {
      this.dirtyOutgoing.set(name, value)
    }
  }

  onFixedUpdatePre() {
    if (this.pendingIncoming.size === 0) return

    const batch = Object.fromEntries(this.pendingIncoming)
    this.pendingIncoming.clear()
    this.flushedIncomingBatches += 1
    this.handlers.applyIncoming?.(batch)
  }

  onFixedUpdatePost() {
    if (this.dirtyOutgoing.size === 0) return

    const batch = Object.fromEntries(this.dirtyOutgoing)
    this.dirtyOutgoing.clear()
    this.flushedOutgoingBatches += 1
    this.handlers.sendOutgoing?.(batch)
  }

  getStats(): DigitalTwinBufferedSignalStats {
    return {
      bufferedIncoming: this.pendingIncoming.size,
      dirtyOutgoing: this.dirtyOutgoing.size,
      flushedIncomingBatches: this.flushedIncomingBatches,
      flushedOutgoingBatches: this.flushedOutgoingBatches,
      droppedIncomingWrites: this.droppedIncomingWrites,
    }
  }

  dispose() {
    this.disposed = true
    this.pendingIncoming.clear()
    this.dirtyOutgoing.clear()
  }
}

export class DigitalTwinViewerRuntime {
  readonly pickIndex = new DigitalTwinPickIndex()
  private readonly plugins = new Map<string, DigitalTwinViewerRuntimePlugin>()
  private readonly pauseReasons = new Set<string>()
  private readonly fixedStepMs: number
  private readonly maxDeltaMs: number
  private readonly maxFixedStepsPerAdvance: number
  private accumulatorMs = 0
  private lastNowMs: number | null = null
  private disposed = false
  private pluginErrors: Array<{ pluginId: string; method: string; message: string }> = []

  constructor(options: DigitalTwinViewerRuntimeOptions = {}) {
    this.fixedStepMs = 1000 / Math.max(1, options.fixedHz ?? DEFAULT_FIXED_HZ)
    this.maxDeltaMs = options.maxDeltaMs ?? DEFAULT_MAX_DELTA_MS
    this.maxFixedStepsPerAdvance =
      options.maxFixedStepsPerAdvance ??
      Math.max(1, Math.ceil(this.maxDeltaMs / this.fixedStepMs))
  }

  use(plugin: DigitalTwinViewerRuntimePlugin): () => void {
    if (this.disposed) return () => {}

    const existing = this.plugins.get(plugin.id)
    if (existing) {
      callPlugin(existing, 'dispose', this)
    }

    this.plugins.set(plugin.id, plugin)
    callPlugin(plugin, 'onRuntimeReady', this)

    return () => {
      const current = this.plugins.get(plugin.id)
      if (current !== plugin) return
      this.plugins.delete(plugin.id)
      callPlugin(plugin, 'dispose', this)
    }
  }

  getPlugin<T extends DigitalTwinViewerRuntimePlugin>(id: string): T | null {
    return (this.plugins.get(id) as T | undefined) ?? null
  }

  getPluginIds() {
    return this.sortedPlugins().map((plugin) => plugin.id)
  }

  getPluginErrors() {
    return [...this.pluginErrors]
  }

  recordPluginError(pluginId: string, method: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    this.pluginErrors.push({ pluginId, method, message })
    if (this.pluginErrors.length > 50) this.pluginErrors.shift()
  }

  setPaused(reason: string, paused: boolean) {
    const wasPaused = this.isPaused
    if (paused) this.pauseReasons.add(reason)
    else this.pauseReasons.delete(reason)
    if (wasPaused !== this.isPaused) this.accumulatorMs = 0
    return wasPaused !== this.isPaused
  }

  get isPaused() {
    return this.pauseReasons.size > 0
  }

  getPauseReasons() {
    return [...this.pauseReasons]
  }

  advance(frame: DigitalTwinRuntimeFrame) {
    if (this.disposed) return

    const deltaMs = this.resolveDeltaMs(frame)
    const normalizedFrame = { ...frame, deltaMs }

    if (!this.isPaused && deltaMs > 0) {
      this.accumulatorMs += deltaMs
      let fixedSteps = 0

      while (
        this.accumulatorMs >= this.fixedStepMs &&
        fixedSteps < this.maxFixedStepsPerAdvance
      ) {
        const tick = {
          nowMs: frame.nowMs,
          fixedDeltaMs: this.fixedStepMs,
          frameDeltaMs: deltaMs,
        }
        for (const plugin of this.sortedPlugins()) {
          callPlugin(plugin, 'onFixedUpdatePre', this, tick)
        }
        for (const plugin of this.sortedPlugins()) {
          callPlugin(plugin, 'onFixedUpdatePost', this, tick)
        }
        this.accumulatorMs -= this.fixedStepMs
        fixedSteps += 1
      }

      if (fixedSteps >= this.maxFixedStepsPerAdvance) {
        this.accumulatorMs = 0
      }
    } else if (this.isPaused) {
      this.accumulatorMs = 0
    }

    for (const plugin of this.sortedPlugins()) {
      callPlugin(plugin, 'onRender', this, normalizedFrame)
    }
  }

  resetClock() {
    this.accumulatorMs = 0
    this.lastNowMs = null
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true

    for (const plugin of this.sortedPlugins().reverse()) {
      callPlugin(plugin, 'dispose', this)
    }
    this.plugins.clear()
    this.pauseReasons.clear()
    this.pickIndex.clear()
  }

  private resolveDeltaMs(frame: DigitalTwinRuntimeFrame) {
    let deltaMs = frame.deltaMs
    if (this.lastNowMs !== null) {
      deltaMs = Math.max(0, frame.nowMs - this.lastNowMs)
    }
    this.lastNowMs = frame.nowMs

    if (!Number.isFinite(deltaMs) || deltaMs < 0) return 0
    if (deltaMs > this.maxDeltaMs) {
      this.accumulatorMs = 0
      return 0
    }
    return deltaMs
  }

  private sortedPlugins() {
    return [...this.plugins.values()].sort(comparePluginOrder)
  }
}
