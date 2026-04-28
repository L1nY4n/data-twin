import {
  formatRepeatedEquipmentName,
  generateEquipment,
  generatePerson,
  generateVehicle,
  generateZone,
} from '../mock-data'
import type {
  EquipmentEntity,
  PersonEntity,
  VehicleEntity,
  Vector3,
  ZoneEntity,
} from '../types'
import type {
  PublishedSceneBounds,
  HydratedPublishedScene,
  PublishedEquipmentLayer,
  PublishedPersonLayer,
  PublishedSceneProfile,
  PublishedScenePackage,
  PublishedSpawnAnchor,
  PublishedVehicleLayer,
} from './types'

const DEFAULT_EMPTY_SPREAD = { x: 0, z: 0 } as const

type HydratableLayer = PublishedPersonLayer | PublishedVehicleLayer | PublishedEquipmentLayer

function randomRange(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function randomChoice<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function randomPositionAround(
  anchor: PublishedSpawnAnchor['position'],
  spread: PublishedSpawnAnchor['spread']
) {
  return {
    x: anchor.x + randomRange(-spread.x, spread.x),
    y: anchor.y,
    z: anchor.z + randomRange(-spread.z, spread.z),
  }
}

function respectsMinimumDistance(
  position: Vector3,
  existingPositions: Vector3[],
  minDistance: number
) {
  return existingPositions.every(
    (existing) => Math.hypot(position.x - existing.x, position.z - existing.z) >= minDistance
  )
}

function distanceToClosestPosition(position: Vector3, existingPositions: Vector3[]) {
  return existingPositions.reduce(
    (closest, existing) =>
      Math.min(closest, Math.hypot(position.x - existing.x, position.z - existing.z)),
    Number.POSITIVE_INFINITY
  )
}

function clampToBounds(position: Vector3, bounds: PublishedSceneBounds): Vector3 {
  return {
    x: Math.max(bounds.min.x, Math.min(bounds.max.x, position.x)),
    y: position.y,
    z: Math.max(bounds.min.z, Math.min(bounds.max.z, position.z)),
  }
}

function resolveSeparatedPosition(
  position: Vector3,
  existingPositions: Vector3[],
  minDistance: number,
  bounds: PublishedSceneBounds
): Vector3 | null {
  let next = clampToBounds(position, bounds)

  for (let pass = 0; pass < 32; pass += 1) {
    let moved = false

    for (const existing of existingPositions) {
      const dx = next.x - existing.x
      const dz = next.z - existing.z
      const distance = Math.hypot(dx, dz)
      if (distance >= minDistance) continue

      const angle = distance > 1e-4 ? Math.atan2(dz, dx) : pass * 2.399963229728653
      const push = minDistance - distance + 0.08
      next = clampToBounds(
        {
          x: next.x + Math.cos(angle) * push,
          y: next.y,
          z: next.z + Math.sin(angle) * push,
        },
        bounds
      )
      moved = true
    }

    if (respectsMinimumDistance(next, existingPositions, minDistance)) {
      return next
    }
    if (!moved) break
  }

  return null
}

function distributeCounts(total: number, weights: number[]) {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0)
  if (weightSum <= 0) return weights.map(() => 0)

  const provisional = weights.map((weight, index) => ({
    index,
    exact: (total * weight) / weightSum,
  }))
  const counts = provisional.map((item) => Math.floor(item.exact))
  let assigned = counts.reduce((sum, count) => sum + count, 0)

  provisional
    .sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)))
    .forEach((item) => {
      if (assigned >= total) return
      counts[item.index] += 1
      assigned += 1
    })

  return counts
}

function getProfileCount(
  pkg: PublishedScenePackage,
  profile: PublishedSceneProfile,
  entityType: 'person' | 'vehicle' | 'equipment'
) {
  if (entityType === 'person') return pkg.entityCounts[profile].persons
  if (entityType === 'vehicle') return pkg.entityCounts[profile].vehicles
  return pkg.entityCounts[profile].equipment
}

function getBoundsCenter(bounds: PublishedSceneBounds): Vector3 {
  return {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  }
}

function fallbackAnchor(bounds: PublishedSceneBounds): PublishedSpawnAnchor {
  return {
    position: getBoundsCenter(bounds),
    spread: DEFAULT_EMPTY_SPREAD,
  }
}

function getLayerWeight(layer: HydratableLayer) {
  if (layer.entityType === 'person') return layer.anchors.length
  if (layer.entityType === 'vehicle') {
    return Object.values(layer.anchorsByType).reduce((sum, anchors) => sum + anchors.length, 0)
  }
  return layer.placements.length
}

function resolveLayerCounts<TLayer extends HydratableLayer>(layers: TLayer[], targetTotal: number) {
  return distributeCounts(
    targetTotal,
    layers.map((layer) => getLayerWeight(layer))
  )
}

function hydratePersons(layer: PublishedPersonLayer, count: number): PersonEntity[] {
  if (count <= 0) return []

  const anchors = layer.anchors.length > 0 ? layer.anchors : [fallbackAnchor(layer.bounds)]
  const persons: PersonEntity[] = []
  for (let index = 0; index < count; index += 1) {
    const anchor = randomChoice(anchors)
    persons.push(
      generatePerson({
        position: randomPositionAround(anchor.position, anchor.spread),
      })
    )
  }
  return persons
}

