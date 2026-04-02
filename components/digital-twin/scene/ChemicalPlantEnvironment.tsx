'use client'

import { memo } from 'react'
import { Instance, Instances } from '@react-three/drei'
import {
  CAMPUS_DISTRICTS,
  PROCESS_WEST_LAYOUT_BLUEPRINTS,
  TANK_EAST_LAYOUT_BLUEPRINTS,
  type LayoutBlueprint,
} from '@/lib/digital-twin/campus-layout'

interface ChemicalPlantEnvironmentProps {
  isDark: boolean
}

interface PlantPalette {
  ground: string
  slab: string
  slabAlt: string
  curb: string
  steel: string
  steelDark: string
  vessel: string
  pipe: string
  road: string
  stripe: string
  canopy: string
  building: string
  water: string
  warning: string
  flare: string
  power: string
}

interface DistrictSlabProps {
  center: [number, number, number]
  size: [number, number, number]
  fill: string
  curb: string
}

interface PipeBridgeProps {
  from: [number, number, number]
  to: [number, number, number]
  supportHeight: number
  palette: PlantPalette
}

interface StaticBoxInstanceSpec {
  key: string
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
}

const BAY_OFFSETS = [-70, -36, -2, 32, 66] as const
const PARKING_OFFSETS = [-82, -70, -58, 48, 60, 72, 84] as const
const COOLING_TOWER_OFFSETS = [-14, 0, 14] as const
const SUBSTATION_FRAME_OFFSETS = [-7, 0, 7] as const
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
const PROCESS_TRAIN_BLUEPRINTS = PROCESS_WEST_LAYOUT_BLUEPRINTS.filter((item) => item.kind === 'process-train')
const PROCESS_FRONT_STRIP_BLUEPRINT =
  PROCESS_WEST_LAYOUT_BLUEPRINTS.find((item) => item.kind === 'process-strip') ?? null
const PROCESS_CONTROL_ROOM_BLUEPRINT =
  PROCESS_WEST_LAYOUT_BLUEPRINTS.find((item) => item.kind === 'service-building') ?? null
const PROCESS_PIPE_RACK_BLUEPRINT =
  PROCESS_WEST_LAYOUT_BLUEPRINTS.find((item) => item.kind === 'pipe-rack') ?? null
const TANK_BUND_BLUEPRINTS = TANK_EAST_LAYOUT_BLUEPRINTS.filter((item) => item.kind === 'bund')
const TANK_VERTICAL_BLUEPRINTS = TANK_EAST_LAYOUT_BLUEPRINTS.filter((item) => item.kind === 'vertical-tank')
const TANK_SPHERE_BLUEPRINTS = TANK_EAST_LAYOUT_BLUEPRINTS.filter((item) => item.kind === 'sphere-tank')
const TANK_MANIFOLD_BLUEPRINT =
  TANK_EAST_LAYOUT_BLUEPRINTS.find((item) => item.kind === 'pump-manifold') ?? null
const TANK_METERING_BLUEPRINT =
  TANK_EAST_LAYOUT_BLUEPRINTS.find((item) => item.kind === 'service-building') ?? null

