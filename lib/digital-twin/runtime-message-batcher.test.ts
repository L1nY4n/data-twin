import { describe, expect, test } from 'bun:test'

import { createRuntimeMessageBatcher } from './runtime-message-batcher'

describe('runtime message batcher', () => {
  test('coalesces queued messages into one scheduled flush', () => {
    const scheduled: Array<() => void> = []
    const flushed: Array<string[]> = []

    const batcher = createRuntimeMessageBatcher({
      scheduleFlush(callback) {
        scheduled.push(callback)
        return () => {}
      },
      flush(messages) {
        flushed.push(messages.map((message) => message.type))
      },
    })

    batcher.push({ type: 'position_update', payload: {}, timestamp: 1 })
    batcher.push({ type: 'status_update', payload: {}, timestamp: 2 })

    expect(scheduled).toHaveLength(1)
    expect(flushed).toHaveLength(0)

    scheduled[0]?.()

    expect(flushed).toEqual([['position_update', 'status_update']])
    expect(batcher.size()).toBe(0)
  })

  test('flushNow drains immediately and clears pending work', () => {
    const flushed: number[] = []
    const batcher = createRuntimeMessageBatcher({
      flush(messages) {
        flushed.push(messages.length)
      },
    })

    batcher.push({ type: 'alarm', payload: {}, timestamp: 1 })
    batcher.push({ type: 'incident', payload: {}, timestamp: 2 })
    batcher.flushNow()

    expect(flushed).toEqual([2])
    expect(batcher.size()).toBe(0)
  })
})
