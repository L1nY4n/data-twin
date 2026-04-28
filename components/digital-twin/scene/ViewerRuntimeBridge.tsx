'use client'

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from 'react'
import type * as THREE from 'three'
import {
  type DigitalTwinPickCandidateHit,
  type DigitalTwinPickGroupPriority,
} from '@/lib/digital-twin/viewer-runtime/pick-index'
import {
  DigitalTwinViewerRuntime,
  type DigitalTwinViewerRuntimePlugin,
} from '@/lib/digital-twin/viewer-runtime/runtime'

const ViewerRuntimeContext = createContext<DigitalTwinViewerRuntime | null>(null)

export function ViewerRuntimeBridge({ children }: { children: ReactNode }) {
  const runtime = useMemo(() => new DigitalTwinViewerRuntime(), [])

  useEffect(() => () => runtime.dispose(), [runtime])

  return (
    <ViewerRuntimeContext.Provider value={runtime}>
      {children}
    </ViewerRuntimeContext.Provider>
  )
}

export function useDigitalTwinViewerRuntime() {
  return useContext(ViewerRuntimeContext)
}

export function useDigitalTwinPickIndex() {
  return useContext(ViewerRuntimeContext)?.pickIndex ?? null
}

export function useDigitalTwinRuntimePlugin(
  plugin: DigitalTwinViewerRuntimePlugin | null,
  dependencyKey: string
) {
  const runtime = useDigitalTwinViewerRuntime()

  useEffect(() => {
    if (!runtime || !plugin) return
    return runtime.use(plugin)
  }, [dependencyKey, plugin, runtime])
}

export function usePickGroupRegistration({
  id,
  refs,
  bounds,
  priority = 'mixed',
  enabled = true,
  dependencyKey,
  pickCandidates,
  exactRaycast,
}: {
  id: string
  refs: ReadonlyArray<{ readonly current: THREE.Object3D | null }>
  bounds?: THREE.Sphere | THREE.Box3
  priority?: DigitalTwinPickGroupPriority
  enabled?: boolean
  dependencyKey: string
  pickCandidates?: (raycaster: THREE.Raycaster) => readonly DigitalTwinPickCandidateHit[]
  exactRaycast?: boolean
}) {
  const pickIndex = useDigitalTwinPickIndex()

  useLayoutEffect(() => {
    if (!pickIndex || !enabled) return

    const objects = refs
      .map((ref) => ref.current)
      .filter((object): object is THREE.Object3D => Boolean(object))
    if (objects.length === 0) return

    return pickIndex.register({
      id,
      objects,
      bounds,
      priority,
      pickCandidates,
      exactRaycast,
    })
  }, [bounds, dependencyKey, enabled, exactRaycast, id, pickCandidates, pickIndex, priority, refs])
}