function StaticBoxInstances({
  args,
  color,
  metalness,
  roughness,
  instances,
  castShadow = false,
  receiveShadow = false,
}: {
  args: [number, number, number]
  color: string
  metalness: number
  roughness: number
  instances: StaticBoxInstanceSpec[]
  castShadow?: boolean
  receiveShadow?: boolean
}) {
  if (instances.length === 0) return null

  return (
    <Instances limit={instances.length} frames={1} castShadow={castShadow} receiveShadow={receiveShadow}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
      {instances.map((item) => (
        <Instance
          key={item.key}
          position={item.position}
          rotation={item.rotation}
          scale={item.scale}
        />
      ))}
    </Instances>
  )
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

function createPalette(isDark: boolean): PlantPalette {
  return {
    ground: isDark ? '#0d1620' : '#dce7f1',
    slab: isDark ? '#1a2430' : '#d8e1ea',
    slabAlt: isDark ? '#212c39' : '#e3eaf1',
    curb: isDark ? '#4d5f73' : '#aab7c6',
    steel: isDark ? '#54789c' : '#6e97bd',
    steelDark: isDark ? '#29425b' : '#496b8e',
    vessel: isDark ? '#97a9bb' : '#cfd8e2',
    pipe: isDark ? '#72859a' : '#91a5ba',
    road: isDark ? '#293140' : '#9099a7',
    stripe: isDark ? '#cbd5e1' : '#ffffff',
    canopy: isDark ? '#2e5577' : '#6c95bb',
    building: isDark ? '#566170' : '#95a2b0',
    water: isDark ? '#24506b' : '#82b7d5',
    warning: '#f59e0b',
    flare: '#f97316',
    power: isDark ? '#cbd5e1' : '#e2e8f0',
  }
}

function DistrictSlab({ center, size, fill, curb }: DistrictSlabProps) {
  const [x, y, z] = center
  const [width, height, depth] = size
  const halfWidth = width / 2
  const halfDepth = depth / 2

  return (
    <group>
      <mesh position={[x, y, z]} receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={fill} roughness={0.96} metalness={0.05} />
      </mesh>
      <mesh position={[x, y + 0.34, z - halfDepth + 0.3]}>
        <boxGeometry args={[width, 0.68, 0.6]} />
        <meshStandardMaterial color={curb} roughness={0.78} metalness={0.08} />
      </mesh>
      <mesh position={[x, y + 0.34, z + halfDepth - 0.3]}>
        <boxGeometry args={[width, 0.68, 0.6]} />
        <meshStandardMaterial color={curb} roughness={0.78} metalness={0.08} />
      </mesh>
      <mesh position={[x - halfWidth + 0.3, y + 0.34, z]}>
        <boxGeometry args={[0.6, 0.68, depth]} />
        <meshStandardMaterial color={curb} roughness={0.78} metalness={0.08} />
      </mesh>
      <mesh position={[x + halfWidth - 0.3, y + 0.34, z]}>
        <boxGeometry args={[0.6, 0.68, depth]} />
        <meshStandardMaterial color={curb} roughness={0.78} metalness={0.08} />
      </mesh>
    </group>
  )
}

function PipeBridge({ from, to, supportHeight, palette }: PipeBridgeProps) {
  const dx = to[0] - from[0]
  const dz = to[2] - from[2]
  const length = Math.hypot(dx, dz)
  const yaw = Math.atan2(dx, dz)
  const supportCount = Math.max(2, Math.floor(length / 14))
  const step = length / supportCount
  const supportInstances: StaticBoxInstanceSpec[] = Array.from(
    { length: supportCount + 1 },
    (_value, index) => {
      const localZ = index * step
      return [
        {
          key: `support-left-${index}`,
          position: [-1.2, supportHeight / 2, localZ] as [number, number, number],
        },
        {
          key: `support-right-${index}`,
          position: [1.2, supportHeight / 2, localZ] as [number, number, number],
        },
      ]
    }
  ).flat()

  return (
    <group position={[from[0], 0, from[2]]} rotation={[0, yaw, 0]}>
      <StaticBoxInstances
        args={[0.38, supportHeight, 0.38]}
        color={palette.steel}
        metalness={0.68}
        roughness={0.34}
        instances={supportInstances}
      />

      <mesh position={[0, supportHeight + 0.18, length / 2]}>
        <boxGeometry args={[3.4, 0.36, length]} />
        <meshStandardMaterial color={palette.steelDark} metalness={0.7} roughness={0.34} />
      </mesh>
      <mesh position={[-0.72, supportHeight + 0.76, length / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.2, length, 14]} />
        <meshStandardMaterial color={palette.pipe} metalness={0.58} roughness={0.36} />
      </mesh>
      <mesh position={[0, supportHeight + 0.56, length / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.24, 0.24, length, 16]} />
        <meshStandardMaterial color={palette.pipe} metalness={0.58} roughness={0.36} />
      </mesh>
      <mesh position={[0.76, supportHeight + 0.9, length / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.16, 0.16, length, 14]} />
        <meshStandardMaterial color={palette.pipe} metalness={0.58} roughness={0.36} />
      </mesh>
      <mesh position={[0, supportHeight + 1.36, length / 2]}>
        <boxGeometry args={[3.8, 0.18, length]} />
        <meshStandardMaterial color={palette.steelDark} metalness={0.62} roughness={0.38} />
      </mesh>
    </group>
  )
}

function LinearPipeRack({ blueprint, palette }: { blueprint: LayoutBlueprint; palette: PlantPalette }) {
  const supportCount = Math.max(2, Math.floor(blueprint.width / 12))
  const step = blueprint.width / supportCount
  const startX = -blueprint.width / 2
  const supportInstances: StaticBoxInstanceSpec[] = Array.from(
    { length: supportCount + 1 },
    (_value, index) => {
      const localX = startX + index * step
      return [
        {
          key: `${blueprint.id}-left-${index}`,
          position: [localX - 0.8, blueprint.height / 2, 0] as [number, number, number],
        },
        {
          key: `${blueprint.id}-right-${index}`,
          position: [localX + 0.8, blueprint.height / 2, 0] as [number, number, number],
        },
      ]
    }
  ).flat()

  return (
    <group position={[blueprint.center.x, 0, blueprint.center.z]}>
      <mesh position={[0, 0.22, 0]} receiveShadow>
        <boxGeometry args={[blueprint.width, 0.44, blueprint.depth]} />
        <meshStandardMaterial color={palette.slabAlt} roughness={0.94} metalness={0.06} />
      </mesh>
      <StaticBoxInstances
        args={[0.34, blueprint.height, 0.34]}
        color={palette.steel}
        metalness={0.68}
        roughness={0.34}
        instances={supportInstances}
      />
      <mesh position={[0, blueprint.height + 0.2, 0]}>
        <boxGeometry args={[blueprint.width, 0.32, blueprint.depth]} />
        <meshStandardMaterial color={palette.steelDark} metalness={0.66} roughness={0.36} />
      </mesh>
      {[-0.62, 0, 0.62].map((offset) => (
        <mesh key={`${blueprint.id}-pipe-${offset}`} position={[0, blueprint.height + 0.76 + Math.abs(offset) * 0.18, offset]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16 + Math.abs(offset) * 0.04, 0.16 + Math.abs(offset) * 0.04, blueprint.width, 16]} />
          <meshStandardMaterial color={palette.pipe} metalness={0.58} roughness={0.36} />
        </mesh>
      ))}
    </group>
  )
}

