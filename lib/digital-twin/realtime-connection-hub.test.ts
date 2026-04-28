import { describe, expect, test } from 'bun:test'

import { createRealtimeConnectionHub } from './realtime-connection-hub'
import type { WSMessage } from './types'

describe('realtime connection hub', () => {
  test('shares a single underlying client per url and broadcasts messages', async () => {
    let connectCount = 0
    let disconnectCount = 0
    let tokenReadCount = 0
    const messageHandlers = new Set<(message: WSMessage) => void>()

    const hub = createRealtimeConnectionHub({
      createClient: (_url, getToken, lifecycle) => ({
        connect() {
          connectCount += 1
          void getToken().then(() => {
            tokenReadCount += 1
          })
          lifecycle.onConnect?.()
        },
        disconnect() {
          disconnectCount += 1
        },
        subscribeAll(handler) {
          messageHandlers.add(handler)
          return () => {
            messageHandlers.delete(handler)
          }
        },
        get isConnected() {
          return true
        },
      }),
    })

    const receivedA: string[] = []
    const receivedB: string[] = []
    const unsubscribeA = hub.subscribe(
      'ws://runtime/demo',
      {
        onMessage: (message) => receivedA.push(message.type),
      },
      async () => 'ticket-a'
    )
    const unsubscribeB = hub.subscribe('ws://runtime/demo', {
      onMessage: (message) => receivedB.push(message.type),
    })
    await Promise.resolve()

    expect(connectCount).toBe(1)
    expect(hub.connectionCount()).toBe(1)

    messageHandlers.forEach((handler) =>
      handler({
        type: 'alarm',
        payload: {},
        timestamp: 1,
      })
    )

    expect(receivedA).toEqual(['alarm'])
    expect(receivedB).toEqual(['alarm'])

    unsubscribeA()
    expect(disconnectCount).toBe(0)

    unsubscribeB()
    expect(disconnectCount).toBe(1)
    expect(hub.connectionCount()).toBe(0)
    expect(tokenReadCount).toBe(1)
  })
})
