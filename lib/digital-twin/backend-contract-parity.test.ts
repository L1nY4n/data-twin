import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  ConfigChangedMessage,
  PositionUpdateMessage,
  PublishedSceneRuntimeDescriptor,
  RuntimeSignalPrimitiveValue,
  RuntimeSignalUpdate,
  SignalUpdateMessage,
  Vector3,
  VehicleRouteTrackDescriptor,
  VehicleTrackPositionDescriptor,
  WSMessage,
} from './types'

type CanonicalPositionUpdateMessage = PositionUpdateMessage & {
  routeTrack: VehicleRouteTrackDescriptor
  trackPosition: VehicleTrackPositionDescriptor
}

type CanonicalSignalUpdateMessage = SignalUpdateMessage & {
  signals: [RuntimeSignalUpdate, ...RuntimeSignalUpdate[]]
}

type CanonicalConfigChangedMessage = ConfigChangedMessage & {
  publishedScene: PublishedSceneRuntimeDescriptor
}

type CanonicalRealtimeFixture = [
  WSMessage & { type: 'position_update'; payload: CanonicalPositionUpdateMessage },
  WSMessage & { type: 'signal_update'; payload: CanonicalSignalUpdateMessage },
  WSMessage & { type: 'config_changed'; payload: CanonicalConfigChangedMessage },
]

function readRealtimeFixture(): unknown {
  const parsed: unknown = JSON.parse(
    readFileSync(join(process.cwd(), 'fixtures/contracts/realtime-events.json'), 'utf8')
  )
  return parsed
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isVector3(value: unknown): value is Vector3 {
  if (!isRecord(value)) return false
  return isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.z)
}

function isVehicleRouteTrackDescriptor(value: unknown): value is VehicleRouteTrackDescriptor {
  if (!isRecord(value)) return false
  return (
    isString(value.routeId) &&
    isString(value.trackId) &&
    isString(value.label) &&
    typeof value.looped === 'boolean' &&
    Array.isArray(value.waypoints) &&
    value.waypoints.length >= 2 &&
    value.waypoints.every(isVector3)
  )
}

function isVehicleTrackPositionDescriptor(value: unknown): value is VehicleTrackPositionDescriptor {
  if (!isRecord(value)) return false
  return (
    isString(value.routeId) &&
    isString(value.trackId) &&
    Number.isInteger(value.segmentIndex) &&
    Number.isInteger(value.nextWaypointIndex) &&
    isFiniteNumber(value.segmentProgress)
  )
}

function isRuntimeSignalPrimitiveValue(value: unknown): value is RuntimeSignalPrimitiveValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    isFiniteNumber(value)
  )
}

function isRuntimeSignalUpdate(value: unknown): value is RuntimeSignalUpdate {
  if (!isRecord(value)) return false
  return (
    (value.id === undefined || isString(value.id)) &&
    (value.name === undefined || isString(value.name)) &&
    (value.path === undefined || isString(value.path)) &&
    (value.label === undefined || isString(value.label)) &&
    (value.unit === undefined || isString(value.unit)) &&
    (value.dataType === undefined || isString(value.dataType)) &&
    (value.connectorId === undefined || isString(value.connectorId)) &&
    (value.direction === undefined || isString(value.direction)) &&
    (value.writable === undefined || typeof value.writable === 'boolean') &&
    isRuntimeSignalPrimitiveValue(value.value) &&
    (value.quality === undefined || isString(value.quality))
  )
}

function isPublishedSceneRuntimeDescriptor(
  value: unknown
): value is PublishedSceneRuntimeDescriptor {
  if (!isRecord(value)) return false
  return (
    isString(value.packageUrl) &&
    isString(value.packageVersion) &&
    isString(value.sceneId) &&
    isString(value.generatedAt) &&
    isString(value.staticAssetManifestUrl)
  )
}

