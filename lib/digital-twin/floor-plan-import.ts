import {
  createStaticAssetTemplateFromCatalog,
  getStaticAssetCatalogItem,
} from './static-asset-catalog'
import type { StaticAssetInstance, Vector3 } from './types'
import type {
  DetectedFloorPlanOpeningDto,
  DetectedFloorPlanWallDto,
  FloorPlanDetectionResultDto,
} from './floor-plan-detector'
import type { EditorFloorPlanReference } from './editor-store'

const WALL_CATALOG_ID = 'wall-system-solid-wall'
const DOOR_CATALOG_ID = 'door-system-single-swing'
const WINDOW_CATALOG_ID = 'window-system-casement-window'
const WINDOW_SILL_HEIGHT = 1.2
const HOST_DISTANCE_MARGIN = 0.3

type ImportedWallRecord = {
  asset: StaticAssetInstance
  worldStart: Vector3
  worldEnd: Vector3
}

function resolvePixelsToMeters(
  detection: Pick<FloorPlanDetectionResultDto, 'imageWidth' | 'imageHeight'>,
  reference: Pick<EditorFloorPlanReference, 'scaleMeters'>
) {
  const widthMeters = reference.scaleMeters
  const depthMeters = widthMeters * (detection.imageHeight / detection.imageWidth)

  return {
    widthMeters,
    depthMeters,
    xMetersPerPixel: widthMeters / detection.imageWidth,
    zMetersPerPixel: depthMeters / detection.imageHeight,
  }
}

function imagePointToWorld(
  point: { x: number; y: number },
  detection: Pick<FloorPlanDetectionResultDto, 'imageWidth' | 'imageHeight'>,
  reference: Pick<EditorFloorPlanReference, 'position' | 'scaleMeters'>
): Vector3 {
  const { widthMeters, depthMeters, xMetersPerPixel, zMetersPerPixel } =
    resolvePixelsToMeters(detection, reference)

  return {
    x: reference.position.x + point.x * xMetersPerPixel - widthMeters / 2,
    y: reference.position.y,
    z: reference.position.z + point.y * zMetersPerPixel - depthMeters / 2,
  }
}

function createImportedWall(
  wall: DetectedFloorPlanWallDto,
  detection: Pick<FloorPlanDetectionResultDto, 'imageWidth' | 'imageHeight'>,
  reference: Pick<EditorFloorPlanReference, 'position' | 'scaleMeters'>
): ImportedWallRecord {
  const wallCatalog = getStaticAssetCatalogItem(WALL_CATALOG_ID)
  const worldStart = imagePointToWorld(wall.start, detection, reference)
  const worldEnd = imagePointToWorld(wall.end, detection, reference)
  const center = {
    x: (worldStart.x + worldEnd.x) / 2,
    y: reference.position.y,
    z: (worldStart.z + worldEnd.z) / 2,
  }
  const lengthMeters =
    wall.orientation === 'horizontal'
      ? Math.abs(worldEnd.x - worldStart.x)
      : Math.abs(worldEnd.z - worldStart.z)
  const thicknessMeters =
    wall.orientation === 'horizontal'
      ? wall.thickness * (resolvePixelsToMeters(detection, reference).zMetersPerPixel)
      : wall.thickness * (resolvePixelsToMeters(detection, reference).xMetersPerPixel)

  const asset = createStaticAssetTemplateFromCatalog(WALL_CATALOG_ID, {
    position: center,
    rotation: {
      x: 0,
      y: wall.orientation === 'horizontal' ? 0 : Math.PI / 2,
      z: 0,
    },
    elevationLocked: true,
    metadata: {
      importSource: 'floor-plan-image',
      importKind: 'wall',
    },
  })

  asset.name = `导入墙段 ${asset.name}`
  if (wallCatalog) {
    asset.scale = {
      x: Math.max(0.1, lengthMeters / wallCatalog.dimensions.width),
      y: 1,
      z: Math.max(0.25, thicknessMeters / wallCatalog.dimensions.depth),
    }
  }

  return {
    asset,
    worldStart,
    worldEnd,
  }
}

function distancePointToSegment2D(point: Vector3, start: Vector3, end: Vector3) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.z - start.z)
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared)
  )
  const projectedX = start.x + t * dx
  const projectedZ = start.z + t * dz
  return Math.hypot(point.x - projectedX, point.z - projectedZ)
}

