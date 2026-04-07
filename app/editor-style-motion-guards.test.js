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

  test('editor theme keeps panel inputs rounded and bordered in the same chrome language', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/editor/editor-global.css'),
      'utf8'
    )

    expect(source.includes('.editor-surface .editor-input')).toBe(true)
    expect(source.includes('border-radius: 14px !important;')).toBe(true)
    expect(source.includes('border-color: rgba(164, 192, 236, 0.16) !important;')).toBe(true)
    expect(source.includes("[data-slot='switch']")).toBe(true)
    expect(source.includes("[data-slot='switch-thumb']")).toBe(true)
    expect(source.includes("[data-editor-scrubbable='true']")).toBe(true)
    expect(source.includes("[data-editor-scrubbing='true']")).toBe(true)
    expect(source.includes('cursor: ns-resize;')).toBe(true)
  })
})
