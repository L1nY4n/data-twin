import type { Vector3 } from './types'

export interface RuntimeSimulationCadenceInput {
  entityPosition: Vector3
  cameraPosition: Vector3
  cameraTarget?: Vector3 | null
  isInteractionCritical?: boolean
}

const NEAR_DISTANCE_SQUARED = 70 ** 2
const MID_DISTANCE_SQUARED = 150 ** 2
const FAR_DISTANCE_SQUARED = 260 ** 2
const EXTREME_DISTANCE_SQUARED = 420 ** 2
const OFFSCREEN_DOT_THRESHOLD = 0.18

function distanceSquared(a: Vector3, b: Vector3) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return dx * dx + dy * dy + dz * dz
}

function isLikelyInView(
  entityPosition: Vector3,
  cameraPosition: Vector3,
  cameraTarget?: Vector3 | null
) {
  if (!cameraTarget) return true

  const forwardX = cameraTarget.x - cameraPosition.x
  const forwardY = cameraTarget.y - cameraPosition.y
  const forwardZ = cameraTarget.z - cameraPosition.z
  const forwardLength = Math.hypot(forwardX, forwardY, forwardZ)
  if (forwardLength <= 1e-6) return true

  const toEntityX = entityPosition.x - cameraPosition.x
  const toEntityY = entityPosition.y - cameraPosition.y
  const toEntityZ = entityPosition.z - cameraPosition.z
  const toEntityLength = Math.hypot(toEntityX, toEntityY, toEntityZ)
  if (toEntityLength <= 1e-6) return true

  const normalizedDot =
    (forwardX * toEntityX + forwardY * toEntityY + forwardZ * toEntityZ) /
    (forwardLength * toEntityLength)

  return normalizedDot >= OFFSCREEN_DOT_THRESHOLD
}

export function resolveEntitySimulationCadence(
  input: RuntimeSimulationCadenceInput
): number {
  if (input.isInteractionCritical) return 1

  const distanceSq = distanceSquared(input.entityPosition, input.cameraPosition)
  if (distanceSq <= NEAR_DISTANCE_SQUARED) return 1

  const likelyInView = isLikelyInView(
    input.entityPosition,
    input.cameraPosition,
    input.cameraTarget
  )

  if (distanceSq >= EXTREME_DISTANCE_SQUARED) {
    return likelyInView ? 6 : 12
  }

  if (distanceSq >= FAR_DISTANCE_SQUARED) {
    return likelyInView ? 4 : 8
  }

  if (distanceSq >= MID_DISTANCE_SQUARED) {
    return likelyInView ? 2 : 6
  }

  return likelyInView ? 1 : 3
}

export function shouldSimulateEntityThisTick(
  tickCount: number,
  cadence: number
) {
  return cadence <= 1 || tickCount % cadence === 0
}
