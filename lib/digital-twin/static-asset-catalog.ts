import type { LayoutBlueprint } from './campus-layout'
import { generateId } from './mock-data'
import type { StaticAssetInstance, StaticAssetKind, Vector3 } from './types'

export interface StaticAssetCatalogItem {
  id: string
  name: string
  description: string
  assetKind: StaticAssetKind
  variant?: string
  dimensions: {
    width: number
    depth: number
    height: number
  }
  major: boolean
  blocksVehicle: boolean
  blocksPerson: boolean
}

const STATIC_ASSET_CATALOG: StaticAssetCatalogItem[] = [
  {
    id: 'process-train-reactor',
    name: '反应塔列',
    description: '适合摆放成主工艺塔区，默认带塔架与换热设备。',
    assetKind: 'process-train',
    variant: 'reactor',
    dimensions: { width: 16, depth: 20, height: 20 },
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
  },
  {
    id: 'process-train-fractionation',
    name: '分馏塔列',
    description: '更高的精馏装置列，适合塔器密集区。',
    assetKind: 'process-train',
    variant: 'fractionation',
    dimensions: { width: 16, depth: 20, height: 22 },
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
  },
  {
    id: 'pipe-rack-west-header',
    name: '高架桥架',
    description: '用于跨区域桥架 / 管廊摆放。',
    assetKind: 'pipe-rack',
    variant: 'west-header',
    dimensions: { width: 58, depth: 4, height: 8 },
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
  },
  {
    id: 'vertical-tank-fixed-roof',
    name: '立罐组',
    description: '双罐固定顶立罐，适合液体储运区域。',
    assetKind: 'vertical-tank',
    variant: 'fixed-roof',
    dimensions: { width: 20, depth: 16, height: 11 },
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
  },
  {
    id: 'vertical-tank-day-tank',
    name: '日用立罐',
    description: '更紧凑的小型立罐组。',
    assetKind: 'vertical-tank',
    variant: 'day-tank',
    dimensions: { width: 20, depth: 10, height: 9 },
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
  },
  {
    id: 'sphere-tank-lpg',
    name: '球罐',
    description: 'LPG 球罐，适合罐区重点装置。',
    assetKind: 'sphere-tank',
    variant: 'lpg',
    dimensions: { width: 8, depth: 8, height: 9 },
    major: true,
    blocksVehicle: true,
    blocksPerson: true,
  },
  {
    id: 'pump-manifold-manifold',
    name: '泵阀管汇',
    description: '用于罐区或装置前场的泵阀带。',
    assetKind: 'pump-manifold',
    variant: 'manifold',
    dimensions: { width: 12, depth: 6, height: 4.4 },
    major: false,
    blocksVehicle: true,
    blocksPerson: false,
  },
  {
    id: 'service-building-control-room',
    name: '控制室',
    description: '控制楼 / 机柜间 / 配电小屋。',
    assetKind: 'service-building',
    variant: 'control-room',
    dimensions: { width: 8, depth: 14, height: 6 },
    major: false,
    blocksVehicle: true,
    blocksPerson: true,
  },
]

const STATIC_ASSET_CATALOG_BY_ID = new Map(
  STATIC_ASSET_CATALOG.map((item) => [item.id, item] as const)
)

function getDefaultDistrictId(assetKind: StaticAssetKind): LayoutBlueprint['districtId'] {
  switch (assetKind) {
    case 'process-train':
    case 'pipe-rack':
    case 'service-building':
      return 'process-west'
    case 'vertical-tank':
    case 'sphere-tank':
    case 'pump-manifold':
      return 'tank-east'
  }
}

export function listStaticAssetCatalog() {
  return STATIC_ASSET_CATALOG
}

export function getStaticAssetCatalogItem(id: string) {
  return STATIC_ASSET_CATALOG_BY_ID.get(id) ?? null
}

export function resolveStaticAssetCatalogItem(
  assetKind: StaticAssetKind,
  variant?: string
): StaticAssetCatalogItem {
  return (
    STATIC_ASSET_CATALOG.find(
      (item) => item.assetKind === assetKind && item.variant === variant
    ) ??
    STATIC_ASSET_CATALOG.find((item) => item.assetKind === assetKind) ??
    STATIC_ASSET_CATALOG[0]
  )
}

export function resolveStaticAssetBlueprint(
  asset: Pick<StaticAssetInstance, 'assetKind' | 'variant' | 'name'>
): LayoutBlueprint {
  const catalogItem = resolveStaticAssetCatalogItem(asset.assetKind, asset.variant)

  return {
    id: `authored:${asset.assetKind}:${asset.variant ?? 'default'}`,
    districtId: getDefaultDistrictId(asset.assetKind),
    label: asset.name || catalogItem.name,
    kind: asset.assetKind,
    center: { x: 0, y: 0, z: 0 },
    width: catalogItem.dimensions.width,
    depth: catalogItem.dimensions.depth,
    height: catalogItem.dimensions.height,
    major: catalogItem.major,
    blocksVehicle: catalogItem.blocksVehicle,
    blocksPerson: catalogItem.blocksPerson,
    variant: asset.variant ?? catalogItem.variant,
  }
}

export function createStaticAssetTemplateFromCatalog(
  catalogId: string,
  position: Vector3
): StaticAssetInstance {
  const catalogItem =
    getStaticAssetCatalogItem(catalogId) ?? resolveStaticAssetCatalogItem('service-building')
  const now = Date.now()

  return {
    id: `static-asset-${generateId()}`,
    name: catalogItem.name,
    assetKind: catalogItem.assetKind,
    variant: catalogItem.variant,
    position: { x: position.x, y: position.y, z: position.z },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    metadata: {
      catalogId: catalogItem.id,
    },
    createdAt: now,
    updatedAt: now,
  }
}
