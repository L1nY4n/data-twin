'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { type BootstrapPayload, fetchBootstrap } from '@/lib/digital-twin/bootstrap-client'
import { getRealtimeWsUrl } from '@/lib/digital-twin/backend-config'
import {
  DEFAULT_PUBLISHED_SCENE_PACKAGE,
  loadPublishedScenePackage,
  type PublishedScenePackage,
  withVersionedPublishedScenePackage,
} from '@/lib/digital-twin/publish'
import type {
  ConfigChangedMessage,
  Entity,
  IncidentMessage,
  PublishedSceneRuntimeDescriptor,
  PositionUpdateMessage,
  RuntimeIncident,
  StatusUpdateMessage,
  VehicleEntity,
  WSMessage,
} from '@/lib/digital-twin/types'
import { realtimeConnectionHub } from '@/lib/digital-twin/realtime-connection-hub'
import { createRuntimeMessageBatcher } from '@/lib/digital-twin/runtime-message-batcher'
import {
  buildRuntimePositionEntityPatch,
  buildRuntimeStatusEntityPatch,
  resolveRuntimeIncident,
} from '@/lib/digital-twin/runtime-ingest'
import { runtimeVehicleSnapshotRegistry } from '@/lib/digital-twin/runtime-vehicle-snapshot-registry'
import { runtimeVehiclePoseBuffer } from '@/lib/digital-twin/runtime-vehicle-pose-buffer'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'