function ProcessTrain({ blueprint, palette }: { blueprint: LayoutBlueprint; palette: PlantPalette }) {
  const halfWidth = blueprint.width / 2
  const halfDepth = blueprint.depth / 2
  const towerHeights = resolveProcessTowerHeights(blueprint)
  const towerOffsets =
    towerHeights.length === 3
      ? [-halfWidth + 3.2, 0, halfWidth - 3.2]
      : [-halfWidth + 4, halfWidth - 4]
  const frameOffsets = [-halfWidth + 2.4, 0, halfWidth - 2.4]
  const frameInstances: StaticBoxInstanceSpec[] = frameOffsets.flatMap((offset) => [
    {
      key: `${blueprint.id}-frame-front-${offset}`,
      position: [offset, 4.6, -1.6],
    },
    {
      key: `${blueprint.id}-frame-rear-${offset}`,
      position: [offset, 4.6, 3.2],
    },
  ])

  return (
    <group position={[blueprint.center.x, 0, blueprint.center.z]}>
      <mesh position={[0, 0.24, 0]} receiveShadow>
        <boxGeometry args={[blueprint.width, 0.48, blueprint.depth]} />
        <meshStandardMaterial color={palette.slab} roughness={0.94} metalness={0.06} />
      </mesh>

      <StaticBoxInstances
        args={[0.58, 9.2, 0.58]}
        color={palette.steel}
        metalness={0.68}
        roughness={0.36}
        instances={frameInstances}
      />

      {[4.4, 8.2].map((level) => (
        <group key={`${blueprint.id}-deck-${level}`}>
          <mesh position={[0, level, -0.6]}>
            <boxGeometry args={[blueprint.width - 3.2, 0.22, blueprint.depth - 5.6]} />
            <meshStandardMaterial color={palette.steelDark} metalness={0.56} roughness={0.44} />
          </mesh>
          <mesh position={[0, level + 0.18, halfDepth - 3.6]}>
            <boxGeometry args={[blueprint.width - 2.8, 0.16, 0.34]} />
            <meshStandardMaterial color={palette.steelDark} metalness={0.62} roughness={0.38} />
          </mesh>
          <mesh position={[0, level + 0.18, -halfDepth + 2.8]}>
            <boxGeometry args={[blueprint.width - 2.8, 0.16, 0.34]} />
            <meshStandardMaterial color={palette.steelDark} metalness={0.62} roughness={0.38} />
          </mesh>
        </group>
      ))}

      {towerHeights.map((height, index) => (
        <mesh
          key={`${blueprint.id}-tower-${index}`}
          position={[towerOffsets[index] ?? 0, height / 2 + 0.5, -halfDepth + 3.6 + index * 1.2]}
          castShadow
        >
          <cylinderGeometry args={[1.02 - index * 0.12, 1.16 - index * 0.08, height, 24]} />
          <meshStandardMaterial color={palette.vessel} metalness={0.58} roughness={0.3} />
        </mesh>
      ))}

      {[-halfWidth + 3.4, 0, halfWidth - 3.4].map((offset, index) => (
        <mesh
          key={`${blueprint.id}-exchanger-${offset}`}
          position={[offset, 1.9 + (index % 2) * 0.4, halfDepth - 2.6]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.74, 0.74, blueprint.width * 0.22, 16]} />
          <meshStandardMaterial color={palette.pipe} metalness={0.54} roughness={0.4} />
        </mesh>
      ))}

      <mesh position={[0, 2.8, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.24, 0.24, blueprint.width - 4, 14]} />
        <meshStandardMaterial color={palette.pipe} metalness={0.58} roughness={0.36} />
      </mesh>
      <mesh position={[0, 3.6, -halfDepth + 4.2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.18, 0.18, blueprint.width - 4.6, 14]} />
        <meshStandardMaterial color={palette.pipe} metalness={0.58} roughness={0.36} />
      </mesh>
      <mesh position={[halfWidth - 2.4, 1.2, halfDepth - 2.6]}>
        <boxGeometry args={[2.8, 2.4, 2.2]} />
        <meshStandardMaterial color={palette.building} metalness={0.26} roughness={0.6} />
      </mesh>
    </group>
  )
}

