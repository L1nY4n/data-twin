'use client'

import { useMemo } from 'react'
import { DEFAULT_PUBLISHED_SCENE_PACKAGE } from '@/lib/digital-twin/publish'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import type { EquipmentEntity, PersonEntity, VehicleEntity, Vector3 } from '@/lib/digital-twin/types'
import { PersonMarker } from './PersonMarker'
import { VehicleMarker } from './VehicleMarker'
import { EquipmentMarker } from './EquipmentMarker'
import { PersonInstances } from './PersonInstances'
import { VehicleInstances } from './VehicleInstances'
import { EquipmentInstances } from './EquipmentInstances'

interface SectorEntityBatch<T> {
  sectorId: string
  entities: T[]
}

function resolveNearestSectorId(position: Vector3) {
  let nearestSectorId = DEFAULT_PUBLISHED_SCENE_PACKAGE.sectors[0]?.id ?? 'sector-core'
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const sector of DEFAULT_PUBLISHED_SCENE_PACKAGE.sectors) {
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

function createSectorEntityBatches<T extends { position: Vector3 }>(entities: T[]): SectorEntityBatch<T>[] {
  const sectorBuckets = new Map<string, T[]>()
  DEFAULT_PUBLISHED_SCENE_PACKAGE.sectors.forEach((sector) => {
    sectorBuckets.set(sector.id, [])
  })

  // Keep instanced batches localized so offscreen sectors can cull independently.
  entities.forEach((entity) => {
    const sectorId = resolveNearestSectorId(entity.position)
    sectorBuckets.get(sectorId)?.push(entity)
  })

  return DEFAULT_PUBLISHED_SCENE_PACKAGE.sectors.map((sector) => ({
    sectorId: sector.id,
    entities: sectorBuckets.get(sector.id) ?? [],
  })).filter((batch) => batch.entities.length > 0)
}

export function EntityMarkers() {
  const persons = useDigitalTwinStore((state) => state.entityBuckets.persons)
  const vehicles = useDigitalTwinStore((state) => state.entityBuckets.vehicles)
  const equipment = useDigitalTwinStore((state) => state.entityBuckets.equipment)
  const entityFilters = useDigitalTwinStore((state) => state.entityFilters)
  const selectedEntityId = useDigitalTwinStore((state) => state.selectedEntityId)
  const hoveredEntityId = useDigitalTwinStore((state) => state.hoveredEntityId)

  const searchQuery = entityFilters.searchQuery.toLowerCase()
  const matchesBaseFilter = (entity: PersonEntity | VehicleEntity | EquipmentEntity) => {
    if (!entityFilters.types.includes(entity.type)) return false
    if (!entityFilters.statuses.includes(entity.status)) return false
    if (!entity.visible) return false
    if (!searchQuery) return true
    return entity.name.toLowerCase().includes(searchQuery)
  }

  const filteredPersons = useMemo(
    () => persons.filter((entity) => matchesBaseFilter(entity)),
    [persons, entityFilters, searchQuery]
  )
  const filteredVehicles = useMemo(
    () => vehicles.filter((entity) => matchesBaseFilter(entity)),
    [vehicles, entityFilters, searchQuery]
  )
  const filteredEquipment = useMemo(
    () => equipment.filter((entity) => matchesBaseFilter(entity)),
    [equipment, entityFilters, searchQuery]
  )
  const personBatches = useMemo(
    () => createSectorEntityBatches(filteredPersons),
    [filteredPersons]
  )
  const vehicleBatches = useMemo(
    () => createSectorEntityBatches(filteredVehicles),
    [filteredVehicles]
  )
  const equipmentBatches = useMemo(
    () => createSectorEntityBatches(filteredEquipment),
    [filteredEquipment]
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
    </group>
  )
}
