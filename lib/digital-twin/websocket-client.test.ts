import { describe, expect, test } from 'bun:test'
import { encodeRuntimePoseFrame } from './runtime-pose-frame'
import { DigitalTwinWebSocket, type WebSocketLike } from './websocket-client'

describe('DigitalTwinWebSocket', () => {
  test('decodes binary pose frames as pose_frame messages', async () => {
    const received: string[] = []
    const socket: WebSocketLike = {
      readyState: 1,
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      binaryType: 'blob',
      close() {},
      send() {},
    }
    const client = new DigitalTwinWebSocket({
      url: 'ws://runtime.test/realtime',
      socketFactory: () => socket,
      onMessage: (message) => {
        received.push(message.type)
        if (message.type === 'pose_frame') {
          const payload = message.payload as { count: number; entityIds: string[] }
          expect(payload.count).toBe(1)
          expect(payload.entityIds).toEqual(['vehicle-1'])
        }
      },
    })

    await client.connect()
    expect(socket.binaryType).toBe('arraybuffer')

    socket.onmessage?.({
      data: encodeRuntimePoseFrame([
        {
          entityId: 'vehicle-1',
          timestamp: 1_000,
          position: { x: 1, y: 0, z: 2 },
          yaw: 0.2,
          speed: 3,
          heading: 12,
          status: 'active',
        },
      ]),
    } as MessageEvent)

    expect(received).toEqual(['pose_frame'])
  })

  test('surfaces protocol resolver failures before retrying', async () => {
    let errorCount = 0
    let connectCount = 0

    const client = new DigitalTwinWebSocket({
      url: 'ws://runtime.test/realtime',
      protocols: async () => {
        throw new Error('ticket failed')
      },
      maxReconnectAttempts: 0,
      onConnect: () => {
        connectCount += 1
      },
      onError: () => {
        errorCount += 1
      },
    })

    const originalConsoleError = console.error
    console.error = () => {}
    try {
      await client.connect()
    } finally {
      console.error = originalConsoleError
    }

    expect(connectCount).toBe(0)
    expect(errorCount).toBe(1)
  })

  test('does not open a socket when disconnected before async protocols resolve', async () => {
    let resolveProtocols: (protocols: string[]) => void = () => {}
    const protocolPromise = new Promise<string[]>((resolve) => {
      resolveProtocols = resolve
    })
    let socketFactoryCalls = 0

    const client = new DigitalTwinWebSocket({
      url: 'ws://runtime.test/realtime',
      protocols: () => protocolPromise,
      socketFactory: () => {
        socketFactoryCalls += 1
        return {
          readyState: 1,
          onopen: null,
          onclose: null,
          onerror: null,
          onmessage: null,
          close() {},
          send() {},
        }
      },
    })

    const connectPromise = client.connect()
    client.disconnect({ suppressDisconnectEvent: true })
    resolveProtocols(['dt-realtime-token', 'ticket'])
    await connectPromise

    expect(socketFactoryCalls).toBe(0)
    expect(client.isConnected).toBe(false)
  })
})
