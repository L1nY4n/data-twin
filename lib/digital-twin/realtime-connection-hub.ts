import type { WSMessage } from './types'
import { DigitalTwinWebSocket, type WebSocketClientOptions } from './websocket-client'

interface RealtimeConnectionSubscriber {
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Event) => void
  onMessage?: (message: WSMessage) => void
}

interface RealtimeConnectionClient {
  connect: () => void
  disconnect: (options?: { suppressDisconnectEvent?: boolean }) => void
  subscribeAll: (handler: (message: WSMessage) => void) => () => void
  readonly isConnected: boolean
}

interface RealtimeConnectionHubOptions {
  createClient?: (
    url: string,
    lifecycle: Pick<WebSocketClientOptions, 'onConnect' | 'onDisconnect' | 'onError'>
  ) => RealtimeConnectionClient
}

interface RealtimeConnectionEntry {
  client: RealtimeConnectionClient
  subscribers: Set<RealtimeConnectionSubscriber>
  unsubscribeAll: () => void
}

export function createRealtimeConnectionHub(options: RealtimeConnectionHubOptions = {}) {
  const entries = new Map<string, RealtimeConnectionEntry>()

  function broadcast(
    entry: RealtimeConnectionEntry,
    callback: (subscriber: RealtimeConnectionSubscriber) => void
  ) {
    entry.subscribers.forEach((subscriber) => {
      callback(subscriber)
    })
  }

  function createEntry(url: string) {
    const subscribers = new Set<RealtimeConnectionSubscriber>()
    const entry = {} as RealtimeConnectionEntry
    const client =
      options.createClient?.(url, {
        onConnect: () => broadcast(entry, (subscriber) => subscriber.onConnect?.()),
        onDisconnect: () => broadcast(entry, (subscriber) => subscriber.onDisconnect?.()),
        onError: (error) => broadcast(entry, (subscriber) => subscriber.onError?.(error)),
      }) ??
      new DigitalTwinWebSocket({
        url,
        onConnect: () => broadcast(entry, (subscriber) => subscriber.onConnect?.()),
        onDisconnect: () => broadcast(entry, (subscriber) => subscriber.onDisconnect?.()),
        onError: (error) => broadcast(entry, (subscriber) => subscriber.onError?.(error)),
      })

    const unsubscribeAll = client.subscribeAll((message) => {
      broadcast(entry, (subscriber) => subscriber.onMessage?.(message))
    })

    Object.assign(entry, {
      client,
      subscribers,
      unsubscribeAll,
    })

    return entry
  }

  return {
    subscribe(url: string, subscriber: RealtimeConnectionSubscriber) {
      let entry = entries.get(url)
      if (!entry) {
        entry = createEntry(url)
        entries.set(url, entry)
      }

      entry.subscribers.add(subscriber)
      if (entry.subscribers.size === 1) {
        entry.client.connect()
      } else if (entry.client.isConnected) {
        subscriber.onConnect?.()
      }

      return () => {
        const existing = entries.get(url)
        if (!existing) return

        existing.subscribers.delete(subscriber)
        if (existing.subscribers.size > 0) {
          return
        }

        existing.unsubscribeAll()
        existing.client.disconnect({ suppressDisconnectEvent: true })
        entries.delete(url)
      }
    },

    connectionCount() {
      return entries.size
    },

    clear() {
      entries.forEach((entry) => {
        entry.unsubscribeAll()
        entry.client.disconnect({ suppressDisconnectEvent: true })
      })
      entries.clear()
    },
  }
}

export const realtimeConnectionHub = createRealtimeConnectionHub()
