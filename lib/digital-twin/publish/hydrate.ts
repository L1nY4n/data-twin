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
import {
  CAMPUS_LAYOUT_BLUEPRINTS,
  CAMPUS_SECTORS,
  VEHICLE_LANE_RECTS,
  type LaneRect,
} from '../campus-layout'
import {
  getVehicleFootprintRadius,
  getVehicleSeparationDistance,
} from '../vehicle-footprint'

const DEFAULT_EMPTY_SPREAD = { x: 0, z: 0 } as const
const VEHICLE_SPAWN_RELAXATION_BUFFER = 0.12
const VEHICLE_LANE_SAMPLE_STEP = 2.5

type HydratableLayer = PublishedPersonLayer | PublishedVehicleLayer | PublishedEquipmentLayer
type VehicleSpawnPlacement = Pick<VehicleEntity, 'position' | 'vehicleType'>

interface VehicleBlockingFootprint {
  id: string
  center: Vector3
  width: number
  depth: number
}

interface VehiclePlacementRules {
  lanes: LaneRect[]
  blockers: VehicleBlockingFootprint[]
}

const VEHICLE_ROUTE_METADATA_KEYS = [
  'moveTarget',
  'routeDirect',
  'routeGoal',
  'routeIndex',
  'routeLoop',
  'routeLoopIndex',
  'routePoints',
  'blockedTicks',
  'forceRandomGoal',
  'laneId',
] as const

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

function clampToBounds(position: Vector3, bounds: PublishedSceneBounds): Vector3 {
  return {
    x: Math.max(bounds.min.x, Math.min(bounds.max.x, position.x)),
    y: position.y,
    z: Math.max(bounds.min.z, Math.min(bounds.max.z, position.z)),
  }
}

const CAMPUS_VEHICLE_BLOCKING_FOOTPRINTS: VehicleBlockingFootprint[] = CAMPUS_SECTORS.flatMap(
  (sector) =>
    CAMPUS_LAYOUT_BLUEPRINTS.filter((blueprint) => blueprint.blocksVehicle).map((blueprint) => ({
      id: `${sector.id}:${blueprint.id}`,
      center: {
        x: blueprint.center.x + sector.offset.x,
        y: blueprint.center.y + sector.offset.y,
        z: blueprint.center.z + sector.offset.z,
      },
      width: blueprint.width,
      depth: blueprint.depth,
    }))
)

function buildCampusVehiclePlacementRules(pkg: PublishedScenePackage): VehiclePlacementRules | null {
  const hasCampusVehicleRouting = pkg.routingLayers.some(
    (layer) => layer.mobilityType === 'vehicle' && layer.scope === 'campus'
  )
  if (!hasCampusVehicleRouting) return null

  return {
    lanes: VEHICLE_LANE_RECTS,
    blockers: CAMPUS_VEHICLE_BLOCKING_FOOTPRINTS,
  }
}

function pointInsideLane(position: Vector3, lane: LaneRect) {
  return (
    position.x >= lane.minX &&
    position.x <= lane.maxX &&
    position.z >= lane.minZ &&
    position.z <= lane.maxZ
  )
}

function laneIntersectsBounds(lane: LaneRect, bounds: PublishedSceneBounds) {
  return !(
    lane.maxX < bounds.min.x ||
    bounds.max.x < lane.minX ||
    lane.maxZ < bounds.min.z ||
    bounds.max.z < lane.minZ
  )
}

function clipLaneToBounds(lane: LaneRect, bounds: PublishedSceneBounds): LaneRect | null {
  if (!laneIntersectsBounds(lane, bounds)) return null

  const clipped = {
    minX: Math.max(lane.minX, bounds.min.x),
    maxX: Math.min(lane.maxX, bounds.max.x),
    minZ: Math.max(lane.minZ, bounds.min.z),
    maxZ: Math.min(lane.maxZ, bounds.max.z),
  }

  return clipped.minX <= clipped.maxX && clipped.minZ <= clipped.maxZ ? clipped : null
}

function circleIntersectsBlockingFootprint(
  position: Vector3,
  radius: number,
  footprint: VehicleBlockingFootprint
) {
  const dx = Math.max(Math.abs(position.x - footprint.center.x) - footprint.width / 2, 0)
  const dz = Math.max(Math.abs(position.z - footprint.center.z) - footprint.depth / 2, 0)
  return dx * dx + dz * dz < radius * radius
}

