import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('editor style and motion integration', () => {
  test('editor layout loads spline fonts and the dedicated global theme file', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/editor/layout.tsx'),
      'utf8'
    )

    expect(source.includes("from 'next/font/google'")).toBe(true)
    expect(source.includes('Spline_Sans')).toBe(true)
    expect(source.includes('Spline_Sans_Mono')).toBe(true)
    expect(source.includes("'./editor-global.css'")).toBe(true)
    expect(source.includes('editor-fonts')).toBe(true)
  })

  test('editor shell wires chrome motion refs for toolbar, side panels, and dock', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/editor/EditorShell.tsx'),
      'utf8'
    )

    expect(source.includes('useEditorChromeMotion')).toBe(true)
    expect(source.includes('data-editor-chrome="resources"')).toBe(true)
    expect(source.includes('data-editor-chrome="toolbar"')).toBe(true)
    expect(source.includes('data-editor-chrome="inspector"')).toBe(true)
    expect(source.includes('data-editor-chrome="dock"')).toBe(true)
  })

  test('chrome motion hook uses animejs scope, stagger, and spring easing', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/editor/useEditorChromeMotion.ts'),
      'utf8'
    )

    expect(source.includes("from 'animejs'")).toBe(true)
    expect(source.includes("from 'animejs/scope'")).toBe(true)
    expect(source.includes('spring(')).toBe(true)
    expect(source.includes('stagger(')).toBe(true)
    expect(source.includes('pointerdown')).toBe(true)
  })
})
