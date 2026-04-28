import { describe, expect, test } from 'bun:test'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import {
  writeGroundRingMatrix,
  writeTranslationScaleMatrix,
  writeYawRollScaleMatrix,
  writeYawScaleMatrix,
} from './instance-matrix-writer'

function expectMatrixClose(actual: ArrayLike<number>, expected: Matrix4) {
  expected.elements.forEach((value, index) => {
    expect(actual[index]).toBeCloseTo(value, 5)
  })
}

describe('instance matrix writer', () => {
  test('writes yaw scale matrices equivalent to Matrix4.compose', () => {
    const array = new Float32Array(16)
    const position = new Vector3(4, 2, -3)
    const yaw = 0.72
    const scale = new Vector3(2, 3, 4)
    const expected = new Matrix4().compose(
      position,
      new Quaternion().setFromEuler(new Euler(0, yaw, 0)),
      scale
    )

    writeYawScaleMatrix(array, 0, position.x, position.y, position.z, yaw, scale.x, scale.y, scale.z)

    expectMatrixClose(array, expected)
  })

  test('writes yaw and roll matrices equivalent to Matrix4.compose', () => {
    const array = new Float32Array(16)
    const position = new Vector3(-5, 1.5, 8)
    const yaw = -0.38
    const roll = Math.PI / 2
    const scale = new Vector3(0.22, 0.16, 0.22)
    const expected = new Matrix4().compose(
      position,
      new Quaternion().setFromEuler(new Euler(0, yaw, roll)),
      scale
    )

    writeYawRollScaleMatrix(
      array,
      0,
      position.x,
      position.y,
      position.z,
      yaw,
      roll,
      scale.x,
      scale.y,
      scale.z
    )

    expectMatrixClose(array, expected)
  })

  test('writes ground ring matrices equivalent to a flat rotated ring object', () => {
    const array = new Float32Array(16)
    const position = new Vector3(1, 0.05, -2)
    const scale = new Vector3(1.4, 0.8, 1)
    const expected = new Matrix4().compose(
      position,
      new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0)),
      scale
    )

    writeGroundRingMatrix(array, 0, position.x, position.y, position.z, scale.x, scale.y)

    expectMatrixClose(array, expected)
  })

  test('writes translation-scale matrices without yaw trig for billboard-like instance parts', () => {
    const array = new Float32Array(16)
    const position = new Vector3(-2, 3, 7)
    const scale = new Vector3(0.5, 0.75, 1.25)
    const expected = new Matrix4().compose(
      position,
      new Quaternion(),
      scale
    )

    writeTranslationScaleMatrix(
      array,
      0,
      position.x,
      position.y,
      position.z,
      scale.x,
      scale.y,
      scale.z
    )

    expectMatrixClose(array, expected)
  })
})
