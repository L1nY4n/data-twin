import type { Vector3, VehicleEntity } from './types'
import {
  advanceVehicleRouteContract,
  normalizeVehicleRouteLike,
  normalizeVehicleTrackLike,
  resolveVehicleRoutePose,
} from './vehicle-route-motion'

export interface VehicleSnapshotSample {
  timestamp: number
  sourceTimestamp?: number
  receivedAt?: number
  position: Vector3
  yaw: number
  speed: number
  routeTrack?: VehicleEntity['routeTrack']
  trackPosition?: VehicleEntity['trackPosition']
  status: VehicleEntity['status']
}

export interface VehicleInterpolatedPose {
  x: number
  y: number
  z: number
  yaw: number
  status: VehicleEntity['status']
}

function normalizeRadians(value: number): number {
  let angle = value
  const twoPi = Math.PI * 2
  while (angle <= -Math.PI) angle += twoPi
  while (angle > Math.PI) angle -= twoPi
  return angle
}

function lerpAngle(current: number, target: number, alpha: number): number {
  return current + normalizeRadians(target - current) * alpha
}

function resolveSamplePose(sample: VehicleSnapshotSample): VehicleInterpolatedPose {
  if (sample.routeTrack && sample.trackPosition) {
    const pose = resolveVehicleRoutePose(
      normalizeVehicleTrackLike(sample.routeTrack),
      normalizeVehicleRouteLike(sample.trackPosition)
    )
    return {
      x: pose.position.x,
      y: pose.position.y,
      z: pose.position.z,
      yaw: pose.yaw,
      status: sample.status,
    }
  }

  return {
    x: sample.position.x,
    y: sample.position.y,
    z: sample.position.z,
    yaw: sample.yaw,
    status: sample.status,
  }
}

function interpolatePose(
  left: VehicleInterpolatedPose,
  right: VehicleInterpolatedPose,
  alpha: number
): VehicleInterpolatedPose {
  return {
    x: left.x + (right.x - left.x) * alpha,
    y: left.y + (right.y - left.y) * alpha,
    z: left.z + (right.z - left.z) * alpha,
    yaw: lerpAngle(left.yaw, right.yaw, alpha),
    status: alpha < 0.5 ? left.status : right.status,
  }
}

export function appendVehicleSnapshot(
  samples: readonly VehicleSnapshotSample[],
  sample: VehicleSnapshotSample,
  maxSamples = 8
): VehicleSnapshotSample[] {
  const duplicate = samples.find((existing) => {
    if (
      sample.sourceTimestamp !== undefined &&
      existing.sourceTimestamp !== undefined &&
      existing.sourceTimestamp === sample.sourceTimestamp
    ) {
      return true
    }

    return (
      existing.timestamp === sample.timestamp &&
      existing.position.x === sample.position.x &&
      existing.position.y === sample.position.y &&
      existing.position.z === sample.position.z &&
      existing.yaw === sample.yaw
    )
  })
  if (duplicate) {
    return [...samples]
  }

  const next = [...samples]
  const insertIndex = next.findIndex((existing) => existing.timestamp > sample.timestamp)
  if (insertIndex === -1) {
    next.push(sample)
  } else {
    next.splice(insertIndex, 0, sample)
  }
  return next.slice(-maxSamples)
}

export function resolveVehiclePoseFromSnapshots(
  samples: readonly VehicleSnapshotSample[],
  nowMs: number,
  interpolationDelayMs: number,
  maxExtrapolationMs: number
): VehicleInterpolatedPose | null {
  if (samples.length === 0) return null

  const renderTime = nowMs - interpolationDelayMs
  const first = samples[0]
  if (renderTime <= first.timestamp) {
    return resolveSamplePose(first)
  }

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const next = samples[index]
    if (renderTime <= next.timestamp) {
      const span = Math.max(1, next.timestamp - previous.timestamp)
      const alpha = Math.min(Math.max((renderTime - previous.timestamp) / span, 0), 1)
      return interpolatePose(resolveSamplePose(previous), resolveSamplePose(next), alpha)
    }
  }

  const latest = samples[samples.length - 1]
  const extrapolationMs = Math.min(renderTime - latest.timestamp, maxExtrapolationMs)
  if (latest.routeTrack && latest.trackPosition && latest.speed > 0 && extrapolationMs > 0) {
    const normalizedTrack = normalizeVehicleTrackLike(latest.routeTrack)
    const normalizedRoute = normalizeVehicleRouteLike(latest.trackPosition)
    const advancedRoute = advanceVehicleRouteContract(
      normalizedTrack,
      normalizedRoute,
      latest.speed,
      extrapolationMs / 1000
    )
    const pose = resolveVehicleRoutePose(normalizedTrack, advancedRoute)
    return {
      x: pose.position.x,
      y: pose.position.y,
      z: pose.position.z,
      yaw: pose.yaw,
      status: latest.status,
    }
  }

  return resolveSamplePose(latest)
}
