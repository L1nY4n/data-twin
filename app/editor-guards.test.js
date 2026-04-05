import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('editor guards', () => {
  test('editor should live on a separate route with its own shell and local panel layout', () => {
    const page = readFileSync(join(process.cwd(), 'app/editor/page.tsx'), 'utf8')
    const shell = readFileSync(
      join(process.cwd(), 'components/editor/EditorShell.tsx'),
      'utf8'
    )
    const sidebar = readFileSync(
      join(process.cwd(), 'components/editor/EditorAppSidebar.tsx'),
      'utf8'
    )

    expect(page.includes('EditorShell')).toBe(true)
    expect(shell.includes('SidebarProvider')).toBe(false)
    expect(shell.includes('EditorAppSidebar')).toBe(true)
    expect(shell.includes('EditorToolbar')).toBe(true)
    expect(shell.includes('EditorCanvas')).toBe(true)
    expect(shell.includes('resourcesPanelOpen')).toBe(true)
    expect(sidebar.includes('资源库 / 场景')).toBe(true)
    expect(sidebar.includes('/admin/overview')).toBe(false)
    expect(sidebar.includes('搜索塔、桥架、罐体、模块')).toBe(true)
    expect(sidebar.includes('EDITOR_CATALOG_TRANSFER_MIME')).toBe(true)
    expect(sidebar.includes("from '@/components/ui/sidebar'")).toBe(false)
  })

  test('viewer should remain on the live runtime path and not import editor state', () => {
    const viewerPage = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8')

    expect(viewerPage.includes('useLiveDigitalTwin')).toBe(true)
    expect(viewerPage.includes('EditorShell')).toBe(false)
    expect(viewerPage.includes('editor-store')).toBe(false)
  })

  test('editor should use transform controls with dedicated bootstrap and save flow', () => {
    const canvas = readFileSync(
      join(process.cwd(), 'components/editor/scene/EditorTransformGizmo.tsx'),
      'utf8'
    )
    const picking = readFileSync(
      join(process.cwd(), 'components/editor/scene/EditorScenePicking.tsx'),
      'utf8'
    )
    const hook = readFileSync(
      join(process.cwd(), 'hooks/use-editor-digital-twin.ts'),
      'utf8'
    )
    const store = readFileSync(
      join(process.cwd(), 'lib/digital-twin/editor-store.ts'),
      'utf8'
    )

    expect(canvas.includes('TransformControls')).toBe(true)
    expect(picking.includes('suppressClickRef')).toBe(true)
    expect(picking.includes('resolveEditorMarqueeTarget')).toBe(true)
    expect(hook.includes('fetchBootstrap')).toBe(true)
    expect(hook.includes('createAdminEntity')).toBe(true)
    expect(hook.includes('deleteAdminEntity')).toBe(true)
    expect(hook.includes('updateAdminEntity')).toBe(true)
    expect(store.includes('undo')).toBe(true)
    expect(store.includes('redo')).toBe(true)
    expect(store.includes('resetDraft')).toBe(true)
    expect(store.includes('duplicateSelection')).toBe(true)
    expect(store.includes('updateDraftMetadata')).toBe(true)
    expect(store.includes('focusCameraDirection')).toBe(true)
    expect(store.includes('hydrateFromBootstrap')).toBe(true)
  })
})
