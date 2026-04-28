'use client'

import type * as THREE from 'three'

interface PickableUserData {
  pickable?: boolean
  entityId?: string
  entityIds?: Array<string | null | undefined>
  staticFeatureId?: string
  staticFeatureIds?: string[]
}

export interface ScenePickTarget {
  kind: 'entity' | 'static-feature'
  id: string
}

function resolveFromUserData(
  userData: PickableUserData | undefined,
  instanceId: number | undefined
): ScenePickTarget | null {
  if (!userData?.pickable) return null
  if (typeof userData.entityId === 'string') {
    return { kind: 'entity', id: userData.entityId }
  }
  if (typeof userData.staticFeatureId === 'string') {
    return { kind: 'static-feature', id: userData.staticFeatureId }
  }
  if (typeof instanceId === 'number' && Array.isArray(userData.entityIds)) {
    const id = userData.entityIds[instanceId]
    return typeof id === 'string' ? { kind: 'entity', id } : null
  }
  if (typeof instanceId === 'number' && Array.isArray(userData.staticFeatureIds)) {
    const id = userData.staticFeatureIds[instanceId]
    return typeof id === 'string' ? { kind: 'static-feature', id } : null
  }
  return null
}

export function resolvePickTargetFromIntersection(hit: THREE.Intersection): ScenePickTarget | null {
  let current: THREE.Object3D | null = hit.object
  while (current) {
    const target = resolveFromUserData(current.userData as PickableUserData | undefined, hit.instanceId)
    if (target) return target
    current = current.parent
  }
  return null
}

export function resolveEntityIdFromIntersection(hit: THREE.Intersection): string | null {
  const target = resolvePickTargetFromIntersection(hit)
  return target?.kind === 'entity' ? target.id : null
}
