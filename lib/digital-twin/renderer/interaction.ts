'use client'

import type * as THREE from 'three'

interface PickableUserData {
  pickable?: boolean
  entityId?: string
  entityIds?: string[]
}

function resolveFromUserData(
  userData: PickableUserData | undefined,
  instanceId: number | undefined
): string | null {
  if (!userData?.pickable) return null
  if (typeof userData.entityId === 'string') return userData.entityId
  if (typeof instanceId === 'number' && Array.isArray(userData.entityIds)) {
    return userData.entityIds[instanceId] ?? null
  }
  return null
}

export function resolveEntityIdFromIntersection(hit: THREE.Intersection): string | null {
  let current: THREE.Object3D | null = hit.object
  while (current) {
    const entityId = resolveFromUserData(current.userData as PickableUserData | undefined, hit.instanceId)
    if (entityId) return entityId
    current = current.parent
  }
  return null
}
