import * as THREE from 'three'
import type { Vector3 } from '@/lib/digital-twin/types'

export interface InstancedBoundsOptions {
  paddingXz: number
  paddingTop: number
  paddingBottom: number
}

export interface InstancedInteractionBounds {
  box: THREE.Box3
  sphere: THREE.Sphere
}

export function createInstancedInteractionBounds(
  points: Vector3[],
  options: InstancedBoundsOptions
): InstancedInteractionBounds {
  if (points.length === 0) {
    return {
      box: new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)),
      sphere: new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1),
    }
  }

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
    if (point.z < minZ) minZ = point.z
    if (point.z > maxZ) maxZ = point.z
  }

  const box = new THREE.Box3(
    new THREE.Vector3(
      minX - options.paddingXz,
      minY - options.paddingBottom,
      minZ - options.paddingXz
    ),
    new THREE.Vector3(
      maxX + options.paddingXz,
      maxY + options.paddingTop,
      maxZ + options.paddingXz
    )
  )
  const center = box.getCenter(new THREE.Vector3())
  const sphere = new THREE.Sphere(center, center.distanceTo(box.max))

  return { box, sphere }
}
