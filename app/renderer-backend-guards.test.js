import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('renderer backend guards', () => {
  test('store should expose renderer mode and backend states', () => {
    const source = readFileSync(join(process.cwd(), 'lib/digital-twin/store.ts'), 'utf8')

    expect(source.includes('rendererMode')).toBe(true)
    expect(source.includes('rendererBackend')).toBe(true)
    expect(source.includes('rendererDiagnostics')).toBe(true)
    expect(source.includes('setRendererMode')).toBe(true)
    expect(source.includes('setRendererBackend')).toBe(true)
    expect(source.includes('setRendererDiagnostics')).toBe(true)
  })

  test('canvas should use dual backend renderer creation helper', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )
    const renderer = readFileSync(
      join(process.cwd(), 'lib/digital-twin/renderer/createPreferredRenderer.ts'),
      'utf8'
    )

    expect(source.includes('createPreferredRenderer')).toBe(true)
    expect(source.includes('rendererMode')).toBe(true)
    expect(source.includes('__diagnostics')).toBe(true)
    expect(source.includes('setRendererDiagnostics')).toBe(true)
    expect(source.includes('storageBufferActive: backend === \'webgpu\'')).toBe(true)
    expect(renderer.includes('PreferredRendererDiagnostics')).toBe(true)
    expect(renderer.includes('fallbackReason')).toBe(true)
    expect(renderer.includes('webgpu-insecure-context')).toBe(true)
    expect(renderer.includes('webgpu-init-failed')).toBe(true)
    expect(renderer.includes('navigator-gpu-unavailable')).toBe(true)
  })

  test('canvas should not key renderer remounts directly by renderer mode', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )

    expect(source.includes('key={`renderer-${rendererMode}`}')).toBe(false)
    expect(source.includes('shouldRecreateRendererForMode')).toBe(true)
    expect(source.includes('rendererRevision')).toBe(true)
    expect(source.includes('RendererReadySignal')).toBe(true)
    expect(source.includes('rendererTransitioning')).toBe(true)
    expect(source.includes('data-renderer-transition="active"')).toBe(true)
  })

  test('scene should use unified canvas picking controller', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )
    const picking = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/ScenePicking.tsx'),
      'utf8'
    )
    const staticPicking = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/PublishedStaticFeaturePickingLayer.tsx'),
      'utf8'
    )

    expect(source.includes('ScenePicking')).toBe(true)
    expect(picking.includes('pickRootRef')).toBe(true)
    expect(picking.includes('raycaster.intersectObject')).toBe(true)
    expect(picking.includes('resolvePickTargetFromIntersection')).toBe(true)
    expect(source.includes('PublishedStaticFeaturePickingLayer')).toBe(true)
    expect(staticPicking.includes('staticFeatureIds')).toBe(true)
    expect(source.includes('pickRootRef')).toBe(true)
    expect(picking.includes('scene.children')).toBe(false)
  })

  test('entity rendering paths should expose pickable metadata instead of mesh-level pointer handlers', () => {
    const personMarker = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/PersonMarker.tsx'),
      'utf8'
    )
    const vehicleMarker = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/VehicleMarker.tsx'),
      'utf8'
    )
    const equipmentMarker = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/EquipmentMarker.tsx'),
      'utf8'
    )
    const zoneAreas = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/ZoneAreas.tsx'),
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

    expect(personMarker.includes('userData={{ pickable: true, entityId: entity.id }}')).toBe(true)
    expect(vehicleMarker.includes('userData={{ pickable: true, entityId: entity.id }}')).toBe(true)
    expect(equipmentMarker.includes('userData={{ pickable: true, entityId: entity.id }}')).toBe(true)
    expect(zoneAreas.includes('userData={{ pickable: true, entityId: zone.id }}')).toBe(true)
    expect(personInstances.includes('userData={{ pickable: true, entityIds }}')).toBe(true)
    expect(vehicleInstances.includes('userData={{ pickable: true, entityIds }}')).toBe(true)
    expect(equipmentInstances.includes('userData={{ pickable: true, entityIds }}')).toBe(true)
    expect(personInstances.includes('onClick=')).toBe(false)
    expect(vehicleInstances.includes('onClick=')).toBe(false)
    expect(equipmentInstances.includes('onClick=')).toBe(false)
  })

  test('selection overlays should not remove people, vehicles and equipment from instanced base rendering', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/EntityMarkers.tsx'),
      'utf8'
    )

    expect(source.includes('personBatches.map')).toBe(true)
    expect(source.includes('vehicleBatches.map')).toBe(true)
    expect(source.includes('equipmentBatches.map')).toBe(true)
    expect(source.includes('<EquipmentInstances')).toBe(true)
    expect(source.includes('suppressedEntityIds={suppressedVehicleDetailIds}')).toBe(true)
    expect(source.includes('selectedEntityId={selectedEntityId}')).toBe(true)
    expect(source.includes('hoveredEntityId={hoveredEntityId}')).toBe(true)
    expect(source.includes('showModel={false}')).toBe(true)
  })

  test('truck and forklift vehicles should keep detailed runtime models by default', () => {
    const markers = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/EntityMarkers.tsx'),
      'utf8'
    )
    const vehicleMarker = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/VehicleMarker.tsx'),
      'utf8'
    )
    const truckModel = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/TruckRuntimeModel.tsx'),
      'utf8'
    )
    const truckOrientation = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/truck-runtime-orientation.ts'),
      'utf8'
    )
    const forkliftModel = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/ForkliftRuntimeModel.tsx'),
      'utf8'
    )
    const forkliftOrientation = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/forklift-runtime-orientation.ts'),
      'utf8'
    )

    expect(markers.includes("filteredModelVehicles")).toBe(false)
    expect(markers.includes("filteredInstancedVehicles")).toBe(false)
    expect(markers.includes('filteredVehicles')).toBe(true)
    expect(markers.includes('createVehicleEntityBatches(filteredVehicles, publishedSectors)')).toBe(true)
    expect(markers.includes('shouldRenderDetailedVehicleModel')).toBe(true)
    expect(markers.includes('return isDetailedVehicleModelType(entity)')).toBe(true)
    expect(markers.includes('isFocusedEntity')).toBe(false)
    expect(markers.includes('detailedModelVehicles.map')).toBe(true)
    expect(markers.includes('suppressedVehicleDetailIds')).toBe(true)
    expect(markers.includes("entity.vehicleType === 'truck'")).toBe(true)
    expect(markers.includes("entity.vehicleType === 'forklift'")).toBe(true)
    expect(vehicleMarker.includes('TruckRuntimeModel')).toBe(true)
    expect(vehicleMarker.includes('ForkliftRuntimeModel')).toBe(true)
    expect(truckOrientation.includes('/assets/3d/construction-vehicle-5.glb')).toBe(true)
    expect(truckOrientation.includes('TRUCK_MODEL_SCALE = 1.91')).toBe(true)
    expect(truckOrientation.includes('TRUCK_MODEL_ROTATION_X = 0')).toBe(true)
    expect(truckOrientation.includes('TRUCK_MODEL_ROTATION_Y = 0')).toBe(true)
    expect(truckOrientation.includes('clone.position.set(-centerX, -bottomY, -centerZ)')).toBe(true)
    expect(truckModel.includes('normalizeTruckScene')).toBe(true)
    expect(forkliftOrientation.includes('/assets/3d/Fork_Lift.glb')).toBe(true)
    expect(forkliftOrientation.includes('FORKLIFT_MODEL_SCALE = 0.101')).toBe(true)
    expect(forkliftOrientation.includes('FORKLIFT_MODEL_ROTATION_Y = -Math.PI / 2')).toBe(true)
    expect(forkliftOrientation.includes("object.name === 'Render_Floor'")).toBe(true)
    expect(forkliftModel.includes('normalizeForkliftScene')).toBe(true)
    expect(forkliftModel.includes('useGLTF')).toBe(true)
    expect(vehicleMarker.includes('meshRef.current?.rotation.set(0, yaw, 0)')).toBe(true)
    expect(vehicleMarker.includes('resolveVehicleRoutePose')).toBe(true)
  })

  test('dynamic entities should use registry-backed runtime markers instead of hardcoded family branches', () => {
    const markers = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/EntityMarkers.tsx'),
      'utf8'
    )
    const dynamicMarker = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/DynamicEntityMarker.tsx'),
      'utf8'
    )
    const dynamicInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/DynamicEntityInstances.tsx'),
      'utf8'
    )

    expect(markers.includes('entityBuckets.dynamic')).toBe(true)
    expect(markers.includes('DynamicEntityInstances')).toBe(true)
    expect(markers.includes('DynamicEntityMarker')).toBe(true)
    expect(markers.includes('getDynamicEntityPresentation')).toBe(true)
    expect(markers.includes('state.getDynamicEntityPresentation')).toBe(true)
    expect(markers.includes('suppressedDynamicModelIds')).toBe(true)
    expect(markers.includes('showBaseProxy={false}')).toBe(true)
    expect(dynamicInstances.includes('instancedMesh')).toBe(true)
    expect(dynamicInstances.includes('userData={{ pickable: true, entityIds: renderEntityIds }}')).toBe(true)
    expect(dynamicInstances.includes('slotState?.slotEntityIds ?? entityIds')).toBe(true)
    expect(dynamicInstances.includes('createInstancedInteractionBounds')).toBe(true)
    expect(dynamicMarker.includes('userData={{ pickable: true, entityId: entity.id }}')).toBe(true)
    expect(dynamicMarker.includes('showModel = true')).toBe(true)
    expect(dynamicMarker.includes('showBaseProxy = true')).toBe(true)
    expect(dynamicMarker.includes('asset.fileType === \'fbx\'')).toBe(true)
    expect(dynamicMarker.includes('asset.assetUrl')).toBe(true)
    expect(dynamicMarker.includes('displayAttributes')).toBe(true)
  })

  test('equipment instanced path should expose pickable metadata instead of per-mesh pointer handlers', () => {
    const equipmentInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/EquipmentInstances.tsx'),
      'utf8'
    )

    expect(equipmentInstances.includes('userData={{ pickable: true, entityIds }}')).toBe(true)
    expect(equipmentInstances.includes('onClick=')).toBe(false)
  })

  test('entity detail overlays should keep pbr materials while zone fills use non-indexed basic overlays', () => {
    const personMarker = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/PersonMarker.tsx'),
      'utf8'
    )
    const vehicleMarker = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/VehicleMarker.tsx'),
      'utf8'
    )
    const equipmentMarker = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/EquipmentMarker.tsx'),
      'utf8'
    )
    const zoneAreas = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/ZoneAreas.tsx'),
      'utf8'
    )

    expect(personMarker.includes('meshBasicMaterial')).toBe(false)
    expect(vehicleMarker.includes('meshBasicMaterial')).toBe(false)
    expect(equipmentMarker.includes('meshBasicMaterial')).toBe(false)
    expect(zoneAreas.includes('meshBasicMaterial')).toBe(true)
    expect(zoneAreas.includes('toNonIndexed()')).toBe(true)
  })

  test('selected zone feedback should avoid the unstable translucent fill path on webgpu', () => {
    const zoneAreas = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/ZoneAreas.tsx'),
      'utf8'
    )

    expect(zoneAreas.includes('{!isSelected && fillGeometry && (')).toBe(true)
    expect(zoneAreas.includes('boundary/label overlays')).toBe(true)
  })

  test('distance overlay should use one stable line path across renderer backends', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/digital-twin/overlays/DistanceIndicator.tsx'),
      'utf8'
    )

    expect(source.includes('rendererBackend')).toBe(false)
    expect(source.includes('useNativeLine')).toBe(false)
    expect(source.includes('SceneLine')).toBe(true)
  })

  test('3d scene should avoid drei shader-material paths that are unstable on webgpu', () => {
    const spaceGrid = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/SpaceGrid.tsx'),
      'utf8'
    )
    const measurement = readFileSync(
      join(process.cwd(), 'components/digital-twin/overlays/MeasurementTool.tsx'),
      'utf8'
    )
    const trajectory = readFileSync(
      join(process.cwd(), 'components/digital-twin/overlays/TrajectoryLine.tsx'),
      'utf8'
    )
    const personMarker = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/PersonMarker.tsx'),
      'utf8'
    )
    const vehicleMarker = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/VehicleMarker.tsx'),
      'utf8'
    )
    const equipmentMarker = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/EquipmentMarker.tsx'),
      'utf8'
    )

    expect(spaceGrid.includes(' Grid')).toBe(false)
    expect(spaceGrid.includes(' Line')).toBe(false)
    expect(spaceGrid.includes(' Text')).toBe(false)
    expect(measurement.includes(' Line')).toBe(false)
    expect(trajectory.includes(' Line')).toBe(false)
    expect(personMarker.includes(' Text')).toBe(false)
    expect(vehicleMarker.includes(' Text')).toBe(false)
    expect(equipmentMarker.includes(' Text')).toBe(false)
  })

  test('benchmark page should exist for local A/B measurements', () => {
    const source = readFileSync(join(process.cwd(), 'app/benchmark/page.tsx'), 'utf8')

    expect(source.includes('runBenchmark')).toBe(true)
    expect(source.includes('setRendererMode')).toBe(true)
    expect(source.includes('rendererDiagnostics')).toBe(true)
    expect(source.includes('backendMismatch')).toBe(true)
    expect(source.includes('storageBufferActive')).toBe(true)
    expect(source.includes('fallbackReason')).toBe(true)
    expect(source.includes('ViewerAdminSurfaceShell')).toBe(true)
    expect(source.includes('ViewerAdminToolbarBar')).toBe(true)
    expect(source.includes('ProductModuleNav')).toBe(true)
    expect(source.includes('viewer-admin-canvas-frame')).toBe(true)
    expect(source.includes('hidden w-[320px] xl:block')).toBe(true)
    expect(source.includes('xl:hidden')).toBe(true)
    expect(source.includes('useIsMobile')).toBe(true)
    expect(source.includes('max-h-[34svh]')).toBe(true)
  })

  test('repo should ship a webgpu selection regression script for local repro', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/check-webgpu-selection.mjs'), 'utf8')

    expect(source.includes('强制WebGPU（失败回退）')).toBe(true)
    expect(source.includes('person')).toBe(true)
    expect(source.includes('vehicle')).toBe(true)
    expect(source.includes('equipment')).toBe(true)
    expect(source.includes('zone')).toBe(true)
    expect(source.includes('DATA_T_ACCESS_TOKEN')).toBe(true)
    expect(source.includes('unlockFrontendAccess')).toBe(true)
    expect(source.includes('viewer-admin-entity-row-main')).toBe(true)
    expect(source.includes('[data-performance-hud="runtime"]')).toBe(true)
    expect(source.includes('skipped: true')).toBe(true)
    expect(source.includes('DATA_T_SCREENSHOTS')).toBe(true)
    expect(source.includes('DATA_T_SCREENSHOT_TIMEOUT_MS')).toBe(true)
    expect(source.includes('DATA_T_ALLOW_WEBGPU_FALLBACK')).toBe(true)
    expect(source.includes('parseRendererHud')).toBe(true)
    expect(source.includes('backendMismatch')).toBe(true)
    expect(source.includes('actualBackend')).toBe(true)
  })

  test('canvas should mount the chemical plant environment layer', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )

    expect(source.includes('ChemicalPlantEnvironment')).toBe(true)
    expect(source.includes('data-performance-hud="runtime"')).toBe(true)
  })
})
