'use client'

import { useMemo } from 'react'
import { CameraMarker } from '@/components/digital-twin/entities/CameraMarker'
import { EquipmentMarker } from '@/components/digital-twin/entities/EquipmentMarker'
import { PersonMarker } from '@/components/digital-twin/entities/PersonMarker'
import { SensorMarker } from '@/components/digital-twin/entities/SensorMarker'
import { VehicleMarker } from '@/components/digital-twin/entities/VehicleMarker'
import {
  isEditorEntityEditable,
  useEditorSceneStore,
  useEditorUiStore,
  useEditorViewerStore,
} from '@/lib/digital-twin/editor-store'

export function EditorEntityLayer() {
  const entities = useEditorSceneStore((state) => state.entities)
  const draftEntity = useEditorSceneStore((state) => state.draftEntity)
  const transformPreview = useEditorUiStore((state) => state.transformPreview)
  const isTransformDragging = useEditorUiStore((state) => state.isTransformDragging)
  const selectedEntityId = useEditorViewerStore((state) => state.selectedEntityId)
  const hoveredEntityId = useEditorViewerStore((state) => state.hoveredEntityId)

  const editableEntities = useMemo(() => {
    return [...entities.values()]
      .filter((entity) => entity.visible && isEditorEntityEditable(entity))
      .map((entity) => {
        if (selectedEntityId !== entity.id || !draftEntity) return entity
        if (!isTransformDragging || !transformPreview) return draftEntity

        return {
          ...draftEntity,
          position: transformPreview.position,
          rotation: transformPreview.rotation,
          scale: transformPreview.scale,
        }
      })
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  }, [draftEntity, entities, isTransformDragging, selectedEntityId, transformPreview])

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
                fullTransform
                isSelected={isSelected}
                isHovered={isHovered}
              />
            )
          case 'vehicle':
            return (
              <VehicleMarker
                key={entity.id}
                entity={entity}
                fullTransform
                isSelected={isSelected}
                isHovered={isHovered}
              />
            )
          case 'equipment':
            return (
              <EquipmentMarker
                key={entity.id}
                entity={entity}
                fullTransform
                isSelected={isSelected}
                isHovered={isHovered}
              />
            )
          case 'sensor':
            return (
              <SensorMarker
                key={entity.id}
                entity={entity}
                fullTransform
                isSelected={isSelected}
                isHovered={isHovered}
              />
            )
          case 'camera':
            return (
              <CameraMarker
                key={entity.id}
                entity={entity}
                fullTransform
                isSelected={isSelected}
                isHovered={isHovered}
              />
            )
        }
      })}
    </group>
  )
}
