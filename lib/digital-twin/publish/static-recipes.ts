import {
  CAMPUS_BOUNDS,
  CAMPUS_DISTRICTS,
  CAMPUS_LAYOUT_BLUEPRINTS,
  LOGISTICS_SOUTH_LAYOUT_BLUEPRINTS,
  LOGISTICS_BAY_OFFSETS,
  PROCESS_WEST_LAYOUT_BLUEPRINTS,
  TANK_EAST_LAYOUT_BLUEPRINTS,
  UTILITIES_NORTH_LAYOUT_BLUEPRINTS,
  type CampusSector,
  type LayoutBlueprint,
} from '../campus-layout'
import { resolveStaticAssetBlueprint } from '../static-asset-catalog'
import type { StaticAssetInstance, Vector3 } from '../types'
import type {
  PublishedStaticChunkRenderRecipe,
  PublishedStaticInstanceTransform,
  PublishedStaticInstancesGeometry,
  PublishedStaticMaterialRef,
  PublishedStaticMaterialToken,
  PublishedStaticMeshGeometry,
  PublishedStaticRenderNode,
  PublishedStaticTransform,
} from './types'

type VecTuple3 = [number, number, number]
type BoxArgs = [number, number, number]
type CylinderArgs = [number, number, number, number]
type SphereArgs = [number, number, number]
type TorusArgs = [number, number, number, number]

interface StaticInstanceSpec {
  key: string
  position: VecTuple3
  rotation?: VecTuple3
  scale?: VecTuple3
}

interface MaterialOverrides {
  emissiveToken?: PublishedStaticMaterialToken
  emissiveIntensity?: number
  opacity?: number
  transparent?: boolean
}

const PARKING_OFFSETS = [-82, -70, -58, 48, 60, 72, 84] as const
const ROAD_LINE_OFFSETS = [-84, -56, -28, 0, 28, 56, 84] as const
const LOGISTICS_MAIN_ROAD_Z = 54
const LOGISTICS_BUFFER_Z = 62
const LOGISTICS_LOADING_APRON_Z = 69
const SPHERE_SUPPORT_OFFSETS = [
  [-2.1, -2.1],
  [2.1, -2.1],
  [-2.1, 2.1],
  [2.1, 2.1],
  [0, -2.9],
  [0, 2.9],
] as const

const PROCESS_DISTRICT = CAMPUS_DISTRICTS.find((item) => item.id === 'process-west') ?? null
const TANK_DISTRICT = CAMPUS_DISTRICTS.find((item) => item.id === 'tank-east') ?? null
const LOGISTICS_DISTRICT = CAMPUS_DISTRICTS.find((item) => item.id === 'logistics-south') ?? null
const UTILITIES_DISTRICT = CAMPUS_DISTRICTS.find((item) => item.id === 'utilities-north') ?? null

const PROCESS_TRAIN_BLUEPRINTS = PROCESS_WEST_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'process-train'
)
const PROCESS_FRONT_STRIP_BLUEPRINT =
  PROCESS_WEST_LAYOUT_BLUEPRINTS.find((item) => item.kind === 'process-strip') ?? null
const PROCESS_CONTROL_ROOM_BLUEPRINT =
  PROCESS_WEST_LAYOUT_BLUEPRINTS.find((item) => item.kind === 'service-building') ?? null
const PROCESS_PIPE_RACK_BLUEPRINT =
  PROCESS_WEST_LAYOUT_BLUEPRINTS.find((item) => item.kind === 'pipe-rack') ?? null

const TANK_BUND_BLUEPRINTS = TANK_EAST_LAYOUT_BLUEPRINTS.filter((item) => item.kind === 'bund')
const TANK_VERTICAL_BLUEPRINTS = TANK_EAST_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'vertical-tank'
)
const TANK_SPHERE_BLUEPRINTS = TANK_EAST_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'sphere-tank'
)
const TANK_MANIFOLD_BLUEPRINT =
  TANK_EAST_LAYOUT_BLUEPRINTS.find((item) => item.kind === 'pump-manifold') ?? null
const TANK_SENSOR_BLUEPRINTS = TANK_EAST_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'smart-sensor'
)
const TANK_METERING_BLUEPRINT =
  TANK_EAST_LAYOUT_BLUEPRINTS.find((item) => item.kind === 'service-building') ?? null

const LOGISTICS_WAREHOUSE_BLUEPRINTS = LOGISTICS_SOUTH_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'logistics-warehouse'
)
const LOGISTICS_ADMIN_BLUEPRINTS = LOGISTICS_SOUTH_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'admin-building'
)
const LOGISTICS_EMERGENCY_BLUEPRINTS = LOGISTICS_SOUTH_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'emergency-station'
)
const LOGISTICS_RAIL_BLUEPRINTS = LOGISTICS_SOUTH_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'rail-spur'
)
const LOGISTICS_LOADING_RACK_BLUEPRINTS = LOGISTICS_SOUTH_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'loading-rack'
)
const LOGISTICS_WEIGHBRIDGE_BLUEPRINTS = LOGISTICS_SOUTH_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'weighbridge'
)
const LOGISTICS_SOLAR_CANOPY_BLUEPRINTS = LOGISTICS_SOUTH_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'solar-canopy'
)
const LOGISTICS_TRUCK_PARKING_BLUEPRINTS = LOGISTICS_SOUTH_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'truck-parking'
)
const LOGISTICS_SERVICE_BLUEPRINTS = LOGISTICS_SOUTH_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'service-building'
)
const LOGISTICS_SMART_CONTROL_BLUEPRINTS = LOGISTICS_SOUTH_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'smart-control'
)

const UTILITIES_FIRE_WATER_BLUEPRINTS = UTILITIES_NORTH_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'fire-water'
)
const UTILITIES_COOLING_TOWER_BLUEPRINTS = UTILITIES_NORTH_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'cooling-tower'
)
const UTILITIES_SUBSTATION_BLUEPRINTS = UTILITIES_NORTH_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'substation-yard'
)
const UTILITIES_SERVICE_BLUEPRINTS = UTILITIES_NORTH_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'service-building'
)
const UTILITIES_FLARE_STACK_BLUEPRINTS = UTILITIES_NORTH_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'flare-stack'
)
const UTILITIES_EMERGENCY_BLUEPRINTS = UTILITIES_NORTH_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'emergency-station'
)
const UTILITIES_GATEHOUSE_BLUEPRINTS = UTILITIES_NORTH_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'gatehouse'
)
const UTILITIES_SECURITY_BLUEPRINTS = UTILITIES_NORTH_LAYOUT_BLUEPRINTS.filter(
  (item) => item.kind === 'security-device'
)
const UTILITIES_PERIMETER_BLUEPRINT =
  UTILITIES_NORTH_LAYOUT_BLUEPRINTS.find((item) => item.kind === 'perimeter-fence') ?? null

function vec3(x: number, y: number, z: number): Vector3 {
  return { x, y, z }
}

function transformFields(transform: PublishedStaticTransform = {}) {
  return {
    ...(transform.position ? { position: { ...transform.position } } : {}),
    ...(transform.rotation ? { rotation: { ...transform.rotation } } : {}),
    ...(transform.scale ? { scale: { ...transform.scale } } : {}),
  }
}

function material(
  token: PublishedStaticMaterialToken,
  metalness: number,
  roughness: number,
  overrides: MaterialOverrides = {}
): PublishedStaticMaterialRef {
  return {
    token,
    metalness,
    roughness,
    ...(overrides.emissiveToken ? { emissiveToken: overrides.emissiveToken } : {}),
    ...(typeof overrides.emissiveIntensity === 'number'
      ? { emissiveIntensity: overrides.emissiveIntensity }
      : {}),
    ...(typeof overrides.opacity === 'number' ? { opacity: overrides.opacity } : {}),
    ...(typeof overrides.transparent === 'boolean' ? { transparent: overrides.transparent } : {}),
  }
}

function toInstanceTransform(spec: StaticInstanceSpec): PublishedStaticInstanceTransform {
  return {
    key: spec.key,
    position: vec3(spec.position[0], spec.position[1], spec.position[2]),
    ...(spec.rotation
      ? { rotation: vec3(spec.rotation[0], spec.rotation[1], spec.rotation[2]) }
      : {}),
    ...(spec.scale ? { scale: vec3(spec.scale[0], spec.scale[1], spec.scale[2]) } : {}),
  }
}

function groupNode(
  id: string,
  children: Array<PublishedStaticRenderNode | null>,
  transform: PublishedStaticTransform = {}
): PublishedStaticRenderNode {
  return {
    id,
    kind: 'group',
    children: children.filter((child): child is PublishedStaticRenderNode => child !== null),
    ...transformFields(transform),
  }
}

function meshNode(
  id: string,
  geometry: PublishedStaticMeshGeometry,
  nodeMaterial: PublishedStaticMaterialRef,
  options: PublishedStaticTransform & { castShadow?: boolean; receiveShadow?: boolean } = {}
): PublishedStaticRenderNode {
  return {
    id,
    kind: 'mesh',
    geometry,
    material: nodeMaterial,
    ...transformFields(options),
    ...(options.castShadow ? { castShadow: true } : {}),
    ...(options.receiveShadow ? { receiveShadow: true } : {}),
  }
}

function instancesNode(
  id: string,
  geometry: PublishedStaticInstancesGeometry,
  nodeMaterial: PublishedStaticMaterialRef,
  instances: StaticInstanceSpec[],
  options: { castShadow?: boolean; receiveShadow?: boolean } = {}
): PublishedStaticRenderNode | null {
  if (instances.length === 0) return null

  return {
    id,
    kind: 'instances',
    geometry,
    material: nodeMaterial,
    instances: instances.map(toInstanceTransform),
    ...(options.castShadow ? { castShadow: true } : {}),
    ...(options.receiveShadow ? { receiveShadow: true } : {}),
  }
}

function boxGeometry(args: BoxArgs): PublishedStaticMeshGeometry {
  return { kind: 'box', args }
}

function cylinderGeometry(args: CylinderArgs): PublishedStaticMeshGeometry {
  return { kind: 'cylinder', args }
}

function sphereGeometry(args: SphereArgs): PublishedStaticMeshGeometry {
  return { kind: 'sphere', args }
}

function torusGeometry(args: TorusArgs): PublishedStaticMeshGeometry {
  return { kind: 'torus', args }
}

function boxInstancesGeometry(args: BoxArgs): PublishedStaticInstancesGeometry {
  return { kind: 'box', args }
}

function cylinderInstancesGeometry(args: CylinderArgs): PublishedStaticInstancesGeometry {
  return { kind: 'cylinder', args }
}

function resolveProcessTowerHeights(blueprint: LayoutBlueprint): number[] {
  switch (blueprint.variant) {
    case 'fractionation':
      return [blueprint.height - 0.5, blueprint.height - 4, blueprint.height - 8]
    case 'reactor':
      return [blueprint.height - 1, blueprint.height - 6]
    default:
      return [blueprint.height - 2, blueprint.height - 5]
  }
}

function resolveVerticalTankLayout(blueprint: LayoutBlueprint) {
  if (blueprint.variant === 'day-tank') {
    return {
      tankOffsets: [
        [-4.4, 0],
        [4.4, 0],
      ] as const,
      radius: 2.2,
      height: 7.2,
    }
  }

  return {
    tankOffsets: [
      [-5.2, 0],
      [5.2, 0],
    ] as const,
    radius: 2.8,
    height: 9.4,
  }
}

