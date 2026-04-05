import {
  CAMPUS_BOUNDS,
  CAMPUS_CAMERA_PRESETS,
  CAMPUS_EQUIPMENT_PLACEMENTS,
  CAMPUS_LAYOUT_BLUEPRINTS,
  CAMPUS_SCENE_CONFIG,
  CAMPUS_SECTORS,
  CAMPUS_ZONE_BLUEPRINTS,
  DEFAULT_SCENE_COUNTS,
  PERSON_ANCHORS,
  PERSON_LANE_RECTS,
  PERSON_ROUTE_GOALS,
  PRODUCTION_SCENE_COUNTS,
  VEHICLE_ANCHORS,
  VEHICLE_LANE_RECTS,
  VEHICLE_ROUTE_GOALS,
  VEHICLE_ROUTE_LOOPS,
  type EquipmentPlacement,
  type CampusSector,
  type LayoutBlueprint,
  type SceneEntityCounts,
  type ZoneBlueprint,
} from '../campus-layout'
import type { SceneConfig, Vector3, VehicleEntity } from '../types'
import {
  createInterSectorStaticRenderRecipe,
  createSectorStaticRenderRecipe,
} from './static-recipes'
import { PUBLISHED_STATIC_ASSET_MANIFEST_URL } from './static-assets'
import type {
  PublishedDynamicLayer,
  PublishedEquipmentLayer,
  PublishedInteractionLayer,
  PublishedInteractionZone,
  PublishedPersonLayer,
  PublishedRoutingLayer,
  PublishedSceneBounds,
  PublishedScenePackage,
  PublishedSceneProfile,
  PublishedSceneSector,
  PublishedSpawnAnchor,
  PublishedStaticChunk,
  PublishedStaticFeature,
  PublishedVehicleLayer,
} from './types'

const SCHEMA_VERSION = 1 as const
const SECTOR_HALF_EXTENT = 118
const SECTOR_BOTTOM_PADDING = 4
const SECTOR_TOP_PADDING = 28
const SECTOR_PROXY_LOD_DISTANCE = 420
const CORRIDOR_PROXY_LOD_DISTANCE = 560
const DEFAULT_EQUIPMENT_SPREAD = { x: 1.2, z: 1.2 } as const

interface BuildPublishedScenePackageOptions {
  generatedAt?: string
  profile?: PublishedSceneProfile
  staticAssetManifestUrl?: string
}

function offsetPoint(value: Vector3, offset: Vector3): Vector3 {
  return {
    x: value.x + offset.x,
    y: value.y + offset.y,
    z: value.z + offset.z,
  }
}

function cloneVector3(value: Vector3): Vector3 {
  return {
    x: value.x,
    y: value.y,
    z: value.z,
  }
}

function resolveEquipmentSpread(placement: EquipmentPlacement) {
  return placement.spread ?? DEFAULT_EQUIPMENT_SPREAD
}

function createSceneConfig(): SceneConfig {
  return {
    id: 'published-campus-runtime',
    name: '化工园区数字孪生',
    gridSize: CAMPUS_SCENE_CONFIG.gridSize,
    gridDivisions: CAMPUS_SCENE_CONFIG.gridDivisions,
    backgroundColor: '#09131d',
    ambientLightIntensity: 0.52,
    showAxes: false,
    showGrid: true,
    cameraPosition: cloneVector3(CAMPUS_SCENE_CONFIG.cameraPosition),
    cameraTarget: cloneVector3(CAMPUS_SCENE_CONFIG.cameraTarget),
  }
}

function createSectorBounds(sector: CampusSector): PublishedSceneBounds {
  return {
    min: {
      x: sector.offset.x - SECTOR_HALF_EXTENT,
      y: sector.offset.y - SECTOR_BOTTOM_PADDING,
      z: sector.offset.z - SECTOR_HALF_EXTENT,
    },
    max: {
      x: sector.offset.x + SECTOR_HALF_EXTENT,
      y: sector.offset.y + SECTOR_TOP_PADDING,
      z: sector.offset.z + SECTOR_HALF_EXTENT,
    },
  }
}

