import { describe, expect, test } from 'bun:test'
import { buildEditorHref } from './editor-routing'

describe('editor route helper', () => {
  test('builds canonical workspace editor links even when returnTo is omitted', () => {
    expect(buildEditorHref('factory-demo-scene', undefined)).toBe(
      '/workspaces/factory-demo-scene/editor'
    )
    expect(buildEditorHref('factory-demo-scene', '/')).toBe(
      '/workspaces/factory-demo-scene/editor?returnTo=%2F'
    )
  })

  test('preserves the legacy single-argument editor entry semantics', () => {
    expect(buildEditorHref()).toBe('/editor')
    expect(buildEditorHref('/admin/workspaces')).toBe(
      '/editor?returnTo=%2Fadmin%2Fworkspaces'
    )
  })
})
