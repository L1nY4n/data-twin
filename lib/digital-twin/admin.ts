import type {
  Alarm,
  DataConnector,
  Entity,
  EntityBinding,
  RuleConfig,
  SceneConfig,
  WorkspaceRecord,
} from './types'

export type BuiltInAdminSection =
  | 'overview'
  | 'workspaces'
  | 'scene'
  | 'entities'
  | 'archetypes'
  | 'connectors'
  | 'bindings'
  | 'rules'
  | 'alarms'
  | 'audit'

export type AdminSection = BuiltInAdminSection | `module:${string}`

export interface AdminNavItem {
  title: string
  href: `/admin/${string}`
  section: AdminSection
}

export interface AdminNavGroup {
  title: string
  items: AdminNavItem[]
}

export const ADMIN_SECTIONS: BuiltInAdminSection[] = [
  'overview',
  'workspaces',
  'scene',
  'entities',
  'archetypes',
  'connectors',
  'bindings',
  'rules',
  'alarms',
  'audit',
]

export function isBuiltInAdminSection(value: string): value is BuiltInAdminSection {
  return ADMIN_SECTIONS.includes(value as BuiltInAdminSection)
}

export interface AdminOverview {
  sceneVersion: number
  entityCount: number
  ruleCount: number
  connectorCount: number
  bindingCount: number
  unacknowledgedAlarmCount: number
  recentChangeAt?: number | null
}

export type PublishState = 'published' | 'saved-unpublished' | 'publishing' | 'failed'

export interface PublishStatus {
  status: PublishState
  currentSceneVersion: number
  publishedSceneVersion: number
  hasUnpublishedChanges: boolean
  activePublishStartedAt?: number | null
  activePublishHeartbeatAt?: number | null
  lastPublishedAt?: number | null
  lastPublishedVersion?: string | null
  lastError?: string | null
  publishedScene?: {
    packageUrl: string
    packageVersion: string
    sceneId: string
    generatedAt: string
    staticAssetManifestUrl: string
  } | null
  compilerSource: string
}

export interface AuditEventRecord {
  id: string
  actor: string
  action: string
  resourceType: string
  resourceId: string
  payload: unknown
  createdAt: number
}

export interface AdminSnapshot {
  scene: { sceneVersion: number; sceneConfig: SceneConfig }
  entities: Entity[]
  connectors: DataConnector[]
  rules: RuleConfig[]
}

export interface GovernanceSnapshot {
  overview: AdminOverview
  alarms: Alarm[]
  auditEvents: AuditEventRecord[]
}

export interface BindingEditorSnapshot {
  entities: Entity[]
  connectors: DataConnector[]
  bindings: EntityBinding[]
}

export interface WorkspaceSnapshot {
  workspaces: WorkspaceRecord[]
}
