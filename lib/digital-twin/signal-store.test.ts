import { describe, expect, test } from 'bun:test'

import { createDigitalTwinSignalStore } from './signal-store'

describe('digital twin signal store', () => {
  test('registers descriptors and reads initial values', () => {
    const store = createDigitalTwinSignalStore()
    const snapshot = store.registerDescriptor(
      {
        id: 'pump-speed',
        name: 'PumpSpeed',
        path: 'PLC/PumpA/Speed',
        unit: 'rpm',
        direction: 'input',
      },
      1200
    )

    expect(snapshot.value).toBe(1200)
    expect(store.size).toBe(1)
    expect(store.getValue('pump-speed')).toBe(1200)
    expect(store.getSignal('PumpSpeed')?.descriptor.unit).toBe('rpm')
  })

  test('supports name and path lookup', () => {
    const store = createDigitalTwinSignalStore([
      {
        id: 'conveyor-running',
        name: 'ConveyorRunning',
        path: 'Line1/Conveyor/Running',
        direction: 'input',
      },
    ])

    store.updateSignal({ name: 'ConveyorRunning', value: true, timestamp: 10 })
    expect(store.getSignal({ path: 'Line1/Conveyor/Running' })?.value).toBe(true)
    expect(store.resolveSignalId({ name: 'ConveyorRunning' })).toBe('conveyor-running')
  })

  test('resolves PLC paths by normalized and suffix aliases', () => {
    const store = createDigitalTwinSignalStore([
      {
        id: 'conveyor-start',
        name: 'ConveyorStart',
        path: 'Factory_Cell/Signals/Line1/Conveyor/Start',
        direction: 'output',
      },
    ])

    expect(store.resolveSignalId({ path: 'Factory Cell/Signals/Line1/Conveyor/Start' })).toBe(
      'conveyor-start'
    )
    expect(store.resolveSignalId({ path: 'Signals/Line1/Conveyor/Start' })).toBe(
      'conveyor-start'
    )

    store.updateSignal({ path: 'Signals/Line1/Conveyor/Start', value: true, timestamp: 12 })
    expect(store.getSignal('conveyor-start')?.value).toBe(true)
  })

  test('lists immutable signal snapshots in registration order', () => {
    const store = createDigitalTwinSignalStore([
      { id: 'speed', name: 'Speed', direction: 'input' },
      { id: 'enabled', name: 'Enabled', direction: 'output' },
    ])

    store.updateSignal({ id: 'speed', value: 5 })
    const snapshots = store.listSignals()
    snapshots[0]!.value = 99
    snapshots[0]!.descriptor.name = 'Mutated'

    expect(snapshots.map((snapshot) => snapshot.descriptor.id)).toEqual(['speed', 'enabled'])
    expect(store.getValue('speed')).toBe(5)
    expect(store.getSignal('speed')?.descriptor.name).toBe('Speed')
  })

  test('keeps lookup indexes current when descriptors are re-registered', () => {
    const store = createDigitalTwinSignalStore([
      {
        id: 'pump-mode',
        name: 'PumpMode',
        path: 'PLC/Pump/Mode',
        direction: 'internal',
      },
    ])

    store.registerDescriptor({
      id: 'pump-mode',
      name: 'PumpModeCommand',
      path: 'PLC/Pump/ModeCommand',
      direction: 'output',
    })

    expect(store.resolveSignalId({ name: 'PumpMode' })).toBeNull()
    expect(store.resolveSignalId({ path: 'PLC/Pump/Mode' })).toBeNull()
    expect(store.resolveSignalId({ name: 'PumpModeCommand' })).toBe('pump-mode')
  })

  test('notifies subscribers once per changed batch', () => {
    const store = createDigitalTwinSignalStore([
      { id: 'temperature', name: 'Temperature', direction: 'input' },
      { id: 'pressure', name: 'Pressure', direction: 'input' },
    ])
    const batches: string[][] = []
    const singleSignalValues: unknown[] = []

    store.subscribe((changes) => {
      batches.push(changes.map((change) => change.descriptor.id))
    })
    store.subscribeSignal('temperature', (snapshot) => {
      singleSignalValues.push(snapshot.value)
    })

    store.updateSignals([
      { id: 'temperature', value: 42, timestamp: 11 },
      { id: 'pressure', value: 3.2, timestamp: 11 },
    ])

    expect(batches).toEqual([['temperature', 'pressure']])
    expect(singleSignalValues).toEqual([42])
  })

  test('tracks and drains dirty output signals', () => {
    const store = createDigitalTwinSignalStore([
      {
        id: 'motor-enable',
        name: 'MotorEnable',
        path: 'PLC/Motor/Enable',
        direction: 'output',
      },
      {
        id: 'motor-current',
        name: 'MotorCurrent',
        path: 'PLC/Motor/Current',
        direction: 'input',
      },
    ])

    store.updateOutput({ path: 'PLC/Motor/Enable' }, true, 22)
    store.updateSignal({ id: 'motor-current', value: 6.8, timestamp: 22 })

    const dirty = store.drainDirtyOutputSignals()
    expect(dirty.map((snapshot) => snapshot.descriptor.id)).toEqual(['motor-enable'])
    expect(dirty[0]?.value).toBe(true)
    expect(store.drainDirtyOutputSignals()).toHaveLength(0)
  })
})
