import type { AdminSection, BuiltInAdminSection } from './admin'
import type { Alarm } from './types'

export type PlatformModuleKind = 'presentational' | 'domain' | 'infrastructure'

export type PlatformIconKey =
  | 'layout-dashboard'
  | 'boxes'
  | 'scan-search'
  | 'radio-tower'
  | 'clipboard-list'
  | 'git-branch'
  | 'bell'
  | 'alert-triangle'

export interface PlatformModuleManifest {
  key: string
  name: string
  version: string
  kind: PlatformModuleKind
  description?: string
  owner?: string
  dependencies?: string[]
  schemaRegistrations?: string[]
  eventTypes?: string[]
  routes?: string[]
  permissions?: string[]
}

export interface AdminPageRegistration {
  section: BuiltInAdminSection
  moduleKey: string
  title: string
  shortTitle: string
  navGroup: string
  href: `/admin/${string}`
  iconKey: PlatformIconKey
  showInNav?: boolean
}

export interface EventTypeRegistration {
  eventType: string
  moduleKey: string
  displayName: string
  defaultSeverity?: Alarm['level']
  supportsVideo?: boolean
  supportsTimeline?: boolean
}

export const BUILT_IN_PLATFORM_MODULES: PlatformModuleManifest[] = [
  {
    key: 'workspace-admin',
    name: 'Workspace Administration',
    version: '1.0.0',
    kind: 'infrastructure',
    description: 'Workspace bootstrap, overview, and scene management surfaces.',
    routes: ['overview', 'workspaces', 'scene'],
    permissions: ['workspace:read', 'workspace:write'],
  },
  {
    key: 'entity-catalog',
    name: 'Entity Catalog',
    version: '1.0.0',
    kind: 'domain',
    description: 'Entity, archetype, and schema-oriented modeling surfaces.',
    schemaRegistrations: ['platform.entity-category', 'platform.entity-archetype'],
    routes: ['entities', 'archetypes'],
    permissions: ['entity:read', 'entity:write'],
  },
  {
    key: 'runtime-integration',
    name: 'Runtime Integration',
    version: '1.0.0',
    kind: 'infrastructure',
    description: 'Connectors, bindings, and runtime automation entry points.',
    routes: ['connectors', 'bindings', 'rules'],
    permissions: ['connector:read', 'connector:write', 'rule:write'],
  },
  {
    key: 'governance-center',
    name: 'Governance Center',
    version: '1.0.0',
    kind: 'domain',
    description: 'Alarm, event, and audit surfaces shared across vertical domains.',
    eventTypes: ['near_miss', 'zone_intrusion', 'overspeed'],
    routes: ['alarms', 'audit'],
    permissions: ['alarm:read', 'audit:read'],
  },
]

export const BUILT_IN_ADMIN_PAGE_REGISTRATIONS: AdminPageRegistration[] = [
  {
    section: 'overview',
    moduleKey: 'workspace-admin',
    title: '总览',
    shortTitle: 'Overview',
    navGroup: '总览',
    href: '/admin/overview',
    iconKey: 'layout-dashboard',
  },
  {
    section: 'workspaces',
    moduleKey: 'workspace-admin',
    title: '工作区',
    shortTitle: 'Workspaces',
    navGroup: '总览',
    href: '/admin/workspaces',
    iconKey: 'layout-dashboard',
  },
  {
    section: 'scene',
    moduleKey: 'workspace-admin',
    title: '3D 场景编辑',
    shortTitle: 'Scene',
    navGroup: '配置建模',
    href: '/admin/scene',
    iconKey: 'boxes',
    showInNav: false,
  },
  {
    section: 'entities',
    moduleKey: 'entity-catalog',
    title: '实体管理',
    shortTitle: 'Entities',
    navGroup: '配置建模',
    href: '/admin/entities',
    iconKey: 'scan-search',
  },
  {
    section: 'archetypes',
    moduleKey: 'entity-catalog',
    title: '原型管理',
    shortTitle: 'Archetypes',
    navGroup: '配置建模',
    href: '/admin/archetypes',
    iconKey: 'boxes',
  },
  {
    section: 'connectors',
    moduleKey: 'runtime-integration',
    title: '数据源连接器',
    shortTitle: 'Connectors',
    navGroup: '接入与自动化',
    href: '/admin/connectors',
    iconKey: 'radio-tower',
  },
  {
    section: 'bindings',
    moduleKey: 'runtime-integration',
    title: '实体绑定',
    shortTitle: 'Bindings',
    navGroup: '接入与自动化',
    href: '/admin/bindings',
    iconKey: 'clipboard-list',
  },
  {
    section: 'rules',
    moduleKey: 'runtime-integration',
    title: '规则引擎',
    shortTitle: 'Rules',
    navGroup: '接入与自动化',
    href: '/admin/rules',
    iconKey: 'git-branch',
  },
  {
    section: 'alarms',
    moduleKey: 'governance-center',
    title: '告警中心',
    shortTitle: 'Alarms',
    navGroup: '治理',
    href: '/admin/alarms',
    iconKey: 'bell',
  },
  {
    section: 'audit',
    moduleKey: 'governance-center',
    title: '审计日志',
    shortTitle: 'Audit',
    navGroup: '治理',
    href: '/admin/audit',
    iconKey: 'alert-triangle',
  },
]

export const BUILT_IN_EVENT_TYPE_REGISTRATIONS: EventTypeRegistration[] = [
  {
    eventType: 'near_miss',
    moduleKey: 'governance-center',
    displayName: '险情接近',
    defaultSeverity: 'warning',
    supportsTimeline: true,
    supportsVideo: true,
  },
  {
    eventType: 'zone_intrusion',
    moduleKey: 'governance-center',
    displayName: '区域入侵',
    defaultSeverity: 'error',
    supportsTimeline: true,
    supportsVideo: true,
  },
  {
    eventType: 'overspeed',
    moduleKey: 'governance-center',
    displayName: '超速告警',
    defaultSeverity: 'warning',
    supportsTimeline: true,
  },
]

export function getBuiltInAdminPageRegistration(
  section: string
): AdminPageRegistration | null {
  return BUILT_IN_ADMIN_PAGE_REGISTRATIONS.find((registration) => registration.section === section) ?? null
}

export function hasBuiltInAdminPageRegistration(
  section: string
): section is AdminSection {
  return getBuiltInAdminPageRegistration(section) != null
}

export function getBuiltInPlatformModuleManifest(
  moduleKey: string
): PlatformModuleManifest | null {
  return BUILT_IN_PLATFORM_MODULES.find((manifest) => manifest.key === moduleKey) ?? null
}

export function getBuiltInEventTypeRegistration(
  eventType: string
): EventTypeRegistration | null {
  return BUILT_IN_EVENT_TYPE_REGISTRATIONS.find((registration) => registration.eventType === eventType) ?? null
}

export function resolveRuntimeEventType(input: {
  eventType?: string | null
  kind?: string | null
}) {
  return input.eventType?.trim() || input.kind?.trim() || null
}