function ProcessFrontStrip({ blueprint, palette }: { blueprint: LayoutBlueprint; palette: PlantPalette }) {
  const exchangerOffsets = [-18, -6, 6, 18]

  return (
    <group position={[blueprint.center.x, 0, blueprint.center.z]}>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[blueprint.width, 0.36, blueprint.depth]} />
        <meshStandardMaterial color={palette.slabAlt} roughness={0.94} metalness={0.06} />
      </mesh>
      {exchangerOffsets.map((offset) => (
        <group key={`${blueprint.id}-bank-${offset}`} position={[offset, 0, 0]}>
          <mesh position={[0, 1.4, -1.2]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.68, 0.68, 4.8, 16]} />
            <meshStandardMaterial color={palette.pipe} metalness={0.54} roughness={0.38} />
          </mesh>
          <mesh position={[0, 0.86, 1.6]}>
            <boxGeometry args={[2.6, 1.72, 1.8]} />
            <meshStandardMaterial color={palette.building} metalness={0.22} roughness={0.62} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 3.2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.22, 0.22, blueprint.width - 6, 16]} />
        <meshStandardMaterial color={palette.pipe} metalness={0.58} roughness={0.36} />
      </mesh>
      <mesh position={[0, 3.9, -1.4]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.16, 0.16, blueprint.width - 10, 14]} />
        <meshStandardMaterial color={palette.pipe} metalness={0.58} roughness={0.36} />
      </mesh>
    </group>
  )
}

function ServiceBuilding({ blueprint, palette }: { blueprint: LayoutBlueprint; palette: PlantPalette }) {
  return (
    <group position={[blueprint.center.x, 0, blueprint.center.z]}>
      <mesh position={[0, blueprint.height / 2, 0]}>
        <boxGeometry args={[blueprint.width, blueprint.height, blueprint.depth]} />
        <meshStandardMaterial color={palette.building} metalness={0.2} roughness={0.68} />
      </mesh>
      <mesh position={[0, blueprint.height + 0.24, 0]}>
        <boxGeometry args={[blueprint.width + 0.6, 0.32, blueprint.depth + 0.6]} />
        <meshStandardMaterial color={palette.steelDark} metalness={0.46} roughness={0.42} />
      </mesh>
    </group>
  )
}

function TankBund({ blueprint, palette }: { blueprint: LayoutBlueprint; palette: PlantPalette }) {
  const halfWidth = blueprint.width / 2
  const halfDepth = blueprint.depth / 2

  return (
    <group position={[blueprint.center.x, 0, blueprint.center.z]}>
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[blueprint.width, 0.16, blueprint.depth]} />
        <meshStandardMaterial color={palette.slabAlt} roughness={0.98} metalness={0.02} />
      </mesh>
      <mesh position={[0, blueprint.height / 2, -halfDepth + 0.22]}>
        <boxGeometry args={[blueprint.width, blueprint.height, 0.44]} />
        <meshStandardMaterial color={palette.curb} roughness={0.82} metalness={0.08} />
      </mesh>
      <mesh position={[0, blueprint.height / 2, halfDepth - 0.22]}>
        <boxGeometry args={[blueprint.width, blueprint.height, 0.44]} />
        <meshStandardMaterial color={palette.curb} roughness={0.82} metalness={0.08} />
      </mesh>
      <mesh position={[-halfWidth + 0.22, blueprint.height / 2, 0]}>
        <boxGeometry args={[0.44, blueprint.height, blueprint.depth]} />
        <meshStandardMaterial color={palette.curb} roughness={0.82} metalness={0.08} />
      </mesh>
      <mesh position={[halfWidth - 0.22, blueprint.height / 2, 0]}>
        <boxGeometry args={[0.44, blueprint.height, blueprint.depth]} />
        <meshStandardMaterial color={palette.curb} roughness={0.82} metalness={0.08} />
      </mesh>
    </group>
  )
}

