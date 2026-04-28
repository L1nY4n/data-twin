import type {
  Alarm,
  ArchetypeModelAsset,
  DataConnector,
  Entity,
  EntityArchetype,
  EntityBinding,
  EntityCategory,
  PublishedSceneRuntimeDescriptor,
  RuleConfig,
  SceneConfig,
  StaticAssetInstance,
  WorkspaceRecord,
} from './types'
import type { EventTypeRegistration, PlatformModuleManifest } from './module-registry'
import {
  getAdminApiBaseUrl,
  getBackendHttpBaseUrl,
  getBootstrapUrl,
  getWorkspaceApiBaseUrl,
} from './backend-config'
import type { AuditEventRecord, AdminOverview, PublishStatus } from './admin'

export interface BootstrapPayload {
  siteId: string
  workspaceId: string
  workspaceSlug: string
  workspaceName: string
  sceneVersion: number
  sceneConfig: SceneConfig
  entities: Entity[]
  staticAssets: StaticAssetInstance[]
  entityCategories: EntityCategory[]
  entityArchetypes: EntityArchetype[]
  rules: RuleConfig[]
  alarms: Alarm[]
  moduleManifests?: PlatformModuleManifest[]
  eventTypeRegistry?: EventTypeRegistration[]
  publishedScene?: PublishedSceneRuntimeDescriptor | null
  issuedAt: number
}

interface SceneResponse {
  sceneVersion: number
  sceneConfig: SceneConfig
}

export type EditorSaveMode = 'create' | 'update'

export interface EditorEntitySaveRequest {
  mode: EditorSaveMode
  entity: Entity
}

export interface EditorStaticAssetSaveRequest {
  mode: EditorSaveMode
  staticAsset: StaticAssetInstance
}

export interface EditorSaveRequest {
  expectedSceneVersion: number
  sceneConfig?: SceneConfig
  entity?: EditorEntitySaveRequest
  staticAsset?: EditorStaticAssetSaveRequest
}

export interface EditorSaveResponse {
  sceneVersion: number
  sceneConfig: SceneConfig
  savedEntity?: Entity | null
  savedStaticAsset?: StaticAssetInstance | null
}

interface RuleValidationResponse {
  valid: boolean
  errors: string[]
}

export class AdminApiError extends Error {
  status: number
  payload: string
  details: AdminApiErrorDetails | null

