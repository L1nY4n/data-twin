import { describe, expect, test } from 'bun:test'
import {
  resolveEditorTransformAxisConfig,
} from './EditorTransformGizmo'

describe('editor transform gizmo axis config', () => {
  test('keeps translation fully available on all axes', () => {
    expect(resolveEditorTransformAxisConfig('person', 'translate')).toEqual({
      showX: true,
      showY: true,
      showZ: true,
    })
    expect(resolveEditorTransformAxisConfig('vehicle', 'translate')).toEqual({
      showX: true,
      showY: true,
      showZ: true,
    })
    expect(resolveEditorTransformAxisConfig('equipment', 'translate')).toEqual({
      showX: true,
      showY: true,
      showZ: true,
    })
    expect(resolveEditorTransformAxisConfig('static-asset', 'translate')).toEqual({
      showX: true,
      showY: true,
      showZ: true,
    })
  })

  test('keeps elevated and dynamic targets on the same full translation axes', () => {
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
    expect(resolveEditorTransformAxisConfig('dynamic', 'translate')).toEqual({
      showX: true,
      showY: true,
      showZ: true,
    })
  })

  test('rotation is available on all axes', () => {
    expect(resolveEditorTransformAxisConfig('person', 'rotate')).toEqual({
      showX: true,
      showY: true,
      showZ: true,
    })
    expect(resolveEditorTransformAxisConfig('camera', 'rotate')).toEqual({
      showX: true,
      showY: true,
      showZ: true,
    })
  })

  test('scale is available on all axes', () => {
    expect(resolveEditorTransformAxisConfig('static-asset', 'scale')).toEqual({
      showX: true,
      showY: true,
      showZ: true,
    })
    expect(resolveEditorTransformAxisConfig('camera', 'scale')).toEqual({
      showX: true,
      showY: true,
      showZ: true,
    })
    expect(resolveEditorTransformAxisConfig('dynamic', 'scale')).toEqual({
      showX: true,
      showY: true,
      showZ: true,
    })
  })
})