function VerticalTankCompound({ blueprint, palette }: { blueprint: LayoutBlueprint; palette: PlantPalette }) {
  const { tankOffsets, radius, height } = resolveVerticalTankLayout(blueprint)

  return (
    <group position={[blueprint.center.x, 0, blueprint.center.z]}>
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[blueprint.width - 2, 0.32, blueprint.depth - 2]} />
        <meshStandardMaterial color={palette.slab} roughness={0.94} metalness={0.04} />
      </mesh>
      {tankOffsets.map((offset, index) => (
        <group key={`${blueprint.id}-tank-${index}`} position={[offset[0], 0, offset[1]]}>
          <mesh position={[0, height / 2 + 0.28, 0]} castShadow={index === 0}>
            <cylinderGeometry args={[radius, radius + 0.12, height, 24]} />
            <meshStandardMaterial color={palette.vessel} metalness={0.48} roughness={0.34} />
          </mesh>
          <mesh position={[0, height + 0.44, 0]}>
            <cylinderGeometry args={[radius + 0.1, radius + 0.1, 0.24, 24]} />
            <meshStandardMaterial color={palette.vessel} metalness={0.5} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.32, 0]}>
            <cylinderGeometry args={[radius + 0.56, radius + 0.56, 0.24, 24]} />
            <meshStandardMaterial color={palette.curb} roughness={0.78} metalness={0.04} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 3.4, blueprint.depth / 2 - 2.1]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.18, 0.18, blueprint.width - 7.2, 12]} />
        <meshStandardMaterial color={palette.pipe} metalness={0.56} roughness={0.38} />
      </mesh>
    </group>
  )
}

function SphereTank({ blueprint, palette }: { blueprint: LayoutBlueprint; palette: PlantPalette }) {
  const radius = blueprint.width * 0.42
  const sphereY = radius + 2.8
  const legInstances: StaticBoxInstanceSpec[] = SPHERE_SUPPORT_OFFSETS.map((offset, index) => ({
    key: `${blueprint.id}-leg-${index}`,
    position: [offset[0], sphereY / 2, offset[1]],
  }))

  return (
    <group position={[blueprint.center.x, 0, blueprint.center.z]}>
      <mesh position={[0, sphereY, 0]} castShadow>
        <sphereGeometry args={[radius, 24, 24]} />
        <meshStandardMaterial color={palette.vessel} metalness={0.56} roughness={0.28} />
      </mesh>
      <StaticBoxInstances
        args={[0.24, sphereY - 1.2, 0.24]}
        color={palette.steel}
        metalness={0.68}
        roughness={0.34}
        instances={legInstances}
      />
      <mesh position={[0, 0.32, 0]}>
        <cylinderGeometry args={[radius + 0.56, radius + 0.56, 0.24, 24]} />
        <meshStandardMaterial color={palette.curb} roughness={0.78} metalness={0.04} />
      </mesh>
      <mesh position={[0, sphereY + 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 0.82, 0.08, 10, 28]} />
        <meshStandardMaterial color={palette.steelDark} metalness={0.56} roughness={0.36} />
      </mesh>
    </group>
  )
}

