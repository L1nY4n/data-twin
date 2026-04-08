import type { LayoutBlueprint } from './campus-layout'
import { generateId } from './mock-data'
import type {
  StaticAssetInstance,
  StaticAssetKind,
  StaticAssetPlacement,
  Vector3,
} from './types'

export type StaticAssetCatalogDomain =
  | 'industrial'
  | 'building-shell'
  | 'ibms-device'
  | 'smart-home'

export type StaticAssetPlacementMode =
  | 'floor'
  | 'wall-mounted'
  | 'ceiling-mounted'
  | 'opening-hosted'

export interface StaticAssetCatalogItem {
  id: string
  name: string
  description: string
  assetKind: StaticAssetKind
  domain: StaticAssetCatalogDomain
  subcategory: string
  thumbnailUrl: string
  variant?: string
  tags: string[]
  placementMode: StaticAssetPlacementMode
  dimensions: {
    width: number
    depth: number
    height: number
  }
  major: boolean
  blocksVehicle: boolean
  blocksPerson: boolean
}

export const STATIC_ASSET_DOMAIN_LABELS: Record<StaticAssetCatalogDomain, string> = {
  industrial: '工业装置',
  'building-shell': '建筑构件',
  'ibms-device': '楼宇设备',
  'smart-home': '智能家居',
}

export const STATIC_ASSET_PLACEMENT_LABELS: Record<StaticAssetPlacementMode, string> = {
  floor: '落地摆放',
  'wall-mounted': '壁挂设备',
  'ceiling-mounted': '顶装设备',
  'opening-hosted': '开口构件',
}

export const STATIC_ASSET_KIND_LABELS: Record<StaticAssetKind, string> = {
  'process-train': '塔器装置',
  'pipe-rack': '桥架 / 管廊',
  'vertical-tank': '立罐',
  'sphere-tank': '球罐',
  'pump-manifold': '设备模块',
  'service-building': '建筑',
  'wall-system': '墙体 / 隔断',
  'door-system': '门体',
  'window-system': '窗体',
  'security-device': '安防设备',
  'smart-sensor': '智能传感器',
  'smart-control': '智能控制',
}

