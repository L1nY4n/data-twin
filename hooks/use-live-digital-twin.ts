'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchBootstrap } from '@/lib/digital-twin/bootstrap-client'
import { getRealtimeWsUrl } from '@/lib/digital-twin/backend-config'
import {
  createPublishedCampusScenePackage,
  DEFAULT_PUBLISHED_SCENE_PACKAGE,
  hydratePublishedScenePackage,
  loadPublishedScenePackage,
  type PublishedScenePackage,
  withVersionedPublishedScenePackage,
} from '@/lib/digital-twin/publish'
import type {
  ConfigChangedMessage,
  IncidentMessage,
  PublishedSceneRuntimeDescriptor,
  PositionUpdateMessage,
  StatusUpdateMessage,
  WSMessage,
} from '@/lib/digital-twin/types'
import { DigitalTwinWebSocket } from '@/lib/digital-twin/websocket-client'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'

function hydrateBootstrapState(
  payload: Awaited<ReturnType<typeof fetchBootstrap>>,
  publishedScenePackage: PublishedScenePackage
) {
  const store = useDigitalTwinStore.getState()
  store.reset()
  store.setPublishedScenePackage(publishedScenePackage)
  store.setSceneConfig(payload.sceneConfig)
  store.addEntities(payload.entities)
  store.setAuthoredStaticAssets(payload.staticAssets)

  useDigitalTwinStore.setState({
    rules: new Map(payload.rules.map((rule) => [rule.id, rule])),
    alarms: payload.alarms,
    unacknowledgedAlarmCount: payload.alarms.reduce(
      (count, alarm) => (alarm.acknowledged ? count : count + 1),
      0
    ),
  })

  store.setRuntimeRunning(false)
  store.setRuntimeDataSource('live')
  store.setConnectionStatus(true, getRealtimeWsUrl())
}

function describeLoadError(error: unknown) {
  return error instanceof Error ? error.message : '加载后端数据失败'
}

function hydrateMockState(reason?: string) {
  const store = useDigitalTwinStore.getState()
  const publishedScene = createPublishedCampusScenePackage('default')
  const { persons, vehicles, equipment, zones } = hydratePublishedScenePackage(publishedScene)

  store.reset()
  store.setPublishedScenePackage(publishedScene)
  store.addEntities([...zones, ...persons, ...vehicles, ...equipment])
  store.setRuntimeRunning(true)
  store.setRuntimeDataSource(
    'mock',
    reason ? `后端离线 · 已切换到 Mock 事件模式（${reason}）` : '后端离线 · 已切换到 Mock 事件模式'
  )
  store.setConnectionStatus(false)
}

const LIVE_RUNTIME_FALLBACK_DELAY_MS = 3_500

export function fallbackToMockRuntimeIfDisconnected(reason?: string) {
  const store = useDigitalTwinStore.getState()
  if (store.isConnected || store.runtimeDataSource !== 'live') {
    return false
  }

  hydrateMockState(reason ?? '实时连接已断开')
  return true
}

async function resolvePublishedScenePackage(
  publishedScene?: PublishedSceneRuntimeDescriptor | null
) {
  if (!publishedScene) return DEFAULT_PUBLISHED_SCENE_PACKAGE

  const pkg = await loadPublishedScenePackage(
    publishedScene.packageUrl,
    publishedScene.packageVersion
  )

  return (
    pkg ??
    withVersionedPublishedScenePackage(
      DEFAULT_PUBLISHED_SCENE_PACKAGE,
      publishedScene.packageVersion
    )
  )
}

