import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('theme setup', () => {
  test('layout should use ThemeProvider and should not force dark class', () => {
    const layoutPath = join(process.cwd(), 'app/layout.tsx')
    const source = readFileSync(layoutPath, 'utf8')

    expect(source.includes('ThemeProvider')).toBe(true)
    expect(source.includes('suppressHydrationWarning')).toBe(true)
    expect(source.includes('className="dark"')).toBe(false)
  })

  test('toolbar should include theme toggle via the local theme provider', () => {
    const toolbarPath = join(
      process.cwd(),
      'components/digital-twin/panels/Toolbar.tsx'
    )
    const source = readFileSync(toolbarPath, 'utf8')

    expect(source.includes("from '@/components/theme-provider'")).toBe(true)
    expect(source.includes("from 'next-themes'")).toBe(false)
    expect(source.includes('setTheme(')).toBe(true)
  })
})