const STATIC_ASSET_CATALOG: StaticAssetCatalogItem[] = [
  {
    id: 'process-train-reactor',
    name: '反应塔列',
    description: '适合摆放成主工艺塔区，默认带塔架与换热设备。',
    assetKind: 'process-train',
    domain: 'industrial',
    subcategory: 'process-unit',
    thumbnailUrl: '/editor/catalog-thumbnails/process-train-reactor.webp',
    variant: 'reactor',
    tags: ['工业', '工艺', '反应塔', '流程装置'],
    placementMode: 'floor',
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
    domain: 'industrial',
    subcategory: 'process-unit',
    thumbnailUrl: '/editor/catalog-thumbnails/process-train-fractionation.webp',
    variant: 'fractionation',
    tags: ['工业', '塔器', '分馏', '流程装置'],
    placementMode: 'floor',
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
    domain: 'industrial',
    subcategory: 'rack',
    thumbnailUrl: '/editor/catalog-thumbnails/pipe-rack-west-header.webp',
    variant: 'west-header',
    tags: ['工业', '桥架', '管廊', '通道'],
    placementMode: 'floor',
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
    domain: 'industrial',
    subcategory: 'storage-tank',
    thumbnailUrl: '/editor/catalog-thumbnails/vertical-tank-fixed-roof.webp',
    variant: 'fixed-roof',
    tags: ['工业', '储罐', '立罐', '液体储运'],
    placementMode: 'floor',
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
    domain: 'industrial',
    subcategory: 'storage-tank',
    thumbnailUrl: '/editor/catalog-thumbnails/vertical-tank-day-tank.webp',
    variant: 'day-tank',
    tags: ['工业', '立罐', '日用罐', '储罐'],
    placementMode: 'floor',
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
    domain: 'industrial',
    subcategory: 'storage-tank',
    thumbnailUrl: '/editor/catalog-thumbnails/sphere-tank-lpg.webp',
    variant: 'lpg',
    tags: ['工业', '球罐', 'LPG', '储运'],
    placementMode: 'floor',
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
    domain: 'industrial',
    subcategory: 'pump-skid',
    thumbnailUrl: '/editor/catalog-thumbnails/pump-manifold-manifold.webp',
    variant: 'manifold',
    tags: ['工业', '泵组', '管汇', '模块'],
    placementMode: 'floor',
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
    domain: 'industrial',
    subcategory: 'service-building',
    thumbnailUrl: '/editor/catalog-thumbnails/service-building-control-room.webp',
    variant: 'control-room',
    tags: ['工业', '建筑', '控制室', '配电'],
    placementMode: 'floor',
    dimensions: { width: 8, depth: 14, height: 6 },
    major: false,
    blocksVehicle: true,
    blocksPerson: true,
  },
  {
    id: 'wall-system-solid-wall',
    name: '实体墙段',
    description: '标准室内墙段，可用于楼宇房间和公共区域布局。',
    assetKind: 'wall-system',
    domain: 'building-shell',
    subcategory: 'wall',
    thumbnailUrl: '/editor/catalog-thumbnails/wall-system.svg',
    variant: 'solid-wall',
    tags: ['建筑', '墙体', '实体墙', '房间'],
    placementMode: 'floor',
    dimensions: { width: 6, depth: 0.28, height: 3.2 },
    major: false,
    blocksVehicle: true,
    blocksPerson: true,
  },
  {
    id: 'wall-system-glass-partition',
    name: '玻璃隔断',
    description: '适合办公、展厅或机房观察区的通透隔断。',
    assetKind: 'wall-system',
    domain: 'building-shell',
    subcategory: 'partition',
    thumbnailUrl: '/editor/catalog-thumbnails/wall-system.svg',
    variant: 'glass-partition',
    tags: ['建筑', '玻璃隔断', '隔断', '办公'],
    placementMode: 'floor',
    dimensions: { width: 5.4, depth: 0.18, height: 3 },
    major: false,
    blocksVehicle: true,
    blocksPerson: true,
  },
  {
    id: 'door-system-single-swing',
    name: '单开门',
    description: '常规单扇平开门，适合办公室、弱电间和设备间。',
    assetKind: 'door-system',
    domain: 'building-shell',
    subcategory: 'door',
    thumbnailUrl: '/editor/catalog-thumbnails/door-system.svg',
    variant: 'single-swing',
    tags: ['建筑', '门', '单开门', '平开门'],
    placementMode: 'opening-hosted',
    dimensions: { width: 1.1, depth: 0.16, height: 2.3 },
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
  },
  {
    id: 'door-system-double-swing',
    name: '双开门',
    description: '双扇门洞构件，适合大厅、机房和出入口门厅。',
    assetKind: 'door-system',
    domain: 'building-shell',
    subcategory: 'door',
    thumbnailUrl: '/editor/catalog-thumbnails/door-system.svg',
    variant: 'double-swing',
    tags: ['建筑', '门', '双开门', '入口'],
    placementMode: 'opening-hosted',
    dimensions: { width: 1.8, depth: 0.18, height: 2.4 },
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
  },
  {
    id: 'door-system-fire-rated',
    name: '防火门',
    description: '适用于消防分区、疏散通道和设备房入口。',
    assetKind: 'door-system',
    domain: 'building-shell',
    subcategory: 'fire-door',
    thumbnailUrl: '/editor/catalog-thumbnails/door-system.svg',
    variant: 'fire-rated',
    tags: ['建筑', '门', '防火门', '消防'],
    placementMode: 'opening-hosted',
    dimensions: { width: 1.2, depth: 0.18, height: 2.3 },
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
  },
  {
    id: 'window-system-casement-window',
    name: '平开窗',
    description: '通用室内外窗体，可用于办公区、宿舍和控制室外墙。',
    assetKind: 'window-system',
    domain: 'building-shell',
    subcategory: 'window',
    thumbnailUrl: '/editor/catalog-thumbnails/window-system.svg',
    variant: 'casement-window',
    tags: ['建筑', '窗', '平开窗', '外窗'],
    placementMode: 'opening-hosted',
    dimensions: { width: 1.8, depth: 0.18, height: 1.6 },
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
  },
  {
    id: 'security-device-dome-camera',
    name: '半球摄像头',
    description: '适合大厅、走廊和电梯前室的顶部监控点位。',
    assetKind: 'security-device',
    domain: 'ibms-device',
    subcategory: 'camera',
    thumbnailUrl: '/editor/catalog-thumbnails/security-device.svg',
    variant: 'dome-camera',
    tags: ['楼控', '安防', '摄像头', '监控', 'camera'],
    placementMode: 'ceiling-mounted',
    dimensions: { width: 0.24, depth: 0.24, height: 0.18 },
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
  },
  {
    id: 'security-device-access-reader',
    name: '门禁读卡器',
    description: '门旁壁挂读卡器，用于人员通行与区域门禁控制。',
    assetKind: 'security-device',
    domain: 'ibms-device',
    subcategory: 'access-control',
    thumbnailUrl: '/editor/catalog-thumbnails/security-device.svg',
    variant: 'access-reader',
    tags: ['楼控', '门禁', '读卡器', 'access control'],
    placementMode: 'wall-mounted',
    dimensions: { width: 0.14, depth: 0.05, height: 0.24 },
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
  },
  {
    id: 'smart-sensor-occupancy-sensor',
    name: '人体存在传感器',
    description: '用于会议室、办公室和公共区域的人体/占用检测。',
    assetKind: 'smart-sensor',
    domain: 'ibms-device',
    subcategory: 'occupancy-sensor',
    thumbnailUrl: '/editor/catalog-thumbnails/smart-sensor.svg',
    variant: 'occupancy-sensor',
    tags: ['楼控', '传感器', '人体感应', 'occupancy', 'presence'],
    placementMode: 'ceiling-mounted',
    dimensions: { width: 0.18, depth: 0.18, height: 0.08 },
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
  },
  {
    id: 'smart-sensor-thermo-hygro-sensor',
    name: '温湿度传感器',
    description: '壁挂式环境传感器，用于舒适度和 HVAC 联动监测。',
    assetKind: 'smart-sensor',
    domain: 'ibms-device',
    subcategory: 'environmental-sensor',
    thumbnailUrl: '/editor/catalog-thumbnails/smart-sensor.svg',
    variant: 'thermo-hygro-sensor',
    tags: ['楼控', '传感器', '温度', '湿度', 'HVAC'],
    placementMode: 'wall-mounted',
    dimensions: { width: 0.16, depth: 0.05, height: 0.16 },
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
  },
  {
    id: 'smart-control-smart-lock',
    name: '智能门锁',
    description: '适合公寓、样板间和办公室门扇的联网门锁终端。',
    assetKind: 'smart-control',
    domain: 'smart-home',
    subcategory: 'smart-lock',
    thumbnailUrl: '/editor/catalog-thumbnails/smart-control.svg',
    variant: 'smart-lock',
    tags: ['智能家居', '门锁', 'smart lock', '门禁'],
    placementMode: 'opening-hosted',
    dimensions: { width: 0.08, depth: 0.06, height: 0.32 },
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
  },
  {
    id: 'smart-control-thermostat-panel',
    name: '智能温控器',
    description: '墙面温控面板，可联动风机盘管、新风和舒适度场景。',
    assetKind: 'smart-control',
    domain: 'smart-home',
    subcategory: 'thermostat',
    thumbnailUrl: '/editor/catalog-thumbnails/smart-control.svg',
    variant: 'thermostat-panel',
    tags: ['智能家居', '温控器', 'thermostat', 'HVAC', '面板'],
    placementMode: 'wall-mounted',
    dimensions: { width: 0.18, depth: 0.05, height: 0.18 },
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
  },
  {
    id: 'smart-control-scene-panel',
    name: '灯光场景面板',
    description: '用于照明、窗帘和情景模式联动的多键智能控制面板。',
    assetKind: 'smart-control',
    domain: 'smart-home',
    subcategory: 'scene-panel',
    thumbnailUrl: '/editor/catalog-thumbnails/smart-control.svg',
    variant: 'scene-panel',
    tags: ['智能家居', '灯光', '照明面板', 'scene panel', '控制面板'],
    placementMode: 'wall-mounted',
    dimensions: { width: 0.2, depth: 0.05, height: 0.24 },
    major: false,
    blocksVehicle: false,
    blocksPerson: false,
  },
]

