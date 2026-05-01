import { describe, expect, test } from 'bun:test'

import {
  compactRuntimeMessagesForFrame,
  createRuntimeMessageBatcher,
} from './runtime-message-batcher'

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

  test('compacts high-frequency transform, status, and signal messages without crossing operator events', () => {
    const compacted = compactRuntimeMessagesForFrame([
      {
        type: 'position_update',
        payload: { entityId: 'vehicle-1', position: { x: 0, y: 0, z: 0 }, heading: 0 },
        timestamp: 100,
      },
      {
        type: 'position_update',
        payload: { entityId: 'vehicle-1', position: { x: 2, y: 0, z: 1 }, heading: 45 },
        timestamp: 102,
      },
      {
        type: 'alarm',
        payload: { id: 'alarm-1', level: 'warning', message: 'keep append-only event' },
        timestamp: 105,
      },
      {
        type: 'position_update',
        payload: { entityId: 'vehicle-1', position: { x: 4, y: 0, z: 2 }, heading: 90 },
        timestamp: 110,
      },
      {
        type: 'status_update',
        payload: { entityId: 'vehicle-1', status: 'warning' },
        timestamp: 112,
      },
      {
        type: 'status_update',
        payload: { entityId: 'vehicle-1', status: 'active' },
        timestamp: 116,
      },
      {
        type: 'signal_update',
        payload: {
          entityId: 'drive-1',
          source: 'ws',
          signals: [
            { path: 'Line/Drive/Start', value: false },
            { id: 'speed', name: 'Speed', value: 1.2 },
          ],
        },
        timestamp: 120,
      },
      {
        type: 'signal_update',
        payload: {
          entityId: 'drive-1',
          connectorId: 'plc-1',
          signals: [
            { path: 'Line/Drive/Start', value: true, quality: 'good' },
            { id: 'load', value: 0.7 },
          ],
        },
        timestamp: 125,
      },
    ])

    expect(compacted.map((message) => message.type)).toEqual([
      'position_update',
      'alarm',
      'position_update',
      'status_update',
      'signal_update',
    ])
    expect(compacted[0]).toEqual({
      type: 'position_update',
      payload: { entityId: 'vehicle-1', position: { x: 2, y: 0, z: 1 }, heading: 45 },
      timestamp: 102,
    })
    expect(compacted[2]).toEqual({
      type: 'position_update',
      payload: { entityId: 'vehicle-1', position: { x: 4, y: 0, z: 2 }, heading: 90 },
      timestamp: 110,
    })
    expect(compacted[3]).toEqual({
      type: 'status_update',
      payload: { entityId: 'vehicle-1', status: 'active' },
      timestamp: 116,
    })
    expect(compacted[4]).toEqual({
      type: 'signal_update',
      payload: {
        entityId: 'drive-1',
        source: 'ws',
        connectorId: 'plc-1',
        signals: [
          { path: 'Line/Drive/Start', value: true, quality: 'good' },
          { id: 'speed', name: 'Speed', value: 1.2 },
          { id: 'load', value: 0.7 },
        ],
      },
      timestamp: 125,
    })
  })

  test('scheduled flush uses frame compaction unless explicitly disabled', () => {
    const scheduled: Array<() => void> = []
    const flushed: Array<string[]> = []

    const batcher = createRuntimeMessageBatcher({
      scheduleFlush(callback) {
        scheduled.push(callback)
        return () => {}
      },
      flush(messages) {
        flushed.push(messages.map((message) => `${message.type}:${message.timestamp}`))
      },
    })

    batcher.push({
      type: 'position_update',
      payload: { entityId: 'vehicle-1', position: { x: 0, y: 0, z: 0 } },
      timestamp: 1,
    })
    batcher.push({
      type: 'position_update',
      payload: { entityId: 'vehicle-1', position: { x: 1, y: 0, z: 0 } },
      timestamp: 2,
    })

    scheduled[0]?.()

    expect(flushed).toEqual([['position_update:2']])
  })

  test('keeps anonymous signal updates instead of merging unrelated values by index', () => {
    const compacted = compactRuntimeMessagesForFrame([
      {
        type: 'signal_update',
        payload: {
          entityId: 'drive-1',
          signals: [{ value: false }],
        },
        timestamp: 1,
      },
      {
        type: 'signal_update',
        payload: {
          entityId: 'drive-1',
          signals: [{ value: true }],
        },
        timestamp: 2,
      },
    ])

    expect(compacted).toHaveLength(1)
    expect(compacted[0]?.payload).toEqual({
      entityId: 'drive-1',
      signals: [{ value: false }, { value: true }],
    })
  })

  test('does not let stale state messages override newer transform payloads in the same frame', () => {
    const compacted = compactRuntimeMessagesForFrame([
      {
        type: 'position_update',
        payload: { entityId: 'vehicle-1', position: { x: 10, y: 0, z: 0 }, heading: 90 },
        timestamp: 200,
      },
      {
        type: 'position_update',
        payload: { entityId: 'vehicle-1', position: { x: 4, y: 0, z: 0 }, heading: 45 },
        timestamp: 180,
      },
      {
        type: 'status_update',
        payload: { entityId: 'vehicle-1', status: 'active' },
        timestamp: 210,
      },
      {
        type: 'status_update',
        payload: { entityId: 'vehicle-1', status: 'warning' },
        timestamp: 190,
      },
    ])

    expect(compacted).toEqual([
      {
        type: 'position_update',
        payload: { entityId: 'vehicle-1', position: { x: 10, y: 0, z: 0 }, heading: 90 },
        timestamp: 200,
      },
      {
        type: 'status_update',
        payload: { entityId: 'vehicle-1', status: 'active' },
        timestamp: 210,
      },
    ])
  })
})
