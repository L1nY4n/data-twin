import type { Entity } from './types'
import {
  extractDigitalTwinMetadata,
  type DigitalTwinSemanticMetadata,
  type DigitalTwinSignalBinding,
} from './model-metadata'
import {
  createDigitalTwinSignalStore,
  type SignalDescriptor,
  type SignalQuality,
  type SignalSnapshot,
  type SignalValue,
} from './signal-store'

export type EntitySignalSource = 'metadata' | 'runtime' | 'status'

export interface EntitySignalSnapshot extends SignalSnapshot {
  entityId: string
  source: EntitySignalSource
}

export interface EntitySignalTelemetrySummary {
  totalSignals: number
  degradedSignals: number
  writableSignals: number
  entityCountWithSignals: number
  lastUpdatedAt: number | null
}

export interface EntitySignalDirectoryEntry {
  id: string
  type: Entity['type']
  status: Entity['status']
  visible: boolean
  signalCount?: number
  degradedSignalCount?: number
  writableSignalCount?: number
  lastSignalUpdatedAt?: number | null
}

type NativeSignalDraft = {
  key: string
  label: string
  value: SignalValue
  unit?: string
  dataType?: string
  source?: EntitySignalSource
}

function normalizeSignalKey(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9:_./-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function signalQualityForEntity(entity: Entity): SignalQuality {
  switch (entity.status) {
    case 'error':
      return 'bad'
    case 'warning':
    case 'inactive':
      return 'uncertain'
    case 'active':
      return 'good'
  }
}

function descriptorId(entity: Entity, signalKey: string) {
  return `${entity.id}:${normalizeSignalKey(signalKey) || 'signal'}`
}

function toDescriptorFromMetadata(
  entity: Entity,
  signal: DigitalTwinSignalBinding,
  index: number
): SignalDescriptor {
  const signalKey = signal.id || signal.path || signal.name || `metadata-${index}`
  return {
    id: descriptorId(entity, signalKey),
    name: `${entity.id}.${signal.name || signalKey}`,
    path: signal.path || signal.name || signalKey,
    label: signal.label ?? signal.name,
    unit: signal.unit,
    dataType: signal.dataType,
    direction: signal.direction,
    writable: signal.writable,
    metadata: {
      entityId: entity.id,
      source: signal.source === 'runtime' || signal.source === 'status' ? signal.source : 'metadata',
      originalSignalId: signal.id,
      ...(signal.connectorId ? { connectorId: signal.connectorId } : {}),
    },
  }
}

function runtimeDescriptor(entity: Entity, draft: NativeSignalDraft): SignalDescriptor {
  return {
    id: descriptorId(entity, draft.key),
    name: `${entity.id}.${draft.key}`,
    path: `entity/${entity.id}/${draft.key}`,
    label: draft.label,
    unit: draft.unit,
    dataType: draft.dataType,
    direction: 'input',
    writable: false,
    metadata: {
      entityId: entity.id,
      source: draft.source ?? 'runtime',
    },
  }
}

function collectNativeSignalDrafts(entity: Entity): NativeSignalDraft[] {
  const drafts: NativeSignalDraft[] = [
    {
      key: 'status',
      label: '运行状态',
      value: entity.status,
      dataType: 'status',
      source: 'status',
    },
  ]

  switch (entity.type) {
    case 'sensor':
      drafts.push({
        key: 'reading',
        label: '实时读数',
        value: entity.reading,
        unit: entity.unit,
        dataType: 'number',
      })
      break
    case 'equipment':
      for (const [key, value] of Object.entries(entity.parameters)) {
        drafts.push({
          key: `parameter.${key}`,
          label: key,
          value,
          dataType: typeof value,
        })
      }
      break
    case 'vehicle':
      drafts.push({ key: 'speed', label: '速度', value: entity.speed, unit: 'm/s', dataType: 'number' })
      if (typeof entity.currentLoad === 'number') {
        drafts.push({ key: 'currentLoad', label: '载荷', value: entity.currentLoad, dataType: 'number' })
      }
      break
    case 'camera':
      drafts.push({ key: 'recording', label: '录像', value: entity.recording, dataType: 'boolean' })
      break
    case 'person':
      if (entity.currentActivity) {
        drafts.push({ key: 'currentActivity', label: '当前活动', value: entity.currentActivity, dataType: 'string' })
      }
      break
    case 'zone':
      if (typeof entity.currentOccupancy === 'number') {
        drafts.push({ key: 'currentOccupancy', label: '当前占用', value: entity.currentOccupancy, dataType: 'number' })
      }
      if (typeof entity.capacity === 'number') {
        drafts.push({ key: 'capacity', label: '容量', value: entity.capacity, dataType: 'number' })
      }
      break
    case 'dynamic': {
      const seen = new Set<string>()
      for (const [key, value] of [
        ...Object.entries(entity.displayAttributes),
        ...Object.entries(entity.attributes),
      ]) {
        if (seen.has(key)) continue
        seen.add(key)
        drafts.push({
          key: `attribute.${key}`,
          label: key,
          value,
          dataType: typeof value,
        })
      }
      break
    }
  }

  return drafts
}

function qualityFromSignal(signal: DigitalTwinSignalBinding, fallback: SignalQuality): SignalQuality {
  return signal.quality ?? fallback
}

function toEntitySignalSnapshot(snapshot: SignalSnapshot, entityId: string): EntitySignalSnapshot {
  const source = snapshot.descriptor.metadata?.source
  return {
    ...snapshot,
    entityId,
    source: source === 'metadata' || source === 'status' ? source : 'runtime',
  }
}

export function collectEntitySignalSnapshots(
  entity: Entity,
  metadata: DigitalTwinSemanticMetadata = extractDigitalTwinMetadata({ metadata: entity.metadata })
): EntitySignalSnapshot[] {
  const store = createDigitalTwinSignalStore()
  const fallbackQuality = signalQualityForEntity(entity)

  metadata.signals.forEach((signal, index) => {
    const descriptor = toDescriptorFromMetadata(entity, signal, index)
    store.registerDescriptor(descriptor, signal.value ?? null)
    store.updateSignal({
      id: descriptor.id,
      value: signal.value ?? null,
      timestamp: entity.updatedAt,
      quality: qualityFromSignal(signal, fallbackQuality),
    })
  })

  for (const draft of collectNativeSignalDrafts(entity)) {
    const descriptor = runtimeDescriptor(entity, draft)
    store.registerDescriptor(descriptor, draft.value)
    store.updateSignal({
      id: descriptor.id,
      value: draft.value,
      timestamp: entity.updatedAt,
      quality: fallbackQuality,
    })
  }

  return store.listSignals().map((snapshot) => toEntitySignalSnapshot(snapshot, entity.id))
}

export function summarizeEntitySignalTelemetry(entities: Iterable<Entity>): EntitySignalTelemetrySummary {
  let totalSignals = 0
  let degradedSignals = 0
  let writableSignals = 0
  let entityCountWithSignals = 0
  let lastUpdatedAt: number | null = null

  for (const entity of entities) {
    const signals = collectEntitySignalSnapshots(entity)
    if (signals.length > 0) entityCountWithSignals += 1
    totalSignals += signals.length
    for (const signal of signals) {
      if (signal.quality !== 'good') degradedSignals += 1
      if (signal.descriptor.writable) writableSignals += 1
      lastUpdatedAt = Math.max(lastUpdatedAt ?? 0, signal.timestamp)
    }
  }

  return {
    totalSignals,
    degradedSignals,
    writableSignals,
    entityCountWithSignals,
    lastUpdatedAt,
  }
}

function estimateSignalCountForDirectoryEntry(entry: EntitySignalDirectoryEntry) {
  switch (entry.type) {
    case 'sensor':
    case 'vehicle':
    case 'camera':
    case 'person':
      return 2
    case 'equipment':
    case 'dynamic':
    case 'zone':
      return 3
  }
}

export function summarizeEntityDirectorySignalTelemetry(
  entries: Iterable<EntitySignalDirectoryEntry>
): EntitySignalTelemetrySummary {
  let totalSignals = 0
  let degradedSignals = 0
  let writableSignals = 0
  let entityCountWithSignals = 0
  let lastUpdatedAt: number | null = null

  for (const entry of entries) {
    if (!entry.visible) continue
    const signalCount =
      typeof entry.signalCount === 'number'
        ? Math.max(0, entry.signalCount)
        : estimateSignalCountForDirectoryEntry(entry)
    totalSignals += signalCount
    entityCountWithSignals += 1
    degradedSignals +=
      typeof entry.degradedSignalCount === 'number'
        ? Math.max(0, entry.degradedSignalCount)
        : entry.status === 'warning' || entry.status === 'error'
          ? signalCount
          : 0
    writableSignals += Math.max(0, entry.writableSignalCount ?? 0)
    if (typeof entry.lastSignalUpdatedAt === 'number') {
      lastUpdatedAt = Math.max(lastUpdatedAt ?? 0, entry.lastSignalUpdatedAt)
    }
  }

  return {
    totalSignals,
    degradedSignals,
    writableSignals,
    entityCountWithSignals,
    lastUpdatedAt,
  }
}

export function formatSignalValue(value: SignalValue, unit?: string) {
  let formatted: string
  if (typeof value === 'number') {
    formatted = Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) >= 10 ? 1 : 2)
  } else if (typeof value === 'boolean') {
    formatted = value ? 'ON' : 'OFF'
  } else if (value === null || value === undefined) {
    formatted = '--'
  } else if (typeof value === 'string') {
    formatted = value
  } else {
    formatted = JSON.stringify(value)
  }

  return unit ? `${formatted} ${unit}` : formatted
}
