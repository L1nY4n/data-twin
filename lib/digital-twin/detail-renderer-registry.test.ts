import { describe, expect, test } from 'bun:test'
import { createDetailRendererRegistry } from './detail-renderer-registry'

describe('detail renderer registry', () => {
  test('resolves registered renderers by target', () => {
    const registry = createDetailRendererRegistry<string, { label: string }>([
      {
        target: 'dynamic',
        moduleKey: 'entity-catalog',
        render: ({ label }: { label: string }) => label.toUpperCase(),
      },
    ])

    expect(registry.resolve('dynamic')?.moduleKey).toBe('entity-catalog')
    expect(registry.resolve('dynamic')?.render({ label: 'ok' })).toBe('OK')
    expect(registry.resolve('person')).toBeNull()
  })

  test('rejects duplicate targets', () => {
    expect(() =>
      createDetailRendererRegistry([
        { target: 'dynamic', moduleKey: 'a', render: () => null },
        { target: 'dynamic', moduleKey: 'b', render: () => null },
      ])
    ).toThrow('Duplicate detail renderer registration for dynamic')
  })
})