export function useLiveDigitalTwin() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<DigitalTwinWebSocket | null>(null)
  const sceneVersionRef = useRef(0)
  const publishedSceneRef = useRef<PublishedSceneRuntimeDescriptor | null>(null)
  const isRefreshingRef = useRef(false)
  const disconnectFallbackTimerRef = useRef<number | null>(null)
  const suppressDisconnectFallbackRef = useRef(false)

  const updateEntityPosition = useDigitalTwinStore((state) => state.updateEntityPosition)
  const updateEntity = useDigitalTwinStore((state) => state.updateEntity)
  const addAlarm = useDigitalTwinStore((state) => state.addAlarm)
  const upsertIncident = useDigitalTwinStore((state) => state.upsertIncident)
  const setConnectionStatus = useDigitalTwinStore((state) => state.setConnectionStatus)

  const clearDisconnectFallback = useCallback(() => {
    if (disconnectFallbackTimerRef.current !== null) {
      window.clearTimeout(disconnectFallbackTimerRef.current)
      disconnectFallbackTimerRef.current = null
    }
  }, [])

  const scheduleDisconnectFallback = useCallback(
    (reason: string) => {
      clearDisconnectFallback()
      disconnectFallbackTimerRef.current = window.setTimeout(() => {
        disconnectFallbackTimerRef.current = null
        if (fallbackToMockRuntimeIfDisconnected(reason)) {
          setError(reason)
          setIsLoading(false)
        }
      }, LIVE_RUNTIME_FALLBACK_DELAY_MS)
    },
    [clearDisconnectFallback]
  )

  const refreshBootstrap = useCallback(async () => {
    if (isRefreshingRef.current) return
    isRefreshingRef.current = true

    try {
      const payload = await fetchBootstrap()
      const publishedScenePackage = await resolvePublishedScenePackage(payload.publishedScene)
      sceneVersionRef.current = payload.sceneVersion
      publishedSceneRef.current = payload.publishedScene ?? null
      clearDisconnectFallback()
      hydrateBootstrapState(payload, publishedScenePackage)
      setError(null)
    } catch (loadError) {
      const message = describeLoadError(loadError)
      if (useDigitalTwinStore.getState().entities.size === 0) {
        hydrateMockState(message)
      } else {
        const runtimeDataSource = useDigitalTwinStore.getState().runtimeDataSource
        useDigitalTwinStore
          .getState()
          .setRuntimeDataSource(runtimeDataSource, `实时数据刷新失败 · 保持当前运行态（${message}）`)
      }
      setError(message)
      setConnectionStatus(false)
    } finally {
      setIsLoading(false)
      isRefreshingRef.current = false
    }
  }, [clearDisconnectFallback, setConnectionStatus])

  const connectWs = useCallback(() => {
    if (wsRef.current) {
      suppressDisconnectFallbackRef.current = true
      wsRef.current.disconnect()
    }

    const wsUrl = getRealtimeWsUrl()
    const ws = new DigitalTwinWebSocket({
      url: wsUrl,
      onConnect: () => {
        suppressDisconnectFallbackRef.current = false
        clearDisconnectFallback()
        setConnectionStatus(true, wsUrl)
        if (useDigitalTwinStore.getState().runtimeDataSource === 'mock') {
          void refreshBootstrap()
        }
      },
      onDisconnect: () => {
        if (suppressDisconnectFallbackRef.current) {
          suppressDisconnectFallbackRef.current = false
          return
        }
        setConnectionStatus(false)
        scheduleDisconnectFallback('实时连接已断开')
      },
      onError: () => {
        if (suppressDisconnectFallbackRef.current) {
          return
        }
        setConnectionStatus(false)
        scheduleDisconnectFallback('实时连接异常')
      },
      onMessage: (message: WSMessage) => {
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
              ...(data.parameters && {
                parameters: data.parameters as Record<string, string | number | boolean>,
              }),
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
          case 'config_changed': {
            const configChanged = message.payload as ConfigChangedMessage
            const hasPublishedSceneUpdate =
              Boolean(configChanged.publishedScene) &&
              (configChanged.publishedScene?.packageVersion !==
                publishedSceneRef.current?.packageVersion ||
                configChanged.publishedScene?.packageUrl !==
                  publishedSceneRef.current?.packageUrl)

            const shouldRefresh =
              configChanged.scope === 'publish' || hasPublishedSceneUpdate

            if (!shouldRefresh) break
            sceneVersionRef.current = Math.max(
              sceneVersionRef.current,
              configChanged.sceneVersion
            )
            if (configChanged.publishedScene) {
              publishedSceneRef.current = configChanged.publishedScene
            }
            void refreshBootstrap()
            break
          }
        }
      },
    })

    ws.connect()
    wsRef.current = ws
  }, [
    addAlarm,
    clearDisconnectFallback,
    refreshBootstrap,
    scheduleDisconnectFallback,
    setConnectionStatus,
    updateEntity,
    updateEntityPosition,
    upsertIncident,
  ])

  useEffect(() => {
    void refreshBootstrap()
    connectWs()

    return () => {
      suppressDisconnectFallbackRef.current = true
      clearDisconnectFallback()
      wsRef.current?.disconnect()
      wsRef.current = null
      setConnectionStatus(false)
    }
  }, [clearDisconnectFallback, connectWs, refreshBootstrap, setConnectionStatus])

  return {
    isLoading,
    error,
    reload: refreshBootstrap,
  }
}
