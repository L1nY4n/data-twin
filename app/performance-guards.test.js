import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('performance guards', () => {
  test('store should expose ecs runtime actions', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )

    expect(source.includes('enqueueCommands')).toBe(true)
    expect(source.includes('flushCommands')).toBe(true)
    expect(source.includes('advanceRuntime')).toBe(true)
    expect(source.includes('getEcsSnapshotById')).toBe(true)
  })

  test('selection and hover updates should not rebuild entities map on every pointer event', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )

    expect(source.includes('selectedEntityId: ecsWorld.selectedId')).toBe(true)
    expect(source.includes('hoveredEntityId: ecsWorld.hoveredId')).toBe(true)
    expect(source.includes('enqueueEcsCommands(ecsWorld, [{ type: \'select\'')).toBe(true)
    expect(source.includes('enqueueEcsCommands(ecsWorld, [{ type: \'hover\'')).toBe(true)
    expect(source.includes('set({ selectedEntityId: id, entities: buildEntityMapFromWorld() })')).toBe(false)
    expect(source.includes('set({ hoveredEntityId: id, entities: buildEntityMapFromWorld() })')).toBe(false)
  })

  test('runtime publish cadence should be adaptive under higher entity counts', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )

    expect(source.includes('getEntityPublishIntervalMs')).toBe(true)
    expect(source.includes("qualityProfile === 'performance' ? 280 : 160")).toBe(false)
  })

  test('moving-entity separation should use occupancy buckets instead of per-entity full scans', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )

    expect(source.includes('createDynamicOccupancyIndex')).toBe(true)
    expect(source.includes('queryDynamicOccupants')).toBe(true)
    expect(source.includes('updateDynamicOccupancyIndex')).toBe(true)
    expect(source.includes('movingSnapshots.filter(')).toBe(false)
  })

  test('dynamic separation should use localized occupancy buckets for moving agents', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )

    expect(source.includes('createDynamicOccupancyIndex(')).toBe(true)
    expect(source.includes('queryDynamicOccupants(')).toBe(true)
    expect(source.includes('DYNAMIC_NEIGHBOR_QUERY_RADIUS')).toBe(true)
  })

  test('entity marker components should be memoized and avoid per-entity useFrame loops', () => {
    const person = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/PersonMarker.tsx'),
      'utf8'
    )
    const vehicle = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/VehicleMarker.tsx'),
      'utf8'
    )
    const equipment = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/EquipmentMarker.tsx'),
      'utf8'
    )

    expect(person.includes('memo(')).toBe(true)
    expect(vehicle.includes('memo(')).toBe(true)
    expect(equipment.includes('memo(')).toBe(true)
    expect(person.includes('useFrame(')).toBe(false)
    expect(equipment.includes('useFrame(')).toBe(false)

    const markers = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/EntityMarkers.tsx'),
      'utf8'
    )
    expect(markers.includes('PersonInstances')).toBe(true)
    expect(markers.includes('VehicleInstances')).toBe(true)
    expect(markers.includes('EquipmentInstances')).toBe(true)
    expect(markers.includes('showStatusRing={false}')).toBe(true)
    expect(markers.includes("qualityProfile === 'performance'")).toBe(false)
  })

  test('equipment updates should use a throttled simulation helper instead of running every fixed tick', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )

    expect(source.includes('getEquipmentSimulationIntervalMs')).toBe(true)
    expect(source.includes('shouldRunEquipmentSimulation')).toBe(true)
    expect(source.includes('lastEquipmentSimulationAt')).toBe(true)
    expect(source.includes("snapshot.type === 'equipment' ||")).toBe(false)
  })

  test('runtime metrics should track aggregate pool activity instead of a single trajectory pool', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )
    const canvas = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )

    expect(source.includes('poolRequests')).toBe(true)
    expect(source.includes('aggregatePoolMetrics')).toBe(true)
    expect(source.includes('ecsWorld.pools.trajectoryPoint.stats.hitRate')).toBe(false)
    expect(canvas.includes('getFrameDrawCallSample')).toBe(true)
  })

  test('equipment path should use instanced base rendering with detail-only overlays', () => {
    const markers = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/EntityMarkers.tsx'),
      'utf8'
    )
    const equipment = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/EquipmentMarker.tsx'),
      'utf8'
    )

    expect(markers.includes('EquipmentInstances')).toBe(true)
    expect(markers.includes('showModel={false}')).toBe(true)
    expect(equipment.includes('showModel = true')).toBe(true)
  })

  test('store should not force equipment projection on every publish', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )

    expect(source.includes("snapshot.type === 'equipment' ||")).toBe(false)
  })

  test('equipment telemetry should use a lower-frequency simulation interval', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )

    expect(source.includes('getEquipmentSimulationIntervalMs')).toBe(true)
    expect(source.includes('lastEquipmentSimulationAt')).toBe(true)
  })

  test('runtime metrics should track pool activity instead of always showing pool hit rate alone', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )

    expect(source.includes('poolRequests')).toBe(true)
  })

  test('react side panels should subscribe to lightweight entity directory instead of full entities map', () => {
    const entityList = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/EntityListPanel.tsx'),
      'utf8'
    )
    const bottomPanel = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/BottomPanel.tsx'),
      'utf8'
    )
    const store = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )

    expect(store.includes('entityDirectory: Map<string, EntityDirectoryEntry>')).toBe(true)
    expect(entityList.includes('state.entityDirectory')).toBe(true)
    expect(bottomPanel.includes('state.entityDirectory')).toBe(true)
    expect(entityList.includes('state.entities')).toBe(false)
    expect(bottomPanel.includes('state.entities')).toBe(false)
  })

  test('simulation hook should not use setInterval runtime loop', () => {
    const source = readFileSync(
      join(process.cwd(), 'hooks/use-simulation.ts'),
      'utf8'
    )

    expect(source.includes('setInterval(')).toBe(false)
    expect(source.includes('setRuntimeRunning')).toBe(true)
    expect(source.includes('resetRuntimeClock')).toBe(true)
    expect(source.includes('visibilitychange')).toBe(true)
    expect(source.includes("visibilityState === 'visible'")).toBe(true)
  })

  test('canvas should enforce bounded dpr, runtime tick bridge and moderate shadow map size', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )

    expect(source.includes('dpr={dprRange}')).toBe(true)
    expect(source.includes('resize={{ debounce: 100 }}')).toBe(true)
    expect(source.includes('advanceRuntime(')).toBe(true)
    expect(source.includes('shadow-mapSize={qualityProfile === \'performance\' ? [512, 512] : [1024, 1024]}')).toBe(true)
  })

  test('canvas should normalize renderer draw metrics to per-frame samples', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )

    expect(source.includes('lastDrawCallsRef')).toBe(true)
    expect(source.includes('getFrameDrawCallSample')).toBe(true)
  })

  test('benchmark view should boot the production scene profile for campus-scale verification', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/benchmark/page.tsx'),
      'utf8'
    )

    expect(source.includes("useSimulation({ autoStart: true, profile: 'production' })")).toBe(true)
  })

  test('canvas should use BVH wrapper to accelerate raycasting on scene meshes', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )

    expect(source.includes('Bvh')).toBe(true)
    expect(source.includes('<Bvh')).toBe(true)
  })

  test('projection benchmark script should target production-campus counts and include separation benchmarking', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts/bench-entity-projection.mjs'),
      'utf8'
    )

    expect(source.includes("name: 'production-campus'")).toBe(true)
    expect(source.includes('movingEntities')).toBe(true)
    expect(source.includes('runSpatialSeparation')).toBe(true)
    expect(source.includes('occupancyCellSize')).toBe(true)
  })

  test('sprite text labels should release cached textures when refs drop to zero', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/SpriteTextLabel.tsx'),
      'utf8'
    )

    expect(source.includes('textureCache.delete(cacheKey)')).toBe(true)
    expect(source.includes('cached.texture.dispose()')).toBe(true)
  })

  test('zone idle labels should stay on sprite path instead of persistent Html overlays', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/ZoneAreas.tsx'),
      'utf8'
    )

    expect(source.includes('SpriteTextLabel')).toBe(true)
    expect((source.match(/<Html/g) ?? []).length).toBe(1)
  })

  test('instanced entity paths should pull ecs snapshots each frame with smoothing', () => {
    const personInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/PersonInstances.tsx'),
      'utf8'
    )
    const vehicleInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/VehicleInstances.tsx'),
      'utf8'
    )

    expect(personInstances.includes('useFrame(')).toBe(true)
    expect(vehicleInstances.includes('useFrame(')).toBe(true)
    expect(
      personInstances.includes('getEcsSnapshotById(') ||
        personInstances.includes('getSnapshotById(')
    ).toBe(true)
    expect(
      vehicleInstances.includes('getEcsSnapshotById(') ||
        vehicleInstances.includes('getSnapshotById(')
    ).toBe(true)
    expect(personInstances.includes('lerpAngle(')).toBe(true)
    expect(vehicleInstances.includes('lerpAngle(')).toBe(true)
  })

  test('instanced entity picking should apply explicit interaction bounds', () => {
    const personInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/PersonInstances.tsx'),
      'utf8'
    )
    const vehicleInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/VehicleInstances.tsx'),
      'utf8'
    )

    expect(personInstances.includes('applyInteractionBounds')).toBe(true)
    expect(vehicleInstances.includes('applyInteractionBounds')).toBe(true)
    expect(personInstances.includes('mesh.frustumCulled = false')).toBe(true)
    expect(vehicleInstances.includes('mesh.frustumCulled = false')).toBe(true)
    expect(personInstances.includes('mesh.boundingSphere')).toBe(true)
    expect(vehicleInstances.includes('mesh.boundingSphere')).toBe(true)
  })
})
