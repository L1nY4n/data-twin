import { describe, expect, test } from 'bun:test'
import {
  CAMPUS_EQUIPMENT_PLACEMENTS,
  CAMPUS_DISTRICTS,
  CAMPUS_ZONE_BLUEPRINTS,
  PROCESS_WEST_LAYOUT_BLUEPRINTS,
  TANK_EAST_LAYOUT_BLUEPRINTS,
  VEHICLE_LANE_RECTS,
} from './campus-layout'

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

function pointInsideLane(point, lane) {
  return (
    point.x >= lane.minX &&
    point.x <= lane.maxX &&
    point.z >= lane.minZ &&
    point.z <= lane.maxZ
  )
}

function isCampusTransferLane(lane) {
  return lane.maxX - lane.minX > 300 || lane.maxZ - lane.minZ > 300
}

describe('chemical plant district blueprints', () => {
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
})