  constructor(
    message: string,
    options: {
      status: number
      payload: string
    }
  ) {
    super(message)
    this.name = 'AdminApiError'
    this.status = options.status
    this.payload = options.payload
    this.details = parseAdminApiErrorPayload(options.payload)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export function isAdminApiError(error: unknown): error is AdminApiError {
  return error instanceof AdminApiError
}

export interface AdminApiErrorDetails {
  error?: string
  message?: string
  code?: string
  expectedSceneVersion?: number
  currentSceneVersion?: number
  recoveryAction?: string
}

function parseAdminApiErrorPayload(payload: string): AdminApiErrorDetails | null {
  const trimmed = payload.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>

    return {
      ...(typeof parsed.error === 'string' ? { error: parsed.error } : {}),
      ...(typeof parsed.message === 'string' ? { message: parsed.message } : {}),
      ...(typeof parsed.code === 'string' ? { code: parsed.code } : {}),
      ...(typeof parsed.expectedSceneVersion === 'number'
        ? { expectedSceneVersion: parsed.expectedSceneVersion }
        : {}),
      ...(typeof parsed.currentSceneVersion === 'number'
        ? { currentSceneVersion: parsed.currentSceneVersion }
        : {}),
      ...(typeof parsed.recoveryAction === 'string'
        ? { recoveryAction: parsed.recoveryAction }
        : {}),
    }
  } catch {
    return null
  }
}

function normalizeErrorPayload(payload: string) {
  const trimmed = payload.trim()
  if (!trimmed) return ''

  const parsed = parseAdminApiErrorPayload(payload)
  if (typeof parsed?.error === 'string') return parsed.error
  if (typeof parsed?.message === 'string') return parsed.message
  return trimmed
}

export function getAdminApiSceneVersionConflict(error: AdminApiError): {
  expectedSceneVersion: number
  currentSceneVersion: number
  recoveryAction?: string
} | null {
  if (error.details?.code !== 'scene_version_conflict') {
    return null
  }
  if (
    typeof error.details.expectedSceneVersion !== 'number' ||
    typeof error.details.currentSceneVersion !== 'number'
  ) {
    return null
  }

  return {
    expectedSceneVersion: error.details.expectedSceneVersion,
    currentSceneVersion: error.details.currentSceneVersion,
    recoveryAction: error.details.recoveryAction,
  }
}

function buildAdminApiErrorMessage(response: Response, payload: string) {
  const detail = normalizeErrorPayload(payload)
  if (!detail) {
    return `Request failed ${response.status}`
  }

  return `Request failed ${response.status}: ${detail}`
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const payload = await response.text()
    if (
      typeof window !== 'undefined' &&
      response.status === 401 &&
      payload.includes('frontend access is required')
    ) {
      window.location.assign(
        `/access?next=${encodeURIComponent(
          `${window.location.pathname}${window.location.search}`
        )}`
      )
    }
    throw new AdminApiError(buildAdminApiErrorMessage(response, payload), {
      status: response.status,
      payload,
    })
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function fetchBootstrap(workspaceId: string): Promise<BootstrapPayload> {
  return requestJson<BootstrapPayload>(getBootstrapUrl(workspaceId))
}

export async function fetchHomeWorkspace(): Promise<WorkspaceRecord> {
  return requestJson<WorkspaceRecord>(`${getBackendHttpBaseUrl()}/api/v1/site/home-workspace`)
}

export async function fetchWorkspaceById(workspaceId: string): Promise<WorkspaceRecord> {
  return requestJson<WorkspaceRecord>(`${getAdminApiBaseUrl()}/workspaces/${encodeURIComponent(workspaceId)}`)
}

export async function fetchWorkspaceBySlug(slug: string): Promise<WorkspaceRecord> {
  return requestJson<WorkspaceRecord>(`${getBackendHttpBaseUrl()}/api/v1/workspaces/by-slug/${encodeURIComponent(slug)}`)
}

export async function fetchEditorBootstrap(workspaceId: string): Promise<BootstrapPayload> {
  return requestJson<BootstrapPayload>(`${getWorkspaceApiBaseUrl(workspaceId)}/editor/bootstrap`)
}

export async function fetchAdminScene(workspaceId?: string): Promise<SceneResponse> {
  return requestJson<SceneResponse>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/scene`
      : `${getAdminApiBaseUrl()}/scene`
  )
}

export async function fetchAdminOverview(workspaceId?: string): Promise<AdminOverview> {
  return requestJson<AdminOverview>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/admin/overview`
      : `${getAdminApiBaseUrl()}/overview`
  )
}

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  return requestJson<WorkspaceRecord[]>(`${getAdminApiBaseUrl()}/workspaces`)
}

export async function createWorkspace(
  workspace: WorkspaceRecord
): Promise<WorkspaceRecord> {
  return requestJson<WorkspaceRecord>(`${getAdminApiBaseUrl()}/workspaces`, {
    method: 'POST',
    body: JSON.stringify(workspace),
  })
}

export async function updateWorkspace(
  id: string,
  workspace: WorkspaceRecord
): Promise<WorkspaceRecord> {
  return requestJson<WorkspaceRecord>(`${getAdminApiBaseUrl()}/workspaces/${id}`, {
    method: 'PUT',
    body: JSON.stringify(workspace),
  })
}

export async function deleteWorkspace(id: string): Promise<void> {
  await requestJson<void>(`${getAdminApiBaseUrl()}/workspaces/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchAdminPublishStatus(workspaceId?: string): Promise<PublishStatus> {
  return requestJson<PublishStatus>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/publish`
      : `${getAdminApiBaseUrl()}/publish`
  )
}

export async function triggerAdminPublish(workspaceId?: string): Promise<PublishStatus> {
  return requestJson<PublishStatus>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/publish`
      : `${getAdminApiBaseUrl()}/publish`,
    {
    method: 'POST',
    }
  )
}

export async function updateAdminScene(
  workspaceIdOrSceneConfig: string | SceneConfig,
  sceneConfig?: SceneConfig
): Promise<SceneResponse> {
  const workspaceId =
    typeof workspaceIdOrSceneConfig === 'string' ? workspaceIdOrSceneConfig : undefined
  const payload =
    typeof workspaceIdOrSceneConfig === 'string'
      ? sceneConfig
      : workspaceIdOrSceneConfig

  if (!payload) {
    throw new Error('sceneConfig is required')
  }

  return requestJson<SceneResponse>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/scene`
      : `${getAdminApiBaseUrl()}/scene`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  )
}

