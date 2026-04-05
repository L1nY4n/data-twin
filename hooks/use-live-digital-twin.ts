'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchBootstrap } from '@/lib/digital-twin/bootstrap-client'
import { getRealtimeWsUrl } from '@/lib/digital-twin/backend-config'
import {
  DEFAULT_PUBLISHED_SCENE_PACKAGE,
  loadPublishedScenePackage,
  type PublishedScenePackage,
  withVersionedPublishedScenePackage,
} from '@/lib/digital-twin/publish'
import type {
  ConfigChangedMessage,
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
  store.setConnectionStatus(true, getRealtimeWsUrl())
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

  const updateEntityPosition = useDigitalTwinStore((state) => state.updateEntityPosition)
  const updateEntity = useDigitalTwinStore((state) => state.updateEntity)
  const addAlarm = useDigitalTwinStore((state) => state.addAlarm)
  const setConnectionStatus = useDigitalTwinStore((state) => state.setConnectionStatus)

  const refreshBootstrap = useCallback(async () => {
    if (isRefreshingRef.current) return
    isRefreshingRef.current = true

    try {
      const payload = await fetchBootstrap()
      const publishedScenePackage = await resolvePublishedScenePackage(payload.publishedScene)
      sceneVersionRef.current = payload.sceneVersion
      publishedSceneRef.current = payload.publishedScene ?? null
      hydrateBootstrapState(payload, publishedScenePackage)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载后端数据失败')
      setConnectionStatus(false)
    } finally {
      setIsLoading(false)
      isRefreshingRef.current = false
    }
  }, [setConnectionStatus])

  const connectWs = useCallback(() => {
    wsRef.current?.disconnect()

    const wsUrl = getRealtimeWsUrl()
    const ws = new DigitalTwinWebSocket({
      url: wsUrl,
      onConnect: () => {
        setConnectionStatus(true, wsUrl)
      },
      onDisconnect: () => {
        setConnectionStatus(false)
      },
      onError: () => {
        setConnectionStatus(false)
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
  }, [addAlarm, refreshBootstrap, setConnectionStatus, updateEntity, updateEntityPosition])

  useEffect(() => {
    void refreshBootstrap()
    connectWs()

    return () => {
      wsRef.current?.disconnect()
      wsRef.current = null
      setConnectionStatus(false)
    }
  }, [connectWs, refreshBootstrap, setConnectionStatus])

  return {
    isLoading,
    error,
    reload: refreshBootstrap,
  }
}
