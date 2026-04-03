import { Matrix4, Quaternion, Sphere, Vector3, type Frustum } from 'three'
import type { RuntimeStaticChunkRegistration } from './chunk-registry'

const DEFAULT_PROJECTION_MATRIX_EPSILON = 0.000001

function matrixElementsDiffer(
  previous: Matrix4,
  next: Matrix4,
  epsilon = DEFAULT_PROJECTION_MATRIX_EPSILON
) {
  for (let index = 0; index < previous.elements.length; index += 1) {
    if (Math.abs(previous.elements[index] - next.elements[index]) > epsilon) {
      return true
    }
  }

  return false
}

export function hasRuntimeStaticViewChanged(
  previousPosition: Vector3,
  previousQuaternion: Quaternion,
  previousProjectionMatrix: Matrix4,
  nextPosition: Vector3,
  nextQuaternion: Quaternion,
  nextProjectionMatrix: Matrix4,
  positionEpsilon: number,
  rotationEpsilon: number
) {
  const positionDelta = previousPosition.distanceToSquared(nextPosition)
  const rotationDelta = 1 - Math.abs(previousQuaternion.dot(nextQuaternion))
  const projectionChanged = matrixElementsDiffer(previousProjectionMatrix, nextProjectionMatrix)

  return (
    positionDelta >= positionEpsilon ||
    rotationDelta >= rotationEpsilon ||
    projectionChanged
  )
}

export function isRuntimeStaticChunkVisible(
  entry: RuntimeStaticChunkRegistration,
  frustum: Frustum,
  scratchSphere: Sphere = new Sphere()
) {
  scratchSphere.center.set(
    entry.boundsSphere.center.x,
    entry.boundsSphere.center.y,
    entry.boundsSphere.center.z
  )
  scratchSphere.radius = entry.boundsSphere.radius

  return frustum.intersectsSphere(scratchSphere)
}
