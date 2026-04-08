'use client'

import { useEffect, useRef } from 'react'
import { createCitationRuntimeState, evaluateRuntimeIncidents } from '@/lib/digital-twin/citation-runtime'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'

const INCIDENT_ENGINE_INTERVAL_MS = 1_800

export function useCitationRuntime() {
  const engineStateRef = useRef(createCitationRuntimeState())

  useEffect(() => {
    const tick = () => {
      const snapshot = useDigitalTwinStore.getState()
      snapshot.pruneIncidents()
      if (snapshot.runtimeDataSource !== 'mock') {
        engineStateRef.current = createCitationRuntimeState()
        return
      }

      const entities = Array.from(snapshot.entities.values())
      if (entities.length === 0) {
        engineStateRef.current = createCitationRuntimeState()
        return
      }

      const result = evaluateRuntimeIncidents({
        now: Date.now(),
        entities,
        previousState: engineStateRef.current,
      })
      engineStateRef.current = result.nextState

      if (result.incidents.length === 0) return

      const store = useDigitalTwinStore.getState()
      result.incidents.forEach((incident, index) => {
        store.upsertIncident(incident)
        const latestState = useDigitalTwinStore.getState()
        if (index === 0 && latestState.activeIncidentId === null) {
          store.setActiveIncident(incident.id)
        }
      })
    }

    const timer = window.setInterval(tick, INCIDENT_ENGINE_INTERVAL_MS)
    tick()

    return () => {
      window.clearInterval(timer)
    }
  }, [])
}