function isCanonicalPositionUpdateMessage(
  value: unknown
): value is CanonicalPositionUpdateMessage {
  if (!isRecord(value)) return false
  return (
    isString(value.entityId) &&
    isVector3(value.position) &&
    (value.rotation === undefined || isVector3(value.rotation)) &&
    (value.speed === undefined || isFiniteNumber(value.speed)) &&
    (value.heading === undefined || isFiniteNumber(value.heading)) &&
    isVehicleRouteTrackDescriptor(value.routeTrack) &&
    isVehicleTrackPositionDescriptor(value.trackPosition)
  )
}

function isCanonicalSignalUpdateMessage(value: unknown): value is CanonicalSignalUpdateMessage {
  if (!isRecord(value)) return false
  return (
    isString(value.entityId) &&
    (value.source === undefined || isString(value.source)) &&
    (value.connectorId === undefined || isString(value.connectorId)) &&
    Array.isArray(value.signals) &&
    value.signals.length > 0 &&
    value.signals.every(isRuntimeSignalUpdate)
  )
}

function isCanonicalConfigChangedMessage(value: unknown): value is CanonicalConfigChangedMessage {
  if (!isRecord(value)) return false
  return (
    isString(value.workspaceId) &&
    Number.isInteger(value.sceneVersion) &&
    isFiniteNumber(value.changedAt) &&
    value.scope === 'publish' &&
    isPublishedSceneRuntimeDescriptor(value.publishedScene)
  )
}

function isCanonicalRealtimeFixture(value: unknown): value is CanonicalRealtimeFixture {
  if (!Array.isArray(value) || value.length !== 3) return false
  const [positionUpdate, signalUpdate, configChanged] = value
  if (!isRecord(positionUpdate) || !isRecord(signalUpdate) || !isRecord(configChanged)) {
    return false
  }

  return (
    positionUpdate.type === 'position_update' &&
    isFiniteNumber(positionUpdate.timestamp) &&
    isCanonicalPositionUpdateMessage(positionUpdate.payload) &&
    signalUpdate.type === 'signal_update' &&
    isFiniteNumber(signalUpdate.timestamp) &&
    isCanonicalSignalUpdateMessage(signalUpdate.payload) &&
    configChanged.type === 'config_changed' &&
    isFiniteNumber(configChanged.timestamp) &&
    isCanonicalConfigChangedMessage(configChanged.payload)
  )
}

describe('backend contract parity fixtures', () => {
  test('canonical realtime event fixture matches frontend runtime message types', () => {
    const rawEvents = readRealtimeFixture()
    expect(isCanonicalRealtimeFixture(rawEvents)).toBe(true)

    if (!isCanonicalRealtimeFixture(rawEvents)) {
      throw new Error('canonical realtime fixture should match frontend runtime message types')
    }

    const events = rawEvents

    expect(events.map((event) => event.type)).toEqual([
      'position_update',
      'signal_update',
      'config_changed',
    ])

    const positionPayload = events[0].payload
    const routeTrack = positionPayload.routeTrack
    expect(positionPayload.entityId).toBe('vehicle-forklift-01')
    expect(routeTrack.trackId).toBe('forklift-track-live')
    expect(positionPayload.trackPosition?.segmentProgress).toBe(0.42)

    const signalPayload = events[1].payload
    expect(signalPayload.signals[0]?.path).toBe('PLC/Line1/Reactor/TemperaturePV')
    expect(signalPayload.signals[0]?.value).toBe(88.5)

    const configPayload = events[2].payload
    expect(configPayload.workspaceId).toBe('industrial-campus')
    expect(configPayload.scope).toBe('publish')
    expect(configPayload.publishedScene?.packageUrl).toContain('/published-scene-package.json')
  })

  test('frontend fixture guard rejects malformed realtime payloads', () => {
    const rawEvents = readRealtimeFixture()
    expect(isCanonicalRealtimeFixture(rawEvents)).toBe(true)

    if (!isCanonicalRealtimeFixture(rawEvents)) {
      throw new Error('canonical realtime fixture should match frontend runtime message types')
    }

    const malformed = [
      {
        ...rawEvents[0],
        payload: { ...rawEvents[0].payload, entityId: 42 },
      },
      rawEvents[1],
      rawEvents[2],
    ]

    expect(isCanonicalRealtimeFixture(malformed)).toBe(false)
  })
})
