'use client'

import { useMemo } from 'react'
import { CameraMarker } from '@/components/digital-twin/entities/CameraMarker'
import { EquipmentMarker } from '@/components/digital-twin/entities/EquipmentMarker'
import { PersonMarker } from '@/components/digital-twin/entities/PersonMarker'
import { SensorMarker } from '@/components/digital-twin/entities/SensorMarker'
import { VehicleMarker } from '@/components/digital-twin/entities/VehicleMarker'
import {
  isEditorEntityEditable,
  useEditorDigitalTwinStore,
} from '@/lib/digital-twin/editor-store'

export function EditorEntityLayer() {
  const entities = useEditorDigitalTwinStore((state) => state.entities)
  const draftEntity = useEditorDigitalTwinStore((state) => state.draftEntity)
  const selectedEntityId = useEditorDigitalTwinStore((state) => state.selectedEntityId)
  const hoveredEntityId = useEditorDigitalTwinStore((state) => state.hoveredEntityId)

  const editableEntities = useMemo(() => {
    return [...entities.values()]
      .filter((entity) => entity.visible && isEditorEntityEditable(entity))
      .map((entity) =>
        selectedEntityId === entity.id && draftEntity ? draftEntity : entity
      )
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  }, [draftEntity, entities, selectedEntityId])

  return (
    <group name="editor-entities">
      {editableEntities.map((entity) => {
        const isSelected = selectedEntityId === entity.id
        const isHovered = hoveredEntityId === entity.id

        switch (entity.type) {
          case 'person':
            return (
              <PersonMarker
                key={entity.id}
                entity={entity}
                isSelected={isSelected}
                isHovered={isHovered}
              />
            )
          case 'vehicle':
            return (
              <VehicleMarker
                key={entity.id}
                entity={entity}
                isSelected={isSelected}
                isHovered={isHovered}
              />
            )
          case 'equipment':
            return (
              <EquipmentMarker
                key={entity.id}
                entity={entity}
                isSelected={isSelected}
                isHovered={isHovered}
              />
            )
          case 'sensor':
            return (
              <SensorMarker
                key={entity.id}
                entity={entity}
                isSelected={isSelected}
                isHovered={isHovered}
              />
            )
          case 'camera':
            return (
              <CameraMarker
                key={entity.id}
                entity={entity}
                isSelected={isSelected}
                isHovered={isHovered}
              />
            )
        }
      })}
    </group>
  )
}