export async function saveAdminEditorDrafts(
  workspaceIdOrRequest: string | EditorSaveRequest,
  request?: EditorSaveRequest
): Promise<EditorSaveResponse> {
  const workspaceId =
    typeof workspaceIdOrRequest === 'string' ? workspaceIdOrRequest : undefined
  const payload =
    typeof workspaceIdOrRequest === 'string' ? request : workspaceIdOrRequest

  if (!payload) {
    throw new Error('editor save request is required')
  }

  return requestJson<EditorSaveResponse>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/editor-save`
      : `${getAdminApiBaseUrl()}/editor-save`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
}

export async function listAdminEntities(workspaceId?: string): Promise<Entity[]> {
  return requestJson<Entity[]>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/entities`
      : `${getAdminApiBaseUrl()}/entities`
  )
}

export async function listAdminStaticAssets(workspaceId?: string): Promise<StaticAssetInstance[]> {
  return requestJson<StaticAssetInstance[]>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/static-assets`
      : `${getAdminApiBaseUrl()}/static-assets`
  )
}

export async function createAdminEntity(
  workspaceIdOrEntity: string | Entity,
  entity?: Entity
): Promise<Entity> {
  const workspaceId =
    typeof workspaceIdOrEntity === 'string' ? workspaceIdOrEntity : undefined
  const payload =
    typeof workspaceIdOrEntity === 'string' ? entity : workspaceIdOrEntity

  if (!payload) {
    throw new Error('entity payload is required')
  }

  return requestJson<Entity>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/entities`
      : `${getAdminApiBaseUrl()}/entities`,
    {
    method: 'POST',
    body: JSON.stringify(payload),
    }
  )
}

export async function listEntityCategories(): Promise<EntityCategory[]> {
  return requestJson<EntityCategory[]>(`${getAdminApiBaseUrl()}/entity-categories`)
}

export async function createEntityCategory(
  category: EntityCategory
): Promise<EntityCategory> {
  return requestJson<EntityCategory>(`${getAdminApiBaseUrl()}/entity-categories`, {
    method: 'POST',
    body: JSON.stringify(category),
  })
}

export async function updateEntityCategory(
  id: string,
  category: EntityCategory
): Promise<EntityCategory> {
  return requestJson<EntityCategory>(`${getAdminApiBaseUrl()}/entity-categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(category),
  })
}

export async function deleteEntityCategory(id: string): Promise<void> {
  await requestJson<void>(`${getAdminApiBaseUrl()}/entity-categories/${id}`, {
    method: 'DELETE',
  })
}

export async function listEntityArchetypes(): Promise<EntityArchetype[]> {
  return requestJson<EntityArchetype[]>(`${getAdminApiBaseUrl()}/entity-archetypes`)
}

export async function createEntityArchetype(
  archetype: EntityArchetype
): Promise<EntityArchetype> {
  return requestJson<EntityArchetype>(`${getAdminApiBaseUrl()}/entity-archetypes`, {
    method: 'POST',
    body: JSON.stringify(archetype),
  })
}

export async function updateEntityArchetype(
  id: string,
  archetype: EntityArchetype
): Promise<EntityArchetype> {
  return requestJson<EntityArchetype>(`${getAdminApiBaseUrl()}/entity-archetypes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(archetype),
  })
}

export async function deleteEntityArchetype(id: string): Promise<void> {
  await requestJson<void>(`${getAdminApiBaseUrl()}/entity-archetypes/${id}`, {
    method: 'DELETE',
  })
}

export async function uploadArchetypeModel(file: File): Promise<ArchetypeModelAsset> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${getAdminApiBaseUrl()}/model-assets/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const payload = await response.text()
    throw new AdminApiError(buildAdminApiErrorMessage(response, payload), {
      status: response.status,
      payload,
    })
  }

  return (await response.json()) as ArchetypeModelAsset
}

