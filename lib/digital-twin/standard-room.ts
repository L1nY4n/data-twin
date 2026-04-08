import {
  createStaticAssetTemplateFromCatalog,
  getStaticAssetCatalogItem,
} from './static-asset-catalog'
import type { StaticAssetInstance, Vector3 } from './types'

export const STANDARD_ROOM_PRESET = 'standard-room'
export const STANDARD_ROOM_ENTRY_DOOR_ROLE = 'entry-door'
const STANDARD_ROOM_WALL_CATALOG_ID = 'wall-system-solid-wall'
const STANDARD_ROOM_DOOR_CATALOG_ID = 'door-system-single-swing'

export const STANDARD_ROOM_DIMENSIONS = {
  width: 6,
  depth: 4.8,
} as const

type StandardRoomWallRole = 'north-wall' | 'south-wall' | 'east-wall' | 'west-wall'

function createRoomWall(
  role: StandardRoomWallRole,
  name: string,
  position: Vector3,
  rotationY: number,
  spanScale = 1
) {
  const wall = createStaticAssetTemplateFromCatalog(STANDARD_ROOM_WALL_CATALOG_ID, {
    position,
    rotation: { x: 0, y: rotationY, z: 0 },
    elevationLocked: true,
    metadata: {
      preset: STANDARD_ROOM_PRESET,
      presetRole: role,
    },
  })

  wall.name = name
  wall.scale = {
    ...wall.scale,
    x: spanScale,
  }

  return wall
}

export function isStandardRoomEntryDoorAsset(
  asset: Pick<StaticAssetInstance, 'metadata'>
) {
  return (
    asset.metadata.preset === STANDARD_ROOM_PRESET &&
    asset.metadata.presetRole === STANDARD_ROOM_ENTRY_DOOR_ROLE
  )
}

export function createStandardRoomStaticAssets(center: Vector3): StaticAssetInstance[] {
  const halfWidth = STANDARD_ROOM_DIMENSIONS.width / 2
  const halfDepth = STANDARD_ROOM_DIMENSIONS.depth / 2
  const wallCatalogItem = getStaticAssetCatalogItem(STANDARD_ROOM_WALL_CATALOG_ID)
  const sideWallScale =
    wallCatalogItem && wallCatalogItem.dimensions.width > 0
      ? STANDARD_ROOM_DIMENSIONS.depth / wallCatalogItem.dimensions.width
      : 1

  const northWall = createRoomWall(
    'north-wall',
    '标准房间 · 北墙',
    { x: center.x, y: center.y, z: center.z - halfDepth },
    0
  )
  const southWall = createRoomWall(
    'south-wall',
    '标准房间 · 南墙',
    { x: center.x, y: center.y, z: center.z + halfDepth },
    0
  )
  const eastWall = createRoomWall(
    'east-wall',
    '标准房间 · 东墙',
    { x: center.x + halfWidth, y: center.y, z: center.z },
    Math.PI / 2,
    sideWallScale
  )
  const westWall = createRoomWall(
    'west-wall',
    '标准房间 · 西墙',
    { x: center.x - halfWidth, y: center.y, z: center.z },
    Math.PI / 2,
    sideWallScale
  )

  const door = createStaticAssetTemplateFromCatalog(STANDARD_ROOM_DOOR_CATALOG_ID, {
    position: {
      x: center.x,
      y: southWall.position.y,
      z: southWall.position.z,
    },
    rotation: {
      x: 0,
      y: southWall.rotation.y,
      z: 0,
    },
    elevationLocked: true,
    metadata: {
      preset: STANDARD_ROOM_PRESET,
      presetRole: STANDARD_ROOM_ENTRY_DOOR_ROLE,
      hostStaticAssetId: southWall.id,
      hostSurface: 'opening-center',
    },
  })

  door.name = '标准房间 · 入口门'

  return [northWall, southWall, eastWall, westWall, door]
}
