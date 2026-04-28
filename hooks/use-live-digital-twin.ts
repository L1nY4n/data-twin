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
  DynamicEntity,
  Entity,
  EntityStatus,
  IncidentMessage,
  PersonEntity,
  PublishedSceneRuntimeDescriptor,
  PositionUpdateMessage,
  RuntimeBatchMessage,
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
import {
  runtimeVehiclePoseBuffer,
  type RuntimeVehiclePoseBufferUpsert,
} from '@/lib/digital-twin/runtime-vehicle-pose-buffer'
import {
  decodeRuntimePoseStatus,
  RUNTIME_POSE_FRAME_RECORD_FLAGS,
  type RuntimePoseFramePayload,
} from '@/lib/digital-twin/runtime-pose-frame'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'

const POSE_FRAME_STORE_SYNC_INTERVAL_MS = 500

function hydrateBootstrapState(
  workspaceId: string,
  payload: BootstrapPayload,
  publishedScenePackage: PublishedScenePackage
) {
  const store = useDigitalTwinStore.getState()
  const wasConnected = store.isConnected
  store.reset()
  store.setPublishedScenePackage(publishedScenePackage)
  store.setSceneConfig(payload.sceneConfig)
  store.setPlatformRegistry({
    modules: payload.moduleManifests,
    eventTypes: payload.eventTypeRegistry,
  })
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
  store.setConnectionStatus(wasConnected, getRealtimeWsUrl(workspaceId))
}

function describeLoadError(error: unknown) {
  return error instanceof Error ? error.message : '加载后端数据失败'
}

async function fetchRealtimeAccessTicket(): Promise<string> {
  const response = await fetch('/api/realtime-ticket', {
    method: 'POST',
    cache: 'no-store',
  })

  if (!response.ok) {
    const payload = await response.text()
    throw new Error(payload.trim() || `realtime ticket request failed ${response.status}`)
  }

  const body = (await response.json()) as { token?: unknown }
  if (typeof body.token !== 'string' || body.token.length === 0) {
    throw new Error('realtime ticket response did not include a token')
  }

  return body.token
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

function isRealtimeMessage(value: unknown): value is WSMessage {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'type' in value &&
      typeof (value as { type?: unknown }).type === 'string' &&
      'timestamp' in value &&
      typeof (value as { timestamp?: unknown }).timestamp === 'number'
  )
}

function flattenRealtimeMessage(message: WSMessage): WSMessage[] {
  if (message.type !== 'batch') {
    return [message]
  }

  const payload = message.payload as Partial<RuntimeBatchMessage> | null | undefined
  if (!payload || !Array.isArray(payload.events)) {
    return []
  }

  return payload.events.filter(
    (event): event is WSMessage => isRealtimeMessage(event) && event.type !== 'batch'
  )
}

type MovingRuntimeEntity = VehicleEntity | PersonEntity | DynamicEntity

function isMovingRuntimeEntity(entity: Entity | undefined): entity is MovingRuntimeEntity {
  return entity?.type === 'vehicle' || entity?.type === 'person' || entity?.type === 'dynamic'
}

function headingToYaw(heading: number) {
  return (heading * Math.PI) / 180
}

function resolvePoseFrameStatus(
  statusCode: number,
  entity: MovingRuntimeEntity | undefined
): EntityStatus {
  return decodeRuntimePoseStatus(statusCode) ?? entity?.status ?? 'active'
}

