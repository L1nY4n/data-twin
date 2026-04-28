'use client'

import { useMemo } from 'react'
import type { PublishedSceneSector } from '@/lib/digital-twin/publish'
import { normalizeVehicleTrackLike } from '@/lib/digital-twin/vehicle-route-motion'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import type {
  CameraEntity,
  DynamicEntity,
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
import {
  DynamicEntityInstances,
  type DynamicEntityRenderItem,
} from './DynamicEntityInstances'
import { DynamicEntityMarker } from './DynamicEntityMarker'

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

function isDetailedVehicleModelType(entity: VehicleEntity) {
  return entity.vehicleType === 'truck' || entity.vehicleType === 'forklift'
}

function shouldRenderDetailedVehicleModel(entity: VehicleEntity) {
  return isDetailedVehicleModelType(entity)
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

export function createDynamicEntityBatches(
  items: DynamicEntityRenderItem[],
  sectors: PublishedSceneSector[]
): SectorEntityBatch<DynamicEntityRenderItem>[] {
  const sectorBuckets = new Map<string, DynamicEntityRenderItem[]>()
  sectors.forEach((sector) => {
    sectorBuckets.set(sector.id, [])
  })

  items.forEach((item) => {
    const sectorId = resolveNearestSectorId(item.entity.position, sectors)
    sectorBuckets.get(sectorId)?.push(item)
  })

  return sectors.map((sector) => ({
    sectorId: sector.id,
    entities: sectorBuckets.get(sector.id) ?? [],
  })).filter((batch) => batch.entities.length > 0)
}

export function EntityMarkers() {
  const persons = useDigitalTwinStore((state) => state.entityBuckets.persons)
  const vehicles = useDigitalTwinStore((state) => state.entityBuckets.vehicles)
  const equipment = useDigitalTwinStore((state) => state.entityBuckets.equipment)
  const sensors = useDigitalTwinStore((state) => state.entityBuckets.sensors)
  const cameras = useDigitalTwinStore((state) => state.entityBuckets.cameras)
  const dynamicEntities = useDigitalTwinStore((state) => state.entityBuckets.dynamic)
  const getDynamicEntityPresentation = useDigitalTwinStore(
    (state) => state.getDynamicEntityPresentation
  )
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
    filteredDynamic,
    detailPersons,
    detailedModelVehicles,
    detailVehicles,
    detailEquipment,
    detailDynamic,
    suppressedVehicleDetailIds,
    suppressedDynamicModelIds,
  } = useMemo(() => {
    const matchesBaseFilter = (
      entity:
        | PersonEntity
        | VehicleEntity
        | EquipmentEntity
        | SensorEntity
        | CameraEntity
        | DynamicEntity
    ) => {
      if (!entityFilters.types.includes(entity.type)) return false
      if (!entityFilters.statuses.includes(entity.status)) return false
      if (!entity.visible) return false
      if (!searchQuery) return true
      return entity.name.toLowerCase().includes(searchQuery)
    }

    const nextFilteredPersons: PersonEntity[] = []
    const nextFilteredVehicles: VehicleEntity[] = []
    const nextFilteredEquipment: EquipmentEntity[] = []
    const nextFilteredSensors: SensorEntity[] = []
    const nextFilteredCameras: CameraEntity[] = []
    const nextFilteredDynamic: DynamicEntityRenderItem[] = []
    const nextDetailPersons: PersonEntity[] = []
    const nextDetailedModelVehicles: VehicleEntity[] = []
    const nextDetailVehicles: VehicleEntity[] = []
    const nextDetailEquipment: EquipmentEntity[] = []
    const nextDetailDynamic: DynamicEntityRenderItem[] = []

    persons.forEach((entity) => {
      if (!matchesBaseFilter(entity)) return
      nextFilteredPersons.push(entity)
      if (
        entity.id === selectedEntityId ||
        entity.id === hoveredEntityId ||
        entity.labelMode === 'html'
      ) {
        nextDetailPersons.push(entity)
      }
    })

    vehicles.forEach((entity) => {
      if (!matchesBaseFilter(entity)) return
      nextFilteredVehicles.push(entity)

      if (shouldRenderDetailedVehicleModel(entity)) {
        nextDetailedModelVehicles.push(entity)
        return
      }

      if (
        entity.id === selectedEntityId ||
        entity.id === hoveredEntityId ||
        entity.labelMode === 'html'
      ) {
        nextDetailVehicles.push(entity)
      }
    })

    equipment.forEach((entity) => {
      if (!matchesBaseFilter(entity)) return
      nextFilteredEquipment.push(entity)
      if (
        entity.id === selectedEntityId ||
        entity.id === hoveredEntityId ||
        entity.labelMode !== 'hidden'
      ) {
        nextDetailEquipment.push(entity)
      }
    })

    sensors.forEach((entity) => {
      if (matchesBaseFilter(entity)) nextFilteredSensors.push(entity)
    })

    cameras.forEach((entity) => {
      if (matchesBaseFilter(entity)) nextFilteredCameras.push(entity)
    })

    dynamicEntities.forEach((entity) => {
      if (!matchesBaseFilter(entity)) return
      const item = {
        entity,
        presentation: getDynamicEntityPresentation(entity),
      }
      nextFilteredDynamic.push(item)

      if (
        entity.id === selectedEntityId ||
        entity.id === hoveredEntityId ||
        entity.labelMode !== 'hidden'
      ) {
        nextDetailDynamic.push(item)
      }
    })

    return {
      filteredPersons: nextFilteredPersons,
      filteredVehicles: nextFilteredVehicles,
      filteredEquipment: nextFilteredEquipment,
      filteredSensors: nextFilteredSensors,
      filteredCameras: nextFilteredCameras,
      filteredDynamic: nextFilteredDynamic,
      detailPersons: nextDetailPersons,
      detailedModelVehicles: nextDetailedModelVehicles,
      detailVehicles: nextDetailVehicles,
      detailEquipment: nextDetailEquipment,
      detailDynamic: nextDetailDynamic,
      suppressedVehicleDetailIds: new Set(nextDetailedModelVehicles.map((entity) => entity.id)),
      suppressedDynamicModelIds: new Set(
        nextDetailDynamic
          .filter(
            ({ entity, presentation }) =>
              !!presentation.modelAsset &&
              (entity.id === selectedEntityId || entity.id === hoveredEntityId)
          )
          .map(({ entity }) => entity.id)
      ),
    }
  }, [
    persons,
    vehicles,
    equipment,
    sensors,
    cameras,
    dynamicEntities,
    entityFilters,
    getDynamicEntityPresentation,
    hoveredEntityId,
    searchQuery,
    selectedEntityId,
  ])
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
  const dynamicBatches = useMemo(
    () => createDynamicEntityBatches(filteredDynamic, publishedSectors),
    [filteredDynamic, publishedSectors]
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
        <VehicleInstances
          key={`vehicle-${batch.sectorId}`}
          entities={batch.entities}
          suppressedEntityIds={suppressedVehicleDetailIds}
        />
      ))}
      {detailedModelVehicles.map((vehicle) => (
        <VehicleMarker
          key={vehicle.id}
          entity={vehicle}
          isSelected={selectedEntityId === vehicle.id}
          isHovered={hoveredEntityId === vehicle.id}
          showModel
        />
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

      {dynamicBatches.map((batch) => (
        <DynamicEntityInstances
          key={`dynamic-${batch.sectorId}`}
          items={batch.entities}
          selectedEntityId={selectedEntityId}
          hoveredEntityId={hoveredEntityId}
          suppressedEntityIds={suppressedDynamicModelIds}
        />
      ))}
      {detailDynamic.map(({ entity, presentation }) => {
        const isSelected = selectedEntityId === entity.id
        const isHovered = hoveredEntityId === entity.id
        const shouldShowFocusedModel = !!presentation.modelAsset && (isSelected || isHovered)

        return (
          <DynamicEntityMarker
            key={entity.id}
            entity={entity}
            presentation={presentation}
            isSelected={isSelected}
            isHovered={isHovered}
            showModel={shouldShowFocusedModel}
            showBaseProxy={false}
            showStatusRing={isSelected || shouldShowFocusedModel}
          />
        )
      })}
    </group>
  )
}