function createDistrictSlabNode(
  id: string,
  center: VecTuple3,
  size: VecTuple3,
  fillToken: PublishedStaticMaterialToken
) {
  const [x, y, z] = center
  const [width, height, depth] = size
  const halfWidth = width / 2
  const halfDepth = depth / 2

  return groupNode(id, [
    meshNode(
      `${id}:fill`,
      boxGeometry([width, height, depth]),
      material(fillToken, 0.05, 0.96),
      {
        position: vec3(x, y, z),
        receiveShadow: true,
      }
    ),
    instancesNode(
      `${id}:horizontal-curbs`,
      boxInstancesGeometry([width, 0.68, 0.6]),
      material('curb', 0.08, 0.78),
      [
        { key: `${id}:curb-front`, position: [x, y + 0.34, z - halfDepth + 0.3] },
        { key: `${id}:curb-rear`, position: [x, y + 0.34, z + halfDepth - 0.3] },
      ]
    ),
    instancesNode(
      `${id}:vertical-curbs`,
      boxInstancesGeometry([0.6, 0.68, depth]),
      material('curb', 0.08, 0.78),
      [
        { key: `${id}:curb-left`, position: [x - halfWidth + 0.3, y + 0.34, z] },
        { key: `${id}:curb-right`, position: [x + halfWidth - 0.3, y + 0.34, z] },
      ]
    ),
  ])
}

function createPipeBridgeNode(
  id: string,
  from: VecTuple3,
  to: VecTuple3,
  supportHeight: number
) {
  const dx = to[0] - from[0]
  const dz = to[2] - from[2]
  const length = Math.hypot(dx, dz)
  const yaw = Math.atan2(dx, dz)
  const supportCount = Math.max(2, Math.floor(length / 14))
  const step = length / supportCount
  const supportInstances: StaticInstanceSpec[] = Array.from(
    { length: supportCount + 1 },
    (_value, index) => {
      const localZ = index * step
      return [
        {
          key: `${id}:support-left-${index}`,
          position: [-1.2, supportHeight / 2, localZ] as VecTuple3,
        },
        {
          key: `${id}:support-right-${index}`,
          position: [1.2, supportHeight / 2, localZ] as VecTuple3,
        },
      ]
    }
  ).flat()

  return groupNode(
    id,
    [
      instancesNode(
        `${id}:supports`,
        boxInstancesGeometry([0.38, supportHeight, 0.38]),
        material('steel', 0.68, 0.34),
        supportInstances
      ),
      meshNode(
        `${id}:lower-deck`,
        boxGeometry([3.4, 0.36, length]),
        material('steelDark', 0.7, 0.34),
        {
          position: vec3(0, supportHeight + 0.18, length / 2),
        }
      ),
      meshNode(
        `${id}:pipe-left`,
        cylinderGeometry([0.2, 0.2, length, 14]),
        material('pipe', 0.58, 0.36),
        {
          position: vec3(-0.72, supportHeight + 0.76, length / 2),
          rotation: vec3(Math.PI / 2, 0, 0),
        }
      ),
      meshNode(
        `${id}:pipe-center`,
        cylinderGeometry([0.24, 0.24, length, 16]),
        material('pipe', 0.58, 0.36),
        {
          position: vec3(0, supportHeight + 0.56, length / 2),
          rotation: vec3(Math.PI / 2, 0, 0),
        }
      ),
      meshNode(
        `${id}:pipe-right`,
        cylinderGeometry([0.16, 0.16, length, 14]),
        material('pipe', 0.58, 0.36),
        {
          position: vec3(0.76, supportHeight + 0.9, length / 2),
          rotation: vec3(Math.PI / 2, 0, 0),
        }
      ),
      meshNode(
        `${id}:upper-deck`,
        boxGeometry([3.8, 0.18, length]),
        material('steelDark', 0.62, 0.38),
        {
          position: vec3(0, supportHeight + 1.36, length / 2),
        }
      ),
    ],
    {
      position: vec3(from[0], 0, from[2]),
      rotation: vec3(0, yaw, 0),
    }
  )
}