export async function createAdminStaticAsset(
  workspaceIdOrStaticAsset: string | StaticAssetInstance,
  staticAsset?: StaticAssetInstance
): Promise<StaticAssetInstance> {
  const workspaceId =
    typeof workspaceIdOrStaticAsset === 'string' ? workspaceIdOrStaticAsset : undefined
  const payload =
    typeof workspaceIdOrStaticAsset === 'string'
      ? staticAsset
      : workspaceIdOrStaticAsset

  if (!payload) {
    throw new Error('static asset payload is required')
  }

  return requestJson<StaticAssetInstance>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/static-assets`
      : `${getAdminApiBaseUrl()}/static-assets`,
    {
    method: 'POST',
    body: JSON.stringify(payload),
    }
  )
}

export async function updateAdminEntity(
  workspaceIdOrId: string,
  idOrEntity: string | Entity,
  entity?: Entity
): Promise<Entity> {
  const workspaceId = entity ? workspaceIdOrId : undefined
  const entityId = entity ? (idOrEntity as string) : workspaceIdOrId
  const payload = entity ?? (idOrEntity as Entity)

  return requestJson<Entity>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/entities/${entityId}`
      : `${getAdminApiBaseUrl()}/entities/${entityId}`,
    {
    method: 'PUT',
    body: JSON.stringify(payload),
    }
  )
}

export async function updateAdminStaticAsset(
  workspaceIdOrId: string,
  idOrStaticAsset: string | StaticAssetInstance,
  staticAsset?: StaticAssetInstance
): Promise<StaticAssetInstance> {
  const workspaceId = staticAsset ? workspaceIdOrId : undefined
  const assetId = staticAsset ? (idOrStaticAsset as string) : workspaceIdOrId
  const payload = staticAsset ?? (idOrStaticAsset as StaticAssetInstance)

  return requestJson<StaticAssetInstance>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/static-assets/${assetId}`
      : `${getAdminApiBaseUrl()}/static-assets/${assetId}`,
    {
    method: 'PUT',
    body: JSON.stringify(payload),
    }
  )
}

export async function deleteAdminEntity(
  workspaceIdOrId: string,
  id?: string
): Promise<void> {
  const workspaceId = id ? workspaceIdOrId : undefined
  const entityId = id ?? workspaceIdOrId
  await requestJson<void>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/entities/${entityId}`
      : `${getAdminApiBaseUrl()}/entities/${entityId}`,
    {
      method: 'DELETE',
    }
  )
}

export async function deleteAdminStaticAsset(
  workspaceIdOrId: string,
  id?: string
): Promise<void> {
  const workspaceId = id ? workspaceIdOrId : undefined
  const assetId = id ?? workspaceIdOrId
  await requestJson<void>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/static-assets/${assetId}`
      : `${getAdminApiBaseUrl()}/static-assets/${assetId}`,
    {
      method: 'DELETE',
    }
  )
}

export async function listDataConnectors(workspaceId?: string): Promise<DataConnector[]> {
  return requestJson<DataConnector[]>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/data-sources`
      : `${getAdminApiBaseUrl()}/data-sources`
  )
}

export async function listAdminAlarms(workspaceId?: string): Promise<Alarm[]> {
  return requestJson<Alarm[]>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/alarms`
      : `${getAdminApiBaseUrl()}/alarms`
  )
}

export async function listAdminAuditEvents(
  workspaceId?: string
): Promise<AuditEventRecord[]> {
  return requestJson<AuditEventRecord[]>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/audit`
      : `${getAdminApiBaseUrl()}/audit`
  )
}

export async function createDataConnector(
  workspaceIdOrConnector: string | DataConnector,
  connector?: DataConnector
): Promise<DataConnector> {
  const workspaceId =
    typeof workspaceIdOrConnector === 'string' ? workspaceIdOrConnector : undefined
  const payload =
    typeof workspaceIdOrConnector === 'string' ? connector : workspaceIdOrConnector

  if (!payload) {
    throw new Error('connector payload is required')
  }

  return requestJson<DataConnector>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/data-sources`
      : `${getAdminApiBaseUrl()}/data-sources`,
    {
    method: 'POST',
    body: JSON.stringify(payload),
    }
  )
}

export async function updateDataConnector(
  workspaceIdOrId: string,
  idOrConnector: string | DataConnector,
  connector?: DataConnector
): Promise<DataConnector> {
  const workspaceId = connector ? workspaceIdOrId : undefined
  const connectorId = connector ? (idOrConnector as string) : workspaceIdOrId
  const payload = connector ?? (idOrConnector as DataConnector)

  return requestJson<DataConnector>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/data-sources/${connectorId}`
      : `${getAdminApiBaseUrl()}/data-sources/${connectorId}`,
    {
    method: 'PUT',
    body: JSON.stringify(payload),
    }
  )
}

