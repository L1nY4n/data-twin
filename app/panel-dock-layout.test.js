import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('rules panel dock layout', () => {
  test('renders rules panel as right dock inside canvas container', () => {
    const pagePath = join(process.cwd(), 'app/page.tsx')
    const source = readFileSync(pagePath, 'utf8')

    expect(source.includes('absolute inset-y-2 right-2 z-20')).toBe(true)
    expect(source.includes("bottomPanelOpen ? 'w-[420px]' : 'w-0'")).toBe(true)
  })

  test('does not reserve fixed bottom height for rules panel anymore', () => {
    const pagePath = join(process.cwd(), 'app/page.tsx')
    const source = readFileSync(pagePath, 'utf8')

    expect(source.includes("bottomPanelOpen ? 'h-72' : 'h-0'")).toBe(false)
  })
})
