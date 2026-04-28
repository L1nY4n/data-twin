import { describe, expect, test } from 'bun:test'
import {
  BUILT_IN_ADMIN_PAGE_REGISTRATIONS,
  BUILT_IN_EVENT_TYPE_REGISTRATIONS,
  BUILT_IN_PLATFORM_MODULES,
  getBuiltInAdminPageRegistration,
  getBuiltInEventTypeRegistration,
  getBuiltInPlatformModuleManifest,
  resolveRuntimeEventType,
} from './module-registry'

describe('module registry', () => {
  test('ships stable built-in platform module manifests', () => {
    expect(BUILT_IN_PLATFORM_MODULES.length).toBeGreaterThanOrEqual(4)
    expect(getBuiltInPlatformModuleManifest('workspace-admin')?.kind).toBe('infrastructure')
    expect(getBuiltInPlatformModuleManifest('governance-center')?.eventTypes).toContain(
      'near_miss'
    )
  })

  test('indexes built-in admin pages and keeps scene out of nav by default', () => {
    expect(BUILT_IN_ADMIN_PAGE_REGISTRATIONS.some((entry) => entry.section === 'overview')).toBe(
      true
    )
    expect(getBuiltInAdminPageRegistration('scene')?.showInNav).toBe(false)
    expect(getBuiltInAdminPageRegistration('rules')?.moduleKey).toBe('runtime-integration')
  })

  test('resolves built-in event type registrations and legacy kind fallback', () => {
    expect(BUILT_IN_EVENT_TYPE_REGISTRATIONS).toHaveLength(3)
    expect(getBuiltInEventTypeRegistration('zone_intrusion')?.displayName).toBe('区域入侵')
    expect(resolveRuntimeEventType({ eventType: 'custom.domain.event', kind: 'near_miss' })).toBe(
      'custom.domain.event'
    )
    expect(resolveRuntimeEventType({ kind: 'near_miss' })).toBe('near_miss')
  })
})
