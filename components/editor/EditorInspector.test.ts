import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('editor inspector grouping', () => {
  test('keeps object inspector grouped around transform, asset, material, and business controls', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/editor/EditorInspector.tsx'),
      'utf8'
    )

    expect(source.includes("eyebrow=\"Transform\"")).toBe(true)
    expect(source.includes("title=\"Asset\"")).toBe(true)
    expect(source.includes("title=\"Material\"")).toBe(true)
    expect(source.includes("title=\"Business\"")).toBe(true)
    expect(source.includes('updateDraftMetadata')).toBe(true)
  })

  test('shows scene-level controls when nothing is selected', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/editor/EditorInspector.tsx'),
      'utf8'
    )

    expect(
      source.includes(
        'editor-panel editor-panel--soft flex h-full min-h-0 flex-col overflow-hidden px-2 py-2 text-white'
      )
    ).toBe(true)
    expect(source.includes("eyebrow=\"Scene\"")).toBe(true)
    expect(source.includes("label=\"Environment\"")).toBe(true)
    expect(source.includes("label=\"Ground\"")).toBe(true)
    expect(source.includes("label=\"Grid Size\"")).toBe(true)
    expect(source.includes("label=\"Grid Divisions\"")).toBe(true)
    expect(source.includes("label=\"Camera\"")).toBe(false)
    expect(source.includes("label=\"Snap\"")).toBe(false)
    expect(source.includes("label=\"Show Grid\"")).toBe(false)
    expect(source.includes("label=\"Show Axes\"")).toBe(false)
    expect(source.includes("label=\"Transform Snap\"")).toBe(false)
    expect(source.includes("label=\"Translate Step\"")).toBe(false)
    expect(source.includes("label=\"Rotate Step\"")).toBe(false)
  })

  test('keeps inspector chrome smaller and denser for the side panel surface', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/editor/EditorInspector.tsx'),
      'utf8'
    )
    const chromeSource = readFileSync(
      join(process.cwd(), 'app/editor/editor-global.css'),
      'utf8'
    )

    expect(source.includes('editor-panel p-3')).toBe(true)
    expect(source.includes('editor-block p-2.5')).toBe(true)
    expect(source.includes('editor-side-header px-2 py-1.5')).toBe(true)
    expect(source.includes('editor-header-icon flex size-7 items-center justify-center rounded-[8px]')).toBe(true)
    expect(source.includes('text-[12px] font-semibold text-white')).toBe(true)
    expect(source.includes('text-[10px] leading-4 text-white/52')).toBe(true)
    expect(source.includes('size-7 rounded-[8px]')).toBe(true)
    expect(source.includes('flex size-9 items-center justify-center p-1')).toBe(true)
    expect(source.includes('editor-input h-8 w-14 p-1')).toBe(true)
    expect(
      chromeSource.includes('.editor-surface .editor-side-shell-wrap--right .editor-side-shell .editor-control {')
    ).toBe(true)
    expect(chromeSource.includes('font-size: 12px;')).toBe(true)
    expect(chromeSource.includes('line-height: 1rem;')).toBe(true)
    expect(chromeSource.includes('border-radius: 8px !important;')).toBe(true)
    expect(
      chromeSource.includes('.editor-surface .editor-side-shell-wrap--right .editor-side-shell.editor-panel {')
    ).toBe(true)
    expect(chromeSource.includes('padding: 8px !important;')).toBe(true)
    expect(
      chromeSource.includes('.editor-surface .editor-side-shell-wrap--right .editor-side-shell .editor-kicker {')
    ).toBe(true)
    expect(chromeSource.includes('font-size: 9px;')).toBe(true)
    expect(
      chromeSource.includes('.editor-surface .editor-side-shell-wrap--right .editor-side-shell .editor-pill {')
    ).toBe(true)
    expect(
      chromeSource.includes('.editor-surface .editor-side-shell-wrap--right .editor-side-shell .editor-input {')
    ).toBe(true)
    expect(chromeSource.includes('min-height: 32px;')).toBe(true)
    expect(chromeSource.includes('line-height: 18px;')).toBe(true)
  })

  test('supports wheel and vertical scrub affordances for numeric inputs', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/editor/EditorInspector.tsx'),
      'utf8'
    )

    expect(source.includes('function useNumericInputInteractions')).toBe(true)
    expect(source.includes("event.pointerType !== 'mouse'")).toBe(true)
    expect(source.includes("data-editor-scrubbable=\"true\"")).toBe(true)
    expect(source.includes('onWheel={numericInputInteractions.handleWheel}')).toBe(true)
    expect(source.includes('onPointerDown={numericInputInteractions.handlePointerDown}')).toBe(true)
    expect(source.includes("window.addEventListener('pointermove', handlePointerMove, { passive: false })")).toBe(true)
  })

  test('offers a standard room quick-start action in the empty inspector state', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/editor/EditorInspector.tsx'),
      'utf8'
    )

    expect(source.includes('onCreateStandardRoom')).toBe(true)
    expect(source.includes("label=\"Quick Start\"")).toBe(true)
    expect(source.includes('创建标准房间')).toBe(true)
    expect(source.includes('6m × 4.8m')).toBe(true)
  })
})
