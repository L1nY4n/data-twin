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
    const interactionSection =
      source.match(/setSelectedEntity: \(id\) => \{[\s\S]*?setEntityFilters: \(filters\) =>/)?.[0] ?? ''

    expect(source.includes('selectedEntityId: ecsWorld.selectedId')).toBe(true)
    expect(source.includes('hoveredEntityId: ecsWorld.hoveredId')).toBe(true)
    expect(source.includes('enqueueEcsCommands(ecsWorld, [{ type: \'select\'')).toBe(true)
    expect(source.includes('enqueueEcsCommands(ecsWorld, [{ type: \'hover\'')).toBe(true)
    expect(source.includes('patchProjectedEntities')).toBe(true)
    expect(source.includes('patchEntityBuckets')).toBe(true)
    expect(interactionSection.includes('buildPublishedEntityState')).toBe(false)
    expect(interactionSection.includes('patchProjectedEntities')).toBe(true)
    expect(interactionSection.includes('patchEntityBuckets')).toBe(true)
    expect(source.includes('set({ selectedEntityId: id, entities: buildEntityMapFromWorld() })')).toBe(false)
    expect(source.includes('set({ hoveredEntityId: id, entities: buildEntityMapFromWorld() })')).toBe(false)
  })

  test('entity markers should subscribe to typed entity buckets instead of the full entities map', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/EntityMarkers.tsx'),
      'utf8'
    )

    expect(source.includes('state.entityBuckets.persons')).toBe(true)
    expect(source.includes('state.entityBuckets.vehicles')).toBe(true)
    expect(source.includes('state.entityBuckets.equipment')).toBe(true)
    expect(source.includes('state.entities')).toBe(false)
  })

  test('runtime architecture should route camera presets and sector batching through the published scene package seam', () => {
    const store = readFileSync(join(process.cwd(), 'lib/digital-twin/store.ts'), 'utf8')
    const markers = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/EntityMarkers.tsx'),
      'utf8'
    )
    const environment = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/ChemicalPlantEnvironment.tsx'),
      'utf8'
    )

    expect(store.includes('publishedScenePackage: PublishedScenePackage')).toBe(true)
    expect(store.includes('staticChunkRegistry: RuntimeStaticChunkRegistration[]')).toBe(true)
    expect(store.includes('staticFeatureRegistry: RuntimePublishedStaticFeatureRegistry')).toBe(true)
    expect(store.includes('setPublishedScenePackage')).toBe(true)
    expect(markers.includes('state.publishedScenePackage.sectors')).toBe(true)
    expect(environment.includes('state.publishedScenePackage')).toBe(true)
    expect(environment.includes('state.staticChunkRegistry')).toBe(true)
    expect(environment.includes('staticChunkRegistry.map')).toBe(true)
    expect(environment.includes('isRuntimeStaticChunkVisible')).toBe(true)
    expect(environment.includes('hasRuntimeStaticViewChanged')).toBe(true)
    expect(environment.includes('loadPublishedStaticAssetManifest')).toBe(true)
    expect(environment.includes('PublishedStaticAssetMount')).toBe(true)
    expect(environment.includes('PublishedStaticRecipeMount')).toBe(true)
    expect(environment.includes('entry.chunk.renderRecipe')).toBe(true)
    expect(environment.includes('chunkGroupRefs')).toBe(true)
    expect(environment.includes('lastProjectionMatrixRef')).toBe(true)
  })

  test('zone and nearby-distance overlays should avoid subscribing to the full entities map', () => {
    const zoneAreas = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/ZoneAreas.tsx'),
      'utf8'
    )
    const distanceOverlay = readFileSync(
      join(process.cwd(), 'components/digital-twin/overlays/DistanceIndicator.tsx'),
      'utf8'
    )

    expect(zoneAreas.includes('state.entityBuckets.zones')).toBe(true)
    expect(zoneAreas.includes('state.entities')).toBe(false)
    expect(distanceOverlay.includes('state.entityBuckets.persons')).toBe(true)
    expect(distanceOverlay.includes('state.entityBuckets.vehicles')).toBe(true)
    expect(distanceOverlay.includes('state.entityBuckets.equipment')).toBe(true)
    expect(distanceOverlay.includes('state.entities')).toBe(false)
  })

  test('scene picking should coalesce pointer events without layout reads on the hover hot path', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/ScenePicking.tsx'),
      'utf8'
    )
    const canvas = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )
    const layer = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/PublishedStaticFeaturePickingLayer.tsx'),
      'utf8'
    )

    expect(source.includes('window.requestAnimationFrame')).toBe(true)
    expect(source.includes('lastPointerRef.current = { offsetX: event.offsetX, offsetY: event.offsetY }')).toBe(true)
    expect(source.includes('selectedEntityIdRef.current')).toBe(true)
    expect(source.includes('selectedStaticFeatureIdRef.current')).toBe(true)
    expect(source.includes('measurementModeRef.current')).toBe(true)
    expect(source.includes('resolvePickTargetFromIntersection')).toBe(true)
    expect(source.includes('setSelectedStaticFeature')).toBe(true)
    expect(source.includes('setHoveredStaticFeature')).toBe(true)
    expect(canvas.includes('PublishedStaticFeaturePickingLayer')).toBe(true)
    expect(layer.includes('staticFeatureIds')).toBe(true)
    expect(layer.includes('getRuntimePublishedStaticFeature')).toBe(true)
    expect(layer.includes('new MeshBasicMaterial')).toBe(false)
    expect(layer.includes('new MeshStandardMaterial')).toBe(false)
    expect(source.includes('getBoundingClientRect')).toBe(false)
  })

  test('runtime publish cadence should be adaptive under higher entity counts', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )

    expect(source.includes('getEntityPublishIntervalMs')).toBe(true)
    expect(source.includes("qualityProfile === 'performance' ? 280 : 160")).toBe(false)
  })

  test('hot update paths should patch published entities by changed ids instead of full rebuilds', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )

    expect(source.includes('function patchPublishedEntityState')).toBe(true)
    expect(source.includes('function patchEntityDirectory')).toBe(true)
    expect(source.includes('ids: changedIds')).toBe(true)
    expect(source.includes("ids: updates.map(({ id }) => id)")).toBe(true)
    expect(source.includes("ids: entityUpdates.map(({ id }) => id)")).toBe(true)
  })

  test('moving-entity separation should use occupancy buckets instead of per-entity full scans', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )

    expect(source.includes('collectVisibleSnapshotsByTypes')).toBe(true)
    expect(source.includes("'person'")).toBe(true)
    expect(source.includes("'vehicle'")).toBe(true)
    expect(source.includes('createDynamicOccupancyIndex')).toBe(true)
    expect(source.includes('queryDynamicOccupants')).toBe(true)
    expect(source.includes('updateDynamicOccupancyIndex')).toBe(true)
    expect(source.includes('Array.from(ecsWorld.snapshotById.values()).filter')).toBe(false)
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

  test('runtime movement scheduling should reduce cadence for offscreen or far entities while preserving focused ones', () => {
    const store = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )
    const canvas = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )
    const cadence = readFileSync(
      join(process.cwd(), 'lib/digital-twin/runtime-simulation-cadence.ts'),
      'utf8'
    )

    expect(store.includes('resolveEntitySimulationCadence')).toBe(true)
    expect(store.includes('shouldSimulateEntityThisTick')).toBe(true)
    expect(store.includes('latestCameraTarget')).toBe(true)
    expect(store.includes('fixedTickCount += 1')).toBe(true)
    expect(store.includes("snapshot.labelMode === 'html'")).toBe(true)
    expect(canvas.includes('controlsRef.current.target')).toBe(true)
    expect(cadence.includes('OFFSCREEN_DOT_THRESHOLD')).toBe(true)
    expect(cadence.includes('EXTREME_DISTANCE_SQUARED')).toBe(true)
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
    expect(markers.includes('createSectorEntityBatches')).toBe(true)
    expect(markers.includes('publishedSectors')).toBe(true)
    expect(markers.includes('showStatusRing={false}')).toBe(true)
    expect(markers.includes("qualityProfile === 'performance'")).toBe(false)
  })

  test('equipment updates should use a throttled simulation helper instead of running every fixed tick', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )

    expect(source.includes('ecsWorld.byType.equipment')).toBe(true)
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

  test('equipment instances should split static matrix uploads from interaction/status color updates', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/EquipmentInstances.tsx'),
      'utf8'
    )

    expect(source.includes('transformRef')).toBe(true)
    expect(source.includes('appearanceRef')).toBe(true)
    expect(source.includes('forceMatrixSyncRef')).toBe(true)
    expect(source.includes('let matrixDirty = false')).toBe(true)
    expect(source.includes('let bodyColorDirty = false')).toBe(true)
    expect(source.includes('let statusColorDirty = false')).toBe(true)
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
    expect(bottomPanel.includes('const ruleMap = useDigitalTwinStore((state) => state.rules)')).toBe(true)
    expect(bottomPanel.includes('const rules = useMemo(() => Array.from(ruleMap.values()), [ruleMap])')).toBe(true)
    expect(bottomPanel.includes('Array.from(state.rules.values())')).toBe(false)
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
    expect(source.includes('createPublishedCampusScenePackage')).toBe(true)
    expect(source.includes('hydratePublishedScenePackage')).toBe(true)
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
    expect(source.includes("useState<'balanced' | 'performance'>('balanced')")).toBe(true)
    expect(source.includes("setQualityProfile('performance')")).toBe(false)
    expect(source.includes('setActiveCameraPreset')).toBe(true)
  })

  test('canvas should use BVH wrapper to accelerate raycasting on scene meshes', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )

    expect(source.includes('Bvh')).toBe(true)
    expect(source.includes('<Bvh')).toBe(true)
  })

  test('chemical plant environment should batch repeated static supports and freeze static transforms', () => {
    const environment = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/ChemicalPlantEnvironment.tsx'),
      'utf8'
    )
    const mount = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/PublishedStaticRecipeMount.tsx'),
      'utf8'
    )
    const batches = readFileSync(
      join(process.cwd(), 'lib/digital-twin/runtime/static/render-batches.ts'),
      'utf8'
    )

    expect(environment.includes('PublishedStaticRecipeMount')).toBe(true)
    expect(environment.includes('entry.chunk.renderRecipe')).toBe(true)
    expect(environment.includes('matrixWorldAutoUpdate = false')).toBe(true)
    expect(mount.includes('buildPublishedStaticRenderBatches')).toBe(true)
    expect(mount.includes('PublishedStaticMergedBatches')).toBe(true)
    expect(mount.includes('recipe.proxy ?? recipe.detailed')).toBe(true)
    expect(batches.includes('mergeGeometries')).toBe(true)
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

  test('repo should ship a published scene export script for offline package inspection', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts/export-published-scene-package.ts'),
      'utf8'
    )

    expect(source.includes('createPublishedCampusScenePackage')).toBe(true)
    expect(source.includes('published-scene-package.json')).toBe(true)
  })

  test('repo should ship a static chunk asset export script for offline glb generation', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts/export-published-static-assets.ts'),
      'utf8'
    )

    expect(source.includes('GLTFExporter')).toBe(true)
    expect(source.includes('createPublishedStaticAssetManifest')).toBe(true)
    expect(source.includes('buildPublishedStaticRenderBatches')).toBe(true)
    expect(source.includes('PUBLISHED_STATIC_ASSET_MANIFEST_URL')).toBe(true)
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

  test('instanced moving entities should only upload matrices while dirty or unsettled', () => {
    const personInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/PersonInstances.tsx'),
      'utf8'
    )
    const vehicleInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/VehicleInstances.tsx'),
      'utf8'
    )

    expect(personInstances.includes('forceMatrixSyncRef')).toBe(true)
    expect(personInstances.includes('let matrixDirty = false')).toBe(true)
    expect(personInstances.includes('if (!isSettled(state))')).toBe(true)
    expect(vehicleInstances.includes('forceMatrixSyncRef')).toBe(true)
    expect(vehicleInstances.includes('let matrixDirty = false')).toBe(true)
    expect(vehicleInstances.includes('if (!isSettled(state))')).toBe(true)
  })

  test('instanced moving entities should skip offscreen sector updates and resync on re-entry', () => {
    const personInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/PersonInstances.tsx'),
      'utf8'
    )
    const vehicleInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/VehicleInstances.tsx'),
      'utf8'
    )

    expect(personInstances.includes('isInteractionBoundsVisible')).toBe(true)
    expect(personInstances.includes('batchVisibleRef')).toBe(true)
    expect(personInstances.includes('runtimeStates.clear()')).toBe(true)
    expect(vehicleInstances.includes('isInteractionBoundsVisible')).toBe(true)
    expect(vehicleInstances.includes('batchVisibleRef')).toBe(true)
    expect(vehicleInstances.includes('runtimeStates.clear()')).toBe(true)
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
    const equipmentInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/EquipmentInstances.tsx'),
      'utf8'
    )

    expect(personInstances.includes('applyInteractionBounds')).toBe(true)
    expect(vehicleInstances.includes('applyInteractionBounds')).toBe(true)
    expect(equipmentInstances.includes('applyInteractionBounds')).toBe(true)
    expect(personInstances.includes('createInstancedInteractionBounds')).toBe(true)
    expect(vehicleInstances.includes('createInstancedInteractionBounds')).toBe(true)
    expect(equipmentInstances.includes('createInstancedInteractionBounds')).toBe(true)
    expect(personInstances.includes('mesh.frustumCulled = true')).toBe(true)
    expect(vehicleInstances.includes('mesh.frustumCulled = true')).toBe(true)
    expect(equipmentInstances.includes('mesh.frustumCulled = true')).toBe(true)
    expect(personInstances.includes('mesh.boundingSphere')).toBe(true)
    expect(vehicleInstances.includes('mesh.boundingSphere')).toBe(true)
    expect(equipmentInstances.includes('mesh.boundingSphere')).toBe(true)
  })
})
