import { describe, expect, test } from 'bun:test'
import { SelectableComponent, createEcsWorld, flushCommands } from './world'
import type { EcsCommand } from './world'

describe('ecs world command buffer', () => {
  test('creates, updates and removes entities through buffered commands', () => {
    const world = createEcsWorld()

    const commands: EcsCommand[] = [
      {
        type: 'create',
        payload: {
          id: 'vehicle-1',
          entityType: 'vehicle',
          name: '测试车辆',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: {},
          heading: 0,
          speed: 5,
        },
      },
      {
        type: 'update',
        payload: {
          id: 'vehicle-1',
          updates: {
            position: { x: 5, y: 0, z: 6 },
            heading: 32,
          },
        },
      },
      {
        type: 'remove',
        payload: {
          id: 'vehicle-1',
        },
      },
    ]

    const created = flushCommands(world, commands.slice(0, 1))
    expect(created.applied).toBe(1)
    expect(world.byExternalId.get('vehicle-1')).toBeDefined()

    const updated = flushCommands(world, commands.slice(1, 2))
    expect(updated.applied).toBe(1)
    const snapshot = world.snapshotById.get('vehicle-1')
    expect(snapshot?.position.x).toBe(5)
    expect(snapshot?.position.z).toBe(6)
    expect(snapshot?.heading).toBe(32)

    const removed = flushCommands(world, commands.slice(2))
    expect(removed.applied).toBe(1)
    expect(world.byExternalId.get('vehicle-1')).toBeUndefined()
    expect(world.snapshotById.get('vehicle-1')).toBeUndefined()
  })

  test('updates snapshot in place to reduce runtime allocations', () => {
    const world = createEcsWorld()

    flushCommands(world, [
      {
        type: 'create',
        payload: {
          id: 'person-1',
          entityType: 'person',
          name: '测试人员',
          position: { x: 1, y: 0, z: 1 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: { track: 'A' },
        },
      },
    ])

    const before = world.snapshotById.get('person-1')
    expect(before).toBeDefined()

    flushCommands(world, [
      {
        type: 'update',
        payload: {
          id: 'person-1',
          updates: {
            position: { x: 3, y: 0, z: 4 },
            metadata: { lane: 'L2' },
          },
        },
      },
    ])

    const after = world.snapshotById.get('person-1')
    expect(after).toBe(before)
    expect(after?.position.x).toBe(3)
    expect(after?.position.z).toBe(4)
    expect(after?.metadata.track).toBe('A')
    expect(after?.metadata.lane).toBe('L2')
  })

  test('preserves extended entity fields and timestamps through ECS snapshots', () => {
    const world = createEcsWorld()
    const now = Date.now()

    flushCommands(world, [
      {
        type: 'create',
        payload: {
          id: 'vehicle-ext',
          entityType: 'vehicle',
          name: '扩展字段车辆',
          position: { x: 2, y: 0, z: 3 },
          rotation: { x: 0, y: 0.5, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: { lane: 'A1' },
          plateNumber: '沪A12345',
          vehicleType: 'truck',
          speed: 6,
          heading: 45,
          capacity: 5000,
          currentLoad: 1400,
          createdAt: now - 5000,
          updatedAt: now - 2000,
        },
      },
      {
        type: 'create',
        payload: {
          id: 'equipment-ext',
          entityType: 'equipment',
          name: '扩展字段设备',
          position: { x: -2, y: 0, z: -3 },
          rotation: { x: 0, y: 1.2, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'warning',
          visible: true,
          metadata: { line: 'L2' },
          modelId: 'eq-001',
          modelUrl: '/models/eq.glb',
          parameters: { 温度: 80, 功率: 76 },
          alarms: [
            {
              id: 'alarm-1',
              level: 'warning',
              message: '温度偏高',
              timestamp: now - 1000,
              acknowledged: false,
            },
          ],
          maintenanceSchedule: [{ start: now + 1000, end: now + 2000, label: '巡检' }],
          createdAt: now - 4000,
          updatedAt: now - 1500,
        },
      },
      {
        type: 'create',
        payload: {
          id: 'zone-ext',
          entityType: 'zone',
          name: '扩展字段区域',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: { floor: 1 },
          zoneType: 'restricted',
          color: '#ef4444',
          boundary: [
            { x: -1, y: 0, z: -1 },
            { x: 1, y: 0, z: -1 },
            { x: 1, y: 0, z: 1 },
            { x: -1, y: 0, z: 1 },
          ],
          accessRules: [
            {
              id: 'rule-1',
              allowedRoles: ['admin'],
              allowedDepartments: ['ops'],
              timeRanges: [{ start: now, end: now + 3600_000 }],
              action: 'deny',
            },
          ],
          capacity: 20,
          currentOccupancy: 8,
          createdAt: now - 9000,
          updatedAt: now - 3000,
        },
      },
    ])

    const vehicle = world.snapshotById.get('vehicle-ext')
    expect(vehicle?.capacity).toBe(5000)
    expect(vehicle?.currentLoad).toBe(1400)
    expect(vehicle?.createdAt).toBe(now - 5000)
    expect(vehicle?.updatedAt).toBe(now - 2000)

    const equipment = world.snapshotById.get('equipment-ext')
    expect(equipment?.modelId).toBe('eq-001')
    expect(equipment?.modelUrl).toBe('/models/eq.glb')
    expect(equipment?.alarms?.length).toBe(1)
    expect(equipment?.maintenanceSchedule?.[0]?.label).toBe('巡检')

    const zone = world.snapshotById.get('zone-ext')
    expect(zone?.color).toBe('#ef4444')
    expect(zone?.accessRules?.length).toBe(1)
    expect(zone?.capacity).toBe(20)
    expect(zone?.currentOccupancy).toBe(8)
  })

  test('maintains type indexes as entities are created and removed', () => {
    const world = createEcsWorld()

    flushCommands(world, [
      {
        type: 'create',
        payload: {
          id: 'person-1',
          entityType: 'person',
          name: '人员1',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: {},
        },
      },
      {
        type: 'create',
        payload: {
          id: 'vehicle-1',
          entityType: 'vehicle',
          name: '车辆1',
          position: { x: 1, y: 0, z: 1 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: {},
        },
      },
      {
        type: 'create',
        payload: {
          id: 'equipment-1',
          entityType: 'equipment',
          name: '设备1',
          position: { x: 2, y: 0, z: 2 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: {},
        },
      },
      {
        type: 'create',
        payload: {
          id: 'zone-1',
          entityType: 'zone',
          name: '区域1',
          position: { x: 3, y: 0, z: 3 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: {},
          boundary: [
            { x: 2, y: 0, z: 2 },
            { x: 4, y: 0, z: 2 },
            { x: 4, y: 0, z: 4 },
          ],
        },
      },
    ])

    expect(world.byType.person.has('person-1')).toBe(true)
    expect(world.byType.vehicle.has('vehicle-1')).toBe(true)
    expect(world.byType.equipment.has('equipment-1')).toBe(true)
    expect(world.byType.zone.has('zone-1')).toBe(true)

    flushCommands(world, [{ type: 'remove', payload: { id: 'vehicle-1' } }])

    expect(world.byType.vehicle.has('vehicle-1')).toBe(false)
    expect(world.byType.person.has('person-1')).toBe(true)
    expect(world.byType.equipment.has('equipment-1')).toBe(true)
    expect(world.byType.zone.has('zone-1')).toBe(true)
  })

  test('clears selected and hovered ids when removing selected entity', () => {
    const world = createEcsWorld()
    flushCommands(world, [
      {
        type: 'create',
        payload: {
          id: 'entity-1',
          entityType: 'person',
          name: '人员1',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: {},
        },
      },
    ])

    flushCommands(world, [
      { type: 'select', payload: { id: 'entity-1' } },
      { type: 'hover', payload: { id: 'entity-1' } },
    ])

    expect(world.selectedId).toBe('entity-1')
    expect(world.hoveredId).toBe('entity-1')

    flushCommands(world, [{ type: 'remove', payload: { id: 'entity-1' } }])

    expect(world.selectedId).toBeNull()
    expect(world.hoveredId).toBeNull()
  })

  test('updates selectable flags when switching selected entity', () => {
    const world = createEcsWorld()
    flushCommands(world, [
      {
        type: 'create',
        payload: {
          id: 'entity-a',
          entityType: 'person',
          name: 'A',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: {},
        },
      },
      {
        type: 'create',
        payload: {
          id: 'entity-b',
          entityType: 'person',
          name: 'B',
          position: { x: 1, y: 0, z: 1 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: {},
        },
      },
    ])

    flushCommands(world, [{ type: 'select', payload: { id: 'entity-a' } }])
    const aEid = world.byExternalId.get('entity-a')
    const bEid = world.byExternalId.get('entity-b')
    expect(aEid).toBeDefined()
    expect(bEid).toBeDefined()

    flushCommands(world, [{ type: 'select', payload: { id: 'entity-b' } }])

    expect(world.selectedId).toBe('entity-b')
    expect(SelectableComponent.selected[aEid as number]).toBe(0)
    expect(SelectableComponent.selected[bEid as number]).toBe(1)
  })
})
