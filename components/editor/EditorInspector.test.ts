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
    expect(source.includes("label=\"Camera\"")).toBe(true)
    expect(source.includes("label=\"Snap\"")).toBe(true)
  })
})
