import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Matrix4,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const VEHICLE_PROXY_MATRIX_STREAMS_PER_INSTANCE = 1
export const LEGACY_VEHICLE_BASE_MATRIX_STREAMS_PER_INSTANCE = 7

const BODY_COLOR = new Color(1, 1, 1)
const CABIN_COLOR = new Color(1.12, 1.12, 1.12)
const UNDERCARRIAGE_COLOR = new Color(0.1, 0.11, 0.13)
const SIDE_DETAIL_COLOR = new Color(0.16, 0.17, 0.2)

function applyVertexColor(geometry: BufferGeometry, color: Color) {
  const position = geometry.getAttribute('position')
  const colors = new Float32Array(position.count * 3)
  for (let index = 0; index < position.count; index += 1) {
    const offset = index * 3
    colors[offset] = color.r
    colors[offset + 1] = color.g
    colors[offset + 2] = color.b
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geometry
}

function createBoxPart(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  color: Color
) {
  const geometry = new BoxGeometry(width, height, depth)
  geometry.applyMatrix4(new Matrix4().makeTranslation(x, y, z))
  return applyVertexColor(geometry, color)
}

export function createVehicleProxyShellGeometry() {
  const parts = [
    createBoxPart(1, 1, 1, 0, 0.5, 0, BODY_COLOR),
    createBoxPart(0.58, 0.5, 0.45, 0, 0.92, -0.12, CABIN_COLOR),
    createBoxPart(0.96, 0.12, 0.9, 0, 0.16, 0, UNDERCARRIAGE_COLOR),
    createBoxPart(0.08, 0.18, 0.74, -0.54, 0.28, 0, SIDE_DETAIL_COLOR),
    createBoxPart(0.08, 0.18, 0.74, 0.54, 0.28, 0, SIDE_DETAIL_COLOR),
  ]

  const merged = mergeGeometries(parts, false)
  parts.forEach((part) => part.dispose())

  if (!merged) {
    throw new Error('Unable to merge vehicle proxy shell geometry')
  }

  merged.computeBoundingBox()
  merged.computeBoundingSphere()
  return merged
}