function wallSupportsOpeningHost(
  opening: DetectedFloorPlanOpeningDto,
  worldPoint: Vector3,
  wall: ImportedWallRecord,
  detection: Pick<FloorPlanDetectionResultDto, 'imageWidth' | 'imageHeight'>,
  reference: Pick<EditorFloorPlanReference, 'position' | 'scaleMeters'>
) {
  const wallCatalog = getStaticAssetCatalogItem(WALL_CATALOG_ID)
  const wallThickness =
    wallCatalog?.dimensions.depth
      ? wallCatalog.dimensions.depth * wall.asset.scale.z
      : 0.28 * wall.asset.scale.z
  const tolerance = wallThickness / 2 + HOST_DISTANCE_MARGIN
  const distance = distancePointToSegment2D(worldPoint, wall.worldStart, wall.worldEnd)
  if (distance > tolerance) {
    return false
  }

  const spanMeters =
    opening.orientation === 'horizontal'
      ? opening.span * resolvePixelsToMeters(detection, reference).xMetersPerPixel
      : opening.span * resolvePixelsToMeters(detection, reference).zMetersPerPixel
  const halfSpan = spanMeters / 2

  if (opening.orientation === 'horizontal') {
    const minX = Math.min(wall.worldStart.x, wall.worldEnd.x) - halfSpan
    const maxX = Math.max(wall.worldStart.x, wall.worldEnd.x) + halfSpan
    return worldPoint.x >= minX && worldPoint.x <= maxX
  }

  const minZ = Math.min(wall.worldStart.z, wall.worldEnd.z) - halfSpan
  const maxZ = Math.max(wall.worldStart.z, wall.worldEnd.z) + halfSpan
  return worldPoint.z >= minZ && worldPoint.z <= maxZ
}

function findHostWall(
  opening: DetectedFloorPlanOpeningDto,
  worldPoint: Vector3,
  walls: ImportedWallRecord[],
  detection: Pick<FloorPlanDetectionResultDto, 'imageWidth' | 'imageHeight'>,
  reference: Pick<EditorFloorPlanReference, 'position' | 'scaleMeters'>
) {
  const compatibleWalls = walls.filter((wall) => {
    const rotationIsHorizontal = Math.abs(wall.asset.rotation.y) < 0.001
    return opening.orientation === 'horizontal' ? rotationIsHorizontal : !rotationIsHorizontal
  })

  return compatibleWalls
    .filter((wall) =>
      wallSupportsOpeningHost(opening, worldPoint, wall, detection, reference)
    )
    .map((wall) => ({
      wall,
      distance: distancePointToSegment2D(worldPoint, wall.worldStart, wall.worldEnd),
    }))
    .sort((left, right) => left.distance - right.distance)[0]?.wall ?? null
}

function createImportedOpening(
  opening: DetectedFloorPlanOpeningDto,
  catalogId: string,
  worldPoint: Vector3,
  hostWall: ImportedWallRecord | null,
  detection: Pick<FloorPlanDetectionResultDto, 'imageWidth' | 'imageHeight'>,
  reference: Pick<EditorFloorPlanReference, 'position' | 'scaleMeters'>
): StaticAssetInstance {
  const catalog = getStaticAssetCatalogItem(catalogId)
  const spanMeters =
    opening.orientation === 'horizontal'
      ? opening.span * resolvePixelsToMeters(detection, reference).xMetersPerPixel
      : opening.span * resolvePixelsToMeters(detection, reference).zMetersPerPixel

  const asset = createStaticAssetTemplateFromCatalog(catalogId, {
    position: {
      x: worldPoint.x,
      y: reference.position.y + (opening.type === 'window' ? WINDOW_SILL_HEIGHT : 0),
      z: worldPoint.z,
    },
    rotation: {
      x: 0,
      y: hostWall?.asset.rotation.y ?? (opening.orientation === 'horizontal' ? 0 : Math.PI / 2),
      z: 0,
    },
    elevationLocked: true,
    metadata: {
      importSource: 'floor-plan-image',
      importKind: opening.type,
      hostStaticAssetId: hostWall?.asset.id ?? null,
      hostSurface: hostWall ? 'opening-center' : 'ground',
    },
  })

  if (catalog) {
    asset.scale = {
      x: Math.max(0.25, spanMeters / catalog.dimensions.width),
      y: 1,
      z: 1,
    }
  }

  asset.name = opening.type === 'door' ? '导入门' : '导入窗'
  return asset
}

export function createStaticAssetsFromFloorPlanDetection(
  detection: FloorPlanDetectionResultDto,
  reference: Pick<EditorFloorPlanReference, 'position' | 'scaleMeters'>
): StaticAssetInstance[] {
  const importedWalls = detection.walls.map((wall) =>
    createImportedWall(wall, detection, reference)
  )

  const openings = [...detection.doors, ...detection.windows]
    .map((opening) => {
      const worldPoint = imagePointToWorld(opening.position, detection, reference)
      const hostWall = findHostWall(opening, worldPoint, importedWalls, detection, reference)

      return createImportedOpening(
        opening,
        opening.type === 'door' ? DOOR_CATALOG_ID : WINDOW_CATALOG_ID,
        worldPoint,
        hostWall,
        detection,
        reference
      )
    })

  return [...importedWalls.map((record) => record.asset), ...openings]
}
