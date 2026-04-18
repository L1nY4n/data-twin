import type { WSMessage } from './types'

type FlushHandler = (messages: WSMessage[]) => void
type CancelScheduledFlush = () => void
type ScheduleFlush = (callback: () => void) => CancelScheduledFlush

interface RuntimeMessageBatcherOptions {
  flush: FlushHandler
  scheduleFlush?: ScheduleFlush
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
  const queue: WSMessage[] = []
  let cancelScheduledFlush: CancelScheduledFlush | null = null

  function flushNow() {
    if (cancelScheduledFlush) {
      cancelScheduledFlush()
      cancelScheduledFlush = null
    }
    if (queue.length === 0) return

    const batch = queue.splice(0, queue.length)
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
