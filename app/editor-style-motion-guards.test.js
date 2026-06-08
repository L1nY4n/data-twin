import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('editor style and motion integration', () => {
  test('editor layout loads spline fonts and the dedicated global theme file', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/editor/layout.tsx'),
      'utf8'
    )
    const rootLayout = readFileSync(
      join(process.cwd(), 'app/layout.tsx'),
      'utf8'
    )

    expect(source.includes("from 'next/font/google'")).toBe(true)
    expect(source.includes('Spline_Sans')).toBe(true)
    expect(source.includes('Spline_Sans_Mono')).toBe(true)
    expect(source.includes("'./editor-global.css'")).toBe(true)
    expect(source.includes('editor-fonts')).toBe(true)
    expect(rootLayout.includes("./editor/editor-global.css")).toBe(false)
    expect(rootLayout.includes("./editor/editor-theme.css")).toBe(false)
  })

  test('editor shell wires chrome motion refs for toolbar, side panels, and dock', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/editor/EditorShell.tsx'),
      'utf8'
    )
    const appSidebar = readFileSync(
      join(process.cwd(), 'components/editor/EditorAppSidebar.tsx'),
      'utf8'
    )
    const inspector = readFileSync(
      join(process.cwd(), 'components/editor/EditorInspector.tsx'),
      'utf8'
    )
    const editorPrimitives = readFileSync(
      join(process.cwd(), 'components/editor/editor-primitives.tsx'),
      'utf8'
    )
    const toolbar = readFileSync(
      join(process.cwd(), 'components/editor/EditorToolbar.tsx'),
      'utf8'
    )
    const canvas = readFileSync(
      join(process.cwd(), 'components/editor/EditorCanvas.tsx'),
      'utf8'
    )
    const preview = readFileSync(
      join(process.cwd(), 'components/editor/EditorCatalogRealtimePreview.tsx'),
      'utf8'
    )

    expect(source.includes('useEditorChromeMotion')).toBe(true)
    expect(source.includes('data-editor-chrome="resources"')).toBe(true)
    expect(source.includes('data-editor-chrome="toolbar"')).toBe(true)
    expect(source.includes('data-editor-chrome="inspector"')).toBe(true)
    expect(source.includes('data-editor-chrome="dock"')).toBe(true)
    expect(editorPrimitives.includes('export function EditorKicker')).toBe(true)
    expect(editorPrimitives.includes('export function EditorEmptyState')).toBe(true)
    expect(editorPrimitives.includes('export function EditorLoadingShell')).toBe(true)
    expect(editorPrimitives.includes('export function EditorLoadingCard')).toBe(true)
    expect(editorPrimitives.includes('export function EditorStatusNotice')).toBe(true)
    expect(editorPrimitives.includes('export function EditorFloatingHintCard')).toBe(true)
    expect(editorPrimitives.includes('export function EditorRealtimePreviewFrame')).toBe(true)
    expect(editorPrimitives.includes('export function EditorInsetBlock')).toBe(true)
    expect(editorPrimitives.includes('export function EditorTreeSectionCard')).toBe(true)
    expect(editorPrimitives.includes('editor-empty-state__icon')).toBe(true)
    expect(source.includes('EditorLoadingShell')).toBe(true)
    expect(source.includes('EditorLoadingCard')).toBe(true)
    expect(source.includes('EditorStatusNotice')).toBe(true)
    expect(canvas.includes('EditorFloatingHintCard')).toBe(true)
    expect(preview.includes('EditorRealtimePreviewFrame')).toBe(true)
    expect(appSidebar.includes('EditorInsetBlock')).toBe(true)
    expect(appSidebar.includes('EditorTreeSectionCard')).toBe(true)
    expect(appSidebar.includes("from '@/components/editor/editor-primitives'")).toBe(true)
    expect(inspector.includes("from '@/components/editor/editor-primitives'")).toBe(true)
    expect(appSidebar.includes('function EditorEmptyState')).toBe(false)
    expect(appSidebar.includes('className="editor-kicker')).toBe(false)
    expect(inspector.includes('className="editor-kicker')).toBe(false)
    expect(source.includes('rounded-[16px] border px-3 py-2 backdrop-blur-xl')).toBe(false)
    expect(canvas.includes('rounded-[16px] border border-white/10')).toBe(false)
    expect(preview.includes('rounded-[16px] border border-[#7da7ff]/18')).toBe(false)
    expect(appSidebar.includes('rounded-[12px] border border-white/6 bg-black/10')).toBe(false)
    expect(appSidebar.includes('rounded-[14px] border border-white/6 bg-white/[0.02]')).toBe(false)
    expect(appSidebar.includes('<EditorKicker as="span" className="text-white/38">')).toBe(true)
    expect(appSidebar.includes('<EditorKicker className="px-2 text-white/34">')).toBe(true)
    expect(inspector.includes('<EditorKicker>{eyebrow}</EditorKicker>')).toBe(true)
    expect(appSidebar.includes('<div className="mt-2 editor-empty">')).toBe(false)
    expect(appSidebar.includes('等待 floor plan')).toBe(true)
    expect(appSidebar.includes('没有匹配资源')).toBe(true)
    expect(appSidebar.includes('没有可显示节点')).toBe(true)
    expect(toolbar.includes('publishedVersionLabel')).toBe(true)
    expect(toolbar.includes("?? '--'")).toBe(false)
    expect(source.includes('uppercase tracking')).toBe(false)
    expect(appSidebar.includes('uppercase tracking')).toBe(false)
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
    const themeSource = readFileSync(
      join(process.cwd(), 'app/editor/editor-theme.css'),
      'utf8'
    )

    expect(source.includes('.editor-surface .editor-input')).toBe(true)
    expect(source.includes('--editor-blur-panel: 18px;')).toBe(true)
    expect(source.includes('--editor-blur-frame: 12px;')).toBe(true)
    expect(source.includes('border-radius: 14px !important;')).toBe(true)
    expect(source.includes('border-color: rgba(164, 192, 236, 0.16) !important;')).toBe(true)
    expect(themeSource.includes('letter-spacing: 0;')).toBe(true)
    expect(themeSource.includes('letter-spacing: -0.01em;')).toBe(false)
    for (const cssSource of [source, themeSource]) {
      const letterSpacingRules = cssSource
        .split('\n')
        .filter((line) => line.includes('letter-spacing:'))
      expect(letterSpacingRules.every((line) => /letter-spacing:\s*0;/u.test(line))).toBe(true)
    }
    expect(source.includes("[data-slot='switch']")).toBe(true)
    expect(source.includes("[data-slot='switch-thumb']")).toBe(true)
    expect(source.includes('.editor-surface .editor-empty-state')).toBe(true)
    expect(source.includes('.editor-surface .editor-empty-state__icon')).toBe(true)
    expect(source.includes('.editor-surface .editor-empty-state__title')).toBe(true)
    expect(source.includes('.editor-surface .editor-empty-state__description')).toBe(true)
    expect(themeSource.includes('.editor-surface .editor-empty-state')).toBe(true)
    expect(source.includes('.editor-surface .editor-status-notice')).toBe(true)
    expect(source.includes('.editor-surface .editor-floating-hint-card')).toBe(true)
    expect(source.includes('.editor-surface .editor-realtime-preview-frame')).toBe(true)
    expect(source.includes('.editor-surface .editor-sidebar-inset')).toBe(true)
    expect(source.includes('.editor-surface .editor-sidebar-tree-card')).toBe(true)
    expect(source.includes("[data-editor-scrubbable='true']")).toBe(true)
    expect(source.includes("[data-editor-scrubbing='true']")).toBe(true)
    expect(source.includes('cursor: ns-resize;')).toBe(true)
  })
})
