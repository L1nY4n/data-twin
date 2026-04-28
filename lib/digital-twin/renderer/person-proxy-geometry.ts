import {
  BufferGeometry,
  CapsuleGeometry,
  Color,
  Float32BufferAttribute,
  Matrix4,
  SphereGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const PERSON_PROXY_MATRIX_STREAMS_PER_INSTANCE = 1
export const LEGACY_PERSON_MATRIX_STREAMS_PER_INSTANCE = 2

const BODY_COLOR = new Color(1, 1, 1)
const HEAD_COLOR = new Color(1.12, 1.12, 1.12)

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

export function createPersonProxyGeometry() {
  const body = new CapsuleGeometry(0.23, 0.72, 4, 10)
  body.applyMatrix4(new Matrix4().makeTranslation(0, 0.55, 0))
  applyVertexColor(body, BODY_COLOR)

  const head = new SphereGeometry(0.22, 12, 12)
  head.applyMatrix4(new Matrix4().makeTranslation(0, 1.24, 0))
  applyVertexColor(head, HEAD_COLOR)

  const merged = mergeGeometries([body, head], false)
  body.dispose()
  head.dispose()

  if (!merged) {
    throw new Error('Unable to merge person proxy geometry')
  }

  merged.computeBoundingBox()
  merged.computeBoundingSphere()
  return merged
}
