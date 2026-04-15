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
  IncidentMessage,
  PublishedSceneRuntimeDescriptor,
  PositionUpdateMessage,
  StatusUpdateMessage,
  VehicleEntity,
  WSMessage,
} from '@/lib/digital-twin/types'
import { DigitalTwinWebSocket } from '@/lib/digital-twin/websocket-client'
import {
  buildRuntimePositionEntityPatch,
  buildRuntimeStatusEntityPatch,
  resolveRuntimeIncident,
} from '@/lib/digital-twin/runtime-ingest'
import { runtimeVehicleSnapshotRegistry } from '@/lib/digital-twin/runtime-vehicle-snapshot-registry'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'

function hydrateBootstrapState(
  payload: Awaited<ReturnType<typeof fetchBootstrap>>,
  publishedScenePackage: PublishedScenePackage
) {
  const store = useDigitalTwinStore.getState()
  store.reset()
  store.setPublishedScenePackage(publishedScenePackage)
  store.setSceneConfig(payload.sceneConfig)
  store.setEntityRegistry({
    categories: payload.entityCategories,
    archetypes: payload.entityArchetypes,
  })
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
  const suppressDisconnectFallbackRef = useRef(false)
  const needsBootstrapResyncRef = useRef(false)

  const updateEntity = useDigitalTwinStore((state) => state.updateEntity)
  const getEntityById = useDigitalTwinStore((state) => state.getEntityById)
  const addTrajectoryPoint = useDigitalTwinStore((state) => state.addTrajectoryPoint)
  const addAlarm = useDigitalTwinStore((state) => state.addAlarm)
  const upsertIncident = useDigitalTwinStore((state) => state.upsertIncident)
  const setConnectionStatus = useDigitalTwinStore((state) => state.setConnectionStatus)

  const refreshBootstrap = useCallback(async () => {
    if (isRefreshingRef.current) return
    isRefreshingRef.current = true

    try {
      const payload = await fetchBootstrap()
      const publishedScenePackage = await resolvePublishedScenePackage(payload.publishedScene)
      sceneVersionRef.current = payload.sceneVersion
      publishedSceneRef.current = payload.publishedScene ?? null
      needsBootstrapResyncRef.current = false
      hydrateBootstrapState(payload, publishedScenePackage)
      setError(null)
    } catch (loadError) {
      const message = describeLoadError(loadError)
      useDigitalTwinStore
        .getState()
        .setRuntimeDataSource('live', `实时数据刷新失败 · 保持当前运行态（${message}）`)
      setError(message)
      setConnectionStatus(false)
      needsBootstrapResyncRef.current = true
    } finally {
      setIsLoading(false)
      isRefreshingRef.current = false
    }
  }, [setConnectionStatus])

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
        setConnectionStatus(true, wsUrl)
        if (needsBootstrapResyncRef.current) {
          void refreshBootstrap()
        }
      },
      onDisconnect: () => {
        if (suppressDisconnectFallbackRef.current) {
          suppressDisconnectFallbackRef.current = false
          return
        }
        setConnectionStatus(false)
        setError('实时连接已断开')
        useDigitalTwinStore
          .getState()
          .setRuntimeDataSource('live', '实时连接已断开')
        needsBootstrapResyncRef.current = true
      },
      onError: () => {
        if (suppressDisconnectFallbackRef.current) {
          return
        }
        setConnectionStatus(false)
        setError('实时连接异常')
        useDigitalTwinStore
          .getState()
          .setRuntimeDataSource('live', '实时连接异常')
        needsBootstrapResyncRef.current = true
      },
      onMessage: (message: WSMessage) => {
        switch (message.type) {
          case 'position_update': {
            const data = message.payload as PositionUpdateMessage
            const receivedAt = Date.now()
            const currentEntity = getEntityById(data.entityId)
            if (currentEntity?.type === 'dynamic') {
              const archetype = useDigitalTwinStore
                .getState()
                .getEntityArchetypeById(currentEntity.archetypeId)
              if (archetype && !archetype.capabilities.movable) {
                break
              }
            }
            const runtimePatch = buildRuntimePositionEntityPatch(currentEntity, data, {
              timestamp: message.timestamp,
            })
            const nextPosition = runtimePatch.position ?? data.position
            const vehiclePatch = runtimePatch as Partial<VehicleEntity>

            if (
              currentEntity?.type === 'vehicle' ||
              vehiclePatch.routeTrack !== undefined ||
              vehiclePatch.trackPosition !== undefined
            ) {
              runtimeVehicleSnapshotRegistry.append(data.entityId, {
                timestamp: runtimeVehicleSnapshotRegistry.projectTimestamp(
                  message.timestamp,
                  receivedAt
                ),
                sourceTimestamp: message.timestamp,
                receivedAt,
                position: nextPosition,
                yaw: vehiclePatch.rotation?.y ?? currentEntity?.rotation.y ?? 0,
                speed:
                  vehiclePatch.speed ??
                  (currentEntity?.type === 'vehicle'
                    ? currentEntity.speed
                    : 0),
                routeTrack:
                  vehiclePatch.routeTrack ??
                  (currentEntity?.type === 'vehicle'
                    ? currentEntity.routeTrack
                    : undefined),
                trackPosition:
                  vehiclePatch.trackPosition ??
                  (currentEntity?.type === 'vehicle'
                    ? currentEntity.trackPosition
                    : undefined),
                status:
                  currentEntity?.type === 'vehicle'
                    ? currentEntity.status
                    : 'active',
              })
            }

            updateEntity(data.entityId, runtimePatch)
            addTrajectoryPoint(data.entityId, {
              position: nextPosition,
              timestamp: message.timestamp,
            })
            break
          }
          case 'status_update': {
            const data = message.payload as StatusUpdateMessage
            updateEntity(
              data.entityId,
              buildRuntimeStatusEntityPatch(getEntityById(data.entityId), data)
            )
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
            const incident = resolveRuntimeIncident(payload)
            if (incident) {
              upsertIncident(incident)
            }
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
              configChanged.scope === 'publish' ||
              configChanged.scope === 'entity' ||
              hasPublishedSceneUpdate

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
    addTrajectoryPoint,
    refreshBootstrap,
    getEntityById,
    setConnectionStatus,
    updateEntity,
    upsertIncident,
  ])

  useEffect(() => {
    void refreshBootstrap()
    connectWs()

    return () => {
      suppressDisconnectFallbackRef.current = true
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