export async function deleteDataConnector(
  workspaceIdOrId: string,
  id?: string
): Promise<void> {
  const workspaceId = id ? workspaceIdOrId : undefined
  const connectorId = id ?? workspaceIdOrId
  await requestJson<void>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/data-sources/${connectorId}`
      : `${getAdminApiBaseUrl()}/data-sources/${connectorId}`,
    {
      method: 'DELETE',
    }
  )
}

export async function listEntityBindings(
  workspaceIdOrEntityId: string,
  entityId?: string
): Promise<EntityBinding[]> {
  const workspaceId = entityId ? workspaceIdOrEntityId : undefined
  const resolvedEntityId = entityId ?? workspaceIdOrEntityId
  return requestJson<EntityBinding[]>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/entities/${resolvedEntityId}/bindings`
      : `${getAdminApiBaseUrl()}/entities/${resolvedEntityId}/bindings`
  )
}

export async function replaceEntityBindings(
  workspaceIdOrEntityId: string,
  entityIdOrBindings: string | EntityBinding[],
  bindings?: EntityBinding[]
): Promise<EntityBinding[]> {
  const workspaceId = Array.isArray(entityIdOrBindings) ? undefined : workspaceIdOrEntityId
  const entityId = Array.isArray(entityIdOrBindings) ? workspaceIdOrEntityId : entityIdOrBindings
  const payload = Array.isArray(entityIdOrBindings) ? entityIdOrBindings : bindings

  if (!payload) {
    throw new Error('bindings payload is required')
  }

  return requestJson<EntityBinding[]>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/entities/${entityId}/bindings`
      : `${getAdminApiBaseUrl()}/entities/${entityId}/bindings`,
    {
    method: 'PUT',
    body: JSON.stringify({ bindings: payload }),
    }
  )
}

export async function listRules(workspaceId?: string): Promise<RuleConfig[]> {
  return requestJson<RuleConfig[]>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/rules`
      : `${getAdminApiBaseUrl()}/rules`
  )
}

export async function createRule(
  workspaceIdOrRule: string | RuleConfig,
  rule?: RuleConfig
): Promise<RuleConfig> {
  const workspaceId = typeof workspaceIdOrRule === 'string' ? workspaceIdOrRule : undefined
  const payload = typeof workspaceIdOrRule === 'string' ? rule : workspaceIdOrRule

  if (!payload) {
    throw new Error('rule payload is required')
  }

  return requestJson<RuleConfig>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/rules`
      : `${getAdminApiBaseUrl()}/rules`,
    {
    method: 'POST',
    body: JSON.stringify(payload),
    }
  )
}

export async function updateRule(
  workspaceIdOrId: string,
  idOrRule: string | RuleConfig,
  rule?: RuleConfig
): Promise<RuleConfig> {
  const workspaceId = rule ? workspaceIdOrId : undefined
  const ruleId = rule ? (idOrRule as string) : workspaceIdOrId
  const payload = rule ?? (idOrRule as RuleConfig)

  return requestJson<RuleConfig>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/rules/${ruleId}`
      : `${getAdminApiBaseUrl()}/rules/${ruleId}`,
    {
    method: 'PUT',
    body: JSON.stringify(payload),
    }
  )
}

export async function deleteRule(workspaceIdOrId: string, id?: string): Promise<void> {
  const workspaceId = id ? workspaceIdOrId : undefined
  const ruleId = id ?? workspaceIdOrId
  await requestJson<void>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/rules/${ruleId}`
      : `${getAdminApiBaseUrl()}/rules/${ruleId}`,
    {
      method: 'DELETE',
    }
  )
}

export async function validateRule(
  workspaceIdOrId: string,
  idOrRule?: string | RuleConfig,
  rule?: RuleConfig
): Promise<RuleValidationResponse> {
  const workspaceId =
    typeof idOrRule === 'string' && rule !== undefined ? workspaceIdOrId : undefined
  const ruleId =
    typeof idOrRule === 'string' && rule !== undefined
      ? idOrRule
      : workspaceIdOrId
  const payload =
    typeof idOrRule === 'string' && rule !== undefined
      ? rule
      : (idOrRule as RuleConfig | undefined)

  return requestJson<RuleValidationResponse>(
    workspaceId
      ? `${getWorkspaceApiBaseUrl(workspaceId)}/rules/${ruleId}/validate`
      : `${getAdminApiBaseUrl()}/rules/${ruleId}/validate`,
    {
      method: 'POST',
      body: payload ? JSON.stringify(payload) : undefined,
    }
  )
}