function hydrateBootstrapState(
  workspaceId: string,
  payload: BootstrapPayload,
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
  store.setConnectionStatus(true, getRealtimeWsUrl(workspaceId))
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

export function useLiveDigitalTwin(workspaceId: string) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const sceneVersionRef = useRef(0)
  const publishedSceneRef = useRef<PublishedSceneRuntimeDescriptor | null>(null)
  const isRefreshingRef = useRef(false)
  const suppressDisconnectFallbackRef = useRef(false)
  const needsBootstrapResyncRef = useRef(false)

  const applySimulationTick = useDigitalTwinStore((state) => state.applySimulationTick)
  const batchUpsertIncidents = useDigitalTwinStore((state) => state.batchUpsertIncidents)
  const getEntityById = useDigitalTwinStore((state) => state.getEntityById)
  const setConnectionStatus = useDigitalTwinStore((state) => state.setConnectionStatus)

  const refreshBootstrap = useCallback(async () => {
    if (isRefreshingRef.current) return
    isRefreshingRef.current = true

    try {
      const payload = await fetchBootstrap(workspaceId)
      const publishedScenePackage = await resolvePublishedScenePackage(payload.publishedScene)
      sceneVersionRef.current = payload.sceneVersion
      publishedSceneRef.current = payload.publishedScene ?? null
      needsBootstrapResyncRef.current = false
      hydrateBootstrapState(workspaceId, payload, publishedScenePackage)
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
  }, [setConnectionStatus, workspaceId])

  const processRealtimeMessages = useCallback(
    (messages: WSMessage[]) => {
      if (messages.length === 0) return

      const entityUpdates = new Map<string, Partial<Entity>>()
      const entityDrafts = new Map<string, Entity | undefined>()
      const trajectoryUpdates: Array<{ entityId: string; point: { position: VehicleEntity['position']; timestamp: number } }> = []
      const newAlarms: BootstrapPayload['alarms'] = []
      const incidents: RuntimeIncident[] = []
      let shouldRefresh = false

      const readEntity = (entityId: string) => {
        if (entityDrafts.has(entityId)) {
          return entityDrafts.get(entityId)
        }
        const entity = getEntityById(entityId)
        entityDrafts.set(entityId, entity)
        return entity
      }

      const mergeEntityPatch = (entityId: string, patch: Partial<Entity>) => {
        const previousPatch = entityUpdates.get(entityId) ?? {}
        const nextPatch = {
          ...previousPatch,
          ...patch,
        }
        entityUpdates.set(entityId, nextPatch)

        const current = readEntity(entityId)
        if (current) {
          entityDrafts.set(entityId, {
            ...current,
            ...nextPatch,
          } as Entity)
        }
      }

      for (const message of messages) {
        switch (message.type) {
          case 'position_update': {
            const data = message.payload as PositionUpdateMessage
            const receivedAt = Date.now()
            const currentEntity = readEntity(data.entityId)
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
              const samples = runtimeVehicleSnapshotRegistry.append(data.entityId, {
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
                  (currentEntity?.type === 'vehicle' ? currentEntity.speed : 0),
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
              runtimeVehiclePoseBuffer.upsert(data.entityId, samples)
            }

            mergeEntityPatch(data.entityId, runtimePatch)
            trajectoryUpdates.push({
              entityId: data.entityId,
              point: {
                position: nextPosition,
                timestamp: message.timestamp,
              },
            })
            break
          }
          case 'status_update': {
            const data = message.payload as StatusUpdateMessage
            mergeEntityPatch(
              data.entityId,
              buildRuntimeStatusEntityPatch(readEntity(data.entityId), data)
            )
            break
          }
          case 'alarm': {
            const alarm = message.payload as {
              id: string
              level: 'info' | 'warning' | 'error' | 'critical'
              message: string
            }
            newAlarms.push({
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
              incidents.push(incident)
            }
            break
          }
          case 'config_changed': {
            const configChanged = message.payload as ConfigChangedMessage
            if (configChanged.workspaceId !== workspaceId) {
              break
            }

            const hasPublishedSceneUpdate =
              Boolean(configChanged.publishedScene) &&
              (configChanged.publishedScene?.packageVersion !==
                publishedSceneRef.current?.packageVersion ||
                configChanged.publishedScene?.packageUrl !==
                  publishedSceneRef.current?.packageUrl)

            shouldRefresh =
              shouldRefresh ||
              configChanged.scope === 'publish' ||
              configChanged.scope === 'entity' ||
              hasPublishedSceneUpdate

            sceneVersionRef.current = Math.max(
              sceneVersionRef.current,
              configChanged.sceneVersion
            )
            if (configChanged.publishedScene) {
              publishedSceneRef.current = configChanged.publishedScene
            }
            break
          }
        }
      }

      if (
        entityUpdates.size > 0 ||
        trajectoryUpdates.length > 0 ||
        newAlarms.length > 0
      ) {
        applySimulationTick({
          entityUpdates: [...entityUpdates].map(([id, updates]) => ({ id, updates })),
          trajectoryUpdates,
          newAlarms,
        })
      }

      if (incidents.length > 0) {
        batchUpsertIncidents(incidents)
      }

      if (shouldRefresh) {
        void refreshBootstrap()
      }
    },
    [applySimulationTick, batchUpsertIncidents, getEntityById, refreshBootstrap, workspaceId]
  )

  const processRealtimeMessagesRef = useRef(processRealtimeMessages)
  processRealtimeMessagesRef.current = processRealtimeMessages
  const batcherRef = useRef(
    createRuntimeMessageBatcher({
      flush: (messages) => {
        processRealtimeMessagesRef.current(messages)
      },
    })
  )

  const markRealtimeConnectionIssue = useCallback(
    (message: string) => {
      if (suppressDisconnectFallbackRef.current) {
        return false
      }

      setConnectionStatus(false)
      setError(message)
      useDigitalTwinStore.getState().setRuntimeDataSource('live', message)
      needsBootstrapResyncRef.current = true
      return true
    },
    [setConnectionStatus]
  )

  const connectWs = useCallback(() => {
    if (unsubscribeRef.current) {
      suppressDisconnectFallbackRef.current = true
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }

    const wsUrl = getRealtimeWsUrl(workspaceId)
    unsubscribeRef.current = realtimeConnectionHub.subscribe(wsUrl, {
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
        markRealtimeConnectionIssue('实时连接已断开')
      },
      onError: () => {
        markRealtimeConnectionIssue('实时连接异常')
      },
      onMessage: (message: WSMessage) => {
        batcherRef.current.push(message)
        if (message.type === 'config_changed') {
          batcherRef.current.flushNow()
        }
      },
    })
  }, [markRealtimeConnectionIssue, refreshBootstrap, setConnectionStatus, workspaceId])

  useEffect(() => {
    void refreshBootstrap()
    connectWs()
    const batcher = batcherRef.current

    return () => {
      batcher.cancel()
      suppressDisconnectFallbackRef.current = true
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
      setConnectionStatus(false)
    }
  }, [connectWs, refreshBootstrap, setConnectionStatus])

  return {
    isLoading,
    error,
    reload: refreshBootstrap,
  }
}
