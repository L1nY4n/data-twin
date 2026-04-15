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
import { getAdminApiBaseUrl, getBackendHttpBaseUrl, getBootstrapUrl } from './backend-config'
import type { AuditEventRecord, AdminOverview, PublishStatus } from './admin'

export interface BootstrapPayload {
  siteId: string
  sceneVersion: number
  sceneConfig: SceneConfig
  entities: Entity[]
  staticAssets: StaticAssetInstance[]
  entityCategories: EntityCategory[]
  entityArchetypes: EntityArchetype[]
  rules: RuleConfig[]
  alarms: Alarm[]
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

export async function fetchBootstrap(): Promise<BootstrapPayload> {
  return requestJson<BootstrapPayload>(getBootstrapUrl())
}

export async function fetchHomeWorkspace(): Promise<WorkspaceRecord> {
  return requestJson<WorkspaceRecord>(`${getBackendHttpBaseUrl()}/api/v1/site/home-workspace`)
}

export async function fetchEditorBootstrap(): Promise<BootstrapPayload> {
  return requestJson<BootstrapPayload>(`${getAdminApiBaseUrl()}/bootstrap`)
}

export async function fetchAdminScene(): Promise<SceneResponse> {
  return requestJson<SceneResponse>(`${getAdminApiBaseUrl()}/scene`)
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return requestJson<AdminOverview>(`${getAdminApiBaseUrl()}/overview`)
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

export async function fetchAdminPublishStatus(): Promise<PublishStatus> {
  return requestJson<PublishStatus>(`${getAdminApiBaseUrl()}/publish`)
}

export async function triggerAdminPublish(): Promise<PublishStatus> {
  return requestJson<PublishStatus>(`${getAdminApiBaseUrl()}/publish`, {
    method: 'POST',
  })
}

export async function updateAdminScene(sceneConfig: SceneConfig): Promise<SceneResponse> {
  return requestJson<SceneResponse>(`${getAdminApiBaseUrl()}/scene`, {
    method: 'PUT',
    body: JSON.stringify(sceneConfig),
  })
}

export async function saveAdminEditorDrafts(
  request: EditorSaveRequest
): Promise<EditorSaveResponse> {
  return requestJson<EditorSaveResponse>(`${getAdminApiBaseUrl()}/editor-save`, {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export async function listAdminEntities(): Promise<Entity[]> {
  return requestJson<Entity[]>(`${getAdminApiBaseUrl()}/entities`)
}

export async function listAdminStaticAssets(): Promise<StaticAssetInstance[]> {
  return requestJson<StaticAssetInstance[]>(`${getAdminApiBaseUrl()}/static-assets`)
}

export async function createAdminEntity(entity: Entity): Promise<Entity> {
  return requestJson<Entity>(`${getAdminApiBaseUrl()}/entities`, {
    method: 'POST',
    body: JSON.stringify(entity),
  })
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
  staticAsset: StaticAssetInstance
): Promise<StaticAssetInstance> {
  return requestJson<StaticAssetInstance>(`${getAdminApiBaseUrl()}/static-assets`, {
    method: 'POST',
    body: JSON.stringify(staticAsset),
  })
}

export async function updateAdminEntity(id: string, entity: Entity): Promise<Entity> {
  return requestJson<Entity>(`${getAdminApiBaseUrl()}/entities/${id}`, {
    method: 'PUT',
    body: JSON.stringify(entity),
  })
}

export async function updateAdminStaticAsset(
  id: string,
  staticAsset: StaticAssetInstance
): Promise<StaticAssetInstance> {
  return requestJson<StaticAssetInstance>(`${getAdminApiBaseUrl()}/static-assets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(staticAsset),
  })
}

export async function deleteAdminEntity(id: string): Promise<void> {
  await requestJson<void>(`${getAdminApiBaseUrl()}/entities/${id}`, {
    method: 'DELETE',
  })
}

export async function deleteAdminStaticAsset(id: string): Promise<void> {
  await requestJson<void>(`${getAdminApiBaseUrl()}/static-assets/${id}`, {
    method: 'DELETE',
  })
}

export async function listDataConnectors(): Promise<DataConnector[]> {
  return requestJson<DataConnector[]>(`${getAdminApiBaseUrl()}/data-sources`)
}

export async function listAdminAlarms(): Promise<Alarm[]> {
  return requestJson<Alarm[]>(`${getAdminApiBaseUrl()}/alarms`)
}

export async function listAdminAuditEvents(): Promise<AuditEventRecord[]> {
  return requestJson<AuditEventRecord[]>(`${getAdminApiBaseUrl()}/audit`)
}

export async function createDataConnector(connector: DataConnector): Promise<DataConnector> {
  return requestJson<DataConnector>(`${getAdminApiBaseUrl()}/data-sources`, {
    method: 'POST',
    body: JSON.stringify(connector),
  })
}

export async function updateDataConnector(
  id: string,
  connector: DataConnector
): Promise<DataConnector> {
  return requestJson<DataConnector>(`${getAdminApiBaseUrl()}/data-sources/${id}`, {
    method: 'PUT',
    body: JSON.stringify(connector),
  })
}

export async function deleteDataConnector(id: string): Promise<void> {
  await requestJson<void>(`${getAdminApiBaseUrl()}/data-sources/${id}`, {
    method: 'DELETE',
  })
}

export async function listEntityBindings(entityId: string): Promise<EntityBinding[]> {
  return requestJson<EntityBinding[]>(`${getAdminApiBaseUrl()}/entities/${entityId}/bindings`)
}

export async function replaceEntityBindings(
  entityId: string,
  bindings: EntityBinding[]
): Promise<EntityBinding[]> {
  return requestJson<EntityBinding[]>(`${getAdminApiBaseUrl()}/entities/${entityId}/bindings`, {
    method: 'PUT',
    body: JSON.stringify({ bindings }),
  })
}

export async function listRules(): Promise<RuleConfig[]> {
  return requestJson<RuleConfig[]>(`${getAdminApiBaseUrl()}/rules`)
}

export async function createRule(rule: RuleConfig): Promise<RuleConfig> {
  return requestJson<RuleConfig>(`${getAdminApiBaseUrl()}/rules`, {
    method: 'POST',
    body: JSON.stringify(rule),
  })
}

export async function updateRule(id: string, rule: RuleConfig): Promise<RuleConfig> {
  return requestJson<RuleConfig>(`${getAdminApiBaseUrl()}/rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(rule),
  })
}

export async function deleteRule(id: string): Promise<void> {
  await requestJson<void>(`${getAdminApiBaseUrl()}/rules/${id}`, {
    method: 'DELETE',
  })
}

export async function validateRule(
  id: string,
  rule?: RuleConfig
): Promise<RuleValidationResponse> {
  return requestJson<RuleValidationResponse>(`${getAdminApiBaseUrl()}/rules/${id}/validate`, {
    method: 'POST',
    body: rule ? JSON.stringify(rule) : undefined,
  })
}
