import { describe, expect, test } from 'bun:test'
import { resolveEditorCanvasHintCopy } from './EditorCanvas'

describe('editor canvas interaction policy', () => {
  test('keeps transform hints aligned with upstream-style drag ownership', () => {
    expect(resolveEditorCanvasHintCopy('translate', true)).toEqual({
      label: '移动对象',
      lines: ['拖拽 Gizmo 移动物体', '空白处仍可拖动画面', '滚轮/中键缩放 · 右键平移'],
    })

    expect(resolveEditorCanvasHintCopy('translate', false)).toEqual({
      label: '移动对象',
      lines: ['选中对象后显示 Gizmo', '左键拖动画面', '滚轮/中键缩放 · 右键平移'],
    })

    expect(resolveEditorCanvasHintCopy('select', false)).toEqual({
      label: '选择模式',
      lines: ['左键拖动画面', 'Shift + 左键框选', '单击选择对象'],
    })
  })
})
