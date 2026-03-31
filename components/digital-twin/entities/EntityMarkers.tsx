'use client'

import { useMemo } from 'react'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import type { PersonEntity, VehicleEntity, EquipmentEntity } from '@/lib/digital-twin/types'
import { PersonMarker } from './PersonMarker'
import { VehicleMarker } from './VehicleMarker'
import { EquipmentMarker } from './EquipmentMarker'

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

  return (
    <group>
      {/* 人员标记 */}
      {filteredEntities.persons.map((person) => (
        <PersonMarker
          key={person.id}
          entity={person}
          isSelected={selectedEntityId === person.id}
          isHovered={hoveredEntityId === person.id}
        />
      ))}

      {/* 车辆标记 */}
      {filteredEntities.vehicles.map((vehicle) => (
        <VehicleMarker
          key={vehicle.id}
          entity={vehicle}
          isSelected={selectedEntityId === vehicle.id}
          isHovered={hoveredEntityId === vehicle.id}
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