function shouldSyncPoseFrameEntityToStore(
  entity: MovingRuntimeEntity,
  selectedEntityId: string | null,
  hoveredEntityId: string | null,
  forceStoreSync: boolean
) {
  return (
    forceStoreSync ||
    entity.id === selectedEntityId ||
    entity.id === hoveredEntityId ||
    entity.labelMode === 'html'
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
  const connectionGenerationRef = useRef(0)
  const poseFrameStoreSyncAtRef = useRef(0)

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
      const poseBufferUpdates: RuntimeVehiclePoseBufferUpsert[] = []
      const newAlarms: BootstrapPayload['alarms'] = []
      const incidents: RuntimeIncident[] = []
      let shouldRefresh = false
      const liveState = useDigitalTwinStore.getState()
      const trajectoryEntityId = liveState.isPlayingTrajectory ? liveState.selectedEntityId : null

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
          case 'pose_frame': {
            const frame = message.payload as RuntimePoseFramePayload
            const receivedAt = Date.now()
            const forceStoreSync =
              receivedAt - poseFrameStoreSyncAtRef.current >= POSE_FRAME_STORE_SYNC_INTERVAL_MS
            let syncedStoreFromFrame = false

            for (let index = 0; index < frame.count; index += 1) {
              const entityId = frame.entityIds[index]
              if (!entityId) continue

              const currentEntity = readEntity(entityId)
              if (!isMovingRuntimeEntity(currentEntity)) continue
              if (currentEntity.type === 'dynamic') {
                const presentation = useDigitalTwinStore
                  .getState()
                  .getDynamicEntityPresentation(currentEntity)
                if (!presentation.movable) continue
              }

              const positionOffset = index * 3
              const position = {
                x: frame.positions[positionOffset] ?? currentEntity.position.x,
                y: frame.positions[positionOffset + 1] ?? currentEntity.position.y,
                z: frame.positions[positionOffset + 2] ?? currentEntity.position.z,
              }
              const flags = frame.recordFlags[index] ?? 0
              const heading =
                (flags & RUNTIME_POSE_FRAME_RECORD_FLAGS.heading) !== 0
                  ? (frame.headings[index] ?? 0)
                  : currentEntity.type === 'vehicle'
                    ? currentEntity.heading
                    : undefined
              const yaw =
                (flags & RUNTIME_POSE_FRAME_RECORD_FLAGS.yaw) !== 0
                  ? (frame.yaws[index] ?? currentEntity.rotation.y)
                  : typeof heading === 'number'
                    ? headingToYaw(heading)
                    : currentEntity.rotation.y
              const speed =
                (flags & RUNTIME_POSE_FRAME_RECORD_FLAGS.speed) !== 0
                  ? (frame.speeds[index] ?? 0)
                  : currentEntity.type === 'vehicle'
                    ? currentEntity.speed
                    : 0
              const sourceTimestamp = frame.timestamps[index] || message.timestamp
              const status = resolvePoseFrameStatus(frame.statuses[index] ?? 0, currentEntity)
              const samples = runtimeVehicleSnapshotRegistry.append(entityId, {
                timestamp: runtimeVehicleSnapshotRegistry.projectTimestamp(
                  sourceTimestamp,
                  receivedAt
                ),
                sourceTimestamp,
                receivedAt,
                position,
                yaw,
                speed,
                status,
              })
              poseBufferUpdates.push({ entityId, samples })

              if (
                shouldSyncPoseFrameEntityToStore(
                  currentEntity,
                  liveState.selectedEntityId,
                  liveState.hoveredEntityId,
                  forceStoreSync
                )
              ) {
                const patch: Record<string, unknown> = {
                  position,
                  rotation: {
                    x: currentEntity.rotation.x,
                    y: yaw,
                    z: currentEntity.rotation.z,
                  },
                  updatedAt: sourceTimestamp,
                }
                if ((frame.statuses[index] ?? 0) > 0) {
                  patch.status = status
                }
                if (currentEntity.type === 'vehicle') {
                  patch.speed = speed
                  if (typeof heading === 'number') patch.heading = heading
                }
                mergeEntityPatch(entityId, patch as Partial<Entity>)
                syncedStoreFromFrame = true
              }

              if (trajectoryEntityId === entityId) {
                trajectoryUpdates.push({
                  entityId,
                  point: {
                    position,
                    timestamp: sourceTimestamp,
                  },
                })
              }
            }

            if (syncedStoreFromFrame && forceStoreSync) {
              poseFrameStoreSyncAtRef.current = receivedAt
            }
            break
          }
          case 'position_update': {
            const data = message.payload as PositionUpdateMessage
            const receivedAt = Date.now()
            const currentEntity = readEntity(data.entityId)
            if (currentEntity?.type === 'dynamic') {
              const presentation = useDigitalTwinStore
                .getState()
                .getDynamicEntityPresentation(currentEntity)
              if (!presentation.movable) {
                break
              }
            }

            const runtimePatch = buildRuntimePositionEntityPatch(currentEntity, data, {
              timestamp: message.timestamp,
            })
            const nextPosition = runtimePatch.position ?? data.position
            const vehiclePatch = runtimePatch as Partial<VehicleEntity>

            if (
              isMovingRuntimeEntity(currentEntity) ||
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
                status: currentEntity?.status ?? 'active',
              })
              poseBufferUpdates.push({ entityId: data.entityId, samples })
            }

            mergeEntityPatch(data.entityId, runtimePatch)
            if (trajectoryEntityId === data.entityId) {
              trajectoryUpdates.push({
                entityId: data.entityId,
                point: {
                  position: nextPosition,
                  timestamp: message.timestamp,
                },
              })
            }
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

      if (poseBufferUpdates.length === 1) {
        const update = poseBufferUpdates[0]
        runtimeVehiclePoseBuffer.upsert(update.entityId, update.samples)
      } else if (poseBufferUpdates.length > 1) {
        runtimeVehiclePoseBuffer.upsertMany(poseBufferUpdates)
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

  const connectWs = useCallback(async () => {
    const connectionGeneration = connectionGenerationRef.current + 1
    connectionGenerationRef.current = connectionGeneration

    if (unsubscribeRef.current) {
      suppressDisconnectFallbackRef.current = true
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }

    const wsUrl = getRealtimeWsUrl(workspaceId)
    if (connectionGenerationRef.current !== connectionGeneration) {
      return
    }

    unsubscribeRef.current = realtimeConnectionHub.subscribe(
      wsUrl,
      {
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
          let shouldFlushNow = false
          for (const runtimeMessage of flattenRealtimeMessage(message)) {
            batcherRef.current.push(runtimeMessage)
            shouldFlushNow = shouldFlushNow || runtimeMessage.type === 'config_changed'
          }
          if (shouldFlushNow) {
            batcherRef.current.flushNow()
          }
        },
      },
      fetchRealtimeAccessTicket
    )
  }, [markRealtimeConnectionIssue, refreshBootstrap, setConnectionStatus, workspaceId])

  useEffect(() => {
    void refreshBootstrap()
    void connectWs()
    const batcher = batcherRef.current

    return () => {
      connectionGenerationRef.current += 1
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
