import { describe, expect, test } from 'bun:test'
import {
  LEGACY_PERSON_MATRIX_STREAMS_PER_INSTANCE,
  PERSON_PROXY_MATRIX_STREAMS_PER_INSTANCE,
  createPersonProxyGeometry,
} from './person-proxy-geometry'

describe('person proxy geometry', () => {
  test('builds a merged body/head proxy with local vertex colors and bounds', () => {
    const geometry = createPersonProxyGeometry()

    try {
      const position = geometry.getAttribute('position')
      const color = geometry.getAttribute('color')

      expect(position.count).toBeGreaterThan(80)
      expect(color.count).toBe(position.count)
      expect(geometry.boundingBox?.min.y).toBeLessThanOrEqual(0)
      expect(geometry.boundingBox?.max.y).toBeGreaterThan(1.4)
      expect(geometry.boundingSphere?.radius).toBeGreaterThan(0.7)
    } finally {
      geometry.dispose()
    }
  })

  test('documents the reduced person matrix stream budget', () => {
    expect(PERSON_PROXY_MATRIX_STREAMS_PER_INSTANCE).toBe(1)
    expect(PERSON_PROXY_MATRIX_STREAMS_PER_INSTANCE).toBeLessThan(
      LEGACY_PERSON_MATRIX_STREAMS_PER_INSTANCE
    )
  })
})