function PumpManifold({ blueprint, palette }: { blueprint: LayoutBlueprint; palette: PlantPalette }) {
  const offsets = [-3.2, 0, 3.2]

  return (
    <group position={[blueprint.center.x, 0, blueprint.center.z]}>
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[blueprint.width, 0.32, blueprint.depth]} />
        <meshStandardMaterial color={palette.slabAlt} roughness={0.94} metalness={0.04} />
      </mesh>
      {offsets.map((offset) => (
        <group key={`${blueprint.id}-pump-${offset}`} position={[offset, 0, 0]}>
          <mesh position={[0, 0.74, 0]}>
            <boxGeometry args={[1.8, 1.48, 1.8]} />
            <meshStandardMaterial color={palette.building} metalness={0.24} roughness={0.6} />
          </mesh>
          <mesh position={[0, 2.2, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.18, 0.18, 3.2, 12]} />
            <meshStandardMaterial color={palette.pipe} metalness={0.58} roughness={0.36} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 3.2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.22, 0.22, blueprint.width - 1.4, 16]} />
        <meshStandardMaterial color={palette.pipe} metalness={0.58} roughness={0.36} />
      </mesh>
    </group>
  )
}

function ProcessDistrict({ palette }: { palette: PlantPalette }) {
  if (!PROCESS_DISTRICT) return null

  return (
    <group>
      <DistrictSlab
        center={[PROCESS_DISTRICT.center.x, 0.2, PROCESS_DISTRICT.center.z]}
        size={[PROCESS_DISTRICT.size.width, 0.4, PROCESS_DISTRICT.size.depth]}
        fill={palette.slabAlt}
        curb={palette.curb}
      />
      {PROCESS_TRAIN_BLUEPRINTS.map((blueprint) => (
        <ProcessTrain key={blueprint.id} blueprint={blueprint} palette={palette} />
      ))}
      {PROCESS_FRONT_STRIP_BLUEPRINT ? <ProcessFrontStrip blueprint={PROCESS_FRONT_STRIP_BLUEPRINT} palette={palette} /> : null}
      {PROCESS_CONTROL_ROOM_BLUEPRINT ? <ServiceBuilding blueprint={PROCESS_CONTROL_ROOM_BLUEPRINT} palette={palette} /> : null}
      {PROCESS_PIPE_RACK_BLUEPRINT ? <LinearPipeRack blueprint={PROCESS_PIPE_RACK_BLUEPRINT} palette={palette} /> : null}
    </group>
  )
}

function TankFarmDistrict({ palette }: { palette: PlantPalette }) {
  if (!TANK_DISTRICT) return null

  return (
    <group>
      <DistrictSlab
        center={[TANK_DISTRICT.center.x, 0.18, TANK_DISTRICT.center.z]}
        size={[TANK_DISTRICT.size.width, 0.36, TANK_DISTRICT.size.depth]}
        fill={palette.slab}
        curb={palette.curb}
      />
      {TANK_BUND_BLUEPRINTS.map((blueprint) => (
        <TankBund key={blueprint.id} blueprint={blueprint} palette={palette} />
      ))}
      {TANK_VERTICAL_BLUEPRINTS.map((blueprint) => (
        <VerticalTankCompound key={blueprint.id} blueprint={blueprint} palette={palette} />
      ))}
      {TANK_SPHERE_BLUEPRINTS.map((blueprint) => (
        <SphereTank key={blueprint.id} blueprint={blueprint} palette={palette} />
      ))}
      {TANK_MANIFOLD_BLUEPRINT ? <PumpManifold blueprint={TANK_MANIFOLD_BLUEPRINT} palette={palette} /> : null}
      {TANK_METERING_BLUEPRINT ? <ServiceBuilding blueprint={TANK_METERING_BLUEPRINT} palette={palette} /> : null}
      <mesh position={[54, 3.1, -17]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.22, 0.22, 24, 16]} />
        <meshStandardMaterial color={palette.pipe} metalness={0.56} roughness={0.36} />
      </mesh>
      <mesh position={[66, 4.2, -23]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 22, 14]} />
        <meshStandardMaterial color={palette.pipe} metalness={0.56} roughness={0.36} />
      </mesh>
      <mesh position={[74, 5.8, -28]}>
        <boxGeometry args={[12, 0.24, 4]} />
        <meshStandardMaterial color={palette.steelDark} metalness={0.64} roughness={0.36} />
      </mesh>
    </group>
  )
}

