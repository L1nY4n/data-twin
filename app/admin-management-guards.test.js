import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('admin management guards', () => {
  test('admin should use sidebar shell and route sections instead of a single tabs page', () => {
    const layout = readFileSync(join(process.cwd(), 'app/admin/layout.tsx'), 'utf8')
    const routePage = readFileSync(join(process.cwd(), 'app/admin/[section]/page.tsx'), 'utf8')
    const redirectPage = readFileSync(join(process.cwd(), 'app/admin/page.tsx'), 'utf8')
    const shell = readFileSync(join(process.cwd(), 'components/admin/AdminShell.tsx'), 'utf8')
    const adminMeta = readFileSync(join(process.cwd(), 'components/admin/admin-meta.ts'), 'utf8')

    expect(layout.includes('AdminShell')).toBe(true)
    expect(shell.includes('SidebarProvider')).toBe(true)
    expect(adminMeta.includes('/admin/overview')).toBe(true)
    expect(routePage.includes('AdminConsole')).toBe(true)
    expect(routePage.includes('notFound')).toBe(true)
    expect(redirectPage.includes("redirect('/admin/overview')")).toBe(true)
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

    expect(toolbar.includes('/admin/overview')).toBe(true)
    expect(toolbar.includes('管理中心')).toBe(true)
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

    expect(consoleSource.includes('fetchAdminOverview')).toBe(true)
    expect(consoleSource.includes('listAdminAlarms')).toBe(true)
    expect(consoleSource.includes('listAdminAuditEvents')).toBe(true)
    expect(consoleSource.includes('SaveLiveWarning')).toBe(true)
    expect(consoleSource.includes('AdvancedJsonEditor')).toBe(true)
    expect(consoleSource.includes('createEntityTemplate')).toBe(true)
    expect(consoleSource.includes('createConnectorTemplate')).toBe(true)
    expect(consoleSource.includes('createRuleTemplate')).toBe(true)
  })
})
