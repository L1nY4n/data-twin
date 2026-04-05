import { generateId } from './mock-data'
import type {
  DataConnector,
  Entity,
  EntityBinding,
  RuleConfig,
  SceneConfig,
  StaticAssetInstance,
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