function LogisticsDistrict({ palette }: { palette: PlantPalette }) {
  if (!LOGISTICS_DISTRICT) return null

  const bayPostInstances: StaticBoxInstanceSpec[] = BAY_OFFSETS.flatMap((offset) => [
    {
      key: `bay-left-${offset}`,
      position: [offset - 5.4, 2.2, 49.2],
    },
    {
      key: `bay-right-${offset}`,
      position: [offset + 5.4, 2.2, 49.2],
    },
  ])

  return (
    <group>
      <mesh position={[LOGISTICS_DISTRICT.center.x, 0.05, LOGISTICS_DISTRICT.center.z]} receiveShadow>
        <boxGeometry args={[LOGISTICS_DISTRICT.size.width, 0.1, 18]} />
        <meshStandardMaterial color={palette.road} roughness={0.9} metalness={0.06} />
      </mesh>
      {[-84, -56, -28, 0, 28, 56, 84].map((offset) => (
        <mesh key={`road-line-${offset}`} position={[offset, 0.12, LOGISTICS_DISTRICT.center.z]}>
          <boxGeometry args={[3.6, 0.04, 0.32]} />
          <meshStandardMaterial color={palette.stripe} roughness={0.92} metalness={0.02} />
        </mesh>
      ))}

      {BAY_OFFSETS.map((offset) => (
        <group key={`bay-${offset}`} position={[offset, 0, 56]}>
          <mesh position={[0, 0.24, -4.8]}>
            <boxGeometry args={[12.2, 0.48, 5.4]} />
            <meshStandardMaterial color={palette.curb} roughness={0.82} metalness={0.06} />
          </mesh>
          <mesh position={[0, 4.4, -4.8]}>
            <boxGeometry args={[12.8, 0.24, 6]} />
            <meshStandardMaterial color={palette.canopy} metalness={0.6} roughness={0.34} />
          </mesh>
        </group>
      ))}
      <StaticBoxInstances
        args={[0.34, 4.4, 0.34]}
        color={palette.canopy}
        metalness={0.6}
        roughness={0.34}
        instances={bayPostInstances}
      />

      <mesh position={[-70, 2.8, 74]}>
        <boxGeometry args={[34, 5.6, 12]} />
        <meshStandardMaterial color={palette.building} metalness={0.18} roughness={0.72} />
      </mesh>
      <mesh position={[68, 3.2, 74]}>
        <boxGeometry args={[30, 6.4, 12]} />
        <meshStandardMaterial color={palette.building} metalness={0.2} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.8, 76]}>
        <boxGeometry args={[20, 3.6, 10]} />
        <meshStandardMaterial color={palette.slabAlt} metalness={0.1} roughness={0.78} />
      </mesh>
      {PARKING_OFFSETS.map((offset) => (
        <mesh key={`parking-${offset}`} position={[offset, 0.12, 78]}>
          <boxGeometry args={[1.4, 0.04, 6]} />
          <meshStandardMaterial color={palette.stripe} roughness={0.92} metalness={0.02} />
        </mesh>
      ))}
    </group>
  )
}

function UtilitiesDistrict({ palette }: { palette: PlantPalette }) {
  if (!UTILITIES_DISTRICT) return null

  return (
    <group>
      <DistrictSlab
        center={[UTILITIES_DISTRICT.center.x, 0.14, UTILITIES_DISTRICT.center.z]}
        size={[UTILITIES_DISTRICT.size.width, 0.28, UTILITIES_DISTRICT.size.depth]}
        fill={palette.slabAlt}
        curb={palette.curb}
      />

      {COOLING_TOWER_OFFSETS.map((offset) => (
        <group key={`cooling-${offset}`} position={[-52 + offset, 0, -72]}>
          <mesh position={[0, 4.5, 0]} castShadow>
            <cylinderGeometry args={[3.2, 4.8, 9, 24]} />
            <meshStandardMaterial color={palette.vessel} metalness={0.36} roughness={0.5} />
          </mesh>
          <mesh position={[0, 9.1, 0]}>
            <cylinderGeometry args={[4.2, 3.4, 0.3, 24]} />
            <meshStandardMaterial color={palette.vessel} metalness={0.42} roughness={0.42} />
          </mesh>
        </group>
      ))}

      <group position={[22, 0, -72]}>
        <mesh position={[-10, 0.8, 0]}>
          <boxGeometry args={[14, 1.6, 12]} />
          <meshStandardMaterial color={palette.curb} roughness={0.88} metalness={0.04} />
        </mesh>
        <mesh position={[8, 0.8, 0]}>
          <boxGeometry args={[14, 1.6, 12]} />
          <meshStandardMaterial color={palette.curb} roughness={0.88} metalness={0.04} />
        </mesh>
        <mesh position={[-10, 1.66, 0]}>
          <boxGeometry args={[13, 0.08, 11]} />
          <meshStandardMaterial color={palette.water} roughness={0.2} metalness={0.08} />
        </mesh>
        <mesh position={[8, 1.66, 0]}>
          <boxGeometry args={[13, 0.08, 11]} />
          <meshStandardMaterial color={palette.water} roughness={0.2} metalness={0.08} />
        </mesh>
      </group>

      <mesh position={[-6, 1.2, -72]}>
        <boxGeometry args={[14, 2.4, 8]} />
        <meshStandardMaterial color={palette.building} metalness={0.24} roughness={0.66} />
      </mesh>

      <group position={[74, 0, -72]}>
        <mesh position={[0, 0.18, 0]}>
          <boxGeometry args={[22, 0.36, 14]} />
          <meshStandardMaterial color={palette.slab} roughness={0.92} metalness={0.06} />
        </mesh>
        {SUBSTATION_FRAME_OFFSETS.map((offset) => (
          <group key={`substation-${offset}`} position={[offset, 0, 0]}>
            <mesh position={[0, 4.1, 0]}>
              <boxGeometry args={[0.28, 8.2, 0.28]} />
              <meshStandardMaterial color={palette.power} metalness={0.58} roughness={0.3} />
            </mesh>
            <mesh position={[0, 7.2, 0]}>
              <boxGeometry args={[5.6, 0.22, 0.22]} />
              <meshStandardMaterial color={palette.power} metalness={0.58} roughness={0.3} />
            </mesh>
            <mesh position={[0, 5.2, 2.2]}>
              <boxGeometry args={[5.6, 0.18, 0.18]} />
              <meshStandardMaterial color={palette.power} metalness={0.58} roughness={0.3} />
            </mesh>
          </group>
        ))}
      </group>

      <mesh position={[92, 10.2, -50]}>
        <cylinderGeometry args={[0.54, 0.68, 18, 14]} />
        <meshStandardMaterial color={palette.vessel} metalness={0.5} roughness={0.28} />
      </mesh>
      <mesh position={[92, 19.8, -50]}>
        <sphereGeometry args={[0.52, 12, 12]} />
        <meshStandardMaterial color={palette.flare} emissive={palette.flare} emissiveIntensity={0.85} />
      </mesh>
    </group>
  )
}

