import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ModulePageHost } from './module-page-host'

describe('ModulePageHost', () => {
  test('renders unresolved module page context for future extensions', () => {
    const html = renderToStaticMarkup(
      <ModulePageHost
        section="module:chem-inspection.tasks"
        workspaceId="workspace-1"
        workspaceSlug="plant-a"
      />
    )

    expect(html.includes('模块页面入口已预留')).toBe(true)
    expect(html.includes('module:chem-inspection.tasks')).toBe(true)
    expect(html.includes('workspace-1')).toBe(true)
    expect(html.includes('plant-a')).toBe(true)
  })
})
