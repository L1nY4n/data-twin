import { describe, expect, test } from 'bun:test'
import {
  LEGACY_VEHICLE_BASE_MATRIX_STREAMS_PER_INSTANCE,
  VEHICLE_PROXY_MATRIX_STREAMS_PER_INSTANCE,
  createVehicleProxyShellGeometry,
} from './vehicle-proxy-geometry'

describe('vehicle proxy geometry', () => {
  test('builds a merged shell with local vertex colors and bounds', () => {
    const geometry = createVehicleProxyShellGeometry()

    try {
      const position = geometry.getAttribute('position')
      const color = geometry.getAttribute('color')

      expect(position.count).toBeGreaterThan(24)
      expect(color.count).toBe(position.count)
      expect(geometry.boundingBox?.min.y).toBeCloseTo(0, 5)
      expect(geometry.boundingBox?.max.y).toBeGreaterThan(1)
      expect(geometry.boundingSphere?.radius).toBeGreaterThan(0.8)
    } finally {
      geometry.dispose()
    }
  })

  test('documents the reduced dynamic matrix stream budget', () => {
    expect(VEHICLE_PROXY_MATRIX_STREAMS_PER_INSTANCE).toBe(1)
    expect(VEHICLE_PROXY_MATRIX_STREAMS_PER_INSTANCE).toBeLessThan(
      LEGACY_VEHICLE_BASE_MATRIX_STREAMS_PER_INSTANCE
    )
  })
})