function isValidVehicleSpawnPlacement(
  candidate: VehicleSpawnPlacement,
  rules: VehiclePlacementRules | null
) {
  if (!rules) return true

  const radius = getVehicleFootprintRadius(candidate.vehicleType)
  return (
    rules.lanes.some((lane) => pointInsideLane(candidate.position, lane)) &&
    !rules.blockers.some((blocker) =>
      circleIntersectsBlockingFootprint(candidate.position, radius, blocker)
    )
  )
}

function pushUniqueLaneSample(samples: Vector3[], seen: Set<string>, position: Vector3) {
  const key = `${position.x.toFixed(2)}:${position.z.toFixed(2)}`
  if (seen.has(key)) return
  seen.add(key)
  samples.push(position)
}

function createAxisSamples(min: number, max: number, preferred: number) {
  const samples: number[] = []
  const push = (value: number) => {
    const clamped = Math.max(min, Math.min(max, value))
    if (!samples.some((sample) => Math.abs(sample - clamped) < 0.05)) {
      samples.push(clamped)
    }
  }

  push(preferred)
  push((min + max) / 2)
  push(min)
  push(max)

  for (let value = min; value <= max; value += VEHICLE_LANE_SAMPLE_STEP) {
    push(value)
  }
  push(max)

  return samples
}

function createLegalVehicleLaneSamples(
  candidate: VehicleSpawnPlacement,
  bounds: PublishedSceneBounds,
  rules: VehiclePlacementRules
) {
  const samples: Vector3[] = []
  const seen = new Set<string>()
  const preferred = clampToBounds(candidate.position, bounds)

  for (const lane of rules.lanes) {
    const clippedLane = clipLaneToBounds(lane, bounds)
    if (!clippedLane) continue

    const xSamples = createAxisSamples(clippedLane.minX, clippedLane.maxX, preferred.x)
    const zSamples = createAxisSamples(clippedLane.minZ, clippedLane.maxZ, preferred.z)
    const laneWidth = clippedLane.maxX - clippedLane.minX
    const laneDepth = clippedLane.maxZ - clippedLane.minZ

    if (laneWidth >= laneDepth) {
      for (const x of xSamples) {
        for (const z of zSamples.slice(0, 4)) {
          pushUniqueLaneSample(samples, seen, { x, y: preferred.y, z })
        }
      }
    } else {
      for (const z of zSamples) {
        for (const x of xSamples.slice(0, 4)) {
          pushUniqueLaneSample(samples, seen, { x, y: preferred.y, z })
        }
      }
    }
  }

  return samples.sort(
    (a, b) =>
      Math.hypot(a.x - candidate.position.x, a.z - candidate.position.z) -
      Math.hypot(b.x - candidate.position.x, b.z - candidate.position.z)
  )
}

function resolveNearestLegalVehiclePosition(
  candidate: VehicleSpawnPlacement,
  bounds: PublishedSceneBounds,
  rules: VehiclePlacementRules
) {
  return (
    createLegalVehicleLaneSamples(candidate, bounds, rules).find((position) =>
      isValidVehicleSpawnPlacement({ position, vehicleType: candidate.vehicleType }, rules)
    ) ?? null
  )
}

function getVehicleSpawnSeparation(
  vehicleType: VehicleEntity['vehicleType'],
  neighborVehicleType: VehicleEntity['vehicleType'],
  layerMinimumSeparation: number
) {
  return Math.max(
    layerMinimumSeparation,
    getVehicleSeparationDistance(vehicleType, neighborVehicleType)
  )
}

function getVehiclePlacementMargin(
  candidate: VehicleSpawnPlacement,
  existingPlacements: VehicleSpawnPlacement[],
  layerMinimumSeparation: number
) {
  return existingPlacements.reduce((closest, existing) => {
    const requiredDistance = getVehicleSpawnSeparation(
      candidate.vehicleType,
      existing.vehicleType,
      layerMinimumSeparation
    )
    const distance = Math.hypot(
      candidate.position.x - existing.position.x,
      candidate.position.z - existing.position.z
    )
    return Math.min(closest, distance - requiredDistance)
  }, Number.POSITIVE_INFINITY)
}

function respectsVehicleMinimumDistance(
  candidate: VehicleSpawnPlacement,
  existingPlacements: VehicleSpawnPlacement[],
  layerMinimumSeparation: number,
  rules: VehiclePlacementRules | null = null
) {
  return (
    isValidVehicleSpawnPlacement(candidate, rules) &&
    getVehiclePlacementMargin(candidate, existingPlacements, layerMinimumSeparation) >= 0
  )
}

