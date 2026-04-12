import { Box3, Group, Mesh, Vector3 as ThreeVector3 } from 'three'

export const TRUCK_MODEL_URL = '/assets/3d/construction-vehicle-5.glb'

// The source GLB is already upright in Three.js coordinates (Y-up, Z-forward).
// A ~1.91 uniform scale yields an in-scene size of roughly
// 2.37w x 2.68h x 6.88d, which closely matches the existing truck proxy.
export const TRUCK_MODEL_SCALE = 1.91
export const TRUCK_MODEL_ROTATION_X = 0
export const TRUCK_MODEL_ROTATION_Y = 0

function collectSliceHeights(root: Group, box: Box3, direction: 'positive-z' | 'negative-z') {
  const sliceDepth = Math.max((box.max.z - box.min.z) * 0.2, 0.12)
  const boundary =
    direction === 'positive-z'
      ? box.max.z - sliceDepth
      : box.min.z + sliceDepth
  const vertex = new ThreeVector3()
  const heights: number[] = []

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const position = object.geometry.getAttribute('position')
    if (!position) return

    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld)
      if (direction === 'positive-z') {
        if (vertex.z >= boundary) heights.push(vertex.y)
      } else if (vertex.z <= boundary) {
        heights.push(vertex.y)
      }
    }
  })

  return heights
}

function getSliceRoofScore(heights: number[]) {
  if (heights.length === 0) return Number.NEGATIVE_INFINITY
  const sorted = [...heights].sort((left, right) => left - right)
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length
  return p90 + mean * 0.1
}

export function normalizeTruckScene(root: Group) {
  const clone = root.clone(true)
  clone.rotation.set(TRUCK_MODEL_ROTATION_X, TRUCK_MODEL_ROTATION_Y, 0)
  clone.scale.setScalar(TRUCK_MODEL_SCALE)
  clone.updateMatrixWorld(true)

  const box = new Box3().setFromObject(clone)
  const centerX = (box.min.x + box.max.x) / 2
  const centerZ = (box.min.z + box.max.z) / 2
  const bottomY = box.min.y

  clone.position.set(-centerX, -bottomY, -centerZ)
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return
    object.castShadow = true
    object.receiveShadow = true
  })
  clone.updateMatrixWorld(true)

  return clone
}

export function inferTruckFrontAxis(root: Group): 'positive-z' | 'negative-z' {
  const box = new Box3().setFromObject(root)
  const positiveScore = getSliceRoofScore(collectSliceHeights(root, box, 'positive-z'))
  const negativeScore = getSliceRoofScore(collectSliceHeights(root, box, 'negative-z'))
  return positiveScore >= negativeScore ? 'positive-z' : 'negative-z'
}
