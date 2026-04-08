import { describe, expect, test } from 'bun:test'
import { createCitationRuntimeState, evaluateRuntimeIncidents } from './citation-runtime'
import type { Entity, ZoneEntity } from './types'

function createZone(overrides: Partial<ZoneEntity> = {}): ZoneEntity {
  const now = 1_700_000_000_000
  return {
    id: overrides.id ?? 'zone-1',
    type: 'zone',
    name: overrides.name ?? '受限作业带',
    position: overrides.position ?? { x: 0, y: 0, z: 0 },
    rotation: overrides.rotation ?? { x: 0, y: 0, z: 0 },
    scale: overrides.scale ?? { x: 1, y: 1, z: 1 },
    status: overrides.status ?? 'active',
    visible: overrides.visible ?? true,
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    boundary:
      overrides.boundary ?? [
        { x: -5, y: 0, z: -5 },
        { x: 5, y: 0, z: -5 },
        { x: 5, y: 0, z: 5 },
        { x: -5, y: 0, z: 5 },
      ],
    zoneType: overrides.zoneType ?? 'restricted',
    color: overrides.color ?? '#ef4444',
    accessRules: overrides.accessRules ?? [],
    capacity: overrides.capacity,
    currentOccupancy: overrides.currentOccupancy,
  }
}

describe('citation runtime incident engine', () => {
  test('creates a near-miss incident with citations and video metadata', () => {
    const now = 1_700_000_000_000
    const entities: Entity[] = [
      {
        id: 'person-1',
        type: 'person',
        name: '李巡检',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        status: 'active',
        visible: true,
        metadata: {},
        createdAt: now,
        updatedAt: now,
        role: '巡检工程师',
        department: '设备维护部',
        schedule: [],
      },
      {
        id: 'vehicle-1',
        type: 'vehicle',
        name: '叉车 FL-201',
        position: { x: 2.6, y: 0, z: 0.5 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        status: 'active',
        visible: true,
        metadata: {},
        createdAt: now,
        updatedAt: now,
        plateNumber: '苏A12345',
        vehicleType: 'forklift',
        speed: 4.2,
        heading: 0,
      },
      createZone({ name: '物流混行道', zoneType: 'work' }),
    ]

    const result = evaluateRuntimeIncidents({ now, entities, previousState: createCitationRuntimeState() })

    expect(result.incidents.length).toBeGreaterThan(0)
    expect(result.incidents[0]?.kind).toBe('near_miss')
    expect(result.incidents[0]?.citations.some((citation) => citation.label === '最短间距')).toBe(true)
    expect(result.incidents[0]?.videoFeed?.cameraName.length).toBeGreaterThan(0)
  })

  test('dedupes identical incidents within cooldown window', () => {
    const base = 1_700_000_000_000
    const entities: Entity[] = [
      {
        id: 'person-1',
        type: 'person',
        name: '张操作',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        status: 'active',
        visible: true,
        metadata: {},
        createdAt: base,
        updatedAt: base,
        role: '外操',
        department: '生产运行部',
        schedule: [],
      },
      {
        id: 'vehicle-1',
        type: 'vehicle',
        name: 'AGV-01',
        position: { x: 2.4, y: 0, z: 0.3 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        status: 'active',
        visible: true,
        metadata: {},
        createdAt: base,
        updatedAt: base,
        plateNumber: '苏A10001',
        vehicleType: 'agv',
        speed: 3.4,
        heading: 0,
      },
      createZone({ name: '工艺通道', zoneType: 'work' }),
    ]

    const first = evaluateRuntimeIncidents({ now: base, entities, previousState: createCitationRuntimeState() })
    const second = evaluateRuntimeIncidents({
      now: base + 5_000,
      entities,
      previousState: first.nextState,
    })

    expect(first.incidents.some((incident) => incident.kind === 'near_miss')).toBe(true)
    expect(second.incidents.some((incident) => incident.kind === 'near_miss')).toBe(false)
  })

  test('emits zone intrusion when entering a restricted area', () => {
    const zone = createZone({ name: '受限装置区', zoneType: 'restricted' })
    const base = 1_700_000_000_000
    const outsideState = evaluateRuntimeIncidents({
      now: base,
      entities: [
        {
          id: 'person-1',
          type: 'person',
          name: '王监护',
          position: { x: 12, y: 0, z: 12 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: {},
          createdAt: base,
          updatedAt: base,
          role: 'HSE监督员',
          department: 'HSE部',
          schedule: [],
        },
        zone,
      ],
      previousState: createCitationRuntimeState(),
    })

    const enteredState = evaluateRuntimeIncidents({
      now: base + 4_000,
      entities: [
        {
          id: 'person-1',
          type: 'person',
          name: '王监护',
          position: { x: 1, y: 0, z: 1 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: {},
          createdAt: base,
          updatedAt: base + 4_000,
          role: 'HSE监督员',
          department: 'HSE部',
          schedule: [],
        },
        zone,
      ],
      previousState: outsideState.nextState,
    })

    expect(enteredState.incidents.some((incident) => incident.kind === 'zone_intrusion')).toBe(true)
  })
})
