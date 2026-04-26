'use client'

import { useMemo } from 'react'
import { CameraMarker } from '@/components/digital-twin/entities/CameraMarker'
import { EquipmentMarker } from '@/components/digital-twin/entities/EquipmentMarker'
import { PersonMarker } from '@/components/digital-twin/entities/PersonMarker'
import { SensorMarker } from '@/components/digital-twin/entities/SensorMarker'
import { VehicleMarker } from '@/components/digital-twin/entities/VehicleMarker'
import { useEditorPreviewStore } from '@/lib/digital-twin/editor-preview-store'
import type { Entity } from '@/lib/digital-twin/types'
import {
  isEditorEntityEditable,
  useEditorSceneStore,
  useEditorUiStore,
  useEditorViewerStore,
} from '@/lib/digital-twin/editor-store'

function renderEditorEntityNode(
  entity: Entity,
  isSelected: boolean,
  isHovered: boolean
) {
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
}

function buildRenderedEntities(
  entities: Map<string, Entity>,
  draftEntity: Entity | null
) {
  const rendered = [...entities.values()].filter(
    (entity) => entity.visible && isEditorEntityEditable(entity)
  )

  if (draftEntity) {
    const existingIndex = rendered.findIndex((entity) => entity.id === draftEntity.id)
    if (existingIndex >= 0) {
      rendered[existingIndex] = draftEntity
    } else if (draftEntity.visible && isEditorEntityEditable(draftEntity)) {
      rendered.push(draftEntity)
    }
  }

  return rendered.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
}

export function EditorEntityLayer() {
  const entities = useEditorSceneStore((state) => state.entities)
  const draftEntity = useEditorSceneStore((state) => state.draftEntity)
  const selectedEntityId = useEditorViewerStore((state) => state.selectedEntityId)
  const hoveredEntityId = useEditorViewerStore((state) => state.hoveredEntityId)
  const isTransformDragging = useEditorUiStore((state) => state.isTransformDragging)
  const transformPreview = useEditorPreviewStore((state) => state.transformPreview)

  const editableEntities = useMemo(
    () => buildRenderedEntities(entities, draftEntity),
    [draftEntity, entities]
  )

  const previewEntity = useMemo(() => {
    if (
      !draftEntity ||
      !isTransformDragging ||
      !transformPreview ||
      selectedEntityId !== draftEntity.id
    ) {
      return null
    }

    return {
      ...draftEntity,
      position: transformPreview.position,
      rotation: transformPreview.rotation,
      scale: transformPreview.scale,
    }
  }, [draftEntity, isTransformDragging, selectedEntityId, transformPreview])

  return (
    <group name="editor-entities">
      {editableEntities.map((entity) => {
        if (previewEntity && entity.id === previewEntity.id) {
          return null
        }

        return renderEditorEntityNode(
          entity,
          selectedEntityId === entity.id,
          hoveredEntityId === entity.id
        )
      })}
      {previewEntity
        ? renderEditorEntityNode(
            previewEntity,
            true,
            hoveredEntityId === previewEntity.id
          )
        : null}
    </group>
  )
}
