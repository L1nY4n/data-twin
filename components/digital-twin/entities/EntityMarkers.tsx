'use client'

import { useMemo } from 'react'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import type { PersonEntity, VehicleEntity, EquipmentEntity } from '@/lib/digital-twin/types'
import { PersonMarker } from './PersonMarker'
import { VehicleMarker } from './VehicleMarker'
import { EquipmentMarker } from './EquipmentMarker'
import { PersonInstances } from './PersonInstances'
import { VehicleInstances } from './VehicleInstances'

export function EntityMarkers() {
  const entities = useDigitalTwinStore((state) => state.entities)
  const entityFilters = useDigitalTwinStore((state) => state.entityFilters)
  const selectedEntityId = useDigitalTwinStore((state) => state.selectedEntityId)
  const hoveredEntityId = useDigitalTwinStore((state) => state.hoveredEntityId)

  const filteredEntities = useMemo(() => {
    const result: {
      persons: PersonEntity[]
      vehicles: VehicleEntity[]
      equipment: EquipmentEntity[]
    } = {
      persons: [],
      vehicles: [],
      equipment: [],
    }

    entities.forEach((entity) => {
      // 跳过区域类型（单独渲染）
      if (entity.type === 'zone') return
      
      // 应用过滤器
      if (!entityFilters.types.includes(entity.type)) return
      if (!entityFilters.statuses.includes(entity.status)) return
      if (!entity.visible) return
      
      // 搜索过滤
      if (entityFilters.searchQuery) {
        const query = entityFilters.searchQuery.toLowerCase()
        if (!entity.name.toLowerCase().includes(query)) return
      }

      // 分类
      switch (entity.type) {
        case 'person':
          result.persons.push(entity as PersonEntity)
          break
        case 'vehicle':
          result.vehicles.push(entity as VehicleEntity)
          break
        case 'equipment':
          result.equipment.push(entity as EquipmentEntity)
          break
      }
    })

    return result
  }, [entities, entityFilters])

  const shouldRenderPersonDetail = useMemo(() => {
    const detailIds = new Set<string>()
    filteredEntities.persons.forEach((person) => {
      if (
        person.id === selectedEntityId ||
        person.id === hoveredEntityId ||
        person.labelMode === 'html'
      ) {
        detailIds.add(person.id)
      }
    })
    return detailIds
  }, [filteredEntities.persons, hoveredEntityId, selectedEntityId])

  const shouldRenderVehicleDetail = useMemo(() => {
    const detailIds = new Set<string>()
    filteredEntities.vehicles.forEach((vehicle) => {
      if (
        vehicle.id === selectedEntityId ||
        vehicle.id === hoveredEntityId ||
        vehicle.labelMode === 'html'
      ) {
        detailIds.add(vehicle.id)
      }
    })
    return detailIds
  }, [filteredEntities.vehicles, hoveredEntityId, selectedEntityId])

  return (
    <group>
      <PersonInstances entities={filteredEntities.persons} />
      {filteredEntities.persons
        .filter((person) => shouldRenderPersonDetail.has(person.id))
        .map((person) => (
          <PersonMarker
            key={person.id}
            entity={person}
            isSelected={selectedEntityId === person.id}
            isHovered={hoveredEntityId === person.id}
            showModel={false}
          />
        ))}

      <VehicleInstances entities={filteredEntities.vehicles} />
      {filteredEntities.vehicles
        .filter((vehicle) => shouldRenderVehicleDetail.has(vehicle.id))
        .map((vehicle) => (
          <VehicleMarker
            key={vehicle.id}
            entity={vehicle}
            isSelected={selectedEntityId === vehicle.id}
            isHovered={hoveredEntityId === vehicle.id}
            showModel={false}
          />
        ))}

      {/* 设备标记 */}
      {filteredEntities.equipment.map((equip) => (
        <EquipmentMarker
          key={equip.id}
          entity={equip}
          isSelected={selectedEntityId === equip.id}
          isHovered={hoveredEntityId === equip.id}
        />
      ))}
    </group>
  )
}
