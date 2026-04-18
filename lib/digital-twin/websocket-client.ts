import type { 
  WSMessage, 
  WSMessageType, 
  PositionUpdateMessage, 
  StatusUpdateMessage,
  IncidentMessage,
  Entity,
} from './types'

type MessageHandler = (message: WSMessage) => void

export interface WebSocketLike {
  readyState: number
  onopen: (() => void) | null
  onclose: (() => void) | null
  onerror: ((error: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  close: () => void
  send: (payload: string) => void
}

export interface WebSocketClientOptions {
  url: string
  reconnectInterval?: number
  maxReconnectAttempts?: number
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Event) => void
  onMessage?: MessageHandler
  socketFactory?: (url: string) => WebSocketLike
}

interface DisconnectOptions {
  suppressDisconnectEvent?: boolean
}

export class DigitalTwinWebSocket {
  private ws: WebSocketLike | null = null
  private url: string
  private reconnectInterval: number
  private maxReconnectAttempts: number
  private reconnectAttempts = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private handlers: Map<WSMessageType, Set<MessageHandler>> = new Map()
  private globalHandlers: Set<MessageHandler> = new Set()
  private options: WebSocketClientOptions
  private socketFactory: (url: string) => WebSocketLike
  private suppressDisconnectEvent = false

  constructor(options: WebSocketClientOptions) {
    this.options = options
    this.url = options.url
    this.reconnectInterval = options.reconnectInterval || 3000
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10
    this.socketFactory =
      options.socketFactory ??
      ((url) => new WebSocket(url) as unknown as WebSocketLike)

    if (options.onMessage) {
      this.globalHandlers.add(options.onMessage)
    }
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    try {
      this.ws = this.socketFactory(this.url)

      this.ws.onopen = () => {
        console.log('[v0] WebSocket connected')
        this.reconnectAttempts = 0
        this.options.onConnect?.()
      }

      this.ws.onclose = () => {
        console.log('[v0] WebSocket disconnected')
        const shouldSuppress = this.suppressDisconnectEvent
        this.suppressDisconnectEvent = false
        if (shouldSuppress) {
          return
        }
        this.options.onDisconnect?.()
        this.scheduleReconnect()
      }

      this.ws.onerror = (error) => {
        console.error('[v0] WebSocket error:', error)
        this.options.onError?.(error)
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage
          this.handleMessage(message)
        } catch (error) {
          console.error('[v0] Failed to parse message:', error)
        }
      }
    } catch (error) {
      console.error('[v0] Failed to create WebSocket:', error)
      this.scheduleReconnect()
    }
  }

  disconnect(options?: DisconnectOptions): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.suppressDisconnectEvent = options?.suppressDisconnectEvent ?? false
      this.ws.close()
      this.ws = null
    } else {
      this.suppressDisconnectEvent = false
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[v0] Max reconnect attempts reached')
      return
    }

    this.reconnectAttempts++
    console.log(`[v0] Reconnecting in ${this.reconnectInterval}ms (attempt ${this.reconnectAttempts})`)

    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, this.reconnectInterval)
  }

  private handleMessage(message: WSMessage): void {
    // 调用全局处理器
    this.globalHandlers.forEach((handler) => handler(message))

    // 调用特定类型处理器
    const typeHandlers = this.handlers.get(message.type)
    if (typeHandlers) {
      typeHandlers.forEach((handler) => handler(message))
    }
  }

  subscribe(type: WSMessageType, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set())
    }
    this.handlers.get(type)!.add(handler)

    // 返回取消订阅函数
    return () => {
      this.handlers.get(type)?.delete(handler)
    }
  }

  subscribeAll(handler: MessageHandler): () => void {
    this.globalHandlers.add(handler)
    return () => {
      this.globalHandlers.delete(handler)
    }
  }

  send(message: Partial<WSMessage> & { type: WSMessageType }): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn('[v0] WebSocket not connected, cannot send message')
      return
    }

    const fullMessage: WSMessage = {
      ...message,
      timestamp: message.timestamp || Date.now(),
      payload: message.payload || {},
    }

    this.ws.send(JSON.stringify(fullMessage))
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

// 创建消息的辅助函数
export function createPositionUpdateMessage(
  entityId: string,
  position: { x: number; y: number; z: number },
  rotation?: { x: number; y: number; z: number },
  speed?: number,
  heading?: number
): WSMessage {
  const payload: PositionUpdateMessage = {
    entityId,
    position,
    rotation,
    speed,
    heading,
  }

  return {
    type: 'position_update',
    payload,
    timestamp: Date.now(),
  }
}

export function createStatusUpdateMessage(
  entityId: string,
  status: Entity['status'],
  parameters?: Record<string, unknown>
): WSMessage {
  const payload: StatusUpdateMessage = {
    entityId,
    status,
    parameters,
  }

  return {
    type: 'status_update',
    payload,
    timestamp: Date.now(),
  }
}

// Hook for using WebSocket in React components
import { useEffect, useRef, useCallback, useState } from 'react'
import { useDigitalTwinStore } from './store'

export function useWebSocketConnection(url?: string) {
  const wsRef = useRef<DigitalTwinWebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const setConnectionStatus = useDigitalTwinStore((state) => state.setConnectionStatus)
  const updateEntityPosition = useDigitalTwinStore((state) => state.updateEntityPosition)
  const updateEntity = useDigitalTwinStore((state) => state.updateEntity)
  const addAlarm = useDigitalTwinStore((state) => state.addAlarm)
  const upsertIncident = useDigitalTwinStore((state) => state.upsertIncident)

  const connect = useCallback((wsUrl: string) => {
    if (wsRef.current) {
      wsRef.current.disconnect({ suppressDisconnectEvent: true })
    }

    wsRef.current = new DigitalTwinWebSocket({
      url: wsUrl,
      onConnect: () => {
        setIsConnected(true)
        setConnectionStatus(true, wsUrl)
      },
      onDisconnect: () => {
        setIsConnected(false)
        setConnectionStatus(false)
      },
      onMessage: (message) => {
        switch (message.type) {
          case 'position_update': {
            const data = message.payload as PositionUpdateMessage
            updateEntityPosition(data.entityId, data.position, data.rotation)
            break
          }
          case 'status_update': {
            const data = message.payload as StatusUpdateMessage
            updateEntity(data.entityId, { 
              status: data.status,
              ...(data.parameters && { parameters: data.parameters as Record<string, string | number | boolean> }),
            })
            break
          }
          case 'alarm': {
            const alarm = message.payload as {
              id: string
              level: 'info' | 'warning' | 'error' | 'critical'
              message: string
            }
            addAlarm({
              ...alarm,
              timestamp: message.timestamp,
              acknowledged: false,
            })
            break
          }
          case 'incident': {
            const payload = message.payload as IncidentMessage
            upsertIncident(payload.incident)
            break
          }
        }
      },
    })

    wsRef.current.connect()
  }, [setConnectionStatus, updateEntityPosition, updateEntity, addAlarm, upsertIncident])

  const disconnect = useCallback(() => {
    wsRef.current?.disconnect({ suppressDisconnectEvent: true })
    wsRef.current = null
    setIsConnected(false)
    setConnectionStatus(false)
  }, [setConnectionStatus])

  const send = useCallback((message: Partial<WSMessage> & { type: WSMessageType }) => {
    wsRef.current?.send(message)
  }, [])

  useEffect(() => {
    if (url) {
      connect(url)
    }

    return () => {
      wsRef.current?.disconnect({ suppressDisconnectEvent: true })
    }
  }, [url, connect])

  return {
    isConnected,
    connect,
    disconnect,
    send,
  }
}
