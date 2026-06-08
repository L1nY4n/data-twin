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
    expect(distanceOverlay.includes("import { Html } from '@react-three/drei'"))
      .toBe(false)
    expect(distanceOverlay.includes('SpriteTextLabel')).toBe(true)
  })

  test('measurement overlay should use clear sprite labels instead of Html DOM overlays', () => {
    const measurementTool = readFileSync(
      join(process.cwd(), 'components/digital-twin/overlays/MeasurementTool.tsx'),
      'utf8'
    )

    expect(measurementTool.includes("import { Html } from '@react-three/drei'")).toBe(false)
    expect(measurementTool.includes('SpriteTextLabel')).toBe(true)
    expect(measurementTool.includes('SpriteInfoCard')).toBe(true)
    expect(measurementTool.includes('title={formatDistance(seg.distance)}')).toBe(true)
    expect(measurementTool.includes('title={formatAngle(angleMeasurement.angle)}')).toBe(true)
    expect(measurementTool.includes('title="总距离"')).toBe(true)
    expect(measurementTool.includes('borderColor="rgba(245, 158, 11, 0.9)"')).toBe(true)
  })

  test('sprite text labels should preserve high-dpi clarity while keeping texture cost bounded', () => {
    const spriteText = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/SpriteTextLabel.tsx'),
      'utf8'
    )

    expect(spriteText.includes('Math.min(window.devicePixelRatio || 1, 2)')).toBe(true)
    expect(spriteText.includes('ctx.scale(pixelRatio, pixelRatio)')).toBe(true)
    expect(spriteText.includes('canvas.width = Math.max(1, Math.round(width * pixelRatio))')).toBe(
      true
    )
    expect(spriteText.includes('canvas.height = Math.max(1, Math.round(height * pixelRatio))')).toBe(
      true
    )
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
    expect(source.includes('HOVER_PICK_MIN_INTERVAL_MS')).toBe(true)
    expect(source.includes('hoverPickTimeoutRef')).toBe(true)
    expect(source.includes('window.setTimeout')).toBe(true)
    expect(source.includes('cancelScheduledHoverPick')).toBe(true)
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
    expect(source.includes('getLabelLodIntervalMs')).toBe(true)
    expect(source.includes('now - lastLabelLodAt >= labelLodIntervalMs')).toBe(true)
    expect(source.includes("qualityProfile === 'performance' ? 280 : 160")).toBe(false)
    expect(source.includes('now - lastLabelLodAt >= 250')).toBe(false)
  })

  test('live runtime ingest should not store trajectories for every moving entity', () => {
    const source = readFileSync(
      join(process.cwd(), 'hooks/use-live-digital-twin.ts'),
      'utf8'
    )

    expect(source.includes('const trajectoryEntityId = liveState.isPlayingTrajectory ? liveState.selectedEntityId : null')).toBe(true)
    expect(source.includes('if (trajectoryEntityId === data.entityId)')).toBe(true)
    expect(source.includes('trajectoryUpdates.push({')).toBe(true)
  })

  test('dense realtime movement should use binary pose frames and typed-array decode', () => {
    const hook = readFileSync(
      join(process.cwd(), 'hooks/use-live-digital-twin.ts'),
      'utf8'
    )
    const websocket = readFileSync(
      join(process.cwd(), 'lib/digital-twin/websocket-client.ts'),
      'utf8'
    )
    const codec = readFileSync(
      join(process.cwd(), 'lib/digital-twin/runtime-pose-frame.ts'),
      'utf8'
    )
    const backend = readFileSync(
      join(process.cwd(), 'backend-core-rs/src/realtime.rs'),
      'utf8'
    )

    expect(websocket.includes("this.ws.binaryType = 'arraybuffer'")).toBe(true)
    expect(websocket.includes('decodeRuntimePoseFrame(data)')).toBe(true)
    expect(websocket.includes("type: 'pose_frame'")).toBe(true)
    expect(codec.includes('Float32Array(count * 3)')).toBe(true)
    expect(codec.includes('Uint16Array(count)')).toBe(true)
    expect(hook.includes("case 'pose_frame'")).toBe(true)
    expect(hook.includes('poseBufferUpdates.push({ entityId, samples })')).toBe(true)
    expect(hook.includes('runtimeVehiclePoseBuffer.upsertMany(poseBufferUpdates)')).toBe(true)
    expect(hook.includes('POSE_FRAME_STORE_SYNC_INTERVAL_MS')).toBe(true)
    expect(backend.includes('Message::Binary(encode_runtime_pose_frame_events')).toBe(true)
    expect(backend.includes('runtime_batch_outbound_messages')).toBe(true)
    expect(backend.includes('text_message_for_events')).toBe(true)
  })

  test('dense runtime pose ingestion should avoid per-entity batch allocation churn', () => {
    const registry = readFileSync(
      join(process.cwd(), 'lib/digital-twin/runtime-vehicle-snapshot-registry.ts'),
      'utf8'
    )
    const poseBuffer = readFileSync(
      join(process.cwd(), 'lib/digital-twin/runtime-vehicle-pose-buffer.ts'),
      'utf8'
    )
    const worker = readFileSync(
      join(process.cwd(), 'lib/digital-twin/workers/vehicle-pose.worker.ts'),
      'utf8'
    )

    expect(registry.includes('lastReceivedAt')).toBe(true)
    expect(registry.includes('appendSnapshotInPlace')).toBe(true)
    expect(registry.includes('maxSourceTimestampBacktrackMs')).toBe(true)
    expect(registry.includes('staleSnapshots')).toBe(true)
    expect(registry.includes('getStats()')).toBe(true)
    expect(registry.includes('appendVehicleSnapshot')).toBe(false)
    expect(poseBuffer.includes('count: idsByIndex.length')).toBe(true)
    expect(poseBuffer.includes("type: 'upsert_many'")).toBe(true)
    expect(poseBuffer.includes('[...idsByIndex]')).toBe(false)
    expect(worker.includes('idsByIndex[index] = entityId')).toBe(true)
    expect(worker.includes("case 'upsert_many'")).toBe(true)
    expect(worker.includes('for (let index = 0; index < count; index += 1)')).toBe(true)
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
    expect(source.includes('ids: idsToPublish')).toBe(true)
    expect(source.includes('lastRealtimeEntityPublishAt')).toBe(true)
    expect(source.includes('shouldPublishRuntimePatchImmediately')).toBe(true)
  })

  test('moving-entity separation should use occupancy buckets instead of per-entity full scans', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/digital-twin/store.ts'),
      'utf8'
    )

    expect(source.includes('collectVisibleMovingSnapshotsInto')).toBe(true)
    expect(source.includes('movingSnapshotsScratch')).toBe(true)
    expect(source.includes('dynamicNeighborsScratch')).toBe(true)
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

  test('moving route planning should cache direct routes out of the fixed tick hot path', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/digital-twin/mock-data.ts'),
      'utf8'
    )

    expect(source.includes('routeDirect: true')).toBe(true)
    expect(source.includes('function isDirectRoute')).toBe(true)
    expect(source.includes('if (routeGoal && isDirectRoute(metadata))')).toBe(true)
    expect(source.includes("  'routeDirect',")).toBe(true)
  })

  test('runtime canvas should cap idle pixel cost without reopening underside camera paths', () => {
    const canvas = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )
    const renderer = readFileSync(
      join(process.cwd(), 'lib/digital-twin/renderer/createPreferredRenderer.ts'),
      'utf8'
    )

    expect(canvas.includes('dpr={dprRange}')).toBe(true)
    expect(canvas.includes('frameloop="always"')).toBe(true)
    expect(canvas.includes('WEBGPU_FRAME_STALL_FALLBACK_MS')).toBe(true)
    expect(canvas.includes("setRendererMode('webgl2')")).toBe(true)
    expect(canvas.includes('glRenderer.setPixelRatio')).toBe(true)
    expect(canvas.includes('window.devicePixelRatio <= 1.5')).toBe(true)
    expect(canvas.includes('minPolarAngle={MIN_ORBIT_POLAR_ANGLE}')).toBe(true)
    expect(canvas.includes('maxPolarAngle={MAX_ORBIT_POLAR_ANGLE}')).toBe(true)
    expect(renderer.includes("powerPreference: options.powerPreference ?? 'high-performance'"))
      .toBe(true)
  })

  test('runtime scene content should avoid subscribing to the full entities map on the render hot path', () => {
    const canvas = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )
    const incidentEffects = readFileSync(
      join(process.cwd(), 'components/digital-twin/overlays/IncidentEffects.tsx'),
      'utf8'
    )

    expect(canvas.includes('const entities = useDigitalTwinStore((state) => state.entities)')).toBe(
      false
    )
    expect(canvas.includes('useDigitalTwinStore.getState().getEntityById(selectedEntityId)')).toBe(
      true
    )
    expect(incidentEffects.includes('const entities = useDigitalTwinStore((state) => state.entities)')).toBe(
      false
    )
    expect(incidentEffects.includes('useDigitalTwinStore.getState().getEntityById(incident.primaryEntityId)')).toBe(
      true
    )
  })

  test('interactive moving markers should be memoized and only use frame-following on focused labels', () => {
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
    expect(person.includes('useFrame(')).toBe(true)
    expect(vehicle.includes('useFrame(')).toBe(true)
    expect(equipment.includes('useFrame(')).toBe(false)
    expect(person.includes('if (!groupRef.current || (!isSelected && !isHovered)) return')).toBe(true)
    expect(vehicle.includes('if (!groupRef.current || !shouldTrackLivePose) return')).toBe(true)
    expect(vehicle.includes('runtimeVehiclePoseBuffer.get(entity.id)')).toBe(true)
    expect(vehicle.includes('resolveVehiclePoseFromSnapshots')).toBe(false)
    expect(vehicle.includes("const shouldRenderTelemetryCard = showLabel && labelMode === 'html'")).toBe(true)
    expect(vehicle.includes('if (!shouldRenderTelemetryCard) {')).toBe(true)
    expect(vehicle.includes('setRenderTelemetry({ speed, heading })')).toBe(true)
    expect(vehicle.includes('`速度 ${renderTelemetry.speed.toFixed(1)} m/s`')).toBe(true)
    expect(vehicle.includes('`方向 ${renderTelemetry.heading.toFixed(0)}°`')).toBe(true)

    const markers = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/EntityMarkers.tsx'),
      'utf8'
    )
    expect(markers.includes('PersonInstances')).toBe(true)
    expect(markers.includes('VehicleInstances')).toBe(true)
    expect(markers.includes('EquipmentInstances')).toBe(true)
    expect(markers.includes('createSectorEntityBatches')).toBe(true)
    expect(markers.includes('createVehicleEntityBatches(filteredVehicles, publishedSectors)')).toBe(true)
    expect(markers.includes('shouldRenderDetailedVehicleModel')).toBe(true)
    expect(markers.includes('detailedModelVehicles')).toBe(true)
    expect(markers.includes('suppressedEntityIds={suppressedVehicleDetailIds}')).toBe(true)
    expect(markers.includes('filteredModelVehicles')).toBe(false)
    expect(markers.includes('filteredInstancedVehicles')).toBe(false)
    expect(markers.includes('publishedSectors')).toBe(true)
    expect(markers.includes('showStatusRing={false}')).toBe(true)
    expect(markers.includes("qualityProfile === 'performance'")).toBe(false)

    const canvas = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )
    const personInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/PersonInstances.tsx'),
      'utf8'
    )
    const vehicleInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/VehicleInstances.tsx'),
      'utf8'
    )
    expect(canvas.includes('runtimeVehiclePoseBuffer.solve(nowMs)')).toBe(true)
    expect(canvas.includes('runtimeVehiclePoseBuffer.get(entity.id)')).toBe(true)
    expect(personInstances.includes('createPersonProxyGeometry')).toBe(true)
    expect(vehicleInstances.includes('runtimeVehiclePoseBuffer.populate(entity.id, state)')).toBe(true)
    expect(vehicleInstances.includes('suppressedEntityIds?: ReadonlySet<string>')).toBe(true)
    expect(vehicleInstances.includes('setSuppressedInstanceMatrices')).toBe(true)
    expect(vehicleInstances.includes('createVehicleProxyShellGeometry')).toBe(true)
  })

  test('detailed marker labels should use sprite/canvas cards instead of Html overlays', () => {
    const files = [
      'components/digital-twin/entities/VehicleMarker.tsx',
      'components/digital-twin/entities/PersonMarker.tsx',
      'components/digital-twin/entities/EquipmentMarker.tsx',
      'components/digital-twin/entities/SensorMarker.tsx',
      'components/digital-twin/entities/CameraMarker.tsx',
      'components/digital-twin/entities/ZoneAreas.tsx',
    ]

    for (const relativePath of files) {
      const source = readFileSync(join(process.cwd(), relativePath), 'utf8')
      expect(source.includes('SpriteInfoCard')).toBe(true)
      expect(source.includes('<Html')).toBe(false)
    }

    const cardSource = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/SpriteInfoCard.tsx'),
      'utf8'
    )
    expect(cardSource.includes('CanvasTexture')).toBe(true)
    expect(cardSource.includes('drawRoundedRect')).toBe(true)
    expect(cardSource.includes('CARD_TEXTURE_CACHE')).toBe(true)
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

  test('dynamic entities should use instanced base rendering with focused detail overlays', () => {
    const markers = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/EntityMarkers.tsx'),
      'utf8'
    )
    const instances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/DynamicEntityInstances.tsx'),
      'utf8'
    )
    const marker = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/DynamicEntityMarker.tsx'),
      'utf8'
    )

    expect(markers.includes('DynamicEntityInstances')).toBe(true)
    expect(markers.includes('suppressedDynamicModelIds')).toBe(true)
    expect(markers.includes('createDynamicEntityBatches(filteredDynamic, publishedSectors)')).toBe(true)
    expect(markers.includes('dynamicBatches.map')).toBe(true)
    expect(markers.includes('showBaseProxy={false}')).toBe(true)
    expect(markers.includes('shouldShowFocusedModel')).toBe(true)
    expect(instances.includes('instancedMesh')).toBe(true)
    expect(instances.includes('useFrame')).toBe(true)
    expect(instances.includes('store.getEcsSnapshotById')).toBe(true)
    expect(instances.includes('writeYawScaleMatrix')).toBe(true)
    expect(instances.includes('markInstancedMatrixRange')).toBe(true)
    expect(instances.includes('mesh.frustumCulled = true')).toBe(true)
    expect(instances.includes('resolveEntitySimulationCadence')).toBe(true)
    expect(instances.includes('isInteractionBoundsVisible')).toBe(true)
    expect(instances.includes('ensureInstancedColorBuffer')).toBe(true)
    expect(instances.includes('suppressedEntityIds?.has(entity.id)')).toBe(true)
    expect(instances.includes('createInstancedInteractionBounds')).toBe(true)
    expect(marker.includes('showModel = true')).toBe(true)
    expect(marker.includes('showBaseProxy = true')).toBe(true)
    expect(marker.includes('showStatusRing = true')).toBe(true)
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
    const runtime = readFileSync(
      join(process.cwd(), 'lib/digital-twin/performance-runtime.ts'),
      'utf8'
    )

    expect(source.includes('lastDrawCallsRef')).toBe(true)
    expect(source.includes('getFrameDrawCallSample')).toBe(true)
    expect(runtime.includes('drawCalls: rawDrawCalls,')).toBe(true)
    expect(runtime.includes('rawDrawCalls -')).toBe(false)
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

    const layout = readFileSync(
      join(process.cwd(), 'lib/digital-twin/campus-layout.ts'),
      'utf8'
    )
    expect(layout.includes('persons: 40 * CAMPUS_SECTORS.length')).toBe(true)
    expect(layout.includes('vehicles: 24 * CAMPUS_SECTORS.length')).toBe(true)
    expect(layout.includes('sector-far-southeast')).toBe(true)
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
    const authoredLayer = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/AuthoredStaticAssetLayer.tsx'),
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
    expect(environment.includes('STATIC_CHUNK_POSITION_EPSILON = 0.25')).toBe(true)
    expect(environment.includes('STATIC_CHUNK_ROTATION_EPSILON = 0.00005')).toBe(true)
    expect(environment.includes('if (staticChunkRegistry.length === 0) return')).toBe(true)
    expect(environment.includes('[assetManifest, authoredStaticAssets, staticChunkRegistry.length]')).toBe(true)
    expect(mount.includes('buildPublishedStaticRenderBatches')).toBe(true)
    expect(mount.includes('PublishedStaticMergedBatches')).toBe(true)
    expect(mount.includes('recipe.proxy ?? recipe.detailed')).toBe(true)
    expect(authoredLayer.includes('BatchedAuthoredStaticAssets')).toBe(true)
    expect(authoredLayer.includes('createBatchedAuthoredStaticAssetNode')).toBe(true)
    expect(authoredLayer.includes('if (!interactive && !selectedAssetId && !hoveredAssetId)')).toBe(true)
    expect(authoredLayer.includes('PublishedStaticRecipeMount recipe={recipe}')).toBe(true)
    expect(authoredLayer.includes('createBatchedWallSystemNode')).toBe(true)
    expect(batches.includes('mergeGeometries')).toBe(true)
  })

  test('editor performance path should isolate drag preview state and cull published static chunks', () => {
    const previewStore = readFileSync(
      join(process.cwd(), 'lib/digital-twin/editor-preview-store.ts'),
      'utf8'
    )
    const gizmo = readFileSync(
      join(process.cwd(), 'components/editor/scene/EditorTransformGizmo.tsx'),
      'utf8'
    )
    const entityLayer = readFileSync(
      join(process.cwd(), 'components/editor/scene/EditorEntityLayer.tsx'),
      'utf8'
    )
    const authoredStaticAssetLayer = readFileSync(
      join(process.cwd(), 'components/editor/scene/EditorAuthoredStaticAssetLayer.tsx'),
      'utf8'
    )
    const environment = readFileSync(
      join(process.cwd(), 'components/editor/scene/EditorStaticEnvironment.tsx'),
      'utf8'
    )

    expect(previewStore.includes('transformPreview')).toBe(true)
    expect(previewStore.includes('setTransformPreview')).toBe(true)
    expect(gizmo.includes('useEditorPreviewStore')).toBe(true)
    expect(entityLayer.includes('previewEntity')).toBe(true)
    expect(authoredStaticAssetLayer.includes('previewAsset')).toBe(true)
    expect(environment.includes('hasRuntimeStaticViewChanged')).toBe(true)
    expect(environment.includes('isRuntimeStaticChunkVisible')).toBe(true)
    expect(environment.includes('STATIC_CHUNK_POSITION_EPSILON = 0.25')).toBe(true)
    expect(environment.includes('STATIC_CHUNK_ROTATION_EPSILON = 0.00005')).toBe(true)
    expect(environment.includes('chunkRef={(node) => setChunkGroupRef(entry.id, node)}')).toBe(true)
  })

  test('runtime model-backed scenes should suppress decorative grid and ground overlays', () => {
    const canvas = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )
    const spaceGrid = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/SpaceGrid.tsx'),
      'utf8'
    )

    expect(canvas.includes('hasPublishedStaticGeometry')).toBe(true)
    expect(canvas.includes('hasModelBackedRuntimeSurface')).toBe(true)
    expect(canvas.includes('showGrid={sceneConfig.showGrid && !hasModelBackedRuntimeSurface}')).toBe(true)
    expect(canvas.includes('showGround={!hasPublishedStaticGeometry}')).toBe(true)
    expect(spaceGrid.includes('showGround = true')).toBe(true)
    expect(spaceGrid.includes('if (!showGrid) return null')).toBe(true)
    expect(spaceGrid.includes('renderOrder={-20}')).toBe(true)
    expect(spaceGrid.includes('depthWrite={false}')).toBe(true)
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

  test('backend runtime load simulator should push dense movement batches through ingest', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts/simulate_runtime_load.py'),
      'utf8'
    )
    const pkg = readFileSync(join(process.cwd(), 'package.json'), 'utf8')

    expect(source.includes('moving-count')).toBe(true)
    expect(source.includes('provision-missing')).toBe(true)
    expect(source.includes('/api/v1/admin/entities')).toBe(true)
    expect(source.includes('x-admin-api-token')).toBe(true)
    expect(source.includes('MAX_BACKEND_BATCH_SIZE = 512')).toBe(true)
    expect(source.includes('/api/v1/runtime/ingest')).toBe(true)
    expect(source.includes('/api/v1/site/bootstrap')).toBe(true)
    expect(source.includes('"position_update"')).toBe(true)
    expect(pkg.includes('dev:simulator:load')).toBe(true)
    expect(pkg.includes('--provision-missing')).toBe(true)
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

  test('zone labels should stay on sprite/canvas paths instead of persistent Html overlays', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/ZoneAreas.tsx'),
      'utf8'
    )

    expect(source.includes('SpriteTextLabel')).toBe(true)
    expect(source.includes('SpriteInfoCard')).toBe(true)
    expect((source.match(/<Html/g) ?? []).length).toBe(0)
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
    expect(vehicleInstances.includes('resolveVehiclePoseFromSnapshots')).toBe(false)
    expect(vehicleInstances.includes('runtimeVehiclePoseBuffer.populate(entity.id, state)')).toBe(true)
  })

  test('instanced moving entities should only upload CPU matrices while dirty or unsettled', () => {
    const personInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/PersonInstances.tsx'),
      'utf8'
    )
    const vehicleInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/VehicleInstances.tsx'),
      'utf8'
    )

    expect(personInstances.includes('forceMatrixSyncRef')).toBe(true)
    expect(personInstances.includes('firstDirtyIndex')).toBe(true)
    expect(personInstances.includes('if (!usingWebGpuStorage && !isSettled(state))')).toBe(true)
    expect(personInstances.includes('writeYawScaleMatrix')).toBe(true)
    expect(personInstances.includes('markInstancedMatrixRange')).toBe(true)
    expect(personInstances.includes('ensureInstancedColorBuffer')).toBe(true)
    expect(personInstances.includes('runtimeVehiclePoseBuffer.populate(entity.id, state)')).toBe(true)
    expect(personInstances.includes('new THREE.Object3D')).toBe(false)
    expect(personInstances.includes('createPersonProxyGeometry')).toBe(true)
    expect(personInstances.includes('const personRef')).toBe(true)
    expect(personInstances.includes('const bodyRef')).toBe(false)
    expect(personInstances.includes('const headRef')).toBe(false)
    expect(vehicleInstances.includes('forceMatrixSyncRef')).toBe(true)
    expect(vehicleInstances.includes('writeYawScaleMatrix')).toBe(true)
    expect(vehicleInstances.includes('markInstancedMatrixRange')).toBe(true)
    expect(vehicleInstances.includes('ensureInstancedColorBuffer')).toBe(true)
    expect(vehicleInstances.includes('new THREE.Object3D')).toBe(false)
    expect(vehicleInstances.includes('runtimeVehiclePoseBuffer.populate(entity.id, state)')).toBe(true)
    expect(vehicleInstances.includes('state.status = targetStatus')).toBe(true)
    expect(vehicleInstances.includes('firstDirtyIndex <= lastDirtyIndex')).toBe(true)
    expect(vehicleInstances.includes('createVehicleProxyShellGeometry')).toBe(true)
    expect(vehicleInstances.includes('const shellRef')).toBe(true)
    expect(vehicleInstances.includes('const arrowRef')).toBe(false)
    expect(vehicleInstances.includes('arrowMatrixArray')).toBe(false)
    expect(vehicleInstances.includes('<coneGeometry args={[0.45, 1, 8]} />')).toBe(false)
    expect(vehicleInstances.includes('const cabinRef')).toBe(false)
    expect(vehicleInstances.includes('const wheelRef')).toBe(false)
    expect(vehicleInstances.includes('firstDirtyWheelIndex')).toBe(false)
    expect(vehicleInstances.includes('writeYawRollScaleMatrix')).toBe(false)

    const dynamicInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/DynamicEntityInstances.tsx'),
      'utf8'
    )
    expect(dynamicInstances.includes('runtimeVehiclePoseBuffer.populate(entity.id, runtime)')).toBe(true)
    expect(dynamicInstances.includes('writeGroundRingMatrix')).toBe(true)
    expect(dynamicInstances.includes('writeTranslationScaleMatrix')).toBe(true)
    expect(dynamicInstances.includes('writeTranslationScaleMatrix(statusMatrixArray')).toBe(true)
    expect(dynamicInstances.includes('if (!usingWebGpuStorage && !isSettled(runtime))')).toBe(true)
    expect(dynamicInstances.includes('writeYawScaleMatrix(statusMatrixArray')).toBe(false)
    expect(dynamicInstances.includes('new THREE.Object3D')).toBe(false)
    expect(dynamicInstances.includes('const hasDynamicSnapshot = snapshot?.type === \'dynamic\'')).toBe(true)
    expect(dynamicInstances.includes('...entity')).toBe(false)
  })

  test('webgpu moving instances should use storage buffers and compute-expanded matrices', () => {
    const storagePipeline = readFileSync(
      join(process.cwd(), 'lib/digital-twin/renderer/webgpu-storage-instances.ts'),
      'utf8'
    )
    const personInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/PersonInstances.tsx'),
      'utf8'
    )
    const vehicleInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/VehicleInstances.tsx'),
      'utf8'
    )
    const dynamicInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/DynamicEntityInstances.tsx'),
      'utf8'
    )

    expect(storagePipeline.includes('StorageInstancedBufferAttribute')).toBe(true)
    expect(storagePipeline.includes('MeshStandardNodeMaterial')).toBe(true)
    expect(storagePipeline.includes('storage(')).toBe(true)
    expect(storagePipeline.includes('Fn(()')).toBe(true)
    expect(storagePipeline.includes('.compute(safeCount)')).toBe(true)
    expect(storagePipeline.includes("motionMode: WebGpuStorageMotionMode")).toBe(true)
    expect(storagePipeline.includes('targetPoseAttribute')).toBe(true)
    expect(storagePipeline.includes('motionAlphaUniform')).toBe(true)
    expect(storagePipeline.includes('writeWebGpuStorageTargetTransform')).toBe(true)
    expect(storagePipeline.includes('markWebGpuStorageTargetRange')).toBe(true)
    expect(storagePipeline.includes('resetWebGpuStorageMotion')).toBe(true)
    expect(storagePipeline.includes('attachWebGpuStorageRaycast')).toBe(true)
    expect(storagePipeline.includes('detachWebGpuStorageRaycast')).toBe(true)
    expect(storagePipeline.includes('writeWebGpuStorageMatrixElements')).toBe(true)
    expect(storagePipeline.includes('WebGpuMovingInstanceSlotAllocator')).toBe(true)
    expect(storagePipeline.includes('createWebGpuSharedMovingInstancePipeline')).toBe(true)
    expect(storagePipeline.includes('writeWebGpuSharedMovingTarget')).toBe(true)
    expect(storagePipeline.includes('writeWebGpuSharedMovingPartTransform')).toBe(true)
    expect(storagePipeline.includes('markWebGpuSharedMovingTargetRange')).toBe(true)
    expect(storagePipeline.includes('markWebGpuSharedMovingPartTransformRange')).toBe(true)
    expect(storagePipeline.includes('dispatchWebGpuSharedMovingCompute')).toBe(true)
    expect(storagePipeline.includes('attachWebGpuSharedMovingRaycast')).toBe(true)

    for (const source of [personInstances, vehicleInstances]) {
      expect(source.includes('rendererBackend === \'webgpu\'')).toBe(true)
      expect(source.includes('createWebGpuStorageInstancePipeline')).toBe(true)
      expect(source.includes("motionMode: 'gpu-damped'")).toBe(true)
      expect(source.includes('writeWebGpuStorageTargetTransform')).toBe(true)
      expect(source.includes('markWebGpuStorageTargetRange')).toBe(true)
      expect(source.includes('resetWebGpuStorageMotion')).toBe(true)
      expect(source.includes('gpuMotionFramesRef')).toBe(true)
      expect(source.includes('dispatchWebGpuStorageCompute')).toBe(true)
      expect(source.includes('attachWebGpuStorageRaycast')).toBe(true)
      expect(source.includes('detachWebGpuStorageRaycast')).toBe(true)
    }

    expect(dynamicInstances.includes('rendererBackend === \'webgpu\'')).toBe(true)
    expect(dynamicInstances.includes('createWebGpuSharedMovingInstancePipeline')).toBe(true)
    expect(dynamicInstances.includes('slotAllocator.sync(entityIds)')).toBe(true)
    expect(dynamicInstances.includes('slotState?.slotById.get(entity.id) ?? index')).toBe(true)
    expect(dynamicInstances.includes('slotState?.slotEntityIds ?? entityIds')).toBe(true)
    expect(dynamicInstances.includes('writeWebGpuSharedMovingTarget')).toBe(true)
    expect(dynamicInstances.includes('writeWebGpuSharedMovingPartTransform')).toBe(true)
    expect(dynamicInstances.includes('markWebGpuSharedMovingTargetRange')).toBe(true)
    expect(dynamicInstances.includes('markWebGpuSharedMovingPartTransformRange')).toBe(true)
    expect(dynamicInstances.includes('resetWebGpuSharedMovingSlots')).toBe(true)
    expect(dynamicInstances.includes('slotState.releasedSlots')).toBe(true)
    expect(dynamicInstances.includes('slotState.newlyAssignedSlots')).toBe(true)
    expect(dynamicInstances.includes('gpuMotionFramesRef')).toBe(true)
    expect(dynamicInstances.includes('dispatchWebGpuSharedMovingCompute')).toBe(true)
    expect(dynamicInstances.includes('attachWebGpuSharedMovingRaycast')).toBe(true)
    expect(dynamicInstances.includes('detachWebGpuStorageRaycast')).toBe(true)
    expect(dynamicInstances.includes('createWebGpuStorageInstancePipeline')).toBe(false)
    expect(dynamicInstances.includes('writeWebGpuStorageTargetTransform')).toBe(false)
    expect(dynamicInstances.includes("transformKind: 'translation'")).toBe(true)
    expect(dynamicInstances.includes("transformKind: 'ground-ring'")).toBe(true)
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
    const dynamicInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/DynamicEntityInstances.tsx'),
      'utf8'
    )

    expect(personInstances.includes('isInteractionBoundsVisible')).toBe(true)
    expect(personInstances.includes('batchVisibleRef')).toBe(true)
    expect(personInstances.includes('runtimeStates.clear()')).toBe(true)
    expect(vehicleInstances.includes('isInteractionBoundsVisible')).toBe(true)
    expect(vehicleInstances.includes('batchVisibleRef')).toBe(true)
    expect(vehicleInstances.includes('runtimeStates.clear()')).toBe(true)
    expect(dynamicInstances.includes('isInteractionBoundsVisible')).toBe(true)
    expect(dynamicInstances.includes('batchVisibleRef')).toBe(true)
    expect(dynamicInstances.includes('runtimeStates.clear()')).toBe(true)
  })

  test('instanced entity picking should apply explicit interaction bounds', () => {
    const pickIndex = readFileSync(
      join(process.cwd(), 'lib/digital-twin/viewer-runtime/pick-index.ts'),
      'utf8'
    )
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
    const dynamicInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/DynamicEntityInstances.tsx'),
      'utf8'
    )

    expect(personInstances.includes('applyInteractionBounds')).toBe(true)
    expect(vehicleInstances.includes('applyInteractionBounds')).toBe(true)
    expect(equipmentInstances.includes('applyInteractionBounds')).toBe(true)
    expect(dynamicInstances.includes('applyInteractionBounds')).toBe(true)
    expect(personInstances.includes('createInstancedInteractionBounds')).toBe(true)
    expect(vehicleInstances.includes('createInstancedInteractionBounds')).toBe(true)
    expect(equipmentInstances.includes('createInstancedInteractionBounds')).toBe(true)
    expect(dynamicInstances.includes('createInstancedInteractionBounds')).toBe(true)
    expect(personInstances.includes('mesh.frustumCulled = true')).toBe(true)
    expect(vehicleInstances.includes('mesh.frustumCulled = true')).toBe(true)
    expect(equipmentInstances.includes('mesh.frustumCulled = true')).toBe(true)
    expect(dynamicInstances.includes('mesh.frustumCulled = true')).toBe(true)
    expect(personInstances.includes('mesh.boundingSphere')).toBe(true)
    expect(vehicleInstances.includes('mesh.boundingSphere')).toBe(true)
    expect(equipmentInstances.includes('mesh.boundingSphere')).toBe(true)
    expect(dynamicInstances.includes('mesh.boundingSphere')).toBe(true)
    expect(pickIndex.includes('class DigitalTwinRaySpherePickGrid')).toBe(true)
    for (const source of [personInstances, vehicleInstances, equipmentInstances, dynamicInstances]) {
      expect(source.includes('DigitalTwinRaySpherePickGrid')).toBe(true)
      expect(source.includes('pickGrid.collect(raycaster)')).toBe(true)
    }
  })
})
