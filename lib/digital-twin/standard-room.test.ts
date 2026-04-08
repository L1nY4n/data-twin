import { describe, expect, test } from 'bun:test'
import { getStaticAssetCatalogItem } from './static-asset-catalog'
import {
  STANDARD_ROOM_DIMENSIONS,
  createStandardRoomStaticAssets,
} from './standard-room'

describe('standard room preset', () => {
  test('creates a centered four-wall room with a hosted south entry door', () => {
    const center = { x: 12, y: 0, z: -8 }
    const assets = createStandardRoomStaticAssets(center)
    const wallCatalogItem = getStaticAssetCatalogItem('wall-system-solid-wall')
    const expectedSideWallScale = wallCatalogItem
      ? STANDARD_ROOM_DIMENSIONS.depth / wallCatalogItem.dimensions.width
      : 1

    expect(assets).toHaveLength(5)

    const northWall = assets.find((asset) => asset.name === '标准房间 · 北墙')
    const southWall = assets.find((asset) => asset.name === '标准房间 · 南墙')
    const eastWall = assets.find((asset) => asset.name === '标准房间 · 东墙')
    const westWall = assets.find((asset) => asset.name === '标准房间 · 西墙')
    const door = assets.find((asset) => asset.name === '标准房间 · 入口门')

    expect(northWall?.assetKind).toBe('wall-system')
    expect(southWall?.assetKind).toBe('wall-system')
    expect(eastWall?.assetKind).toBe('wall-system')
    expect(westWall?.assetKind).toBe('wall-system')
    expect(door?.assetKind).toBe('door-system')

    expect(northWall?.position).toEqual({
      x: center.x,
      y: center.y,
      z: center.z - STANDARD_ROOM_DIMENSIONS.depth / 2,
    })
    expect(southWall?.position).toEqual({
      x: center.x,
      y: center.y,
      z: center.z + STANDARD_ROOM_DIMENSIONS.depth / 2,
    })
    expect(eastWall?.position).toEqual({
      x: center.x + STANDARD_ROOM_DIMENSIONS.width / 2,
      y: center.y,
      z: center.z,
    })
    expect(westWall?.position).toEqual({
      x: center.x - STANDARD_ROOM_DIMENSIONS.width / 2,
      y: center.y,
      z: center.z,
    })

    expect(northWall?.rotation.y).toBe(0)
    expect(southWall?.rotation.y).toBe(0)
    expect(eastWall?.rotation.y).toBeCloseTo(Math.PI / 2, 5)
    expect(westWall?.rotation.y).toBeCloseTo(Math.PI / 2, 5)
    expect(eastWall?.scale.x).toBeCloseTo(expectedSideWallScale, 5)
    expect(westWall?.scale.x).toBeCloseTo(expectedSideWallScale, 5)

    expect(door?.position).toEqual({
      x: center.x,
      y: southWall?.position.y ?? center.y,
      z: southWall?.position.z ?? center.z + STANDARD_ROOM_DIMENSIONS.depth / 2,
    })
    expect(door?.rotation.y).toBe(southWall?.rotation.y)
    expect(door?.metadata.hostStaticAssetId).toBe(southWall?.id)
    expect(door?.metadata.hostSurface).toBe('opening-center')
    expect(door?.metadata.preset).toBe('standard-room')
  })
})
