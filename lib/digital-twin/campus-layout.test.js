import { describe, expect, test } from 'bun:test'
import {
  CAMPUS_BOUNDS,
  CAMPUS_CAMERA_PRESETS,
  CAMPUS_EQUIPMENT_PLACEMENTS,
  CAMPUS_DISTRICTS,
  CAMPUS_LAYOUT_BLUEPRINTS,
  CAMPUS_SECTOR_HALF_EXTENT,
  CAMPUS_SECTORS,
  CAMPUS_ZONE_BLUEPRINTS,
  PERSON_ANCHORS,
  PERSON_LANE_RECTS,
  PERSON_ROUTE_GOALS,
  PROCESS_WEST_LAYOUT_BLUEPRINTS,
  TANK_EAST_LAYOUT_BLUEPRINTS,
  VEHICLE_ANCHORS,
  VEHICLE_LANE_RECTS,
  VEHICLE_ROUTE_GOALS,
  VEHICLE_ROUTE_LOOPS,
} from './campus-layout'
import { getVehicleFootprintRadius } from './vehicle-footprint'

function districtBounds(district) {
  return {
    minX: district.center.x - district.size.width / 2,
    maxX: district.center.x + district.size.width / 2,
    minZ: district.center.z - district.size.depth / 2,
    maxZ: district.center.z + district.size.depth / 2,
  }
}

function footprintBounds(footprint) {
  return {
    minX: footprint.center.x - footprint.width / 2,
    maxX: footprint.center.x + footprint.width / 2,
    minZ: footprint.center.z - footprint.depth / 2,
    maxZ: footprint.center.z + footprint.depth / 2,
  }
}

function overlaps(a, b) {
  const boundsA = footprintBounds(a)
  const boundsB = footprintBounds(b)

  return !(
    boundsA.maxX <= boundsB.minX ||
    boundsB.maxX <= boundsA.minX ||
    boundsA.maxZ <= boundsB.minZ ||
    boundsB.maxZ <= boundsA.minZ
  )
}

function overlapsLane(footprint, lane) {
  const bounds = footprintBounds(footprint)
  return !(
    bounds.maxX <= lane.minX ||
    lane.maxX <= bounds.minX ||
    bounds.maxZ <= lane.minZ ||
    lane.maxZ <= bounds.minZ
  )
}

function footprintInsideBounds(footprint, bounds) {
  return (
    footprint.minX >= bounds.minX &&
    footprint.maxX <= bounds.maxX &&
    footprint.minZ >= bounds.minZ &&
    footprint.maxZ <= bounds.maxZ
  )
}

function pointInsideLane(point, lane) {
  return (
    point.x >= lane.minX &&
    point.x <= lane.maxX &&
    point.z >= lane.minZ &&
    point.z <= lane.maxZ
  )
}

function pointInsideFootprint(point, footprint, clearance = 0) {
  return (
    point.x >= footprint.center.x - footprint.width / 2 - clearance &&
    point.x <= footprint.center.x + footprint.width / 2 + clearance &&
    point.z >= footprint.center.z - footprint.depth / 2 - clearance &&
    point.z <= footprint.center.z + footprint.depth / 2 + clearance
  )
}

function toSectorLocalPoint(point, sector) {
  return {
    x: point.x - sector.offset.x,
    y: point.y - sector.offset.y,
    z: point.z - sector.offset.z,
  }
}

function resolveSectorForAnchor(anchor) {
  return (
    CAMPUS_SECTORS.find(
      (sector) =>
        Math.abs(anchor.x - sector.offset.x) <= CAMPUS_SECTOR_HALF_EXTENT &&
        Math.abs(anchor.z - sector.offset.z) <= CAMPUS_SECTOR_HALF_EXTENT
    ) ?? CAMPUS_SECTORS[0]
  )
}

