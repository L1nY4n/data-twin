import { describe, expect, test } from 'bun:test'
import type {
  PositionUpdateMessage,
  SensorEntity,
  StatusUpdateMessage,
  VehicleEntity,
} from './types'
import {
  buildRuntimePositionEntityPatch,
  buildRuntimeStatusEntityPatch,
  resolveRuntimeIncident,
} from './runtime-ingest'

function createSensor(): SensorEntity {
  return {
    id: 'sensor-temp-reactor-01',
    type: 'sensor',
    name: 'Sensor',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    status: 'active',
    visible: true,
    metadata: {},
    sensorType: 'temperature',
    unit: 'C',
    reading: 22,
    thresholdMin: 10,
    thresholdMax: 30,
    createdAt: 1,
    updatedAt: 1,
  }
}

function createVehicle(): VehicleEntity {
  return {
    id: 'vehicle-forklift-01',
    type: 'vehicle',
    name: 'Forklift',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    status: 'active',
    visible: true,
    metadata: {},
    plateNumber: 'TEST-001',
    vehicleType: 'forklift',
    speed: 0,
    heading: 0,
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('runtime ingest helpers', () => {
  test('maps runtime vehicle track contracts onto typed vehicle fields', () => {
    const vehicle = createVehicle()
    const message: PositionUpdateMessage = {
      entityId: vehicle.id,
      position: { x: 8, y: 0, z: -2 },
      speed: 2.4,
      heading: 90,
      routeTrack: {
        id: 'forklift-track-01',
        loop: true,
        points: [
          { x: 8, y: 0, z: -2 },
          { x: 12, y: 0, z: 3 },
          { x: 18, y: 0, z: 3 },
        ],
      },
      trackPosition: {
        trackId: 'forklift-track-01',
        segmentIndex: 1,
        segmentProgress: 0.42,
        direction: 'forward',
        target: { x: 18, y: 0, z: 3 },
      },
    }

    expect(buildRuntimePositionEntityPatch(vehicle, message)).toEqual({
      speed: 2.4,
      heading: 90,
      routeTrack: {
        id: 'forklift-track-01',
        loop: true,
        points: [
          { x: 8, y: 0, z: -2 },
          { x: 12, y: 0, z: 3 },
          { x: 18, y: 0, z: 3 },
        ],
      },
      trackPosition: {
        trackId: 'forklift-track-01',
        segmentIndex: 1,
        segmentProgress: 0.42,
        direction: 'forward',
        target: { x: 18, y: 0, z: 3 },
      },
      metadata: {
        track: 'forklift-track-01',
        routeLoop: [
          { x: 8, y: 0, z: -2 },
          { x: 12, y: 0, z: 3 },
          { x: 18, y: 0, z: 3 },
        ],
        routeLoopClosed: true,
        runtimeTrack: {
          id: 'forklift-track-01',
          loop: true,
          points: [
            { x: 8, y: 0, z: -2 },
            { x: 12, y: 0, z: 3 },
            { x: 18, y: 0, z: 3 },
          ],
        },
        routeLoopIndex: 1,
        routeProgress: 0.42,
        routeGoal: { x: 18, y: 0, z: 3 },
        moveTarget: { x: 18, y: 0, z: 3 },
        routeDirection: 'forward',
        runtimeRoute: {
          trackId: 'forklift-track-01',
          segmentIndex: 1,
          segmentProgress: 0.42,
          direction: 'forward',
          target: { x: 18, y: 0, z: 3 },
        },
      },
    })
  })

  test('maps sensor status parameters onto typed sensor fields', () => {
    const sensor = createSensor()
    const message: StatusUpdateMessage = {
      entityId: sensor.id,
      status: 'warning',
      parameters: {
        reading: 67.5,
        unit: 'C',
        thresholdMin: 5,
        thresholdMax: 70,
      },
    }

    expect(buildRuntimeStatusEntityPatch(sensor, message)).toEqual({
      status: 'warning',
      reading: 67.5,
      unit: 'C',
      thresholdMin: 5,
      thresholdMax: 70,
    })
  })

  test('rejects malformed incident payloads before they reach the viewer', () => {
    expect(
      resolveRuntimeIncident({
        incident: {
          id: 'incident-invalid',
          severity: 'warning',
        },
      })
    ).toBeNull()
  })

  test('accepts fully shaped runtime incidents', () => {
    expect(
      resolveRuntimeIncident({
        incident: {
          id: 'incident-valid',
          kind: 'near_miss',
          severity: 'warning',
          title: 'Valid incident',
          summary: 'Summary',
          message: 'Message',
          primaryEntityId: 'vehicle-forklift-01',
          entityIds: ['vehicle-forklift-01'],
          citations: [{ id: 'citation-1', label: 'source', value: 'simulator' }],
          acknowledged: false,
          timestamp: 123,
        },
      })
    ).toEqual({
      id: 'incident-valid',
      kind: 'near_miss',
      severity: 'warning',
      title: 'Valid incident',
      summary: 'Summary',
      message: 'Message',
      primaryEntityId: 'vehicle-forklift-01',
      entityIds: ['vehicle-forklift-01'],
      citations: [{ id: 'citation-1', label: 'source', value: 'simulator' }],
      acknowledged: false,
      timestamp: 123,
    })
  })
})
