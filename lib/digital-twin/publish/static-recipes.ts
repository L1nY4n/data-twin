import {
  CAMPUS_DISTRICTS,
  LOGISTICS_BAY_OFFSETS,
  PROCESS_WEST_LAYOUT_BLUEPRINTS,
  TANK_EAST_LAYOUT_BLUEPRINTS,
  type CampusSector,
  type LayoutBlueprint,
} from '../campus-layout'
import type { Vector3 } from '../types'
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
const COOLING_TOWER_OFFSETS = [-14, 0, 14] as const
const SUBSTATION_FRAME_OFFSETS = [-7, 0, 7] as const
const LOGISTICS_MAIN_ROAD_Z = 54
const LOGISTICS_BUFFER_Z = 62
const LOGISTICS_LOADING_APRON_Z = 69
const LOGISTICS_BUILDING_Z = 76
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
const TANK_METERING_BLUEPRINT =
  TANK_EAST_LAYOUT_BLUEPRINTS.find((item) => item.kind === 'service-building') ?? null

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
      return [blueprint.height, blueprint.height - 4, blueprint.height - 8]
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
  const supportCount = Math.max(2, Math.floor(blueprint.width / 12))
  const step = blueprint.width / supportCount
  const startX = -blueprint.width / 2
  const supportInstances: StaticInstanceSpec[] = Array.from(
    { length: supportCount + 1 },
    (_value, index) => {
      const localX = startX + index * step
      return [
        {
          key: `${id}:left-${index}`,
          position: [localX - 0.8, blueprint.height / 2, 0] as VecTuple3,
        },
        {
          key: `${id}:right-${index}`,
          position: [localX + 0.8, blueprint.height / 2, 0] as VecTuple3,
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
        boxInstancesGeometry([0.34, blueprint.height, 0.34]),
        material('steel', 0.68, 0.34),
        supportInstances
      ),
      meshNode(
        `${id}:deck`,
        boxGeometry([blueprint.width, 0.32, blueprint.depth]),
        material('steelDark', 0.66, 0.36),
        {
          position: vec3(0, blueprint.height + 0.2, 0),
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
            position: vec3(0, blueprint.height + 0.76 + Math.abs(offset) * 0.18, offset),
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
  return groupNode(
    id,
    [
      meshNode(
        `${id}:body`,
        boxGeometry([blueprint.width, blueprint.height, blueprint.depth]),
        material('building', 0.2, 0.68),
        {
          position: vec3(0, blueprint.height / 2, 0),
        }
      ),
      meshNode(
        `${id}:roof`,
        boxGeometry([blueprint.width + 0.6, 0.32, blueprint.depth + 0.6]),
        material('steelDark', 0.46, 0.42),
        {
          position: vec3(0, blueprint.height + 0.24, 0),
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
  const radius = blueprint.width * 0.42
  const sphereY = radius + 2.8
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
          position: vec3(radius + 1.2, 0, 0),
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

function createLoadingBayRowNode(id: string) {
  const apronInstances: StaticInstanceSpec[] = LOGISTICS_BAY_OFFSETS.map((offset) => ({
    key: `${id}:apron-${offset}`,
    position: [offset, 0.18, LOGISTICS_LOADING_APRON_Z],
  }))
  const frontStripeInstances: StaticInstanceSpec[] = LOGISTICS_BAY_OFFSETS.map((offset) => ({
    key: `${id}:front-stripe-${offset}`,
    position: [offset, 0.26, LOGISTICS_LOADING_APRON_Z - 3.4],
  }))
  const curbInstances: StaticInstanceSpec[] = LOGISTICS_BAY_OFFSETS.flatMap((offset) => [
    { key: `${id}:curb-left-${offset}`, position: [offset - 2.8, 0.26, LOGISTICS_LOADING_APRON_Z - 0.2] },
    { key: `${id}:curb-right-${offset}`, position: [offset + 2.8, 0.26, LOGISTICS_LOADING_APRON_Z - 0.2] },
  ])
  const canopyInstances: StaticInstanceSpec[] = LOGISTICS_BAY_OFFSETS.map((offset) => ({
    key: `${id}:canopy-${offset}`,
    position: [offset, 4.9, LOGISTICS_LOADING_APRON_Z + 0.15],
  }))
  const postInstances: StaticInstanceSpec[] = LOGISTICS_BAY_OFFSETS.flatMap((offset) => [
    { key: `${id}:front-left-${offset}`, position: [offset - 5.2, 2.4, LOGISTICS_LOADING_APRON_Z - 3.1] },
    { key: `${id}:front-right-${offset}`, position: [offset + 5.2, 2.4, LOGISTICS_LOADING_APRON_Z - 3.1] },
    { key: `${id}:rear-left-${offset}`, position: [offset - 5.2, 2.4, LOGISTICS_LOADING_APRON_Z + 3.1] },
    { key: `${id}:rear-right-${offset}`, position: [offset + 5.2, 2.4, LOGISTICS_LOADING_APRON_Z + 3.1] },
  ])
  const headerInstances: StaticInstanceSpec[] = LOGISTICS_BAY_OFFSETS.map((offset) => ({
    key: `${id}:header-${offset}`,
    position: [offset, 4.46, LOGISTICS_LOADING_APRON_Z + 1.5],
  }))
  const armColumnInstances: StaticInstanceSpec[] = LOGISTICS_BAY_OFFSETS.flatMap((offset) =>
    [-2.7, 2.7].map((armOffset, index) => ({
      key: `${id}:arm-column-${offset}-${index}`,
      position: [offset + armOffset, 2.1, LOGISTICS_LOADING_APRON_Z + 0.7],
    }))
  )
  const armHeaderInstances: StaticInstanceSpec[] = LOGISTICS_BAY_OFFSETS.flatMap((offset) =>
    [-2.7, 2.7].map((armOffset, index) => ({
      key: `${id}:arm-header-${offset}-${index}`,
      position: [offset + armOffset + 0.92, 3.96, LOGISTICS_LOADING_APRON_Z + 0.5],
      rotation: [0, 0, Math.PI / 2],
    }))
  )
  const armNozzleInstances: StaticInstanceSpec[] = LOGISTICS_BAY_OFFSETS.flatMap((offset) =>
    [-2.7, 2.7].map((armOffset, index) => ({
      key: `${id}:arm-nozzle-${offset}-${index}`,
      position: [offset + armOffset + 1.82, 3.68, LOGISTICS_LOADING_APRON_Z + 0.48],
      rotation: [0, 0, -Math.PI / 5],
    }))
  )
  const warningBoxInstances: StaticInstanceSpec[] = LOGISTICS_BAY_OFFSETS.flatMap((offset) =>
    [-2.7, 2.7].map((armOffset, index) => ({
      key: `${id}:arm-warning-${offset}-${index}`,
      position: [offset + armOffset - 0.12, 4.26, LOGISTICS_LOADING_APRON_Z + 0.78],
    }))
  )

  return groupNode(id, [
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
  ])
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
    createLoadingBayRowNode(`${id}:loading-bays`),
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
    meshNode(
      `${id}:building-west`,
      boxGeometry([34, 5.6, 12]),
      material('building', 0.18, 0.72),
      {
        position: vec3(-70, 2.8, LOGISTICS_BUILDING_Z),
      }
    ),
    meshNode(
      `${id}:building-east`,
      boxGeometry([30, 6.4, 12]),
      material('building', 0.2, 0.7),
      {
        position: vec3(68, 3.2, LOGISTICS_BUILDING_Z),
      }
    ),
    meshNode(
      `${id}:center-block`,
      boxGeometry([20, 3.6, 10]),
      material('slabAlt', 0.1, 0.78),
      {
        position: vec3(0, 1.8, 78),
      }
    ),
    instancesNode(
      `${id}:parking-markers`,
      boxInstancesGeometry([1.4, 0.04, 6]),
      material('stripe', 0.02, 0.92),
      parkingInstances
    ),
  ])
}

function createUtilitiesDistrictNode(id: string) {
  if (!UTILITIES_DISTRICT) return null

  const coolingTowerBodyInstances: StaticInstanceSpec[] = COOLING_TOWER_OFFSETS.map((offset) => ({
    key: `${id}:cooling-body-${offset}`,
    position: [-52 + offset, 4.5, -72],
  }))
  const coolingTowerCapInstances: StaticInstanceSpec[] = COOLING_TOWER_OFFSETS.map((offset) => ({
    key: `${id}:cooling-cap-${offset}`,
    position: [-52 + offset, 9.1, -72],
  }))
  const basinShellInstances: StaticInstanceSpec[] = [
    { key: `${id}:basin-west`, position: [12, 0.8, -72] },
    { key: `${id}:basin-east`, position: [30, 0.8, -72] },
  ]
  const basinWaterInstances: StaticInstanceSpec[] = [
    { key: `${id}:basin-west-water`, position: [12, 1.66, -72] },
    { key: `${id}:basin-east-water`, position: [30, 1.66, -72] },
  ]
  const substationPostInstances: StaticInstanceSpec[] = SUBSTATION_FRAME_OFFSETS.map((offset) => ({
    key: `${id}:substation-post-${offset}`,
    position: [74 + offset, 4.1, -72],
  }))
  const substationTopBeamInstances: StaticInstanceSpec[] = SUBSTATION_FRAME_OFFSETS.map((offset) => ({
    key: `${id}:substation-top-${offset}`,
    position: [74 + offset, 7.2, -72],
  }))
  const substationMidBeamInstances: StaticInstanceSpec[] = SUBSTATION_FRAME_OFFSETS.map((offset) => ({
    key: `${id}:substation-mid-${offset}`,
    position: [74 + offset, 5.2, -69.8],
  }))

  return groupNode(id, [
    createDistrictSlabNode(
      `${id}:slab`,
      [UTILITIES_DISTRICT.center.x, 0.14, UTILITIES_DISTRICT.center.z],
      [UTILITIES_DISTRICT.size.width, 0.28, UTILITIES_DISTRICT.size.depth],
      'slabAlt'
    ),
    instancesNode(
      `${id}:cooling-bodies`,
      cylinderInstancesGeometry([3.2, 4.8, 9, 24]),
      material('vessel', 0.36, 0.5),
      coolingTowerBodyInstances,
      { castShadow: true }
    ),
    instancesNode(
      `${id}:cooling-caps`,
      cylinderInstancesGeometry([4.2, 3.4, 0.3, 24]),
      material('vessel', 0.42, 0.42),
      coolingTowerCapInstances
    ),
    instancesNode(
      `${id}:basin-shells`,
      boxInstancesGeometry([14, 1.6, 12]),
      material('curb', 0.04, 0.88),
      basinShellInstances
    ),
    instancesNode(
      `${id}:basin-water`,
      boxInstancesGeometry([13, 0.08, 11]),
      material('water', 0.08, 0.2),
      basinWaterInstances
    ),
    meshNode(
      `${id}:utility-building`,
      boxGeometry([14, 2.4, 8]),
      material('building', 0.24, 0.66),
      {
        position: vec3(-6, 1.2, -72),
      }
    ),
    meshNode(
      `${id}:substation-base`,
      boxGeometry([22, 0.36, 14]),
      material('slab', 0.06, 0.92),
      {
        position: vec3(74, 0.18, -72),
      }
    ),
    instancesNode(
      `${id}:substation-posts`,
      boxInstancesGeometry([0.28, 8.2, 0.28]),
      material('power', 0.58, 0.3),
      substationPostInstances
    ),
    instancesNode(
      `${id}:substation-top-beams`,
      boxInstancesGeometry([5.6, 0.22, 0.22]),
      material('power', 0.58, 0.3),
      substationTopBeamInstances
    ),
    instancesNode(
      `${id}:substation-mid-beams`,
      boxInstancesGeometry([5.6, 0.18, 0.18]),
      material('power', 0.58, 0.3),
      substationMidBeamInstances
    ),
    meshNode(
      `${id}:flare-stack`,
      cylinderGeometry([0.54, 0.68, 18, 14]),
      material('vessel', 0.5, 0.28),
      {
        position: vec3(92, 10.2, -50),
      }
    ),
    meshNode(
      `${id}:flare-tip`,
      sphereGeometry([0.52, 12, 12]),
      material('flare', 0, 1, {
        emissiveToken: 'flare',
        emissiveIntensity: 0.85,
      }),
      {
        position: vec3(92, 19.8, -50),
      }
    ),
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
    meshNode(
      `${id}:process-volume`,
      cylinderGeometry([11, 11, 16, 16]),
      material('steelDark', 0.42, 0.44),
      {
        position: vec3(-56, 8.2, -28),
      }
    ),
    meshNode(
      `${id}:tank-volume`,
      boxGeometry([72, 11.2, 48]),
      material('vessel', 0.32, 0.5),
      {
        position: vec3(58, 5.6, -24),
      }
    ),
    meshNode(
      `${id}:logistics-volume`,
      boxGeometry([196, 0.36, 38]),
      material('road', 0.04, 0.9),
      {
        position: vec3(0, 0.18, 60),
      }
    ),
    meshNode(
      `${id}:utilities-volume`,
      boxGeometry([160, 0.36, 34]),
      material('slab', 0.04, 0.92),
      {
        position: vec3(0, 0.18, -72),
      }
    ),
    meshNode(
      `${id}:flare`,
      cylinderGeometry([0.6, 0.72, 22, 12]),
      material('vessel', 0.46, 0.34),
      {
        position: vec3(92, 14, -50),
      }
    ),
  ])
}

function createInterSectorRecipeDetailedNodes(id: string) {
  const roadStripeXInstances: StaticInstanceSpec[] = [
    -352, -288, -224, -160, -96, -32, 32, 96, 160, 224, 288, 352,
  ].map((offset) => ({
    key: `${id}:road-x-${offset}`,
    position: [offset, 0.14, 0],
  }))
  const roadStripeZInstances: StaticInstanceSpec[] = [
    -96, -32, 32, 96, 160, 224, 288, 352,
  ].map((offset) => ({
    key: `${id}:road-z-${offset}`,
    position: [0, 0.14, offset + 4],
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
      boxGeometry([780, 0.12, 18]),
      material('road', 0.05, 0.9),
      {
        position: vec3(0, 0.06, 0),
        receiveShadow: true,
      }
    ),
    meshNode(
      `${id}:corridor-z`,
      boxGeometry([18, 0.12, 500]),
      material('road', 0.05, 0.9),
      {
        position: vec3(0, 0.06, 130),
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
    createPipeBridgeNode(`${id}:bridge-east-west`, [-372, 0, 0], [372, 0, 0], 9.2),
    createPipeBridgeNode(`${id}:bridge-south-north`, [0, 0, -112], [0, 0, 372], 9.6),
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