const STATIC_ASSET_CATALOG_BY_ID = new Map(
  STATIC_ASSET_CATALOG.map((item) => [item.id, item] as const)
)

export function resolveStaticAssetPlacementElevation(
  catalogItem: StaticAssetCatalogItem,
  position: Vector3
) {
  switch (catalogItem.placementMode) {
    case 'ceiling-mounted':
      return Math.max(position.y, 2.6)
    case 'wall-mounted':
      return Math.max(position.y, 1.4)
    case 'opening-hosted':
      if (catalogItem.assetKind === 'window-system') {
        return Math.max(position.y, 1.2)
      }
      if (catalogItem.assetKind === 'smart-control' && catalogItem.variant === 'smart-lock') {
        return Math.max(position.y, 1.05)
      }
      return position.y
    case 'floor':
    default:
      return position.y
  }
}

function normalizePlacement(placement: Vector3 | StaticAssetPlacement): StaticAssetPlacement {
  if ('position' in placement) {
    return {
      position: {
        x: placement.position.x,
        y: placement.position.y,
        z: placement.position.z,
      },
      elevationLocked: placement.elevationLocked,
      rotation: placement.rotation
        ? {
            x: placement.rotation.x,
            y: placement.rotation.y,
            z: placement.rotation.z,
          }
        : undefined,
      metadata: placement.metadata ? { ...placement.metadata } : undefined,
    }
  }

  return {
    position: {
      x: placement.x,
      y: placement.y,
      z: placement.z,
    },
    elevationLocked: false,
  }
}

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
    case 'wall-system':
    case 'door-system':
    case 'window-system':
    case 'security-device':
    case 'smart-sensor':
    case 'smart-control':
      return 'logistics-south'
  }
}

