export type EquipmentRuntimeProfile = 'balanced' | 'performance'

export function getEquipmentSimulationIntervalMs(
  profile: EquipmentRuntimeProfile,
  entityCount = 0
) {
  const baseInterval = profile === 'performance' ? 750 : 500
  return entityCount >= 120 ? Math.round(baseInterval * 1.25) : baseInterval
}

export function shouldRunEquipmentSimulation(
  nowMs: number,
  lastSimulationAtMs: number,
  intervalMs: number
) {
  return nowMs - lastSimulationAtMs >= intervalMs
}
