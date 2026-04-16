import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('admin copy guards', () => {
  test('shared admin chrome should stay concise and localized', () => {
    const adminMeta = readFileSync(
      join(process.cwd(), 'components/admin/admin-meta.ts'),
      'utf8'
    )
    const adminSurface = readFileSync(
      join(process.cwd(), 'components/admin/admin-surface.tsx'),
      'utf8'
    )
    const sidebar = readFileSync(
      join(process.cwd(), 'components/admin/AdminAppSidebar.tsx'),
      'utf8'
    )

    expect(adminMeta.includes('Operations Overview')).toBe(false)
    expect(adminMeta.includes('Workspace Registry')).toBe(false)
    expect(adminMeta.includes('Scene Modeling')).toBe(false)
    expect(adminMeta.includes('Entity Registry')).toBe(false)
    expect(adminMeta.includes('Archetype Registry')).toBe(false)
    expect(adminMeta.includes('Integration Layer')).toBe(false)
    expect(adminMeta.includes('Automation Control')).toBe(false)
    expect(adminMeta.includes('Traceability')).toBe(false)
    expect(adminMeta.includes('description:')).toBe(false)
    expect(adminSurface.includes('asideTitle')).toBe(false)
    expect(adminSurface.includes('asideDetail')).toBe(false)
    expect(adminSurface.includes('CardDescription')).toBe(false)
    expect(sidebar.includes('item.description')).toBe(false)
    expect(sidebar.includes('配置、接入、治理、发布')).toBe(false)
  })

  test('admin section files should avoid advisory prose and multi-block empty-state guidance', () => {
    const workspaces = readFileSync(
      join(process.cwd(), 'components/admin/WorkspacesSection.tsx'),
      'utf8'
    )
    const archetypes = readFileSync(
      join(process.cwd(), 'components/admin/ArchetypesSection.tsx'),
      'utf8'
    )
    const connectors = readFileSync(
      join(process.cwd(), 'components/admin/ConnectorsSection.tsx'),
      'utf8'
    )
    const entities = readFileSync(
      join(process.cwd(), 'components/admin/EntitiesSection.tsx'),
      'utf8'
    )
    const scene = readFileSync(
      join(process.cwd(), 'components/admin/SceneSection.tsx'),
      'utf8'
    )
    const consoleSource = readFileSync(
      join(process.cwd(), 'components/admin/AdminConsole.tsx'),
      'utf8'
    )

    for (const source of [workspaces, archetypes, connectors, entities]) {
      expect(source.includes('asideDetail=')).toBe(false)
      expect(source.includes('而不是')).toBe(false)
      expect(source.includes('操作建议')).toBe(false)
      expect(source.includes('description=')).toBe(false)
    }

    expect(scene.includes('先调参数，再看运行态')).toBe(false)
    expect(scene.includes('description=')).toBe(false)
    expect(consoleSource.includes('治理阶段')).toBe(false)
    expect(consoleSource.includes('使用方式')).toBe(false)
    expect(consoleSource.includes('模块定位')).toBe(false)
    expect(consoleSource.includes('安全边界')).toBe(false)
    expect(consoleSource.includes('而不是')).toBe(false)
    expect(consoleSource.includes('description=')).toBe(false)
  })
})