function createLinearPipeRackNode(id: string, blueprint: LayoutBlueprint) {
  const supportHeight = Math.max(1, blueprint.height - 1.08)
  const supportOffset = 0.55
  const supportMargin = supportOffset + 0.17
  const supportCount = Math.max(2, Math.floor(blueprint.width / 12))
  const step = (blueprint.width - supportMargin * 2) / supportCount
  const startX = -blueprint.width / 2 + supportMargin
  const supportInstances: StaticInstanceSpec[] = Array.from(
    { length: supportCount + 1 },
    (_value, index) => {
      const localX = startX + index * step
      return [
        {
          key: `${id}:left-${index}`,
          position: [localX - supportOffset, supportHeight / 2, 0] as VecTuple3,
        },
        {
          key: `${id}:right-${index}`,
          position: [localX + supportOffset, supportHeight / 2, 0] as VecTuple3,
        },
      ]
    }
  ).flat()

  return groupNode(
    id,
    [
      meshNode(
        `${id}:base`,
        boxGeometry([blueprint.width, 0.44, blueprint.depth]),
        material('slabAlt', 0.06, 0.94),
        {
          position: vec3(0, 0.22, 0),
          receiveShadow: true,
        }
      ),
      instancesNode(
        `${id}:supports`,
        boxInstancesGeometry([0.34, supportHeight, 0.34]),
        material('steel', 0.68, 0.34),
        supportInstances
      ),
      meshNode(
        `${id}:deck`,
        boxGeometry([blueprint.width, 0.32, blueprint.depth]),
        material('steelDark', 0.66, 0.36),
        {
          position: vec3(0, supportHeight + 0.2, 0),
        }
      ),
      ...[-0.62, 0, 0.62].map((offset) =>
        meshNode(
          `${id}:pipe-${offset}`,
          cylinderGeometry([
            0.16 + Math.abs(offset) * 0.04,
            0.16 + Math.abs(offset) * 0.04,
            blueprint.width,
            16,
          ]),
          material('pipe', 0.58, 0.36),
          {
            position: vec3(0, supportHeight + 0.76 + Math.abs(offset) * 0.18, offset),
            rotation: vec3(0, 0, Math.PI / 2),
          }
        )
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createProcessTrainNode(id: string, blueprint: LayoutBlueprint) {
  const halfWidth = blueprint.width / 2
  const halfDepth = blueprint.depth / 2
  const towerHeights = resolveProcessTowerHeights(blueprint)
  const towerOffsets =
    towerHeights.length === 3
      ? [-halfWidth + 3.2, 0, halfWidth - 3.2]
      : [-halfWidth + 4, halfWidth - 4]
  const frameOffsets = [-halfWidth + 2.4, 0, halfWidth - 2.4]
  const frameInstances: StaticInstanceSpec[] = frameOffsets.flatMap((offset) => [
    { key: `${id}:frame-front-${offset}`, position: [offset, 4.6, -1.6] },
    { key: `${id}:frame-rear-${offset}`, position: [offset, 4.6, 3.2] },
  ])

  return groupNode(
    id,
    [
      meshNode(
        `${id}:base`,
        boxGeometry([blueprint.width, 0.48, blueprint.depth]),
        material('slab', 0.06, 0.94),
        {
          position: vec3(0, 0.24, 0),
          receiveShadow: true,
        }
      ),
      instancesNode(
        `${id}:frames`,
        boxInstancesGeometry([0.58, 9.2, 0.58]),
        material('steel', 0.68, 0.36),
        frameInstances
      ),
      ...[4.4, 8.2].flatMap((level) => [
        meshNode(
          `${id}:deck-${level}`,
          boxGeometry([blueprint.width - 3.2, 0.22, blueprint.depth - 5.6]),
          material('steelDark', 0.56, 0.44),
          {
            position: vec3(0, level, -0.6),
          }
        ),
        meshNode(
          `${id}:deck-front-rail-${level}`,
          boxGeometry([blueprint.width - 2.8, 0.16, 0.34]),
          material('steelDark', 0.62, 0.38),
          {
            position: vec3(0, level + 0.18, halfDepth - 3.6),
          }
        ),
        meshNode(
          `${id}:deck-rear-rail-${level}`,
          boxGeometry([blueprint.width - 2.8, 0.16, 0.34]),
          material('steelDark', 0.62, 0.38),
          {
            position: vec3(0, level + 0.18, -halfDepth + 2.8),
          }
        ),
      ]),
      ...towerHeights.map((height, index) =>
        meshNode(
          `${id}:tower-${index}`,
          cylinderGeometry([1.02 - index * 0.12, 1.16 - index * 0.08, height, 24]),
          material('vessel', 0.58, 0.3),
          {
            position: vec3(
              towerOffsets[index] ?? 0,
              height / 2 + 0.5,
              -halfDepth + 3.6 + index * 1.2
            ),
            castShadow: true,
          }
        )
      ),
      ...[-halfWidth + 3.4, 0, halfWidth - 3.4].map((offset, index) =>
        meshNode(
          `${id}:exchanger-${index}`,
          cylinderGeometry([0.74, 0.74, blueprint.width * 0.22, 16]),
          material('pipe', 0.54, 0.4),
          {
            position: vec3(offset, 1.9 + (index % 2) * 0.4, halfDepth - 2.6),
            rotation: vec3(0, 0, Math.PI / 2),
          }
        )
      ),
      meshNode(
        `${id}:main-pipe`,
        cylinderGeometry([0.24, 0.24, blueprint.width - 4, 14]),
        material('pipe', 0.58, 0.36),
        {
          position: vec3(0, 2.8, 0),
          rotation: vec3(0, 0, Math.PI / 2),
        }
      ),
      meshNode(
        `${id}:front-pipe`,
        cylinderGeometry([0.18, 0.18, blueprint.width - 4.6, 14]),
        material('pipe', 0.58, 0.36),
        {
          position: vec3(0, 3.6, -halfDepth + 4.2),
          rotation: vec3(0, 0, Math.PI / 2),
        }
      ),
      meshNode(
        `${id}:service-box`,
        boxGeometry([2.8, 2.4, 2.2]),
        material('building', 0.26, 0.6),
        {
          position: vec3(halfWidth - 2.4, 1.2, halfDepth - 2.6),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createProcessFrontStripNode(id: string, blueprint: LayoutBlueprint) {
  const exchangerOffsets = [-18, -6, 6, 18]
  const exchangerPipeInstances: StaticInstanceSpec[] = exchangerOffsets.map((offset) => ({
    key: `${id}:bank-pipe-${offset}`,
    position: [offset, 1.4, -1.2],
    rotation: [0, 0, Math.PI / 2],
  }))
  const exchangerBodyInstances: StaticInstanceSpec[] = exchangerOffsets.map((offset) => ({
    key: `${id}:bank-body-${offset}`,
    position: [offset, 0.86, 1.6],
  }))

  return groupNode(
    id,
    [
      meshNode(
        `${id}:base`,
        boxGeometry([blueprint.width, 0.36, blueprint.depth]),
        material('slabAlt', 0.06, 0.94),
        {
          position: vec3(0, 0.18, 0),
        }
      ),
      instancesNode(
        `${id}:exchanger-pipes`,
        cylinderInstancesGeometry([0.68, 0.68, 4.8, 16]),
        material('pipe', 0.54, 0.38),
        exchangerPipeInstances
      ),
      instancesNode(
        `${id}:exchanger-bodies`,
        boxInstancesGeometry([2.6, 1.72, 1.8]),
        material('building', 0.22, 0.62),
        exchangerBodyInstances
      ),
      meshNode(
        `${id}:header-main`,
        cylinderGeometry([0.22, 0.22, blueprint.width - 6, 16]),
        material('pipe', 0.58, 0.36),
        {
          position: vec3(0, 3.2, 0),
          rotation: vec3(0, 0, Math.PI / 2),
        }
      ),
      meshNode(
        `${id}:header-secondary`,
        cylinderGeometry([0.16, 0.16, blueprint.width - 10, 14]),
        material('pipe', 0.58, 0.36),
        {
          position: vec3(0, 3.9, -1.4),
          rotation: vec3(0, 0, Math.PI / 2),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createServiceBuildingNode(id: string, blueprint: LayoutBlueprint) {
  const roofHeight = 0.32
  const bodyHeight = Math.max(0.6, blueprint.height - roofHeight)

  return groupNode(
    id,
    [
      meshNode(
        `${id}:body`,
        boxGeometry([blueprint.width, bodyHeight, blueprint.depth]),
        material('building', 0.2, 0.68),
        {
          position: vec3(0, bodyHeight / 2, 0),
        }
      ),
      meshNode(
        `${id}:roof`,
        boxGeometry([blueprint.width, roofHeight, blueprint.depth]),
        material('steelDark', 0.46, 0.42),
        {
          position: vec3(0, bodyHeight + roofHeight / 2, 0),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createWarehouseNode(id: string, blueprint: LayoutBlueprint) {
  const dockOffsets = [-12, -6, 0, 6, 12]
  const ventOffsets = [-12, -4, 4, 12]
  const roofHeight = 0.42
  const ventHeight = 0.8
  const bodyHeight = Math.max(2, blueprint.height - roofHeight - ventHeight)

  return groupNode(
    id,
    [
      meshNode(
        `${id}:body`,
        boxGeometry([blueprint.width, bodyHeight, blueprint.depth]),
        material('building', 0.18, 0.68),
        {
          position: vec3(0, bodyHeight / 2, 0),
        }
      ),
      meshNode(
        `${id}:roof`,
        boxGeometry([blueprint.width, roofHeight, blueprint.depth]),
        material('steelDark', 0.56, 0.38),
        {
          position: vec3(0, bodyHeight + roofHeight / 2, 0),
        }
      ),
      instancesNode(
        `${id}:dock-doors`,
        boxInstancesGeometry([3.2, 3.2, 0.18]),
        material('steelDark', 0.34, 0.42),
        dockOffsets.map((offset) => ({
          key: `${id}:dock-${offset}`,
          position: [offset, 1.8, -blueprint.depth / 2 + 0.09],
        }))
      ),
      instancesNode(
        `${id}:dock-bumpers`,
        boxInstancesGeometry([3.7, 0.26, 0.22]),
        material('warning', 0.22, 0.58),
        dockOffsets.map((offset) => ({
          key: `${id}:bumper-${offset}`,
          position: [offset, 0.34, -blueprint.depth / 2 + 0.11],
        }))
      ),
      instancesNode(
        `${id}:roof-vents`,
        cylinderInstancesGeometry([0.46, 0.56, 0.8, 14]),
        material('vessel', 0.42, 0.38),
        ventOffsets.map((offset) => ({
          key: `${id}:vent-${offset}`,
          position: [offset, bodyHeight + roofHeight + ventHeight / 2, 0],
        }))
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createAdminBuildingNode(id: string, blueprint: LayoutBlueprint) {
  const windowOffsets = [-12, -8, -4, 4, 8, 12]
  const canopyDepth = Math.min(3.2, blueprint.depth * 0.45)

  return groupNode(
    id,
    [
      meshNode(
        `${id}:podium`,
        boxGeometry([blueprint.width, blueprint.height * 0.52, blueprint.depth]),
        material('building', 0.18, 0.64),
        {
          position: vec3(0, blueprint.height * 0.26, 0),
        }
      ),
      meshNode(
        `${id}:upper-volume`,
        boxGeometry([blueprint.width * 0.78, blueprint.height * 0.48, blueprint.depth * 0.76]),
        material('steelDark', 0.34, 0.42),
        {
          position: vec3(0, blueprint.height * 0.76, -0.2),
        }
      ),
      instancesNode(
        `${id}:front-windows`,
        boxInstancesGeometry([2.1, 0.8, 0.08]),
        material('water', 0.08, 0.12),
        windowOffsets.flatMap((offset) => [
          {
            key: `${id}:window-low-${offset}`,
            position: [offset, blueprint.height * 0.36, -blueprint.depth / 2 + 0.04],
          },
          {
            key: `${id}:window-high-${offset}`,
            position: [offset, blueprint.height * 0.72, -blueprint.depth / 2 + 0.04],
          },
        ])
      ),
      meshNode(
        `${id}:entrance-canopy`,
        boxGeometry([9, 0.24, canopyDepth]),
        material('canopy', 0.6, 0.34),
        {
          position: vec3(0, 3.4, -blueprint.depth / 2 + canopyDepth / 2),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createEmergencyStationNode(id: string, blueprint: LayoutBlueprint) {
  const bayOffsets = [-5, 0, 5]
  const beaconRadius = 0.42
  const bodyHeight = Math.max(2.2, blueprint.height * 0.68)
  const towerHeight = Math.max(3, blueprint.height - beaconRadius * 2)

  return groupNode(
    id,
    [
      meshNode(
        `${id}:body`,
        boxGeometry([blueprint.width, bodyHeight, blueprint.depth]),
        material('building', 0.18, 0.62),
        {
          position: vec3(0, bodyHeight / 2, 0),
        }
      ),
      instancesNode(
        `${id}:vehicle-bays`,
        boxInstancesGeometry([4.2, 3.4, 0.2]),
        material('warning', 0.18, 0.44),
        bayOffsets.map((offset) => ({
          key: `${id}:bay-${offset}`,
          position: [offset, Math.min(1.85, bodyHeight - 1.7), -blueprint.depth / 2 + 0.1],
        }))
      ),
      meshNode(
        `${id}:watch-tower`,
        boxGeometry([3.2, towerHeight, 3.2]),
        material('steelDark', 0.44, 0.38),
        {
          position: vec3(blueprint.width / 2 - 2.6, towerHeight / 2, 0),
        }
      ),
      meshNode(
        `${id}:beacon`,
        sphereGeometry([beaconRadius, 12, 8]),
        material('warning', 0.02, 0.34),
        {
          position: vec3(blueprint.width / 2 - 2.6, blueprint.height - beaconRadius, 0),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createRailSpurNode(id: string, blueprint: LayoutBlueprint) {
  const tieCount = Math.max(8, Math.floor(blueprint.width / 3.2))
  const tieWidth = 1.8
  const tieStart = -blueprint.width / 2 + tieWidth / 2
  const tieStep = (blueprint.width - tieWidth) / tieCount
  const endStopHeight = Math.max(0.3, blueprint.height - 0.16)
  const ties: StaticInstanceSpec[] = Array.from({ length: tieCount + 1 }, (_value, index) => ({
    key: `${id}:tie-${index}`,
    position: [tieStart + index * tieStep, 0.18, 0],
  }))
  const stopOffsets = [-blueprint.width / 2 + 8, blueprint.width / 2 - 8]

  return groupNode(
    id,
    [
      meshNode(
        `${id}:ballast`,
        boxGeometry([blueprint.width, 0.22, blueprint.depth]),
        material('slabAlt', 0.04, 0.96),
        {
          position: vec3(0, 0.11, 0),
          receiveShadow: true,
        }
      ),
      instancesNode(
        `${id}:ties`,
        boxInstancesGeometry([tieWidth, 0.16, 2.6]),
        material('curb', 0.08, 0.82),
        ties
      ),
      ...[-0.78, 0.78].map((zOffset) =>
        meshNode(
          `${id}:rail-${zOffset}`,
          boxGeometry([blueprint.width - 2, 0.18, 0.16]),
          material('steelDark', 0.66, 0.32),
          {
            position: vec3(0, 0.42, zOffset),
          }
        )
      ),
      instancesNode(
        `${id}:end-stops`,
        boxInstancesGeometry([0.36, endStopHeight, 2.8]),
        material('warning', 0.24, 0.56),
        stopOffsets.map((offset) => ({
          key: `${id}:stop-${offset}`,
          position: [offset, 0.08 + endStopHeight / 2, 0],
        }))
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createWeighbridgeNode(id: string, blueprint: LayoutBlueprint) {
  const boothWidth = 3.4

  return groupNode(
    id,
    [
      meshNode(
        `${id}:deck`,
        boxGeometry([blueprint.width, 0.28, blueprint.depth]),
        material('steelDark', 0.54, 0.4),
        {
          position: vec3(0, 0.14, 0),
          receiveShadow: true,
        }
      ),
      meshNode(
        `${id}:booth`,
        boxGeometry([3.4, 2.8, 2.6]),
        material('building', 0.18, 0.62),
        {
          position: vec3(-blueprint.width / 2 + boothWidth / 2, 1.4, 0),
        }
      ),
      meshNode(
        `${id}:display`,
        boxGeometry([1.4, 0.48, 0.12]),
        material('power', 0.08, 0.16),
        {
          position: vec3(blueprint.width / 2 - 0.7, 2.4, -blueprint.depth / 2 + 0.06),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createSolarCanopyNode(id: string, blueprint: LayoutBlueprint) {
  const postOffsets = [-blueprint.width / 2 + 3, 0, blueprint.width / 2 - 3]
  const panelOffsets = [-blueprint.width / 4, blueprint.width / 4]
  const panelDepth = Math.max(0.5, blueprint.depth - 0.8)

  return groupNode(
    id,
    [
      instancesNode(
        `${id}:posts`,
        boxInstancesGeometry([0.34, blueprint.height, 0.34]),
        material('steel', 0.68, 0.34),
        postOffsets.flatMap((offset) => [
          { key: `${id}:post-front-${offset}`, position: [offset, blueprint.height / 2, -blueprint.depth / 2 + 1] },
          { key: `${id}:post-rear-${offset}`, position: [offset, blueprint.height / 2, blueprint.depth / 2 - 1] },
        ])
      ),
      instancesNode(
        `${id}:solar-panels`,
        boxInstancesGeometry([blueprint.width / 2 - 1.2, 0.16, panelDepth]),
        material('water', 0.16, 0.08),
        panelOffsets.map((offset) => ({
          key: `${id}:panel-${offset}`,
          position: [offset, blueprint.height - 0.6, 0],
          rotation: [0.08, 0, 0],
        }))
      ),
      meshNode(
        `${id}:inverter`,
        boxGeometry([2.4, 1.6, 1.2]),
        material('power', 0.48, 0.32),
        {
          position: vec3(-blueprint.width / 2 + 2.2, 0.8, blueprint.depth / 2 - 0.6),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createTruckParkingNode(id: string, blueprint: LayoutBlueprint) {
  const bayOffsets = [-20, -10, 0, 10, 20]

  return groupNode(
    id,
    [
      meshNode(
        `${id}:surface`,
        boxGeometry([blueprint.width, 0.12, blueprint.depth]),
        material('road', 0.05, 0.9),
        {
          position: vec3(0, 0.06, 0),
          receiveShadow: true,
        }
      ),
      instancesNode(
        `${id}:bay-lines`,
        boxInstancesGeometry([0.24, 0.04, blueprint.depth - 1]),
        material('stripe', 0.02, 0.92),
        bayOffsets.map((offset) => ({
          key: `${id}:bay-${offset}`,
          position: [offset, 0.14, 0],
        }))
      ),
      meshNode(
        `${id}:hazmat-label`,
        boxGeometry([12, 0.04, 0.36]),
        material('warning', 0.12, 0.6),
        {
          position: vec3(0, 0.16, -blueprint.depth / 2 + 1),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createWaterTreatmentNode(id: string, blueprint: LayoutBlueprint) {
  const basinOffsets = [-blueprint.width / 4, blueprint.width / 4]
  const basinHeight = Math.min(1.8, blueprint.height * 0.56)
  const pipeY = blueprint.height - 0.18

  return groupNode(
    id,
    [
      instancesNode(
        `${id}:basin-shells`,
        boxInstancesGeometry([blueprint.width / 2 - 2, basinHeight, blueprint.depth - 2]),
        material('curb', 0.04, 0.86),
        basinOffsets.map((offset) => ({
          key: `${id}:basin-${offset}`,
          position: [offset, basinHeight / 2, 0],
        }))
      ),
      instancesNode(
        `${id}:water-surfaces`,
        boxInstancesGeometry([blueprint.width / 2 - 3, 0.08, blueprint.depth - 3]),
        material('water', 0.08, 0.18),
        basinOffsets.map((offset) => ({
          key: `${id}:water-${offset}`,
          position: [offset, basinHeight + 0.05, 0],
        }))
      ),
      meshNode(
        `${id}:pipe-bridge`,
        cylinderGeometry([0.18, 0.18, blueprint.width - 6, 14]),
        material('pipe', 0.56, 0.36),
        {
          position: vec3(0, pipeY, 0),
          rotation: vec3(0, 0, Math.PI / 2),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createCoolingTowerNode(id: string, blueprint: LayoutBlueprint) {
  const towerCount = Math.max(1, Math.round(blueprint.width / 14))
  const towerSlotWidth = blueprint.width / towerCount
  const bodyRadius = Math.min(towerSlotWidth * 0.24, blueprint.depth * 0.24)
  const bodyHeight = blueprint.height * 0.72
  const capHeight = Math.max(0.3, blueprint.height * 0.05)
  const towerOffsets = Array.from({ length: towerCount }, (_value, index) =>
    -blueprint.width / 2 + towerSlotWidth * (index + 0.5)
  )

  return groupNode(
    id,
    [
      meshNode(
        `${id}:basin`,
        boxGeometry([blueprint.width, 0.8, blueprint.depth]),
        material('curb', 0.04, 0.88),
        {
          position: vec3(0, 0.4, 0),
          receiveShadow: true,
        }
      ),
      meshNode(
        `${id}:basin-water`,
        boxGeometry([blueprint.width - 2, 0.08, blueprint.depth - 2]),
        material('water', 0.08, 0.2),
        {
          position: vec3(0, 0.86, 0),
        }
      ),
      instancesNode(
        `${id}:tower-bodies`,
        cylinderInstancesGeometry([bodyRadius, bodyRadius * 1.18, bodyHeight, 24]),
        material('vessel', 0.36, 0.5),
        towerOffsets.map((offset) => ({
          key: `${id}:tower-body-${offset}`,
          position: [offset, 0.8 + bodyHeight / 2, 0],
        })),
        { castShadow: true }
      ),
      instancesNode(
        `${id}:tower-caps`,
        cylinderInstancesGeometry([bodyRadius * 1.32, bodyRadius * 1.44, capHeight, 24]),
        material('vessel', 0.42, 0.42),
        towerOffsets.map((offset) => ({
          key: `${id}:tower-cap-${offset}`,
          position: [offset, blueprint.height - capHeight / 2, 0],
        }))
      ),
      meshNode(
        `${id}:header-pipe`,
        cylinderGeometry([0.18, 0.18, blueprint.width - 3, 14]),
        material('pipe', 0.58, 0.36),
        {
          position: vec3(0, blueprint.height * 0.58, -blueprint.depth / 2 + 1.6),
          rotation: vec3(0, 0, Math.PI / 2),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createSubstationYardNode(id: string, blueprint: LayoutBlueprint) {
  const frameCount = Math.max(2, Math.round(blueprint.width / 9))
  const frameSlotWidth = blueprint.width / frameCount
  const frameOffsets = Array.from({ length: frameCount }, (_value, index) =>
    -blueprint.width / 2 + frameSlotWidth * (index + 0.5)
  )
  const transformerOffsets = frameOffsets.slice(0, Math.max(1, frameCount - 1))

  return groupNode(
    id,
    [
      meshNode(
        `${id}:base`,
        boxGeometry([blueprint.width, 0.36, blueprint.depth]),
        material('slab', 0.06, 0.92),
        {
          position: vec3(0, 0.18, 0),
          receiveShadow: true,
        }
      ),
      instancesNode(
        `${id}:posts`,
        boxInstancesGeometry([0.28, blueprint.height * 0.86, 0.28]),
        material('power', 0.58, 0.3),
        frameOffsets.flatMap((offset) => [
          { key: `${id}:post-front-${offset}`, position: [offset, blueprint.height * 0.43, -blueprint.depth / 2 + 2] },
          { key: `${id}:post-rear-${offset}`, position: [offset, blueprint.height * 0.43, blueprint.depth / 2 - 2] },
        ])
      ),
      instancesNode(
        `${id}:top-beams`,
        boxInstancesGeometry([frameSlotWidth * 0.72, 0.22, 0.22]),
        material('power', 0.58, 0.3),
        frameOffsets.map((offset) => ({
          key: `${id}:top-beam-${offset}`,
          position: [offset, blueprint.height * 0.8, 0],
        }))
      ),
      instancesNode(
        `${id}:bus-bars`,
        boxInstancesGeometry([0.2, 0.18, blueprint.depth - 4]),
        material('power', 0.58, 0.3),
        frameOffsets.map((offset) => ({
          key: `${id}:bus-bar-${offset}`,
          position: [offset, blueprint.height * 0.62, 0],
        }))
      ),
      instancesNode(
        `${id}:transformers`,
        boxInstancesGeometry([frameSlotWidth * 0.46, blueprint.height * 0.26, blueprint.depth * 0.26]),
        material('steelDark', 0.5, 0.42),
        transformerOffsets.map((offset) => ({
          key: `${id}:transformer-${offset}`,
          position: [offset, blueprint.height * 0.13 + 0.28, blueprint.depth * 0.2],
        }))
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createFlareStackNode(id: string, blueprint: LayoutBlueprint) {
  const stackHeight = Math.max(4, blueprint.height - 1.2)
  const radius = Math.min(0.68, Math.max(0.42, Math.min(blueprint.width, blueprint.depth) * 0.1))
  const tipRadius = radius * 0.82

  return groupNode(
    id,
    [
      meshNode(
        `${id}:base`,
        boxGeometry([blueprint.width, 0.36, blueprint.depth]),
        material('slab', 0.06, 0.92),
        {
          position: vec3(0, 0.18, 0),
          receiveShadow: true,
        }
      ),
      meshNode(
        `${id}:stack`,
        cylinderGeometry([radius * 0.82, radius, stackHeight, 14]),
        material('vessel', 0.5, 0.28),
        {
          position: vec3(0, stackHeight / 2 + 0.8, 0),
        }
      ),
      meshNode(
        `${id}:tip`,
        sphereGeometry([tipRadius, 12, 12]),
        material('flare', 0, 1, {
          emissiveToken: 'flare',
          emissiveIntensity: 0.85,
        }),
        {
          position: vec3(0, blueprint.height - tipRadius, 0),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createGatehouseNode(id: string, blueprint: LayoutBlueprint) {
  const barrierWidth = 7

  return groupNode(
    id,
    [
      meshNode(
        `${id}:booth`,
        boxGeometry([6, blueprint.height, blueprint.depth]),
        material('building', 0.18, 0.62),
        {
          position: vec3(-blueprint.width / 2 + 3, blueprint.height / 2, 0),
        }
      ),
      meshNode(
        `${id}:portal`,
        boxGeometry([blueprint.width, 0.5, 1]),
        material('steelDark', 0.56, 0.36),
        {
          position: vec3(0, blueprint.height - 0.25, 0),
        }
      ),
      instancesNode(
        `${id}:barrier-arms`,
        boxInstancesGeometry([7, 0.16, 0.18]),
        material('warning', 0.18, 0.52),
        [
          {
            key: `${id}:barrier-west`,
            position: [-blueprint.width / 2 + barrierWidth / 2, 1.15, -blueprint.depth / 2 + 0.09],
            rotation: [0, 0, 0.08],
          },
          {
            key: `${id}:barrier-east`,
            position: [blueprint.width / 2 - barrierWidth / 2, 1.15, blueprint.depth / 2 - 0.09],
            rotation: [0, 0, -0.08],
          },
        ]
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createPerimeterFenceNode(id: string, blueprint: LayoutBlueprint) {
  const halfWidth = blueprint.width / 2
  const halfDepth = blueprint.depth / 2
  const edgeInset = 0.1
  const spacing = 12
  const xCount = Math.floor(blueprint.width / spacing)
  const zCount = Math.floor(blueprint.depth / spacing)
  const fenceHeight = Math.min(3.4, blueprint.height * 0.48)
  const lightPoleHeight = Math.max(1, blueprint.height - fenceHeight - 0.18)
  const lightPoleY = fenceHeight + lightPoleHeight / 2
  const lightHeadY = blueprint.height - 0.09
  const posts: StaticInstanceSpec[] = [
    ...Array.from({ length: xCount + 1 }, (_value, index) => {
      const x = -halfWidth + edgeInset + index * ((blueprint.width - edgeInset * 2) / xCount)
      return [
        {
          key: `${id}:post-n-${index}`,
          position: [x, fenceHeight / 2, -halfDepth + edgeInset] as VecTuple3,
        },
        {
          key: `${id}:post-s-${index}`,
          position: [x, fenceHeight / 2, halfDepth - edgeInset] as VecTuple3,
        },
      ]
    }).flat(),
    ...Array.from({ length: zCount - 1 }, (_value, index) => {
      const z = -halfDepth + edgeInset + (index + 1) * ((blueprint.depth - edgeInset * 2) / zCount)
      return [
        {
          key: `${id}:post-w-${index}`,
          position: [-halfWidth + edgeInset, fenceHeight / 2, z] as VecTuple3,
        },
        {
          key: `${id}:post-e-${index}`,
          position: [halfWidth - edgeInset, fenceHeight / 2, z] as VecTuple3,
        },
      ]
    }).flat(),
  ]
  const lightPolePosts: StaticInstanceSpec[] = [-84, -42, 42, 84].flatMap((offset) => [
    { key: `${id}:light-n-${offset}`, position: [offset, lightPoleY, -halfDepth + 3] },
    { key: `${id}:light-s-${offset}`, position: [offset, lightPoleY, halfDepth - 3] },
  ])

  return groupNode(
    id,
    [
      instancesNode(
        `${id}:posts`,
        boxInstancesGeometry([0.2, fenceHeight, 0.2]),
        material('steelDark', 0.58, 0.38),
        posts
      ),
      meshNode(
        `${id}:rail-north`,
        boxGeometry([blueprint.width - edgeInset * 2, 0.16, 0.16]),
        material('steelDark', 0.58, 0.38),
        { position: vec3(0, fenceHeight * 0.68, -halfDepth + edgeInset) }
      ),
      meshNode(
        `${id}:rail-south`,
        boxGeometry([blueprint.width - edgeInset * 2, 0.16, 0.16]),
        material('steelDark', 0.58, 0.38),
        { position: vec3(0, fenceHeight * 0.68, halfDepth - edgeInset) }
      ),
      meshNode(
        `${id}:rail-west`,
        boxGeometry([0.16, 0.16, blueprint.depth - edgeInset * 2]),
        material('steelDark', 0.58, 0.38),
        { position: vec3(-halfWidth + edgeInset, fenceHeight * 0.68, 0) }
      ),
      meshNode(
        `${id}:rail-east`,
        boxGeometry([0.16, 0.16, blueprint.depth - edgeInset * 2]),
        material('steelDark', 0.58, 0.38),
        { position: vec3(halfWidth - edgeInset, fenceHeight * 0.68, 0) }
      ),
      instancesNode(
        `${id}:light-poles`,
        cylinderInstancesGeometry([0.12, 0.16, lightPoleHeight, 10]),
        material('steel', 0.64, 0.34),
        lightPolePosts
      ),
      instancesNode(
        `${id}:light-heads`,
        boxInstancesGeometry([1.1, 0.18, 0.5]),
        material('power', 0.18, 0.22),
        lightPolePosts.map((post) => ({
          key: `${post.key}:head`,
          position: [post.position[0], lightHeadY, post.position[2]],
        }))
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createWallSystemNode(id: string, blueprint: LayoutBlueprint) {
  const isGlassPartition = blueprint.variant === 'glass-partition'

  return groupNode(
    id,
    [
      meshNode(
        `${id}:base`,
        boxGeometry([blueprint.width, 0.08, blueprint.depth + 0.08]),
        material('curb', 0.06, 0.88),
        {
          position: vec3(0, 0.04, 0),
        }
      ),
      meshNode(
        `${id}:wall-body`,
        boxGeometry([blueprint.width, blueprint.height, blueprint.depth]),
        material(isGlassPartition ? 'water' : 'building', isGlassPartition ? 0.12 : 0.18, isGlassPartition ? 0.08 : 0.74, {
          ...(isGlassPartition ? { opacity: 0.42, transparent: true } : {}),
        }),
        {
          position: vec3(0, blueprint.height / 2, 0),
        }
      ),
      meshNode(
        `${id}:top-cap`,
        boxGeometry([blueprint.width + 0.08, 0.12, blueprint.depth + 0.08]),
        material('steelDark', 0.4, 0.42),
        {
          position: vec3(0, blueprint.height + 0.06, 0),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createDoorSystemNode(id: string, blueprint: LayoutBlueprint) {
  const panelWidth =
    blueprint.variant === 'double-swing' ? blueprint.width * 0.42 : blueprint.width * 0.84
  const frameDepth = Math.max(blueprint.depth, 0.08)
  const doorMaterial =
    blueprint.variant === 'fire-rated'
      ? material('warning', 0.16, 0.42)
      : material('building', 0.12, 0.56)

  return groupNode(
    id,
    [
      meshNode(
        `${id}:frame-top`,
        boxGeometry([blueprint.width + 0.08, 0.12, frameDepth]),
        material('steelDark', 0.42, 0.4),
        {
          position: vec3(0, blueprint.height - 0.06, 0),
        }
      ),
      meshNode(
        `${id}:frame-left`,
        boxGeometry([0.12, blueprint.height, frameDepth]),
        material('steelDark', 0.42, 0.4),
        {
          position: vec3(-blueprint.width / 2, blueprint.height / 2, 0),
        }
      ),
      meshNode(
        `${id}:frame-right`,
        boxGeometry([0.12, blueprint.height, frameDepth]),
        material('steelDark', 0.42, 0.4),
        {
          position: vec3(blueprint.width / 2, blueprint.height / 2, 0),
        }
      ),
      ...(blueprint.variant === 'double-swing'
        ? ([-blueprint.width * 0.24, blueprint.width * 0.24] as const).map((x, index) =>
            meshNode(
              `${id}:panel-${index}`,
              boxGeometry([panelWidth, blueprint.height * 0.92, frameDepth * 0.62]),
              doorMaterial,
              {
                position: vec3(x, blueprint.height * 0.46, 0),
              }
            )
          )
        : [
            meshNode(
              `${id}:panel`,
              boxGeometry([panelWidth, blueprint.height * 0.92, frameDepth * 0.62]),
              doorMaterial,
              {
                position: vec3(0, blueprint.height * 0.46, 0),
              }
            ),
          ]),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createWindowSystemNode(id: string, blueprint: LayoutBlueprint) {
  return groupNode(
    id,
    [
      meshNode(
        `${id}:frame`,
        boxGeometry([blueprint.width, blueprint.height, blueprint.depth]),
        material('steelDark', 0.38, 0.42),
        {
          position: vec3(0, blueprint.height / 2, 0),
        }
      ),
      meshNode(
        `${id}:glass`,
        boxGeometry([blueprint.width * 0.82, blueprint.height * 0.72, blueprint.depth * 0.46]),
        material('water', 0.08, 0.08, { opacity: 0.42, transparent: true }),
        {
          position: vec3(0, blueprint.height / 2, 0),
        }
      ),
      meshNode(
        `${id}:mullion-v`,
        boxGeometry([0.08, blueprint.height * 0.82, blueprint.depth * 0.8]),
        material('steelDark', 0.38, 0.42),
        {
          position: vec3(0, blueprint.height / 2, 0),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createSecurityDeviceNode(id: string, blueprint: LayoutBlueprint) {
  const deviceRadius = Math.min(blueprint.width, blueprint.depth) / 2

  if (blueprint.variant === 'access-reader') {
    return groupNode(
      id,
      [
        meshNode(
          `${id}:plate`,
          boxGeometry([blueprint.width, blueprint.height, blueprint.depth]),
          material('building', 0.16, 0.46),
          {
            position: vec3(0, blueprint.height / 2, 0),
          }
        ),
        meshNode(
          `${id}:reader`,
          boxGeometry([blueprint.width * 0.34, blueprint.height * 0.18, blueprint.depth * 0.4]),
          material('power', 0.08, 0.2),
          {
            position: vec3(0, blueprint.height * 0.6, blueprint.depth * 0.28),
          }
        ),
      ],
      {
        position: vec3(blueprint.center.x, 0, blueprint.center.z),
      }
    )
  }

  return groupNode(
    id,
    [
      meshNode(
        `${id}:body`,
        cylinderGeometry([deviceRadius * 0.92, deviceRadius, blueprint.height, 20]),
        material('building', 0.24, 0.42),
        {
          position: vec3(0, blueprint.height / 2, 0),
        }
      ),
      meshNode(
        `${id}:lens`,
        sphereGeometry([blueprint.width * 0.36, 16, 12]),
        material('water', 0.2, 0.1, { opacity: 0.26, transparent: true }),
        {
          position: vec3(0, blueprint.height * 0.2, 0),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createSmartSensorNode(id: string, blueprint: LayoutBlueprint) {
  const sensorRadius = Math.min(blueprint.width, blueprint.depth) / 2

  if (blueprint.variant === 'occupancy-sensor') {
    return groupNode(
      id,
      [
        meshNode(
          `${id}:base`,
          cylinderGeometry([sensorRadius * 0.9, sensorRadius, blueprint.height, 20]),
          material('building', 0.12, 0.34),
          {
            position: vec3(0, blueprint.height / 2, 0),
          }
        ),
        meshNode(
          `${id}:core`,
          cylinderGeometry([blueprint.width * 0.18, blueprint.width * 0.18, blueprint.height * 0.45, 16]),
          material('power', 0.08, 0.16),
          {
            position: vec3(0, blueprint.height * 0.46, 0),
          }
        ),
      ],
      {
        position: vec3(blueprint.center.x, 0, blueprint.center.z),
      }
    )
  }

  return groupNode(
    id,
    [
      meshNode(
        `${id}:plate`,
        boxGeometry([blueprint.width, blueprint.height, blueprint.depth]),
        material('building', 0.12, 0.4),
        {
          position: vec3(0, blueprint.height / 2, 0),
        }
      ),
      meshNode(
        `${id}:screen`,
        boxGeometry([blueprint.width * 0.46, blueprint.height * 0.18, blueprint.depth * 0.36]),
        material('power', 0.06, 0.18),
        {
          position: vec3(0, blueprint.height * 0.62, blueprint.depth * 0.24),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createSmartControlNode(id: string, blueprint: LayoutBlueprint) {
  if (blueprint.variant === 'smart-lock') {
    return groupNode(
      id,
      [
        meshNode(
          `${id}:lock-body`,
          boxGeometry([blueprint.width, blueprint.height, blueprint.depth]),
          material('steelDark', 0.42, 0.32),
          {
            position: vec3(0, blueprint.height / 2, 0),
          }
        ),
        meshNode(
          `${id}:reader`,
          cylinderGeometry([blueprint.width * 0.2, blueprint.width * 0.2, blueprint.depth * 0.8, 16]),
          material('power', 0.08, 0.18),
          {
            position: vec3(0, blueprint.height * 0.28, blueprint.depth * 0.42),
            rotation: vec3(Math.PI / 2, 0, 0),
          }
        ),
      ],
      {
        position: vec3(blueprint.center.x, 0, blueprint.center.z),
      }
    )
  }

  return groupNode(
    id,
    [
      meshNode(
        `${id}:panel`,
        boxGeometry([blueprint.width, blueprint.height, blueprint.depth]),
        material('building', 0.08, 0.3),
        {
          position: vec3(0, blueprint.height / 2, 0),
        }
      ),
      meshNode(
        `${id}:display`,
        boxGeometry([blueprint.width * 0.56, blueprint.height * 0.24, blueprint.depth * 0.36]),
        material('power', 0.04, 0.14),
        {
          position: vec3(0, blueprint.height * 0.54, blueprint.depth * 0.24),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createTankBundNode(id: string, blueprint: LayoutBlueprint) {
  const halfWidth = blueprint.width / 2
  const halfDepth = blueprint.depth / 2

  return groupNode(
    id,
    [
      meshNode(
        `${id}:base`,
        boxGeometry([blueprint.width, 0.16, blueprint.depth]),
        material('slabAlt', 0.02, 0.98),
        {
          position: vec3(0, 0.08, 0),
        }
      ),
      meshNode(
        `${id}:wall-north`,
        boxGeometry([blueprint.width, blueprint.height, 0.44]),
        material('curb', 0.08, 0.82),
        {
          position: vec3(0, blueprint.height / 2, -halfDepth + 0.22),
        }
      ),
      meshNode(
        `${id}:wall-south`,
        boxGeometry([blueprint.width, blueprint.height, 0.44]),
        material('curb', 0.08, 0.82),
        {
          position: vec3(0, blueprint.height / 2, halfDepth - 0.22),
        }
      ),
      meshNode(
        `${id}:wall-west`,
        boxGeometry([0.44, blueprint.height, blueprint.depth]),
        material('curb', 0.08, 0.82),
        {
          position: vec3(-halfWidth + 0.22, blueprint.height / 2, 0),
        }
      ),
      meshNode(
        `${id}:wall-east`,
        boxGeometry([0.44, blueprint.height, blueprint.depth]),
        material('curb', 0.08, 0.82),
        {
          position: vec3(halfWidth - 0.22, blueprint.height / 2, 0),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createVerticalTankCompoundNode(id: string, blueprint: LayoutBlueprint) {
  const { tankOffsets, radius, height } = resolveVerticalTankLayout(blueprint)

  return groupNode(
    id,
    [
      meshNode(
        `${id}:base`,
        boxGeometry([blueprint.width - 2, 0.32, blueprint.depth - 2]),
        material('slab', 0.04, 0.94),
        {
          position: vec3(0, 0.16, 0),
        }
      ),
      ...tankOffsets.flatMap((offset, index) => {
        const tankId = `${id}:tank-${index}`
        return [
          groupNode(
            tankId,
            [
              meshNode(
                `${tankId}:body`,
                cylinderGeometry([radius, radius + 0.12, height, 24]),
                material('vessel', 0.48, 0.34),
                {
                  position: vec3(0, height / 2 + 0.28, 0),
                  castShadow: index === 0,
                }
              ),
              meshNode(
                `${tankId}:roof`,
                cylinderGeometry([radius + 0.1, radius + 0.1, 0.24, 24]),
                material('vessel', 0.5, 0.3),
                {
                  position: vec3(0, height + 0.44, 0),
                }
              ),
              meshNode(
                `${tankId}:bund-ring`,
                cylinderGeometry([radius + 0.56, radius + 0.56, 0.24, 24]),
                material('curb', 0.04, 0.78),
                {
                  position: vec3(0, 0.32, 0),
                }
              ),
              meshNode(
                `${tankId}:ladder`,
                boxGeometry([0.2, height * 0.6, 0.2]),
                material('steel', 0.64, 0.34),
                {
                  position: vec3(radius + 1.15, height * 0.3, 0),
                }
              ),
              meshNode(
                `${tankId}:platform`,
                boxGeometry([1.4, 0.12, radius * 1.5]),
                material('steelDark', 0.6, 0.38),
                {
                  position: vec3(radius + 0.55, height * 0.58, 0),
                }
              ),
            ],
            {
              position: vec3(offset[0], 0, offset[1]),
            }
          ),
        ]
      }),
      meshNode(
        `${id}:header`,
        cylinderGeometry([0.18, 0.18, blueprint.width - 7.2, 12]),
        material('pipe', 0.56, 0.38),
        {
          position: vec3(0, 3.4, blueprint.depth / 2 - 2.1),
          rotation: vec3(0, 0, Math.PI / 2),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createSphereTankNode(id: string, blueprint: LayoutBlueprint) {
  const radius = Math.min(
    blueprint.width * 0.36,
    blueprint.depth * 0.36,
    blueprint.width / 2 - 0.7,
    (blueprint.height - 2.8) / 2
  )
  const sphereY = radius + 2.8
  const serviceFrameX = Math.min(radius + 1.2, blueprint.width / 2 - 0.12)
  const legInstances: StaticInstanceSpec[] = SPHERE_SUPPORT_OFFSETS.map((offset, index) => ({
    key: `${id}:leg-${index}`,
    position: [offset[0], sphereY / 2, offset[1]],
  }))

  return groupNode(
    id,
    [
      meshNode(
        `${id}:sphere`,
        sphereGeometry([radius, 24, 24]),
        material('vessel', 0.56, 0.28),
        {
          position: vec3(0, sphereY, 0),
          castShadow: true,
        }
      ),
      instancesNode(
        `${id}:legs`,
        boxInstancesGeometry([0.24, sphereY - 1.2, 0.24]),
        material('steel', 0.68, 0.34),
        legInstances
      ),
      meshNode(
        `${id}:base-ring`,
        cylinderGeometry([radius + 0.56, radius + 0.56, 0.24, 24]),
        material('curb', 0.04, 0.78),
        {
          position: vec3(0, 0.32, 0),
        }
      ),
      meshNode(
        `${id}:catwalk`,
        boxGeometry([blueprint.width - 1.4, 0.22, 1.1]),
        material('steelDark', 0.62, 0.36),
        {
          position: vec3(0, 1.7, 0),
        }
      ),
      groupNode(
        `${id}:service-frame`,
        [
          meshNode(
            `${id}:service-post`,
            boxGeometry([0.22, sphereY - 1.6, 0.22]),
            material('steel', 0.66, 0.34),
            {
              position: vec3(0, sphereY / 2, 0),
            }
          ),
          meshNode(
            `${id}:service-deck`,
            boxGeometry([1.8, 0.14, 1.4]),
            material('steelDark', 0.6, 0.38),
            {
              position: vec3(-0.9, sphereY - 0.8, 0),
            }
          ),
        ],
        {
          position: vec3(serviceFrameX, 0, 0),
        }
      ),
      meshNode(
        `${id}:top-ring`,
        torusGeometry([radius * 0.82, 0.08, 10, 28]),
        material('steelDark', 0.56, 0.36),
        {
          position: vec3(0, sphereY + 0.12, 0),
          rotation: vec3(Math.PI / 2, 0, 0),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createPumpManifoldNode(id: string, blueprint: LayoutBlueprint) {
  const offsets = [-3.2, 0, 3.2]
  const pumpBodyInstances: StaticInstanceSpec[] = offsets.map((offset) => ({
    key: `${id}:pump-body-${offset}`,
    position: [offset, 0.74, 0],
  }))
  const pumpPipeInstances: StaticInstanceSpec[] = offsets.map((offset) => ({
    key: `${id}:pump-pipe-${offset}`,
    position: [offset, 2.2, 0],
    rotation: [0, 0, Math.PI / 2],
  }))

  return groupNode(
    id,
    [
      meshNode(
        `${id}:base`,
        boxGeometry([blueprint.width, 0.32, blueprint.depth]),
        material('slabAlt', 0.04, 0.94),
        {
          position: vec3(0, 0.16, 0),
        }
      ),
      instancesNode(
        `${id}:pumps`,
        boxInstancesGeometry([1.8, 1.48, 1.8]),
        material('building', 0.24, 0.6),
        pumpBodyInstances
      ),
      instancesNode(
        `${id}:pump-pipes`,
        cylinderInstancesGeometry([0.18, 0.18, 3.2, 12]),
        material('pipe', 0.58, 0.36),
        pumpPipeInstances
      ),
      meshNode(
        `${id}:header`,
        cylinderGeometry([0.22, 0.22, blueprint.width - 1.4, 16]),
        material('pipe', 0.58, 0.36),
        {
          position: vec3(0, 3.2, 0),
          rotation: vec3(0, 0, Math.PI / 2),
        }
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

export function createAuthoredStaticAssetNode(
  asset: Pick<StaticAssetInstance, 'id' | 'name' | 'assetKind' | 'variant'>
): PublishedStaticRenderNode {
  const blueprint = resolveStaticAssetBlueprint(asset)

  switch (asset.assetKind) {
    case 'process-train':
      return createProcessTrainNode(asset.id, blueprint)
    case 'pipe-rack':
      return createLinearPipeRackNode(asset.id, blueprint)
    case 'vertical-tank':
      return createVerticalTankCompoundNode(asset.id, blueprint)
    case 'sphere-tank':
      return createSphereTankNode(asset.id, blueprint)
    case 'pump-manifold':
      return createPumpManifoldNode(asset.id, blueprint)
    case 'service-building':
      return createServiceBuildingNode(asset.id, blueprint)
    case 'wall-system':
      return createWallSystemNode(asset.id, blueprint)
    case 'door-system':
      return createDoorSystemNode(asset.id, blueprint)
    case 'window-system':
      return createWindowSystemNode(asset.id, blueprint)
    case 'security-device':
      return createSecurityDeviceNode(asset.id, blueprint)
    case 'smart-sensor':
      return createSmartSensorNode(asset.id, blueprint)
    case 'smart-control':
      return createSmartControlNode(asset.id, blueprint)
  }
}

export function createAuthoredStaticAssetRenderRecipe(
  asset: Pick<StaticAssetInstance, 'id' | 'name' | 'assetKind' | 'variant'>
): PublishedStaticChunkRenderRecipe {
  return {
    detailed: [createAuthoredStaticAssetNode(asset)],
  }
}

function createProcessDistrictNode(id: string) {
  if (!PROCESS_DISTRICT) return null

  return groupNode(id, [
    createDistrictSlabNode(
      `${id}:slab`,
      [PROCESS_DISTRICT.center.x, 0.2, PROCESS_DISTRICT.center.z],
      [PROCESS_DISTRICT.size.width, 0.4, PROCESS_DISTRICT.size.depth],
      'slabAlt'
    ),
    ...PROCESS_TRAIN_BLUEPRINTS.map((blueprint) =>
      createProcessTrainNode(`${id}:${blueprint.id}`, blueprint)
    ),
    PROCESS_FRONT_STRIP_BLUEPRINT
      ? createProcessFrontStripNode(`${id}:${PROCESS_FRONT_STRIP_BLUEPRINT.id}`, PROCESS_FRONT_STRIP_BLUEPRINT)
      : null,
    PROCESS_CONTROL_ROOM_BLUEPRINT
      ? createServiceBuildingNode(`${id}:${PROCESS_CONTROL_ROOM_BLUEPRINT.id}`, PROCESS_CONTROL_ROOM_BLUEPRINT)
      : null,
    PROCESS_PIPE_RACK_BLUEPRINT
      ? createLinearPipeRackNode(`${id}:${PROCESS_PIPE_RACK_BLUEPRINT.id}`, PROCESS_PIPE_RACK_BLUEPRINT)
      : null,
  ])
}

function createTankDistrictNode(id: string) {
  if (!TANK_DISTRICT) return null

  return groupNode(id, [
    createDistrictSlabNode(
      `${id}:slab`,
      [TANK_DISTRICT.center.x, 0.18, TANK_DISTRICT.center.z],
      [TANK_DISTRICT.size.width, 0.36, TANK_DISTRICT.size.depth],
      'slab'
    ),
    ...TANK_BUND_BLUEPRINTS.map((blueprint) => createTankBundNode(`${id}:${blueprint.id}`, blueprint)),
    ...TANK_VERTICAL_BLUEPRINTS.map((blueprint) =>
      createVerticalTankCompoundNode(`${id}:${blueprint.id}`, blueprint)
    ),
    ...TANK_SPHERE_BLUEPRINTS.map((blueprint) =>
      createSphereTankNode(`${id}:${blueprint.id}`, blueprint)
    ),
    TANK_MANIFOLD_BLUEPRINT
      ? createPumpManifoldNode(`${id}:${TANK_MANIFOLD_BLUEPRINT.id}`, TANK_MANIFOLD_BLUEPRINT)
      : null,
    ...TANK_SENSOR_BLUEPRINTS.map((blueprint) =>
      createSmartSensorNode(`${id}:${blueprint.id}`, blueprint)
    ),
    TANK_METERING_BLUEPRINT
      ? createServiceBuildingNode(`${id}:${TANK_METERING_BLUEPRINT.id}`, TANK_METERING_BLUEPRINT)
      : null,
    meshNode(
      `${id}:pipe-a`,
      cylinderGeometry([0.22, 0.22, 24, 16]),
      material('pipe', 0.56, 0.36),
      {
        position: vec3(54, 3.1, -17),
        rotation: vec3(0, 0, Math.PI / 2),
      }
    ),
    meshNode(
      `${id}:pipe-b`,
      cylinderGeometry([0.18, 0.18, 22, 14]),
      material('pipe', 0.56, 0.36),
      {
        position: vec3(66, 4.2, -23),
        rotation: vec3(Math.PI / 2, 0, 0),
      }
    ),
    meshNode(
      `${id}:catwalk`,
      boxGeometry([12, 0.24, 4]),
      material('steelDark', 0.64, 0.36),
      {
        position: vec3(74, 5.8, -28),
      }
    ),
  ])
}

function createLoadingRackNode(id: string, blueprint: LayoutBlueprint) {
  const rackZ = LOGISTICS_LOADING_APRON_Z - blueprint.center.z
  const bayOffsets = LOGISTICS_BAY_OFFSETS.map((offset) => offset - blueprint.center.x).filter(
    (offset) => Math.abs(offset) <= blueprint.width / 2 - 7
  )
  const apronInstances: StaticInstanceSpec[] = bayOffsets.map((offset) => ({
    key: `${id}:apron-${offset}`,
    position: [offset, 0.18, rackZ],
  }))
  const frontStripeInstances: StaticInstanceSpec[] = bayOffsets.map((offset) => ({
    key: `${id}:front-stripe-${offset}`,
    position: [offset, 0.26, rackZ - 3.4],
  }))
  const curbInstances: StaticInstanceSpec[] = bayOffsets.flatMap((offset) => [
    { key: `${id}:curb-left-${offset}`, position: [offset - 2.8, 0.26, rackZ - 0.2] },
    { key: `${id}:curb-right-${offset}`, position: [offset + 2.8, 0.26, rackZ - 0.2] },
  ])
  const canopyInstances: StaticInstanceSpec[] = bayOffsets.map((offset) => ({
    key: `${id}:canopy-${offset}`,
    position: [offset, 4.9, rackZ + 0.15],
  }))
  const postInstances: StaticInstanceSpec[] = bayOffsets.flatMap((offset) => [
    { key: `${id}:front-left-${offset}`, position: [offset - 5.2, 2.4, rackZ - 3.1] },
    { key: `${id}:front-right-${offset}`, position: [offset + 5.2, 2.4, rackZ - 3.1] },
    { key: `${id}:rear-left-${offset}`, position: [offset - 5.2, 2.4, rackZ + 3.1] },
    { key: `${id}:rear-right-${offset}`, position: [offset + 5.2, 2.4, rackZ + 3.1] },
  ])
  const headerInstances: StaticInstanceSpec[] = bayOffsets.map((offset) => ({
    key: `${id}:header-${offset}`,
    position: [offset, 4.46, rackZ + 1.5],
  }))
  const armColumnInstances: StaticInstanceSpec[] = bayOffsets.flatMap((offset) =>
    [-2.7, 2.7].map((armOffset, index) => ({
      key: `${id}:arm-column-${offset}-${index}`,
      position: [offset + armOffset, 2.1, rackZ + 0.7],
    }))
  )
  const armHeaderInstances: StaticInstanceSpec[] = bayOffsets.flatMap((offset) =>
    [-2.7, 2.7].map((armOffset, index) => ({
      key: `${id}:arm-header-${offset}-${index}`,
      position: [offset + armOffset + 0.92, 3.96, rackZ + 0.5],
      rotation: [0, 0, Math.PI / 2],
    }))
  )
  const armNozzleInstances: StaticInstanceSpec[] = bayOffsets.flatMap((offset) =>
    [-2.7, 2.7].map((armOffset, index) => ({
      key: `${id}:arm-nozzle-${offset}-${index}`,
      position: [offset + armOffset + 1.82, 3.68, rackZ + 0.48],
      rotation: [0, 0, -Math.PI / 5],
    }))
  )
  const warningBoxInstances: StaticInstanceSpec[] = bayOffsets.flatMap((offset) =>
    [-2.7, 2.7].map((armOffset, index) => ({
      key: `${id}:arm-warning-${offset}-${index}`,
      position: [offset + armOffset - 0.12, 4.26, rackZ + 0.78],
    }))
  )

  return groupNode(
    id,
    [
      instancesNode(
        `${id}:aprons`,
        boxInstancesGeometry([13.4, 0.36, 8.8]),
        material('slabAlt', 0.05, 0.9),
        apronInstances,
        { receiveShadow: true }
      ),
      instancesNode(
        `${id}:front-stripes`,
        boxInstancesGeometry([11.2, 0.18, 0.28]),
        material('stripe', 0.02, 0.92),
        frontStripeInstances
      ),
      instancesNode(
        `${id}:curbs`,
        boxInstancesGeometry([0.18, 0.18, 6.4]),
        material('curb', 0.04, 0.86),
        curbInstances
      ),
      instancesNode(
        `${id}:canopies`,
        boxInstancesGeometry([14, 0.24, 9.6]),
        material('canopy', 0.6, 0.34),
        canopyInstances
      ),
      instancesNode(
        `${id}:posts`,
        boxInstancesGeometry([0.34, 4.8, 0.34]),
        material('canopy', 0.62, 0.34),
        postInstances
      ),
      instancesNode(
        `${id}:headers`,
        boxInstancesGeometry([11.4, 0.18, 0.28]),
        material('steelDark', 0.66, 0.34),
        headerInstances
      ),
      instancesNode(
        `${id}:arm-columns`,
        cylinderInstancesGeometry([0.18, 0.22, 4.2, 12]),
        material('steelDark', 0.62, 0.32),
        armColumnInstances
      ),
      instancesNode(
        `${id}:arm-headers`,
        cylinderInstancesGeometry([0.14, 0.14, 2.2, 12]),
        material('pipe', 0.58, 0.34),
        armHeaderInstances
      ),
      instancesNode(
        `${id}:arm-nozzles`,
        cylinderInstancesGeometry([0.1, 0.1, 1.7, 10]),
        material('pipe', 0.58, 0.34),
        armNozzleInstances
      ),
      instancesNode(
        `${id}:warning-boxes`,
        boxInstancesGeometry([0.42, 0.18, 0.36]),
        material('warning', 0.28, 0.56),
        warningBoxInstances
      ),
    ],
    {
      position: vec3(blueprint.center.x, 0, blueprint.center.z),
    }
  )
}

function createLogisticsDistrictNode(id: string) {
  if (!LOGISTICS_DISTRICT) return null

  const roadLineInstances: StaticInstanceSpec[] = ROAD_LINE_OFFSETS.map((offset) => ({
    key: `${id}:road-line-${offset}`,
    position: [offset, 0.12, LOGISTICS_MAIN_ROAD_Z],
  }))
  const stopLineInstances: StaticInstanceSpec[] = LOGISTICS_BAY_OFFSETS.map((offset) => ({
    key: `${id}:stop-line-${offset}`,
    position: [offset, 0.12, 60.2],
  }))
  const headerSupportInstances: StaticInstanceSpec[] = [-79, 79].map((offset) => ({
    key: `${id}:header-support-${offset}`,
    position: [offset, 3.32, 64.2],
  }))
  const parkingInstances: StaticInstanceSpec[] = PARKING_OFFSETS.map((offset) => ({
    key: `${id}:parking-${offset}`,
    position: [offset, 0.12, 81],
  }))

  return groupNode(id, [
    meshNode(
      `${id}:main-road`,
      boxGeometry([LOGISTICS_DISTRICT.size.width, 0.1, 12]),
      material('road', 0.06, 0.9),
      {
        position: vec3(LOGISTICS_DISTRICT.center.x, 0.05, LOGISTICS_MAIN_ROAD_Z),
        receiveShadow: true,
      }
    ),
    meshNode(
      `${id}:buffer`,
      boxGeometry([LOGISTICS_DISTRICT.size.width, 0.16, 2.2]),
      material('curb', 0.05, 0.88),
      {
        position: vec3(LOGISTICS_DISTRICT.center.x, 0.08, LOGISTICS_BUFFER_Z),
      }
    ),
    meshNode(
      `${id}:apron`,
      boxGeometry([LOGISTICS_DISTRICT.size.width, 0.16, 10.8]),
      material('slabAlt', 0.05, 0.92),
      {
        position: vec3(LOGISTICS_DISTRICT.center.x, 0.08, LOGISTICS_LOADING_APRON_Z),
      }
    ),
    instancesNode(
      `${id}:road-lines`,
      boxInstancesGeometry([3.6, 0.04, 0.32]),
      material('stripe', 0.02, 0.92),
      roadLineInstances
    ),
    instancesNode(
      `${id}:stop-lines`,
      boxInstancesGeometry([10.4, 0.04, 0.24]),
      material('stripe', 0.02, 0.92),
      stopLineInstances
    ),
    ...LOGISTICS_LOADING_RACK_BLUEPRINTS.map((blueprint) =>
      createLoadingRackNode(`${id}:${blueprint.id}`, blueprint)
    ),
    meshNode(
      `${id}:header-deck`,
      boxGeometry([158, 0.4, 3.2]),
      material('steelDark', 0.68, 0.34),
      {
        position: vec3(0, 6.6, 64.2),
      }
    ),
    ...[-0.8, 0, 0.8].map((offset) =>
      meshNode(
        `${id}:header-pipe-${offset}`,
        cylinderGeometry([0.14 + Math.abs(offset) * 0.03, 0.14 + Math.abs(offset) * 0.03, 158, 14]),
        material('pipe', 0.58, 0.34),
        {
          position: vec3(0, 7.1 + Math.abs(offset) * 0.2, 64.2 + offset),
          rotation: vec3(0, 0, Math.PI / 2),
        }
      )
    ),
    instancesNode(
      `${id}:header-supports`,
      boxInstancesGeometry([0.42, 6.64, 0.42]),
      material('steel', 0.68, 0.34),
      headerSupportInstances
    ),
    instancesNode(
      `${id}:parking-markers`,
      boxInstancesGeometry([1.4, 0.04, 6]),
      material('stripe', 0.02, 0.92),
      parkingInstances
    ),
    ...LOGISTICS_TRUCK_PARKING_BLUEPRINTS.map((blueprint) =>
      createTruckParkingNode(`${id}:${blueprint.id}`, blueprint)
    ),
    ...LOGISTICS_WAREHOUSE_BLUEPRINTS.map((blueprint) =>
      createWarehouseNode(`${id}:${blueprint.id}`, blueprint)
    ),
    ...LOGISTICS_ADMIN_BLUEPRINTS.map((blueprint) =>
      createAdminBuildingNode(`${id}:${blueprint.id}`, blueprint)
    ),
    ...LOGISTICS_EMERGENCY_BLUEPRINTS.map((blueprint) =>
      createEmergencyStationNode(`${id}:${blueprint.id}`, blueprint)
    ),
    ...LOGISTICS_RAIL_BLUEPRINTS.map((blueprint) =>
      createRailSpurNode(`${id}:${blueprint.id}`, blueprint)
    ),
    ...LOGISTICS_WEIGHBRIDGE_BLUEPRINTS.map((blueprint) =>
      createWeighbridgeNode(`${id}:${blueprint.id}`, blueprint)
    ),
    ...LOGISTICS_SMART_CONTROL_BLUEPRINTS.map((blueprint) =>
      createSmartControlNode(`${id}:${blueprint.id}`, blueprint)
    ),
    ...LOGISTICS_SOLAR_CANOPY_BLUEPRINTS.map((blueprint) =>
      createSolarCanopyNode(`${id}:${blueprint.id}`, blueprint)
    ),
    ...LOGISTICS_SERVICE_BLUEPRINTS.map((blueprint) =>
      createServiceBuildingNode(`${id}:${blueprint.id}`, blueprint)
    ),
  ])
}

function createUtilitiesDistrictNode(id: string) {
  if (!UTILITIES_DISTRICT) return null

  return groupNode(id, [
    createDistrictSlabNode(
      `${id}:slab`,
      [UTILITIES_DISTRICT.center.x, 0.14, UTILITIES_DISTRICT.center.z],
      [UTILITIES_DISTRICT.size.width, 0.28, UTILITIES_DISTRICT.size.depth],
      'slabAlt'
    ),
    ...UTILITIES_COOLING_TOWER_BLUEPRINTS.map((blueprint) =>
      createCoolingTowerNode(`${id}:${blueprint.id}`, blueprint)
    ),
    ...UTILITIES_SUBSTATION_BLUEPRINTS.map((blueprint) =>
      createSubstationYardNode(`${id}:${blueprint.id}`, blueprint)
    ),
    ...UTILITIES_FIRE_WATER_BLUEPRINTS.map((blueprint) =>
      createWaterTreatmentNode(`${id}:${blueprint.id}`, blueprint)
    ),
    ...UTILITIES_EMERGENCY_BLUEPRINTS.map((blueprint) =>
      createEmergencyStationNode(`${id}:${blueprint.id}`, blueprint)
    ),
    ...UTILITIES_GATEHOUSE_BLUEPRINTS.map((blueprint) =>
      createGatehouseNode(`${id}:${blueprint.id}`, blueprint)
    ),
    ...UTILITIES_SECURITY_BLUEPRINTS.map((blueprint) =>
      createSecurityDeviceNode(`${id}:${blueprint.id}`, blueprint)
    ),
    ...UTILITIES_SERVICE_BLUEPRINTS.map((blueprint) =>
      createServiceBuildingNode(`${id}:${blueprint.id}`, blueprint)
    ),
    ...UTILITIES_FLARE_STACK_BLUEPRINTS.map((blueprint) =>
      createFlareStackNode(`${id}:${blueprint.id}`, blueprint)
    ),
    UTILITIES_PERIMETER_BLUEPRINT
      ? createPerimeterFenceNode(`${id}:${UTILITIES_PERIMETER_BLUEPRINT.id}`, UTILITIES_PERIMETER_BLUEPRINT)
      : null,
  ])
}

function createCampusLinksNode(id: string) {
  return groupNode(id, [
    meshNode(
      `${id}:road-main`,
      boxGeometry([178, 0.1, 12]),
      material('road', 0.06, 0.88),
      {
        position: vec3(0, 0.05, -4),
        receiveShadow: true,
      }
    ),
    meshNode(
      `${id}:road-north`,
      boxGeometry([190, 0.1, 16]),
      material('road', 0.06, 0.88),
      {
        position: vec3(0, 0.05, -72),
        receiveShadow: true,
      }
    ),
    meshNode(
      `${id}:road-vertical-center`,
      boxGeometry([12, 0.1, 88]),
      material('road', 0.06, 0.88),
      {
        position: vec3(0, 0.05, 18),
        receiveShadow: true,
      }
    ),
    meshNode(
      `${id}:road-vertical-west`,
      boxGeometry([8, 0.1, 108]),
      material('road', 0.06, 0.88),
      {
        position: vec3(-88, 0.05, 8),
        receiveShadow: true,
      }
    ),
    meshNode(
      `${id}:road-vertical-east`,
      boxGeometry([8, 0.1, 108]),
      material('road', 0.06, 0.88),
      {
        position: vec3(86, 0.05, 8),
        receiveShadow: true,
      }
    ),
    createPipeBridgeNode(`${id}:bridge-main`, [-86, 0, -4], [86, 0, -4], 6.2),
    createPipeBridgeNode(`${id}:bridge-center`, [0, 0, -72], [0, 0, -4], 7.4),
    createPipeBridgeNode(`${id}:bridge-west`, [-88, 0, -34], [-88, 0, -4], 5.6),
    createPipeBridgeNode(`${id}:bridge-east`, [86, 0, -34], [86, 0, -4], 5.8),
  ])
}

function createSectorDetailedRoot(id: string) {
  return groupNode(id, [
    meshNode(
      `${id}:ground`,
      boxGeometry([236, 0.44, 236]),
      material('ground', 0, 1),
      {
        position: vec3(0, -0.22, 0),
        receiveShadow: true,
      }
    ),
    createCampusLinksNode(`${id}:campus-links`),
    createProcessDistrictNode(`${id}:process-district`),
    createTankDistrictNode(`${id}:tank-district`),
    createLogisticsDistrictNode(`${id}:logistics-district`),
    createUtilitiesDistrictNode(`${id}:utilities-district`),
  ])
}

function resolveProxyMaterialToken(blueprint: LayoutBlueprint): PublishedStaticMaterialToken {
  switch (blueprint.kind) {
    case 'admin-building':
    case 'emergency-station':
    case 'gatehouse':
    case 'logistics-warehouse':
    case 'service-building':
      return 'building'
    case 'flare-stack':
      return 'flare'
    case 'cooling-tower':
    case 'sphere-tank':
    case 'vertical-tank':
      return 'vessel'
    case 'fire-water':
      return 'water'
    case 'perimeter-fence':
    case 'rail-spur':
    case 'substation-yard':
      return 'steelDark'
    case 'pipe-rack':
    case 'process-strip':
      return 'pipe'
    case 'loading-rack':
    case 'solar-canopy':
      return 'canopy'
    case 'security-device':
    case 'smart-sensor':
    case 'smart-control':
      return 'power'
    case 'truck-parking':
    case 'weighbridge':
      return 'road'
    case 'bund':
      return 'curb'
    default:
      return 'slab'
  }
}

function createBlueprintProxyNode(id: string, blueprint: LayoutBlueprint) {
  const proxyHeight = Math.max(blueprint.height, 0.24)
  const materialToken = resolveProxyMaterialToken(blueprint)
  const transparent = blueprint.kind === 'perimeter-fence'

  return meshNode(
    id,
    boxGeometry([blueprint.width, proxyHeight, blueprint.depth]),
    material(materialToken, 0.14, 0.82, transparent ? { opacity: 0.26, transparent: true } : {}),
    {
      position: vec3(blueprint.center.x, proxyHeight / 2, blueprint.center.z),
    }
  )
}

function createSectorProxyRoot(id: string) {
  return groupNode(id, [
    meshNode(
      `${id}:base`,
      boxGeometry([236, 0.24, 236]),
      material('slabAlt', 0.02, 0.98),
      {
        position: vec3(0, -0.12, 0),
      }
    ),
    ...CAMPUS_LAYOUT_BLUEPRINTS.map((blueprint) =>
      createBlueprintProxyNode(`${id}:feature:${blueprint.id}`, blueprint)
    ),
  ])
}

function createInterSectorRecipeDetailedNodes(id: string) {
  const createRoadStripeOffsets = (min: number, max: number) => {
    const spacing = 64
    const inset = 36
    const offsets: number[] = []

    for (let offset = min + inset; offset <= max - inset; offset += spacing) {
      offsets.push(offset)
    }

    return offsets
  }
  const corridorCenterX = (CAMPUS_BOUNDS.min.x + CAMPUS_BOUNDS.max.x) / 2
  const corridorCenterZ = (CAMPUS_BOUNDS.min.z + CAMPUS_BOUNDS.max.z) / 2
  const corridorWidth = CAMPUS_BOUNDS.max.x - CAMPUS_BOUNDS.min.x
  const corridorDepth = CAMPUS_BOUNDS.max.z - CAMPUS_BOUNDS.min.z
  const bridgeInset = 28
  const southeastConnectorStartX = -8
  const southeastConnectorEndX = CAMPUS_BOUNDS.max.x
  const southeastConnectorCenterX = (southeastConnectorStartX + southeastConnectorEndX) / 2
  const southeastConnectorWidth = southeastConnectorEndX - southeastConnectorStartX
  const southeastConnectorZ = 260
  const roadStripeXInstances: StaticInstanceSpec[] = createRoadStripeOffsets(
    CAMPUS_BOUNDS.min.x,
    CAMPUS_BOUNDS.max.x
  ).map((offset) => ({
    key: `${id}:road-x-${offset}`,
    position: [offset, 0.14, 0],
  }))
  const southeastRoadStripeInstances: StaticInstanceSpec[] = createRoadStripeOffsets(
    southeastConnectorStartX,
    southeastConnectorEndX
  ).map((offset) => ({
    key: `${id}:road-southeast-${offset}`,
    position: [offset, 0.14, southeastConnectorZ],
  }))
  const roadStripeZInstances: StaticInstanceSpec[] = createRoadStripeOffsets(
    CAMPUS_BOUNDS.min.z,
    CAMPUS_BOUNDS.max.z
  ).map((offset) => ({
    key: `${id}:road-z-${offset}`,
    position: [0, 0.14, offset],
  }))
  const towerInstances: StaticInstanceSpec[] = [
    [-10, -10],
    [10, -10],
    [-10, 10],
    [10, 10],
  ].map((offset, index) => ({
    key: `${id}:tower-${index}`,
    position: [offset[0], 12, offset[1]],
  }))

  return [
    meshNode(
      `${id}:corridor-x`,
      boxGeometry([corridorWidth, 0.12, 18]),
      material('road', 0.05, 0.9),
      {
        position: vec3(corridorCenterX, 0.06, 0),
        receiveShadow: true,
      }
    ),
    meshNode(
      `${id}:corridor-z`,
      boxGeometry([18, 0.12, corridorDepth]),
      material('road', 0.05, 0.9),
      {
        position: vec3(0, 0.06, corridorCenterZ),
        receiveShadow: true,
      }
    ),
    meshNode(
      `${id}:corridor-southeast`,
      boxGeometry([southeastConnectorWidth, 0.12, 18]),
      material('road', 0.05, 0.9),
      {
        position: vec3(southeastConnectorCenterX, 0.06, southeastConnectorZ),
        receiveShadow: true,
      }
    ),
    meshNode(
      `${id}:walkway-southeast-north`,
      boxGeometry([southeastConnectorWidth, 0.08, 4]),
      material('curb', 0.06, 0.86),
      {
        position: vec3(southeastConnectorCenterX, 0.08, 246),
        receiveShadow: true,
      }
    ),
    meshNode(
      `${id}:walkway-southeast-south`,
      boxGeometry([southeastConnectorWidth, 0.08, 4]),
      material('curb', 0.06, 0.86),
      {
        position: vec3(southeastConnectorCenterX, 0.08, 274),
        receiveShadow: true,
      }
    ),
    instancesNode(
      `${id}:road-x-markers`,
      boxInstancesGeometry([4.2, 0.04, 0.32]),
      material('stripe', 0.02, 0.9),
      roadStripeXInstances
    ),
    instancesNode(
      `${id}:road-z-markers`,
      boxInstancesGeometry([0.32, 0.04, 4.2]),
      material('stripe', 0.02, 0.9),
      roadStripeZInstances
    ),
    instancesNode(
      `${id}:road-southeast-markers`,
      boxInstancesGeometry([4.2, 0.04, 0.32]),
      material('stripe', 0.02, 0.9),
      southeastRoadStripeInstances
    ),
    createPipeBridgeNode(
      `${id}:bridge-east-west`,
      [CAMPUS_BOUNDS.min.x + bridgeInset, 0, 0],
      [CAMPUS_BOUNDS.max.x - bridgeInset, 0, 0],
      9.2
    ),
    createPipeBridgeNode(
      `${id}:bridge-south-north`,
      [0, 0, CAMPUS_BOUNDS.min.z + bridgeInset],
      [0, 0, CAMPUS_BOUNDS.max.z - bridgeInset],
      9.6
    ),
    createPipeBridgeNode(
      `${id}:bridge-southeast`,
      [southeastConnectorStartX, 0, southeastConnectorZ],
      [southeastConnectorEndX, 0, southeastConnectorZ],
      9.8
    ),
    createPipeBridgeNode(`${id}:bridge-west-diagonal`, [-260, 0, 0], [0, 0, 260], 10.4),
    createPipeBridgeNode(`${id}:bridge-east-diagonal`, [260, 0, 0], [0, 0, 260], 10.2),
    groupNode(`${id}:hub`, [
      meshNode(
        `${id}:hub-base`,
        boxGeometry([34, 0.48, 34]),
        material('slab', 0.04, 0.92),
        {
          position: vec3(0, 0.24, 0),
        }
      ),
      instancesNode(
        `${id}:hub-towers`,
        cylinderInstancesGeometry([1.3, 1.6, 24, 18]),
        material('vessel', 0.56, 0.3),
        towerInstances
      ),
      meshNode(
        `${id}:hub-building`,
        boxGeometry([24, 9.2, 8]),
        material('building', 0.24, 0.62),
        {
          position: vec3(0, 4.6, 0),
        }
      ),
      meshNode(
        `${id}:hub-pipe`,
        cylinderGeometry([0.3, 0.3, 28, 16]),
        material('pipe', 0.6, 0.34),
        {
          position: vec3(0, 8.8, 0),
          rotation: vec3(0, 0, Math.PI / 2),
        }
      ),
    ]),
  ].filter((node): node is PublishedStaticRenderNode => node !== null)
}

export function createSectorStaticRenderRecipe(
  sector: CampusSector
): PublishedStaticChunkRenderRecipe {
  return {
    detailed: [
      groupNode(
        `recipe:${sector.id}:detailed-root`,
        [createSectorDetailedRoot(`recipe:${sector.id}:detailed`)],
        {
          position: vec3(sector.offset.x, sector.offset.y, sector.offset.z),
        }
      ),
    ],
    proxy: [
      groupNode(
        `recipe:${sector.id}:proxy-root`,
        [createSectorProxyRoot(`recipe:${sector.id}:proxy`)],
        {
          position: vec3(sector.offset.x, sector.offset.y, sector.offset.z),
        }
      ),
    ],
  }
}

export function createInterSectorStaticRenderRecipe(): PublishedStaticChunkRenderRecipe {
  return {
    detailed: createInterSectorRecipeDetailedNodes('recipe:inter-sector'),
  }
}
