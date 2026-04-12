import type {
  Vector3,
  VehicleRouteContract,
  VehicleRouteDirection,
  VehicleRouteLike,
  VehicleTrackContract,
  VehicleTrackLike,
} from './types'

export interface VehicleRoutePose {
  position: Vector3
  yaw: number
}

function normalizeSegmentIndex(index: number, length: number) {
  if (length <= 0) return 0
  return ((index % length) + length) % length
}

function nextSegmentIndex(
  current: number,
  length: number,
  direction: VehicleRouteDirection,
  loop: boolean
) {
  if (direction === 'reverse') {
    if (current <= 0) return loop ? length - 1 : 0
    return current - 1
  }

  if (current >= length - 1) return loop ? 0 : length - 1
  return current + 1
}

function segmentEndpoints(
  track: VehicleTrackContract,
  route: VehicleRouteContract
) {
  const startIndex = normalizeSegmentIndex(route.segmentIndex, track.points.length)
  const direction = route.direction ?? 'forward'
  const endIndex = nextSegmentIndex(startIndex, track.points.length, direction, track.loop)
  return {
    startIndex,
    endIndex,
    start: track.points[startIndex],
    end: track.points[endIndex],
    direction,
  }
}

function segmentLength(start: Vector3, end: Vector3) {
  return Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z)
}

function interpolate(start: Vector3, end: Vector3, progress: number): Vector3 {
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
    z: start.z + (end.z - start.z) * progress,
  }
}

export function normalizeVehicleTrackLike(
  track: VehicleTrackLike
): VehicleTrackContract {
  if ('points' in track) {
    return {
      id: track.id,
      loop: track.loop,
      points: track.points.map((point) => ({ ...point })),
    }
  }

  return {
    id: track.trackId,
    loop: track.looped,
    points: track.waypoints.map((point) => ({ ...point })),
  }
}

export function normalizeVehicleRouteLike(
  route: VehicleRouteLike
): VehicleRouteContract {
  if ('target' in route || 'direction' in route) {
    return {
      trackId: route.trackId,
      segmentIndex: route.segmentIndex,
      segmentProgress: route.segmentProgress,
      ...(route.target ? { target: { ...route.target } } : {}),
      ...(route.direction ? { direction: route.direction } : {}),
    }
  }

  return {
    trackId: route.trackId,
    segmentIndex: route.segmentIndex,
    segmentProgress: route.segmentProgress,
  }
}

export function resolveVehicleRoutePose(
  track: VehicleTrackContract,
  route: VehicleRouteContract
): VehicleRoutePose {
  const { start, end } = segmentEndpoints(track, route)
  const progress = Math.min(Math.max(route.segmentProgress, 0), 1)
  const position = interpolate(start, end, progress)
  const yaw = Math.atan2(end.x - start.x, end.z - start.z)

  return { position, yaw }
}

export function advanceVehicleRouteContract(
  track: VehicleTrackContract,
  route: VehicleRouteContract,
  speed: number,
  deltaSeconds: number
): VehicleRouteContract {
  if (track.points.length < 2 || speed <= 0 || deltaSeconds <= 0) return route

  const direction = route.direction ?? 'forward'
  let segmentIndex = normalizeSegmentIndex(route.segmentIndex, track.points.length)
  let progress = Math.min(Math.max(route.segmentProgress, 0), 1)
  let remainingDistance = speed * deltaSeconds

  while (remainingDistance > 0) {
    const endIndex = nextSegmentIndex(segmentIndex, track.points.length, direction, track.loop)
    const start = track.points[segmentIndex]
    const end = track.points[endIndex]
    const length = segmentLength(start, end)

    if (length <= 0.0001) {
      if (!track.loop && endIndex === segmentIndex) break
      segmentIndex = endIndex
      progress = 0
      continue
    }

    const remainingOnSegment = (1 - progress) * length
    if (remainingDistance < remainingOnSegment) {
      progress += remainingDistance / length
      progress = Math.round(progress * 1_000_000) / 1_000_000
      remainingDistance = 0
      break
    }

    remainingDistance -= remainingOnSegment

    if (!track.loop && endIndex === segmentIndex) {
      progress = 1
      break
    }

    segmentIndex = endIndex
    progress = 0
  }

  const { end } = segmentEndpoints(track, {
    ...route,
    segmentIndex,
    segmentProgress: progress,
    direction,
  })

  return {
    trackId: route.trackId,
    segmentIndex,
    segmentProgress: progress,
    target: { ...end },
    ...(direction ? { direction } : {}),
  }
}
