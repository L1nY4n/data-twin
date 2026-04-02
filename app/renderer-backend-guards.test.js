import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('renderer backend guards', () => {
  test('store should expose renderer mode and backend states', () => {
    const source = readFileSync(join(process.cwd(), 'lib/digital-twin/store.ts'), 'utf8')

    expect(source.includes('rendererMode')).toBe(true)
    expect(source.includes('rendererBackend')).toBe(true)
    expect(source.includes('setRendererMode')).toBe(true)
    expect(source.includes('setRendererBackend')).toBe(true)
  })

  test('canvas should use dual backend renderer creation helper', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )

    expect(source.includes('createPreferredRenderer')).toBe(true)
    expect(source.includes('rendererMode')).toBe(true)
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

    expect(source.includes('ScenePicking')).toBe(true)
    expect(picking.includes('pickRootRef')).toBe(true)
    expect(picking.includes('raycaster.intersectObject')).toBe(true)
    expect(picking.includes('resolveEntityIdFromIntersection')).toBe(true)
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

    expect(source.includes('<PersonInstances entities={filteredPersons} />')).toBe(true)
    expect(source.includes('<VehicleInstances entities={filteredVehicles} />')).toBe(true)
    expect(source.includes('entities={filteredEquipment}')).toBe(true)
    expect(source.includes('<EquipmentInstances')).toBe(true)
    expect(source.includes('selectedEntityId={selectedEntityId}')).toBe(true)
    expect(source.includes('hoveredEntityId={hoveredEntityId}')).toBe(true)
    expect(source.includes('showModel={false}')).toBe(true)
  })

  test('equipment instanced path should expose pickable metadata instead of per-mesh pointer handlers', () => {
    const equipmentInstances = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/EquipmentInstances.tsx'),
      'utf8'
    )

    expect(equipmentInstances.includes('userData={{ pickable: true, entityIds }}')).toBe(true)
    expect(equipmentInstances.includes('onClick=')).toBe(false)
  })

  test('entity detail overlays should avoid meshBasicMaterial on webgpu-sensitive paths', () => {
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
    expect(zoneAreas.includes('meshBasicMaterial')).toBe(false)
  })

  test('selected zone feedback should avoid the unstable translucent fill path on webgpu', () => {
    const zoneAreas = readFileSync(
      join(process.cwd(), 'components/digital-twin/entities/ZoneAreas.tsx'),
      'utf8'
    )

    expect(zoneAreas.includes('{!isSelected && (')).toBe(true)
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
  })

  test('repo should ship a webgpu selection regression script for local repro', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/check-webgpu-selection.mjs'), 'utf8')

    expect(source.includes('强制WebGPU（失败回退）')).toBe(true)
    expect(source.includes('person')).toBe(true)
    expect(source.includes('vehicle')).toBe(true)
    expect(source.includes('equipment')).toBe(true)
    expect(source.includes('zone')).toBe(true)
  })

  test('canvas should mount the chemical plant environment layer', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/DigitalTwinCanvas.tsx'),
      'utf8'
    )

    expect(source.includes('ChemicalPlantEnvironment')).toBe(true)
  })
})
