import type { Vector3 } from '@/lib/digital-twin/types'

export function resolveRenderablePosition(
  position: Vector3,
  options: { fullTransform?: boolean; clampYToGround?: boolean } = {}
): [number, number, number] {
  if (options.fullTransform) {
    return [position.x, position.y, position.z]
  }

  return [position.x, options.clampYToGround ? 0 : position.y, position.z]
}

export function resolveRenderableRotation(
  rotation: Vector3,
  options: { fullTransform?: boolean } = {}
): [number, number, number] {
  if (options.fullTransform) {
    return [rotation.x, rotation.y, rotation.z]
  }

  return [0, rotation.y, 0]
}
