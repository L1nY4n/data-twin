import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('rules panel dock layout', () => {
  test('renders rules panel as right dock inside canvas container', () => {
    const pagePath = join(process.cwd(), 'components/digital-twin/DigitalTwinViewerPage.tsx')
    const source = readFileSync(pagePath, 'utf8')

    expect(source.includes('absolute inset-y-2 right-2 z-20')).toBe(true)
    expect(source.includes("bottomPanelOpen ? 'w-[460px]' : 'w-0'")).toBe(true)
    expect(source.includes("rightPanelOpen ? 'right-[328px]' : 'right-2'")).toBe(true)
  })

  test('does not reserve fixed bottom height for rules panel anymore', () => {
    const pagePath = join(process.cwd(), 'components/digital-twin/DigitalTwinViewerPage.tsx')
    const source = readFileSync(pagePath, 'utf8')

    expect(source.includes("bottomPanelOpen ? 'h-72' : 'h-0'")).toBe(false)
  })

  test('keeps left and right side panels at fixed non-shrinking widths', () => {
    const pagePath = join(process.cwd(), 'components/digital-twin/DigitalTwinViewerPage.tsx')
    const source = readFileSync(pagePath, 'utf8')

    expect(source.includes('ViewerAdminEdgePanel')).toBe(true)
    expect(source.includes("leftPanelOpen ? 'w-[300px]' : 'w-0'")).toBe(true)
    expect(source.includes("rightPanelOpen ? 'w-[320px]' : 'w-0'")).toBe(true)
    expect(source.includes("leftPanelOpen ? 'left-[296px]' : 'left-4'")).toBe(true)
    expect(source.includes("rightPanelOpen ? 'right-[316px]' : 'right-4'")).toBe(true)
  })

  test('keeps incident video dialog in the page shell without the old mock citation hook', () => {
    const pagePath = join(process.cwd(), 'components/digital-twin/DigitalTwinViewerPage.tsx')
    const source = readFileSync(pagePath, 'utf8')

    expect(source.includes('useCitationRuntime()')).toBe(false)
    expect(source.includes('<IncidentVideoDialog />')).toBe(true)
  })
})
