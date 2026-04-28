import type { InstancedMesh } from 'three'

export function writeYawScaleMatrix(
  target: ArrayLike<number> & { [index: number]: number },
  index: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number
) {
  const offset = index * 16
  const cosYaw = Math.cos(yaw)
  const sinYaw = Math.sin(yaw)

  target[offset] = cosYaw * scaleX
  target[offset + 1] = 0
  target[offset + 2] = -sinYaw * scaleX
  target[offset + 3] = 0

  target[offset + 4] = 0
  target[offset + 5] = scaleY
  target[offset + 6] = 0
  target[offset + 7] = 0

  target[offset + 8] = sinYaw * scaleZ
  target[offset + 9] = 0
  target[offset + 10] = cosYaw * scaleZ
  target[offset + 11] = 0

  target[offset + 12] = x
  target[offset + 13] = y
  target[offset + 14] = z
  target[offset + 15] = 1
}

export function writeYawRollScaleMatrix(
  target: ArrayLike<number> & { [index: number]: number },
  index: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  roll: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number
) {
  const offset = index * 16
  const cosYaw = Math.cos(yaw)
  const sinYaw = Math.sin(yaw)
  const cosRoll = Math.cos(roll)
  const sinRoll = Math.sin(roll)

  target[offset] = cosYaw * cosRoll * scaleX
  target[offset + 1] = sinRoll * scaleX
  target[offset + 2] = -sinYaw * cosRoll * scaleX
  target[offset + 3] = 0

  target[offset + 4] = -cosYaw * sinRoll * scaleY
  target[offset + 5] = cosRoll * scaleY
  target[offset + 6] = sinYaw * sinRoll * scaleY
  target[offset + 7] = 0

  target[offset + 8] = sinYaw * scaleZ
  target[offset + 9] = 0
  target[offset + 10] = cosYaw * scaleZ
  target[offset + 11] = 0

  target[offset + 12] = x
  target[offset + 13] = y
  target[offset + 14] = z
  target[offset + 15] = 1
}

export function writeGroundRingMatrix(
  target: ArrayLike<number> & { [index: number]: number },
  index: number,
  x: number,
  y: number,
  z: number,
  scaleX: number,
  scaleZ: number
) {
  const offset = index * 16

  target[offset] = scaleX
  target[offset + 1] = 0
  target[offset + 2] = 0
  target[offset + 3] = 0

  target[offset + 4] = 0
  target[offset + 5] = 0
  target[offset + 6] = -scaleZ
  target[offset + 7] = 0

  target[offset + 8] = 0
  target[offset + 9] = 1
  target[offset + 10] = 0
  target[offset + 11] = 0

  target[offset + 12] = x
  target[offset + 13] = y
  target[offset + 14] = z
  target[offset + 15] = 1
}

export function writeTranslationScaleMatrix(
  target: ArrayLike<number> & { [index: number]: number },
  index: number,
  x: number,
  y: number,
  z: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number
) {
  const offset = index * 16

  target[offset] = scaleX
  target[offset + 1] = 0
  target[offset + 2] = 0
  target[offset + 3] = 0

  target[offset + 4] = 0
  target[offset + 5] = scaleY
  target[offset + 6] = 0
  target[offset + 7] = 0

  target[offset + 8] = 0
  target[offset + 9] = 0
  target[offset + 10] = scaleZ
  target[offset + 11] = 0

  target[offset + 12] = x
  target[offset + 13] = y
  target[offset + 14] = z
  target[offset + 15] = 1
}

export function markInstancedMatrixRange(
  mesh: InstancedMesh,
  firstIndex: number,
  lastIndex: number
) {
  if (firstIndex > lastIndex) return

  const attribute = mesh.instanceMatrix
  const start = Math.max(0, firstIndex) * 16
  const count = (lastIndex - Math.max(0, firstIndex) + 1) * 16
  attribute.clearUpdateRanges()
  attribute.addUpdateRange(start, count)
  attribute.needsUpdate = true
}
