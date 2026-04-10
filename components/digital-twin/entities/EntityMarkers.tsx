'use client'

import { useMemo } from 'react'
import type { PublishedSceneSector } from '@/lib/digital-twin/publish'
import { normalizeVehicleTrackLike } from '@/lib/digital-twin/vehicle-route-motion'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import type {
  CameraEntity,
  EquipmentEntity,
  PersonEntity,
  SensorEntity,
  VehicleEntity,
  Vector3,
} from '@/lib/digital-twin/types'
import { PersonMarker } from './PersonMarker'
import { VehicleMarker } from './VehicleMarker'
import { EquipmentMarker } from './EquipmentMarker'
import { SensorMarker } from './SensorMarker'
import { CameraMarker } from './CameraMarker'
import { PersonInstances } from './PersonInstances'
import { VehicleInstances } from './VehicleInstances'
import { EquipmentInstances } from './EquipmentInstances'

interface SectorEntityBatch<T> {
  sectorId: string
  entities: T[]
}

function resolveNearestSectorId(position: Vector3, sectors: PublishedSceneSector[]) {
  let nearestSectorId = sectors[0]?.id ?? 'sector-core'
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const sector of sectors) {
    const dx = position.x - sector.offset.x
    const dz = position.z - sector.offset.z
    const distance = dx * dx + dz * dz
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestSectorId = sector.id
    }
  }

  return nearestSectorId
}

function createSectorEntityBatches<T extends { position: Vector3 }>(
  entities: T[],
  sectors: PublishedSceneSector[]
): SectorEntityBatch<T>[] {
  const sectorBuckets = new Map<string, T[]>()
  sectors.forEach((sector) => {
    sectorBuckets.set(sector.id, [])
  })

  // Keep instanced batches localized so offscreen sectors can cull independently.
  entities.forEach((entity) => {
    const sectorId = resolveNearestSectorId(entity.position, sectors)
    sectorBuckets.get(sectorId)?.push(entity)
  })

  return sectors.map((sector) => ({
    sectorId: sector.id,
    entities: sectorBuckets.get(sector.id) ?? [],
  })).filter((batch) => batch.entities.length > 0)
}

export function createVehicleEntityBatches(
  vehicles: VehicleEntity[],
  sectors: PublishedSceneSector[]
): SectorEntityBatch<VehicleEntity>[] {
  const buckets = new Map<string, VehicleEntity[]>()

  vehicles.forEach((vehicle) => {
    const normalizedTrack = vehicle.routeTrack
      ? normalizeVehicleTrackLike(vehicle.routeTrack)
      : null
    const batchId = normalizedTrack?.id
      ? `track:${normalizedTrack.id}`
      : resolveNearestSectorId(vehicle.position, sectors)
    const existing = buckets.get(batchId)
    if (existing) {
      existing.push(vehicle)
    } else {
      buckets.set(batchId, [vehicle])
    }
  })

  return [...buckets.entries()].map(([sectorId, entities]) => ({
    sectorId,
    entities,
  }))
}

