import type { CameraPreset } from './types'

const MIN_CAMERA_HEIGHT_ABOVE_TARGET = 12
const MIN_TOP_PRESET_HORIZONTAL_OFFSET = 6
const MIN_TOP_PRESET_HEIGHT = 96
export const DEFAULT_QUICK_CAMERA_PRESET_LIMIT = 3

function clonePreset(preset: CameraPreset): CameraPreset {
  return {
    ...preset,
    position: { ...preset.position },
    target: { ...preset.target },
  }
}

function isTopLikePreset(preset: CameraPreset) {
  const label = preset.name.trim().toLowerCase()
  return preset.id === 'top' || label.includes('top') || label.includes('俯视')
}

export function stabilizeCameraPreset(preset: CameraPreset): CameraPreset {
  const nextPreset = clonePreset(preset)
  const heightAboveTarget = nextPreset.position.y - nextPreset.target.y
  const horizontalRadius = Math.hypot(
    nextPreset.position.x - nextPreset.target.x,
    nextPreset.position.z - nextPreset.target.z
  )

  if (heightAboveTarget <= 0) {
    nextPreset.position.y =
      nextPreset.target.y + Math.max(Math.abs(heightAboveTarget), MIN_CAMERA_HEIGHT_ABOVE_TARGET)
  }

  if (isTopLikePreset(nextPreset)) {
    nextPreset.position.y = Math.max(
      nextPreset.position.y,
      nextPreset.target.y + MIN_TOP_PRESET_HEIGHT
    )

    if (horizontalRadius < MIN_TOP_PRESET_HORIZONTAL_OFFSET) {
      nextPreset.position.z = nextPreset.target.z + MIN_TOP_PRESET_HORIZONTAL_OFFSET
    }
  }

  return nextPreset
}

export function stabilizeCameraPresets(cameraPresets: CameraPreset[]): CameraPreset[] {
  return cameraPresets.map(stabilizeCameraPreset)
}

export function selectQuickCameraPresets(
  cameraPresets: CameraPreset[],
  limit = DEFAULT_QUICK_CAMERA_PRESET_LIMIT
): CameraPreset[] {
  if (limit <= 0) return []

  const configured = cameraPresets
    .map((preset, index) => ({ preset, index }))
    .filter(({ preset }) => preset.quickAccess === true)
    .sort((left, right) => {
      const leftOrder = left.preset.quickAccessOrder ?? left.index
      const rightOrder = right.preset.quickAccessOrder ?? right.index
      return leftOrder - rightOrder || left.index - right.index
    })
    .map(({ preset }) => preset)

  return (configured.length > 0 ? configured : cameraPresets).slice(0, limit)
}
