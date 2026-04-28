import { describe, expect, test } from 'bun:test'
import { DEFAULT_SCENE_COUNTS, PRODUCTION_SCENE_COUNTS } from '../campus-layout'
import { buildPublishedScenePackage } from './compiler'
import { hydratePublishedScenePackage } from './hydrate'
import type { PublishedScenePackage, PublishedVehicleLayer } from './types'

describe('published campus scene hydration', () => {
  test('hydrates default package back into runtime entities with expected counts', () => {
    const pkg = buildPublishedScenePackage({ generatedAt: '2026-04-03T06:26:12.000Z' })
    const scene = hydratePublishedScenePackage(pkg, { profile: 'default' })

    expect(scene.persons).toHaveLength(DEFAULT_SCENE_COUNTS.persons)
    expect(scene.vehicles).toHaveLength(DEFAULT_SCENE_COUNTS.vehicles)
    expect(scene.equipment).toHaveLength(DEFAULT_SCENE_COUNTS.equipment)
    expect(scene.zones.length).toBeGreaterThan(0)
  })

  test('hydrates production package with preserved scaling and standard repeatable equipment naming', () => {
    const pkg = buildPublishedScenePackage({ generatedAt: '2026-04-03T06:26:12.000Z' })
    const scene = hydratePublishedScenePackage(pkg, { profile: 'production' })

    expect(scene.persons).toHaveLength(PRODUCTION_SCENE_COUNTS.persons)
    expect(scene.vehicles).toHaveLength(PRODUCTION_SCENE_COUNTS.vehicles)
    expect(scene.equipment).toHaveLength(PRODUCTION_SCENE_COUNTS.equipment)
    expect(scene.equipment.some((entity: { name: string }) => /-\d{2}$/.test(entity.name))).toBe(true)
    expect(scene.equipment.some((entity: { name: string }) => entity.name.includes('#'))).toBe(false)
  })

  test('regenerates vehicle route metadata from the final separated spawn position', () => {
    const pkg = buildPublishedScenePackage({ generatedAt: '2026-04-03T06:26:12.000Z' })
    const vehicleLayer = pkg.dynamicLayers.find(
      (layer): layer is PublishedVehicleLayer => layer.entityType === 'vehicle'
    )
    expect(vehicleLayer).toBeDefined()

    const anchor = vehicleLayer!.anchorsByType.car[0]
    expect(anchor).toBeDefined()

    const constrainedLayer: PublishedVehicleLayer = {
      ...vehicleLayer!,
      count: 2,
      minimumSeparation: 6,
      bounds: {
        min: {
          x: anchor.position.x - 24,
          y: anchor.position.y,
          z: anchor.position.z - 24,
        },
        max: {
          x: anchor.position.x + 24,
          y: anchor.position.y,
          z: anchor.position.z + 24,
        },
      },
      anchorsByType: {
        car: [{ position: anchor.position, spread: { x: 0, z: 0 } }],
        truck: [],
        forklift: [],
        agv: [],
        other: [],
      },
    }
    const testPackage: PublishedScenePackage = {
      ...pkg,
      dynamicLayers: [constrainedLayer],
      entityCounts: {
        default: { persons: 0, vehicles: 2, equipment: 0 },
        production: { persons: 0, vehicles: 2, equipment: 0 },
      },
      zoneOverlays: [],
      interactionLayers: [],
    }

    const scene = hydratePublishedScenePackage(testPackage, { profile: 'default' })
    expect(scene.vehicles).toHaveLength(2)

    const separated = scene.vehicles.find(
      (vehicle) => Math.hypot(vehicle.position.x - anchor.position.x, vehicle.position.z - anchor.position.z) > 0.5
    )
    expect(separated).toBeDefined()

    const routeLoop = separated!.metadata.routeLoop
    expect(Array.isArray(routeLoop)).toBe(true)
    expect(
      (routeLoop as Array<{ x: number; z: number }>).some(
        (point) => Math.hypot(point.x - separated!.position.x, point.z - separated!.position.z) < 16
      )
    ).toBe(true)
    expect(Math.abs(separated!.rotation.y)).toBeLessThanOrEqual(Math.PI)
  })
})
