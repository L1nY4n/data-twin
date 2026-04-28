'use client'

import type { EcsEntitySnapshot } from '@/lib/digital-twin/ecs'
import type { VehicleEntity } from '@/lib/digital-twin/types'
import {
  normalizeVehicleRouteLike,
  normalizeVehicleTrackLike,
  resolveVehicleRoutePose,
} from '@/lib/digital-twin/vehicle-route-motion'

export interface VehicleRuntimeState {
  x: number
  y: number
  z: number
  yaw: number
  status: VehicleEntity['status']
}

type VehiclePoseLike = Pick<VehicleEntity, 'position' | 'rotation' | 'routeTrack' | 'trackPosition'>

function resolveVehiclePoseFromEntity(entity: VehiclePoseLike) {
  if (entity.routeTrack && entity.trackPosition) {
    const pose = resolveVehicleRoutePose(
      normalizeVehicleTrackLike(entity.routeTrack),
      normalizeVehicleRouteLike(entity.trackPosition)
    )
    return {
      x: pose.position.x,
      y: pose.position.y,
      z: pose.position.z,
      yaw: pose.yaw,
    }
  }

  return {
    x: entity.position.x,
    y: entity.position.y,
    z: entity.position.z,
    yaw: entity.rotation.y,
  }
}

export function resolveVehicleRuntimeFallbackState(
  entity: VehicleEntity,
  snapshot?: EcsEntitySnapshot
): VehicleRuntimeState {
  if (snapshot?.type === 'vehicle') {
    const pose = resolveVehiclePoseFromEntity(snapshot as VehicleEntity)
    return {
      ...pose,
      status: snapshot.status as VehicleEntity['status'],
    }
  }

  if (snapshot) {
    return {
      x: snapshot.position.x,
      y: snapshot.position.y,
      z: snapshot.position.z,
      yaw: snapshot.rotation.y,
      status: snapshot.status as VehicleEntity['status'],
    }
  }

  return {
    ...resolveVehiclePoseFromEntity(entity),
    status: entity.status,
  }
}

export function reseedVehicleRuntimeState(
  state: VehicleRuntimeState,
  entity: VehicleEntity,
  snapshot?: EcsEntitySnapshot
) {
  const fallback = resolveVehicleRuntimeFallbackState(entity, snapshot)
  const changed =
    state.x !== fallback.x ||
    state.y !== fallback.y ||
    state.z !== fallback.z ||
    state.yaw !== fallback.yaw ||
    state.status !== fallback.status

  state.x = fallback.x
  state.y = fallback.y
  state.z = fallback.z
  state.yaw = fallback.yaw
  state.status = fallback.status

  return changed
}
