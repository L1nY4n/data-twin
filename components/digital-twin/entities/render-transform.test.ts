import { describe, expect, test } from 'bun:test'
import {
  resolveRenderablePosition,
  resolveRenderableRotation,
} from './render-transform'

describe('entity render transform helpers', () => {
  test('keeps legacy ground clamp when fullTransform is disabled', () => {
    expect(
      resolveRenderablePosition(
        { x: 1, y: 5, z: 2 },
        { clampYToGround: true, fullTransform: false }
      )
    ).toEqual([1, 0, 2])
    expect(
      resolveRenderableRotation(
        { x: 0.4, y: 0.8, z: 1.2 },
        { fullTransform: false }
      )
    ).toEqual([0, 0.8, 0])
  })

  test('uses full xyz position and rotation when fullTransform is enabled', () => {
    expect(
      resolveRenderablePosition(
        { x: 1, y: 5, z: 2 },
        { clampYToGround: true, fullTransform: true }
      )
    ).toEqual([1, 5, 2])
    expect(
      resolveRenderableRotation(
        { x: 0.4, y: 0.8, z: 1.2 },
        { fullTransform: true }
      )
    ).toEqual([0.4, 0.8, 1.2])
  })
})