function getSectorStaticChunkId(sectorId: string) {
  return `chunk:${sectorId}:static`
}

function pointInBounds(point: Vector3, bounds: PublishedSceneBounds) {
  return (
    point.x >= bounds.min.x &&
    point.x <= bounds.max.x &&
    point.y >= bounds.min.y &&
    point.y <= bounds.max.y &&
    point.z >= bounds.min.z &&
    point.z <= bounds.max.z
  )
}

function withSectorLabel(label: string, sector: CampusSector) {
  if (sector.id === 'sector-core') return label
  return `${sector.name} · ${label}`
}

function expandBlueprintFeature(
  blueprint: LayoutBlueprint,
  sector: CampusSector
): PublishedStaticFeature {
  return {
    id: `${sector.id}:${blueprint.id}`,
    sectorId: sector.id,
    districtId: blueprint.districtId,
    label: withSectorLabel(blueprint.label, sector),
    kind: blueprint.kind,
    center: offsetPoint(blueprint.center, sector.offset),
    width: blueprint.width,
    depth: blueprint.depth,
    height: blueprint.height,
    major: blueprint.major,
    blocksVehicle: blueprint.blocksVehicle,
    blocksPerson: blueprint.blocksPerson,
    ...(blueprint.variant ? { variant: blueprint.variant } : {}),
  }
}

function expandZoneBlueprint(zone: ZoneBlueprint, sector: CampusSector): PublishedInteractionZone {
  return {
    id: `${sector.id}:${zone.name}`,
    sectorId: sector.id,
    name: withSectorLabel(zone.name, sector),
    zoneType: zone.zoneType,
    color: zone.color,
    center: offsetPoint(zone.center, sector.offset),
    size: zone.size,
  }
}

function createSpawnAnchor(position: Vector3, spread: { x: number; z: number }): PublishedSpawnAnchor {
  return {
    position: cloneVector3(position),
    spread: { ...spread },
  }
}

function buildDynamicLayerBase(
  id: string,
  entityType: PublishedDynamicLayer['entityType'],
  sector: CampusSector,
  count: number
) {
  return {
    id,
    entityType,
    sectorId: sector.id,
    bounds: createSectorBounds(sector),
    count,
  }
}

function buildSectorStaticChunk(sector: CampusSector): PublishedStaticChunk {
  const features = CAMPUS_LAYOUT_BLUEPRINTS.map((blueprint) =>
    expandBlueprintFeature(blueprint, sector)
  )

  return {
    id: getSectorStaticChunkId(sector.id),
    label: `${sector.name} 静态块`,
    kind: 'sector',
    sectorId: sector.id,
    bounds: createSectorBounds(sector),
    proxy: {
      strategy: 'sector-proxy',
      lodDistance: SECTOR_PROXY_LOD_DISTANCE,
    },
    runtimeMount: {
      kind: 'sector-cluster',
      renderer: 'campus-sector-cluster',
    },
    renderRecipe: createSectorStaticRenderRecipe(sector),
    featureCount: features.length,
    features,
  }
}

function buildSectorInteractionLayer(sector: CampusSector): PublishedInteractionLayer {
  const zones = CAMPUS_ZONE_BLUEPRINTS.map((zone) => expandZoneBlueprint(zone, sector))

  return {
    id: `layer:${sector.id}:zones`,
    kind: 'zones',
    sectorId: sector.id,
    bounds: createSectorBounds(sector),
    zones,
  }
}

function buildSectorEntry(sector: CampusSector): PublishedSceneSector {
  return {
    id: sector.id,
    name: sector.name,
    offset: sector.offset,
    bounds: createSectorBounds(sector),
    staticChunkId: getSectorStaticChunkId(sector.id),
    dynamicLayerIds: [
      `layer:${sector.id}:persons`,
      `layer:${sector.id}:vehicles`,
      `layer:${sector.id}:equipment`,
    ],
    interactionLayerIds: [`layer:${sector.id}:zones`],
  }
}

