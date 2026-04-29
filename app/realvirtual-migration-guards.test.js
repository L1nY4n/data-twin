import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('realvirtual-WEB migration guardrails', () => {
  test('comparison report records AGPL boundary and pattern-only migration plan', () => {
    const report = readFileSync(
      join(process.cwd(), 'docs/reports/2026-04-29-realvirtual-web-comparison.md'),
      'utf8'
    )

    expect(report.includes('https://github.com/game4automation/realvirtual-WEB')).toBe(true)
    expect(report.includes('AGPL-3.0-only')).toBe(true)
    expect(report.includes('不应在本仓库里直接复制粘贴源码')).toBe(true)
    expect(report.includes('只吸收产品/架构模式')).toBe(true)
    expect(report.includes('data-viewer-ui-panel')).toBe(true)
    expect(report.includes('实体面板偏好持久化')).toBe(true)
    expect(report.includes('搜索时扁平结果模式')).toBe(true)
  })

  test('viewer chrome marks UI overlays so scene picking can ignore panel-origin events', () => {
    const page = readFileSync(
      join(process.cwd(), 'components/digital-twin/DigitalTwinViewerPage.tsx'),
      'utf8'
    )
    const toolbar = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/Toolbar.tsx'),
      'utf8'
    )
    const picking = readFileSync(
      join(process.cwd(), 'components/digital-twin/scene/ScenePicking.tsx'),
      'utf8'
    )

    expect(toolbar.includes('data-viewer-ui-panel="top-toolbar"')).toBe(true)
    expect(page.includes('data-viewer-ui-panel="panel-launcher"')).toBe(true)
    expect(page.includes('viewer-panel-launcher__status-pill')).toBe(true)
    expect(page.includes("rightPanelOpen ? 'right-[336px]' : 'right-4'")).toBe(true)
    expect(page.includes('data-viewer-ui-panel="left-entity-panel"')).toBe(true)
    expect(page.includes('data-viewer-ui-panel="right-detail-panel"')).toBe(true)
    expect(page.includes('data-viewer-ui-panel="bottom-panel-dock"')).toBe(true)
    expect(picking.includes('isViewerUiPanelEventTarget')).toBe(true)
    expect(picking.includes("closest('[data-viewer-ui-panel]')")).toBe(true)
    expect(picking.includes('isViewerUiPanelPointerEvent(event)')).toBe(true)
  })

  test('entity list keeps hierarchy-like UI preferences across reloads', () => {
    const entityList = readFileSync(
      join(process.cwd(), 'components/digital-twin/panels/EntityListPanel.tsx'),
      'utf8'
    )

    expect(entityList.includes('ENTITY_LIST_EXPANDED_STORAGE_KEY')).toBe(true)
    expect(entityList.includes('data-t.viewer.entityList.expandedSections')).toBe(true)
    expect(entityList.includes('ENTITY_LIST_FILTER_DRAWER_STORAGE_KEY')).toBe(true)
    expect(entityList.includes('readStoredExpandedSections')).toBe(true)
    expect(entityList.includes('readStoredFilterDrawerOpen')).toBe(true)
    expect(entityList.includes('persistEntityListPreference')).toBe(true)
    expect(entityList.includes('window.localStorage.setItem')).toBe(true)
    expect(entityList.includes('try {')).toBe(true)
    expect(entityList.includes('isFlatSearchMode')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-flat-results-header')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-type-filter-strip')).toBe(true)
    expect(entityList.includes('viewer-admin-entity-type-filter-chip')).toBe(true)
    expect(entityList.includes('showOnlyEntityType')).toBe(true)
  })
})
