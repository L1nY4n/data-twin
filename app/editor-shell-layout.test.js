import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('editor shell layout and control affordances', () => {
  test('keeps toolbar, inspector, and dock as compact overlays inside the canvas frame', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/editor/EditorShell.tsx'),
      'utf8'
    )

    expect(
      source.includes(
        'pointer-events-none absolute left-3 z-30 transition-[width,height,opacity,transform] duration-200'
      )
    ).toBe(true)
    expect(source.includes('collapsed={!resourcesPanelOpen}')).toBe(true)
    expect(
      source.includes(
        'pointer-events-none absolute inset-x-0 top-2.5 z-20 flex justify-center px-14 md:px-16 lg:px-24'
      )
    ).toBe(true)
    expect(
      source.includes(
        'pointer-events-none absolute right-3 z-30 hidden transition-[width,height,opacity,transform] duration-200 lg:block'
      )
    ).toBe(true)
    expect(source.includes('collapsed={inspectorCollapsed}')).toBe(true)
    expect(source.includes('absolute inset-x-0 bottom-2.5 z-20 hidden justify-center px-2.5 md:flex')).toBe(
      true
    )
  })

  test('provides explicit labels for compact icon controls', () => {
    const toolbarSource = readFileSync(
      join(process.cwd(), 'components/editor/EditorToolbar.tsx'),
      'utf8'
    )
    const dockSource = readFileSync(
      join(process.cwd(), 'components/editor/EditorViewportDock.tsx'),
      'utf8'
    )
    const sidebarSource = readFileSync(
      join(process.cwd(), 'components/editor/EditorAppSidebar.tsx'),
      'utf8'
    )
    const inspectorSource = readFileSync(
      join(process.cwd(), 'components/editor/EditorInspector.tsx'),
      'utf8'
    )

    expect(toolbarSource.includes('title="Switch tool to select"')).toBe(true)
    expect(toolbarSource.includes('title="Switch tool to move"')).toBe(true)
    expect(toolbarSource.includes('title="Switch tool to scale"')).toBe(true)
    expect(toolbarSource.includes('title="Undo last change"')).toBe(true)
    expect(toolbarSource.includes('title="Redo last change"')).toBe(true)
    expect(toolbarSource.includes('title="Duplicate selected object"')).toBe(true)
    expect(toolbarSource.includes('title="Delete selected object"')).toBe(true)
    expect(dockSource.includes('title="Toggle grid"')).toBe(true)
    expect(dockSource.includes('title="Toggle axes"')).toBe(true)
    expect(dockSource.includes('title="Focus north view"')).toBe(true)
    expect(dockSource.includes('title="Adjust snap step"')).toBe(true)
    expect(sidebarSource.includes('Expand resources panel')).toBe(true)
    expect(sidebarSource.includes('Collapse resources panel')).toBe(true)
    expect(inspectorSource.includes('Expand inspector panel')).toBe(true)
    expect(inspectorSource.includes('Collapse inspector panel')).toBe(true)
  })
})