function buildRoutingLayers(bounds: PublishedSceneBounds): PublishedRoutingLayer[] {
  return [
    {
      id: 'routing:vehicle:campus',
      mobilityType: 'vehicle',
      scope: 'campus',
      bounds,
      laneCount: VEHICLE_LANE_RECTS.length,
      routeGoalCount: VEHICLE_ROUTE_GOALS.length,
      routeLoopCount: VEHICLE_ROUTE_LOOPS.length,
    },
    {
      id: 'routing:person:campus',
      mobilityType: 'person',
      scope: 'campus',
      bounds,
      laneCount: PERSON_LANE_RECTS.length,
      routeGoalCount: PERSON_ROUTE_GOALS.length,
      routeLoopCount: 0,
    },
  ]
}

function buildInterSectorChunk(): PublishedStaticChunk {
  return {
    id: 'chunk:campus:inter-sector',
    label: '园区互联静态块',
    kind: 'inter-sector',
    sectorId: null,
    bounds: {
      min: {
        x: CAMPUS_BOUNDS.min.x,
        y: -SECTOR_BOTTOM_PADDING,
        z: CAMPUS_BOUNDS.min.z,
      },
      max: {
        x: CAMPUS_BOUNDS.max.x,
        y: SECTOR_TOP_PADDING,
        z: CAMPUS_BOUNDS.max.z,
      },
    },
    proxy: {
      strategy: 'corridor-proxy',
      lodDistance: CORRIDOR_PROXY_LOD_DISTANCE,
    },
    runtimeMount: {
      kind: 'inter-sector-links',
      renderer: 'campus-inter-sector-links',
    },
    renderRecipe: createInterSectorStaticRenderRecipe(),
    featureCount: 1,
    features: [
      {
        id: 'campus:inter-sector-corridor',
        sectorId: 'campus',
        districtId: 'inter-sector',
        label: '园区互联走廊',
        kind: 'pipe-rack',
        center: {
          x: CAMPUS_SCENE_CONFIG.cameraTarget.x,
          y: CAMPUS_SCENE_CONFIG.cameraTarget.y,
          z: CAMPUS_SCENE_CONFIG.cameraTarget.z + 104,
        },
        width: 780,
        depth: 500,
        height: 12,
        major: true,
        blocksVehicle: false,
        blocksPerson: false,
        variant: 'inter-sector-corridor',
      },
    ],
  }
}

function countPointsInSector(points: Vector3[], sector: CampusSector) {
  const bounds = createSectorBounds(sector)
  return points.reduce((count, point) => count + (pointInBounds(point, bounds) ? 1 : 0), 0)
}

function countEquipmentInSector(sector: CampusSector) {
  const bounds = createSectorBounds(sector)
  return CAMPUS_EQUIPMENT_PLACEMENTS.reduce(
    (count, placement) => count + (pointInBounds(placement.position, bounds) ? 1 : 0),
    0
  )
}