function pointInsideCampusBounds(point) {
  return (
    point.x >= CAMPUS_BOUNDS.min.x &&
    point.x <= CAMPUS_BOUNDS.max.x &&
    point.z >= CAMPUS_BOUNDS.min.z &&
    point.z <= CAMPUS_BOUNDS.max.z
  )
}

function laneInsideCampusBounds(lane) {
  return (
    pointInsideCampusBounds({ x: lane.minX, y: 0, z: lane.minZ }) &&
    pointInsideCampusBounds({ x: lane.maxX, y: 0, z: lane.maxZ })
  )
}

function isCampusTransferLane(lane) {
  return lane.maxX - lane.minX > 300 || lane.maxZ - lane.minZ > 300
}

function expandExpectedBoundsForPoint(bounds, point, margin = 0) {
  bounds.min.x = Math.min(bounds.min.x, point.x - margin)
  bounds.min.z = Math.min(bounds.min.z, point.z - margin)
  bounds.max.x = Math.max(bounds.max.x, point.x + margin)
  bounds.max.z = Math.max(bounds.max.z, point.z + margin)
}

function createExpectedCampusBoundsFromAuthoredInputs() {
  const bounds = {
    min: { x: Number.POSITIVE_INFINITY, y: 0, z: Number.POSITIVE_INFINITY },
    max: { x: Number.NEGATIVE_INFINITY, y: 0, z: Number.NEGATIVE_INFINITY },
  }

  for (const sector of CAMPUS_SECTORS) {
    expandExpectedBoundsForPoint(bounds, sector.offset, CAMPUS_SECTOR_HALF_EXTENT)
  }
  for (const lane of [...VEHICLE_LANE_RECTS, ...PERSON_LANE_RECTS]) {
    expandExpectedBoundsForPoint(bounds, { x: lane.minX, y: 0, z: lane.minZ })
    expandExpectedBoundsForPoint(bounds, { x: lane.maxX, y: 0, z: lane.maxZ })
  }
  for (const point of [
    ...VEHICLE_ROUTE_GOALS,
    ...PERSON_ROUTE_GOALS,
    ...VEHICLE_ROUTE_LOOPS.flat(),
    ...PERSON_ANCHORS,
    ...Object.values(VEHICLE_ANCHORS).flat(),
    ...CAMPUS_EQUIPMENT_PLACEMENTS.map((placement) => placement.position),
  ]) {
    expandExpectedBoundsForPoint(bounds, point)
  }

  return bounds
}

