import { generateId } from './mock-data'
import type {
  ArchetypeCapabilities,
  EntityArchetype,
  EntityCategory,
  DataConnector,
  Entity,
  EntityBinding,
  RuleConfig,
  SceneConfig,
  StaticAssetInstance,
  WorkspaceRecord,
} from './types'

function cloneAdminValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function formatAdminJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2) ?? ''
}

export function parseAdminJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

export function cloneSceneDraft(scene: SceneConfig): SceneConfig {
  return cloneAdminValue(scene)
}

export function cloneEntityDraft(entity: Entity): Entity {
  return cloneAdminValue(entity)
}

export function cloneStaticAssetDraft(staticAsset: StaticAssetInstance): StaticAssetInstance {
  return cloneAdminValue(staticAsset)
}

export function cloneConnectorDraft(connector: DataConnector): DataConnector {
  return cloneAdminValue(connector)
}

export function cloneEntityCategoryDraft(category: EntityCategory): EntityCategory {
  return cloneAdminValue(category)
}

export function cloneEntityArchetypeDraft(archetype: EntityArchetype): EntityArchetype {
  return cloneAdminValue(archetype)
}

export function cloneWorkspaceDraft(workspace: WorkspaceRecord): WorkspaceRecord {
  return cloneAdminValue(workspace)
}

export function cloneBindingsDraft(bindings: EntityBinding[]): EntityBinding[] {
  return cloneAdminValue(bindings)
}

export function cloneRuleDraft(rule: RuleConfig): RuleConfig {
  return cloneAdminValue(rule)
}

export function createEntityTemplate(type: Entity['type'] = 'person'): Entity {
  const now = Date.now()
  const base = {
    id: generateId(),
    name: '新建实体',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    status: 'active' as const,
    visible: true,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  }

  switch (type) {
    case 'person':
      return {
        ...base,
        type: 'person',
        role: '操作员',
        department: '生产部',
        schedule: [],
      }
    case 'vehicle':
      return {
        ...base,
        type: 'vehicle',
        plateNumber: `TEST-${Math.floor(Math.random() * 1000)}`,
        vehicleType: 'forklift',
        speed: 0,
        heading: 0,
      }
    case 'equipment':
      return {
        ...base,
        type: 'equipment',
        modelId: '',
        parameters: {},
        alarms: [],
      }
    case 'sensor':
      return {
        ...base,
        type: 'sensor',
        sensorType: 'temperature',
        unit: '°C',
        reading: 25,
        thresholdMin: 0,
        thresholdMax: 60,
      }
    case 'camera':
      return {
        ...base,
        type: 'camera',
        cameraType: 'fixed',
        streamUrl: '',
        fov: 75,
        heading: 0,
        range: 25,
        recording: true,
      }
    case 'zone':
      return {
        ...base,
        type: 'zone',
        boundary: [
          { x: -5, y: 0, z: -5 },
          { x: 5, y: 0, z: -5 },
          { x: 5, y: 0, z: 5 },
          { x: -5, y: 0, z: 5 },
        ],
        zoneType: 'work',
        color: '#22c55e',
        accessRules: [],
      }
    case 'dynamic':
      return {
        ...base,
        type: 'dynamic',
        archetypeId: '',
        categoryKey: '',
        attributes: {},
        displayAttributes: {},
      }
  }
}

export function createDynamicEntityTemplate(archetype: EntityArchetype): Entity {
  const now = Date.now()
  return {
    id: generateId(),
    type: 'dynamic',
    name: archetype.displayName,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    status: 'active',
    visible: true,
    metadata: {
      archetypeDisplayName: archetype.displayName,
    },
    createdAt: now,
    updatedAt: now,
    archetypeId: archetype.id,
    categoryKey: archetype.categoryKey,
    attributes: {
      archetypeKey: archetype.key,
    },
    displayAttributes: {
      archetype: archetype.displayName,
      category: archetype.categoryKey,
    },
  }
}

export function createConnectorTemplate(): DataConnector {
  const now = Date.now()
  return {
    id: generateId(),
    name: '新建连接器',
    protocol: 'opcua',
    endpoint: 'opc.tcp://127.0.0.1:4840',
    authConfig: {},
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }
}

export function createBindingTemplate(entityId: string, connectorId = ''): EntityBinding {
  const now = Date.now()
  return {
    bindingId: generateId(),
    entityId,
    connectorId,
    sourcePath: '',
    mapping: {},
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }
}

export function createRuleTemplate(): RuleConfig {
  const now = Date.now()
  return {
    id: generateId(),
    name: '新建规则',
    description: '',
    enabled: true,
    version: 1,
    nodes: [],
    edges: [],
    createdAt: now,
    updatedAt: now,
  }
}

function createDefaultArchetypeCapabilities(): ArchetypeCapabilities {
  return {
    hasModel: false,
    movable: false,
    bindable: true,
    statusBearing: true,
    detailFieldsVisible: true,
  }
}

export function createEntityCategoryTemplate(): EntityCategory {
  const now = Date.now()
  return {
    id: generateId(),
    key: 'new-category',
    displayName: '新实体大类',
    description: '',
    icon: 'Boxes',
    color: '#38bdf8',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export function createWorkspaceTemplate(): WorkspaceRecord {
  const now = Date.now()
  const id = generateId()
  return {
    id,
    slug: `workspace-${id.slice(-6)}`,
    name: '新工作区',
    description: '',
    isHomepage: false,
    createdAt: now,
    updatedAt: now,
  }
}

export function createEntityArchetypeTemplate(
  category?: EntityCategory | null
): EntityArchetype {
  const now = Date.now()
  return {
    id: generateId(),
    key: 'new-archetype',
    categoryId: category?.id ?? '',
    categoryKey: category?.key ?? '',
    displayName: '新实体原型',
    description: '',
    capabilities: createDefaultArchetypeCapabilities(),
    metadata: {},
    createdAt: now,
    updatedAt: now,
  }
}