function countVehicleAnchorsInSector(sector: CampusSector) {
  return Object.values(VEHICLE_ANCHORS).reduce(
    (count, anchors) => count + countPointsInSector(anchors, sector),
    0
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

function buildEntityCounts(
  defaults: SceneEntityCounts,
  production: SceneEntityCounts
): PublishedScenePackage['entityCounts'] {
  return {
    default: defaults,
    production,
  }
}

function buildPersonLayer(sector: CampusSector, count: number): PublishedPersonLayer {
  const bounds = createSectorBounds(sector)
  const anchors = PERSON_ANCHORS
    .filter((anchor) => pointInBounds(anchor, bounds))
    .map((anchor) => createSpawnAnchor(anchor, { x: 2.4, z: 2 }))

  return {
    ...buildDynamicLayerBase(`layer:${sector.id}:persons`, 'person', sector, count),
    entityType: 'person',
    anchors,
  }
}

function buildVehicleLayer(sector: CampusSector, count: number): PublishedVehicleLayer {
  const bounds = createSectorBounds(sector)
  const vehicleTypes = Object.keys(VEHICLE_ANCHORS) as VehicleEntity['vehicleType'][]
  const anchorsByType = vehicleTypes.reduce((acc, type) => {
    acc[type] = VEHICLE_ANCHORS[type]
      .filter((anchor) => pointInBounds(anchor, bounds))
      .map((anchor) => createSpawnAnchor(anchor, { x: 2.6, z: 2.2 }))
    return acc
  }, {} as Record<VehicleEntity['vehicleType'], PublishedSpawnAnchor[]>)

  return {
    ...buildDynamicLayerBase(`layer:${sector.id}:vehicles`, 'vehicle', sector, count),
    entityType: 'vehicle',
    anchorsByType,
    minimumSeparation: 3,
  }
}

function buildEquipmentLayer(sector: CampusSector, count: number): PublishedEquipmentLayer {
  const bounds = createSectorBounds(sector)
  const placements = CAMPUS_EQUIPMENT_PLACEMENTS
    .filter((placement) => pointInBounds(placement.position, bounds))
    .map((placement) => ({
      name: placement.name,
      position: cloneVector3(placement.position),
      repeatable: placement.repeatable !== false,
      spread: resolveEquipmentSpread(placement),
    }))

  return {
    ...buildDynamicLayerBase(`layer:${sector.id}:equipment`, 'equipment', sector, count),
    entityType: 'equipment',
    placements,
  }
}

export function buildPublishedScenePackage(
  options: BuildPublishedScenePackageOptions = {}
): PublishedScenePackage {
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const profile = options.profile ?? 'default'
  const bounds = {
    min: { ...CAMPUS_BOUNDS.min },
    max: { ...CAMPUS_BOUNDS.max },
  }
  const sceneCounts = profile === 'production' ? PRODUCTION_SCENE_COUNTS : DEFAULT_SCENE_COUNTS
  const personCounts = distributeCounts(
    sceneCounts.persons,
    CAMPUS_SECTORS.map((sector) => countPointsInSector(PERSON_ANCHORS, sector))
  )
  const vehicleCounts = distributeCounts(
    sceneCounts.vehicles,
    CAMPUS_SECTORS.map((sector) => countVehicleAnchorsInSector(sector))
  )
  const equipmentCounts = distributeCounts(
    sceneCounts.equipment,
    CAMPUS_SECTORS.map((sector) => countEquipmentInSector(sector))
  )
  const interactionLayers = CAMPUS_SECTORS.map((sector) => buildSectorInteractionLayer(sector))

  return {
    schemaVersion: SCHEMA_VERSION,
    sceneId: 'chemical-plant-campus',
    profile,
    generatedAt,
    source: 'campus-layout',
    staticAssetManifestUrl:
      options.staticAssetManifestUrl ?? PUBLISHED_STATIC_ASSET_MANIFEST_URL,
    bounds,
    sceneConfig: createSceneConfig(),
    sectors: CAMPUS_SECTORS.map((sector) => buildSectorEntry(sector)),
    staticChunks: [
      ...CAMPUS_SECTORS.map((sector) => buildSectorStaticChunk(sector)),
      buildInterSectorChunk(),
    ],
    interactionLayers,
    zoneOverlays: interactionLayers,
    dynamicLayers: CAMPUS_SECTORS.flatMap((sector, index) => [
      buildPersonLayer(sector, personCounts[index] ?? 0),
      buildVehicleLayer(sector, vehicleCounts[index] ?? 0),
      buildEquipmentLayer(sector, equipmentCounts[index] ?? 0),
    ]),
    routingLayers: buildRoutingLayers(bounds),
    cameraPresets: CAMPUS_CAMERA_PRESETS.map((preset) => ({
      ...preset,
      position: { ...preset.position },
      target: { ...preset.target },
    })),
    entityCounts: buildEntityCounts(DEFAULT_SCENE_COUNTS, PRODUCTION_SCENE_COUNTS),
  }
}

export function createPublishedCampusScenePackage(
  profile: PublishedSceneProfile = 'default',
  options: Omit<BuildPublishedScenePackageOptions, 'profile'> = {}
) {
  return buildPublishedScenePackage({ ...options, profile })
}

export const DEFAULT_PUBLISHED_SCENE_PACKAGE = createPublishedCampusScenePackage('default')
