import { describe, expect, test } from 'bun:test'
import { useEditorPreviewStore } from './editor-preview-store'

describe('editor preview store', () => {
  test('stores drag preview outside the main editor store', () => {
    useEditorPreviewStore.getState().reset()

    useEditorPreviewStore.getState().setTransformPreview({
      position: { x: 14, y: 0, z: 24 },
      rotation: { x: 0, y: 0.2, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    })

    expect(useEditorPreviewStore.getState().transformPreview?.position.x).toBe(14)

    useEditorPreviewStore.getState().reset()

    expect(useEditorPreviewStore.getState().transformPreview).toBeNull()
  })
})