export function listStaticAssetCatalog() {
  return STATIC_ASSET_CATALOG
}

export function getStaticAssetCatalogItem(id: string) {
  return STATIC_ASSET_CATALOG_BY_ID.get(id) ?? null
}

export function getStaticAssetKindLabel(assetKind: StaticAssetKind) {
  return STATIC_ASSET_KIND_LABELS[assetKind] ?? assetKind
}

export function getStaticAssetDomainLabel(domain: StaticAssetCatalogDomain) {
  return STATIC_ASSET_DOMAIN_LABELS[domain] ?? domain
}

export function getStaticAssetPlacementLabel(mode: StaticAssetPlacementMode) {
  return STATIC_ASSET_PLACEMENT_LABELS[mode] ?? mode
}

export function isWallHostAssetKind(assetKind: StaticAssetKind) {
  return assetKind === 'wall-system'
}

export function isDoorHostAssetKind(assetKind: StaticAssetKind) {
  return assetKind === 'door-system'
}

export function isHostedPlacementMode(mode: StaticAssetPlacementMode) {
  return (
    mode === 'wall-mounted' ||
    mode === 'ceiling-mounted' ||
    mode === 'opening-hosted'
  )
}

export function matchesStaticAssetCatalogDomain(
  item: StaticAssetCatalogItem,
  domain: StaticAssetCatalogDomain | 'all'
) {
  return domain === 'all' || item.domain === domain
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
  placement: Vector3 | StaticAssetPlacement
): StaticAssetInstance {
  const catalogItem =
    getStaticAssetCatalogItem(catalogId) ?? resolveStaticAssetCatalogItem('service-building')
  const now = Date.now()
  const normalizedPlacement = normalizePlacement(placement)
  const position = normalizedPlacement.position

  return {
    id: `static-asset-${generateId()}`,
    name: catalogItem.name,
    assetKind: catalogItem.assetKind,
    variant: catalogItem.variant,
    position: {
      x: position.x,
      y: normalizedPlacement.elevationLocked
        ? position.y
        : resolveStaticAssetPlacementElevation(catalogItem, position),
      z: position.z,
    },
    rotation: normalizedPlacement.rotation
      ? {
          x: normalizedPlacement.rotation.x,
          y: normalizedPlacement.rotation.y,
          z: normalizedPlacement.rotation.z,
        }
      : { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    metadata: {
      catalogId: catalogItem.id,
      domain: catalogItem.domain,
      subcategory: catalogItem.subcategory,
      placementMode: catalogItem.placementMode,
      tags: [...catalogItem.tags],
      ...normalizedPlacement.metadata,
    },
    createdAt: now,
    updatedAt: now,
  }
}
