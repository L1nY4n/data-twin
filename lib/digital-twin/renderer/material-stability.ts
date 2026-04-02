'use client'

import * as THREE from 'three'

export const STABLE_TRANSPARENT_OVERLAY = {
  transparent: true,
  depthWrite: false,
  depthTest: false,
  toneMapped: false,
} as const

export const STABLE_DOUBLE_SIDED_OVERLAY = {
  ...STABLE_TRANSPARENT_OVERLAY,
  side: THREE.DoubleSide,
} as const

export const OVERLAY_RENDER_ORDER = {
  zoneFill: 20,
  zoneBoundary: 21,
  entityRing: 30,
  entitySelectionRing: 31,
  measurement: 40,
  distance: 41,
  trajectory: 42,
} as const
