import { describe, expect, test } from 'bun:test'
import {
  resolveEntitySimulationCadence,
  shouldSimulateEntityThisTick,
} from './runtime-simulation-cadence'

describe('runtime simulation cadence', () => {
  const cameraPosition = { x: 0, y: 12, z: 0 }
  const cameraTarget = { x: 0, y: 0, z: 20 }

  test('keeps interaction-critical entities on full cadence', () => {
    expect(
      resolveEntitySimulationCadence({
        entityPosition: { x: 0, y: 0, z: -360 },
        cameraPosition,
        cameraTarget,
        isInteractionCritical: true,
      })
    ).toBe(1)
  })

  test('keeps nearby entities on full cadence', () => {
    expect(
      resolveEntitySimulationCadence({
        entityPosition: { x: 8, y: 0, z: 36 },
        cameraPosition,
        cameraTarget,
      })
    ).toBe(1)
  })

  test('reduces cadence for far entities that are still roughly in front of the camera', () => {
    expect(
      resolveEntitySimulationCadence({
        entityPosition: { x: 12, y: 0, z: 280 },
        cameraPosition,
        cameraTarget,
      })
    ).toBeGreaterThan(1)
  })

  test('uses the slowest cadence for extreme-distance entities outside the current view direction', () => {
    expect(
      resolveEntitySimulationCadence({
        entityPosition: { x: 0, y: 0, z: -480 },
        cameraPosition,
        cameraTarget,
      })
    ).toBe(12)
  })

  test('simulates cadence-gated entities only on their scheduled ticks', () => {
    expect(shouldSimulateEntityThisTick(8, 4)).toBe(true)
    expect(shouldSimulateEntityThisTick(9, 4)).toBe(false)
    expect(shouldSimulateEntityThisTick(3, 1)).toBe(true)
  })
})
