import { describe, expect, test } from 'bun:test'
import {
  resolveEditorTransformAxisConfig,
  setEditorCanvasControlsEnabled,
} from './EditorTransformGizmo'

describe('editor transform gizmo axis config', () => {
  test('keeps ground entities on XZ translation only', () => {
    expect(resolveEditorTransformAxisConfig('person', 'translate')).toEqual({
      showX: true,
      showY: false,
      showZ: true,
    })
    expect(resolveEditorTransformAxisConfig('vehicle', 'translate')).toEqual({
      showX: true,
      showY: false,
      showZ: true,
    })
    expect(resolveEditorTransformAxisConfig('equipment', 'translate')).toEqual({
      showX: true,
      showY: false,
      showZ: true,
    })
    expect(resolveEditorTransformAxisConfig('static-asset', 'translate')).toEqual({
      showX: true,
      showY: false,
      showZ: true,
    })
  })

  test('allows sensor and camera translation on Y when needed', () => {
    expect(resolveEditorTransformAxisConfig('sensor', 'translate')).toEqual({
      showX: true,
      showY: true,
      showZ: true,
    })
    expect(resolveEditorTransformAxisConfig('camera', 'translate')).toEqual({
      showX: true,
      showY: true,
      showZ: true,
    })
  })

  test('rotation stays on Y axis only for all entity types', () => {
    expect(resolveEditorTransformAxisConfig('person', 'rotate')).toEqual({
      showX: false,
      showY: true,
      showZ: false,
    })
    expect(resolveEditorTransformAxisConfig('camera', 'rotate')).toEqual({
      showX: false,
      showY: true,
      showZ: false,
    })
  })

  test('scale keeps ground-authored assets on XZ while elevated types retain Y', () => {
    expect(resolveEditorTransformAxisConfig('static-asset', 'scale')).toEqual({
      showX: true,
      showY: false,
      showZ: true,
    })
    expect(resolveEditorTransformAxisConfig('camera', 'scale')).toEqual({
      showX: true,
      showY: true,
      showZ: true,
    })
  })

  test('only toggles canvas controls that expose an enabled flag', () => {
    const orbitLikeControls = { enabled: true }
    const unrelatedControls = { axis: 'X' }

    setEditorCanvasControlsEnabled(orbitLikeControls, false)
    setEditorCanvasControlsEnabled(unrelatedControls as never, false)
    setEditorCanvasControlsEnabled(null, true)

    expect(orbitLikeControls.enabled).toBe(false)
    expect(unrelatedControls).toEqual({ axis: 'X' })
  })
})
