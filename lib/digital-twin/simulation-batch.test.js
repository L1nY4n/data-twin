import { describe, expect, test } from 'bun:test'
import { useDigitalTwinStore } from './store'

describe('simulation batch updates', () => {
  test('applies entity, trajectory and alarm updates in a single store commit', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    store.addEntity({
      id: 'vehicle-1',
      type: 'vehicle',
      name: '测试车辆',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      status: 'active',
      visible: true,
      metadata: {},
      createdAt: 0,
      updatedAt: 0,
      plateNumber: '沪A10001',
      vehicleType: 'car',
      speed: 5,
      heading: 0,
      capacity: 100,
      currentLoad: 0,
    })

    let commits = 0
    const unsubscribe = useDigitalTwinStore.subscribe(() => {
      commits += 1
    })

    const before = Date.now()

    useDigitalTwinStore.getState().applySimulationTick({
      entityUpdates: [
        {
          id: 'vehicle-1',
          updates: {
            position: { x: 1, y: 0, z: 2 },
            rotation: { x: 0, y: 0.2, z: 0 },
          },
        },
      ],
      trajectoryUpdates: [
        {
          entityId: 'vehicle-1',
          point: { position: { x: 1, y: 0, z: 2 }, timestamp: before },
        },
      ],
      newAlarms: [
        {
          id: 'alarm-1',
          level: 'warning',
          message: '测试告警',
          timestamp: before,
          acknowledged: false,
        },
      ],
    })

    unsubscribe()

    const state = useDigitalTwinStore.getState()
    const vehicle = state.entities.get('vehicle-1')

    expect(vehicle?.position).toEqual({ x: 1, y: 0, z: 2 })
    expect(vehicle?.rotation?.y).toBe(0.2)
    expect((vehicle?.updatedAt ?? 0) >= before).toBe(true)
    expect(state.trajectories.get('vehicle-1')?.points.length).toBe(1)
    expect(state.alarms.length).toBe(1)
    expect(state.unacknowledgedAlarmCount).toBe(1)
    expect(commits).toBe(1)
  })

  test('caps trajectory cache size to avoid long-run growth', () => {
    const store = useDigitalTwinStore.getState()
    store.reset()

    for (let i = 0; i < 40; i += 1) {
      const id = `vehicle-${i}`
      store.addTrajectoryPoint(id, {
        position: { x: i, y: 0, z: i },
        timestamp: Date.now() + i,
      })
    }

    const state = useDigitalTwinStore.getState()
    expect(state.trajectories.size).toBeLessThanOrEqual(24)
    expect(state.trajectories.has('vehicle-39')).toBe(true)
  })
})