export function EntityMarkers() {
  const persons = useDigitalTwinStore((state) => state.entityBuckets.persons)
  const vehicles = useDigitalTwinStore((state) => state.entityBuckets.vehicles)
  const equipment = useDigitalTwinStore((state) => state.entityBuckets.equipment)
  const sensors = useDigitalTwinStore((state) => state.entityBuckets.sensors)
  const cameras = useDigitalTwinStore((state) => state.entityBuckets.cameras)
  const entityFilters = useDigitalTwinStore((state) => state.entityFilters)
  const selectedEntityId = useDigitalTwinStore((state) => state.selectedEntityId)
  const hoveredEntityId = useDigitalTwinStore((state) => state.hoveredEntityId)
  const publishedSectors = useDigitalTwinStore((state) => state.publishedScenePackage.sectors)

  const searchQuery = entityFilters.searchQuery.toLowerCase()
  const {
    filteredPersons,
    filteredVehicles,
    filteredEquipment,
    filteredSensors,
    filteredCameras,
  } = useMemo(() => {
    const matchesBaseFilter = (
      entity: PersonEntity | VehicleEntity | EquipmentEntity | SensorEntity | CameraEntity
    ) => {
      if (!entityFilters.types.includes(entity.type)) return false
      if (!entityFilters.statuses.includes(entity.status)) return false
      if (!entity.visible) return false
      if (!searchQuery) return true
      return entity.name.toLowerCase().includes(searchQuery)
    }

    return {
      filteredPersons: persons.filter((entity) => matchesBaseFilter(entity)),
      filteredVehicles: vehicles.filter((entity) => matchesBaseFilter(entity)),
      filteredEquipment: equipment.filter((entity) => matchesBaseFilter(entity)),
      filteredSensors: sensors.filter((entity) => matchesBaseFilter(entity)),
      filteredCameras: cameras.filter((entity) => matchesBaseFilter(entity)),
    }
  }, [persons, vehicles, equipment, sensors, cameras, entityFilters, searchQuery])
  const personBatches = useMemo(
    () => createSectorEntityBatches(filteredPersons, publishedSectors),
    [filteredPersons, publishedSectors]
  )
  const vehicleBatches = useMemo(
    // Keep moving vehicles in stable route batches so they do not remount every
    // time their position crosses the nearest-sector boundary.
    () => createVehicleEntityBatches(filteredVehicles, publishedSectors),
    [filteredVehicles, publishedSectors]
  )
  const equipmentBatches = useMemo(
    () => createSectorEntityBatches(filteredEquipment, publishedSectors),
    [filteredEquipment, publishedSectors]
  )

  const detailPersons = useMemo(
    () =>
      filteredPersons.filter(
        (entity) =>
          entity.id === selectedEntityId ||
          entity.id === hoveredEntityId ||
          entity.labelMode === 'html'
      ),
    [filteredPersons, hoveredEntityId, selectedEntityId]
  )
  const detailVehicles = useMemo(
    () =>
      filteredVehicles.filter(
        (entity) =>
          entity.id === selectedEntityId ||
          entity.id === hoveredEntityId ||
          entity.labelMode === 'html'
      ),
    [filteredVehicles, hoveredEntityId, selectedEntityId]
  )
  const detailEquipment = useMemo(
    () =>
      filteredEquipment.filter(
        (entity) =>
          entity.id === selectedEntityId ||
          entity.id === hoveredEntityId ||
          entity.labelMode !== 'hidden'
      ),
    [filteredEquipment, hoveredEntityId, selectedEntityId]
  )

  return (
    <group>
      {personBatches.map((batch) => (
        <PersonInstances key={`person-${batch.sectorId}`} entities={batch.entities} />
      ))}
      {detailPersons.map((person) => (
        <PersonMarker
          key={person.id}
          entity={person}
          isSelected={selectedEntityId === person.id}
          isHovered={hoveredEntityId === person.id}
          showModel={false}
        />
      ))}

      {vehicleBatches.map((batch) => (
        <VehicleInstances key={`vehicle-${batch.sectorId}`} entities={batch.entities} />
      ))}
      {detailVehicles.map((vehicle) => (
        <VehicleMarker
          key={vehicle.id}
          entity={vehicle}
          isSelected={selectedEntityId === vehicle.id}
          isHovered={hoveredEntityId === vehicle.id}
          showModel={false}
        />
      ))}

      {/* 设备标记 */}
      {equipmentBatches.map((batch) => (
        <EquipmentInstances
          key={`equipment-${batch.sectorId}`}
          entities={batch.entities}
          selectedEntityId={selectedEntityId}
          hoveredEntityId={hoveredEntityId}
        />
      ))}
      {detailEquipment.map((equip) => (
        <EquipmentMarker
          key={equip.id}
          entity={equip}
          isSelected={selectedEntityId === equip.id}
          isHovered={hoveredEntityId === equip.id}
          showModel={false}
          showStatusRing={false}
        />
      ))}

      {filteredSensors.map((sensor) => (
        <SensorMarker
          key={sensor.id}
          entity={sensor}
          isSelected={selectedEntityId === sensor.id}
          isHovered={hoveredEntityId === sensor.id}
        />
      ))}

      {filteredCameras.map((camera) => (
        <CameraMarker
          key={camera.id}
          entity={camera}
          isSelected={selectedEntityId === camera.id}
          isHovered={hoveredEntityId === camera.id}
        />
      ))}
    </group>
  )
}