function resolveSeparatedVehiclePosition(
  candidate: VehicleSpawnPlacement,
  existingPlacements: VehicleSpawnPlacement[],
  layerMinimumSeparation: number,
  bounds: PublishedSceneBounds,
  rules: VehiclePlacementRules | null = null
): Vector3 | null {
  if (rules) {
    let bestPosition: Vector3 | null = null
    let bestMargin = Number.NEGATIVE_INFINITY

    for (const position of createLegalVehicleLaneSamples(candidate, bounds, rules)) {
      const placement = { position, vehicleType: candidate.vehicleType }
      if (!isValidVehicleSpawnPlacement(placement, rules)) continue

      const margin = getVehiclePlacementMargin(placement, existingPlacements, layerMinimumSeparation)

      if (margin >= 0) return position
      if (margin > bestMargin) {
        bestMargin = margin
        bestPosition = position
      }
    }

    return bestPosition
  }

  let next = clampToBounds(candidate.position, bounds)

  for (let pass = 0; pass < 32; pass += 1) {
    let moved = false

    for (const existing of existingPlacements) {
      const requiredDistance = getVehicleSpawnSeparation(
        candidate.vehicleType,
        existing.vehicleType,
        layerMinimumSeparation
      )
      const dx = next.x - existing.position.x
      const dz = next.z - existing.position.z
      const distance = Math.hypot(dx, dz)
      if (distance >= requiredDistance) continue

      const angle = distance > 1e-4 ? Math.atan2(dz, dx) : pass * 2.399963229728653
      const push = requiredDistance - distance + VEHICLE_SPAWN_RELAXATION_BUFFER
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

    if (
      respectsVehicleMinimumDistance(
        { position: next, vehicleType: candidate.vehicleType },
        existingPlacements,
        layerMinimumSeparation,
        rules
      )
    ) {
      return next
    }
    if (!moved) break
  }

  return null
}

function rebuildVehicleAtSpawnPosition(vehicle: VehicleEntity, position: Vector3): VehicleEntity {
  const metadata = { ...vehicle.metadata }
  VEHICLE_ROUTE_METADATA_KEYS.forEach((key) => {
    delete metadata[key]
  })
  const regenerated = generateVehicle({
    vehicleType: vehicle.vehicleType,
    position,
    status: vehicle.status,
    visible: vehicle.visible,
    speed: vehicle.speed,
    capacity: vehicle.capacity,
    currentLoad: vehicle.currentLoad,
    labelMode: vehicle.labelMode,
    metadata,
  })

  return {
    ...regenerated,
    id: vehicle.id,
    name: vehicle.name,
    plateNumber: vehicle.plateNumber,
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt,
  }
}

function relaxVehiclePlacements(
  vehicles: VehicleEntity[],
  bounds: PublishedSceneBounds,
  layerMinimumSeparation: number,
  rules: VehiclePlacementRules | null = null
) {
  if (vehicles.length === 0) return vehicles

  if (rules) {
    const acceptedPlacements: VehicleSpawnPlacement[] = []
    return vehicles.map((vehicle) => {
      const candidate = {
        position: vehicle.position,
        vehicleType: vehicle.vehicleType,
      }
      const resolvedPosition = respectsVehicleMinimumDistance(
        candidate,
        acceptedPlacements,
        layerMinimumSeparation,
        rules
      )
        ? vehicle.position
        : resolveSeparatedVehiclePosition(candidate, acceptedPlacements, layerMinimumSeparation, bounds, rules)

      const position =
        resolvedPosition ??
        resolveNearestLegalVehiclePosition(candidate, bounds, rules) ??
        vehicle.position
      acceptedPlacements.push({ position, vehicleType: vehicle.vehicleType })

      return position === vehicle.position ? vehicle : rebuildVehicleAtSpawnPosition(vehicle, position)
    })
  }

  if (vehicles.length < 2) return vehicles

  const positions = vehicles.map((vehicle) => clampToBounds(vehicle.position, bounds))
  const movedIndices = new Set<number>()

  for (let pass = 0; pass < 16; pass += 1) {
    let moved = false

    for (let i = 0; i < vehicles.length; i += 1) {
      for (let j = i + 1; j < vehicles.length; j += 1) {
        const requiredDistance = getVehicleSpawnSeparation(
          vehicles[i].vehicleType,
          vehicles[j].vehicleType,
          layerMinimumSeparation
        )
        const dx = positions[i].x - positions[j].x
        const dz = positions[i].z - positions[j].z
        const distance = Math.hypot(dx, dz)
        const targetDistance = requiredDistance + VEHICLE_SPAWN_RELAXATION_BUFFER
        if (distance >= targetDistance) continue

        const fallbackAngle =
          (((i + 1) * 131 + (j + 1) * 17 + pass * 53) % 360) * (Math.PI / 180)
        const angle = distance > 1e-4 ? Math.atan2(dz, dx) : fallbackAngle
        const push = (targetDistance - distance) / 2
        positions[i] = clampToBounds(
          {
            x: positions[i].x + Math.cos(angle) * push,
            y: positions[i].y,
            z: positions[i].z + Math.sin(angle) * push,
          },
          bounds
        )
        positions[j] = clampToBounds(
          {
            x: positions[j].x - Math.cos(angle) * push,
            y: positions[j].y,
            z: positions[j].z - Math.sin(angle) * push,
          },
          bounds
        )
        movedIndices.add(i)
        movedIndices.add(j)
        moved = true
      }
    }

    if (!moved) break
  }

  if (movedIndices.size === 0) return vehicles
  return vehicles.map((vehicle, index) =>
    movedIndices.has(index) ? rebuildVehicleAtSpawnPosition(vehicle, positions[index]) : vehicle
  )
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

function hydrateVehicles(
  layer: PublishedVehicleLayer,
  count: number,
  rules: VehiclePlacementRules | null
): VehicleEntity[] {
  if (count <= 0) return []

  const vehicles: VehicleEntity[] = []

  for (let index = 0; index < count; index += 1) {
    const existingPlacements = vehicles.map((vehicle) => ({
      position: vehicle.position,
      vehicleType: vehicle.vehicleType,
    }))
    let bestCandidate = createVehicleCandidate(layer)
    let bestMargin = getVehiclePlacementMargin(bestCandidate, existingPlacements, layer.minimumSeparation)

    if (!Number.isFinite(bestMargin) && isValidVehicleSpawnPlacement(bestCandidate, rules)) {
      vehicles.push(bestCandidate)
      continue
    }

    for (let attempt = 0; attempt < 160; attempt += 1) {
      const candidate = attempt === 0 ? bestCandidate : createVehicleCandidate(layer)
      if (respectsVehicleMinimumDistance(candidate, existingPlacements, layer.minimumSeparation, rules)) {
        bestCandidate = candidate
        break
      }

      const candidateMargin = getVehiclePlacementMargin(candidate, existingPlacements, layer.minimumSeparation)
      const candidateIsLegal = isValidVehicleSpawnPlacement(candidate, rules)
      const bestCandidateIsLegal = isValidVehicleSpawnPlacement(bestCandidate, rules)
      if (
        (candidateIsLegal && (!bestCandidateIsLegal || candidateMargin > bestMargin)) ||
        (!bestCandidateIsLegal && candidateMargin > bestMargin)
      ) {
        bestCandidate = candidate
        bestMargin = candidateMargin
      }
    }

    if (!respectsVehicleMinimumDistance(bestCandidate, existingPlacements, layer.minimumSeparation, rules)) {
      const separatedPosition = resolveSeparatedVehiclePosition(
        bestCandidate,
        existingPlacements,
        layer.minimumSeparation,
        layer.bounds,
        rules
      )
      if (separatedPosition) {
        bestCandidate = rebuildVehicleAtSpawnPosition(bestCandidate, separatedPosition)
      } else if (rules) {
        const legalPosition = resolveNearestLegalVehiclePosition(bestCandidate, layer.bounds, rules)
        if (legalPosition) {
          bestCandidate = rebuildVehicleAtSpawnPosition(bestCandidate, legalPosition)
        }
      }
    }

    vehicles.push(bestCandidate)
  }

  return relaxVehiclePlacements(vehicles, layer.bounds, layer.minimumSeparation, rules)
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
  const vehiclePlacementRules = buildCampusVehiclePlacementRules(pkg)
  const rawVehicles = vehicleLayers.flatMap((layer, index) =>
    hydrateVehicles(layer, vehicleCounts[index] ?? 0, vehiclePlacementRules)
  )
  const vehicleMinimumSeparation = vehicleLayers.reduce(
    (maxSeparation, layer) => Math.max(maxSeparation, layer.minimumSeparation),
    0
  )
  const vehicles = relaxVehiclePlacements(
    rawVehicles,
    pkg.bounds,
    vehicleMinimumSeparation,
    vehiclePlacementRules
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