describe('chemical plant district blueprints', () => {
  test('campus layout now models a larger multi-sector industrial park', () => {
    expect(CAMPUS_SECTORS.length).toBeGreaterThanOrEqual(24)
    expect(CAMPUS_SECTORS.length * CAMPUS_LAYOUT_BLUEPRINTS.length).toBeGreaterThanOrEqual(960)
    expect(CAMPUS_CAMERA_PRESETS.map((preset) => preset.id)).toEqual(
      expect.arrayContaining(['energy-north', 'rail-logistics', 'southeast-rd'])
    )
    expect(CAMPUS_SECTORS.length * CAMPUS_ZONE_BLUEPRINTS.length).toBeGreaterThanOrEqual(384)
  })

  test('campus bounds enclose every sector and mobility anchor after scale expansion', () => {
    expect(CAMPUS_BOUNDS).toEqual(createExpectedCampusBoundsFromAuthoredInputs())

    for (const sector of CAMPUS_SECTORS) {
      expect(
        pointInsideCampusBounds({
          x: sector.offset.x - CAMPUS_SECTOR_HALF_EXTENT,
          y: 0,
          z: sector.offset.z - CAMPUS_SECTOR_HALF_EXTENT,
        })
      ).toBe(true)
      expect(
        pointInsideCampusBounds({
          x: sector.offset.x + CAMPUS_SECTOR_HALF_EXTENT,
          y: 0,
          z: sector.offset.z + CAMPUS_SECTOR_HALF_EXTENT,
        })
      ).toBe(true)
    }

    for (const lane of [...VEHICLE_LANE_RECTS, ...PERSON_LANE_RECTS]) {
      expect(laneInsideCampusBounds(lane)).toBe(true)
    }

    const anchors = [
      ...PERSON_ANCHORS,
      ...Object.values(VEHICLE_ANCHORS).flat(),
      ...CAMPUS_EQUIPMENT_PLACEMENTS.map((placement) => placement.position),
    ]
    for (const anchor of anchors) {
      expect(pointInsideCampusBounds(anchor)).toBe(true)
    }

    for (const goal of [...VEHICLE_ROUTE_GOALS, ...PERSON_ROUTE_GOALS]) {
      expect(pointInsideCampusBounds(goal)).toBe(true)
    }

    for (const waypoint of VEHICLE_ROUTE_LOOPS.flat()) {
      expect(pointInsideCampusBounds(waypoint)).toBe(true)
    }
  })

  test('campus feature taxonomy includes logistics, emergency, utility and perimeter systems', () => {
    const kinds = new Set(CAMPUS_LAYOUT_BLUEPRINTS.map((item) => item.kind))

    expect(CAMPUS_LAYOUT_BLUEPRINTS.length).toBeGreaterThanOrEqual(40)
    expect([...kinds]).toEqual(
      expect.arrayContaining([
        'logistics-warehouse',
        'loading-rack',
        'admin-building',
        'emergency-station',
        'flare-stack',
        'rail-spur',
        'solar-canopy',
        'substation-yard',
        'perimeter-fence',
        'security-device',
        'smart-sensor',
        'smart-control',
        'assembly-hall',
        'conveyor-line',
        'robot-cell',
        'silo-yard',
      ])
    )
  })

  test('west process district defines at least three major process modules within bounds', () => {
    const district = CAMPUS_DISTRICTS.find((item) => item.id === 'process-west')
    if (!district) throw new Error('process-west district missing')

    const bounds = districtBounds(district)
    const majorModules = PROCESS_WEST_LAYOUT_BLUEPRINTS.filter((item) => item.major)

    expect(majorModules.length).toBeGreaterThanOrEqual(3)

    for (const module of majorModules) {
      const footprint = footprintBounds(module)
      expect(footprint.minX).toBeGreaterThanOrEqual(bounds.minX)
      expect(footprint.maxX).toBeLessThanOrEqual(bounds.maxX)
      expect(footprint.minZ).toBeGreaterThanOrEqual(bounds.minZ)
      expect(footprint.maxZ).toBeLessThanOrEqual(bounds.maxZ)
    }
  })

  test('east tank district defines both spherical and vertical storage groups within bounds', () => {
    const district = CAMPUS_DISTRICTS.find((item) => item.id === 'tank-east')
    if (!district) throw new Error('tank-east district missing')

    const bounds = districtBounds(district)
    const sphereGroups = TANK_EAST_LAYOUT_BLUEPRINTS.filter((item) => item.kind === 'sphere-tank')
    const verticalGroups = TANK_EAST_LAYOUT_BLUEPRINTS.filter((item) => item.kind === 'vertical-tank')

    expect(sphereGroups.length).toBeGreaterThanOrEqual(4)
    expect(verticalGroups.length).toBeGreaterThanOrEqual(2)

    for (const module of [...sphereGroups, ...verticalGroups]) {
      const footprint = footprintBounds(module)
      expect(footprint.minX).toBeGreaterThanOrEqual(bounds.minX)
      expect(footprint.maxX).toBeLessThanOrEqual(bounds.maxX)
      expect(footprint.minZ).toBeGreaterThanOrEqual(bounds.minZ)
      expect(footprint.maxZ).toBeLessThanOrEqual(bounds.maxZ)
    }
  })

  test('major west and east facility footprints do not overlap', () => {
    const modules = [
      ...PROCESS_WEST_LAYOUT_BLUEPRINTS.filter((item) => item.major),
      ...TANK_EAST_LAYOUT_BLUEPRINTS.filter((item) => item.major),
    ]

    for (let i = 0; i < modules.length; i += 1) {
      for (let j = i + 1; j < modules.length; j += 1) {
        expect(overlaps(modules[i], modules[j])).toBe(false)
      }
    }
  })

  test('blocking process and storage footprints stay clear of vehicle lanes', () => {
    const modules = [
      ...PROCESS_WEST_LAYOUT_BLUEPRINTS.filter((item) => item.blocksVehicle),
      ...TANK_EAST_LAYOUT_BLUEPRINTS.filter((item) => item.blocksVehicle),
    ]

    for (const module of modules) {
      for (const lane of VEHICLE_LANE_RECTS) {
        expect(overlapsLane(module, lane)).toBe(false)
      }
    }
  })

  test('east storage footprints stay outside the flare safety zone', () => {
    const flareZone = CAMPUS_ZONE_BLUEPRINTS.find((zone) => zone.name === '火炬安全隔离带')
    if (!flareZone) throw new Error('flare safety zone missing')

    const flareFootprint = {
      center: flareZone.center,
      width: flareZone.size.width,
      depth: flareZone.size.depth,
    }

    const storageModules = TANK_EAST_LAYOUT_BLUEPRINTS.filter(
      (item) => item.kind === 'sphere-tank' || item.kind === 'vertical-tank'
    )

    for (const module of storageModules) {
      expect(overlaps(module, flareFootprint)).toBe(false)
    }
  })

  test('loading arm anchors stay clear of district vehicle lanes', () => {
    const loadingArms = CAMPUS_EQUIPMENT_PLACEMENTS.filter((item) => item.name.includes('装车鹤管'))
    const districtVehicleLanes = VEHICLE_LANE_RECTS.filter((lane) => !isCampusTransferLane(lane))

    expect(loadingArms.length).toBeGreaterThanOrEqual(5)

    for (const loadingArm of loadingArms) {
      for (const lane of districtVehicleLanes) {
        expect(pointInsideLane(loadingArm.position, lane)).toBe(false)
      }
    }
  })

  test('authored person anchors stay outside blocking pedestrian footprints in every sector', () => {
    const blockers = CAMPUS_LAYOUT_BLUEPRINTS.filter((blueprint) => blueprint.blocksPerson)

    for (const anchor of PERSON_ANCHORS) {
      const localAnchor = toSectorLocalPoint(anchor, resolveSectorForAnchor(anchor))

      for (const blocker of blockers) {
        expect(pointInsideFootprint(localAnchor, blocker)).toBe(false)
      }
    }
  })

  test('authored vehicle anchors stay outside blocking vehicle footprints', () => {
    const blockers = CAMPUS_LAYOUT_BLUEPRINTS.filter((blueprint) => blueprint.blocksVehicle)

    for (const [vehicleType, anchors] of Object.entries(VEHICLE_ANCHORS)) {
      for (const anchor of anchors) {
        const localAnchor = toSectorLocalPoint(anchor, resolveSectorForAnchor(anchor))
        const radius = getVehicleFootprintRadius(vehicleType)

        for (const blocker of blockers) {
          expect(pointInsideFootprint(localAnchor, blocker, radius)).toBe(false)
        }
      }
    }
  })

  test('every layout blueprint stays inside its declared district envelope', () => {
    const districtById = new Map(CAMPUS_DISTRICTS.map((district) => [district.id, district]))

    for (const blueprint of CAMPUS_LAYOUT_BLUEPRINTS) {
      const district = districtById.get(blueprint.districtId)
      if (!district) throw new Error(`${blueprint.id} district ${blueprint.districtId} missing`)

      expect(footprintInsideBounds(footprintBounds(blueprint), districtBounds(district))).toBe(true)
    }
  })
})