function createVehicleCandidate(layer: PublishedVehicleLayer): VehicleEntity {
  const vehicleTypes = Object.entries(layer.anchorsByType).filter(([, anchors]) => anchors.length > 0)

  if (vehicleTypes.length === 0) {
    return generateVehicle({
      vehicleType: 'other',
      position: getBoundsCenter(layer.bounds),
    })
  }

  const [vehicleType, anchors] = randomChoice(vehicleTypes) as [
    VehicleEntity['vehicleType'],
    PublishedSpawnAnchor[],
  ]
  const anchor = randomChoice(anchors)

  return generateVehicle({
    vehicleType,
    position: randomPositionAround(anchor.position, anchor.spread),
  })
}

function hydrateVehicles(layer: PublishedVehicleLayer, count: number): VehicleEntity[] {
  if (count <= 0) return []

  const vehicles: VehicleEntity[] = []

  for (let index = 0; index < count; index += 1) {
    const existingPositions = vehicles.map((vehicle) => vehicle.position)
    let bestCandidate = createVehicleCandidate(layer)
    let bestDistance = distanceToClosestPosition(bestCandidate.position, existingPositions)

    if (!Number.isFinite(bestDistance)) {
      vehicles.push(bestCandidate)
      continue
    }

    for (let attempt = 0; attempt < 160; attempt += 1) {
      const candidate = attempt === 0 ? bestCandidate : createVehicleCandidate(layer)
      if (respectsMinimumDistance(candidate.position, existingPositions, layer.minimumSeparation)) {
        bestCandidate = candidate
        break
      }

      const candidateDistance = distanceToClosestPosition(candidate.position, existingPositions)
      if (candidateDistance > bestDistance) {
        bestCandidate = candidate
        bestDistance = candidateDistance
      }
    }

    if (!respectsMinimumDistance(bestCandidate.position, existingPositions, layer.minimumSeparation)) {
      const separatedPosition = resolveSeparatedPosition(
        bestCandidate.position,
        existingPositions,
        layer.minimumSeparation,
        layer.bounds
      )
      if (separatedPosition) {
        bestCandidate = generateVehicle({
          vehicleType: bestCandidate.vehicleType,
          position: separatedPosition,
        })
      }
    }

    vehicles.push(bestCandidate)
  }

  return vehicles
}

function hydrateEquipment(layer: PublishedEquipmentLayer, count: number): EquipmentEntity[] {
  if (count <= 0) return []

  const placements =
    layer.placements.length > 0
      ? layer.placements
      : [
          {
            name: `${layer.sectorId}-equipment`,
            position: getBoundsCenter(layer.bounds),
            repeatable: true,
            spread: DEFAULT_EMPTY_SPREAD,
          },
        ]
  const equipment: EquipmentEntity[] = []
  const repeatablePlacements = placements.filter((placement) => placement.repeatable)
  const scalablePlacements =
    repeatablePlacements.length > 0 ? repeatablePlacements : placements

  for (let index = 0; index < count; index += 1) {
    const placementPool = index < placements.length ? placements : scalablePlacements
    const placementIndex =
      index < placements.length
        ? index
        : (index - placements.length) % placementPool.length
    const placement = placementPool[placementIndex]
    const repeatRound =
      index < placements.length
        ? 0
        : Math.floor((index - placements.length) / placementPool.length) + 1

    equipment.push(
      generateEquipment({
        position: randomPositionAround(placement.position, placement.spread),
        name: formatRepeatedEquipmentName(placement.name, repeatRound + 1),
      })
    )
  }

  return equipment
}

function hydrateZones(pkg: PublishedScenePackage): ZoneEntity[] {
  const zoneLayers = pkg.zoneOverlays.length > 0 ? pkg.zoneOverlays : pkg.interactionLayers
  return zoneLayers.flatMap((layer) =>
    layer.zones.map((zone) =>
      generateZone(zone.center, zone.size, {
        name: zone.name,
        zoneType: zone.zoneType,
        color: zone.color,
      })
    )
  )
}

export function hydratePublishedScenePackage(
  pkg: PublishedScenePackage,
  options: { profile?: PublishedSceneProfile } = {}
): HydratedPublishedScene {
  const profile = options.profile ?? pkg.profile
  const personLayers = pkg.dynamicLayers.filter(
    (layer): layer is PublishedPersonLayer => layer.entityType === 'person'
  )
  const vehicleLayers = pkg.dynamicLayers.filter(
    (layer): layer is PublishedVehicleLayer => layer.entityType === 'vehicle'
  )
  const equipmentLayers = pkg.dynamicLayers.filter(
    (layer): layer is PublishedEquipmentLayer => layer.entityType === 'equipment'
  )
  const personCounts = resolveLayerCounts(personLayers, getProfileCount(pkg, profile, 'person'))
  const vehicleCounts = resolveLayerCounts(vehicleLayers, getProfileCount(pkg, profile, 'vehicle'))
  const equipmentCounts = resolveLayerCounts(
    equipmentLayers,
    getProfileCount(pkg, profile, 'equipment')
  )
  const persons = personLayers.flatMap((layer, index) => hydratePersons(layer, personCounts[index] ?? 0))
  const vehicles = vehicleLayers.flatMap((layer, index) =>
    hydrateVehicles(layer, vehicleCounts[index] ?? 0)
  )
  const equipment = equipmentLayers.flatMap((layer, index) =>
    hydrateEquipment(layer, equipmentCounts[index] ?? 0)
  )
  const zones = hydrateZones(pkg)

  return {
    persons,
    vehicles,
    equipment,
    zones,
  }
}
