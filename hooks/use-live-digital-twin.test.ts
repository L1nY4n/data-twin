import { describe, expect, test } from 'bun:test'
import { fallbackToMockRuntimeIfDisconnected } from './use-live-digital-twin'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'

describe('useLiveDigitalTwin fallback behavior', () => {
  test('falls back to mock runtime after a live disconnect', () => {
    useDigitalTwinStore.getState().reset()
    const store = useDigitalTwinStore.getState()
    store.setRuntimeDataSource('live')
    store.setConnectionStatus(false)

    const fellBack = fallbackToMockRuntimeIfDisconnected('实时连接已断开')
    const nextState = useDigitalTwinStore.getState()

    expect(fellBack).toBe(true)
    expect(nextState.runtimeDataSource).toBe('mock')
    expect(nextState.runtimeNotice).toContain('实时连接已断开')
    expect(nextState.runtimeRunning).toBe(true)
    expect(nextState.entities.size).toBeGreaterThan(0)
  })

  test('does not replace a healthy live runtime while still connected', () => {
    useDigitalTwinStore.getState().reset()
    const store = useDigitalTwinStore.getState()
    store.setRuntimeDataSource('live')
    store.setConnectionStatus(true, 'ws://runtime.local/ws')

    const fellBack = fallbackToMockRuntimeIfDisconnected('实时连接已断开')
    const nextState = useDigitalTwinStore.getState()

    expect(fellBack).toBe(false)
    expect(nextState.runtimeDataSource).toBe('live')
    expect(nextState.connectionUrl).toBe('ws://runtime.local/ws')
  })
})
