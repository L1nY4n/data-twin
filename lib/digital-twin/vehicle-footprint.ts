import type { VehicleEntity } from './types'

export interface VehicleDimensions {
  width: number
  height: number
  depth: number
}

type VehicleType = VehicleEntity['vehicleType']

export const VEHICLE_DETAIL_DIMENSIONS: Record<VehicleType, VehicleDimensions> = {
  car: { width: 1.8, height: 1.2, depth: 4 },
  truck: { width: 2.4, height: 2.5, depth: 8 },
  forklift: { width: 1.3, height: 2, depth: 3.5 },
  agv: { width: 1, height: 0.45, depth: 1.5 },
  other: { width: 1.5, height: 1, depth: 3 },
}

export const VEHICLE_PROXY_DIMENSIONS: Record<VehicleType, VehicleDimensions> = {
  car: { width: 1.8, height: 1, depth: 3.8 },
  truck: { width: 2.3, height: 1.9, depth: 6.9 },
  forklift: { width: 1.3, height: 1.7, depth: 2.5 },
  agv: { width: 1, height: 0.45, depth: 1.5 },
  other: { width: 1.5, height: 0.9, depth: 2.8 },
}

export const PERSON_FOOTPRINT_RADIUS = 0.45
export const VEHICLE_FOOTPRINT_CLEARANCE = 0.35

const VEHICLE_FOOTPRINT_DIMENSIONS: Record<VehicleType, VehicleDimensions> = {
  car: combineDimensions(VEHICLE_DETAIL_DIMENSIONS.car, VEHICLE_PROXY_DIMENSIONS.car),
  truck: combineDimensions(VEHICLE_DETAIL_DIMENSIONS.truck, VEHICLE_PROXY_DIMENSIONS.truck),
  forklift: combineDimensions(VEHICLE_DETAIL_DIMENSIONS.forklift, VEHICLE_PROXY_DIMENSIONS.forklift),
  agv: combineDimensions(VEHICLE_DETAIL_DIMENSIONS.agv, VEHICLE_PROXY_DIMENSIONS.agv),
  other: combineDimensions(VEHICLE_DETAIL_DIMENSIONS.other, VEHICLE_PROXY_DIMENSIONS.other),
}

export const MAX_VEHICLE_FOOTPRINT_RADIUS = Math.max(
  ...Object.values(VEHICLE_FOOTPRINT_DIMENSIONS).map((dimensions) =>
    getVehicleFootprintRadiusFromDimensions(dimensions)
  )
)

export const MAX_DYNAMIC_FOOTPRINT_SEPARATION =
  MAX_VEHICLE_FOOTPRINT_RADIUS * 2 + VEHICLE_FOOTPRINT_CLEARANCE

function combineDimensions(primary: VehicleDimensions, secondary: VehicleDimensions): VehicleDimensions {
  return {
    width: Math.max(primary.width, secondary.width),
    height: Math.max(primary.height, secondary.height),
    depth: Math.max(primary.depth, secondary.depth),
  }
}

function getVehicleFootprintRadiusFromDimensions(dimensions: VehicleDimensions) {
  return Math.hypot(dimensions.width, dimensions.depth) / 2
}

export function getVehicleFootprintDimensions(
  vehicleType: VehicleType | undefined
): VehicleDimensions {
  return VEHICLE_FOOTPRINT_DIMENSIONS[vehicleType ?? 'other']
}

export function getVehicleFootprintRadius(vehicleType: VehicleType | undefined): number {
  return getVehicleFootprintRadiusFromDimensions(getVehicleFootprintDimensions(vehicleType))
}

export function getVehicleSeparationDistance(
  vehicleType: VehicleType | undefined,
  neighborVehicleType: VehicleType | undefined,
  clearance = VEHICLE_FOOTPRINT_CLEARANCE
): number {
  return (
    getVehicleFootprintRadius(vehicleType) +
    getVehicleFootprintRadius(neighborVehicleType) +
    clearance
  )
}
