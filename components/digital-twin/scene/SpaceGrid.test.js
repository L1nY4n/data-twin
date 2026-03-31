import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('SpaceGrid font loading safety', () => {
  test('does not reference missing local font files under /public/fonts', () => {
    const sourcePath = join(process.cwd(), 'components/digital-twin/scene/SpaceGrid.tsx')
    const source = readFileSync(sourcePath, 'utf8')

    expect(source.includes('font="/fonts/')).toBe(false)
  })
})
