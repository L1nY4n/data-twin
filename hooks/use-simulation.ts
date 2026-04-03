'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import {
  createPublishedCampusScenePackage,
  hydratePublishedScenePackage,
  type PublishedSceneProfile,
} from '@/lib/digital-twin/publish'

interface UseSimulationOptions {
  autoStart?: boolean
  profile?: PublishedSceneProfile
}

export function useSimulation(options: UseSimulationOptions = {}) {
  const { autoStart = true, profile = 'default' } = options

  const initialized = useRef(false)
  const isRunning = useRef(false)

  const initializeScene = useCallback(() => {
    if (initialized.current) return

    const publishedScene = createPublishedCampusScenePackage(profile)
    const { persons, vehicles, equipment, zones } = hydratePublishedScenePackage(publishedScene)
    const { addEntities, setConnectionStatus, resetRuntimeClock } = useDigitalTwinStore.getState()

    addEntities([...zones, ...persons, ...vehicles, ...equipment])
    setConnectionStatus(true, 'simulation://ecs-runtime')
    resetRuntimeClock()
    initialized.current = true
  }, [profile])

  const start = useCallback(() => {
    if (isRunning.current) return
    initializeScene()
    isRunning.current = true
    useDigitalTwinStore.getState().setRuntimeRunning(true)
  }, [initializeScene])

  const stop = useCallback(() => {
    isRunning.current = false
    useDigitalTwinStore.getState().setRuntimeRunning(false)
  }, [])

  const reset = useCallback(() => {
    stop()
    initialized.current = false
    useDigitalTwinStore.getState().reset()
    if (autoStart) start()
  }, [autoStart, start, stop])

  useEffect(() => {
    if (autoStart) {
      start()
    }

    return () => {
      stop()
    }
  }, [autoStart, start, stop])

  useEffect(() => {
    const resetRuntimeClock = () => {
      useDigitalTwinStore.getState().resetRuntimeClock()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resetRuntimeClock()
      }
    }

    window.addEventListener('focus', resetRuntimeClock)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', resetRuntimeClock)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return {
    start,
    stop,
    reset,
    isRunning: isRunning.current,
  }
}
