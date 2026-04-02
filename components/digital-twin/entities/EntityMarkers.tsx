'use client'

import { useMemo } from 'react'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import type { PersonEntity, VehicleEntity, EquipmentEntity } from '@/lib/digital-twin/types'
import { PersonMarker } from './PersonMarker'
import { VehicleMarker } from './VehicleMarker'
import { EquipmentMarker } from './EquipmentMarker'
import { PersonInstances } from './PersonInstances'
import { VehicleInstances } from './VehicleInstances'
import { EquipmentInstances } from './EquipmentInstances'

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
      <PersonInstances entities={filteredPersons} />
      {detailPersons.map((person) => (
          <PersonMarker
            key={person.id}
            entity={person}
            isSelected={selectedEntityId === person.id}
            isHovered={hoveredEntityId === person.id}
            showModel={false}
          />
        ))}

      <VehicleInstances entities={filteredVehicles} />
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
      <EquipmentInstances
        entities={filteredEquipment}
        selectedEntityId={selectedEntityId}
        hoveredEntityId={hoveredEntityId}
      />
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
