import { describe, expect, test } from 'bun:test'
import { createDynamicEntityBatches, createVehicleEntityBatches } from './EntityMarkers'
import type { DynamicEntityRenderItem } from './DynamicEntityInstances'

describe('entity marker batching', () => {
  test('keeps route-tracked vehicles in stable batches by track id', () => {
    const batches = createVehicleEntityBatches(
      [
        {
          id: 'vehicle-1',
          type: 'vehicle',
          name: '叉车 01',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: {},
          plateNumber: 'A',
          vehicleType: 'forklift',
          speed: 1,
          heading: 0,
          routeTrack: {
            id: 'forklift-track-01',
            loop: true,
            points: [
              { x: 0, y: 0, z: 0 },
              { x: 10, y: 0, z: 0 },
            ],
          },
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'vehicle-2',
          type: 'vehicle',
          name: '叉车 02',
          position: { x: 100, y: 0, z: 100 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: {},
          plateNumber: 'B',
          vehicleType: 'forklift',
          speed: 1,
          heading: 0,
          routeTrack: {
            id: 'forklift-track-01',
            loop: true,
            points: [
              { x: 0, y: 0, z: 0 },
              { x: 10, y: 0, z: 0 },
            ],
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      [
        {
          id: 'sector-a',
          name: 'A',
          offset: { x: 0, y: 0, z: 0 },
          bounds: {
            min: { x: -10, y: 0, z: -10 },
            max: { x: 10, y: 0, z: 10 },
          },
          staticChunkId: 'chunk-a',
          dynamicLayerIds: [],
          interactionLayerIds: [],
        },
        {
          id: 'sector-b',
          name: 'B',
          offset: { x: 100, y: 0, z: 100 },
          bounds: {
            min: { x: 90, y: 0, z: 90 },
            max: { x: 110, y: 0, z: 110 },
          },
          staticChunkId: 'chunk-b',
          dynamicLayerIds: [],
          interactionLayerIds: [],
        },
      ]
    )

    expect(batches).toHaveLength(1)
    expect(batches[0].sectorId).toBe('track:forklift-track-01')
    expect(batches[0].entities.map((entity) => entity.id)).toEqual(['vehicle-1', 'vehicle-2'])
  })

  test('keeps dynamic entity instance batches localized by nearest sector', () => {
    const sectors = [
      {
        id: 'sector-a',
        name: 'A',
        offset: { x: 0, y: 0, z: 0 },
        bounds: {
          min: { x: -10, y: 0, z: -10 },
          max: { x: 10, y: 0, z: 10 },
        },
        staticChunkId: 'chunk-a',
        dynamicLayerIds: [],
        interactionLayerIds: [],
      },
      {
        id: 'sector-b',
        name: 'B',
        offset: { x: 100, y: 0, z: 100 },
        bounds: {
          min: { x: 90, y: 0, z: 90 },
          max: { x: 110, y: 0, z: 110 },
        },
        staticChunkId: 'chunk-b',
        dynamicLayerIds: [],
        interactionLayerIds: [],
      },
    ]
    const items: DynamicEntityRenderItem[] = [
      {
        entity: {
          id: 'dynamic-a',
          type: 'dynamic',
          name: 'Dynamic A',
          position: { x: 2, y: 0, z: 1 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: {},
          archetypeId: 'archetype-a',
          categoryKey: 'category-a',
          attributes: {},
          displayAttributes: {},
          createdAt: 1,
          updatedAt: 1,
        },
        presentation: {
          schema: null,
          categoryLabel: 'Category A',
          archetypeLabel: 'Archetype A',
          accentColor: '#38bdf8',
          movable: true,
        },
      },
      {
        entity: {
          id: 'dynamic-b',
          type: 'dynamic',
          name: 'Dynamic B',
          position: { x: 101, y: 0, z: 98 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          status: 'active',
          visible: true,
          metadata: {},
          archetypeId: 'archetype-b',
          categoryKey: 'category-b',
          attributes: {},
          displayAttributes: {},
          createdAt: 1,
          updatedAt: 1,
        },
        presentation: {
          schema: null,
          categoryLabel: 'Category B',
          archetypeLabel: 'Archetype B',
          accentColor: '#34d399',
          movable: true,
        },
      },
    ]

    const batches = createDynamicEntityBatches(items, sectors)

    expect(batches.map((batch) => batch.sectorId)).toEqual(['sector-a', 'sector-b'])
    expect(batches.map((batch) => batch.entities[0].entity.id)).toEqual(['dynamic-a', 'dynamic-b'])
  })
})
