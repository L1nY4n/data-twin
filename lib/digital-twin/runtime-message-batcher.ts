import type {
  PositionUpdateMessage,
  RuntimeSignalUpdate,
  SignalUpdateMessage,
  StatusUpdateMessage,
  WSMessage,
} from './types'

type FlushHandler = (messages: WSMessage[]) => void
type CancelScheduledFlush = () => void
type ScheduleFlush = (callback: () => void) => CancelScheduledFlush

interface RuntimeMessageBatcherOptions {
  flush: FlushHandler
  scheduleFlush?: ScheduleFlush
  compactFrame?: boolean
}

type CompactableRuntimeMessage =
  | (WSMessage & { type: 'position_update'; payload: PositionUpdateMessage })
  | (WSMessage & { type: 'status_update'; payload: StatusUpdateMessage })
  | (WSMessage & { type: 'signal_update'; payload: SignalUpdateMessage })

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getEntityId(payload: unknown): string | null {
  return isRecord(payload) && typeof payload.entityId === 'string' ? payload.entityId : null
}

function nonEmptySignalKey(value: string | undefined) {
  return value && value.length > 0 ? value : null
}

function signalUpdateKey(signal: RuntimeSignalUpdate) {
  return (
    nonEmptySignalKey(signal.id) ??
    nonEmptySignalKey(signal.path) ??
    nonEmptySignalKey(signal.name) ??
    nonEmptySignalKey(signal.label)
  )
}

function mergeSignalUpdatePayload(
  previous: SignalUpdateMessage,
  incoming: SignalUpdateMessage
): SignalUpdateMessage {
  const signals = [...previous.signals]
  const indexByKey = new Map<string, number>()

  signals.forEach((signal, index) => {
    const key = signalUpdateKey(signal)
    if (key) indexByKey.set(key, index)
  })

  incoming.signals.forEach((signal) => {
    const key = signalUpdateKey(signal)
    if (!key) {
      signals.push(signal)
      return
    }

    const existingIndex = indexByKey.get(key)

    if (existingIndex === undefined) {
      indexByKey.set(key, signals.length)
      signals.push(signal)
      return
    }

    signals[existingIndex] = {
      ...signals[existingIndex]!,
      ...signal,
    }
  })

  return {
    ...previous,
    ...incoming,
    signals,
  }
}

function resolveCompactKey(message: WSMessage) {
  if (
    message.type !== 'position_update' &&
    message.type !== 'status_update' &&
    message.type !== 'signal_update'
  ) {
    return null
  }

  const entityId = getEntityId(message.payload)
  return entityId ? `${message.type}:${entityId}` : null
}

function isCompactableRuntimeMessage(
  message: WSMessage
): message is CompactableRuntimeMessage {
  if (
    message.type !== 'position_update' &&
    message.type !== 'status_update' &&
    message.type !== 'signal_update'
  ) {
    return false
  }
  return getEntityId(message.payload) !== null
}

function mergeRuntimeMessages(previous: WSMessage, incoming: WSMessage): WSMessage {
  if (!isCompactableRuntimeMessage(previous) || !isCompactableRuntimeMessage(incoming)) {
    return incoming
  }

  if (incoming.timestamp < previous.timestamp) {
    return previous
  }

  if (previous.type === 'signal_update' && incoming.type === 'signal_update') {
    return {
      ...incoming,
      payload: mergeSignalUpdatePayload(previous.payload, incoming.payload),
      timestamp: Math.max(previous.timestamp, incoming.timestamp),
    }
  }

  return {
    ...incoming,
    timestamp: Math.max(previous.timestamp, incoming.timestamp),
  }
}

/**
 * Collapse high-frequency realtime messages to the latest value per entity within
 * one scheduled UI frame. This intentionally mirrors the industrial HMI pattern
 * of buffering protocol callbacks first, then flushing a deduped state batch on
 * the next render/fixed tick. Append-only operator events (alarms/incidents/rules)
 * are not compacted.
 */
export function compactRuntimeMessagesForFrame(messages: readonly WSMessage[]): WSMessage[] {
  const compacted: WSMessage[] = []
  const compactableSegment: WSMessage[] = []

  function flushCompactableSegment() {
    if (compactableSegment.length === 0) return
    compacted.push(...compactRuntimeStateSegment(compactableSegment))
    compactableSegment.length = 0
  }

  for (const message of messages) {
    const key = resolveCompactKey(message)
    if (!key) {
      flushCompactableSegment()
      compacted.push(message)
      continue
    }
    compactableSegment.push(message)
  }

  flushCompactableSegment()
  return compacted
}

function compactRuntimeStateSegment(messages: readonly WSMessage[]): WSMessage[] {
  const compacted: WSMessage[] = []
  const indexByKey = new Map<string, number>()

  for (const message of messages) {
    const key = resolveCompactKey(message)
    if (!key) continue

    const existingIndex = indexByKey.get(key)
    if (existingIndex === undefined) {
      indexByKey.set(key, compacted.length)
      compacted.push(message)
      continue
    }

    compacted[existingIndex] = mergeRuntimeMessages(compacted[existingIndex]!, message)
  }

  return compacted
}

function defaultScheduleFlush(callback: () => void): CancelScheduledFlush {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    const rafId = window.requestAnimationFrame(() => callback())
    return () => window.cancelAnimationFrame(rafId)
  }

  const timer = setTimeout(callback, 0)
  return () => clearTimeout(timer)
}

export function createRuntimeMessageBatcher(options: RuntimeMessageBatcherOptions) {
  const scheduleFlush = options.scheduleFlush ?? defaultScheduleFlush
  const compactFrame = options.compactFrame ?? true
  const queue: WSMessage[] = []
  let cancelScheduledFlush: CancelScheduledFlush | null = null

  function flushNow() {
    if (cancelScheduledFlush) {
      cancelScheduledFlush()
      cancelScheduledFlush = null
    }
    if (queue.length === 0) return

    const queuedMessages = queue.splice(0, queue.length)
    const batch = compactFrame ? compactRuntimeMessagesForFrame(queuedMessages) : queuedMessages
    options.flush(batch)
  }

  return {
    push(message: WSMessage) {
      queue.push(message)
      if (cancelScheduledFlush) return

      cancelScheduledFlush = scheduleFlush(() => {
        cancelScheduledFlush = null
        flushNow()
      })
    },

    flushNow,

    cancel() {
      if (cancelScheduledFlush) {
        cancelScheduledFlush()
        cancelScheduledFlush = null
      }
      queue.length = 0
    },

    size() {
      return queue.length
    },
  }
}
