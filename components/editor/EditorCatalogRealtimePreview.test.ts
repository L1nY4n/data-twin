import { describe, expect, test } from 'bun:test'
import {
  resolvePreviewFocusPoint,
  resolvePreviewFrameRadius,
  resolvePreviewScale,
} from './EditorCatalogRealtimePreview'

describe('editor catalog realtime preview framing', () => {
  test('centers the preview target using measured bounds instead of the local origin', () => {
    const bounds = {
      min: { x: -4.7, y: 0, z: -2.7 },
      max: { x: 6.8, y: 5.5, z: 2.7 },
    }
    const previewConfig = {
      cameraPosition: [8.8, 5.6, 8.8] as [number, number, number],
      rotation: [0.36, -0.78, 0] as [number, number, number],
      lift: 0.14,
      fov: 24,
    }

    const focusPoint = resolvePreviewFocusPoint(bounds, previewConfig)

    expect(focusPoint).toEqual({
      x: 1.0499999999999998,
      y: 1.98,
      z: 0,
    })
    expect(focusPoint.x).not.toBe(0)
  })

  test('fits asymmetric geometry using the farthest corner radius around the focus point', () => {
    const bounds = {
      min: { x: -4.7, y: 0, z: -2.7 },
      max: { x: 6.8, y: 5.5, z: 2.7 },
    }
    const previewConfig = {
      cameraPosition: [8.8, 5.6, 8.8] as [number, number, number],
      rotation: [0.36, -0.78, 0] as [number, number, number],
      lift: 0.14,
      fov: 24,
    }

    const focusPoint = resolvePreviewFocusPoint(bounds, previewConfig)
    const radius = resolvePreviewFrameRadius(bounds, focusPoint)
    const scale = resolvePreviewScale(previewConfig, 4.25 / 3.5, radius)

    expect(radius).toBeGreaterThan(6)
    expect(scale).toBeGreaterThanOrEqual(0.75)
    expect(scale).toBeLessThanOrEqual(3)
  })
})
