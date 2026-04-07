import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('toolchain guards', () => {
  test('default frontend scripts should use turbopack-backed next commands', () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8')
    )

    expect(packageJson.scripts.dev).toContain('--turbopack')
    expect(packageJson.scripts['dev:frontend']).toContain('--turbopack')
    expect(packageJson.scripts.build).toContain('--turbopack')
  })

  test('next config should use a shared workspace-aware root for tracing and turbopack', () => {
    const source = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8')

    expect(
      source.includes("const NEXT_PACKAGE_PATH = path.join('node_modules', 'next', 'package.json')")
    ).toBe(true)
    expect(source.includes('const turbopackRoot = resolveTurbopackRoot(projectRoot)')).toBe(true)
    expect(source.includes('outputFileTracingRoot: turbopackRoot')).toBe(true)
    expect(source.includes('turbopack:')).toBe(true)
    expect(source.includes('root: turbopackRoot')).toBe(true)
  })
})
