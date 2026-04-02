import { describe, expect, test } from 'bun:test'
import { getEquipmentSimulationIntervalMs, shouldRunEquipmentSimulation } from './equipment-runtime'

describe('equipment runtime throttling', () => {
  test('runs equipment simulation less frequently than the fixed 30Hz tick', () => {
    expect(getEquipmentSimulationIntervalMs('balanced')).toBe(500)
    expect(getEquipmentSimulationIntervalMs('performance')).toBe(750)
  })

  test('holds simulation work until the interval boundary is reached', () => {
    expect(shouldRunEquipmentSimulation(1499, 1000, 500)).toBe(false)
    expect(shouldRunEquipmentSimulation(1500, 1000, 500)).toBe(true)
  })
})
