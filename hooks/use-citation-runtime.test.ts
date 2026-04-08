import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('citation runtime guards', () => {
  test('only emits synthetic incidents while the mock runtime is active', () => {
    const source = readFileSync(join(process.cwd(), 'hooks/use-citation-runtime.ts'), 'utf8')

    expect(source).toMatch(/snapshot\.runtimeDataSource\s*!==\s*'mock'/)
    expect(source).toMatch(/engineStateRef\.current\s*=\s*createCitationRuntimeState\(\)/)
  })
})