function CampusLinks({ palette }: { palette: PlantPalette }) {
  return (
    <group>
      <mesh position={[0, 0.05, -4]} receiveShadow>
        <boxGeometry args={[178, 0.1, 12]} />
        <meshStandardMaterial color={palette.road} roughness={0.88} metalness={0.06} />
      </mesh>
      <mesh position={[0, 0.05, -72]} receiveShadow>
        <boxGeometry args={[190, 0.1, 16]} />
        <meshStandardMaterial color={palette.road} roughness={0.88} metalness={0.06} />
      </mesh>
      <mesh position={[0, 0.05, 18]} receiveShadow>
        <boxGeometry args={[12, 0.1, 88]} />
        <meshStandardMaterial color={palette.road} roughness={0.88} metalness={0.06} />
      </mesh>
      <mesh position={[-88, 0.05, 8]} receiveShadow>
        <boxGeometry args={[8, 0.1, 108]} />
        <meshStandardMaterial color={palette.road} roughness={0.88} metalness={0.06} />
      </mesh>
      <mesh position={[86, 0.05, 8]} receiveShadow>
        <boxGeometry args={[8, 0.1, 108]} />
        <meshStandardMaterial color={palette.road} roughness={0.88} metalness={0.06} />
      </mesh>

      <PipeBridge from={[-86, 0, -4]} to={[86, 0, -4]} supportHeight={6.2} palette={palette} />
      <PipeBridge from={[0, 0, -72]} to={[0, 0, -4]} supportHeight={7.4} palette={palette} />
      <PipeBridge from={[-88, 0, -34]} to={[-88, 0, -4]} supportHeight={5.6} palette={palette} />
      <PipeBridge from={[86, 0, -34]} to={[86, 0, -4]} supportHeight={5.8} palette={palette} />
    </group>
  )
}

export const ChemicalPlantEnvironment = memo(function ChemicalPlantEnvironment({ isDark }: ChemicalPlantEnvironmentProps) {
  const palette = createPalette(isDark)

  return (
    <group name="chemical-plant-campus">
      <mesh position={[0, -0.22, 0]} receiveShadow>
        <boxGeometry args={[236, 0.44, 236]} />
        <meshStandardMaterial color={palette.ground} roughness={1} metalness={0} />
      </mesh>

      <CampusLinks palette={palette} />
      <ProcessDistrict palette={palette} />
      <TankFarmDistrict palette={palette} />
      <LogisticsDistrict palette={palette} />
      <UtilitiesDistrict palette={palette} />
    </group>
  )
})
