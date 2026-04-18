import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('admin management guards', () => {
  test('admin should use sidebar shell and route sections instead of a single tabs page', () => {
    const layout = readFileSync(join(process.cwd(), 'app/admin/layout.tsx'), 'utf8')
    const legacyRoutePage = readFileSync(join(process.cwd(), 'app/admin/[section]/page.tsx'), 'utf8')
    const workspacesPage = readFileSync(join(process.cwd(), 'app/admin/workspaces/page.tsx'), 'utf8')
    const scopedRoutePage = readFileSync(
      join(process.cwd(), 'app/admin/workspaces/[workspaceId]/[section]/page.tsx'),
      'utf8'
    )
    const redirectPage = readFileSync(join(process.cwd(), 'app/admin/page.tsx'), 'utf8')
    const shell = readFileSync(join(process.cwd(), 'components/admin/AdminShell.tsx'), 'utf8')
    const sidebar = readFileSync(join(process.cwd(), 'components/admin/AdminAppSidebar.tsx'), 'utf8')
    const adminMeta = readFileSync(join(process.cwd(), 'components/admin/admin-meta.ts'), 'utf8')
    const sharedSurface = readFileSync(join(process.cwd(), 'app/viewer-admin-surface.css'), 'utf8')

    expect(layout.includes('AdminShell')).toBe(true)
    expect(shell.includes('SidebarProvider')).toBe(true)
    expect(adminMeta.includes('/admin/overview')).toBe(true)
    expect(adminMeta.includes("href: '/admin/scene'")).toBe(false)
    expect(adminMeta.includes('/admin/archetypes')).toBe(true)
    expect(shell.includes('h-svh overflow-hidden')).toBe(true)
    expect(shell.includes('overflow-y-auto overscroll-contain')).toBe(true)
    expect(shell.includes('relative flex min-h-0 flex-1')).toBe(true)
    expect(shell.includes('ProductModuleNav')).toBe(true)
    expect(shell.includes('--sidebar-width')).toBe(true)
    expect(shell.includes('--header-height')).toBe(true)
    expect(shell.includes('@container/main')).toBe(true)
    expect(shell.includes('sticky top-0')).toBe(true)
    expect(sidebar.includes('md:min-h-[var(--admin-section-header-height)]')).toBe(true)
    expect(sidebar.includes('md:justify-center')).toBe(true)
    expect(sharedSurface.includes(".admin-surface [data-slot='sidebar-inner'] {")).toBe(true)
    expect(sharedSurface.includes('border-radius: 0 !important;')).toBe(true)
    expect(legacyRoutePage.includes('fetchHomeWorkspace')).toBe(true)
    expect(legacyRoutePage.includes('buildAdminHref')).toBe(true)
    expect(legacyRoutePage.includes('redirect(')).toBe(true)
    expect(workspacesPage.includes('fetchHomeWorkspace')).toBe(true)
    expect(workspacesPage.includes('workspaceId')).toBe(true)
    expect(workspacesPage.includes('AdminConsole')).toBe(true)
    expect(scopedRoutePage.includes('AdminConsole')).toBe(true)
    expect(scopedRoutePage.includes('fetchWorkspaceById')).toBe(true)
    expect(redirectPage.includes('fetchHomeWorkspace')).toBe(true)
    expect(redirectPage.includes("redirect(`/admin/workspaces?workspaceId=${encodeURIComponent(workspace.id)}`)")).toBe(true)
  })

  test('runtime should expose management navigation and remove direct edit entry points', () => {
    const toolbar = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/Toolbar.tsx'),
      'utf8'
    )
    const bottomPanel = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/BottomPanel.tsx'),
      'utf8'
    )
    const entityList = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/EntityListPanel.tsx'),
      'utf8'
    )

    expect(toolbar.includes('ProductModuleNav')).toBe(true)
    expect(toolbar.includes("from '@/components/chrome/ProductModuleNav'")).toBe(true)
    expect(bottomPanel.includes('/admin/rules')).toBe(true)
    expect(bottomPanel.includes('RuleEditor')).toBe(false)
    expect(entityList.includes('EntityFormDialog')).toBe(false)
    expect(entityList.includes('运行态只读')).toBe(true)
  })

  test('admin console should load overview, governance and structured editor flows', () => {
    const consoleSource = readFileSync(
      join(process.cwd(), 'components/admin/AdminConsole.tsx'),
      'utf8'
    )
    const sceneSection = readFileSync(
      join(process.cwd(), 'components/admin/SceneSection.tsx'),
      'utf8'
    )
    const workspaceHelper = readFileSync(
      join(process.cwd(), 'lib/digital-twin/editor-routing.ts'),
      'utf8'
    )
    const entitiesSection = readFileSync(
      join(process.cwd(), 'components/admin/EntitiesSection.tsx'),
      'utf8'
    )
    const connectorsSection = readFileSync(
      join(process.cwd(), 'components/admin/ConnectorsSection.tsx'),
      'utf8'
    )
    const workspacesSection = readFileSync(
      join(process.cwd(), 'components/admin/WorkspacesSection.tsx'),
      'utf8'
    )
    const archetypesSection = readFileSync(
      join(process.cwd(), 'components/admin/ArchetypesSection.tsx'),
      'utf8'
    )
    const adminSurface = readFileSync(
      join(process.cwd(), 'components/admin/admin-surface.tsx'),
      'utf8'
    )

    expect(consoleSource.includes('fetchAdminOverview')).toBe(true)
    expect(consoleSource.includes('listAdminAlarms')).toBe(true)
    expect(consoleSource.includes('listAdminAuditEvents')).toBe(true)
    expect(consoleSource.includes("@/components/admin/admin-surface")).toBe(true)
    expect(consoleSource.includes("case 'workspaces'")).toBe(true)
    expect(consoleSource.includes('WorkspacesSection')).toBe(true)
    expect(consoleSource.includes("case 'archetypes'")).toBe(true)
    expect(consoleSource.includes('ArchetypesSection')).toBe(true)
    expect(adminSurface.includes('export function SaveLiveWarning')).toBe(true)
    expect(consoleSource.includes('AdvancedJsonEditor')).toBe(true)
    expect(sceneSection.includes('进入编辑器')).toBe(true)
    expect(sceneSection.includes('buildEditorHref(')).toBe(true)
    expect(consoleSource.includes('workspaceId')).toBe(true)
    expect(workspaceHelper.includes('export function buildEditorHref')).toBe(true)
    expect(workspacesSection.includes('listWorkspaces')).toBe(true)
    expect(workspacesSection.includes('createWorkspace')).toBe(true)
    expect(workspacesSection.includes('updateWorkspace')).toBe(true)
    expect(workspacesSection.includes('deleteWorkspace')).toBe(true)
    expect(workspacesSection.includes('persistedWorkspaceForDraft')).toBe(true)
    expect(workspacesSection.includes("buildEditorHref(persistedWorkspaceForDraft.slug, editorReturnHref)")).toBe(true)
    expect(workspacesSection.includes("buildEditorHref('/admin/workspaces')")).toBe(false)
    expect(consoleSource.includes("title: '3D 场景编辑'")).toBe(false)
    expect(entitiesSection.includes('createEntityTemplate')).toBe(true)
    expect(entitiesSection.includes('createDynamicEntityTemplate')).toBe(true)
    expect(entitiesSection.includes('<option value="dynamic">动态实体</option>')).toBe(true)
    expect(entitiesSection.includes('newDynamicArchetypeId')).toBe(true)
    expect(connectorsSection.includes('createConnectorTemplate')).toBe(true)
    expect(consoleSource.includes('createRuleTemplate')).toBe(true)
    expect(archetypesSection.includes('listEntityCategories')).toBe(true)
    expect(archetypesSection.includes('listEntityArchetypes')).toBe(true)
    expect(archetypesSection.includes('ArchetypeModelPreview')).toBe(true)
    expect(archetypesSection.includes('uploadArchetypeModel')).toBe(true)
  })
})
