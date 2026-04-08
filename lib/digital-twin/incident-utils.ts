import type { RuntimeIncident } from './types'

export const ACTIVE_INCIDENT_WINDOW_MS = 45_000
export const INCIDENT_HISTORY_WINDOW_MS = 5 * 60_000

export function isRuntimeIncidentActive(
  incident: RuntimeIncident,
  now = Date.now()
) {
  return !incident.acknowledged && now - incident.timestamp <= ACTIVE_INCIDENT_WINDOW_MS
}

export function shouldRetainRuntimeIncident(
  incident: RuntimeIncident,
  now = Date.now()
) {
  return now - incident.timestamp <= INCIDENT_HISTORY_WINDOW_MS
}
