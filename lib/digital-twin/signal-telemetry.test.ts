import { describe, expect, test } from 'bun:test'

import {
  collectEntitySignalSnapshots,
  formatSignalValue,
  summarizeEntityDirectorySignalTelemetry,
  summarizeEntitySignalTelemetry,
} from './signal-telemetry'
import type { EquipmentEntity, SensorEntity, VehicleEntity } from './types'

const base = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  visible: true,
  metadata: {},
  createdAt: 100,
  updatedAt: 200,
} as const

function makeSensor(overrides: Partial<SensorEntity> = {}): SensorEntity {
  return {
    ...base,
    id: 'sensor-1',
    type: 'sensor',
    name: '温度传感器',
    status: 'active',
    sensorType: 'temperature',
    unit: '℃',
    reading: 68.5,
    ...overrides,
  }
}

function makeEquipment(overrides: Partial<EquipmentEntity> = {}): EquipmentEntity {
  return {
    ...base,
    id: 'pump-1',
    type: 'equipment',
    name: 'Pump 1',
    status: 'warning',
    parameters: { rpm: 1450, enabled: true },
    alarms: [],
    ...overrides,
  }
}

function makeVehicle(overrides: Partial<VehicleEntity> = {}): VehicleEntity {
  return {
    ...base,
    id: 'forklift-1',
    type: 'vehicle',
    name: 'Forklift 1',
    status: 'active',
    plateNumber: 'FL-001',
    vehicleType: 'forklift',
    speed: 3.25,
    heading: 90,
    ...overrides,
  }
}

describe('entity signal telemetry', () => {
  test('derives runtime signals from native sensor fields', () => {
    const signals = collectEntitySignalSnapshots(makeSensor())

    expect(signals.map((signal) => signal.descriptor.label)).toContain('实时读数')
    expect(signals.find((signal) => signal.descriptor.path?.endsWith('/reading'))?.value).toBe(68.5)
    expect(signals.every((signal) => signal.quality === 'good')).toBe(true)
  })

  test('merges realvirtual-style metadata signals with native entity telemetry', () => {
    const signals = collectEntitySignalSnapshots(
      makeEquipment({
        metadata: {
          realvirtual: {
            signals: [
              {
                id: 'pump-speed',
                name: 'PumpSpeed',
                path: 'PLC/Pump1/Speed',
                value: 1450,
                unit: 'rpm',
                direction: 'input',
              },
              {
                id: 'pump-enable',
                name: 'PumpEnable',
                path: 'PLC/Pump1/Enable',
                writable: true,
              },
            ],
          },
        },
      })
    )

    expect(signals.some((signal) => signal.descriptor.path === 'PLC/Pump1/Speed')).toBe(true)
    expect(signals.find((signal) => signal.descriptor.path === 'PLC/Pump1/Enable')?.descriptor.writable).toBe(true)
    expect(signals.some((signal) => signal.descriptor.path === 'entity/pump-1/parameter.rpm')).toBe(true)
    expect(signals.filter((signal) => signal.quality === 'uncertain').length).toBe(signals.length)
  })

  test('summarizes signal health for the HMI overlay', () => {
    const summary = summarizeEntitySignalTelemetry([
      makeSensor(),
      makeEquipment(),
      makeVehicle({ status: 'error' }),
    ])

    expect(summary.totalSignals).toBeGreaterThanOrEqual(7)
    expect(summary.entityCountWithSignals).toBe(3)
    expect(summary.degradedSignals).toBeGreaterThan(0)
    expect(summary.lastUpdatedAt).toBe(200)
    expect(formatSignalValue(3.25, 'm/s')).toBe('3.25 m/s')
  })

  test('summarizes lightweight directory entries without subscribing to full entity state', () => {
    const summary = summarizeEntityDirectorySignalTelemetry([
      { id: 'sensor-1', type: 'sensor', status: 'active', visible: true },
      { id: 'pump-1', type: 'equipment', status: 'warning', visible: true },
      { id: 'hidden-vehicle', type: 'vehicle', status: 'error', visible: false },
    ])

    expect(summary.totalSignals).toBe(5)
    expect(summary.entityCountWithSignals).toBe(2)
    expect(summary.degradedSignals).toBe(3)
    expect(summary.lastUpdatedAt).toBeNull()
  })

  test('honors projected runtime signal metrics on directory entries', () => {
    const summary = summarizeEntityDirectorySignalTelemetry([
      {
        id: 'sensor-1',
        type: 'sensor',
        status: 'active',
        visible: true,
        signalCount: 4,
        degradedSignalCount: 1,
        writableSignalCount: 2,
        lastSignalUpdatedAt: 300,
      },
      { id: 'pump-hidden', type: 'equipment', status: 'error', visible: false, signalCount: 12 },
    ])

    expect(summary.totalSignals).toBe(4)
    expect(summary.degradedSignals).toBe(1)
    expect(summary.writableSignals).toBe(2)
    expect(summary.lastUpdatedAt).toBe(300)
  })

  test('marks runtime-injected metadata signals as runtime source', () => {
    const signals = collectEntitySignalSnapshots(
      makeSensor({
        updatedAt: 400,
        metadata: {
          realvirtual: {
            signals: [
              {
                id: 'reactor-temp-pv',
                name: 'ReactorTemperaturePV',
                path: 'PLC/Line1/Reactor/TemperaturePV',
                value: 71.2,
                unit: 'C',
                dataType: 'float',
                source: 'runtime',
                quality: 'uncertain',
              },
            ],
          },
        },
      })
    )

    const runtimeSignal = signals.find((signal) => signal.descriptor.id.endsWith('reactor-temp-pv'))
    expect(runtimeSignal?.source).toBe('runtime')
    expect(runtimeSignal?.descriptor.dataType).toBe('float')
    expect(runtimeSignal?.value).toBe(71.2)
    expect(runtimeSignal?.quality).toBe('uncertain')
  })
})
