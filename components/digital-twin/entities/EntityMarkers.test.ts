import { describe, expect, test } from 'bun:test'
import { createVehicleEntityBatches } from './EntityMarkers'

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
})
