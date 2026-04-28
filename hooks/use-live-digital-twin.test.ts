import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('useLiveDigitalTwin live-only behavior', () => {
  test('keeps disconnect handling on the live runtime instead of falling back to mock data', () => {
    const source = readFileSync(join(process.cwd(), 'hooks/use-live-digital-twin.ts'), 'utf8')

    expect(source.includes('fallbackToMockRuntimeIfDisconnected')).toBe(false)
    expect(source.includes('hydrateMockState')).toBe(false)
    expect(source.includes("setRuntimeDataSource('mock'")).toBe(false)
    expect(source.includes("setRuntimeDataSource('live', message)")).toBe(true)
    expect(source.includes('markRealtimeConnectionIssue')).toBe(true)
    expect(source.includes('fetchRealtimeAccessTicket')).toBe(true)
    expect(source.includes('/api/realtime-ticket')).toBe(true)
    expect(source.includes('fetchRealtimeAccessTicket\n    )')).toBe(true)
    expect(source.includes('getBackendRealtimeAccessToken')).toBe(false)
    expect(source.includes('const wasConnected = store.isConnected')).toBe(true)
    expect(source.includes('setConnectionStatus(true, getRealtimeWsUrl(workspaceId))')).toBe(false)
  })

  test('appends live trajectory points only for selected playback entity', () => {
    const source = readFileSync(join(process.cwd(), 'hooks/use-live-digital-twin.ts'), 'utf8')

    expect(source.includes('const trajectoryUpdates: Array<{ entityId: string; point: { position: VehicleEntity')).toBe(true)
    expect(source.includes('const liveState = useDigitalTwinStore.getState()')).toBe(true)
    expect(source.includes('const trajectoryEntityId = liveState.isPlayingTrajectory ? liveState.selectedEntityId : null')).toBe(true)
    expect(source.includes('if (trajectoryEntityId === data.entityId)')).toBe(true)
    expect(source.includes('trajectoryUpdates.push({')).toBe(true)
    expect(source.includes('timestamp: message.timestamp')).toBe(true)
  })

  test('uses entity schema registry when filtering non-movable dynamic entities', () => {
    const source = readFileSync(join(process.cwd(), 'hooks/use-live-digital-twin.ts'), 'utf8')

    expect(source.includes('getDynamicEntityPresentation(currentEntity)')).toBe(true)
    expect(source.includes('presentation.movable')).toBe(true)
    expect(source.includes('if (!presentation.movable)')).toBe(true)
    expect(source.includes('setPlatformRegistry')).toBe(true)
  })

  test('expands backend realtime batch envelopes before the frame batcher', () => {
    const source = readFileSync(join(process.cwd(), 'hooks/use-live-digital-twin.ts'), 'utf8')

    expect(source.includes('RuntimeBatchMessage')).toBe(true)
    expect(source.includes("message.type !== 'batch'")).toBe(true)
    expect(source.includes('flattenRealtimeMessage(message)')).toBe(true)
    expect(source.includes('for (const runtimeMessage of flattenRealtimeMessage(message))')).toBe(
      true
    )
    expect(source.includes("runtimeMessage.type === 'config_changed'")).toBe(true)
  })

  test('decodes dense binary pose frames into pose buffers before throttled store sync', () => {
    const source = readFileSync(join(process.cwd(), 'hooks/use-live-digital-twin.ts'), 'utf8')

    expect(source.includes("case 'pose_frame'")).toBe(true)
    expect(source.includes('RuntimePoseFramePayload')).toBe(true)
    expect(source.includes('POSE_FRAME_STORE_SYNC_INTERVAL_MS')).toBe(true)
    expect(source.includes('runtimeVehicleSnapshotRegistry.append(entityId')).toBe(true)
    expect(source.includes('runtimeVehiclePoseBuffer.upsert(entityId, samples)')).toBe(true)
    expect(source.includes('shouldSyncPoseFrameEntityToStore')).toBe(true)
    expect(source.includes('isMovingRuntimeEntity(currentEntity)')).toBe(true)
  })
})
